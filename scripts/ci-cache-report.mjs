import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function formatCacheReport({
  CACHE_NAME,
  CACHE_HIT = '',
  MATCHED_KEY = '',
  PERSISTENT = 'false',
}) {
  if (
    !CACHE_NAME ||
    !['true', 'false'].includes(PERSISTENT) ||
    !['', 'true', 'false'].includes(CACHE_HIT)
  )
    throw new Error('Unknown pnpm cache report shape');
  const restored = CACHE_HIT === 'true' ? 'hit' : MATCHED_KEY ? 'partial' : 'miss';
  const status = PERSISTENT === 'true' ? 'persistent' : restored;
  return `pnpm store: ${status} (${CACHE_NAME})\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const line = formatCacheReport(process.env);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line);
    process.stdout.write(line);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
