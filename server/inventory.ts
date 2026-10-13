import { dependencyGraph } from './dependency-graph.js';
import semver from 'semver';
import { z } from 'zod';
import type { ParsedInventory } from '../shared/types.js';

const entrySchema = z
  .object({
    name: z.string().optional(),
    version: z.string().optional(),
    dev: z.boolean().optional(),
    link: z.boolean().optional(),
    resolved: z.string().optional(),
  })
  .passthrough();

export function parseLockfile(input: unknown): ParsedInventory {
  const root = z
    .object({
      lockfileVersion: z.number(),
      packages: z.unknown().optional(),
      dependencies: z.unknown().optional(),
    })
    .safeParse(input);
  if (!root.success || ![1, 2, 3].includes(root.data.lockfileVersion)) {
    throw new Error('Please provide an npm package-lock.json version 1, 2 or 3.');
  }
  const packages =
    root.data.lockfileVersion === 1
      ? flattenLegacyDependencies(root.data.dependencies)
      : root.data.packages;
  const parsed = z.record(z.string(), entrySchema).safeParse(packages);
  if (!parsed.success) throw new Error('The lockfile packages field is missing or malformed.');
  const result: ParsedInventory = {
    packages: [],
    skipped: [],
    graph: dependencyGraph(parsed.data, root.data.lockfileVersion === 1),
  };
  const unique = new Map<string, ParsedInventory['packages'][number]>();
  for (const [location, entry] of Object.entries(parsed.data)) {
    if (!location) continue;
    const installedName = location.split('node_modules/').at(-1) ?? '';
    const name = entry.name ?? installedName;
    let reason = '';
    if (entry.link || !location.includes('node_modules/'))
      reason = 'Local workspace or linked package';
    else if (!entry.version || !semver.valid(entry.version))
      reason = 'No exact supported npm version';
    else if (!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)) reason = 'Unsupported package name';
    else if (entry.resolved && !entry.resolved.startsWith('https://registry.npmjs.org/')) {
      reason = 'Non-public-registry dependency; identity requires manual review';
    }
    if (reason) {
      result.skipped.push({ location, reason });
      continue;
    }
    const key = `${name}@${entry.version}`;
    const previous = unique.get(key);
    if (previous) {
      previous.locations.push(location);
      previous.dev = previous.dev && entry.dev === true;
    } else {
      unique.set(key, {
        name,
        version: entry.version!,
        dev: entry.dev === true,
        locations: [location],
      });
    }
  }
  if (unique.size > 2000)
    throw new Error(
      'This local edition supports up to 2000 unique package versions per inventory.',
    );
  result.packages = [...unique.values()];
  return result;
}

function flattenLegacyDependencies(input: unknown) {
  const packages: Record<string, z.infer<typeof entrySchema>> = Object.create(null);
  const pending = [{ input, parent: '', dev: false, depth: 0 }];
  while (pending.length) {
    const current = pending.pop()!;
    if (current.depth > 100) throw new Error('Lockfile dependency nesting exceeds 100 levels.');
    const parsed = z.record(z.string(), entrySchema).safeParse(current.input);
    if (!parsed.success)
      throw new Error('The lockfile dependencies field is missing or malformed.');
    for (const [name, entry] of Object.entries(parsed.data)) {
      const location = `${current.parent}node_modules/${name}`;
      const dev = current.dev || entry.dev === true;
      packages[location] = { ...entry, name, dev };
      if (entry.dependencies !== undefined) {
        pending.push({
          input: entry.dependencies,
          parent: `${location}/`,
          dev,
          depth: current.depth + 1,
        });
      }
    }
  }
  return packages;
}

export const demoLockfile = {
  name: 'northstar-api-demo',
  lockfileVersion: 3,
  packages: {
    '': { name: 'northstar-api-demo', version: '1.0.0' },
    'node_modules/lodash': { version: '4.17.20' },
    'node_modules/axios': { version: '0.21.1' },
    'node_modules/jsonwebtoken': { version: '8.5.1' },
    'node_modules/minimist': { version: '1.2.5', dev: true },
    'node_modules/dayjs': { version: '1.11.13' },
    'node_modules/semver': { version: '7.7.3' },
  },
};
