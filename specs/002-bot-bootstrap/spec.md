# Feature Specification: Bot Bootstrap and Lifecycle

**Feature Branch**: `spec/002-bot-bootstrap`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "Bootstrap and lifecycle: one boot function for every bot. Today each
bot hand-writes its composition root, its own shutdown handling, no crash handlers, and its own
Presenter. The kernel must offer `createBot({ modules, adapters })` that assembles all of this from
modules and injected adapters, runs module setup and scheduled jobs, deploys commands, and shuts
down gracefully. Also: a default Presenter, an in-memory Authorizer twin, a modal prompt helper, a
generic MigrationRunner port. Resolve the constitution finding on node-cron. Out of scope: BSK
migration, View V1/V2, event bus, HTTP API, sharding manager."

## Clarifications

### Session 2026-09-30

- Q: What happens when one module's `setup` fails at start? → A: The start fails and the bot shuts
  down gracefully, unless the module declares itself optional; an optional module whose `setup`
  fails is disabled for the life of the process and the other modules keep running.
- Q: How is the core's dependency on `node-cron` brought within the constitution? → A: Amend the
  constitution (MINOR) to add `node-cron` to the allowed pure libraries, restricted to in-process
  scheduling of functions: the kernel never uses its background (child process) or distributed
  modes, and a test enforces it. No breaking change.
- Q: Which ports get an in-memory twin in this feature (SC-005)? → A: Every port of the kernel,
  including the ones this feature did not create: `ProcessLike`, `DatabaseConnection`,
  `Scheduler`, `ChannelExporter`, `LocaleResolver`, `Logger`, `ModuleGate`, command deploy
  transport, `MigrationRunner`, `Authorizer`. Test doubles in the kernel's own tests are built on
  these twins instead of being separate implementations.

## Context

The kernel ships every building block a bot needs (routers, translator, settings service, module
gate, locale resolver, scheduler), but no way to assemble them. Each bot re-writes the same
composition root: the sandbox's `create-sandbox.ts` is about 150 lines of wiring that every future
bot would copy, with the same ordering traps (translations registered before the registry is built,
the settings service resolved lazily, the admin module registered without a gate). Its shutdown only
closes the gateway: module `teardown`, scheduled jobs and database connections are never closed,
and a crash is not handled at all. The `BotModule` contract already declares `setup`, `teardown`
and `jobs`; nothing in the kernel runs them.

## User Scenarios & Testing *(mandatory)*

One kind of user is involved: the **bot author**, a developer who builds a bot from kernel modules
and adapters. Guild members only see the indirect effects (the bot answers, restarts cleanly, never
leaves an interaction without an answer).

### User Story 1 - Start a bot from modules and adapters (Priority: P1)

A bot author lists their modules and gives the adapters the kernel cannot pick for them (logger,
settings store, database connections). One call assembles the translations, settings, module gate,
reply language, routers and gateway listeners, and returns a bot that can be started. The author
writes no wiring code and cannot get the order wrong.

**Why this priority**: it is the feature. Every other story hangs off the bot this call returns.

**Independent Test**: create a bot from two test modules (one with a command, one with an event and
a catalog) and in-memory adapters, dispatch a fake interaction and a fake event, and check that
both handlers ran with the guild's language and that a disabled module's handler did not.

**Acceptance Scenarios**:

1. **Given** modules with commands, components, events, catalogs and settings declarations, **When**
   the author creates a bot from them, **Then** every command, component and event is routed, every
   catalog is registered, and every settings declaration is in the registry, without the author
   calling any router or registry directly.
2. **Given** two modules whose catalogs share a key, or whose settings declarations are
   inconsistent, **When** the author creates the bot, **Then** creation fails with an error that
   names the module and the key, before anything connects to Discord.
3. **Given** a module marked as never gated (an administration module), **When** an administrator
   disables every module on a guild, **Then** that module's commands still answer on that guild.
4. **Given** no presenter and no locale resolver passed by the author, **When** a command fails,
   **Then** the reply uses the kernel's default presenter and the guild's language.
5. **Given** the author passes their own presenter or locale resolver, **When** a command replies,
   **Then** the author's implementation is used instead of the default.

---

### User Story 2 - Run module setup, migrations and jobs at start (Priority: P1)

