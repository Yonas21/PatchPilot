import type { RepositorySource } from './types.js';

export function parseRepositoryInput(
  value: string,
  ref = 'HEAD',
  path = 'package-lock.json',
): RepositorySource {
  let parts: string[];
  const input = value.trim();
  if (/^https?:\/\//i.test(input)) {
    const url = new URL(input);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'github.com' ||
      url.port ||
      url.username ||
      url.password
    ) {
      throw new Error('Use a public https://github.com repository or lockfile URL.');
    }
    parts = url.pathname.replace(/^\//, '').replace(/\/$/, '').split('/').map(decodeURIComponent);
    if (parts.length > 2) {
      if (parts[2] !== 'blob' || parts.length < 5 || !parts[3]) {
        throw new Error('Paste a GitHub file URL containing /blob/branch/path.');
      }
      ref = parts[3];
      path = parts.slice(4).join('/');
      parts = parts.slice(0, 2);
    }
  } else {
    parts = input.replace(/\/$/, '').split('/');
  }
  const [owner, repo] = parts;
  if (
    parts.length !== 2 ||
    !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(owner) ||
    !/^[a-zA-Z0-9_.-]{1,100}$/.test(repo)
  ) {
    throw new Error('Enter owner/repository or a public GitHub lockfile URL.');
  }
  if (
    !ref.trim() ||
    !path ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error('Specify a branch or commit and a repository-relative lockfile path.');
  }
  return { owner, repo, ref: ref.trim(), path };
}
