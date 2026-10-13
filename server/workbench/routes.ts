import { Router } from 'express';
import { z } from 'zod';
import type { Agent } from '../agent.js';
import type { Store } from '../store.js';
import { parseLockfile } from '../inventory.js';
import { approvePlan, createPlan, exportPlan, verifyPlan } from './plans.js';
import { analyzeUpgradeImpact } from '../../shared/upgrade-impact.js';
import { runEvaluations } from './evaluations.js';
import { workbenchDemo } from './demo.js';

export function workbenchRoutes(store: Store, agent: Agent) {
  const router = Router();
  router.get('/', (_req, res) =>
    res.json({
      plans: store.list('plans').map(({ snapshot: _snapshot, findings, ...plan }) => ({
        ...plan,
        findingCount: findings.length,
      })),
      scans: store.list('scans').map((scan) => ({
        id: scan.id,
        inventoryId: scan.inventoryId,
        createdAt: scan.createdAt,
        status: scan.status,
        purpose: scan.purpose,
        planId: scan.planId,
        scanned: scan.scanned,
        total: scan.total,
        hasSnapshot: !!scan.snapshot,
        findingCount: scan.findings.length,
      })),
    }),
  );
  router.get('/evaluations', (_req, res) => res.json(runEvaluations()));
  router.get('/plans/:id/impact', (req, res) => {
    const plan = store.get('plans', req.params.id);
    const scan = plan && store.get('scans', plan.baselineId);
    if (!scan) return res.status(404).json({ error: 'Baseline scan not found.' });
    res.json(analyzeUpgradeImpact(scan));
  });
  router.post('/plans', (req, res) => {
    const { scanId } = z.object({ scanId: z.string() }).parse(req.body);
    res.status(201).json(createPlan(store, scanId));
  });
  router.post('/plans/:id/approve', (req, res) => {
    z.object({ approved: z.literal(true) }).parse(req.body);
    res.json(approvePlan(store, req.params.id));
  });
  router.post('/plans/:id/verify', (req, res) => {
    const { scanId } = z.object({ scanId: z.string() }).parse(req.body);
    res.json(verifyPlan(store, req.params.id, scanId));
  });
  router.post('/plans/:id/candidate', (req, res) => {
    const plan = store.get('plans', req.params.id);
    if (!plan?.approvedAt)
      throw new Error('Approve a plan before uploading its candidate lockfile.');
    const { lockfile } = z.object({ lockfile: z.unknown() }).parse(req.body);
    if (JSON.stringify(lockfile).length > 1024 * 1024) throw new Error('Lockfile exceeds 1 MiB.');
    const parsed = parseLockfile(lockfile);
    if (!parsed.packages.length)
      throw new Error('Candidate lockfile contains no supported package versions.');
    const scan = agent.startScan(plan.inventoryId, 'manual', { parsed, planId: plan.id });
    store.event(
      'scan',
      'Candidate verification scan queued',
      `${plan.title} · monitored source unchanged`,
    );
    res.status(202).json(scan);
  });
  router.post('/plans/:id/demo-candidate', (req, res) => {
    const plan = store.get('plans', req.params.id);
    const inventory = plan && store.get('inventories', plan.inventoryId);
    if (
      !plan?.approvedAt ||
      inventory?.source !== 'demo' ||
      inventory.name !== 'Remediation lab · synthetic demo'
    )
      throw new Error('Approve a synthetic remediation lab plan before running its candidate.');
    res.status(202).json(
      agent.startScan(plan.inventoryId, 'manual', {
        parsed: parseLockfile(workbenchDemo(true)),
        planId: plan.id,
      }),
    );
  });
  router.get('/plans/:id/export', (req, res) => {
    const plan = store.get('plans', req.params.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });
    res.setHeader('Content-Disposition', `attachment; filename="patchpilot-plan-${plan.id}.md"`);
    res.type('text/markdown').send(exportPlan(plan));
  });
  router.post('/demo', (_req, res) => {
    if (store.list('inventories').length >= 20)
      throw new Error('Workspace inventory limit reached.');
    res
      .status(201)
      .json(
        agent.createAndScan(
          'Remediation lab · synthetic demo',
          'Synthetic demo: upgrade minimist while deliberately leaving lodash unchanged. Live advisory results determine the outcome.',
          'demo',
          workbenchDemo(),
        ),
      );
  });
  router.get('/demo-candidate', (_req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="package-lock.json"');
    res.json(workbenchDemo(true));
  });
  return router;
}
