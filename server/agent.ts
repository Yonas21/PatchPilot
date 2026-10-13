import { randomUUID } from 'node:crypto';
import {
  activeStatuses,
  type Finding,
  type Inventory,
  type Scan,
  type ParsedInventory,
} from '../shared/types.js';
import { parseLockfile } from './inventory.js';
import { scanDependencies } from './providers/osv.js';
import { generateBrief, geminiConfig } from './providers/gemini.js';
import { fetchRepository } from './providers/github.js';
import { safeError } from './providers/http.js';
import { Store } from './store.js';

interface Providers {
  scan: typeof scanDependencies;
  brief: typeof generateBrief;
  repository: typeof fetchRepository;
  hasKey: () => boolean;
}

export class Agent {
  private running = new Map<string, Promise<void>>();
  private analyzing = new Map<string, Promise<Finding>>();
  private providers: Providers;
  constructor(
    readonly store: Store,
    providers: Partial<Providers> = {},
  ) {
    this.providers = {
      scan: scanDependencies,
      brief: generateBrief,
      repository: fetchRepository,
      hasKey: () => !!geminiConfig().key,
      ...providers,
    };
    for (const scan of store.list('scans').filter((item) => activeStatuses.includes(item.status))) {
      store.put('scans', {
        ...scan,
        status: 'failed',
        completedAt: new Date().toISOString(),
        errors: [
          ...scan.errors,
          'The application stopped before this scan finished. Run a new scan.',
        ],
      });
    }
  }

  createInventory(
    name: string,
    context: string,
    source: Inventory['source'],
    lockfile: unknown,
    repository?: Inventory['repository'],
  ) {
    const parsed = parseLockfile(lockfile);
    if (!parsed.packages.length)
      throw new Error('No supported exact npm package versions were found in this lockfile.');
    const inventory: Inventory = {
      ...parsed,
      id: randomUUID(),
      name,
      context,
      source,
      repository,
      createdAt: new Date().toISOString(),
      monitoring: false,
      nextRunAt: null,
    };
    this.store.put('inventories', inventory);
    this.store.event(
      'inventory',
      'Inventory added',
      `${name} · ${parsed.packages.length} package versions · ${source}`,
    );
    return inventory;
  }

  createAndScan(...input: Parameters<Agent['createInventory']>) {
    if (this.running.size >= 2)
      throw new Error('Two scans are already running. Wait for one to finish.');
    const inventory = this.createInventory(...input);
    return { inventory, scan: this.startScan(inventory.id) };
  }

  startScan(
    inventoryId: string,
    trigger: Scan['trigger'] = 'manual',
    candidate?: { parsed: ParsedInventory; planId: string },
  ): Scan {
    const inventory = this.store.get('inventories', inventoryId);
    if (!inventory) throw new Error('Inventory not found.');
    const existing = this.store
      .list('scans')
      .find((scan) => scan.inventoryId === inventoryId && activeStatuses.includes(scan.status));
    if (existing) {
      if (candidate || existing.purpose === 'candidate')
        throw new Error('Wait for this inventory scan to finish.');
      return existing;
    }
    if (this.running.size >= 2)
      throw new Error('Two scans are already running. Wait for one to finish.');
    const scan: Scan = {
      id: randomUUID(),
      inventoryId,
      trigger,
      status: 'queued',
      purpose: candidate ? 'candidate' : 'source',
      planId: candidate?.planId,
      createdAt: new Date().toISOString(),
      total: inventory.packages.length,
      scanned: 0,
      failed: 0,
      skipped: inventory.skipped,
      findings: [],
      errors: [],
      newFindings: 0,
      noLongerDetected: 0,
      repositorySha: inventory.repository?.sha,
    };
    this.store.put('scans', scan);
    this.store.event(
      'scan',
      trigger === 'scheduled' ? 'Scheduled scan started' : 'Scan started',
      inventory.name,
    );
    const pending = Promise.resolve()
      .then(() => this.execute(scan.id, candidate?.parsed))
      .finally(() => this.running.delete(inventoryId));
    this.running.set(inventoryId, pending);
    return scan;
  }

  private update(id: string, changes: Partial<Scan>) {
    const existing = this.store.get('scans', id);
    if (!existing) throw new Error('Scan not found.');
    return this.store.put('scans', { ...existing, ...changes });
  }

