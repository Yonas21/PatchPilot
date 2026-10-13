const hosts = new Set(['api.osv.dev', 'api.github.com', 'generativelanguage.googleapis.com']);

export async function fetchJson(
  url: string,
  init: RequestInit = {},
  timeout = 15_000,
): Promise<unknown> {
  const target = new URL(url);
  if (target.protocol !== 'https:' || !hosts.has(target.hostname))
    throw new Error('Unsupported API host.');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(timeout),
      });
      if (response.status === 429 || response.status === 403) {
        throw new Error(`${target.hostname}: access or rate limit reached. Please retry later.`);
      }
      if (response.status >= 500 && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 750));
        continue;
      }
      if (!response.ok) throw new Error(`${target.hostname} returned HTTP ${response.status}.`);
      const text = await response.text();
      if (text.length > 8 * 1024 * 1024)
        throw new Error('Provider response exceeded the local size limit.');
      return JSON.parse(text);
    } catch (error) {
      if (error instanceof TypeError && attempt === 0) continue;
      if (error instanceof Error && /timeout|abort/i.test(error.name))
        throw new Error(`${target.hostname} timed out. Please retry.`);
      if (error instanceof TypeError)
        throw new Error(`${target.hostname} could not be reached. Check your connection.`);
      throw error;
    }
  }
  throw new Error('Provider request failed.');
}

export function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'An unexpected error occurred.';
}
