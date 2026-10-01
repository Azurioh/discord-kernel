# Contract: Public API added by spec 002

All additions are exported through explicit `package.json` subpaths (no wildcard). Types below
are the contract; names are final unless a review changes them.

## `@azurioh/discord-kernel/bot/create-bot`

```ts
export interface BotOptions {
  readonly modules: readonly BotModule[];
  readonly logger: Logger;
  readonly settingsStore: SettingsStore;
  readonly adapters?: {
    readonly presenter?: Presenter;                                   // default: createDefaultPresenter
    readonly localeResolver?: (services: BotServices) => LocaleResolver; // default: guild locale resolver
    readonly scheduler?: Scheduler;                                   // default: new CronScheduler(logger)
    readonly migrations?: MigrationRunner;                            // default: none
    readonly databases?: readonly DatabaseConnection[];               // default: []
    readonly guilds?: GuildDirectory;                                 // default: from the client
    readonly notifier?: SettingsChangedNotifier;                      // default: in-process
    readonly clock?: Clock;                                           // default: systemClock
  };
  readonly discord?: {
    readonly client?: Client;                                         // default: new Client({ intents })
    readonly intents?: readonly GatewayIntentBits[];                  // default: [Guilds]
  };
  readonly lifecycle?: {
    readonly shutdownTimeoutMs?: number;                              // default: 10_000
    readonly handleSignals?: boolean;                                 // default: true
    readonly handleCrashes?: boolean;                                 // default: true
    readonly flushes?: readonly NamedFlush[];                         // default: []
    readonly process?: ProcessLike;                                   // default: globalThis.process
  };
}

export interface NamedFlush {
  readonly name: string;
  flush(): Promise<void> | void;
}

export type BotState = "created" | "starting" | "running" | "stopping" | "stopped";

export interface Bot extends BotServices {
  readonly state: BotState;
  start(token: string): Promise<void>;
  stop(): Promise<StopReport>;
  deployCommands(target: DeployTarget): Promise<number>;
}

export interface DeployTarget {
  readonly token: string;
  readonly clientId: string;
  readonly rest?: CommandDeployRest;   // tests: records the payload instead of calling Discord
}

export function createBot(options: BotOptions): Bot;
```

`BotServices` is imported from `module/module-context` (see below).

Errors (`@azurioh/discord-kernel/bot/bot-errors`):

- `DuplicateModuleError(first, second)`: two modules share a name.
- `ModuleRegistrationError(moduleName, cause, part?)`: anything that fails while registering one
  module: a duplicate catalog key (`cause` is the `DuplicateTranslationKeyError`), an invalid
  settings declaration (`cause` is the `SettingsDeclarationError`), a `build` that throws, or a
  `part` (`"setup"`, `"commands"`, …) declared both on the module and by `build`.

`start` rejects with the original error when a database connection, a migration, the login or a
required module `setup` fails, after the stop steps ran.

## `@azurioh/discord-kernel/bot/stop-report`

```ts
export type StopReason = "manual" | "signal" | "crash" | "startFailure";
export interface StopReport {
  readonly ok: boolean;
  readonly reason: StopReason;
  readonly signal?: string;
  readonly failed: readonly { readonly step: string; readonly target?: string; readonly error: string }[];
  readonly abandoned: readonly { readonly step: string; readonly target?: string }[];
}
```

## `@azurioh/discord-kernel/bot/process-like`

```ts
export type ProcessEvent = "SIGINT" | "SIGTERM" | "uncaughtException" | "unhandledRejection";
export interface ProcessLike {
  on(event: ProcessEvent, listener: (...args: unknown[]) => void): unknown;
  off(event: ProcessEvent, listener: (...args: unknown[]) => void): unknown;
  exitCode?: number | string | undefined;
  exit(code?: number): void;
}
```

## `@azurioh/discord-kernel/module/module` (additive)

