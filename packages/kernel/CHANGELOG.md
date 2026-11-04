# @azurioh/discord-kernel

## 2.0.0

### Major Changes

- a2e918e: `InteractiveMessagePayload` moved to its own module, to break an import cycle between the interactive message collector and `toMessageEditOptions`.
  
  ## Breaking change: migration
  
  | Symbol | Old import | New import |
  |---|---|---|
  | `InteractiveMessagePayload` (type) | `@azurioh/discord-kernel/discord/components/interactive-message/interactive-message-collector` | `@azurioh/discord-kernel/discord/components/interactive-message/interactive-message-payload` (still exported by `.../interactive-message`) |
  
  The type itself is unchanged, so changing the import is the whole migration.

### Minor Changes

- ad1b5a7: Create a bot from static or service-aware modules with shared settings, translation,
  presentation, guild gating, command/component/event routing and autocomplete. Deploy
  slash and context-menu commands through an injectable transport without starting the bot.
  
  New public subpaths: `bot/create-bot`, `bot/assemble-modules`, `bot/bot-errors`,
  `module/module-context`, `discord/command/command-deploy-rest` and
  `discord/command/in-memory-deploy-rest`. Existing settings entry points stay unchanged.
- aeb0c78: Start bots in order: connect databases, migrate, await gateway readiness, set up
  modules and schedule their jobs. Expose lifecycle state and an idempotent `stop()`
  that tears down ready modules, closes resources and flushes within one shutdown
  budget, returning a complete `StopReport`.
  
  Handle signals and crashes through an injectable `ProcessLike` port and its
  in-memory twin. Track module availability independently of guild toggles; failed
  optional setup disables every owned handler and job. Localize unavailable-module
  and restarting replies with the new `core.lifecycle.*` catalog keys.
  
  Stopping during startup prevents remaining startup steps and job registration;
  the interrupted `start()` resolves after cleanup. Ordinary startup failures still
  reject with the original error after cleanup. Existing public subpaths remain
  available; new lifecycle and availability modules have explicit public subpaths,
  including `bot/bot-lifecycle-options`.
- 1b25a43: An in-memory twin for every port, contract suites for the stateful ones, and a default presenter.
  
  Every port interface is now tagged `@port` in its JSDoc, and a test fails when a tagged port has no twin. Twins are plain code (no test framework import), so a bot's tests use them with any runner, and a bot that needs no persistence can run on them.
  
  ## New public subpaths
  
  | Subpath | Exports |
  |---|---|
  | `@azurioh/discord-kernel/in-memory-logger` | `createInMemoryLogger`, `InMemoryLogger`, `LogEntry`: every entry kept, children append to the same `entries` |
  | `@azurioh/discord-kernel/authz/in-memory-authorizer` | `createInMemoryAuthorizer(initial?)` |
  | `@azurioh/discord-kernel/authz/testing` | `runAuthorizerContract(name, factory, { describe, it, expect })` |
  | `@azurioh/discord-kernel/persistence/migration-runner` | the `MigrationRunner` port, `Migration`, `MigrationReport` |
  | `@azurioh/discord-kernel/persistence/in-memory-migration-runner` | `createInMemoryMigrationRunner(migrations)` |
  | `@azurioh/discord-kernel/persistence/testing` | `runMigrationRunnerContract(name, factory, { describe, it, expect })` |
  | `@azurioh/discord-kernel/persistence/in-memory-database` | `createInMemoryDatabase(driver?)`, `InMemoryDatabase` (`connected`, `connectCount`, `closeCount`, `failOnConnect`) |
  | `@azurioh/discord-kernel/scheduler/in-memory-scheduler` | `createInMemoryScheduler(logger?)`, `InMemoryScheduler` (`jobs`, `run(name)`): same validation and logs as `CronScheduler`, nothing runs by timer |
  | `@azurioh/discord-kernel/discord/default-presenter` | `createDefaultPresenter(translator)`: titles from `CORE_MESSAGES`, colours from `EMBED_COLORS`, incident footer |
  | `@azurioh/discord-kernel/discord/in-memory-channel-exporter` | `createInMemoryChannelExporter(outcome?)`, `InMemoryChannelExporter` (`exports`) |
  | `@azurioh/discord-kernel/discord/interaction/fixed-locale-resolver` | `createFixedLocaleResolver(locale)` |
  | `@azurioh/discord-kernel/testing/contract-runner` | `DescribeFn`, `ItFn`, `ExpectFn`, `ContractAssertion`, shared by every contract suite |
  
  Also added:
  
  - `@azurioh/discord-kernel/settings` exports `createInMemoryModuleGate(disabled?)` and `InMemoryModuleGate` (`disable`, `enable`), the twin of `ModuleGate`.
  - `@azurioh/discord-kernel/scheduler/errors` exports `UnknownJobError`, thrown by `InMemoryScheduler.run` for a name no job carries.
  
  No symbol moved: `@azurioh/discord-kernel/settings/testing` still exports `DescribeFn`, `ItFn`, `ExpectFn` and `ContractAssertion`.
- 778d2ef: Add `promptModal`, `PromptableModal`, `ModalPromptResult`, and the five-minute
  `MODAL_PROMPT_TIMEOUT_MS` default at `discord/interaction/prompt-modal`, plus
  `ModalPromptError` at `discord/interaction/prompt-modal-errors`. Modal prompts
  isolate concurrent openings and members, return dismissed on collector timeout,
  and propagate other errors.
  
  The settings editor now uses the shared prompt and logs modal show/collect
  failures with the field or group key instead of silently swallowing them.
  Members still see the unchanged screen on failure; timeouts remain unlogged.

## 1.0.0

### Major Changes

