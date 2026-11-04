/**
 * @jest-environment node
 */
import { githubApi } from './github-api.mjs';

const recording = (status: number, body: Record<string, number>) => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, fetch };
};

it('reads a repository path with the token and the GitHub JSON media type', async () => {
  const { calls, fetch } = recording(200, { ok: 1 });
  const api = githubApi({ repo: 'owner/name', token: 't0ken', fetch });
  await expect(api('commits/abc')).resolves.toEqual({ ok: 1 });
  expect(calls).toEqual([
    {
      url: 'https://api.github.com/repos/owner/name/commits/abc',
      init: {
        headers: { authorization: 'Bearer t0ken', accept: 'application/vnd.github+json' },
      },
    },
  ]);
});

it('throws with the path and status on a failed response', async () => {
  const { fetch } = recording(404, {});
  const api = githubApi({ repo: 'owner/name', token: 't', fetch });
  await expect(api('commits/missing')).rejects.toThrow('commits/missing: HTTP 404');
});