```ts
export interface BotModule {
  // …existing fields unchanged…
  /** `false`: never gated and no toggle. Defaults to `true`. */
  readonly gated?: boolean;
  /** `true`: a failed `setup` disables only this module. Defaults to `false`. */
  readonly optional?: boolean;
  /** The parts that need kernel services, built once by `createBot`. */
  build?(context: ModuleContext): ModuleParts;
}

export interface ModuleParts {
  readonly commands?: readonly SlashCommand[];
  readonly contextMenuCommands?: readonly ContextMenuCommand[];
  readonly components?: readonly ComponentHandler[];
  readonly events?: readonly DiscordEvent[];
  readonly jobs?: readonly ScheduledJob[];
  setup?(): Promise<void> | void;
  teardown?(): Promise<void> | void;
}
```

`@azurioh/discord-kernel/module/module-context` defines both:

```ts
export interface BotServices {
  readonly client: Client;
  readonly logger: Logger;
  readonly translator: Translator;
  readonly registry: SettingsRegistry;
  readonly settings: SettingsService;
  readonly gate: ModuleGate;
  readonly presenter: Presenter;
  readonly clock: Clock;
}
/** What `build` receives: the bot's services, `logger` bound to `{ module: name }`. */
export type ModuleContext = BotServices;
```

## `@azurioh/discord-kernel/discord/module-availability`

```ts
export interface ModuleAvailability {
  isAvailable(moduleName: string): boolean;
}
```

`CommandRouterDeps`, `ComponentRouterDeps` and `EventRouter` gain an optional `availability`.
An unavailable module's command or component answers the `CORE_MESSAGES.moduleUnavailable`
denial; its event handlers are skipped (logged at debug).

## `@azurioh/discord-kernel/discord/command/router` (additive)

`deployCommands(token, clientId, rest?: CommandDeployRest)`; `CommandDeployRest` is
`{ put(route: string, options: { body: unknown }): Promise<unknown> }`, satisfied by `REST`.

## `@azurioh/discord-kernel/discord/interaction/prompt-modal`

```ts
export interface PromptableModal<V> {
  build(state?: string): ModalBuilder;
  read(submission: ModalSubmitInteraction): V;
}

export type ModalPromptResult<V> =
  | { readonly status: "submitted"; readonly interaction: ModalSubmitInteraction; readonly values: V }
  | { readonly status: "dismissed" };

export const MODAL_PROMPT_TIMEOUT_MS: number; // 5 minutes

export function promptModal<V>(
  interaction: CommandInteraction | MessageComponentInteraction,
  modal: PromptableModal<V>,
  options?: { readonly timeoutMs?: number },
): Promise<ModalPromptResult<V>>;
```

`ModalPromptError` (`…/prompt-modal-errors`): thrown when the interaction was already replied to
or deferred. A modal closed by the member resolves `dismissed` at the timeout (Discord sends no
close event).

## `@azurioh/discord-kernel/discord/default-presenter`

`createDefaultPresenter(translator: Translator): Presenter`, titles from `CORE_MESSAGES`,
colours from `EMBED_COLORS`, incident footer with the reference.

## `@azurioh/discord-kernel/authz/in-memory-authorizer`, `@azurioh/discord-kernel/authz/testing`

`createInMemoryAuthorizer(initial?: PermissionGrants): Authorizer`;
`runAuthorizerContract(name, factory, { describe, it, expect })`.

## `@azurioh/discord-kernel/persistence/migration-runner`, `@azurioh/discord-kernel/persistence/testing`

```ts
export interface MigrationReport { readonly applied: readonly string[] }
export interface MigrationRunner { run(): Promise<MigrationReport> }
export interface Migration { readonly id: string; up(): Promise<void> | void }
export function createInMemoryMigrationRunner(migrations: readonly Migration[]): MigrationRunner;
```

`runMigrationRunnerContract(name, factory, { describe, it, expect })`, where `factory` receives
the migrations to run and returns a runner over them.

## In-memory twins (one per port, research R15)

Each in its own subpath, no test framework import. Every port interface is tagged `@port`.

