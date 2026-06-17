# Security audit report

**Repository:** BenSheridanEdwards/AgenticProjectTemplate · **Commit:** `f4c862b97f79738bbe04483f2d1f2f494f77037e` · **Run:** 2026-06-17T12:00:00Z · **Skill version:** 1.0.0

**Mode:** static, **graph-enriched** (`graphify-out/graph.json` present, `graphEnriched: true`). The Layer 2 taint-flow analysis is graph-informed; it confirms the clean result — the source contains zero HTML sinks, zero `eval`, and zero user-input-to-sink flows, so there is nothing for taint analysis to trace.

**One-line state:** A clean, minimal Vite + React static demo with no auth, no network, no secrets, and no XSS sinks — so the code-level baseline (Layers 1, 2, and 4) is essentially fully met. Since the prior audit the repo has been hardened: **CodeQL SAST, Dependabot, SECURITY.md, and a pre-commit staged secret scan are now in place, and a real high-severity `tmp` advisory was caught and fixed.** The remaining gap is the transport/header layer (no CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, or Permissions-Policy) — and that gap is structural: the template has **no deploy target** where those headers could live.

> **What changed since the prior run (2026-06-17T00:00:00Z, commit `1623624…`):** the four repo-hardening gaps it flagged as `missing` are now closed — SAST/CodeQL, Dependabot, and SECURITY.md added; the previously-missing staged-content secret scan is wired into pre-commit; and the `tmp` < 0.2.6 advisory is pinned via a `pnpm-workspace.yaml` override. This run is also graph-enriched (the prior run was `noGraphify`). The per-layer code baseline was already clean and remains clean. The CSP and five response headers were `missing` before and stay `missing` now — correctly, since there is still no deployment layer to carry them.

---

## Layer 0 — Diagnostic snapshot

- Framework: **Vite + React 19** (`vite.config.ts`; `react`/`react-dom` `^19.1.0`). Single-page static demo — no router, no data layer, no backend.
- Deployment platform: **local-only** — no `vercel.json`, `netlify.toml`, `_headers`, `_redirects`, `wrangler.toml`, or `staticwebapp.config.json`. Security headers have no source location.
- Auth library: **none**. Sanitization library: **none** (neither needed). Linter: **Biome** (no ESLint, so no `eslint-plugin-security` family — `--with-scan` would find no recognised scanners; CodeQL now provides SAST coverage instead).
- CSP: **not detected** in any form (no header source, no `<meta http-equiv>` in `index.html`).
- Security headers: HSTS, X-Frame-Options/`frame-ancestors`, X-Content-Type-Options, Referrer-Policy, Permissions-Policy — **all absent**.
- Cookie primitive: **none**. `dangerouslySetInnerHTML`: **0**. `eval`/`new Function`/string timers: **0**. Raw `innerHTML`/`outerHTML` writes: **0**. `localStorage`/`sessionStorage`: **0**.
- Inline `<script>`: **0**. External `<script>`: **0** (the one script in `index.html:10` is a first-party Vite module). `<iframe>`: **0**. `postMessage` handlers: **0**.
- Outbound network calls in `src/`: **0**. Secret-format regex matches: **0**. Public-prefix env vars (`VITE_*`/`NEXT_PUBLIC_*`/`PUBLIC_*`) shipped to the client: **0**.
- `.env` git-ignore: `.gitignore:27-29` ignores `.env`/`.env.*` and allowlists `!.env.example`; only `.env.example` is tracked.
- Repo-hardening (now present): CodeQL (`.github/workflows/codeql.yml`), Dependabot (`.github/dependabot.yml`), `SECURITY.md`, pre-commit staged secret scan (`scripts/secret-scan.sh` via `.husky/pre-commit`), and a `tmp >=0.2.6` override in `pnpm-workspace.yaml`.

Full snapshot: `snapshot.md`.

---

## Status tallies

| Layer | present | partial | missing | violation | n/a |
| --- | --- | --- | --- | --- | --- |
| 1 — Authentication, authorization, sessions | 0 | 1 | 0 | 0 | 7 |
| 2 — Input handling and XSS prevention | 7 | 0 | 0 | 0 | 0 |
| 3 — Transport, headers, cookies | 1 | 1 | 6 | 0 | 2 |
| 4 — Secrets, data protection, third-party | 9 | 1 | 0 | 0 | 1 |
| **Total** | **17** | **3** | **6** | **0** | **10** |

36 checks total. `present` 17 · `partial` 3 · `missing` 6 · `violation` 0 · `not-applicable` 10.

Supplemental repo-hardening items (outside the per-check baseline, graded because the prompt asked) — **all four now present**, where the prior run had them all `missing`: SAST/CodeQL **present**, Dependabot **present**, SECURITY.md **present**, staged-content secret scan **present**. The `tmp` advisory is **fixed** via override. The `eslint-plugin-security` family remains absent (Biome is the linter), but CodeQL covers the SAST need.

