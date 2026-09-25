# Rules for agents working in this repository

Read this before changing code. The constitution (`.specify/memory/constitution.md`) holds the
architecture principles; this file holds the day-to-day coding rules that follow from them.
Each rule says what to do, what not to do, and why. The "Enforced by" column tells you which
check fails when a rule is broken, so a red gate points back here.

## Repository map

- `packages/kernel`: the published library `@azurioh/discord-kernel`. Vendor-free core.
- `apps/sandbox-bot`: private bot that exercises the kernel through its public subpaths only.
  Its README ("Project layout") is the reference layout for bots built on the kernel.
- `specs/`: Spec Kit features (spec, plan, tasks, contracts). `docs/roadmap.md`: the vision,
  read it before an architecture decision.

## Gate

A change is done only when these pass from the repository root with **zero errors and zero
warnings** (`pnpm lint` fails on any Biome warning): `pnpm typecheck`, `pnpm lint`, `pnpm knip`, `pnpm test`, `pnpm build`.
Write the failing test first, then the code.

## Node version

- `.node-version` is the version to develop and run CI with (fnm, nvm and `setup-node` read it).
- Each package's `engines.node` is its minimum. `engineStrict: true` in `pnpm-workspace.yaml`
  makes `pnpm install` fail below it, instead of only warning.
- The published kernel keeps the oldest supported LTS as its minimum; raise it only in a major
  release. A private app (the sandbox) may require a newer Node when it needs a runtime feature.

## Rules checked by tools

| Rule | Do | Don't | Enforced by |
|---|---|---|---|
| No barrel imports | Import the source module: `@/settings/choice` | Import a folder or an `index`: `@/settings` | Biome `noRestrictedImports` |
| `index.ts` is an entry point only | `export { x } from "./x"` in `index.ts`, for package consumers | Import from an `index.ts` inside the repo | Biome `noRestrictedImports` |
| No import cycles | Move the shared piece to its own file both sides import | Two files importing each other, even indirectly | Biome `noImportCycles` |
| Log through the `Logger` port | `logger.info({ ... }, "message")` (pino in the sandbox) | `console.*` anywhere | Biome `noConsole` |
| No dead code | Delete what nothing uses | Keep an export, file or dependency "for later" | knip |
| Catalogs are complete | Build a catalog as a `KeyedCatalog` over its `*_MESSAGES` keys | A key without an entry or an entry without a key | TypeScript |
| Exhaustive switches | `default: return value satisfies never` on every kind switch | A `default` that swallows new kinds | TypeScript |
| Pinned dependencies | `pnpm add -E pkg@x.y.z`, version checked on the registry | Ranges (`^`, `~`), or `npm`/`yarn` | Review, lockfile |

## Rules only review catches

### One definition per concept

Before writing a helper, type or constant, search for an existing one
(`grep -rn` for the behaviour, not only the name). If it exists, import it. If two places
need it, it lives once, in its own file, at the smallest level that holds both users.

Already defined once, reuse them:

| Need | Use |
|---|---|
| The reply language of an interaction | `interactionLocale` (`@/discord/interaction/interaction-locale`) |
| The message of an unknown error | `errorMessage` (`@/errors/error-message`) |
| Discord's 25-choice cap | `MAX_AUTOCOMPLETE_CHOICES` (`@/discord/command/autocomplete-limits`), `MAX_SELECT_OPTIONS` |
| Colour names and aliases | `@/color`, `@/discord/ui/color-aliases` |
| Sending a reply whatever the interaction state | `sendEmbed` (`@/discord/command/send-embed`) |
| A translator bound to one locale | `TranslateKey` (`@/i18n/translator`) |
| The language every catalog provides | `SOURCE_LOCALE` (`@/i18n/locale`) |
| Cutting text to a Discord limit | `truncateText` (`@/discord/ui/truncate-text`) |
| The display order of a settings declaration | `displayOrder` (`@/settings/field-order`) |
| Reading a stored settings value on the settings screen | `@/discord/components/settings-editor/from-declaration-stored` |
| A duration as `1h30m`, and back | `formatDuration`, `parseDuration` (`@/settings/duration`) |
| A `Logger` double in tests | `createFakeLogger` (`tests/support/fake-logger.ts`) |
| Whether a module is enabled on a guild (routers, scheduled jobs) | `ModuleGate`, `createModuleGate` (`@/settings/system/module-gate`) |
| A router's "skip this handler?" check | `isModuleDisabled` (`@/discord/settings/is-module-disabled`) |
| The "disabled on this server" reply | `moduleDisabledEmbed` (`@/discord/settings/module-disabled-embed`) |
| The guild a gateway event concerns | `eventGuildId` (`@/discord/events/event-guild-id`) |
| The kernel's own settings (module toggles, guild language) | `registry.kernel`, built by `kernelSettings` (`@/settings/system/kernel-settings`) |
| Cached settings reads | `service.get` (cached via `@/settings/cache`); never read the store directly |
| Whether a value is a plain JSON object (a patch, stored values, a toggles value) | `isPlainObject` (`@/settings/is-plain-object`) |
| Stored values checked against a declaration (unknown keys ignored, invalid fields reported) | `decodeStored` (`@/settings/decode-stored`) |
| Running a declaration's `migrate` on an older stored record, validated | `migrateStored` (`@/settings/migrate`); the service writes it back |
| A `ModuleGate` double in tests | `createFakeModuleGate` (`tests/support/fake-module-gate.ts`) |
| The reply language of an interaction on a kernel reply path | `replyLocale` (`@/discord/interaction/reply-locale`) over the `LocaleResolver` port (`@/discord/interaction/locale-resolver`) |
| The guild's language setting as a resolver (FR-038) | `createGuildLocaleResolver` (`@/discord/settings/guild-locale-resolver`) |
| A `LocaleResolver` double in tests | `createFakeLocaleResolver` (`tests/support/fake-locale-resolver.ts`) |
| The required settings a guild left unset | `service.status(declaration, guildId)` (`@/settings/status`, cached) |
| Blocking a command or component until its module is configured | `requireConfigured` (`@/discord/settings/require-configured`) as its `guard` |
| Running a command's or component's guard and answering its denial | `passesGuard` (`@/discord/command/passes-guard`) |
| A field's suggestions (autocomplete, settings screen) and a value's label | `service.suggest`, `service.label` (`@/settings/suggest` behind them); never filter choices or search the guild by hand |
| Running a suggestion search within its 2.5 s budget | `timedSearch`, `SUGGESTION_TIMEOUT_MS` (`@/settings/timed-search`) |
| The server-side search a field declares | `fieldSearch` (`@/settings/field-search`) |

