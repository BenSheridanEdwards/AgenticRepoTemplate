/**
 * The variables a test's child process may inherit: what the shell and the
 * toolchain need to start, and nothing from the hook or CI job that started
 * Jest (ADR 0042). A test that needs another variable passes it in `env`.
 */
export const INHERITED_ENV = new Set([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LANGUAGE',
  'TERM',
  'TZ',
  'TMPDIR',
  'TMP',
  'TEMP',
  'NODE_ENV',
  'NODE_OPTIONS',
  'VSCODE_INSPECTOR_OPTIONS',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'PNPM_HOME',
  'COREPACK_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
  'XDG_CACHE_HOME',
  'XDG_RUNTIME_DIR',
  'PLAYWRIGHT_BROWSERS_PATH',
]);

/** @param {string} name */
export const isInherited = (name) => INHERITED_ENV.has(name) || name.startsWith('LC_');

/**
 * Runs once in the Jest parent before any worker starts. Every worker, every
 * test's `process.env` and every child process copy this environment, so
 * `GIT_DIR` from a hook or `GITHUB_BASE_REF` from a pull request run never
 * reaches a test's git or gate script.
 */
export default function globalSetup() {
  for (const name of Object.keys(process.env)) {
    if (!isInherited(name)) delete process.env[name];
  }
}
