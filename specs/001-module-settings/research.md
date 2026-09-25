# Research: Module Settings

Findings from the existing kernel code and the design decisions they lead to. References point
to the kernel as of 2026-09-23.

## R1. Validation with Zod, hidden behind field builders

- **Decision**: Zod `4.6.5` (latest on npm, 2026-09-23) as a regular dependency, allowed by
  constitution 2.0.0 (Principle I). Each `field.*` builder produces a kernel descriptor that
  holds an internal Zod schema. Zod types never appear in exported types; the public API is the
  Discord-aware builders.
- **Two-stage validation**: stage 1 — the module's Zod object schema (kind, bounds, lengths,
  list sizes, duplicates, enum membership). Stage 2 — kernel checks that need I/O: guild entities
  through `GuildDirectory` (existence, channel type) and strict suggestions. Stage 2 runs only on
  fields that passed stage 1.
- **Error mapping**: Zod issues are mapped to `SettingsIssue` (`code` + catalog key + params);
  Zod's own messages are never shown.
- **Rationale**: mature validation, inference and JSON Schema generation replace the most
  error-prone hand-written code, while builders keep the Discord-specific semantics and keep
  Zod replaceable.
- **Alternatives considered**: hand-written validator (more code and risk); Zod exposed as a
  peer dependency with `field.custom(zodSchema)` (couples consumers to Zod's version; can be added
  later, which would make Zod a peer dependency).

## R2. Type inference from the declaration

