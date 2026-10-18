# 36. Move the workspace to Effect 4 within a 110 kB budget

- **Status:** Proposed (Ben accepts it by approving the PR)
- **Date:** 2026-10-18
- **Amends:** [0011](0011-effect-schema-everywhere.md) (the adapter and resolver names) and [0032](0032-api-ui-greeting-and-contract.md) (the Effect 3 pin and the 130 kB JS budget)

## Context

[0032](0032-api-ui-greeting-and-contract.md) pinned Effect 3 because the form
resolver that [0011](0011-effect-schema-everywhere.md) names,
`effectTsResolver`, runs on Effect 3 only. That stack measured 125.9 kB brotli,
so the JS budget went to 130 kB. 0032 also measured Effect 4 with
`standardSchemaResolver` at about 19 kB less. On 18 October Ben chose Effect 4
and a 110 kB budget for every package.

The facts on npm on 18 October:

- `effect` 4.0.0 went GA on 1 October. `latest` is 4.0.5, published
  15 October. The `beta` and `rc` tags point at older 4.0.0 prereleases.
- `@hookform/resolvers` 5.9.2 (`latest`, published 17 October) still declares
  its `effect` peer as `^3.10.3`. Its `effect-ts` resolver imports Effect 3
  modules that Effect 4 removed, such as `ParseResult`.
- Effect 4 publishes ES modules only and has no dependencies. Effect 3 brought
  `@standard-schema/spec` and `fast-check` with it.

## Decision

**Version.** Every package that used Effect 3 declares `effect` `^4.0.5`: both
api and web packages of `apps/`, `showcase/todo-02` and `showcase/todo-03`. It
is the newest GA patch, and it is older than the one-day `minimumReleaseAge`
pnpm applies, so the install needs no exclusion. `@hookform/resolvers` stays at
`^5.9.1`. Version 5.9.2 is under a day old and would need a release-age
exclusion, and this move does not need it.

**Schema mapping.** ADR 0011 holds unchanged in meaning: Effect Schema
validates every React Hook Form form and every tRPC input, and the Effect
runtime runs only at integration boundaries. Only the API names change.

| Effect 3 | Effect 4 |
| --- | --- |
| `.input(Schema.standardSchemaV1(schema))` | `.input(Schema.toStandardSchemaV1(schema))` |
| `useForm({ resolver: effectTsResolver(schema) })` from `@hookform/resolvers/effect-ts` | `useForm({ resolver: standardSchemaResolver(Schema.toStandardSchemaV1(schema)) })` from `@hookform/resolvers/standard-schema` |
| `Schema.Trim.pipe(Schema.nonEmptyString({ message: () => 'Enter a name' }))` | `Schema.Trim.check(Schema.isNonEmpty({ message: 'Enter a name' }))` |
| `Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, 65_535))` | `Schema.NumberFromString.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 65_535 }))` |
| `Schema.decodeUnknownEither` with `Either` and `ParseResult.ArrayFormatter` in schema tests | `Schema.toStandardSchemaV1(schema)['~standard'].validate(...)`, the call the resolver makes |

Forms and procedures now share one adapter, `Schema.toStandardSchemaV1`.

**`@effect/*` packages.** The workspace uses none, and adds none. Effect 4
exports what were separate packages, such as `effect/cli`, `effect/ai` and
`effect/cluster`, as subpaths of `effect`.

**One new dependency.** `@standard-schema/spec` (MIT, `^1.1.0`) becomes a dev
dependency of each web package. The standard-schema resolver's types import it
as an optional peer. Under Effect 3 it arrived through `effect`. Without it,
`standardSchemaResolver` infers `unknown` form values and `handleSubmit`
fails the type check. It is types only and adds no bundle bytes.

`pnpm install` warns that `@hookform/resolvers` wants `effect` `^3.10.3`. The
warning is about the `effect-ts` subpath, which `policy/form-uses-effect-schema`
now blocks, so it is left visible rather than silenced.

**Gates, each as strict or stricter.**

- `policy/procedure-input-schema` requires `toStandardSchemaV1` and blocks the
  Effect 3 `standardSchemaV1`.
- `policy/form-uses-effect-schema` requires `standardSchemaResolver` with a
  `Schema.toStandardSchemaV1(...)` argument. This is stricter than before:
  `standardSchemaResolver` alone would accept any Standard Schema library, so
  the rule also checks that the schema comes from Effect. It blocks
  `effectTsResolver`. One helper in `tooling/eslint-plugin-policy.js`
  recognises the adapter for both rules.
- `contract/effects-in-integrations` also bans the Effect 4 runners that take
  services: `runPromiseWith`, `runPromiseExitWith`, `runSyncWith`,
  `runSyncExitWith`, `runForkWith` and `runCallbackWith`.
- Jest transforms `effect` with `@swc/jest`, because the package is ES modules
  only. In those files `import.meta` reads as `undefined`. The only use is
  Effect's optional read of `import.meta?.env`, which has no CommonJS form and
  no meaning under Jest.
- The size-limit JS budget drops from 130 kB to 110 kB.

**Measured bundle.** `pnpm build && pnpm size` measures `apps/web` at
99,438 bytes brotli (99.44 kB) against 110 kB. The same build on `main` with
Effect 3 measured 125,899 bytes. A source-map split of the head bundle puts
Effect at 57.6 kB raw (18.0 kB brotli alone), down from 160.4 kB raw (44.9 kB
brotli alone). React DOM remains the largest part. The showcase web packages
have no budget, as 0032 decided, and measure 100,255 bytes (`todo-02`) and
100,265 bytes (`todo-03`) the same way.

**Showcase results.** `todo-02` and `todo-03` move mechanically: the same
mapping, the same schema test rewrite and the new dev dependency, with no
other change. The trial reruns replace both results. Until then the committed
comparison report shows three differences that this move made rather than the
agents. They are the `effect` range in web and api, and the form resolver name
against `todo-01`, whose committed patch stays on Effect 3. The comparison's
`one form` invariant accepts the Effect Schema resolver of either major, so
that run still reads correctly.

The fixed trial prompt keeps its wording. It names no Effect API: "the Effect
Schema resolver" points to `CONVENTIONS.md`, which now names the Effect 4 form.
The prompt template hash, and with it the shared trial baseline, does not
change.

## Consequences

- An agent copying the reference greeting feature writes the Effect 4 form,
  and the policy rules name it when it does not.
- Agents know Effect 3 better, so a first try may reach for `effectTsResolver`
  or `Schema.standardSchemaV1`. The rule messages name the Effect 4 call.
- The JS budget leaves about 10.5 kB of headroom for `apps/web`.
- When `@hookform/resolvers` supports Effect 4 in `effect-ts`, this decision
  still stands: Standard Schema is the one adapter for forms and procedures.