Discord limits (component counts, text lengths, choice caps) are constants in the kernel,
never a literal number at the call site.

### Use the platform before writing your own

`discord.js` already formats Discord syntax. Use `channelMention`, `roleMention`,
`userMention` and `time` instead of building `<#id>`, `<@&id>`, `<@id>` or `<t:...>` by hand.
The same goes for any library already in the dependencies: check it before re-implementing.

### One responsibility per file

A file holds one main export and what serves it privately. Error classes go in a
`*-errors.ts` file, reusable helpers in their own file, constants shared by several files in
their own file. When a helper grows a second user, move it to its own file instead of
exporting it from its first home.

### No relay files

A source file does not import a symbol only to re-export it. Consumers import it from where
it is defined. Only `index.ts` entry points re-export, with `export { } from` only.

### No function that adds nothing

A function must do something its caller could not get for free. Do not write:

- an identity function (`(x: T): T => x`) whose only purpose is to "look like the DSL".
  Pass the object where the type is expected, or write `{ ... } satisfies T`;
- a wrapper that only forwards its arguments to another function unchanged.

Allowed, because they add something:

- a **generic** identity function that infers types the caller would otherwise write by hand
  (`createEvent` infers the handler's arguments from the event name);
- a thin function that narrows a type (`resolvePermissions` accepts only permission flags),
  adapts a vendor to a kernel port (`createPinoLogger` returns a `Logger`), or names a
  domain concept used in several places (`pageCount`, `clampPage`).

### Public paths are an API

`packages/kernel/package.json` lists every public subpath explicitly (no `./*` wildcard).
Moving or renaming an exported symbol breaks consumers who import that subpath:

- give the new file its own `exports` entry;
- keep the symbol reachable from the folder's `index.ts` if it was;
- list the break (old path → new path) in the PR and in the release changeset.

### Types and boundaries

- A value the kernel reads at render time goes through a resolver port, never a global.
- Zod is imported only in `packages/kernel/src/settings/fields/zod-schema.ts`, and no Zod type
  appears in an exported type.
- `packages/kernel/src/settings` imports nothing from `discord.js` (a test enforces it).
- Never ignore an error silently: log it or rethrow it.

### Persistence

- The kernel never imports a database driver. It declares ports (`SettingsStore`) and an
  in-memory twin, nothing more.
- Every store is an adapter over a port, living in the bot (or an opt-in sibling package once
  two bots share it), and its test file runs the port's contract suite
  (`runSettingsStoreContract`). An adapter that does not pass it is not done.
- The composition root is the only code that picks an adapter; everything else depends on the
  port.

### Text and translations

- Code names catalog keys through `*_MESSAGES` constants, never as string literals.
- French text uses "vous", never "tu".

### Tests

- Test first; a test fails for the right reason before the code exists.
- Shared test helpers live in `packages/kernel/tests/support/` (for example the fake logger);
  do not copy a fixture into a new test file.
- Moving a helper never removes an assertion.

## Sandbox layout

See `apps/sandbox-bot/README.md`, "Project layout": one folder per command and subcommand,
fixed role suffixes (`.command`, `.definition`, `.options`, `.handler`, `.autocomplete`,
`.helper`, `.constant`, `.event`, `.component`, `.view`, `.buttons`, `.module`, `.messages`,
`.catalog`, `.settings`), and `shared/` at the smallest level with two or more users.

## Git

- Conventional commits in English; each ends with a `Co-Authored-By:` trailer naming the agent.
- `main` is protected: pull request only, squash merge, green `check`, linear history.
- Split large changes into stacked pull requests of one theme each.
