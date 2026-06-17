# Security audit report

**Repository:** BenSheridanEdwards/AgenticProjectTemplate · **Commit:** `1623624be6fa3c415ddcc57c29b7a4a1d4de02e5` · **Run:** 2026-06-17T00:00:00Z · **Skill version:** 1.0.0

**Mode:** static-only. `graphify` was not run (`noGraphify: true`) — the Layer 2 taint-flow analysis fell back to per-file pattern matching with reduced precision. That precision loss is immaterial here: the source contains zero HTML sinks, zero `eval`, and zero user-input-to-sink flows, so there is nothing for taint analysis to trace.

**One-line state:** A clean, minimal Vite + React static demo with no auth, no network, no secrets, and no XSS sinks — so the code-level baseline (Layers 1, 2, and 4) is essentially fully met — but it ships **no transport/header controls at all** (no CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, or Permissions-Policy) because it has no deployment layer, and it lacks the standard repo-hardening files (SAST/CodeQL, Dependabot, SECURITY.md).

---

## Layer 0 — Diagnostic snapshot

- Framework: **Vite + React 19** (`vite.config.ts`; `react`/`react-dom` `^19.1.0`). Single-page static demo — no router, no data layer, no backend.
- Deployment platform: **local-only** — no `vercel.json`, `netlify.toml`, `_headers`, `_redirects`, `wrangler.toml`, or `staticwebapp.config.json`. Security headers have no source location.
- Auth library: **none**. Sanitization library: **none** (neither needed). Linter: **Biome** (no ESLint, so no `eslint-plugin-security` family — `--with-scan` would find no recognised scanners).
- CSP: **not detected** in any form (no header source, no `<meta http-equiv>` in `index.html`).
- Security headers: HSTS, X-Frame-Options/`frame-ancestors`, X-Content-Type-Options, Referrer-Policy, Permissions-Policy — **all absent**.
- Cookie primitive: **none**. `dangerouslySetInnerHTML`: **0**. `eval`/`new Function`/string timers: **0**. Raw `innerHTML`/`outerHTML` writes: **0**. `localStorage`/`sessionStorage`: **0**.
- Inline `<script>`: **0**. External `<script>`: **0** (the one script in `index.html:10` is a first-party Vite module). `<iframe>`: **0**. `postMessage` handlers: **0**.
- Outbound network calls in `src/`: **0**. Secret-format regex matches: **0**. Public-prefix env vars (`VITE_*`/`NEXT_PUBLIC_*`/`PUBLIC_*`) shipped to the client: **0**.
- `.env` git-ignore: `.gitignore:18-20` ignores `.env`/`.env.*` and allowlists `!.env.example`; only `.env.example` is tracked.

Full snapshot: `snapshot.md`.

---

## Status tallies

| Layer | present | partial | missing | violation | n/a |
| --- | --- | --- | --- | --- | --- |
| 1 — Authentication, authorization, sessions | 0 | 1 | 0 | 0 | 7 |
| 2 — Input handling and XSS prevention | 7 | 0 | 0 | 0 | 0 |
| 3 — Transport, headers, cookies | 1 | 1 | 6 | 0 | 2 |
| 4 — Secrets, data protection, third-party | 9 | 1 | 0 | 0 | 3 |
| **Total** | **17** | **3** | **6** | **0** | **12** |

Supplemental repo-hardening gaps (outside the per-check baseline, graded because the prompt asked): SAST/CodeQL **missing**, Dependabot **missing**, SECURITY.md **missing**, `eslint-plugin-security` family **missing** (Biome is the linter).

**Honest grade:** The shipped code is clean — there is not a single violation, and Layer 2 (XSS) is fully satisfied. The weakness is entirely in *defence-in-depth that lives outside the code*: response headers and repo-hardening automation. For a static demo with no attack surface this is low-risk, but the moment this template is used as a deployment foundation (its stated purpose), the missing headers and missing CSP become the first thing a reviewer would flag. The six `missing` Layer 3 items and the missing CSP are real, not nitpicks.

---

## Top 5 highest-leverage recommendations

### 1. Add a Content Security Policy
- **Why it matters:** A CSP is the single most effective backstop against XSS — it limits what an injected script can do even if one slips past React's escaping. Right now there is no CSP anywhere, so the app has zero defence-in-depth.
- **Real consequences if ignored:** Any future feature that introduces a sink (a Markdown renderer, a `dangerouslySetInnerHTML`, a third-party widget) inherits an undefended page. Teams that adopt this template ship that gap to production.
- **Smallest high-leverage fix (S):** Add a `<meta http-equiv="Content-Security-Policy">` to `index.html` with `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`. Promote to a response header at the deployment edge for full coverage (a meta tag cannot carry `frame-ancestors`).

