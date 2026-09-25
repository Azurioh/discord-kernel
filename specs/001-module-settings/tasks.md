---

description: "Task list for Module Settings — Declare Once, Render Everywhere"
---

# Tasks: Module Settings — Declare Once, Render Everywhere

**Input**: Design documents from `/specs/001-module-settings/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required. Constitution VII (test-first): every implementation task is preceded by a
failing test task. Scenario numbers (S1–S19) refer to `quickstart.md`.

**Organization**: grouped by user story, in the plan's delivery order: foundations, US1+US2 (P1),
US3+US4 (P2), US7+US8+US9 (P2), US5+US6 (P3), polish.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: user story from spec.md
- Paths are relative to the repository root. Tests mirror `packages/kernel/src/` under `packages/kernel/tests/`.
- Every task ends green on `pnpm typecheck && pnpm lint && pnpm test` for the files it touches.

---

## Phase 1: Setup

- [X] T001 Add runtime dependency `zod@4.6.5` with `pnpm add zod@4.6.5`, and dev dependencies `ajv` and `@changesets/cli` (latest, verified with `npm view`) with `pnpm add -D`; do not hand-edit `packages/kernel/package.json`
- [X] T002 Initialise changesets with `pnpm changeset init`, set `"access": "public"` and `"baseBranch": "main"` in `.changeset/config.json`

---

## Phase 2: Foundational (blocks every user story)

- [X] T003 [P] Write failing tests for `TranslationRegistry.has(key)` (registered key → true, unknown key → false) in `packages/kernel/tests/i18n/catalog.test.ts`
- [X] T004 Add `has(key: string): boolean` to `TranslationRegistry` in `packages/kernel/src/i18n/catalog.ts` (additive; no behaviour change to `register`)
- [X] T005 [P] Define the port types in `packages/kernel/src/settings/ports/settings-store.ts` (`SettingsStore`, `StoredSettings` with `guildId`, `moduleId`, `version`, `revision` "starts at 1 on first write; +1 on each write", `values`, `updatedAt` ISO-8601, `updatedBy?`), `packages/kernel/src/settings/ports/guild-directory.ts` (`GuildDirectory`, `ChannelKind`) and `packages/kernel/src/settings/ports/settings-changed-notifier.ts` (`SettingsChangedNotifier`, `SettingsChangedEvent`) exactly as in `contracts/public-api.md`
- [X] T006 Implement the store contract suite `runSettingsStoreContract(createStore, { describe, it, expect })` in `packages/kernel/src/settings/testing/settings-store-contract.ts`: read of a missing record → `null`; first write with `expectedRevision: null`; write with a stale revision → `ConflictError`; revision increments by 1; delete; guild A and guild B isolated; module A and module B isolated. No import of `vitest`
- [X] T007 Write `packages/kernel/tests/settings/in-memory/in-memory-settings-store.test.ts` running `runSettingsStoreContract` with Vitest's `describe/it/expect`, then implement `createInMemorySettingsStore()` in `packages/kernel/src/settings/in-memory/in-memory-settings-store.ts` until it passes (S13)
- [X] T008 [P] Write tests then implement `createInMemoryGuildDirectory(seed)` in `packages/kernel/tests/settings/in-memory/in-memory-guild-directory.test.ts` and `packages/kernel/src/settings/in-memory/in-memory-guild-directory.ts` (lookup by id, search by case-insensitive name prefix, channel-kind filter)
- [X] T009 [P] Write tests then implement `createInProcessNotifier()` (subscribe, notify, unsubscribe; a throwing listener does not stop others) in `packages/kernel/tests/settings/in-memory/in-process-notifier.test.ts` and `packages/kernel/src/settings/in-memory/in-process-notifier.ts`
- [X] T010 [P] Write tests then implement `SettingsValidationError` (extends `ValidationError` from `packages/kernel/src/errors/business-error.ts`, carries `issues: SettingsIssue[]`; `SettingsIssue.code` ∈ `required`, `type`, `min`, `max`, `minLength`, `maxLength`, `minItems`, `maxItems`, `duplicate`, `channelType`, `notFound`, `unknownChoice`, `unknownField`) in `packages/kernel/tests/settings/settings-validation-error.test.ts` and `packages/kernel/src/settings/settings-validation-error.ts`
- [X] T011 [P] Write tests then implement the duration parser (`"90s"`, `"15m"`, `"2h"`, `"7d"`, `"1h30m"` → whole seconds; invalid input → `undefined`) in `packages/kernel/tests/settings/duration.test.ts` and `packages/kernel/src/settings/duration.ts`
- [X] T012 [P] Add the settings message catalog (English and French) for every `SettingsIssue` code, "set" / "not set", "module disabled on this server", "module not configured" in `packages/kernel/src/settings/messages.ts`
- [X] T013 Move the `Choice` type (`{ readonly name: string; readonly value: string | number }`) from `packages/kernel/src/discord/command/options.ts` to the vendor-free `packages/kernel/src/settings/choice.ts` and re-export it from `options.ts` so existing imports keep working; add a test in `packages/kernel/tests/settings/choice.test.ts` asserting `packages/kernel/src/settings/` files contain no `discord.js` import (constitution II)

**Checkpoint**: ports, twins and contract suite green.

---

## Phase 3: User Story 1 — Declare once and read with types (P1) 🎯 MVP

**Goal**: `defineSettings` + `field.*` + typed `get`.
**Independent test**: S1, S2.

- [X] T014 [P] [US1] Create the shared fixture declaration covering every field kind (channel with `types`, role, user, color, duration, enum, integer, number, text, boolean, secret, list of each allowed item kind), with defaults, two groups, module hints (`icon`, `groupOrder`), field hints (`group`, `order`, `unit`, `hint`, `advanced`, `examples`, `description`, `placeholder`) and an `access` value on the module, one group and one field, in `packages/kernel/tests/settings/fixtures/sample-declaration.ts`
- [X] T015 [P] [US1] Write failing type-level tests (`expectTypeOf`) for `SettingsValues`: required-or-default → `T`, otherwise `T | undefined`; enum literals preserved; unknown key and wrong type rejected, in `packages/kernel/tests/settings/types.test.ts` (S2)
- [X] T016 [P] [US1] Write failing tests for declaration-time errors — default failing its own field, `default`/`examples` on `secret`, more than 25 static choices, `ui.group` naming an undeclared group, `version > 1` without `migrate`, `text.maxLength` > 4000, `list.maxItems` > 25, list item kind outside channel/role/user/enum/integer/text; plus positive cases: every hint and every `access` value (module, group, field) is kept unchanged on the declaration and never enforced (FR-020, FR-032) — in `packages/kernel/tests/settings/define-settings.test.ts`
- [X] T017 [US1] Implement the field builders in `packages/kernel/src/settings/fields/` (model in `field.ts`, builders in `builders.ts`, Zod confined to `zod-schema.ts`; constraints per data-model "Kinds and stored value types"; snowflakes as strings; color stored as `"#RRGGBB"`, parsed with the vendor-neutral `parseColor` from `packages/kernel/src/color.ts` (shared with `packages/kernel/src/discord/ui/color-input.ts`; bot-registered aliases are not accepted); duration via `packages/kernel/src/settings/duration.ts`). Builders accept the semantic hints of FR-020 (`ui: { group, order, hint, advanced, examples }`, `description`, `placeholder`, `unit`) and an opaque `access` slot (FR-032). No Zod type in any exported signature
- [X] T018 [US1] Implement `SettingsValues`, `SurfaceValues` and inference helpers in `packages/kernel/src/settings/types.ts` until T015 passes
- [X] T019 [US1] Implement `defineSettings` with the declaration-time checks, module hints (`ui: { icon, groupOrder }`) and opaque `access` slots on module and groups, in `packages/kernel/src/settings/define-settings.ts` until T016 passes
- [X] T020 [P] [US1] Write failing tests then implement `createSettingsRegistry` (duplicate declaration id → boot error naming the id; any label/description/placeholder/unit/group/choice key without an English source → boot error naming the key, via `TranslationRegistry.has`) in `packages/kernel/tests/settings/registry.test.ts` and `packages/kernel/src/settings/registry.ts` (S12)
- [X] T021 [US1] Write failing tests for `service.get`: unconfigured guild → all defaults and 0 store writes (S1); stored values decoded; guild A values never returned for guild B; secret readable by module logic — in `packages/kernel/tests/settings/settings-service.get.test.ts`
- [X] T022 [US1] Implement `createSettingsService` with `get` in `packages/kernel/src/settings/settings-service.ts` until T021 passes
- [X] T023 [P] [US1] Add `settings?: readonly SettingsDeclaration[]` and `defaultEnabled?: boolean` to `BotModule` in `packages/kernel/src/module/module.ts`, with a test in `packages/kernel/tests/module/module.test.ts`

**Checkpoint**: US1 independently usable.

---

## Phase 4: User Story 2 — Validate once, for every surface (P1)

**Goal**: shared two-stage validation and atomic writes.
**Independent test**: S3 (surface-neutral half), S4, S5.

- [X] T024 [P] [US2] Create the shared valid/invalid value table per field kind, with expected issue codes, in `packages/kernel/tests/settings/fixtures/value-cases.ts` (reused by T031 for SC-002)
- [X] T025 [US2] Write failing tests for `validate`: every row of the value table; stage 2 only on fields that passed stage 1; deleted channel → `notFound`; wrong channel type → `channelType`; unknown key → `unknownField`; all issues reported together — in `packages/kernel/tests/settings/validate.test.ts`
- [X] T026 [US2] Implement two-stage validation (Zod object, then `GuildDirectory` checks) and the Zod-issue → `SettingsIssue` mapping (catalog keys from `packages/kernel/src/settings/messages.ts`, never Zod messages) in `packages/kernel/src/settings/validate.ts` until T025 passes
- [X] T027 [US2] Write failing tests for `service.validate`, `service.set` (atomic: one invalid field → nothing stored; `expectedRevision` mismatch → `ConflictError`; `updatedAt` from `Clock`; `updatedBy` set; `settings.changed` event with changed keys and revision) and `service.reset` (keys or `"all"` → defaults); a stored field unknown to the declaration is dropped on the next write (FR-017); `set` with `ctx.guildId` different from `guildId` is rejected — in `packages/kernel/tests/settings/settings-service.set.test.ts` (S4, S5)
- [X] T028 [US2] Implement `validate`, `set`, `reset` in `packages/kernel/src/settings/settings-service.ts` until T027 passes
- [X] T029 [US2] Write failing tests then implement `getForSurface` (secrets replaced by `{ isSet }`) in `packages/kernel/tests/settings/settings-service.surface.test.ts` and `packages/kernel/src/settings/settings-service.ts` (S8, service half)

**Checkpoint**: MVP (US1 + US2) complete — declare, read, validate, write.

---

## Phase 5: User Story 3 — Discord screen from the declaration (P2)

**Goal**: adapter onto the existing settings-editor; `GuildDirectory` over discord.js.
**Independent test**: S3 (Discord half), S6, S8 (adapter half).

- [X] T030 [P] [US3] Write failing tests for `settingsEditorFromDeclaration`: mapping table of research R10 (except searchable fields, see T048); 8 fields in 2 groups keep declared order; groups split into chunks of at most 5 fields; a 45-field declaration never exceeds 40 components per card (nest groups as levels); secret `currentValue` shows "set"/"not set" only; a stored channel/role/user missing from `GuildDirectory` is shown as unavailable; a `toggles` field maps to one control listing its declared keys with their `keyLabels` (current state from the full boolean record, saved as a full record); a `toggles` field with more than 25 keys is paged or split into chunks of at most 25 options (Discord select limit), none of its keys lost — in `packages/kernel/tests/discord/components/settings-editor/from-declaration.test.ts`
- [X] T031 [US3] Add to the same test file the SC-002 agreement test: every row of `packages/kernel/tests/settings/fixtures/value-cases.ts` submitted through the adapter's `save` gives the same accept/reject result and issue codes as `service.set`
- [X] T032 [US3] Implement `settingsEditorFromDeclaration` in `packages/kernel/src/discord/components/settings-editor/from-declaration.ts` and export it from `packages/kernel/src/discord/components/settings-editor/index.ts`, including the `toggles` kind mapping tested in T030 (a `toggles` field with more than 25 keys is paged or chunked, at most 25 options per select); do not change `mountSettingsEditor`'s existing API
- [X] T033 [P] [US3] Write failing tests (mocked `Client`/`Guild`) then implement `createDiscordGuildDirectory(client)` in `packages/kernel/tests/discord/settings/discord-guild-directory.test.ts` and `packages/kernel/src/discord/settings/discord-guild-directory.ts`

---

## Phase 6: User Story 4 — Settings description (P2)

**Goal**: translated JSON Schema draft 2020-12 per module.
**Independent test**: S7, S8 (describe half).

- [X] T034 [P] [US4] Write failing tests for `describe`: output validates against the draft 2020-12 meta-schema with `ajv/dist/2020`; `describe(sample, "fr")` has 0 untranslated strings; `describe(sample, "xx")` is entirely English and reports `x-kernel.locale: "en"`; per-key fallback when one French key is missing; secrets have `writeOnly: true` and no `default`/`examples`; every property has `x-kernel.kind`; a `toggles` field is `type: "object"` with one `boolean` property per declared key (translated `keyLabels` as each property's `title`, per-key default under `default`) and `additionalProperties: false`; every declared hint appears translated under `x-kernel` (`group`, `order`, `unit`, `hint`, `advanced`) or as the standard keyword (`examples`, `description`), module `icon` and ordered `groups` appear at the top level; `access` never appears; matches the shape in `contracts/settings-schema.md` — in `packages/kernel/tests/settings/describe.test.ts`
- [X] T035 [US4] Implement `describe` with `z.toJSONSchema(schema, { target: "draft-2020-12", override })`, translated annotations from the descriptors (not Zod's global registry) and the `x-kernel` keyword (the `toggles` kind as an object of booleans with `additionalProperties: false`, see T034), in `packages/kernel/src/settings/describe.ts`, and expose it as `service.describe`

---

## Phase 7: User Story 7 — Enable or disable modules per guild (P2)

**Goal**: kernel system declaration, cache, gate in routers.
**Independent test**: S15, S16, S19.

- [X] T036 [P] [US7] Write failing tests then implement the `kernelSettings` declaration (id `kernel`; `modules`: a `field.toggles` field whose `keys` are the registered module names (value: record of registered module name → boolean), default from each module's `defaultEnabled`, itself `true` by default; `locale`: enum of supported locales, optional) and its automatic inclusion by `createSettingsRegistry` in `packages/kernel/tests/settings/system/kernel-settings.test.ts` and `packages/kernel/src/settings/system/kernel-settings.ts`
- [X] T037 [P] [US7] Write failing tests then implement the read cache (per `(guildId, moduleId)`; invalidated by own writes and by notifier events; TTL 60 s via `Clock`) in `packages/kernel/tests/settings/cache.test.ts` and `packages/kernel/src/settings/cache.ts`, and wire it into `get` (S19)
- [X] T038 [US7] Write failing tests then implement `createModuleGate(service)` in `packages/kernel/tests/settings/system/module-gate.test.ts` and `packages/kernel/src/settings/system/module-gate.ts` (S16)
- [X] T039 [US7] Write failing tests then add an optional `gate?: ModuleGate` to the command router: a command of a disabled module on a guild does not run and replies with the translated "disabled on this server" message; other guilds unaffected — in `packages/kernel/tests/discord/command/router.test.ts` and `packages/kernel/src/discord/command/router.ts` (S15)
- [X] T040 [P] [US7] Same as T039 for components in `packages/kernel/tests/discord/components/component-router.test.ts` and `packages/kernel/src/discord/components/component-router.ts`
- [X] T041 [P] [US7] Same as T039 for guild-bound events (handler silently skipped for that guild) in `packages/kernel/tests/discord/events/event-router.test.ts` and `packages/kernel/src/discord/events/event-router.ts`

---

## Phase 8: User Story 8 — Bot language per guild (P2)

**Goal**: FR-038 language order.
**Independent test**: S17.

- [X] T042 [US8] Write failing tests then implement `resolveGuildLocale(interaction, service)` (member locale if supported → guild setting → guild Discord locale if supported → `en`, via existing `resolveLocale`) in `packages/kernel/tests/discord/settings/resolve-guild-locale.test.ts` and `packages/kernel/src/discord/settings/resolve-guild-locale.ts`
- [X] T043 [US8] Use `resolveGuildLocale` where the command, component and event paths resolve the reply locale today (`packages/kernel/src/discord/command/context.ts` and the routers of T039–T041), with tests extended in the matching test files

As built (resolver design rule, `docs/roadmap.md`): the language is read through the
`LocaleResolver` port (`discord/interaction/locale-resolver.ts`); `resolveGuildLocale` became
its default implementation `createGuildLocaleResolver({ service, registry, translator })` in
`discord/settings/guild-locale-resolver.ts`, injected as the optional `localeResolver` of the
command and component routers. Event handlers send no kernel reply, so no event path changed.

---

## Phase 9: User Story 9 — Configuration status (P2)

**Goal**: status + guard.
**Independent test**: S18.

- [X] T044 [P] [US9] Write failing tests then implement `service.status(declaration, guildId)` → `{ missing }` (required, no default, unset) in `packages/kernel/tests/settings/status.test.ts` and `packages/kernel/src/settings/status.ts`
- [X] T045 [US9] Write failing tests then implement `requireConfigured(declaration, service)` as a command `Guard` (from `packages/kernel/src/discord/command/guard.ts`) and the component-side check: blocked with the translated "not configured" message; missing field labels shown only to members with `ManageGuild`; passes immediately after the value is set, no restart — in `packages/kernel/tests/discord/settings/require-configured.test.ts` and `packages/kernel/src/discord/settings/require-configured.ts`

As built: `Guard` became `Guard<I = CommandInteraction>` and `check` receives the pipeline's
reply dependencies as an optional second argument, so `requireConfigured` (a
`Guard<BaseInteraction>`) words the missing labels in the `LocaleResolver`'s language. The
component side is a new optional `guard` on `ComponentHandler`, run by the same `passesGuard`
after `authorize`. Outside a guild the guard denies like `guildOnlyGuard`.

---

## Phase 10: User Story 5 — Suggestions (P3)

**Goal**: static, dynamic and guild suggestions; strict fields; Discord select.
**Independent test**: S9, S10.

- [X] T046 [US5] Write failing tests for `service.suggest` and `service.label`: static choices translated; dynamic search capped at 25; 3 s search (fake timers) → empty after 2.5 s + `logger.warn`; throwing search → empty + `logger.warn`; `ctx.values` passed through; channel/role/user fields use `GuildDirectory` with no author code; `Choice` type from `packages/kernel/src/settings/choice.ts` (moved in T013) reused — in `packages/kernel/tests/settings/suggest.test.ts` (S9)
- [X] T047 [US5] Implement suggestions in `packages/kernel/src/settings/suggest.ts` and strict checking in `packages/kernel/src/settings/validate.ts` (`label(value) !== undefined`, else exact match in `resolve(String(value))` → otherwise `unknownChoice`), with a strict-field case added to `packages/kernel/tests/settings/validate.test.ts` (S10)
- [X] T048 [US5] Extend the adapter for searchable fields: `choice` field with the first 25 results of `resolve("")`; non-strict fields also offer free text entry validated on save (FR-026a) — tests in `packages/kernel/tests/discord/components/settings-editor/from-declaration.test.ts`, code in `packages/kernel/src/discord/components/settings-editor/from-declaration.ts`

As built: `suggest`/`label` live in `src/settings/suggest.ts` behind the service; the 2.5 s race
is `timedSearch` (`src/settings/timed-search.ts`, global timers, cleared on settle). An
undeclared key throws `ValidationError`. A strict search that times out or throws rejects the
value (`unknownChoice`) and logs. `validateSettings` takes a `ValidationScope` (ports, requester,
lazy current values). On the Discord screen a non-strict searchable field is a two-control
modal: the select of the first 25 results, then an "Other value" text entry that replaces the
pick; a search yielding nothing falls back to a typed entry.

---

## Phase 11: User Story 6 — Evolve settings safely (P3)

**Goal**: lazy migration on read.
**Independent test**: S11.

- [X] T049 [US6] Write failing tests: stored v1 + v2 declaration adding a field → default for new field; stored v1 + v2 with `migrate` → migrated, validated, written once with `version: 2`, `revision + 1`; failing migration → storage unchanged, error logged, defaults for invalid fields; stored v3 + v2 declaration → never written, defaults for invalid fields; stored unknown field → ignored on read (dropping on write is covered by T027); `set` and `reset` on a stored v1 record with a v2 declaration migrate it first, then merge onto the migrated values (never onto the unmigrated ones) — in `packages/kernel/tests/settings/migrate.test.ts`
- [X] T050 [US6] Implement lazy migration in `packages/kernel/src/settings/migrate.ts` and call it from `get`, and before the merge in `set` and `reset` (today they merge onto unmigrated stored values), in `packages/kernel/src/settings/settings-service.ts` until T049 passes

---

## Phase 12: Polish & cross-cutting

- [X] T051 Create the public entry points `packages/kernel/src/settings/index.ts` and `packages/kernel/src/settings/testing/index.ts`, add the `./settings` and `./settings/testing` subpath exports to `packages/kernel/package.json`, and update `knip.json` entries
- [ ] T052 Add a test that builds the package and asserts no emitted `.d.ts` under `dist/settings` imports `zod`, and that `dependencies` contain only the allowed libraries, in `packages/kernel/tests/settings/public-surface.test.ts` (S14)
- [ ] T053 [P] Add a "Module settings" section to `packages/kernel/README.md`: declaring settings, reading, the Discord adapter, `describe`, system settings, implementing `SettingsStore` with `runSettingsStoreContract`
- [ ] T054 [P] Add a minor changeset describing the feature in `.changeset/`
- [ ] T055 Run the full gate (`pnpm typecheck`, `pnpm lint`, `pnpm knip`, `pnpm test`) with zero errors and zero warnings, and walk through every scenario of `quickstart.md`

---

## Dependencies & execution order

- **Setup (T001–T002)** → **Foundational (T003–T013)** → user stories.
- **US1 (T014–T023)** → **US2 (T024–T029)**: US2 needs the builders and service of US1.
- **US3 (T030–T033)** needs US2 (adapter saves through `service.set`).
- **US4 (T034–T035)** needs US1 only; can run in parallel with US2/US3.
- **US7 (T036–T041)** needs US2 (writes + notifier). **US8 (T042–T043)** needs T036. **US9 (T044–T045)** needs US1.
- **US5 (T046–T048)** needs US2; T048 also needs T032.
- **US6 (T049–T050)** needs US2.
- **Polish (T051–T055)** last.

## Parallel examples

- Foundational: T003, T005, T008, T009, T010, T011, T012, T013 together; T006 → T007 after T005.
- US1: T014, T015, T016 together; then T017 → T018 → T019; T020 and T023 in parallel.
- After MVP: US4 (T034–T035), US9 (T044–T045) and US3 (T030–T033) can run in parallel branches.
- US7: T036 and T037 together; T040 and T041 together after T038.

## Implementation strategy

1. **MVP** = Setup + Foundational + US1 + US2: declare, read typed, validate, write, in-memory
   store and contract suite. Usable by module code with no UI.
2. Add US3 + US4: Discord screen and description — the contract for the future HTTP/dashboard.
3. Add US7 + US8 + US9: per-guild module enablement, guild language, configuration status.
4. Add US5 + US6: suggestions and migrations.
5. Polish and release as a minor version.
