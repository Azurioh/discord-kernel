---
"@azurioh/discord-kernel": minor
---

Create a bot from static or service-aware modules with shared settings, translation,
presentation, guild gating, command/component/event routing and autocomplete. Deploy
slash and context-menu commands through an injectable transport without starting the bot.

New public subpaths: `bot/create-bot`, `bot/assemble-modules`, `bot/bot-errors`,
`module/module-context`, `discord/command/command-deploy-rest` and
`discord/command/in-memory-deploy-rest`. Existing settings entry points stay unchanged.

PR 2 ships the Bot/BotOptions subset: `start(token): Promise<void>` only awaits login
and returns no token. There is no state, stop method, lifecycle option or StopReport.
PR 3 adds these lifecycle members additively; setup, scheduler, database and migration
adapters are not run by this subset.