### 2. Ship the standard security-header set at the deployment edge
- **Why it matters:** HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and frame-ancestors/`X-Frame-Options` are cheap, high-value controls that browsers enforce for free — but only if the response carries them. Six of them are missing.
- **Real consequences if ignored:** Clickjacking (no frame protection), MIME-sniffing attacks, referrer leakage, and no HTTPS pinning. For a template meant to be copied into real apps, the absence propagates.
- **Smallest high-leverage fix (S):** Pick the intended host and add one config file — `vercel.json` `headers`, `netlify.toml`/`_headers`, or a Cloudflare `_headers`. Even as a documented stub committed alongside the README, it tells adopters exactly where the headers belong.
   - 2a. `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
   - 2b. `X-Content-Type-Options: nosniff`
   - 2c. `Referrer-Policy: strict-origin-when-cross-origin`
   - 2d. `Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=(), usb=()`
   - 2e. `X-Frame-Options: DENY` (or `frame-ancestors 'none'` in the CSP header)

### 3. Add a SAST workflow (CodeQL)
- **Why it matters:** The `security` job in `ci.yml` covers dependency vulnerabilities (`pnpm audit`) and secret scanning (gitleaks) — but nothing inspects the application code itself. Biome is a style/correctness linter, not a security SAST.
- **Real consequences if ignored:** A future XSS sink or unsafe pattern lands with no automated catch; the audit's clean Layer 2 result is a snapshot, not a guarantee.
- **Smallest high-leverage fix (S):** Add `github/codeql-action` on `push` + `pull_request` for `javascript-typescript`. Optionally add ESLint + `eslint-plugin-no-unsanitized` purely as a CI guard against future `dangerouslySetInnerHTML` regressions (keeps Biome as the day-to-day linter).

### 4. Add Dependabot
- **Why it matters:** `pnpm audit --audit-level=high` *reports* vulnerable dependencies but never *fixes* them. Without automated update PRs, the lockfile drifts and audit failures pile up until someone does a painful batch upgrade.
- **Real consequences if ignored:** Known-CVE dependencies linger; the `security` job eventually goes red and gets ignored or `|| true`-d.
- **Smallest high-leverage fix (XS):** Add `.github/dependabot.yml` with the `npm` and `github-actions` ecosystems on a weekly schedule.

### 5. Add a SECURITY.md disclosure policy
- **Why it matters:** A template marketed as enterprise-quality scaffolding should model a vulnerability-disclosure path. There is none.
- **Real consequences if ignored:** Researchers and adopters have no documented way to report issues; the project looks unmaintained from a security-governance standpoint.
- **Smallest high-leverage fix (XS):** Add `SECURITY.md` (or `.github/SECURITY.md`) with a reporting contact and a supported-versions note.

> The `styleproof-approve.yml` `github-script` pattern was assessed and is **sound** — see Layer-3 note below; it is not in the Top 5 because it is already correct.

---

## Layer 1 — Authentication, authorization, and sessions

The app has no authentication, no session, no user concept, and no network calls. Seven of the eight checks are **not-applicable** (no token storage, no logout, no auth state, no OAuth/OIDC, no redirect handling). The soft server-side-authorization check reports **partial** by vocabulary, but there is no authorization surface to gate.

- **session-tokens-not-in-localstorage — not-applicable.** No `localStorage`/`sessionStorage` and no auth library. No tokens exist.
- **logout-invalidates-server-session — not-applicable.** No logout, no server.
- **auth-state-server-derived — not-applicable.** No auth state; no `src/` network calls.
- **oauth-oidc-uses-pkce — not-applicable.** No OAuth flow (skipped silently per baseline).
- **oauth-uses-state — not-applicable.** No OAuth flow.
- **oidc-uses-nonce — not-applicable.** No OIDC flow.
- **redirect-uris-explicitly-handled — not-applicable.** No router, no `?next=`/`?returnTo=` reflection, no `router.push`/`window.location` from input.
- **server-side-authorization-referenced — partial (heuristic).** No role/permission model exists. Recorded `partial` only to honour the soft-check vocabulary; no real gap. *Action:* none until auth is added.

## Layer 2 — Input handling and XSS prevention

**Fully met — all seven present.** The only dynamic UI content is the `<output>` live region in `src/features/threshold-counter/ThresholdCounter.tsx:25`, which renders a fixed-vocabulary status label (`'Healthy'` / `'Approaching limit'` / `'At capacity'`) through React's auto-escaping JSX — never via an HTML sink, and never from user input.

- **dangerouslySetInnerHTML-only-with-sanitization — present.** 0 occurrences.
- **no-eval-or-dynamic-code-execution — present.** 0 occurrences.
- **no-raw-innerHTML-writes — present.** 0 occurrences; all DOM mutation through React.
- **url-href-src-validated — present.** No user-controlled `href`/`src`/`formAction`; the one `<script src>` is a first-party module literal.
- **open-redirect-patterns-guarded — present.** No redirect call sites.
- **markdown-rich-text-safe-pipeline — present.** No Markdown/rich-text rendering.
- **no-bypassing-react-escaping — present.** Standard `@vitejs/plugin-react` JSX runtime; no raw-HTML `createElement`, no escaping-disabled runtime.

## Layer 3 — Transport, headers, and cookies

This is where the real gaps are. The project is **local-only** with no deployment configuration, so there is no place for response headers to live, and none is configured.

- **https-enforced — partial.** No deployment config; per baseline this is `partial`, not `violation`, for local-only projects. The only `http://` literal (`playwright.config.ts:12`) is a localhost test default, not shipped. *Action:* enforce HTTPS at the edge when deployed.
- **strict-transport-security-set — missing.** No HSTS header source.
- **content-security-policy-defined — missing.** No CSP header and no `<meta http-equiv>` in `index.html` (`index.html:3` `<head>` has no CSP). *Highest-leverage missing control.*
- **content-security-policy-not-overly-permissive — not-applicable.** No CSP to evaluate.
- **frame-ancestors-restricted — missing.** No `frame-ancestors` and no `X-Frame-Options`; the page can be framed by any origin (clickjacking undefended).
- **x-content-type-options-nosniff — missing.** Header absent.
- **referrer-policy-set — missing.** Header absent.
- **permissions-policy-set — missing.** Header absent.
- **cookies-secure-httponly-samesite — not-applicable.** No cookies set anywhere.
- **no-mixed-content — present.** No `http://` URLs in production source.

