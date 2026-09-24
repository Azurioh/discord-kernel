# sandbox-bot

A private bot (never published) to exercise `@azurioh/discord-kernel` by hand on
a test guild. It consumes the kernel like any other bot would: through the
package's public subpaths, resolved to its built `dist/`.

## Setup

1. In the [Discord developer portal](https://discord.com/developers/applications),
   create an application, then on its **Bot** page reset and copy the token. No
   privileged intent is needed.
2. Invite the bot to your test guild: **OAuth2 → URL Generator**, scopes `bot` and
   `applications.commands`, open the generated URL.
3. Fill in the environment:

   ```bash
   cp apps/sandbox-bot/.env.example apps/sandbox-bot/.env
   ```

   `DISCORD_TOKEN_DEV`, `DISCORD_CLIENT_ID_DEV` (the application ID) and
   `DISCORD_GUILD_ID_DEV` (right-click the server → *Copy Server ID*, developer
   mode on). `.env` is gitignored.
4. Register the commands on the test guild (instant, no global propagation), then
   start the bot:

   ```bash
   pnpm --filter sandbox-bot register
   pnpm --filter sandbox-bot dev
   ```

Both scripts build the kernel first, so a kernel change is picked up on the next
run. `pnpm --filter sandbox-bot dev:watch` restarts the bot when a file of the
app changes; after a kernel change, stop it and run `dev` again (or run
`pnpm --filter @azurioh/discord-kernel build` in another terminal). Re-run
`register` whenever a command's name, options or descriptions change.

Logs are JSON lines from [pino](https://getpino.io), one per record. The
`dev`, `dev:watch` and `register` scripts pipe them through `pino-pretty` for
a readable terminal; run `tsx src/main.ts` directly (or pipe it elsewhere) to
get the raw JSON. With the pipe, the script's exit code is `pino-pretty`'s, so
read the last log line rather than `$?` when a start fails.

Settings are written to `apps/sandbox-bot/.data/settings.json` (gitignored);
set `SETTINGS_FILE` to use another path.

## Project layout

Every piece of a module has one predictable place, so a real bot built on the
kernel can follow the same map:

```
src/shared/                   # what the whole app uses: logging, i18n helpers, presenter
src/modules/<module>/
  <module>-module.ts          # the BotModule: commands, events, catalog, settings
  i18n/
    <module>-messages.ts      # *_MESSAGES: the catalog keys, the only way code names them
    <module>-catalog.ts       # the English/French wording, typed over those keys
  settings/<module>-settings.ts   # defineSettings(...), when the module has settings
  commands/
    <name>/                   # a command without subcommands
      <name>.command.ts
      <name>.options.ts
      <name>.handler.ts
      <name>.autocomplete.ts
    <name>/                   # a command with subcommands
      <name>.command.ts
      <sub>/
        <sub>.definition.ts
        <sub>.options.ts
        <sub>.handler.ts
        <sub>.autocomplete.ts
      shared/                 # only what two or more subcommands use
  shared/                     # only what two or more commands of the module use
  events/<group>/
    <event>.event.ts
    <event>.handler.ts
  components/                 # buttons, menus and modals, when the module has any
```

| Suffix | Holds |
| ------ | ----- |
| `.command.ts` | `createCommand(...)`: name, description, guards, deployment; wires the options and handler, or lists the subcommands |
| `.definition.ts` | `createSubCommand(...)`: one subcommand's description, wired to its options and handler |
| `.options.ts` | The option schema, and its `*Options` type the handler reads |
| `.handler.ts` | What runs once the guards passed |
| `.autocomplete.ts` | The `AutocompleteResolver` of an option |
| `.event.ts` | `createEvent(...)`: the gateway event name and `once`, wired to its handler |
| `-messages.ts` / `-catalog.ts` | The catalog keys, and their wording |

Only the files a command needs exist: `/ping` has no options file, `/config
show` no options nor autocomplete. Tests mirror this tree under `tests/`.

Anything two users need — an autocomplete, an option, a type, a helper — exists
once, in the `shared/` folder of the smallest level that holds both users:

| Used by | Lives in |
| ------- | -------- |
| one subcommand | that subcommand's folder (`set/parse-value-input.ts`) |
| two or more subcommands of one command | `commands/<cmd>/shared/` (`config/shared/setting-key.options.ts`, used by `set` and `reset`) |
| two or more commands of one module | `modules/<module>/shared/` |
| two or more modules | `src/shared/` |

A shared file keeps the suffix of its role (`setting-key.autocomplete.ts`), and
moves to the wider level as soon as a second user appears, never earlier. Imports
never form a cycle (`noImportCycles` in `biome.jsonc`): when two files need each
other, what they share moves into a third.

## Commands

| Command | What it exercises |
| ------- | ----------------- |
| `/ping` | A flat command replying through the presenter |
| `/roll [sides]` | A typed integer option behind a per-user cooldown guard (10 s) |
| `/pages` | The collector-backed paginator (42 items, 5 per page) |
| `/config show` | `getForSurface`: every demo setting, secrets shown as set or not set |
| `/config set key value` | `set`: `key` autocompletes from the declaration; `value` is JSON when it parses, text otherwise; issues are shown translated |
| `/config reset key` | `reset` of one key, or `all` |

`/config` is guild-only and needs *Manage Server*, both as a visibility filter and
as a guard. Values to try with `/config set`:

| Key | Value |
| --- | ----- |
| `logChannel` | a text channel ID, e.g. `123456789012345678` (a voice channel is rejected) |
| `staffRole` | a role ID |
| `accent` | `#ff8800` |
| `cooldown` | `120` (seconds, 5 to 3600) |
| `mode` | `strict` or `relaxed` |
| `maxWarnings` | `5` (1 to 10) |
| `features` | `{"logs":true}` |
| `apiKey` | any text; never shown back |
| `pingRoles` | `["123456789012345678"]` (IDs quoted inside a JSON list) |

The bot also logs when it is ready, when it joins a guild and every settings
change. Your Discord client language (English or French) picks the reply
language.
