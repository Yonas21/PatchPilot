import { Router, type ErrorRequestHandler } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Agent } from './agent.js';
import { Store } from './store.js';
import { demoLockfile } from './inventory.js';
import { fetchRepository, repositorySchema } from './providers/github.js';
import { geminiConfig } from './providers/gemini.js';
import { approveTicket, draftTicket } from './tickets.js';
import { safeError } from './providers/http.js';
import { dashboardScans } from '../shared/scan-selection.js';

const inventoryInput = z.object({
  name: z.string().trim().min(1).max(100),
  context: z.string().max(2000).default(''),
  source: z.enum(['demo', 'upload', 'github']),
  lockfile: z.unknown().optional(),
  repository: repositorySchema.optional(),
});

export function createApi(store: Store, agent: Agent, allowedOrigins: Set<string>) {
  const router = Router();
  const session = randomBytes(32).toString('hex');
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin))
      return res.status(403).json({ error: 'Only the local PatchPilot origin is allowed.' });
    if (req.headers['sec-fetch-site'] === 'cross-site')
      return res.status(403).json({ error: 'Cross-site requests are not allowed.' });
    if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-patchpilot-session'] !== session) {
      return res.status(403).json({ error: 'Refresh PatchPilot before making changes.' });
    }
    next();
  });
  router.get('/session', (_req, res) => res.json({ session }));
  router.get('/dashboard', (_req, res) => {
    const config = geminiConfig();
    res.json({
      inventories: store.list('inventories'),
      scans: dashboardScans(store.list('scans')),
      tickets: store.list('tickets'),
      activity: store.list('activity').slice(0, 80),
      integrations: { gemini: !!config.key, model: config.model },
    });
  });
  router.post('/inventories', async (req, res) => {
    const input = inventoryInput.parse(req.body);
    if (store.list('inventories').length >= 20)
      return res.status(400).json({ error: 'This local workspace supports up to 20 inventories.' });
    let lockfile = input.source === 'demo' ? demoLockfile : input.lockfile;
    let repository;
    if (input.source === 'github') {
      if (!input.repository)
        return res.status(400).json({ error: 'Repository details are required.' });
      const result = await fetchRepository(input.repository);
      lockfile = result.lockfile;
      repository = result.repository;
    }
    if (JSON.stringify(lockfile ?? '').length > 1024 * 1024)
      return res.status(413).json({ error: 'Lockfile exceeds 1 MiB.' });
    const result = agent.createAndScan(
      input.name,
      input.context,
      input.source,
      lockfile,
      repository,
    );
    res.status(201).json(result);
  });
  router.post('/inventories/:id/scan', (req, res) =>
    res.status(202).json(agent.startScan(req.params.id)),
  );
  router.patch('/inventories/:id/monitor', (req, res) => {
    const input = z.object({ enabled: z.boolean() }).parse(req.body);
    res.json(agent.setMonitoring(req.params.id, input.enabled));
  });
  router.post('/monitor/check', async (_req, res) => {
    await agent.runDue();
    res.json({ message: 'Due schedules checked. Future schedules were left unchanged.' });
  });
  router.post('/scans/:id/findings/:key/brief', async (req, res) => {
    res.json(await agent.analyze(req.params.id, req.params.key));
  });
  router.get('/scans/:id/findings/:key/draft', (req, res) => {
    const finding = store
      .get('scans', req.params.id)
      ?.findings.find((item) => item.key === req.params.key);
    if (!finding) return res.status(404).json({ error: 'Finding not found.' });
    res.json(draftTicket(finding));
  });
  router.post('/tickets', (req, res) => {
    const input = z
      .object({
        scanId: z.string(),
        findingKey: z.string(),
        title: z.string(),
        body: z.string(),
        approved: z.literal(true),
      })
      .parse(req.body);
    const scan = store.get('scans', input.scanId);
    if (!scan?.findings.some((item) => item.key === input.findingKey))
      return res.status(404).json({ error: 'Finding not found.' });
    res.status(201).json(approveTicket(store, { ...input, inventoryId: scan.inventoryId }));
  });
  router.patch('/tickets/:id', (req, res) => {
    const { status } = z.object({ status: z.enum(['open', 'done']) }).parse(req.body);
    const ticket = store.get('tickets', req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Task not found.' });
    const updated = store.put('tickets', {
      ...ticket,
      status,
      updatedAt: new Date().toISOString(),
    });
    store.event('ticket', status === 'done' ? 'Task marked done' : 'Task reopened', ticket.title);
    res.json(updated);
  });
  router.get('/tickets/:id/export', (req, res) => {
    const ticket = store.get('tickets', req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Task not found.' });
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="patchpilot-${ticket.id.slice(0, 8)}.md"`,
    );
    res.type('text/markdown').send(`# ${ticket.title}\n\n${ticket.body}\n`);
  });
  router.use((_req, res) => res.status(404).json({ error: 'API route not found.' }));
  return router;
}

export const apiError: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: error.issues
        .map((issue) => `${issue.path.join('.') || 'Input'}: ${issue.message}`)
        .join('; ')
        .slice(0, 500),
    });
  } else if (error?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request exceeds the local size limit.' });
  } else if (error instanceof SyntaxError) {
    res.status(400).json({ error: 'Request must contain valid JSON.' });
  } else {
    res.status(400).json({ error: safeError(error) });
  }
};