- **Decision**: field builders carry the value type as a phantom type (derived internally from
  `z.output` of the field's schema). `SettingsValues<D>` maps each field to `T` when it is
  required or has a default, and to `T | undefined` otherwise. `defineSettings` uses a `const`
  type parameter so keys and enum values stay literal.
- **Rationale**: FR-006 and SC-001 (no hand-written types). The kernel already uses `const`
  generics for modals (`createModal<const F extends ModalFields>`, `src/discord/interaction/modal.ts:442`).
- **Alternatives considered**: exposing `z.infer` directly (leaks Zod into public types).

## R3. Guild-aware validation and built-in suggestions

- **Decision**: a new `GuildDirectory` port answers "does this channel/role/user exist in this
  guild, and what is its type/name?" and lists channels/roles/members for suggestions. The
  kernel ships a discord.js implementation (in the `discord/` ring) and an in-memory twin.
- **Rationale**: FR-010 (channel-type filter), FR-025 (built-in suggestions) and the "deleted
  channel" edge case need guild data, but settings logic must not import discord.js
  (Principle II). The future HTTP API will implement the same port over Discord REST.
- **Alternatives considered**: validating only the snowflake shape (misses the type filter and
  deleted entities).

## R4. Storage port and concurrent writers

- **Decision**: `SettingsStore` has `read(guildId, moduleId)` and
  `write(record, { expectedRevision })`. Each record carries a monotonically increasing
  `revision`. A write whose `expectedRevision` does not match fails with the existing
  `ConflictError` (`src/errors/business-error.ts:32-49`).
- **Rationale**: Principle IV — a Discord shard and a separate API process can write the same
  guild's settings. Optimistic concurrency works on any database (a version column or field).
- **Alternatives considered**: last-write-wins (silent loss of an admin's change); per-field
  patch semantics in the port (harder to implement on every database).

## R5. Change notification

- **Decision**: `SettingsChangedNotifier` port with `notify(event)` and `subscribe(listener)`.
  Default `createInProcessNotifier()`. Distributed delivery is the event-bus feature.
- **Rationale**: FR-013, FR-033.

## R6. Migrations

- **Decision**: lazy migration on read. When `stored.version < declaration.version`, run
  `migrate(fromVersion, rawValues)`, validate the result, and write it back with the stored
  revision. On validation failure, leave storage untouched, log an error, and return defaults for
  the invalid fields. When `stored.version > declaration.version`, never write (FR-019) and
  return defaults for fields whose stored values do not validate.
- **Rationale**: no boot-time batch job over every guild (public bots can have thousands), and it
  works per shard.
- **Alternatives considered**: eager migration at boot (slow startup, cross-shard coordination).

## R7. Suggestions (autocomplete)

- **Decision**: reuse `Choice` (`{ name, value }`, today in `src/discord/command/options.ts:79-82`, a file that imports discord.js). Move it to the vendor-free `src/settings/choice.ts` and re-export it from `options.ts`, so the settings domain never depends on discord.js (constitution II). A
  suggestion's `name` is the label already translated for the requester's locale. The kernel
  caps results at 25 (Discord's limit is not enforced by the kernel today) and races dynamic
  searches against a 2.5 s timer; timeout or error → empty list + `logger.warn`.
- **Strict check**: on write, a strict field's value must satisfy `label(value) !== undefined`;
  when `label` is absent, the kernel calls `resolve(String(value))` and requires an exact value
  match.
- **Rationale**: FR-021 to FR-026.

## R8. Localisation

- **Findings**: catalogs are `Record<string, { en: string; fr?: string }>`
  (`src/i18n/catalog.ts:9-12`); `Locale` is the closed union `"en" | "fr"`
  (`src/i18n/locale.ts:8`); `resolveLocale(candidates, defaultLocale)` exists
  (`src/i18n/locale.ts:30-41`); the translator falls back `entry[locale] ?? entry[default] ?? entry.en`.
- **Decision**: every text in a declaration is a catalog key. `describe(def, locale)` accepts any
  string and resolves it with `resolveLocale`, so unknown locales fall back to English
  (SC-003). The boot check for FR-028 needs a key lookup: add `has(key): boolean` to
  `TranslationRegistry` (additive change).
- **Known limitation**: `Locale` only allows `en` and `fr`. Public bots will need more languages;
  widening `Locale` is a separate change and does not affect this feature's design.

## R9. JSON Schema output

- **Generation**: `z.toJSONSchema(schema, { target: "draft-2020-12", override })`. Translated
  `title`/`description`/`examples` come from the descriptor at describe time (not from Zod's
  global registry, which is process-wide and locale-agnostic); the `override` callback adds the
  `x-kernel` keyword and strips `default`/`examples` from secrets.
- **Decision**: draft 2020-12, one object schema per module. Standard annotations: `title`,
  `description`, `default`, `examples`, `writeOnly`, `minimum`/`maximum`,
  `minLength`/`maxLength`, `minItems`/`maxItems`, `uniqueItems`. Labelled choices use
  `oneOf: [{ const, title }]`. Kernel-specific data goes under an `x-kernel` keyword (unknown
  keywords are allowed and ignored by standard validators).
- **Secret fields**: `writeOnly: true`, and no `default`, `examples` or value.
- **Rationale**: FR-030, FR-031; any JSON Schema form library can render the standard part.

## R10. Discord screen through the existing settings-editor

- **Findings**: `mountSettingsEditor(options)` takes `fields`, `currentValue(S, F)`,
  `save(S, F, submission)`, `saveGroup?`, `reset(S)`, `translator`, `locale`, `clock`, `logger`
  (`src/discord/components/settings-editor/mount-settings-editor.ts:70-178`). Field kinds:
  `text`, `image`, `level`, `role`, `category`, `user`, `channel`, `choice`, `group`
  (`settings-editor-fields.ts:15-23`). A group modal holds at most 5 components
  (`settings-editor-fields.ts:267`).
- **Decision**: `settingsEditorFromDeclaration(declaration, service, context)` resolves to the
  `fields`, `levels`, `initial`, `currentValue`, `save`, `saveGroup` and `reset` options.
  The adapter honours field `ui.order`, group `order` and `ui.groupOrder`, with the same ranking
  as `describeSettings` (`src/settings/field-order.ts`).
  Mapping:

  | Declaration kind | settings-editor kind | Notes |
  |---|---|---|
  | text, integer, number, duration, color | `text` | parsed and validated on save by the shared validator |
  | secret | `text` | `currentValue` shows "set" / "not set", never the value |
  | boolean | `choice` | two translated options |
  | enum | `choice` | static options (≤ 25 enforced at declaration) |
  | searchable text | `choice` | first 25 results of `resolve("")`; non-strict adds free text entry (FR-026a) |
  | role, user | `role`, `user` | list variants use `minValues`/`maxValues` |
  | list of enum values | `choice` | bounded by the list's `minItems`/`maxItems` |
  | list of integers, list of texts | `text` | one item per line; lines trimmed, empty lines dropped; no item clears |
  | toggles | `choice` | one select listing the declared keys with their `keyLabels`; more than 25 keys are split into selects of at most 25, each saved into the full record |
  | channel | `channel` or `category` | `category` when the type filter is only categories |
  | group | `group` | split into chunks of 5 fields to respect the modal limit; a group save writes only the members changed from their prefill |

- **Rationale**: spec decision "Discord screen strategy" — no rewrite, existing users unaffected.
- **Risk**: modules with many fields may exceed the editor card's component limit
  (`MAX_CARD_COMPONENTS = 40`, `src/discord/ui/card.ts:16`). Mitigation: the adapter nests groups
  as editor levels when the flat list would exceed the limit, and a test covers a 40+ field
  declaration.

## R11. Durations

- **Decision**: add a small duration parser to the settings feature: `"90s"`, `"15m"`, `"2h"`,
  `"7d"`, combinations such as `"1h30m"`, stored as whole seconds. No existing helper in the
  kernel (`src/datetime.ts` covers dates only).

## R12. Contract test suite without a test-runner dependency

- **Decision**: export `runSettingsStoreContract(createStore, { describe, it, expect })` from a
  `./settings/testing` subpath. The consumer passes its own test runner's functions, so the
  kernel does not depend on Vitest at runtime.
- **Rationale**: FR-015, SC-007, Principle VII.

## R14. System settings and module gating

- **Decision**: the kernel ships a `kernelSettings` declaration (id `kernel`) with a
  `modules` field (record of module name → boolean, defaults from each module's
  `defaultEnabled`, itself defaulting to `true`) and a `locale` field (enum of supported
  locales, optional). It is registered automatically by `createSettingsRegistry`.
- **Gating**: a `ModuleGate` (`isEnabled(moduleName, guildId)`) backed by the settings service.
  The command, component and event routers receive it optionally and check it before running a
  handler that belongs to a module and has a guild. Scheduled jobs call it themselves (FR-036).
- **Rationale**: same declaration mechanism for system and module settings (FR-039); routers
  already know which module registered each handler at composition time.

## R15. Read cache

- **Decision**: the settings service keeps an in-process cache of decoded settings per
  `(guildId, moduleId)`, invalidated by its own writes and by `SettingsChangedNotifier`
  subscriptions. Gating (R14) reads settings on every guild interaction, so an uncached read
  would hit the store for every command.
- **Multi-process**: correctness across processes depends on the notifier delivering events from
  other processes (event-bus feature). Until then, the in-process notifier is correct for
  single-process bots; the cache has a bounded TTL (default 60 s) as a safety net.

## R16. Language resolution

- **Decision**: for bot messages, call the existing `resolveLocale` with the candidates
  `[interaction.locale, guildSetting.locale, interaction.guildLocale]` and English as default
  (FR-038). The kernel's reply paths get the guild setting from the settings service (cached).

## R17. "Needs configuration" guard

- **Decision**: `service.status(declaration, guildId)` returns unset required fields.
  `requireConfigured(declaration)` is a kernel `Guard` (existing command guard type) and a
  component-side equivalent. Until the permissions feature exists, "members allowed to configure"
  (who see the missing field names) means members with the Discord `ManageGuild` permission.

## R13. Pre-existing constitution findings (not introduced by this feature)

- The core package has a runtime dependency on `node-cron` (`package.json`). Under
  constitution 2.0.0 it is still not an allowed pure library (it drives timers and is not listed).
  It belongs to the scheduler and is left to the bootstrap/lifecycle feature.
- No changesets setup exists although Principle VIII requires it. This feature adds the
  changesets tooling (development dependency only) so that its own release note can be recorded.
