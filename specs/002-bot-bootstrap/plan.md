# Implementation Plan: Bot Bootstrap and Lifecycle

**Branch**: `spec/002-bot-bootstrap` | **Date**: 2026-09-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-bot-bootstrap/spec.md`

## Summary

Add `createBot(options)` to the kernel: it collects every module's static parts (catalogs,
settings declarations), builds the kernel services (translator, registry, settings service,
module gate, locale resolver, default presenter), calls each module's new `build(context)` with
finished services, and binds all routers to one client. The returned `Bot` starts in a fixed
order (databases, migrations, login, ready, module `setup`, jobs), stops in reverse under a
single deadline (jobs, `teardown`, databases, gateway, flushes), handles signals and crashes
through a replaceable `ProcessLike`, answers "restarting" while not running, and deploys commands
without starting. Around it: optional modules (a failed `setup` disables only them), a modal
prompt helper shared with the settings editor, a default presenter, in-memory authorizer and
migration runner with contract suites, and a test enforcing the constitution's allowed runtime
dependencies (2.1.0 adds `node-cron`, in-process only). Details: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript (strict, `noUncheckedIndexedAccess`), ESM, Node.js `>=22.12.0`

**Primary Dependencies**: `discord.js` ^14.27 (peer). Runtime: `zod` 4.6.5, `node-cron` 4.6.0
(both allowed by constitution 2.1.0). No new dependency.

**Storage**: none new. Uses the existing `SettingsStore` and `DatabaseConnection` ports; adds the
`MigrationRunner` port with an in-memory twin.

**Testing**: Vitest (`packages/kernel/tests/**`, mirrors `src/`), fake timers for deadlines and
modal timeouts, a fake `ProcessLike`, a real `Client` with `login`/`destroy` spied (never
connects), `createFakeLogger`.

**Target Platform**: Node.js library consumed by Discord bots (one process, one gateway client).

**Project Type**: library (pnpm workspace: `packages/kernel`, `apps/sandbox-bot`)

**Performance Goals**: "restarting" and "unavailable" replies acknowledged immediately (Discord
drops an interaction after 3 s); stop ends within `shutdownTimeoutMs` + 1 s.

**Constraints**: creation performs no I/O; no process-level listener left after `stop`; nothing
in `settings/` imports `discord.js`; every new text is a catalog key (en + fr, "vous").

**Scale/Scope**: about 20 new source files, 4 modified kernel files, sandbox composition root
rewritten (about 150 → under 40 lines).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Vendor-Free Core | No new dependency. `node-cron` allowed by 2.1.0, in-process only, enforced by a test (R13). `ProcessLike` and `MigrationRunner` are ports; the bot keeps its database drivers and pino. | Pass |
| II. Clean Architecture | `bot/` is the kernel's composition layer: it depends on everything, nothing depends on it. Modules still receive services by injection (`build(context)`), never by import. | Pass |
| III. Declare Once, Render Everywhere | Unchanged: `createBot` registers the same declarations every surface reads. | Pass |
| IV. Multi-Tenant by Default | Module availability is process-wide by design (a failed `setup` breaks the module in this process); guild enablement stays in the guild-scoped `ModuleGate`. Works per shard process with no shared state. | Pass |
| V. Localised by Construction | "restarting" and "unavailable" are catalog keys (en, fr), resolved per interaction via the locale resolver. | Pass |
| VI. Type Safety at the Boundary | `BotOptions`, `ModuleParts`, `ModalPromptResult<V>` fully typed; modal values inferred from the modal's `read`. | Pass |
| VII. Test-First with In-Memory Twins | New ports ship twins and contract suites (`MigrationRunner`, `Authorizer`); every story has a test file first (quickstart §2). | Pass |
| VIII. Semver Discipline | Additive only: minor 1.1.0 with a changeset (R14). | Pass |

Post-design re-check (after Phase 1): unchanged, all pass. No complexity tracking entry.

## Project Structure

### Documentation (this feature)

```text
specs/002-bot-bootstrap/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R14
├── data-model.md        # Bot states, module status, steps, StopReport, ports
├── quickstart.md        # validation guide
├── contracts/
│   └── public-api.md    # new subpaths and types
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/kernel/src/
├── bot/
│   ├── create-bot.ts               # createBot, BotOptions, Bot, BotServices
│   ├── bot-errors.ts               # DuplicateModuleError, ModuleBuildError
│   ├── assemble-modules.ts         # static collection + build(context) + router registration
│   ├── lifecycle.ts                # state machine, start/stop sequences
│   ├── lifecycle-step.ts           # named step runner (log, duration, deadline race)
│   ├── lifecycle-dispatcher.ts     # "restarting" answer while not running
│   ├── module-status.ts            # pending/ready/unavailable, implements ModuleAvailability
│   ├── process-handlers.ts         # install/remove signal and crash listeners
│   ├── process-like.ts             # ProcessLike port
│   └── stop-report.ts              # StopReport, StopReason
├── module/
│   ├── module.ts                   # + gated, optional, build, ModuleParts
│   └── module-context.ts           # ModuleContext
├── discord/
│   ├── default-presenter.ts        # moved from the sandbox
│   ├── module-availability.ts      # ModuleAvailability port
│   ├── settings/module-unavailable-embed.ts
│   ├── command/router.ts           # + availability, + deployCommands rest param
│   ├── components/component-router.ts   # + availability
│   ├── events/event-router.ts      # + availability
│   ├── i18n.ts                     # + lifecycle keys
│   └── interaction/
│       ├── prompt-modal.ts
│       └── prompt-modal-errors.ts
├── authz/
│   ├── in-memory-authorizer.ts
│   └── testing/{index.ts, authorizer-contract.ts}
├── persistence/
│   ├── migration-runner.ts
│   ├── in-memory-migration-runner.ts
│   └── testing/{index.ts, migration-runner-contract.ts}
└── testing/
    └── contract-runner.ts          # DescribeFn/ItFn/ExpectFn, shared by the 3 suites

packages/kernel/tests/
├── bot/{create-bot, bot-start, bot-stop, process-handlers, deploy-commands}.test.ts
├── discord/{default-presenter, interaction/prompt-modal}.test.ts
├── authz/in-memory-authorizer.test.ts
├── persistence/in-memory-migration-runner.test.ts
├── constitution/runtime-dependencies.test.ts
└── support/{fake-process.ts, fake-client.ts}

apps/sandbox-bot/src/
├── bootstrap/create-sandbox.ts     # createBot call only
├── main.ts, register.ts            # start / deployCommands
├── modules/*/                      # build(context) instead of () => settings
└── shared/discord/embed-presenter.ts   # deleted (default presenter)
```

**Structure Decision**: one library package plus the sandbox, as today. The new `bot/` folder is
the only code that knows every other kernel area; it is where a bot's composition root moves to.

## Delivery: stacked pull requests

Each PR passes the full gate on its own and lands behind the previous one.

| # | PR | Stories | Content |
|---|---|---|---|
| 1 | `feat(testing): share the contract runner types` + reference twins | US7, US8 | `testing/contract-runner.ts`; in-memory authorizer + contract; migration runner port + twin + contract; default presenter; constitution dependency test and in-process scheduler test |
| 2 | `feat(bot): create a bot from modules` | US1, US5 | `BotModule` fields, `ModuleContext`, `createBot` assembly (no lifecycle yet: `start` = login), `deployCommands` with injectable REST |
| 3 | `feat(bot): start and stop in order` | US2, US3, US4 | lifecycle state machine, steps, deadline, lifecycle dispatcher, module availability in routers, process handlers, catalog keys |
| 4 | `feat(discord): prompt a modal and await its answer` | US6 | `promptModal`, settings editor moved onto it |
| 5 | `refactor(sandbox): boot the sandbox with createBot` | FR-028 | sandbox rebuilt, embed presenter deleted, changeset 1.1.0, README (kernel + sandbox layout) |

## Complexity Tracking

No constitution violation to justify.
