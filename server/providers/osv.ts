import { createHash } from 'node:crypto';
import semver from 'semver';
import { z } from 'zod';
import { severityOrder, type Dependency, type Finding, type Severity } from '../../shared/types.js';
import { fetchJson, safeError } from './http.js';

const recordSchema = z
  .object({
    id: z.string(),
    aliases: z.array(z.string()).optional(),
    summary: z.string().optional(),
    details: z.string().optional(),
    withdrawn: z.string().optional(),
    modified: z.string().optional(),
    database_specific: z.object({ severity: z.string().optional() }).passthrough().optional(),
    references: z.array(z.object({ url: z.string() }).passthrough()).optional(),
    affected: z
      .array(
        z
          .object({
            package: z.object({ name: z.string(), ecosystem: z.string() }).passthrough().optional(),
            ranges: z
              .array(
                z
                  .object({
                    type: z.string(),
                    events: z.array(z.object({ fixed: z.string().optional() }).passthrough()),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();
type OsvRecord = z.infer<typeof recordSchema>;
const pageSchema = z.object({
  vulns: z.array(recordSchema).optional(),
  next_page_token: z.string().optional(),
});
const cache = new Map<string, { expires: number; records: OsvRecord[] }>();

async function queryPackage(dependency: Dependency): Promise<OsvRecord[]> {
  const key = `${dependency.name}@${dependency.version}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.records;
  const records: OsvRecord[] = [];
  let token: string | undefined;
  for (let page = 0; page < 20; page++) {
    const data = pageSchema.parse(
      await fetchJson('https://api.osv.dev/v1/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package: { name: dependency.name, ecosystem: 'npm' },
          version: dependency.version,
          page_token: token,
        }),
      }),
    );
    records.push(...(data.vulns ?? []));
    token = data.next_page_token;
    if (!token) {
      if (cache.size > 1000) cache.clear();
      cache.set(key, { records, expires: Date.now() + 15 * 60_000 });
      return records;
    }
  }
  throw new Error('Advisory pagination limit exceeded; coverage is incomplete.');
}

function publicUrl(url: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function normalizeAdvisories(dependency: Dependency, raw: unknown[]): Finding[] {
  const records = raw.map((item) => recordSchema.parse(item)).filter((item) => !item.withdrawn);
  const groups: OsvRecord[][] = [];
  for (const record of records) {
    const ids = new Set([record.id, ...(record.aliases ?? [])]);
    const matching = groups.filter((group) =>
      group.some((item) => [item.id, ...(item.aliases ?? [])].some((id) => ids.has(id))),
    );
    if (!matching.length) groups.push([record]);
    else {
      const merged = [record, ...matching.flat()];
      matching.forEach((group) => groups.splice(groups.indexOf(group), 1));
      groups.push(merged);
    }
  }
  return groups.map((group) => {
    group.sort(
      (a, b) =>
        Number(b.id.startsWith('GHSA-')) - Number(a.id.startsWith('GHSA-')) ||
        a.id.localeCompare(b.id),
    );
    const primary = group[0];
    const ids = [...new Set(group.flatMap((item) => [item.id, ...(item.aliases ?? [])]))].sort();
    const severity =
      group
        .map((item) => item.database_specific?.severity?.toLowerCase())
        .map((value) => (value === 'medium' ? 'moderate' : value))
        .filter((value): value is Severity => !!value && Object.hasOwn(severityOrder, value))
        .sort((a, b) => severityOrder[a] - severityOrder[b])[0] ?? 'unknown';
    const fixed = group
      .flatMap((item) =>
        (item.affected ?? [])
          .filter(
            (affected) =>
              affected.package?.name === dependency.name && affected.package.ecosystem === 'npm',
          )
          .flatMap((affected) =>
            (affected.ranges ?? [])
              .filter((range) => range.type === 'SEMVER')
              .flatMap((range) =>
                range.events.flatMap((event) => (event.fixed ? [event.fixed] : [])),
              ),
          ),
      )
      .filter((version) => semver.valid(version) && semver.gt(version, dependency.version));
    return {
      key: createHash('sha256')
        .update(`${dependency.name}@${dependency.version}:${primary.id}`)
        .digest('hex')
        .slice(0, 24),
      dependency,
      advisory: {
        id: primary.id,
        aliases: ids.filter((id) => id !== primary.id),
        summary: primary.summary ?? group.find((item) => item.summary)?.summary ?? primary.id,
        details: (primary.details ?? group.find((item) => item.details)?.details ?? '').slice(
          0,
          12_000,
        ),
        severity,
        fixedVersions: [...new Set(fixed)].sort(semver.compare),
        modified: primary.modified,
        references: [
          ...new Set([
            `https://osv.dev/vulnerability/${encodeURIComponent(primary.id)}`,
            ...group.flatMap((item) =>
              (item.references ?? []).map((ref) => ref.url).filter(publicUrl),
            ),
          ]),
        ].slice(0, 12),
      },
    };
  });
}

export interface ScanResult {
  findings: Finding[];
  scanned: number;
  failed: number;
  errors: string[];
}
export async function scanDependencies(
  dependencies: Dependency[],
  query: (dependency: Dependency) => Promise<unknown[]> = queryPackage,
  progress?: (scanned: number, failed: number) => void,
): Promise<ScanResult> {
  const result: ScanResult = { findings: [], scanned: 0, failed: 0, errors: [] };
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, dependencies.length) }, async () => {
      while (cursor < dependencies.length) {
        const dependency = dependencies[cursor++];
        try {
          result.findings.push(...normalizeAdvisories(dependency, await query(dependency)));
          result.scanned++;
        } catch (error) {
          result.failed++;
          result.errors.push(`${dependency.name}@${dependency.version}: ${safeError(error)}`);
        }
        progress?.(result.scanned, result.failed);
      }
    }),
  );
  result.findings.sort(
    (a, b) =>
      severityOrder[a.advisory.severity] - severityOrder[b.advisory.severity] ||
      Number(a.dependency.dev) - Number(b.dependency.dev) ||
      a.advisory.id.localeCompare(b.advisory.id),
  );
  return result;
}