```ts
// @azurioh/discord-kernel/in-memory-logger
export interface LogEntry {
  readonly level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  readonly fields: Readonly<Record<string, unknown>>;  // bindings merged with the record
  readonly message?: string;
}
export interface InMemoryLogger extends Logger { readonly entries: readonly LogEntry[] }
export function createInMemoryLogger(): InMemoryLogger;   // children append to the same entries

// @azurioh/discord-kernel/persistence/in-memory-database
export interface InMemoryDatabase extends DatabaseConnection {
  readonly connected: boolean;
  readonly connectCount: number;
  readonly closeCount: number;
  failOnConnect(error: Error): void;
}
export function createInMemoryDatabase(driver?: string): InMemoryDatabase;

// @azurioh/discord-kernel/scheduler/in-memory-scheduler
export interface InMemoryScheduler extends Scheduler {
  readonly jobs: readonly ScheduledJob[];
  run(jobName: string): Promise<void>;   // runs the job now; rejects on an unknown name
}
export function createInMemoryScheduler(): InMemoryScheduler; // same validation as CronScheduler

// @azurioh/discord-kernel/discord/in-memory-channel-exporter
export interface InMemoryChannelExporter extends ChannelExporter {
  readonly exports: readonly { channelId: string; deliverToChannelId: string; guildId: string; options?: ChannelExportOptions }[];
}
export function createInMemoryChannelExporter(outcome?: ChannelExportOutcome): InMemoryChannelExporter;

// @azurioh/discord-kernel/discord/interaction/fixed-locale-resolver
export function createFixedLocaleResolver(locale: Locale): LocaleResolver;

// @azurioh/discord-kernel/settings/system/in-memory-module-gate
export interface InMemoryModuleGate extends ModuleGate {
  disable(moduleName: string, guildId: string): void;
  enable(moduleName: string, guildId: string): void;
}
export function createInMemoryModuleGate(disabled?: Readonly<Record<string, readonly string[]>>): InMemoryModuleGate;

// @azurioh/discord-kernel/discord/in-memory-module-availability
export interface InMemoryModuleAvailability extends ModuleAvailability { markUnavailable(moduleName: string): void }
export function createInMemoryModuleAvailability(unavailable?: readonly string[]): InMemoryModuleAvailability;

// @azurioh/discord-kernel/discord/command/in-memory-deploy-rest
export interface InMemoryDeployRest extends CommandDeployRest {
  readonly requests: readonly { route: string; body: unknown }[];
}
export function createInMemoryDeployRest(): InMemoryDeployRest;

// @azurioh/discord-kernel/bot/in-memory-process
export interface InMemoryProcess extends ProcessLike {
  emit(event: ProcessEvent, ...args: unknown[]): void;
  listenerCount(event: ProcessEvent): number;
  readonly exits: readonly (number | undefined)[];   // `exit` records and returns instead of exiting
}
export function createInMemoryProcess(): InMemoryProcess;
```

`ProcessEvent` is `"SIGINT" | "SIGTERM" | "uncaughtException" | "unhandledRejection"`, exported
from `bot/process-like`, and `ProcessLike.exit` returns `void` (not `never`) so the twin can
satisfy it.

## `@azurioh/discord-kernel/testing/contract-runner`

`DescribeFn`, `ItFn`, `ExpectFn`, `ContractAssertion` move here (one definition for the three
contract suites). `@azurioh/discord-kernel/settings/testing` keeps re-exporting them from its
`index.ts`; the deep path `settings/testing/settings-store-contract` still exports
`runSettingsStoreContract` (not a public subpath today, so no break).

## Catalog keys (`CORE_MESSAGES`)

| Key | en | fr |
|---|---|---|
| `core.lifecycle.restarting` | The bot is restarting. Try again in a moment. | Le bot redémarre. Réessayez dans un instant. |
| `core.lifecycle.module-unavailable` | This feature is unavailable right now. | Cette fonctionnalité est indisponible pour le moment. |

## Compatibility

Additive only: minor release 1.1.0. No existing symbol moves or changes signature; the settings
editor's modal internals change without API effect.
