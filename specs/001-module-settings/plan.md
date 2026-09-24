# Implementation Plan: Module Settings — Declare Once, Render Everywhere

**Branch**: `001-module-settings` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-module-settings/spec.md`

## Summary

Modules declare their settings once with `defineSettings` and typed field builders backed
internally by Zod. From that declaration the kernel derives the typed read API, one shared
two-stage validator, a translated JSON Schema (draft 2020-12) description, suggestions (static,
dynamic, or built-in guild lookups), lazy schema migrations, configuration status, and a Discord
screen produced by an adapter onto the existing settings-editor. The kernel also ships its own
system settings (per-guild module enablement and guild language) with router gating. Storage,
guild lookups and change notification are ports with in-memory twins; a reusable store contract
suite is exported. Details: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript (strict, `noUncheckedIndexedAccess`), ESM, Node.js `>=22.12.0`

**Primary Dependencies**: `discord.js` ^14.27 (peer, used only in the `discord/` ring). New
runtime dependency: `zod` 4.6.5 (allowed pure library, hidden from public types). New dev
dependencies: `ajv` (meta-schema validation in tests), `@changesets/cli`.

**Storage**: `SettingsStore` port; in-memory implementation shipped; consumers implement it on
any database.

**Testing**: Vitest (`packages/kernel/tests/**/*.test.ts`, mirrors `packages/kernel/src/`), `expectTypeOf` for type-level tests.

**Target Platform**: Node.js library consumed by Discord bots (single process or sharded + API
process).

**Project Type**: library

**Performance Goals**: `get` adds no I/O beyond one `store.read`; suggestion budget 2.5 s.

**Constraints**: Discord limits — 25 choices/suggestions, 5 components per modal, 40 components
per card, 4000 characters per text input. Guild-scoped data only.

**Scale/Scope**: thousands of guilds per bot; tens of fields per module.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|---|---|---|
| I. Vendor-free core (2.0.0) | PASS | Only `zod` added — listed as an allowed pure library — and absent from public types (R1, R2). discord.js used only in the `discord/` ring. Pre-existing `node-cron` dependency noted in R13, out of scope. |
| II. Clean Architecture | PASS | `packages/kernel/src/settings/` has no discord.js import; guild data via `GuildDirectory` port (R3); adapter lives in `packages/kernel/src/discord/`. |
| III. Declare once, render everywhere | PASS | One compiled descriptor feeds validator, schema and adapter (R1). |
| IV. Multi-tenant by default | PASS | `guildId` in every call; optimistic concurrency (R4); lazy per-guild migration (R6); notifier port (R5). |
| V. Localised by construction | PASS | All texts are catalog keys; boot check (R8). Known limitation: `Locale` union is `en`/`fr`. |
| VI. Type safety at the boundary | PASS | Inferred `SettingsValues<D>` (R2); `patch: unknown` validated before use. |
| VII. Test-first with in-memory twins | PASS | In-memory store, guild directory, notifier; exported store contract suite. |
| VIII. Semver discipline | PASS | Additive → minor bump; changesets added (R13). |

Post-design re-check: PASS — the contracts in `contracts/` introduce no violation.

## Project Structure

### Documentation (this feature)

```text
specs/001-module-settings/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── public-api.md
│   └── settings-schema.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks output
```

### Source Code (repository root)

```text
packages/kernel/src/
├── settings/                         # new — no discord.js import
│   ├── index.ts                      # public exports (subpath ./settings)
│   ├── define-settings.ts            # defineSettings + declaration-time checks
│   ├── fields/
│   │   ├── field.ts                  # field model: Field, FieldSpec, options, limits (no Zod)
│   │   ├── builders.ts               # the `field` builders
│   │   └── zod-schema.ts             # the only Zod importer: schemas, issue mapping, parseFieldValue
│   ├── types.ts                      # SettingsValues, SurfaceValues, inference helpers
│   ├── duration.ts                   # duration parser (R11)
│   ├── validate.ts                   # shared validator → SettingsIssue[]
│   ├── settings-validation-error.ts  # SettingsValidationError (extends ValidationError)
│   ├── registry.ts                   # createSettingsRegistry (duplicate ids, English keys)
│   ├── settings-service.ts           # get / getForSurface / validate / set / reset / label
│   ├── suggest.ts                    # static, dynamic, guild suggestions (cap, timeout)
│   ├── migrate.ts                    # lazy migration (R6)
│   ├── describe.ts                   # JSON Schema output via z.toJSONSchema (R9)
│   ├── cache.ts                      # read cache + notifier invalidation (R15)
│   ├── status.ts                     # configuration status (R17)
│   ├── system/
│   │   ├── kernel-settings.ts        # kernel declaration: modules + locale (R14)
│   │   └── module-gate.ts            # ModuleGate over the service (R14)
│   ├── ports/
│   │   ├── settings-store.ts
│   │   ├── guild-directory.ts
│   │   └── settings-changed-notifier.ts
│   ├── in-memory/
│   │   ├── in-memory-settings-store.ts
│   │   ├── in-memory-guild-directory.ts
│   │   └── in-process-notifier.ts
│   └── testing/
│       ├── index.ts                  # subpath ./settings/testing
│       └── settings-store-contract.ts
├── discord/
│   ├── settings/
│   │   ├── discord-guild-directory.ts          # GuildDirectory over discord.js
│   │   ├── require-configured.ts               # command guard + component check (R17)
│   │   └── resolve-guild-locale.ts             # FR-038 order (R16)
│   ├── command/ components/ events/            # routers accept an optional ModuleGate (R14)
│   └── components/settings-editor/
│       └── from-declaration.ts                 # settingsEditorFromDeclaration (R10)
├── color.ts                          # vendor-neutral colour parser: hex + base names
├── i18n/catalog.ts                   # + TranslationRegistry.has(key)
└── module/module.ts                  # + BotModule.settings?

packages/kernel/tests/
├── settings/                         # mirrors packages/kernel/src/settings
└── discord/components/settings-editor/from-declaration.test.ts
```

`packages/kernel/package.json` exports gain `./settings` and `./settings/testing`. `.changeset/` is added.

**Structure Decision**: single library project, following the kernel's existing domain-folder
layout (`packages/kernel/src/<domain>/`, kebab-case files, tests mirrored under `packages/kernel/tests/`). The settings domain is
vendor-free; the two Discord-specific pieces sit in the existing `discord/` ring. Zod stays
behind `settings/fields/zod-schema.ts`: no other module imports it and no exported signature
names a Zod type.

## Delivery order (maps to user stories)

1. Foundations: ports, in-memory twins, `TranslationRegistry.has`, changesets.
2. US1 + US2 (P1): builders, inference, validator, registry, service `get`/`set`/`validate`/`reset`,
   notifier, store contract suite.
3. US3 + US4 (P2): Discord adapter + `createDiscordGuildDirectory`; `describe`.
4. US7 + US8 + US9 (P2): kernel system settings, read cache, router gating, guild language,
   configuration status and guard.
5. US5 + US6 (P3): suggestions; migrations.
6. Docs: README section, changeset.

## Complexity Tracking

No constitution violation introduced by this feature. Pre-existing items (R13) are tracked for
the bootstrap/lifecycle feature.
