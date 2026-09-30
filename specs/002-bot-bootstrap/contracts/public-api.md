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

export interface Bot extends BotServices {
  readonly state: BotState;
  start(token: string): Promise<void>;
  stop(reason?: string): Promise<StopReport>;
  deployCommands(target: DeployTarget): Promise<number>;
}

export interface DeployTarget {
  readonly token: string;
  readonly clientId: string;
  readonly rest?: CommandDeployRest;   // tests: records the payload instead of calling Discord
}

export function createBot(options: BotOptions): Bot;
```

Errors (`@azurioh/discord-kernel/bot/bot-errors`): `DuplicateModuleError` (both names),
`ModuleBuildError` (module name, cause). Duplicate catalog keys and invalid declarations keep
their existing errors (`DuplicateTranslationKeyError`, `SettingsDeclarationError`), wrapped with
the module name as `cause` context in the log.

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
export interface ProcessLike {
  on(event: "SIGINT" | "SIGTERM" | "uncaughtException" | "unhandledRejection", listener: (...args: unknown[]) => void): unknown;
  off(event: "SIGINT" | "SIGTERM" | "uncaughtException" | "unhandledRejection", listener: (...args: unknown[]) => void): unknown;
  exitCode?: number | string | undefined;
  exit(code?: number): never;
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

`ModuleContext` (`@azurioh/discord-kernel/module/module-context`) is `BotServices` with `logger`
bound to the module.

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
or deferred.

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