- 114b795: Module settings, and a cleaner public surface.
  
  This is a **major** release: a few symbols published in 0.1.0 moved to their own module (or were removed), so their old deep import paths no longer resolve them. Every module path of 0.1.0 still exists; only the symbols below moved. Each move keeps the same signature, so changing the import is the whole migration.
  
  ## Breaking changes: migration
  
  | Symbol | Old import (0.1.0) | New import |
  |---|---|---|
  | `Choice` (type) | `@azurioh/discord-kernel/discord/command/options` | `@azurioh/discord-kernel/settings` |
  | `allRequired` | `@azurioh/discord-kernel/discord/command/options` | `@azurioh/discord-kernel/discord/command/all-required` |
  | `sendEmbed` | `@azurioh/discord-kernel/discord/command/context` | `@azurioh/discord-kernel/discord/command/send-embed` (now accepts any `CommandInteraction`) |
  | `routeKey` | `@azurioh/discord-kernel/discord/command/create-command` | `@azurioh/discord-kernel/discord/command/route-key` |
  | `openToAnyone`, `requiresPermissions`, `checkedByHandler` | `@azurioh/discord-kernel/discord/components/component-router` | `@azurioh/discord-kernel/discord/components/component-access` |
  | `createComponentHandler` | `@azurioh/discord-kernel/discord/components/component-router` | **removed**: it returned its argument unchanged. Pass the object directly, or write `{ ... } satisfies ComponentHandler` |
  | `toMessageEditOptions` | `@azurioh/discord-kernel/discord/components/interactive-message/interactive-message-collector` | `@azurioh/discord-kernel/discord/components/interactive-message/message-edit-options` (still exported by `.../interactive-message`) |
  | `createStateStore`, `StateStore` | `@azurioh/discord-kernel/discord/components/interactive-message/interactive-message-collector` | `@azurioh/discord-kernel/discord/components/interactive-message/state-store` (still exported by `.../interactive-message`) |
  | `textFieldValue`, `pickedFieldValue` | `@azurioh/discord-kernel/discord/components/settings-editor/settings-editor-fields` | `@azurioh/discord-kernel/discord/components/settings-editor/settings-editor-field-values` (still exported by `.../settings-editor`) |
  | `COLOR_ALIASES`, `MAX_COLOR_INPUT_LENGTH`, `registerColorAliases` | `@azurioh/discord-kernel/discord/ui/color-input` | `@azurioh/discord-kernel/discord/ui/color-aliases` |
  | `DISCORD_BLURPLE` | `@azurioh/discord-kernel/discord/ui/colors` | `@azurioh/discord-kernel/color` |
  
  Also note:
  
  - `package.json` `exports` now lists every public subpath explicitly instead of the `./*` wildcard. Every path published by 0.1.0 is still listed; a file that was never part of the API (a new internal module) is no longer importable.
  - `CORE_CATALOG` is typed as a `KeyedCatalog` of its own keys instead of the open `Catalog` type. It is still assignable to `Catalog`; only indexing it with an arbitrary string now needs a widening (`const catalog: Catalog = CORE_CATALOG`).
  
  ## Added
  
  - **Module settings** (`@azurioh/discord-kernel/settings`): declare a module's per-guild settings once with `defineSettings` and the `field.*` builders (`text`, `integer`, `number`, `boolean`, `enum`, `color`, `duration`, `channel`, `role`, `user`, `secret`, `list`, `toggles`), with values typed from the declaration.
  - **`SettingsService`** (`createSettingsService`): cached `get` with defaults, `getForSurface` (secrets reported as set or not, never revealed), `validate`, all-or-nothing `set` with every issue reported and optimistic concurrency (`ConflictError`), `reset`, a `settings.changed` notification on every write, and a registry that fails the boot on a duplicate id or an untranslated key.
  - **Discord settings screen**: `settingsEditorFromDeclaration` turns a declaration into `mountSettingsEditor` options, one control per field kind, within Discord's modal and card limits, saving through the service.
  - **`describe`**: a module's settings as a translated JSON Schema (draft 2020-12) for other surfaces such as a web dashboard.
  - **Suggestions**: `service.suggest` and `service.label` for static choices, dynamic searches (25 results, 2.5 s budget) and guild channels, roles and members, shared by autocomplete and the settings screen. **Strict** fields refuse a value their search does not know.
  - **Migrations**: a declaration's `version` and pure `migrate`, applied lazily on read and written back once; a failing migration or a record from a newer version is never overwritten.
  - **Storage port**: `SettingsStore` with an in-memory twin, and `runSettingsStoreContract` (`@azurioh/discord-kernel/settings/testing`), the runner-agnostic suite any database adapter must pass. `GuildDirectory` port with a discord.js implementation (`./discord/settings/discord-guild-directory`).
  - **System settings**: the kernel's own declaration (`registry.kernel`) with per-guild module toggles (`defaultEnabled` on `BotModule`) and the guild language.
  - **`ModuleGate`** (`createModuleGate`): routers (`CommandRouter`, `ComponentRouter`, `EventRouter`) skip a module disabled on a guild, with a translated reply; register handlers with their module name to gate them.
  - **`LocaleResolver`** port (`./discord/interaction/locale-resolver`) and `createGuildLocaleResolver` (`./discord/settings/guild-locale-resolver`): every kernel reply follows the member's locale, then the guild's language setting, then the guild's Discord locale.
  - **`requireConfigured`** (`./discord/settings/require-configured`): a guard that blocks a command or component until its module's required settings are set, telling administrators which ones are missing; `service.status` reports them.
  - `BotModule` gains optional `settings`, `label` and `defaultEnabled`; guards can be typed over any interaction (`Guard<I>`) and receive the runtime; components accept a `guard`.