When the bot starts, the kernel connects the databases, runs pending data migrations, logs in,
waits until the gateway is ready, runs every module's `setup`, then starts every module's scheduled
jobs. The author sees in the logs which step is running and which one failed.

**Why this priority**: `setup` and `jobs` are already part of the module contract; without this
story a module author declares them and nothing happens.

**Independent Test**: start a bot built from in-memory adapters and a fake gateway client; check the
order of calls (database connect, migrations, login, ready, setup of each module, job start) and
that a job with `runOnStart` ran once.

**Acceptance Scenarios**:

1. **Given** a module with a `setup` and a scheduled job, **When** the bot starts, **Then** `setup`
   runs once after the gateway is ready, and the job is scheduled only after every `setup` finished.
2. **Given** a migration runner with a pending migration, **When** the bot starts, **Then** the
   migration runs before any module handler can receive an interaction.
3. **Given** a migration or a database connection that fails, **When** the bot starts, **Then** the
   start fails with that error, nothing logs in to Discord, and every connection already opened is
   closed.
4. **Given** one module whose `setup` throws, **When** the bot starts, **Then** the failure is logged
   with the module name, the start fails, and the bot shuts down gracefully (every step of User
   Story 3 that applies runs).
5. **Given** a module declared optional whose `setup` throws, **When** the bot starts, **Then** the
   failure is logged with the module name, that module's commands, components, events and jobs are
   disabled for the life of the process, and every other module starts normally.
6. **Given** an optional module disabled by a failed `setup`, **When** a member uses one of its
   commands, **Then** they receive the translated "this feature is unavailable" reply, and its
   `teardown` is not run at stop.

---

### User Story 3 - Shut down gracefully (Priority: P1)

