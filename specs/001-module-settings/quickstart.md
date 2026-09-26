# Quickstart: validating Module Settings

How to prove the feature works end to end. Contracts: [public-api.md](./contracts/public-api.md),
[settings-schema.md](./contracts/settings-schema.md). Entities: [data-model.md](./data-model.md).

## Prerequisites

- Node.js `>=22.12.0`, pnpm.
- `pnpm install` at the repository root.

## Quality gates (all must pass, zero warnings)

```bash
pnpm typecheck
pnpm lint
pnpm knip
pnpm test
```

## Validation scenarios

Each scenario is an automated test under `tests/settings/` or
`tests/discord/components/settings-editor/`. Run one file with `pnpm vitest run <path>`.

| # | Scenario | Proves | Expected |
|---|---|---|---|
| 1 | Sample declaration with one field of every kind; `get` on an unconfigured guild | US1, FR-007, SC-005 | Every value equals its default; the in-memory store records 0 writes |
| 2 | Type-level test (`expectTypeOf`) on `SettingsValues` of the sample | US1, FR-006 | Wrong key or wrong type fails `pnpm typecheck` |
| 3 | Shared valid/invalid value table run through `service.set` and through the Discord adapter's `save` | US2, SC-002 | Identical accept/reject results and identical issue codes/keys |
| 4 | Submission with one invalid and one valid field | FR-011 | Nothing stored; both issues reported |
| 5 | Two writes with the same `expectedRevision` | R4 | Second write raises `ConflictError` |
| 6 | Adapter output for 8 fields in 2 groups, and for a 45-field declaration | US3, FR-029 | Declared order kept; no modal > 5 components; no card > 40 components |
| 7 | `describe(sample, "fr")`, `describe(sample, "xx")` | US4, SC-003 | Valid against the 2020-12 meta-schema (Ajv, dev dependency only); 0 untranslated strings in `fr`; English everywhere for `xx` |
| 8 | Secret field through `describe`, `getForSurface` and the adapter's `currentValue` | FR-008, FR-031, SC-006 | Value never present; `isSet` reported |
| 9 | Dynamic search returning 40 items; search sleeping 3 s (fake timers); search throwing | US5, SC-004 | 25 items; empty after 2.5 s + warn log; empty + warn log |
| 10 | Strict field with an unknown value | FR-023 | `unknownChoice` issue |
| 11 | Stored v1 data, v2 declaration with migration; failing migration; stored v3 data with v2 declaration | US6, FR-018, FR-019 | Migrated + written once; unchanged + defaults; unchanged + never written |
| 12 | Registry with duplicate ids; with a key lacking English | FR-005, FR-028 | Boot error naming the id / key |
| 13 | `runSettingsStoreContract(createInMemorySettingsStore, vitest)` | FR-015, SC-007 | All contract tests pass |
| 14 | Dependency check + public `.d.ts` scan | FR-034, SC-008 | `dependencies` gain only `zod`; no `zod` import in any emitted `.d.ts` of `dist/settings`; `pnpm knip` clean |
| 15 | Module disabled on guild A: command, component and event on A and on B | US7, SC-009 | Blocked with translated message on A only; handler not run on A; B unaffected |
| 16 | Module with `defaultEnabled: false`, unconfigured guild | US7 | Disabled |
| 17 | Guild language `fr`; member locale unsupported / supported; no guild language | US8, FR-038, SC-010 | `fr` / member's / guild Discord locale or `en` |
| 18 | Required field unset: guarded vs unguarded command; then set it | US9, SC-011 | Guarded blocked (missing names for `ManageGuild` members only), unguarded runs; guarded runs after set, no restart |
| 19 | Cache: write then read; external notifier event then read | R15 | Fresh value after own write; fresh value after notified change |

## Manual smoke test (optional)

In a consumer bot, declare the sample settings, spread `settingsEditorFromDeclaration(...)` into
`mountSettingsEditor`, open the editor in a test guild and change a channel and a number field.
Expected: values persist, a `settings.changed` event is received by a subscriber.

## Validation record

Recorded for T055 on 2026-09-26, branch `chore/settings-release` (spec 001 US1–US9 complete).
Kernel paths are under `packages/kernel/tests/`, sandbox paths under `apps/sandbox-bot/tests/`.
Each file was run by path (`pnpm vitest run <path>`): 24 kernel files, 575 tests, and the
sandbox end-to-end file, 18 tests, all passing. No scenario lacked a test; scenario 14's test
(`settings/public-surface.test.ts`) is new in T052.

