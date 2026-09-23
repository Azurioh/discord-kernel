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
