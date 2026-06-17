# Layer 0 — Diagnostic snapshot

- Repository: BenSheridanEdwards/AgenticProjectTemplate
- Commit: `f4c862b97f79738bbe04483f2d1f2f494f77037e`
- Generated: 2026-06-17T12:00:00Z
- Graphify output present: **yes** (`graphify-out/graph.json`, `graphEnriched: true`) — the Layer 2 taint-flow analysis is graph-informed. The source contains zero HTML sinks, zero `eval`, and zero user-input flows, so the graph confirms (rather than changes) the clean Layer 2 result.

## Project shape

- Framework variant: **Vite + React 19** (`vite.config.ts`, `react`/`react-dom` `^19.1.0` in `package.json`). Single-page static demo; no router, no data layer.
- Deployment platform: **local-only** — no `vercel.json`, `netlify.toml`, `_headers`, `_redirects`, `wrangler.toml`, or `staticwebapp.config.json` checked into the repo. Header checks resolve against "nowhere", so transport/header expectations are unmet by construction.
- Authentication library: **none** (no `next-auth`, `@auth/*`, `@clerk/*`, `@auth0/*`, Supabase, Amplify, Firebase, or Cognito in `dependencies`). The app has no login, no session, no user concept.
- Sanitization library: **none** (no `dompurify`, `isomorphic-dompurify`, `sanitize-html`). None is needed — the app renders no untrusted HTML.
- Linter: **Biome** (`@biomejs/biome`, `biome.json`). No ESLint, therefore no `eslint-plugin-security` / `eslint-plugin-no-unsanitized` / `eslint-plugin-react-security`. `--with-scan` would find no recognised scanners — but a CodeQL SAST workflow now provides equivalent coverage (see repo-hardening posture below).

## Content Security Policy

- **Not detected** anywhere — no response-header source (no deployment config, no framework `headers()`), and no `<meta http-equiv="Content-Security-Policy">` in `index.html`.

## Security headers (source location)

| Header | Detected | Source |
| --- | --- | --- |
| Strict-Transport-Security | no | — |
| X-Frame-Options / `frame-ancestors` | no | — |
| X-Content-Type-Options | no | — |
| Referrer-Policy | no | — |
| Permissions-Policy | no | — |

None are configurable for a `vite build` static bundle without a deployment-layer config, which is absent (no deploy target).

## Cookie-handling primitive

- **None** — no `cookies-next`, `js-cookie`, framework session helper, or manual `document.cookie` access in source.

## XSS sink inventory

- `dangerouslySetInnerHTML`: **0** occurrences across `src/`, `index.html`.
- `eval` / `new Function` / `Function(...)` / string-form `setTimeout`/`setInterval`: **0**.
- Raw `innerHTML` / `outerHTML` writes: **0**.
- The only dynamic UI content is the `<output>` live region in `src/features/threshold-counter/ThresholdCounter.tsx:25`, which renders a fixed-vocabulary status label (`'Healthy'` / `'Approaching limit'` / `'At capacity'`) through React's escaping JSX path — not via any HTML sink. No user-supplied string ever reaches a sink.

## Storage

- `localStorage` / `sessionStorage`: **0** usages. No auth-pattern keys (`token`, `session`, `auth`, `jwt`).

## Scripts and frames

- Inline `<script>` tags: **0**.
- External `<script>` tags: **0**. The single `<script>` in `index.html:10` is a first-party module (`type="module" src="/src/main.tsx"`); SRI is not applicable to bundler-managed first-party modules. External-script SRI coverage: **n/a (no external scripts)**.
- `<iframe>` elements: **0**.
- `window.addEventListener('message', …)` / `postMessage`: **0**.

## Network and secrets surface

- Outbound network calls in `src/`: **0** (`fetch`, `axios`, `XMLHttpRequest` all absent). The app is fully client-local.
- Secret-format regex matches (AWS / Stripe / Google / GitHub token / JWT / PEM) across tracked source: **0**.
- Public-prefix env vars (`VITE_*`, `NEXT_PUBLIC_*`, `PUBLIC_*`) inlined into the bundle: **0**. The only `process.env` reads are CI/test-time (`process.env.CI`, `E2E_BASE_URL`, `STYLEMAP_DIR`) in `playwright.config.ts` and `e2e/styleproof.spec.ts` — never bundled into client code.
- `.env` git-ignore: `.gitignore:27-29` ignores `.env` and `.env.*` and re-includes `!.env.example`. Only `.env.example` is tracked (`git ls-files`), and it documents a single non-secret CI knob (`E2E_BASE_URL`).

## Repo-hardening posture (verified this run — alongside the four-layer baseline)

These overlap `/dependency-audit` and sit beside the per-check baseline; they were the four headline gaps in the prior run and are now **closed**:

- **SAST / CodeQL — present.** `.github/workflows/codeql.yml`: `javascript-typescript`, on `push` (main) + `pull_request` + weekly cron (`0 6 * * 1`, Mon 06:00 UTC). Least-privilege `permissions` (`contents: read`, `security-events: write`); `cancel-in-progress` concurrency.
- **Dependabot — present.** `.github/dependabot.yml`: `npm` + `github-actions` ecosystems, `interval: weekly`; dev dependencies grouped into one PR; `open-pull-requests-limit: 10`.
- **Vulnerability-disclosure policy — present.** `SECURITY.md`: private GitHub advisory + email contact (ben@codewalnut.com), supported-versions note, and a summary of the automated controls.
- **Staged secret scan (pre-commit) — present.** `scripts/secret-scan.sh` runs `gitleaks protect --staged --redact` from `.husky/pre-commit`; degrades gracefully (prints an install hint, exits 0) when gitleaks is absent locally. CI runs `gitleaks/gitleaks-action@v3` over full history unconditionally as the hard backstop, so the control is never silently absent — only deferred to the server when the binary is missing locally.
- **CI security job — present.** `.github/workflows/ci.yml` `security` job runs `pnpm audit --audit-level=high` + `gitleaks/gitleaks-action@v3` (`fetch-depth: 0`).
- **`tmp` advisory remediation — present (fixed).** A real high-severity transitive advisory — `tmp` < 0.2.6 (GHSA-ph9p-34f9-6g65, path traversal), pulled via `@lhci/cli` → inquirer → external-editor — was caught by the CI security gate and fixed by `overrides: tmp: '>=0.2.6'` in `pnpm-workspace.yaml` (pinned across the whole tree).

Note: `gitleaks` is not installed on this audit host, so the local staged scan would no-op here — but the hook and the CI backstop are both wired, so the control is **present**, only deferred to the server on this machine.
