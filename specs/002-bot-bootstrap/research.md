# Research: Bot Bootstrap and Lifecycle

Decisions taken while planning `specs/002-bot-bootstrap`. Each entry: decision, rationale,
alternatives considered.

## R1. How modules receive kernel services without lazy accessors (FR-006)

**Decision**: `BotModule` gains an optional `build(context)` method. A module keeps its static,
declarative parts as fields (`name`, `label`, `translations`, `settings`, `defaultEnabled`, and
the new `gated` and `optional`) and returns from `build` whatever needs a kernel service:
`commands`, `contextMenuCommands`, `components`, `events`, `jobs`, `setup`, `teardown`.
`createBot` collects the static parts of every module first (catalogs, declarations), builds the
services (translator, registry, settings service, gate, locale resolver, presenter), then calls
each module's `build` once with a `ModuleContext` that holds real, finished services.

**Rationale**: the circularity today is real but shallow: the registry needs the modules'
declarations and catalogs (static data), and only the handlers need the service. Splitting the
two phases removes the `() => settings` accessors from every module (the sandbox has eight call
sites of `settings()`), with no proxy and no mutable holder. It is additive: a module without
`build` keeps working, handler fields declared directly on the module are still routed, and a
bot doing its own assembly (FR-007) ignores `build`.

A part declared both on the module and by `build` (for example `setup` in both places, or
`commands` in both) fails `createBot` with `ModuleRegistrationError` naming the module and the
part: merging would hide which one the author meant.

**Alternatives considered**:
- `modules: (services) => BotModule[]`: the services cannot exist before the modules' declarations
  are known, so the kernel would need a lazy proxy for the settings service. Rejected: hides the
  ordering problem instead of removing it.
- A new `ModuleDefinition` type distinct from `BotModule`: two module shapes for one concept;
  violates "one definition per concept". Rejected.
- A `defineModule()` helper: it would return its argument unchanged (forbidden by AGENTS.md "No
  function that adds nothing"); `satisfies BotModule` does the job.

## R2. Shape of `createBot`

**Decision**: `createBot(options: BotOptions): Bot`, synchronous. Options are grouped:

- `modules` (required);
- `logger`, `settingsStore` (required adapters, FR-005);
- `adapters?`: `presenter`, `localeResolver` (a factory receiving the built services, since the
  default one needs the settings service), `scheduler`, `migrations`, `databases`, `guilds`
  (`GuildDirectory`, default: built from the client), `notifier` (default in-process), `clock`;
- `discord?`: `client` (default `new Client({ intents })`), `intents` (default `[Guilds]`);
- `lifecycle?`: `shutdownTimeoutMs` (default 10 000), `handleSignals` (default `true`),
  `handleCrashes` (default `true`), `flushes` (named async functions run last), `process` (a
  `ProcessLike`, default `globalThis.process`, replaced in tests).

`Bot` exposes `start(token)`, `stop()`, `deployCommands({ token, clientId })`, `state`, and the
built services (`client`, `translator`, `registry`, `settings`, `gate`, `presenter`, `clock`,
`logger`). `stop()` takes no argument: a programmatic stop always reports the reason `manual`.

`BotServices` is defined in `module/module-context.ts` (with `ModuleContext`), not in `bot/`: a
module's contract must not import the composition layer, which depends on everything (Principle
II). `bot/create-bot.ts` imports it from there.

Errors naming the module (FR-003): every failure while registering one module's parts (duplicate
catalog key, invalid settings declaration, part declared twice) is rethrown as
`ModuleRegistrationError(moduleName, cause)`, keeping `DuplicateTranslationKeyError` or
`SettingsDeclarationError` as `cause` so existing `instanceof` checks on the cause still work.

**Rationale**: creation stays synchronous and connection-free so FR-003 errors surface before any
I/O and so `register.ts` can create a bot just to deploy. `start` takes the token rather than
`createBot`, so a bot created to deploy never holds one it does not use. Every default is one the
sandbox already uses today, so SC-001 is reachable.

**Alternatives considered**: `createBot` being async and connecting (couples creation to I/O,
breaks deploy-only use); a builder/fluent API (more surface, same result).

