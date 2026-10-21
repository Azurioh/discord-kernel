---
"@azurioh/discord-kernel": minor
---

An in-memory twin for every port, contract suites for the stateful ones, and a default presenter.

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
