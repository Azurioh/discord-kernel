# Quickstart: validate Bot Bootstrap and Lifecycle

Run from the repository root. Contracts: [contracts/public-api.md](./contracts/public-api.md).

## 1. Gate

```bash
pnpm typecheck && pnpm lint && pnpm knip && pnpm test && pnpm build
```

Expected: zero errors, zero warnings.

## 2. Automated scenarios (Vitest, `packages/kernel/tests/`)

| Spec | Test file | What it proves |
|---|---|---|
| US1 | `bot/create-bot.test.ts` | modules routed, catalogs and declarations registered, duplicate module/key fails before I/O, `gated: false` answers on a guild with every module off, default and custom presenter/locale resolver |
| US2 | `bot/bot-start.test.ts` | step order (connect → migrate → login → ready → setup → jobs), `runOnStart` once, connect/migration failure closes what was opened and never logs in, required setup failure stops, optional setup failure disables only that module |
| US3 | `bot/bot-stop.test.ts` | stop order, teardown failure logged and others still run, deadline abandons a hanging step and still closes the gateway and flushes, second stop shares the first, "restarting" reply while stopping |
| US4 | `bot/process-handlers.test.ts` | fake process: crash logged once as fatal, stop runs, exit code 1; opt-out installs nothing; no listener left after stop |
| US5 | `bot/deploy-commands.test.ts` | fake REST records one request per target, count returned, no login/connect/setup |
| US6 | `discord/interaction/prompt-modal.test.ts` | own member and opening only, `dismissed` on timeout, error on an answered interaction; settings-editor tests unchanged and green |
| US7 | `authz/in-memory-authorizer.test.ts`, `discord/default-presenter.test.ts`, `persistence/in-memory-migration-runner.test.ts` | contract suites pass; presenter titles/footer in en and fr |
| US8 | `constitution/runtime-dependencies.test.ts`, `scheduler/scheduler.test.ts` | only allowed runtime dependencies; cron jobs always in-process |

```bash
pnpm --filter @azurioh/discord-kernel test -- bot discord/interaction/prompt-modal authz persistence constitution scheduler
```

## 3. Sandbox, end to end (manual, needs `apps/sandbox-bot/.env`)

```bash
pnpm --filter sandbox-bot register     # deploys, logs "Commands registered", never logs in
pnpm --filter sandbox-bot dev          # starts
```

1. The logs show each start step with its duration, then `running`.
2. In the dev guild, `/config`, `/server` and the demo commands behave as before.
3. With `/server`, disable every module: `/server` still answers (admin module, `gated: false`).
4. Press Ctrl+C: the logs show `jobs.stop`, `module.teardown`, `databases.close`,
   `gateway.destroy`, `flush`, in that order, and the process exits with code 0 (`echo $?`).
5. Start again and send a command within the first second after `gateway.login`: the reply is
   "The bot is restarting", never "The application did not respond".

## 4. Size check (SC-001, SC-002)

```bash
wc -l apps/sandbox-bot/src/bootstrap/create-sandbox.ts   # under 40 lines
```
