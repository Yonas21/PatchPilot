import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Store } from '../store.js';
import { fetchJson, safeError } from '../providers/http.js';
import { scanDependencies } from '../providers/osv.js';
import type { VersionCheck } from '../../shared/release.js';

export class VersionChecker {
  private running = new Map<string, Promise<VersionCheck>>();
  constructor(
    private store: Store,
    private providers = { fetch: fetchJson, scan: scanDependencies },
  ) {}
  check(planId: string, stepId: string, version: string): Promise<VersionCheck> {
    const plan = this.store.get('plans', planId),
      step = plan?.steps.find((s) => s.id === stepId);
    if (!step || !step.candidateVersions.includes(version))
      return Promise.reject(
        new Error('Choose a candidate version supplied in this plan’s advisory evidence.'),
      );
    const key = JSON.stringify([planId, stepId, version]);
    const existing = this.running.get(key);
    if (existing) return existing;
    if (this.running.size >= 2)
      return Promise.reject(new Error('Two version checks are running. Wait for one to finish.'));
    const work = this.execute(planId, stepId, step.package, version).finally(() =>
      this.running.delete(key),
    );
    this.running.set(key, work);
    return work;
  }
  private async execute(
    planId: string,
    stepId: string,
    name: string,
    version: string,
  ): Promise<VersionCheck> {
    const result: VersionCheck = {
      id: randomUUID(),
      planId,
      stepId,
      package: name,
      version,
      checkedAt: new Date().toISOString(),
      published: false,
      status: 'unavailable',
      advisories: [],
    };
    try {
      const metadata = z
        .object({ name: z.string(), version: z.string() })
        .parse(
          await this.providers.fetch(
            `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
          ),
        );
      if (metadata.name !== name || metadata.version !== version)
        throw new Error('Registry identity did not match the proposed package version.');
      result.published = true;
      const evidence = await this.providers.scan([{ name, version, dev: false, locations: [] }]);
      if (evidence.failed || evidence.scanned !== 1)
        throw new Error(evidence.errors[0] ?? 'Candidate advisory lookup was incomplete.');
      result.advisories = evidence.findings.map((f) => ({
        id: f.advisory.id,
        severity: f.advisory.severity,
        summary: f.advisory.summary,
      }));
      result.status = result.advisories.length ? 'matches' : 'no-matches';
    } catch (e) {
      result.error = safeError(e);
    }
    result.checkedAt = new Date().toISOString();
    this.store.put('versionChecks', result);
    this.store.event('scan', 'Upgrade candidate checked', `${name}@${version} · ${result.status}`);
    return result;
  }
}
