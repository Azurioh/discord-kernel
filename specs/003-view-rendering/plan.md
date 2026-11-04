# Implementation Plan: One View for Components V1 and V2

**Branch**: `spec/003-view-rendering` | **Date**: 2026-11-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-view-rendering/spec.md`

## Summary

Add one `View<S>` type to the kernel: a V1 view (`content`, `embeds`, `rows`) or a V2 view
(`components`), the two shapes made mutually exclusive by `?: never` fields. V2 components are
plain data tagged by `type` (`text`, `container`, `section`, `separator`, `gallery`, `file`,
`buttons`, `select`); V1 rows reuse the `buttons` and `select` nodes. A single function,
`renderView`, validates a view against Discord's limits (typed errors, named constants) and
compiles it to discord.js options, and is the only file that sets `IsComponentsV2`. Every send
path moves onto views: `sendEmbed` becomes `sendView`, `Context.reply`, the presenter port, guard
denials, routers, the lifecycle dispatcher, the interactive message, paginators. `createCard`,
`InteractiveMessagePayload` and `toMessageEditOptions` are removed; the settings editor's card
view is rebuilt on the `container` node. Released as 3.0.0 with a migration table. Details:
[research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript (strict, `noUncheckedIndexedAccess`), ESM, Node.js `>=22.12.0`

**Primary Dependencies**: `discord.js` ^14.27 (peer; builders `TextDisplayBuilder`,
`ContainerBuilder`, `SectionBuilder`, `SeparatorBuilder`, `MediaGalleryBuilder`,
`ThumbnailBuilder`, `FileBuilder`). No new dependency.

**Storage**: N/A

**Testing**: Vitest (`packages/kernel/tests/**`, mirrors `src/`); `expectTypeOf` and
`@ts-expect-error` for compile-time rules (`tsconfig.json` includes `tests/`, so `pnpm
typecheck` runs them); recorded payloads on `createBotInteraction` (extended, research R11).

**Target Platform**: Node.js library consumed by Discord bots.

**Project Type**: library (pnpm workspace: `packages/kernel`, `apps/sandbox-bot`)

**Performance Goals**: rendering is synchronous and linear in the number of nodes (≤ 40); no
measurable cost against Discord's 3 s interaction deadline.

**Constraints**: limits checked before any discord.js builder runs; no Discord type in V2 node
shapes except kernel-owned `Button<S>` / `AnySelectMenu`; one source file names `IsComponentsV2`;
every exported symbol moved or removed is listed in the changeset.

**Scale/Scope**: about 8 new source files (`discord/view/`, `send-view.ts`,
`module-*-view.ts`), about 15 modified kernel files, 2 deleted (`ui/card.ts`, `send-embed.ts`)
plus 2 removed subpath files (`interactive-message-payload.ts`, `message-edit-options.ts`), one
new sandbox command.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Vendor-Free Core | No new dependency. `discord.js` stays the peer the `discord/` layer already uses; V2 node shapes hold no discord.js type (only kernel `Button<S>` / `AnySelectMenu`); V1 `embeds` keep `EmbedBuilder` as today (non-goal: embeds as data). | Pass |
| II. Clean Architecture | `discord/view/` sits in the presentation layer next to `discord/ui/`; nothing in `settings/` or `module/` imports it. Send paths depend on `renderView`, never on builders. | Pass |
| III. Declare Once, Render Everywhere | Views are data; one renderer compiles them. The settings editor keeps one declaration per screen, rendered in V1 or V2. | Pass |
| IV. Multi-Tenant by Default | Unaffected: rendering is per interaction, no shared state. | Pass |
| V. Localised by Construction | No new user-facing text in the kernel (errors are developer-facing); presenter replies stay catalog-driven. The sandbox demo's texts are catalog keys (en, fr, "vous"). | Pass |
| VI. Type Safety at the Boundary | V1/V2 mix, nested containers, section text count and accessory count fail to compile; the rest is checked at render with typed errors. | Pass |
| VII. Test-First with In-Memory Twins | No new port. The `Presenter` port already has `createDefaultPresenter` as its reference implementation; a V2 presenter double lives in `tests/support/`. Each story's test file is written first (quickstart §2). | Pass |
| VIII. Semver Discipline | Breaking: major 3.0.0; each breaking PR adds a major changeset with its migration rows (research R10). | Pass |

Post-design re-check (after Phase 1): unchanged, all pass. No complexity tracking entry.

## Project Structure

### Documentation (this feature)

```text
specs/003-view-rendering/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R12
├── data-model.md        # View, V2 nodes, rendering, errors, changed types
├── quickstart.md        # validation guide (automated + hand check)
├── contracts/
│   └── public-api.md    # added, changed, removed subpaths; card → container table
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/kernel/src/discord/
├── view/                                   # new
│   ├── view.ts                             # View, V1View, V2View, nodes, MediaItem
│   ├── view-limits.ts                      # MAX_* constants
│   ├── view-errors.ts                      # ViewLimitError, MissingAttachmentError, EmptyViewError, ViewLayoutSwitchError
│   ├── validate-view.ts                    # limit and attachment checks, before any builder
│   ├── compile-v2-component.ts             # node → discord.js builder
│   └── render-view.ts                      # renderView: validate, compile, flags (only IsComponentsV2 site)
├── interaction/select-menu.ts              # + AnySelectMenu (was CardSelectMenu)
├── command/
│   ├── send-view.ts                        # replaces send-embed.ts
│   ├── context.ts                          # reply(view)
│   ├── command-responders.ts, passes-guard.ts
├── components/
│   ├── component-router.ts
│   ├── interactive-message/                # payload + message-edit-options removed; collector and mount on View
│   ├── paginator/paginator-view.ts         # PaginatorRender → View
│   ├── persistent-paginator.ts             # PersistentPage { view }
│   └── settings-editor/settings-editor{,-card}.view.ts
├── settings/module-disabled-view.ts, module-unavailable-view.ts   # renamed from *-embed.ts
├── presenter.ts, default-presenter.ts      # → View
└── ui/card.ts                              # deleted
packages/kernel/src/bot/lifecycle-dispatcher.ts

packages/kernel/tests/
├── discord/view/{view-types, render-view, validate-view}.test.ts
├── discord/command/send-view.test.ts       # replaces send-embed.test.ts
├── constitution/components-v2-flag.test.ts
├── support/bot-interaction.ts              # + deferReply/editReply/followUp/update spies, sentPayloads()
└── support/v2-presenter.ts                 # Presenter double returning V2 views

apps/sandbox-bot/src/modules/demo/commands/view-demo/
├── view-demo.command.ts
├── message/{message.definition, message.handler, message.view}.ts
└── pages/{pages.definition, pages.handler, pages.view}.ts
```

**Structure Decision**: one library package plus the sandbox, as today. Views get their own
`discord/view/` folder because the type, its limits, errors and renderer are shared by every send
path; `ui/` keeps the embed and colour helpers.

## Delivery: stacked pull requests

Each PR passes the full gate on its own and lands behind the previous one. PRs 2 and 3 each add a
major changeset with their own migration rows; changesets merge them into one 3.0.0 entry.

| # | PR | Stories | Content |
|---|---|---|---|
| 1 | `feat(discord): render a View in V1 or V2` | US2 (+ US1 type rules) | `discord/view/*`, `AnySelectMenu`; type tests, render and validation tests. Additive: nothing sends views yet. |
| 2 | `refactor(discord)!: send views on every reply path` | US1, US4 | `sendView` (replaces `sendEmbed`), `Context.reply(view)`, presenter → `View`, default presenter unchanged output, `module-*-view`, guards, routers, lifecycle dispatcher; test support spies; V2 presenter test double; changeset rows. |
| 3 | `refactor(discord)!: interactive messages and paginators render views` | US3, US5 | collector/mount on `View`, `previous` layout and `ViewLayoutSwitchError`, paginators, settings editor views, delete `ui/card.ts`, `interactive-message-payload.ts`, `message-edit-options.ts`; `components-v2-flag` test; changeset rows incl. card → container table. |
| 4 | `feat(sandbox): demo V2 views` | FR-020, SC-007 | `/view-demo message` and `/view-demo pages`, catalog keys, README; hand check recorded in the PR (quickstart §3). |

## Complexity Tracking

No constitution violation to justify.
