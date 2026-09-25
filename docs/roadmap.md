# discord-kernel roadmap

Vision, target architecture and the planned feature specs, with the decisions already taken and
the questions still open. Written on 2026-09-23 from the design discussion that produced
constitution v2.0.0 and `specs/001-module-settings`. Every future `/speckit-brainstorm` starts
from this file; update it when a decision changes.

## Vision

- One architecture for every Discord bot the author builds: small single-guild bots (e.g. the
  BSK association bot) and **public, sharded, multi-guild bots**. Designs are judged against the
  public case; the single-process bot is its degenerate case.
- The kernel is the **innermost ring**: it knows `discord.js` (peer dependency) and pure,
  ecosystem-standard libraries hidden from public types (today: `zod`). No database, HTTP
  library, logger implementation, bus or cache vendor. Everything else is a port.
- Modules are vertical slices. Their capabilities that users configure are **declared once as
  data** and rendered by every surface (Discord, HTTP API, web dashboard).
- Every guild configures the bot independently: settings, enabled modules and language are
  guild-scoped, with defaults.
- **Default configuration, overridable per guild and per bot.** Every value the kernel itself
  uses when it replies or renders is read through a **per-guild resolver port** with a default
  implementation built from the bot's configuration; a bot or a module can supply its own. The
  kernel never reads such a value from a global or hard-wires a settings lookup into a reply
  path. First instance: the reply language (`LocaleResolver`, default
  `createGuildLocaleResolver`). Next candidate: embed colours, to be done with the `View` and
  `createBot` specs (a colour resolver the presenter reads); `brandColor` is **not** added to
  the kernel's settings declaration.

## Target architecture

### Repositories

| Repository | Content |
|---|---|
| `discord-kernel` (this repo) | pnpm monorepo of libraries, versioned with changesets |
| Web dashboard (new repo) | Application that reads `/manifest` and renders settings forms |
| Each bot (e.g. `bsk-apps`, a future public bot) | Composition root, database adapters, config, business modules |

### Packages of this monorepo

| Package | Content | Dependencies |
|---|---|---|
| `@azurioh/discord-kernel` | Command DSL, routers, i18n, errors, ports, `View`, settings, `EventBus` port + in-memory | `discord.js` (peer), allowed pure libraries |
| `@azurioh/discord-kernel-http` | Settings API: manifest, settings CRUD, suggestions, OAuth2, Discord REST cache | an HTTP library |
| `@azurioh/discord-kernel-bus-redis` | Distributed `EventBus` (later maybe `-bus-postgres`) | Redis client |
| `@azurioh/discord-kernel-pino` | Logger adapter, optional Sentry, secret scrubbing | pino, Sentry |

No official database adapter at first: each bot implements `SettingsStore`, `PermissionStore`,
`MigrationRunner` on its own database. A shared adapter package appears only when two bots use
the same driver, and it is never a dependency of the core.

### Deployment topology

```
gateway (N shards) ──┐
                     ├── database (port, any driver)
api (-http) ─────────┤
                     └── bus (Redis / Postgres / in-memory)
web (dashboard, reads /manifest)
```

- Default for public bots: gateway and API are **separate processes** (sharding, independent
  availability and scaling).
- Small bots: gateway + API + in-memory bus in **one process**, same code.
- The API calls module use cases, never the gateway client. It reads Discord data over REST with
  the bot token; the rate limit is shared with the shards, so the API caches.
- Shards filter bus messages for their own guilds: `(guildId >> 22) % shardCount`.

## Feature specs

Status legend: **Specified** (spec + plan + tasks exist), **Decided** (design agreed, no spec
yet), **Idea** (to brainstorm).

### 0. Monorepo conversion — Decided

- Convert the repo to a pnpm workspace (`packages/kernel`, then sibling packages), with
  changesets. Pure restructuring; no spec needed.

### 1. Rendering: `View` V1/V2 — Decided

- Today: V1 covered (`buildEmbed`, action rows, buttons, the four selects). V2 partial:
  `createCard` (single container: Container, Section, TextDisplay, Separator, MediaGallery,
  Thumbnail) and V2 modals (Label, FileUpload, checkbox, role/user/channel selects).
  `IsComponentsV2` is set only in `interactive-message`.
- Decisions:
  - One `View` type: either V1 `{ embeds, rows }` or V2 `{ components }`. Every send path
    (reply, edit, followUp, paginator, `Presenter`) takes a `View` and sets the flag itself.
    Mixing V1 and V2 fails at compile time (Discord rejects `content`/`embeds` with the V2 flag).
  - Full V2 DSL: several containers, top-level text displays, `File` component.
  - Later, the settings-editor can be re-rendered on `View` (spec 001 uses an adapter onto the
    current settings-editor).
- Open: exact DSL shape; migration path for existing `createCard` users.

### 2. Bootstrap and lifecycle — Decided

- Upstream from the BSK bot:
  - process handlers (SIGINT/SIGTERM, crash handlers, graceful shutdown with injected flush);
  - `modal-prompt` (open a modal and await the submission with a timeout) — choose one
    approach with the kernel's settings-editor modal customId handling;
  - reference implementations: `DefaultPresenter`, `InMemoryAuthorizer`.
- New: `createBot({ modules, adapters })` boot function; generic `MigrationRunner` port (the BSK
  runner is Mongo-specific and stays in the bot).
- Resolve the constitution finding: the core depends on `node-cron`, which is not an allowed pure
  library. Options: move scheduling behind the existing scheduler port with an adapter package,
  or justify it as an allowed library.
- Open: `createBot` API; whether the scheduler adapter becomes its own package.

