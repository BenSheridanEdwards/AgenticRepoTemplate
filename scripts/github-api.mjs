/**
 * One GitHub REST reader for the scripts that query a repository's API:
 * `githubApi({ repo, token })` returns `api(path)`, which fetches
 * `repos/<repo>/<path>` and throws on any non-2xx response.
 */

/**
 * @param {{ repo: string, token: string, fetch?: typeof globalThis.fetch }} options
 * @returns {(path: string) => Promise<any>}
 */
export const githubApi =
  ({ repo, token, fetch = globalThis.fetch }) =>
  async (path) => {
    const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  };
