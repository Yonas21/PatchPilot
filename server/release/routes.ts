import { Router } from 'express';
import { z } from 'zod';
import type { Store } from '../store.js';
import { defaultPolicy } from '../../shared/release.js';
import { VersionChecker } from './version-checks.js';
import {
  exceptionSchema,
  exportDecision,
  grantException,
  policySchema,
  recordDecision,
} from './service.js';

export function releaseRoutes(store: Store) {
  const router = Router(),
    checker = new VersionChecker(store);
  router.get('/state', (_req, res) =>
    res.json({
      policies: store.list('policies'),
      exceptions: store.list('exceptions'),
      decisions: store
        .list('decisions')
        .map(({ findings, ...d }) => ({ ...d, findingCount: findings.length })),
      defaultPolicy,
    }),
  );
  router.get('/scans/:id', (req, res) => {
    const scan = store.get('scans', req.params.id);
    if (!scan) return res.status(404).json({ error: 'Scan not found.' });
    res.json({
      id: scan.id,
      inventoryId: scan.inventoryId,
      purpose: scan.purpose ?? 'source',
      status: scan.status,
      findings: scan.findings.map((f) => ({
        key: f.key,
        package: f.dependency.name,
        version: f.dependency.version,
        advisory: f.advisory.id,
        severity: f.advisory.severity,
        development: f.dependency.dev,
      })),
    });
  });
  router.put('/policies/:id', (req, res) => {
    if (!store.get('inventories', req.params.id)) throw new Error('Inventory not found.');
    const policy = { id: req.params.id, ...policySchema.parse(req.body) };
    store.put('policies', policy);
    store.event(
      'ticket',
      'Release criteria updated',
      `${policy.id} · severity ${policy.minimumSeverity} · age ${policy.maxAgeHours}h`,
    );
    res.json(policy);
  });
  router.post('/exceptions', (req, res) =>
    res.status(201).json(grantException(store, exceptionSchema.parse(req.body))),
  );
  router.post('/exceptions/:id/revoke', (req, res) => {
    const e = store.get('exceptions', req.params.id);
    if (!e) throw new Error('Exception not found.');
    if (e.revokedAt) return res.json(e);
    const revoked = { ...e, revokedAt: new Date().toISOString() };
    store.put('exceptions', revoked);
    store.event('ticket', 'Risk exception revoked', `${e.package}@${e.version} · ${e.advisoryId}`);
    res.json(revoked);
  });
  router.post('/decisions', (req, res) => {
    const { scanId } = z.object({ scanId: z.string() }).parse(req.body);
    res.status(201).json(recordDecision(store, scanId));
  });
  router.get('/decisions/:id', (req, res) => {
    const decision = store.get('decisions', req.params.id);
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    res.json(decision);
  });
  router.get('/decisions/:id/export', (req, res) => {
    const decision = store.get('decisions', req.params.id);
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="patchpilot-release-${decision.id}.md"`,
    );
    res.type('text/markdown').send(exportDecision(decision));
  });
  router.get('/version-checks/:planId', (req, res) =>
    res.json(store.list('versionChecks').filter((c) => c.planId === req.params.planId)),
  );
  router.post('/version-checks/:planId', async (req, res) => {
    const { stepId, version } = z
      .object({ stepId: z.string(), version: z.string().max(100) })
      .parse(req.body);
    res.status(201).json(await checker.check(req.params.planId, stepId, version));
  });
  return router;
}