### 3. Module settings — Specified (`specs/001-module-settings`)

- `defineSettings` + `field.*` builders (Zod inside, never in public types), typed reads,
  two-stage validation (Zod, then guild checks via `GuildDirectory`), `SettingsStore` port with
  optimistic concurrency (`revision`), lazy migrations, translated JSON Schema draft 2020-12
  manifest with `x-kernel` hints, static/dynamic/guild suggestions (≤ 25, 2.5 s), Discord screen
  through an adapter onto the settings-editor.
- System settings: per-guild module enablement (`defaultEnabled`, router gating) and guild
  language (order: member locale → guild setting → guild Discord locale → `en`).
- Configuration status and the `requireConfigured` guard.
- Seams left for later specs: `access` slot (spec 4), replaceable change notifier (spec 5).
- Known limitation: `Locale` is `"en" | "fr"`; widening it is a separate change.

### 4. Permissions — Decided

- Baseline declared by the developer in **Discord permissions** (a public bot cannot know a
  guild's roles), on module, group and field through the `access` slot of spec 001:
  `access: { view: [...], edit: [...] }` or `"admin"`. The most specific level wins
  (field > group > module).
- **Permission keys generated from the manifest**: `ticket.view`, `ticket.edit`,
  `ticket.limits.edit`, `ticket.staffRoles.edit`, wildcards (`ticket.*`).
- Guild admins **grant keys to Discord roles** (optionally to single users). Named custom
  permission sets are a later addition.
- Evaluation: rights = baseline met through Discord permissions ∪ keys granted to the member's
  roles (or the member). Owner and `Administrator` always have everything.
- Rules: grants only add, never remove (to lock a field, the developer uses `"admin"`); managing
  grants is itself a key (`permissions.manage`, Administrator by default); **no escalation** — a
  member can only grant keys they hold; nobody can lock themselves out.
- One check everywhere: `authorizer.can(member, key)` used by the Discord settings-editor,
  commands and `-http`. Extends the existing `Authorizer` port (`viewer`/`editor` levels,
  `requireLevel` guard).
- API side: `/users/@me/guilds` has no roles; `-http` fetches the member with the bot token
  (`GET /guilds/:id/members/:userId`), computes rights, caches briefly.
- Manifest filtered per user: fields the member cannot view are omitted; others carry
  `editable`; the server re-checks every write.
- New: `PermissionStore` port (bot implements, in-memory twin), **audit log** of settings changes
  (who, what, old → new; `StoredSettings.updatedBy` already exists), generic "Permissions" page in
  the dashboard.
- Until this spec ships, spec 001 uses `ManageGuild` to decide who sees missing field names.

### 5. Event bus — Decided

- `EventBus` port in the core with an in-memory implementation; `-bus-redis` package.
- First use: distribute `settings.changed` so every process invalidates its settings cache
  (spec 001's cache has a 60 s TTL safety net until then).
- Shard routing by guild: `(guildId >> 22) % shardCount`.

### 6. HTTP API (`-http`) — Decided

- Scope: **settings only**; the web never triggers module actions.
- Endpoints: manifest (`?locale=`), settings read/write per guild and module, suggestions
  (`GET /guilds/:id/settings/:module/:field/autocomplete?q=`), permission grants (spec 4).
- Auth: Discord OAuth2; user locale from OAuth2; locale order for the web:
  `?locale=` → Discord user locale → `Accept-Language` → `en`.
- Built-in channel/role/user suggestions from a Discord REST cache.
- Runs standalone or mounted in the bot process; depends only on use cases.
- Rate limit suggestions per user.
- Incoming webhooks (external calls into modules) are a separate, later topic.

### 7. Web dashboard — Idea (separate repository)

- Renders forms from the manifest: groups, order, units, hints, advanced sections, suggestions,
  secrets as write-only, read-only fields per permissions.
- Generic pages: guild picker, module list with enable/disable, language, permissions, audit log.
- Customisation stays semantic (module icon, group order); no per-module custom components.

### 8. Operator console — Idea

- For the person who runs the bot across all guilds (not a guild admin): bot-wide settings,
  statistics (guild count, active modules, errors), monitoring, maintenance.
- Needs a bot-wide settings scope; spec 001 keeps settings guild-scoped and notes that a
  bot-wide scope can be added without breaking guild-scoped declarations.

## Consumer migration: BSK bot (`bsk-apps`, `apps/discord-bot`)

- Today the bot's `src/core/` (74 files) is a near-copy of the kernel, not a dependency.
  Differences: bot-only `modal-prompt.ts`; bot `color-input.ts` imports `@bsk/brand` where the
  kernel offers `registerColorAliases` and `EmbedColors`.
- Plan (a plan in `bsk-apps`, not a kernel spec; branch from `demo`, PR to `demo`):
  1. wait for `modal-prompt` in the kernel (spec 2) or align the settings-editor usage;
  2. register BSK colours with `registerColorAliases` / `EmbedColors` at boot;
  3. `pnpm add @azurioh/discord-kernel`, delete `src/core/`, rewrite `@/core/...` imports in the
     285 importing files (mechanical `sd`);
  4. keep bot-side: Mongo adapters, config, business modules.

## Suggested order

1. Monorepo conversion; spec 001 implementation (MVP T001–T029 first).
2. Spec 1 (`View`) and spec 2 (bootstrap) — independent, can run in parallel.
3. BSK migration onto the package.
4. Spec 4 (permissions), spec 5 (bus).
5. Spec 6 (`-http`), then spec 7 (dashboard).
6. Spec 8 (operator console).