| # | Test file(s) | Result |
|---|---|---|
| 1 | `settings/settings-service.get.test.ts` ("returns every default for an unconfigured guild and writes nothing"; the sample declares all 13 kinds) | Pass |
| 2 | `settings/types.test.ts` (`expectTypeOf`, `@ts-expect-error` on an unknown key and a wrong type, checked by `pnpm typecheck`) | Pass |
| 3 | `settings/settings-service.set.test.ts` ("value table") and `discord/components/settings-editor/from-declaration.test.ts` ("agreement with the settings service (SC-002)"), both over `settings/fixtures/value-cases.ts` | Pass |
| 4 | `settings/settings-service.set.test.ts` ("stores nothing when one field is invalid, and reports every issue") | Pass |
| 5 | `settings/settings-service.set.test.ts` ("throws ConflictError when the expected revision is stale") | Pass |
| 6 | `discord/components/settings-editor/from-declaration.test.ts` ("shows 8 fields in their 2 declared groups", "splits a group into chunks of at most 5 fields", "keeps a 45-field declaration within Discord's card limits") | Pass |
| 7 | `settings/describe.test.ts` (Ajv 2020 meta-schema in `fr`, `en`, `xx`; French with no English left; English for `xx`) | Pass |
| 8 | `settings/describe.test.ts` (secret write-only), `settings/settings-service.surface.test.ts`, `discord/components/settings-editor/from-declaration.test.ts` ("secrets") | Pass |
| 9 | `settings/suggest.test.ts` (S9: 25 cap, 2.5 s timeout with fake timers, throwing search); sandbox `bootstrap/sandbox.e2e.test.ts` (S9) | Pass |
| 10 | `settings/validate.test.ts` ("strict searchable fields (S10)"); sandbox `bootstrap/sandbox.e2e.test.ts` (S10) | Pass |
| 11 | `settings/migrate.test.ts` (migrated and written once, failing migration, newer version never written); sandbox `bootstrap/sandbox.e2e.test.ts` (S11) | Pass |
| 12 | `settings/registry.test.ts` (duplicate id named; each key without English named) | Pass |
| 13 | `settings/in-memory/in-memory-settings-store.test.ts` (`runSettingsStoreContract(createInMemorySettingsStore, vitest)`), `settings/testing/settings-store-contract.test.ts` | Pass |
| 14 | `settings/public-surface.test.ts` (new, T052: emitted `.d.ts` scan, `dependencies` = `node-cron`, `zod`), `package-exports.test.ts`; `pnpm knip` clean | Pass |
| 15 | `discord/command/router.test.ts`, `discord/components/component-router.test.ts`, `discord/events/event-router.test.ts`; sandbox `bootstrap/sandbox.e2e.test.ts` (S15) | Pass |
| 16 | `settings/system/module-gate.test.ts` ("disables a module declared defaultEnabled: false … (S16)") | Pass |
| 17 | `discord/settings/guild-locale-resolver.test.ts`, `discord/command/create-command.test.ts`, `discord/command/create-context-menu-command.test.ts`, the router tests; sandbox `bootstrap/sandbox.e2e.test.ts` (S17) | Pass |
| 18 | `discord/settings/require-configured.test.ts`, `settings/status.test.ts`; sandbox `bootstrap/sandbox.e2e.test.ts` (S18, including `/config` left usable) | Pass |
| 19 | `settings/cache.test.ts` ("SettingsService.get through the cache (S19)") | Pass |

Gate from the repository root, zero errors and zero warnings: `pnpm typecheck`, `pnpm lint`,
`pnpm knip`, `pnpm test` (kernel 1059 tests, sandbox 109), `pnpm build`, and
`npx -y jscpd@4 packages/kernel/src apps/sandbox-bot/src --min-lines 5 --min-tokens 50`
(0 clones).

Release checks: `pnpm changeset status` lists one **major** bump of `@azurioh/discord-kernel`.
`pnpm pack --dry-run` in `packages/kernel` ships `LICENSE`, `README.md`, `package.json`,
`dist` and `src` (the declared `files`, `src` for the declaration maps), with no test or
fixture. Installed from the packed tarball in a scratch consumer with discord.js 14.27.0,
`node --input-type=module` imported all 101 module subpaths of `exports` (each with at least
one export; `./package.json` resolved through `require`), and `tsc` (NodeNext) resolved the
types of all 101.
