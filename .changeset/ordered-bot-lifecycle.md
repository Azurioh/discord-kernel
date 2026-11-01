---
"@azurioh/discord-kernel": minor
---

Start bots in order: connect databases, migrate, await gateway readiness, set up
modules and schedule their jobs. Expose lifecycle state and an idempotent `stop()`
that tears down ready modules, closes resources and flushes within one shutdown
budget, returning a complete `StopReport`.

Handle signals and crashes through an injectable `ProcessLike` port and its
in-memory twin. Track module availability independently of guild toggles; failed
optional setup disables every owned handler and job. Localize unavailable-module
and restarting replies with the new `core.lifecycle.*` catalog keys.

Stopping during startup prevents remaining startup steps and job registration;
the interrupted `start()` resolves after cleanup. Ordinary startup failures still
reject with the original error after cleanup. Existing public subpaths remain
available; new lifecycle and availability modules have explicit public subpaths,
including `bot/bot-lifecycle-options`.
