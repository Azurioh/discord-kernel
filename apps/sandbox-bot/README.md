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

Settings are written to `apps/sandbox-bot/.data/settings.json` (gitignored);
set `SETTINGS_FILE` to use another path.

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
