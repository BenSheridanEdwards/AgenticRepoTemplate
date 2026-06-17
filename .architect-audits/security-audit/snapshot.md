# Layer 0 — Diagnostic snapshot

- Repository: BenSheridanEdwards/AgenticProjectTemplate
- Commit: `1623624be6fa3c415ddcc57c29b7a4a1d4de02e5`
- Generated: 2026-06-17T00:00:00Z
- Graphify output present: **no** (`noGraphify: true`) — static-only run; the Layer 2 taint-flow analysis falls back to per-file pattern matching with reduced precision. Everything else is unaffected.

## Project shape

- Framework variant: **Vite + React 19** (`vite.config.ts`, `react`/`react-dom` `^19.1.0` in `package.json`). Single-page static demo; no router, no data layer.
- Deployment platform: **local-only** — no `vercel.json`, `netlify.toml`, `_headers`, `_redirects`, `wrangler.toml`, or `staticwebapp.config.json` checked into the repo. Header checks resolve against "nowhere", so transport/header expectations are unmet by construction.
- Authentication library: **none** (no `next-auth`, `@auth/*`, `@clerk/*`, `@auth0/*`, Supabase, Amplify, Firebase, or Cognito in `dependencies`). The app has no login, no session, no user concept.
- Sanitization library: **none** (no `dompurify`, `isomorphic-dompurify`, `sanitize-html`). None is needed — the app renders no untrusted HTML.
- Linter: **Biome** (`@biomejs/biome`, `biome.json`). No ESLint, therefore no `eslint-plugin-security` / `eslint-plugin-no-unsanitized` / `eslint-plugin-react-security`. `--with-scan` would find no recognised scanners.

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

None are configurable for a `vite build` static bundle without a deployment-layer config, which is absent.

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
- `.env` git-ignore: `.gitignore:18-20` ignores `.env` and `.env.*` and re-includes `!.env.example`. Only `.env.example` is tracked (`git ls-files`), and it documents a single non-secret CI knob (`E2E_BASE_URL`).