**Honest grade:** The shipped code is clean — not a single violation, and Layer 2 (XSS) is fully satisfied. Since the last run the *defence-in-process* posture has materially improved: SAST, dependency-update automation, a disclosure policy, and a staged secret scan are all in place, and the gate proved itself by catching and forcing a fix for a real high-severity transitive advisory (`tmp`). The one remaining weakness is *defence-in-depth that lives outside the code*: the CSP and the five response headers. For a static demo with no attack surface this is low-risk, but the moment this template is used as a deployment foundation (its stated purpose) the missing headers become the first thing a reviewer would flag. They are graded `missing` (not `violation`) because there is no deploy target where they could be set.

---

## Top 5 highest-leverage recommendations

### 1. Add a Content Security Policy
- **Why it matters:** A CSP is the single most effective backstop against XSS — it limits what an injected script can do even if one slips past React's escaping. Right now there is no CSP anywhere, so the app has zero defence-in-depth at the header layer.
- **Real consequences if ignored:** Any future feature that introduces a sink (a Markdown renderer, a `dangerouslySetInnerHTML`, a third-party widget) inherits an undefended page. Teams that adopt this template ship that gap to production.
- **Smallest high-leverage fix (S):** Add a `<meta http-equiv="Content-Security-Policy">` to `index.html` with `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`. Promote to a response header once a deploy target exists (a meta tag cannot carry `frame-ancestors` or HSTS).