## R3. Never-gated modules (FR-004)

**Decision**: `BotModule.gated?: boolean`, default `true`. A module with `gated: false` has its
handlers registered without a module name (the routers already treat that as "never gated") and
is left out of the kernel settings' module toggles.

**Rationale**: it is exactly what the sandbox does by hand for its admin module. Naming it in the
module removes the special case from the composition root.

## R4. Optional modules and the "unavailable" reply (FR-011a)

**Decision**: `BotModule.optional?: boolean`, default `false`. The routers gain an optional
`availability?: ModuleAvailability` dependency (`isAvailable(moduleName): boolean`), checked
before the guild gate. `createBot` owns one availability set: a module whose `setup` failed and
that is optional is marked unavailable. Command and component handlers of an unavailable module
answer with the translated `CORE_MESSAGES.moduleUnavailable` denial; its events are skipped; its
jobs are never scheduled; its `teardown` is skipped at stop.

**Rationale**: handlers are registered at creation (before `setup` runs), so disabling must
happen at dispatch. Reusing `ModuleGate` would reply "disabled on this server", which is wrong
(the module is broken, not switched off by the guild) and would mix a process-wide state into a
per-guild port. A separate, synchronous check keeps each port about one thing. Additive: routers
without it behave as today.

**Alternatives considered**: unregistering handlers from the routers (routers have no removal
API, and a command would then hit Discord's "did not respond"); a wrapper `ModuleGate` (wrong
message, mixed concerns).

## R5. Answering while not ready or stopping (FR-009, US3 scenario 5)

**Decision**: a `LifecycleDispatcher` (an `InteractionDispatcher`) placed first in the
`InteractionRouter`. While the bot state is not `running`, it claims every interaction: chat
input, context menu, component and modal interactions get an ephemeral denial with
`CORE_MESSAGES.botRestarting` in the resolved reply locale; autocomplete gets an empty choice
list. Once `running`, it returns `false` and the normal routers take over.

**Rationale**: one place decides "can the bot serve now", the routers stay unaware of lifecycle.
Discord drops an interaction not acknowledged within 3 s, so the reply must be immediate.

## R6. Order of start and stop steps

**Decision**:

- Start: `databases.connect` (each, in order) → `migrations.run` → `gateway.login` → wait for
  `clientReady` → `module.setup` (module order, sequential) → `scheduler.start(jobs)` → state
  `running`.
- Stop: state `stopping` (interactions answered by R5) → `scheduler.stop` → `module.teardown`
  (reverse order, only modules whose `setup` succeeded) → `databases.close` (reverse order) →
  `gateway.destroy` → `flushes` (in order) → remove process handlers → state `stopped`.

Databases connect before migrations because a migration needs the connection; the spec was
corrected accordingly. Flushes run last so the logger flush carries every earlier step's logs.

**Rationale**: dependencies are released in the reverse order they were acquired; the gateway
closes after the databases so a teardown can still fetch Discord data it needs, and before the
flush so its own close is logged.

## R7. Shutdown timeout (FR-014, SC-003)

**Decision**: one deadline for the whole stop (`shutdownTimeoutMs`, default 10 000 ms). Each step
races the time left. A step still pending at the deadline is abandoned and logged by name; the
remaining steps still run, sharing a fixed 1 000 ms grace, so the gateway close and the flush
still happen. The stop resolves `{ ok: false, abandoned: [...] }`. When the stop was triggered by
a signal or a crash, the kernel then sets `process.exitCode = 1` and calls `process.exit()`,
because an abandoned step may hold the event loop open. A programmatic `bot.stop()` never exits
the process.

**Rationale**: matches SC-003 (timeout plus one second) and the edge case "timeout during the
database close: the gateway is still closed before exit".

## R8. Process handlers (FR-016 to FR-018)

**Decision**: a `ProcessLike` port (`on`, `off`, `exitCode`, `exit`) with `globalThis.process` as
default. `start` installs `SIGINT`/`SIGTERM` (unless `handleSignals: false`) and
`uncaughtException`/`unhandledRejection` (unless `handleCrashes: false`) listeners and keeps
their references; `stop` removes exactly those. A crash is logged once at `fatal` with its stack,
then triggers the stop with exit code 1. A second signal during a stop does nothing (the stop
promise is shared, FR-015).

