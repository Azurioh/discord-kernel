---
"@azurioh/discord-kernel": major
---

Module settings, and a cleaner public surface.

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