  private async execute(scanId: string, candidate?: ParsedInventory) {
    const initial = this.store.get('scans', scanId)!;
    let inventory = this.store.get('inventories', initial.inventoryId)!;
    try {
      if (candidate) inventory = { ...inventory, ...candidate, repository: undefined };
      if (inventory.repository) {
        this.update(scanId, { status: 'fetching' });
        const result = await this.providers.repository(inventory.repository);
        const parsed = parseLockfile(result.lockfile);
        if (!parsed.packages.length)
          throw new Error('The repository lockfile contains no supported exact npm versions.');
        // Preserve monitoring edits made while the network request was in flight.
        inventory = this.store.put('inventories', {
          ...this.store.get('inventories', inventory.id)!,
          ...parsed,
          repository: result.repository,
        });
      }
      this.update(scanId, {
        status: 'scanning',
        snapshot: inventory.packages,
        graph: inventory.graph,
        total: inventory.packages.length,
        skipped: inventory.skipped,
        repositorySha: inventory.repository?.sha,
      });
      const result = await this.providers.scan(inventory.packages, undefined, (scanned, failed) =>
        this.update(scanId, { scanned, failed }),
      );
      const previous = this.store
        .list('scans')
        .find(
          (scan) =>
            scan.inventoryId === inventory.id &&
            scan.id !== scanId &&
            scan.purpose !== 'candidate' &&
            scan.status === 'completed',
        );
      const oldKeys = new Set(previous?.findings.map((finding) => finding.key));
      const keys = new Set(result.findings.map((finding) => finding.key));
      const completeCoverage = result.failed === 0 && inventory.skipped.length === 0;
      this.update(scanId, {
        ...result,
        status: 'summarizing',
        newFindings: result.findings.filter((finding) => !oldKeys.has(finding.key)).length,
        noLongerDetected: completeCoverage
          ? (previous?.findings.filter((finding) => !keys.has(finding.key)).length ?? 0)
          : 0,
      });
      if (result.findings[0] && this.providers.hasKey()) {
        try {
          await this.analyze(scanId, result.findings[0].key);
        } catch {
          /* A failed AI call remains visible on its finding; evidence is still usable. */
        }
      }
      const status = result.scanned === 0 ? 'failed' : completeCoverage ? 'completed' : 'partial';
      this.update(scanId, { status, completedAt: new Date().toISOString() });
      this.store.event(
        'scan',
        status === 'completed' ? 'Scan completed' : `Scan ${status}`,
        `${inventory.name} · ${result.findings.length} findings · ${result.scanned}/${inventory.packages.length} checked`,
      );
      if (initial.trigger === 'scheduled') {
        const newCount = this.store.get('scans', scanId)!.newFindings;
        this.store.event(
          'monitor',
          'Monitor check finished',
          `${inventory.name} · ${newCount} findings not present in the last complete scan`,
        );
      }
    } catch (error) {
      this.update(scanId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        errors: [safeError(error)],
      });
      this.store.event('scan', 'Scan failed', `${inventory.name} · ${safeError(error)}`);
    }
  }

  analyze(scanId: string, findingKey: string): Promise<Finding> {
    const key = `${scanId}:${findingKey}`;
    const running = this.analyzing.get(key);
    if (running) return running;
    if (this.analyzing.size >= 2)
      return Promise.reject(new Error('Two AI analyses are running. Please wait.'));
    const work = this.analyzeFinding(scanId, findingKey).finally(() => this.analyzing.delete(key));
    this.analyzing.set(key, work);
    return work;
  }

  private async analyzeFinding(scanId: string, findingKey: string) {
    const scan = this.store.get('scans', scanId);
    const finding = scan?.findings.find((item) => item.key === findingKey);
    if (!scan || !finding) throw new Error('Finding not found.');
    if (finding.brief) return finding;
    const inventory = this.store.get('inventories', scan.inventoryId)!;
    try {
      const brief = await this.providers.brief(finding, inventory.context);
      const updated = { ...finding, brief, briefError: undefined };
      this.saveFinding(scanId, updated);
      this.store.event(
        'ai',
        'AI brief ready',
        `${finding.dependency.name} · ${finding.advisory.id}`,
      );
      return updated;
    } catch (error) {
      this.saveFinding(scanId, { ...finding, briefError: safeError(error) });
      throw error;
    }
  }

  private saveFinding(scanId: string, finding: Finding) {
    const current = this.store.get('scans', scanId)!;
    this.update(scanId, {
      findings: current.findings.map((item) => (item.key === finding.key ? finding : item)),
    });
  }

  setMonitoring(id: string, enabled: boolean) {
    const inventory = this.store.get('inventories', id);
    if (!inventory) throw new Error('Inventory not found.');
    const updated = this.store.put('inventories', {
      ...inventory,
      monitoring: enabled,
      nextRunAt: enabled ? new Date(Date.now() + 86_400_000).toISOString() : null,
    });
    this.store.event(
      'monitor',
      enabled ? 'Daily monitoring enabled' : 'Monitoring paused',
      inventory.name,
    );
    return updated;
  }

  async runDue() {
    for (const inventory of this.store.list('inventories')) {
      if (
        !inventory.monitoring ||
        !inventory.nextRunAt ||
        Date.parse(inventory.nextRunAt) > Date.now()
      )
        continue;
      if (this.running.has(inventory.id) || this.running.size >= 2) continue;
      this.store.put('inventories', {
        ...inventory,
        nextRunAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      this.startScan(inventory.id, 'scheduled');
    }
  }

  async idle() {
    await Promise.all([...this.running.values(), ...this.analyzing.values()]);
  }
}