**`styleproof-approve.yml` assessment (`actions/github-script` on `issue_comment`).** This is the classic dangerous pattern — running a script in response to a comment event — but the implementation is correctly hardened and is **not a finding**:
- The `if:` trust gate (`styleproof-approve.yml:28-32`) requires `comment.user.type == 'Bot'` (only the bot's own report comment), `sender.type == 'User'` (excludes the bot's own edits), the PR association, and the report marker. An attacker-authored comment is a `User`, so it never reaches the job.
- The comment body is treated as **untrusted and only pattern-matched, never evaluated** (`styleproof-approve.yml:44-60`) — no `eval`, no shell interpolation of `body`, no `${{ }}` expansion of comment content into a run step (the usual injection vector).
- It fetches a fresh copy of the comment, binds approval to the exact report SHA, re-checks the editor's collaborator permission server-side (`getCollaboratorPermissionLevel`, fails closed to `'none'`), and only stamps the commit status if `headSha === reportSha`. Permissions are least-privilege (`statuses: write`, `pull-requests: read`, `issues: write`).
- Verdict: the trust gate and untrusted-input handling are sound. No change recommended.

## Layer 4 — Secrets, data protection, and third-party integrations

**Strong.** Nine present, one heuristic `partial`, three not-applicable. No secrets, clean env hygiene, no third-party scripts/iframes/analytics, and a gitleaks backstop in CI.

- **no-secrets-in-source — present.** 0 secret-format matches; CI runs gitleaks (`ci.yml:118-121`) on every push/PR.
- **env-files-git-ignored — present.** `.gitignore:18-20` ignores `.env`/`.env.*`, allowlists `!.env.example`; only `.env.example` tracked.
- **public-prefix-env-vars-actually-public — present.** No `VITE_*`/`NEXT_PUBLIC_*`/`PUBLIC_*` vars; the only `process.env` reads are CI/test-time and never bundled.
- **no-pii-in-url-paths-or-query — partial (heuristic).** No router/URL params at all; nothing to match. No real exposure.
- **no-pii-in-client-analytics — present.** No analytics library.
- **subresource-integrity-on-external-scripts — not-applicable.** 0 external scripts (the one script is a first-party Vite module).
- **third-party-iframes-sandboxed — present.** 0 iframes.
- **postMessage-origin-validation — present.** 0 message handlers.
- **target-blank-noopener — present.** 0 `target="_blank"` links.
- **no-console-logged-secrets — present.** 0 `console.*` calls in `src/`.
- **weak-crypto-primitives-flagged — present.** No MD5/SHA-1/crypto code.

### Supplemental repo-hardening gaps (graded per prompt)

- **SAST / CodeQL — missing.** Only `ci.yml`, `styleproof.yml`, `styleproof-approve.yml`; no CodeQL or other SAST. Biome is a style linter, not a security scanner.
- **Dependabot — missing.** No `.github/dependabot.yml`. `pnpm audit --audit-level=high` reports but does not open update PRs.
- **SECURITY.md — missing.** No vulnerability-disclosure policy.
- **`eslint-plugin-security` family — missing.** Linter is Biome; ESLint and the security-plugin family are absent, so `--with-scan` would find no recognised scanners.

---

Full machine-readable findings → `findings.json` · Snapshot → `snapshot.md` · Run metadata → `metadata.json`