When the process receives a stop signal, or when the author asks the bot to stop, the kernel stops
in order: it stops accepting new interactions, stops scheduled jobs, runs every module's `teardown`,
closes the databases, closes the gateway, and finally runs the flushes the author injected (for
example the logger's, last so that it carries the logs of every earlier step). A step that hangs
cannot block the process forever.

**Why this priority**: today a restart can cut a job mid-run and never closes a database. A public
bot restarts on every deploy.

**Independent Test**: start a bot with in-memory adapters, send a stop signal, and check the order
of the calls, that each step ran once, and that a teardown that never resolves is abandoned after
the shutdown timeout while the later steps still run.

**Acceptance Scenarios**:

1. **Given** a running bot, **When** it receives SIGINT or SIGTERM, **Then** the shutdown steps run
   in the order above, each once, and the process ends with a success exit code.
2. **Given** a module whose `teardown` rejects, **When** the bot shuts down, **Then** the failure is
   logged with the module name and every other step still runs.
3. **Given** a step that does not finish, **When** the shutdown timeout elapses, **Then** the kernel
   logs which step was abandoned and ends the process with a failure exit code.
4. **Given** a shutdown already in progress, **When** a second signal arrives, **Then** no step runs
   twice.
5. **Given** a shutdown in progress, **When** a member sends a command, **Then** they receive a
   translated "the bot is restarting" reply instead of Discord's "the application did not respond".

---

### User Story 4 - Survive and report crashes (Priority: P2)

When an error escapes every handler (an uncaught exception or an unhandled promise rejection), the
kernel logs it as fatal with its stack, then runs the graceful shutdown and ends the process with a
failure exit code, so the process manager restarts a clean bot rather than a half-broken one.

**Why this priority**: today such an error either kills the process without closing anything or is
silently lost. It matters less than the normal shutdown because it should be rare.

**Independent Test**: start a bot, raise an unhandled rejection, and check that it is logged as
fatal, that the shutdown steps ran, and that the exit code is a failure.

**Acceptance Scenarios**:

1. **Given** a running bot, **When** an unhandled rejection or uncaught exception occurs, **Then** it
   is logged once as fatal with its stack and the graceful shutdown runs.
2. **Given** the author opted out of the crash handlers, **When** the bot starts, **Then** the kernel
   installs no process-level handler.
3. **Given** several bots created in the same process (tests), **When** each starts and stops,
   **Then** no process-level handler is left behind after stop.

---

### User Story 5 - Deploy commands without starting the bot (Priority: P2)

The author deploys the bot's slash and context-menu commands from a script, to the development
guilds or globally, without logging in to the gateway and without running any module `setup`.

**Why this priority**: the sandbox already has this script; the kernel must keep it possible once
the composition root is gone.

**Independent Test**: create a bot from test modules and a fake REST client, deploy, and check the
payload sent and that no gateway login happened.

**Acceptance Scenarios**:

1. **Given** a bot created from modules, **When** the author deploys its commands, **Then** every
   module's commands are sent in one request per target, and the count is returned.
2. **Given** a deploy, **When** it runs, **Then** no gateway connection, database connection,
   migration or module `setup` happens.

---

### User Story 6 - Ask a member for input in a modal (Priority: P2)

A module author opens a modal from a command or a button and waits for the member's submission as a
plain value, with a timeout. If the member does not submit in time, the author gets a distinct "no
answer" result rather than an exception, and a submission from another modal or another member is
never taken for theirs. Discord does not report a modal closed by the member: a closed modal is
seen as "no answer" when the timeout elapses.

**Why this priority**: every bot that collects free text re-writes this. The settings editor
already does it privately; one shared helper removes the duplicate.

**Independent Test**: open a modal from a fake interaction, emit a submission from another member,
then one from the right member, and check that only the second is returned; then check the timeout
result with a fake clock.

**Acceptance Scenarios**:

1. **Given** a command, **When** the author prompts a modal and the member submits it, **Then** the
   author receives the submitted values and the submission interaction to reply on.
2. **Given** two modals opened at the same time by two members, **When** each member submits,
   **Then** each author receives only their own member's submission.
3. **Given** a prompted modal, **When** the timeout elapses, **Then** the author receives a
   "no answer" result and no error is logged.
4. **Given** the settings editor, **When** it opens a field modal, **Then** it uses the same helper,
   with its current behaviour unchanged.

---

### User Story 7 - Reference implementations for every port (Priority: P3)

A bot author who does not want to style their own replies uses the kernel's default presenter. A
module author who tests code that depends on any kernel port (authorizer, logger, scheduler,
database connection, channel exporter, module gate, reply language, process) uses the kernel's
in-memory twin of that port, the same way they use the in-memory settings store.

**Why this priority**: the constitution requires an in-memory twin for every port; several ports
have none, or only a private double inside the kernel's own tests. The default presenter lets User
Story 1 work with no presenter passed.

**Independent Test**: run the authorizer and migration runner contract suites against their twins;
a test lists every kernel port and fails when one has no exported twin; render each presenter
outcome in both catalog languages and check title, colour and incident footer.

**Acceptance Scenarios**:

1. **Given** the in-memory authorizer, **When** the authorizer contract suite runs, **Then** every
   case passes (grants, revocations, user grant winning over role grants, highest role level).
2. **Given** the default presenter, **When** it renders a system error in French, **Then** the title
   and incident footer are the French catalog entries and the reference appears in the footer.
3. **Given** a module that schedules a job, **When** its author tests it with the in-memory
   scheduler, **Then** they can run the job on demand without waiting for its schedule.
4. **Given** a module that logs, **When** its author tests it with the in-memory logger, **Then**
   they can read every record it wrote, with its level, fields and message.

---

### User Story 8 - Keep the kernel within its constitution (Priority: P3)

The kernel's dependency on its cron library is brought within the constitution by a recorded
amendment, so a reviewer checking Principle I finds no unrecorded exception.

**Why this priority**: it is a known finding from the roadmap; it blocks nothing today but must be
settled before the next major release.

**Independent Test**: a test lists the core package's runtime dependencies and fails on any that is
not in the constitution's allowed libraries; another checks that the scheduler only ever schedules
in-process functions.

**Acceptance Scenarios**:

1. **Given** the core package, **When** the dependency test runs, **Then** every runtime dependency
   is allowed by the constitution.
2. **Given** the constitution, **When** a reviewer reads Principle I, **Then** `node-cron` is listed
   with why it is pure in the kernel's use and why it is the ecosystem standard, and the amendment is
   recorded with a MINOR version bump.
3. **Given** the scheduler, **When** it registers a cron job, **Then** it never asks the library for
   a background (child process) or distributed task.

---

### Edge Cases

- A module declares a job but the author passes no scheduler: the kernel uses its default scheduler;
  jobs are never silently dropped.
- The bot is stopped before the gateway is ready: setup and jobs never start, and the shutdown still
  closes what was opened.
- The bot is stopped twice, or started twice: the second call does nothing and says so in the logs.
- A module has neither commands nor events (settings only): it is still registered in the settings
  registry and the module gate.
- Two modules share a name: creation fails, naming both.
- An interaction arrives after the gateway is ready but before every `setup` finished: it is
  answered with the "restarting" reply rather than reaching a module that is not ready.
- A modal prompt is opened from an interaction that was already answered: the helper fails with a
  clear error instead of Discord's generic one.
- The shutdown timeout elapses during the database close: the gateway is still closed before exit.
- The log flush itself fails: the failure is written to standard error, since the logger is gone.

## Requirements *(mandatory)*

### Functional Requirements

**Assembly**

- **FR-001**: The kernel MUST offer one function that creates a bot from a list of modules and a set
  of adapters, and returns an object that can start, stop and deploy commands.
- **FR-002**: Creating a bot MUST register every module's catalog, settings declarations, commands,
  context-menu commands, components and events, in an order the author cannot get wrong.
- **FR-003**: Creating a bot MUST fail, before any connection, on a duplicate catalog key, an invalid
  settings declaration, a duplicate module name, or a module part declared both on the module and
  by its `build`, with an error naming the module (and keeping the original error as its cause).
- **FR-004**: A module MUST be able to declare itself never gated; its handlers MUST answer whatever
  the module toggles of the guild.
- **FR-005**: The adapters the kernel cannot choose (logger, settings store) MUST be required. The
  presenter, locale resolver, scheduler, migration runner, database connections, gateway intents and
  flushes MUST be optional, with kernel defaults where one exists.
- **FR-006**: The created bot MUST expose the services modules need after creation (settings
  service, translator, registry, logger), so a module factory can receive them without lazy
  accessors written by the author.
- **FR-007**: The building blocks MUST stay public: a bot that needs a custom assembly MUST be able
  to wire the routers and services itself, as today.

**Start**

- **FR-008**: Starting MUST run, in order: database connections, pending migrations, gateway login,
  wait for ready, every module's `setup` (in module order), then scheduled jobs.
- **FR-009**: Until every `setup` finished, interactions MUST receive the translated "restarting"
  reply.
- **FR-010**: A failure before login (migration, database) MUST abort the start, close what was
  opened, and reject with the original error.
- **FR-011**: Each start step MUST be logged with its name and duration; a failure MUST be logged
  with the step and module involved.
- **FR-011a**: A module `setup` failure MUST fail the start and trigger the graceful stop, unless
  the module is declared optional. An optional module whose `setup` fails MUST be disabled for the
  life of the process (its handlers answer with the translated "unavailable" reply, its jobs are not
  scheduled, its `teardown` is not run) while the other modules start normally.

**Stop**

- **FR-012**: Stopping MUST run, in order: stop accepting interactions, stop scheduled jobs, every
  module's `teardown` (reverse module order), database close, gateway close, injected flushes.
- **FR-013**: Every stop step MUST run even when an earlier one failed; each failure MUST be logged
  with its step and module.
- **FR-014**: The whole stop MUST be bounded by a timeout (default 10 seconds, configurable); on
  timeout the kernel MUST log the abandoned step and report the stop as failed. When the stop was
  triggered by a signal or a crash, the kernel then ends the process with a failure exit code; a
  stop requested by the author's code never ends the process.
- **FR-015**: Stopping MUST be idempotent: concurrent or repeated stop requests share one run.
- **FR-016**: By default the bot MUST stop on SIGINT and SIGTERM and set the process exit code; the
  author MUST be able to disable signal handling.

**Crashes**

- **FR-017**: By default, an uncaught exception or unhandled rejection MUST be logged once as fatal
  with its stack, then trigger the stop with a failure exit code. The author MUST be able to disable
  this.
- **FR-018**: Every process-level handler the kernel installs MUST be removed when the bot stops.

**Deploy**

- **FR-019**: Deploying commands MUST NOT log in to the gateway, connect databases, run migrations or
  run module `setup`.
- **FR-020**: Deploying MUST support the development guilds of each command and global commands,
  and return the number of commands sent.

**Modal prompt**

- **FR-021**: The kernel MUST offer a helper that shows a modal from an interaction and resolves with
  the member's submission or a "no answer" result on timeout (default 5 minutes). A modal closed by
  the member resolves "no answer" at the timeout, since Discord does not report it.
- **FR-022**: The helper MUST match only the submission of the same member and of that modal
  opening, even when several are open at once.
- **FR-023**: The settings editor MUST use this helper for its modals, with no behaviour change.

**Reference implementations**

- **FR-024**: The kernel MUST ship a default presenter whose titles and incident footer come from
  the core catalog in every supported language.
- **FR-025**: The kernel MUST ship an in-memory authorizer and a contract suite for the authorizer
  port, which the in-memory authorizer passes.
- **FR-026**: The kernel MUST offer a migration runner port (run pending migrations, report which
  ran) with an in-memory twin and a contract suite. The kernel MUST NOT ship a database-specific
  runner.
- **FR-026a**: Every port of the kernel MUST ship an exported in-memory twin usable without a test
  framework: `ProcessLike`, `DatabaseConnection`, `Scheduler` (jobs run on demand), `ChannelExporter`
  (records the exports), `LocaleResolver` (fixed locale), `Logger` (records every entry),
  `ModuleGate`, the command deploy transport (records the requests), `MigrationRunner`,
  `Authorizer`. A test MUST fail when a port has no twin. The kernel's own test doubles MUST be
  built on these twins.

**Constitution**

- **FR-027**: Every runtime dependency of the core package MUST be allowed by the constitution, and a
  test MUST enforce it.
- **FR-027a**: The constitution MUST be amended (MINOR) to allow `node-cron`, restricted to
  in-process scheduling of functions, and the scheduler MUST NOT use the library's background or
  distributed modes; a test MUST enforce it.

**Surfaces**

- **FR-028**: The sandbox bot MUST be rebuilt on the boot function, keeping its current behaviour
  (commands, `/config`, `/server`, settings store choice), as the proof that no wiring is missing.
- **FR-029**: Every new user-facing text (the "restarting" and "unavailable" replies) MUST be a
  catalog key with English and French entries.

### Key Entities

- **Bot**: what the boot function returns. Holds the assembled services and exposes start, stop and
  deploy. One per process in production, several in tests.
- **Optional module**: a module whose failed `setup` disables only itself instead of failing the
  start. Modules are required by default.
- **Adapters**: the implementations the bot author chooses for the kernel's ports: logger, settings
  store, databases, presenter, locale resolver, scheduler, migration runner, flushes.
- **Lifecycle step**: a named start or stop action, logged with its duration and outcome. The order
  of steps is fixed by the kernel.
- **Migration runner**: a port that applies the bot's pending data migrations at start and reports
  which ones ran.
- **Modal prompt result**: either the submitted values with the submission interaction, or "no
  answer".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The sandbox's composition root shrinks from about 150 lines of wiring to under 40
  lines, with the same commands and behaviour.
- **SC-002**: A new bot with one module starts from a file of under 20 lines besides the module
  itself.
- **SC-003**: On a stop signal, 100% of module teardowns, job stops and database closes run, and the
  process ends within the shutdown timeout plus one second.
- **SC-004**: A member who sends a command during a restart receives a reply in 100% of cases,
  never Discord's "the application did not respond".
- **SC-005**: 100% of the kernel's ports have an exported in-memory twin, checked by a test; every
  port that holds state (settings store, authorizer, migration runner) has a contract suite.
- **SC-006**: A reviewer checking Principle I finds zero runtime dependency not allowed by the
  constitution.
- **SC-007**: A bot with one module and in-memory adapters starts, serves one command and stops in
  a test of under 30 lines, with no test double written by hand.

## Assumptions

- One bot per process in production. Several bots per process only in tests, so process handlers
  must be removable.
- Sharding managers (several processes) are out of scope: the boot function starts one gateway
  client, which may itself run several internal shards.
- Command deploy stays an explicit script, never a side effect of start, because it is rate-limited
  by Discord and must not run on every restart.
- The default gateway intents are the non-privileged `Guilds` intent; modules needing more are
  declared by the author.
- Module `setup` runs sequentially in module order and `teardown` in reverse order, so a module may
  depend on one declared before it.
- The "restarting" reply is ephemeral and uses the interaction's resolved language.
- The existing `Authorizer` port keeps its shape; the permissions spec (roadmap spec 4) will extend
  it later.
- Out of scope: BSK migration, `View` V1/V2 rendering, event bus, HTTP API, operator console.