### 2. Ship the standard security-header set at the deployment edge
- **Why it matters:** HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and frame-ancestors/`X-Frame-Options` are cheap, high-value controls browsers enforce for free — but only if the response carries them. Six are missing because there is no deploy config to put them in.
- **Real consequences if ignored:** Clickjacking (no frame protection), MIME-sniffing attacks, referrer leakage, no HTTPS pinning. For a template meant to be copied into real apps, the absence propagates.
- **Smallest high-leverage fix (S):** Pick the intended host and add one config file — `vercel.json` `headers`, `netlify.toml`/`_headers`, or a Cloudflare `_headers`. Even a documented stub committed alongside the README tells adopters exactly where the headers belong. **This is blocked on choosing a deploy target — the honest prerequisite, not a code change.**
   - 2a. `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
   - 2b. `X-Content-Type-Options: nosniff`
   - 2c. `Referrer-Policy: strict-origin-when-cross-origin`
   - 2d. `Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=(), usb=()`
   - 2e. `X-Frame-Options: DENY` (or `frame-ancestors 'none'` in the CSP header)

### 3. Document a deploy target so the header layer can be closed
- **Why it matters:** Every remaining `missing` finding (CSP + five headers) is downstream of one decision: where does this template deploy? Without that, the highest-leverage hardening cannot be wired and the gaps stay open by construction.
- **Real consequences if ignored:** The audit stays permanently amber on Layer 3; adopters get a foundation with no header story and have to discover the gap themselves.
- **Smallest high-leverage fix (S):** Add a chosen-host config (even as a documented example) — `vercel.json` or `netlify.toml`/`_headers` — carrying the headers from #1 and #2. This converts six `missing` items into `present` in a single file.

### 4. Add ESLint + `eslint-plugin-no-unsanitized` as a regression guard (optional, complements CodeQL)
- **Why it matters:** CodeQL now covers SAST well, but it runs in CI on a cadence; a fast lint rule catches a re-introduced `dangerouslySetInnerHTML` at author time. Biome does not have a security ruleset.
- **Real consequences if ignored:** A future XSS sink could land and only be caught later by CodeQL rather than at the keystroke. Low risk today (zero sinks), but cheap insurance for a template others extend.
- **Smallest high-leverage fix (S):** Add ESLint with `eslint-plugin-no-unsanitized` scoped to security rules only, keeping Biome as the day-to-day linter; this also makes `--with-scan` productive.

### 5. Keep the dependency-advisory loop tight (maintain the win you already have)
- **Why it matters:** The `tmp` advisory was caught and fixed via a `pnpm-workspace.yaml` override — exactly the right move. Overrides are a manual pin that can mask a still-vulnerable tree if the upstream chain later resolves the version on its own; they need periodic review.
- **Real consequences if ignored:** A pinned override silently lingers after it is no longer needed, or hides a regression if the upstream constraint changes. Dependabot + `pnpm audit` already report; the override needs a human to retire it.
- **Smallest high-leverage fix (XS):** Add a short comment/issue to revisit the `tmp: '>=0.2.6'` override once `@lhci/cli`'s chain ships a patched `tmp` natively, then drop the pin. No urgent action — the control is healthy.

> The `styleproof-approve.yml` `github-script` pattern was assessed and is **sound** — see the Layer-3 note below; it is not a finding because it is already correctly hardened.

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

**Fully met — all seven present.** The only dynamic UI content is the `<output>` live region in `src/features/threshold-counter/ThresholdCounter.tsx:25`, which renders a fixed-vocabulary status label (`'Healthy'` / `'Approaching limit'` / `'At capacity'`) through React's auto-escaping JSX — never via an HTML sink, and never from user input. The graph confirms no user-input source reaches any sink.

- **dangerouslySetInnerHTML-only-with-sanitization — present.** 0 occurrences.
- **no-eval-or-dynamic-code-execution — present.** 0 occurrences.
- **no-raw-innerHTML-writes — present.** 0 occurrences; all DOM mutation through React.
- **url-href-src-validated — present.** No user-controlled `href`/`src`/`formAction`; the one `<script src>` is a first-party module literal.
- **open-redirect-patterns-guarded — present.** No redirect call sites.
- **markdown-rich-text-safe-pipeline — present.** No Markdown/rich-text rendering.
- **no-bypassing-react-escaping — present.** Standard `@vitejs/plugin-react` JSX runtime; no raw-HTML `createElement`, no escaping-disabled runtime.

## Layer 3 — Transport, headers, and cookies

This is where the remaining gaps are. The project is **local-only** with no deployment configuration, so there is no place for response headers to live, and none is configured. Graded `missing` (not `violation`) per the baseline — the prerequisite is a deploy target.

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
- The `if:` trust gate requires the comment author to be a `Bot` (only the bot's own report comment), the sender to be a `User`, the PR association, and the report marker. An attacker-authored comment is a `User`, so it never reaches the job.
- The comment body is treated as **untrusted and only pattern-matched, never evaluated** — no `eval`, no shell interpolation of `body`, no `${{ }}` expansion of comment content into a run step (the usual injection vector).
- It fetches a fresh copy of the comment, binds approval to the exact report SHA, re-checks the editor's collaborator permission server-side (`getCollaboratorPermissionLevel`, fails closed to `'none'`), and only stamps the commit status if `headSha === reportSha`. Permissions are least-privilege.
- Verdict: the trust gate and untrusted-input handling are sound. No change recommended.

## Layer 4 — Secrets, data protection, and third-party integrations

**Strong.** Nine present, one heuristic `partial`, one not-applicable. No secrets, clean env hygiene, no third-party scripts/iframes/analytics, and now a **two-tier** gitleaks backstop (staged pre-commit + full-history CI).

- **no-secrets-in-source — present.** 0 secret-format matches. Now defended at two layers: `gitleaks protect --staged` on pre-commit (`scripts/secret-scan.sh` via `.husky/pre-commit`) and `gitleaks/gitleaks-action@v3` over full history in CI (`ci.yml`).
- **env-files-git-ignored — present.** `.gitignore:27-29` ignores `.env`/`.env.*`, allowlists `!.env.example`; only `.env.example` tracked.
- **public-prefix-env-vars-actually-public — present.** No `VITE_*`/`NEXT_PUBLIC_*`/`PUBLIC_*` vars; the only `process.env` reads are CI/test-time and never bundled.
- **no-pii-in-url-paths-or-query — partial (heuristic).** No router/URL params at all; nothing to match. No real exposure.
- **no-pii-in-client-analytics — present.** No analytics library.
- **subresource-integrity-on-external-scripts — not-applicable.** 0 external scripts (the one script is a first-party Vite module).
- **third-party-iframes-sandboxed — present.** 0 iframes.
- **postMessage-origin-validation — present.** 0 message handlers.
- **target-blank-noopener — present.** 0 `target="_blank"` links.
- **no-console-logged-secrets — present.** 0 `console.*` calls in `src/`.
- **weak-crypto-primitives-flagged — present.** No MD5/SHA-1/crypto code.

### Supplemental repo-hardening items (graded per prompt) — now closed

- **SAST / CodeQL — present.** `.github/workflows/codeql.yml`: `javascript-typescript` on `push` (main) + `pull_request` + weekly cron (`0 6 * * 1`). Least-privilege permissions; results surface in the Security tab. *(was `missing` in the prior run)*
- **Dependabot — present.** `.github/dependabot.yml`: `npm` + `github-actions`, weekly, dev deps grouped. *(was `missing`)*
- **SECURITY.md — present.** Private-advisory + email disclosure path, supported-versions note. *(was `missing`)*
- **Staged-content secret scan — present.** `scripts/secret-scan.sh` (`gitleaks protect --staged`) wired into `.husky/pre-commit`; graceful no-op when gitleaks is absent locally; CI is the hard backstop. *(the quality-gates run had flagged this as a missing pre-commit gate)*
- **`tmp` < 0.2.6 advisory (GHSA-ph9p-34f9-6g65) — fixed.** Pinned via `overrides: tmp: '>=0.2.6'` in `pnpm-workspace.yaml` after the CI `pnpm audit` gate caught it. A real high-severity advisory, caught and remediated.
- **`eslint-plugin-security` family — still absent.** Linter is Biome; the ESLint security-plugin family is not installed, so `--with-scan` would find no recognised scanners. CodeQL covers the SAST need; an optional ESLint regression guard is recommendation #4.

---

Full machine-readable findings → `findings.json` · Snapshot → `snapshot.md` · Run metadata → `metadata.json`
