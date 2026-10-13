import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { readFileSync } from 'node:fs';
import express from 'express';
import { Store } from './store.js';
import { Agent } from './agent.js';
import { apiError, createApi } from './api.js';

let local: Record<string, string> = {};
try {
  local = parse(readFileSync('.env'));
} catch {
  /* Optional local environment. */
}
const port = Number(process.env.PORT ?? local.PORT ?? 4310);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('PORT must be between 1024 and 65535.');

const dataDir = resolve(process.env.DATA_DIR ?? local.DATA_DIR ?? './data');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });

const store = new Store(resolve(dataDir, 'patchpilot.sqlite'));
const agent = new Agent(store);

const app = express();

app.disable('x-powered-by');
const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);

app.use((req, res, next) => {
  if (!origins.has(`http://${req.headers.host}`))
    return res.status(403).send('Use the local PatchPilot address.');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use('/api', express.json({ limit: '1200kb' }), createApi(store, agent, origins), apiError);

const development =
  process.argv.includes('--dev') ||
  (process.env.NODE_ENV !== 'production' && !existsSync('dist/index.html'));
let vite: Awaited<ReturnType<(typeof import('vite'))['createServer']>> | undefined;
if (development) {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
}
const server = app.listen(port, '127.0.0.1', () =>
  console.log(`PatchPilot is ready at http://localhost:${port}`),
);
const timer = setInterval(() => {
  void agent.runDue().catch(() => console.error('Scheduled check failed; inspect local activity.'));
}, 60_000);
timer.unref();
void agent.runDue();
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  server.close();
  await agent.idle();
  await vite?.close();
  store.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