**Rationale**: several bots per process in tests (Assumption 1) require removable handlers; a
fake process makes signals and crashes testable without killing the test runner.

## R9. Gateway client in tests

**Decision**: no new gateway port. `createBot` accepts a `discord.js` `Client`; tests pass a real
`Client` whose `login` and `destroy` are replaced with spies, and emit `clientReady` themselves.

**Rationale**: the routers and `EventRouter.bind` already take a `Client`; a port would wrap the
whole events API for no gain. The client never connects in tests.

## R10. Command deploy without start (FR-019, FR-020)

**Decision**: `bot.deployCommands({ token, clientId, rest? })` delegates to the existing
`CommandRouter.deployCommands`, which gains an optional `rest` parameter (a `REST`-shaped
`{ put(route, { body }) }`) so the payload can be asserted without network. Creation already
built every command, so deploy needs no start step.

**Rationale**: the behaviour (guild buckets, global sync with pruning) already exists and is
tested; only the transport becomes injectable. Additive change.

## R11. Modal prompt (FR-021 to FR-023)

**Decision**: `promptModal(interaction, modal, options?)` in `discord/interaction/prompt-modal.ts`.
`modal` is anything with `build(state)` and `read(submission)` (a `Modal<F>` from `createModal`
fits, so do the settings editor's modals). The helper builds the modal with a state unique to
this opening (the editor's `nextModalOpenState`, moved here), shows it, and awaits the submission
filtered on member and exact custom id. Result:
`{ status: "submitted", interaction, values } | { status: "dismissed" }`. A timeout or a closed
modal is `dismissed`, not logged. An interaction already replied or deferred throws
`ModalPromptError` before calling Discord. Default timeout 5 minutes, overridable. The settings
editor's `collectModalSubmission` is replaced by it, keeping its `isFromMessage` check on top.

Discord sends no event when a member closes a modal: `awaitModalSubmit` only rejects at its
timeout. A closed modal is therefore `dismissed` when the timeout elapses; the spec states it
(FR-021) so no one expects an immediate result.

**Rationale**: one implementation of "unique opening, filtered await" (the part that is easy to
get wrong with two members at once); typed values come from the existing `Modal<F>.read`.

## R12. Reference implementations (FR-024 to FR-026)

**Decision**:

- `createDefaultPresenter(translator)` in `discord/default-presenter.ts`: moved from the sandbox's
  `embed-presenter.ts` (same titles, colours, footer), which is then deleted.
- `createInMemoryAuthorizer()` in `authz/in-memory-authorizer.ts`, resolving with the existing
  `meetsResolvedLevel`; `runAuthorizerContract` in `authz/testing/authorizer-contract.ts`.
- `MigrationRunner` port in `persistence/migration-runner.ts` (`run(): Promise<MigrationReport>`,
  report = ids applied, in order); `createInMemoryMigrationRunner(migrations)` and
  `runMigrationRunnerContract` in `persistence/testing/`.
- The runner-agnostic contract types (`DescribeFn`, `ItFn`, `ExpectFn`, `ContractAssertion`) move
  from `settings/testing/settings-store-contract.ts` to `testing/contract-runner.ts`, one
  definition for the three suites; `settings/testing` keeps exporting them from its `index.ts`.

## R13. Constitution enforcement (FR-027, FR-027a)

**Decision**: `tests/constitution/runtime-dependencies.test.ts` reads
`packages/kernel/package.json` and fails on any `dependencies` entry outside
`ALLOWED_RUNTIME_DEPENDENCIES = ["node-cron", "zod"]` (test-local constant, with a comment
pointing at Principle I). `tests/scheduler/scheduler.test.ts` gains a case mocking `node-cron`
and asserting `schedule` is always called with a function and never with `distributed` or a task
file path.

## R14. Versioning

**Decision**: minor release (1.1.0). Every change is additive: new modules and subpaths, new
optional fields on `BotModule` and on router deps, an optional `rest` parameter. The settings
editor's modal change is internal. The sandbox (private) is rebuilt on `createBot`.

## R15. An in-memory twin for every port (FR-026a, SC-005)

**Decision**: every interface the kernel declares as a port carries the JSDoc tag `@port`, and
ships an in-memory twin next to it, exported through its own subpath. Twins are plain code (no
test framework import), so a bot's own tests use them with any runner. The full list:

| Port | File | Twin | Twin file | What it adds for tests |
|---|---|---|---|---|
| `Logger` | `logger.ts` | `createInMemoryLogger()` | `in-memory-logger.ts` | `entries` (level, fields, message, bindings), `child` shares the same entries |
| `Clock` | `clock.ts` | `fixedClock` (exists) | `clock.ts` | none |
| `DatabaseConnection` | `persistence/database.ts` | `createInMemoryDatabase(name?)` | `persistence/in-memory-database.ts` | `connected`, counts of `connect`/`close`, `failOnConnect(error)` |
| `MigrationRunner` | `persistence/migration-runner.ts` | `createInMemoryMigrationRunner` | `persistence/in-memory-migration-runner.ts` | applied ids |
| `Authorizer` | `authz/authorizer.ts` | `createInMemoryAuthorizer` | `authz/in-memory-authorizer.ts` | none |
| `Scheduler` | `scheduler/scheduler.ts` | `createInMemoryScheduler()` | `scheduler/in-memory-scheduler.ts` | `jobs`, `run(name)` on demand, `started`; same validation errors as `CronScheduler` |
| `ChannelExporter` | `discord/channel-exporter.ts` | `createInMemoryChannelExporter(outcome?)` | `discord/in-memory-channel-exporter.ts` | `exports` (every call's arguments) |
| `Presenter` | `discord/presenter.ts` | `createDefaultPresenter` | `discord/default-presenter.ts` | none (pure) |
| `LocaleResolver` | `discord/interaction/locale-resolver.ts` | `createFixedLocaleResolver(locale)` | `discord/interaction/fixed-locale-resolver.ts` | none |
| `ModuleGate` | `settings/system/module-gate.ts` | `createInMemoryModuleGate(disabled?)` | `settings/system/in-memory-module-gate.ts` | `disable(module, guild)`, `enable(module, guild)` |
| `ModuleAvailability` | `discord/module-availability.ts` | `createInMemoryModuleAvailability(unavailable?)` | `discord/in-memory-module-availability.ts` | `markUnavailable(module)` |
| `CommandDeployRest` | `discord/command/command-deploy-rest.ts` | `createInMemoryDeployRest()` | `discord/command/in-memory-deploy-rest.ts` | `requests` (route, body) |
| `ProcessLike` | `bot/process-like.ts` | `createInMemoryProcess()` | `bot/in-memory-process.ts` | `emit(event, ...args)`, `listenerCount(event)`, `exits` (codes passed to `exit`, which does not exit) |
| `SettingsStore`, `GuildDirectory`, `SettingsChangedNotifier` | `settings/ports/*` | exist | `settings/in-memory/*` | none |

`tests/ports/every-port-has-a-twin.test.ts` scans `src/**/*.ts` for interfaces tagged `@port` and
fails when one is missing from its `PORT_TWINS` table (port name → twin factory imported from its
public subpath), so a new port without a twin breaks the gate.

The kernel's own test doubles are rebuilt on the twins with their call sites unchanged:
`tests/support/fake-logger.ts` wraps `createInMemoryLogger` with `vi.spyOn` on each level (the suites
that assert `toHaveBeenCalled` keep working); `fake-module-gate.ts` and
`fake-locale-resolver.ts` return the twins (with `vi.spyOn` on `resolve`), then are deleted if a
suite can use the twin directly. AGENTS.md's "one definition per concept" table points at the
twins.

**Rationale**: the constitution requires a twin for every port; several existed only as private
test doubles, which a bot cannot import. Tagging ports makes the rule checkable.

**Alternatives considered**: a hand-kept list in the test only (a new port is forgotten silently);
`vi.fn`-based twins (would force Vitest on consumers).
