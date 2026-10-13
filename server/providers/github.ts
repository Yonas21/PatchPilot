import { z } from 'zod';
import { fetchJson } from './http.js';
import type { RepositorySource } from '../../shared/types.js';

export const repositorySchema = z.object({
  owner: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/),
  repo: z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/),
  ref: z.string().min(1).max(200).default('HEAD'),
  path: z.string().min(1).max(300).default('package-lock.json'),
});

export async function fetchRepository(source: RepositorySource) {
  const input = repositorySchema.parse(source);
  if (input.path.split('/').some((part) => part === '..' || part === '.' || !part)) {
    throw new Error('Use a repository-relative lockfile path.');
  }
  const base = `https://api.github.com/repos/${input.owner}/${input.repo}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'PatchPilot-local',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const commit = z
    .object({ sha: z.string().regex(/^[a-f0-9]{40}$/) })
    .parse(await fetchJson(`${base}/commits/${encodeURIComponent(input.ref)}`, { headers }));
  const path = input.path.split('/').map(encodeURIComponent).join('/');
  const content = z
    .object({
      type: z.literal('file'),
      size: z.number(),
      encoding: z.literal('base64'),
      content: z.string(),
    })
    .parse(await fetchJson(`${base}/contents/${path}?ref=${commit.sha}`, { headers }));
  if (content.size > 1024 * 1024) throw new Error('Lockfile exceeds the 1 MiB input limit.');
  let lockfile: unknown;
  try {
    lockfile = JSON.parse(Buffer.from(content.content, 'base64').toString('utf8'));
  } catch {
    throw new Error('GitHub file is not valid JSON. Choose an npm package-lock.json.');
  }
  return { lockfile, repository: { ...input, sha: commit.sha } };
}
