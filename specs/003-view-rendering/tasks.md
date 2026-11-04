---

description: "Task list for One View for Components V1 and V2"
---

# Tasks: One View for Components V1 and V2

**Input**: Design documents from `/specs/003-view-rendering/`

**Prerequisites**: plan.md, spec.md, research.md (R1 to R12), data-model.md,
contracts/public-api.md, quickstart.md

**Tests**: Required. Constitution VII (test-first): every implementation task is preceded by a
failing test task, and the test must fail for the right reason before the code exists.

**Organization**: grouped by user story, following the plan's four stacked pull requests:
PR 1 = Phase 2 + US2, PR 2 = US1 + US4, PR 3 = US3 + US5, PR 4 = sandbox and polish.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: user story from spec.md
- Paths are relative to the repository root. Tests mirror `packages/kernel/src/` under
  `packages/kernel/tests/`. `@/` = `packages/kernel/src/`.
- Every new public file gets its own explicit entry in `packages/kernel/package.json` `exports`
  (no wildcard), in the same task that creates it; every removed file loses its entry in the same
  task that deletes it; `tests/package-exports.test.ts` must stay green.
- Every export carries JSDoc; errors are typed classes from `@/discord/view/view-errors`, never a
  bare `Error`; Discord limits are the `MAX_*` constants of `@/discord/view/view-limits`, never a
  literal at the call site.
- Every task ends green on `pnpm typecheck && pnpm lint && pnpm knip && pnpm test`.

---

## Phase 1: Setup

- [ ] T001 Create the branch `feat/003-view-render` from `main`; check `.specify/feature.json` points at `specs/003-view-rendering`

---

## Phase 2: Foundational (PR 1, blocks every story)

**Purpose**: the view type, its limits and errors. Additive; nothing sends views yet.

- [ ] T002 [P] Create `packages/kernel/src/discord/view/view-limits.ts` with `MAX_V2_COMPONENTS = 40`, `MAX_V2_TEXT_CHARACTERS = 4000`, `MAX_SECTION_TEXTS = 3`, `MAX_GALLERY_ITEMS = 10`, `MAX_MEDIA_DESCRIPTION = 1024`, `MAX_ROW_BUTTONS = 5`, `MAX_MESSAGE_ROWS = 5`, `MAX_MESSAGE_EMBEDS = 10`, each with a JSDoc citing its source (research R1); subpath `./discord/view/view-limits`
- [ ] T003 [P] Create `packages/kernel/src/discord/view/view-errors.ts`: `ViewLimitError` (`limit: string` = the constant's name, `actual: number`, `max: number`), `MissingAttachmentError` (`name: string`), `EmptyViewError` (`layout: "v1" | "v2"`), `ViewLayoutSwitchError`; messages name the limit or file, never echo user content; subpath `./discord/view/view-errors`
- [ ] T004 Move `CardSelectMenu` from `packages/kernel/src/discord/ui/card.ts` to `packages/kernel/src/discord/interaction/select-menu.ts` as `AnySelectMenu` (`{ readonly id: string; apply(forceDisabled?: boolean): AnySelectMenuBuilder }`, same JSDoc); `card.ts` imports it from there (no re-export; `CardSelectMenu` stays as `type CardSelectMenu = AnySelectMenu` only until T040 deletes `card.ts`, so 2.x consumers keep compiling within PR 1)
- [ ] T005 Create `packages/kernel/src/discord/view/view.ts` with the types of data-model.md "View" and "V2 components" exactly: `View<S = never> = V1View<S> | V2View<S>`; `ViewBase` holding `files?: MessageFile[]` (imported from `@/discord/ui/message-attachments`) and `allowedMentions?: MessageMentionOptions` with the JSDoc moved from `InteractiveMessagePayloadBase` ("left out = keep the message's attachments"); `V1View` (`content?`, `embeds?: readonly EmbedBuilder[]`, `rows?: readonly (ViewRow<S> | null)[]`, `components?: never`); `V2View` (`components: readonly (V2Component<S> | null)[]`, `content?: never`, `embeds?: never`, `rows?: never`); nodes `TextNode`, `ContainerNode<S>` (`children: readonly (ContainerChild<S> | null)[]`), `SectionNode<S>` (`texts: readonly [string] | readonly [string, string] | readonly [string, string, string]`, `accessory: { readonly button: Button<S> } | { readonly thumbnail: MediaItem }`), `SeparatorNode` (`spacing?: "small" | "large"`, `divider?`), `GalleryNode` (`items: readonly MediaItem[]`), `FileNode` (`name`, `spoiler?`), `ButtonsRow<S>`, `SelectRow` (`menu: AnySelectMenu`), `ContainerChild<S>` (every node but `ContainerNode`), `ViewRow<S>`, `MediaItem` (`url`, `description?`, `spoiler?`); subpath `./discord/view/view`

**Checkpoint**: types compile; no behaviour yet.

---

## Phase 3: User Story 2 - Compose a full V2 message (Priority: P1, PR 1)

**Goal**: `renderView` validates and compiles any view, V1 or V2, with the V2 flag set in one
place.

**Independent Test**: `render-view.test.ts` renders a view with text, two containers, a section
with a button, a section with a thumbnail, a separator, a gallery, a file and a button row to the
expected Discord JSON in order, and refuses each limit one item over.

### Tests for User Story 2

- [ ] T006 [P] [US2] Write `packages/kernel/tests/discord/view/view-types.test.ts` with `expectTypeOf` and `@ts-expect-error` lines: a view with `embeds` and `components` does not compile; `content` with `components` does not compile; `rows` with `components` does not compile; a container inside a container's `children` does not compile; a section with `texts: []` or four texts does not compile; a section accessory with both `button` and `thumbnail` does not compile; a section without `accessory` does not compile; a view without buttons is assignable to `View` (no type argument). Must fail typecheck before T005 exists
- [ ] T007 [P] [US2] Write `packages/kernel/tests/discord/view/validate-view.test.ts`: V2 with 41 components (nested counted) → `ViewLimitError` `limit: "MAX_V2_COMPONENTS"`; 4001 characters across text and section texts → `MAX_V2_TEXT_CHARACTERS`; gallery with 0 or 11 items → `MAX_GALLERY_ITEMS`; media description of 1025 → `MAX_MEDIA_DESCRIPTION`; buttons row with 0 or 6 buttons → `MAX_ROW_BUTTONS`; V1 with 6 rows → `MAX_MESSAGE_ROWS`; V1 with 11 embeds → `MAX_MESSAGE_EMBEDS`; V2 with only nulls → `EmptyViewError` `layout: "v2"`; V1 with nothing → `EmptyViewError` `layout: "v1"`; container with only nulls → `EmptyViewError`; `file` named `a.txt` with `files` lacking it → `MissingAttachmentError` `name: "a.txt"`; with `files` left out and `attachments` holding `a.txt` → passes; exactly-at-limit views pass
- [ ] T008 [P] [US2] Write `packages/kernel/tests/discord/view/render-view.test.ts`: each node kind compiles to the expected `toJSON()` (text display; container with accent and spoiler; section with 1–3 text displays and a button accessory rendered with `button.apply(state, disabled)`; section with a thumbnail accessory; separator `small` → `SeparatorSpacingSize.Small`, `large` → `Large`, `divider`; gallery items; file → `attachment://<name>` and spoiler; buttons row via `createActionRow`; select row via `menu.apply(disabled)`); order preserved and nulls skipped at top level and in containers; `disabled: true` disables every button and select in both layouts; V2 payload has `flags` containing `IsComponentsV2` and no `content`/`embeds`; V2 + `ephemeral` has both flags; V1 has no V2 flag and carries `content`, `embeds`, rows; V1 + `ephemeral` has `Ephemeral` only; `files` passed through, left out → no `files`/`attachments` key (same rule as `toMessageEditOptions` today, see its tests); `allowedMentions` passed through; `previous: "v2"` with a V1 view → `ViewLayoutSwitchError`; `previous: "v1"` with a V2 view passes; validation errors from T007 surface before any builder runs (spy on `ContainerBuilder` not called)

### Implementation for User Story 2

- [ ] T009 [US2] Implement `packages/kernel/src/discord/view/validate-view.ts` (`validateView(view, attachments)`; counts components nested, sums text of `text` contents and `section` texts, checks every rule of data-model.md "Validation" with the T002 constants and T003 errors) until T007 passes
- [ ] T010 [US2] Implement `packages/kernel/src/discord/view/compile-v2-component.ts` (one node → its discord.js builder, table in data-model.md "Rendering"; reuse `createActionRow` from `@/discord/interaction/button` for `buttons`; no flag handling here)
- [ ] T011 [US2] Implement `packages/kernel/src/discord/view/render-view.ts`: `RenderOptions<S>` and `RenderedMessage` per contracts/public-api.md; `renderView` validates (T009), throws `ViewLayoutSwitchError` on `previous: "v2"` + V1, compiles V1 (embeds, rows through T010's row compilation) or V2 (T010), and sets flags; the only file naming `MessageFlags.IsComponentsV2` besides the existing interactive-message mount (removed in T037); port the attachment handling of `packages/kernel/src/discord/components/interactive-message/message-edit-options.ts` (do not duplicate it: T037 deletes that file); subpath `./discord/view/render-view`; T006–T008 pass
- [ ] T012 [US2] Gate for PR 1: `pnpm typecheck && pnpm lint && pnpm knip && pnpm test && pnpm build` from the root, zero errors, zero warnings (knip treats the `package.json` `exports` files as entries, so the new public files count as used before PR 2 consumes them)

**Checkpoint**: PR 1 `feat(discord): render a View in V1 or V2` ready.

---

## Phase 4: User Story 1 - Answer a command in V1 or V2 with the same call (Priority: P1, PR 2)

**Goal**: every reply path takes a view.

**Independent Test**: `send-view.test.ts` sends a V1 and a V2 view in each interaction state
(not answered, deferred, already answered), ephemeral or not, and asserts the recorded payloads.

### Tests for User Story 1

- [ ] T013 [US1] Create the branch `refactor/003-send-views` from `feat/003-view-render`
- [ ] T014 [US1] Extend `packages/kernel/tests/support/bot-interaction.ts`: `createBotInteraction` gains `deferReply`, `editReply`, `followUp`, `update` spies that flip `deferred`/`replied` like discord.js, and `sentPayloads()` returning every recorded payload with its method name; existing callers unchanged
- [ ] T015 [US1] Write `packages/kernel/tests/discord/command/send-view.test.ts` (replacing `send-embed.test.ts`, keeping each of its assertions translated to views) on T014's helper: not answered → `reply`; deferred → `editReply`; replied → `followUp`; V2 payload carries `IsComponentsV2` on all three, plus `Ephemeral` when `ephemeral: true`; V1 payload carries embeds and no V2 flag; a `ViewLimitError` rejects before any send and is not swallowed
- [ ] T016 [P] [US1] Update `packages/kernel/tests/discord/command/context.test.ts` (or the file covering `Context.reply`): `ctx.reply` accepts a V1 and a V2 view and sends them through `sendView`

### Implementation for User Story 1

- [ ] T017 [US1] Create `packages/kernel/src/discord/command/send-view.ts`: `sendView(interaction, view, { ephemeral }, logger)` with the three branches of `send-embed.ts`, payload from `renderView`; delete `packages/kernel/src/discord/command/send-embed.ts` and `tests/discord/command/send-embed.test.ts`; swap the `./discord/command/send-embed` subpath for `./discord/command/send-view`; update `CLAUDE.md` "Sending a reply whatever the interaction state" row to `sendView` (`@/discord/command/send-view`); T015 passes
- [ ] T018 [US1] `packages/kernel/src/discord/command/context.ts`: `reply(view: View)` through `sendView`; update every kernel caller; T016 passes

**Checkpoint**: module commands can answer in V1 or V2.

---

## Phase 5: User Story 4 - Kernel replies follow the bot's chosen layout (Priority: P2, PR 2)

**Goal**: the presenter returns views; every kernel-written reply goes through it or a view.

**Independent Test**: a bot built with a V2 presenter double answers a failing command, a guard
denial, a disabled module, an unavailable module and a "restarting" state in V2; the default
presenter's embeds are byte-identical to 2.x.

### Tests for User Story 4

- [ ] T019 [P] [US4] Create `packages/kernel/tests/support/v2-presenter.ts`: `createV2Presenter()` implementing `Presenter` with each method returning `{ components: [{ type: "container", children: [{ type: "text", content: <kind>: <message> }] }] }` (system error includes the reference)
- [ ] T020 [P] [US4] Update `packages/kernel/tests/discord/default-presenter.test.ts`: each method returns a V1 view whose single embed's `toJSON()` equals the 2.x embed (title, description, colour from `EMBED_COLORS`, system-error footer) (FR-015)
- [ ] T021 [US4] Write `packages/kernel/tests/bot/v2-presenter-replies.test.ts` with `startFakeBot` and `createV2Presenter`: a throwing command → V2 system error with its reference; a guard denial → V2 denial; a module disabled on the guild → V2; a module unavailable → V2; an interaction during "restarting" → V2; a failing component handler → V2. One `it` per kind (SC-005). Same scenarios with the default presenter → V1 embeds

### Implementation for User Story 4

- [ ] T022 [US4] `packages/kernel/src/discord/presenter.ts`: every method returns `View`; `packages/kernel/src/discord/default-presenter.ts` returns `{ embeds: [buildEmbed(...).setColor(...)] }` unchanged otherwise; T020 passes
- [ ] T023 [US4] Rename `packages/kernel/src/discord/settings/module-disabled-embed.ts` → `module-disabled-view.ts` (`moduleDisabledView`) and `module-unavailable-embed.ts` → `module-unavailable-view.ts` (`moduleUnavailableView`), both built through the presenter (`denial` and `warning`, same catalog keys as today) and returning `View`; swap their subpaths; move their tests; update the two `CLAUDE.md` rows ("The unavailable-module reply", "The 'disabled on this server' reply")
- [ ] T024 [US4] Send through `sendView` in `packages/kernel/src/discord/command/command-responders.ts`, `packages/kernel/src/discord/command/passes-guard.ts`, `packages/kernel/src/discord/command/create-command.ts`, `packages/kernel/src/discord/components/component-router.ts`, `packages/kernel/src/bot/lifecycle-dispatcher.ts` (replace every direct `{ embeds: [...], flags }` reply); T021 passes
- [ ] T025 [US4] Update the sandbox to the new signatures (`apps/sandbox-bot/src/**`: `ctx.reply(embed)` → `ctx.reply({ embeds: [embed] })`, any presenter use); sandbox builds and its tests pass
- [ ] T026 [US4] Add `.changeset/<name>.md` (major, `@azurioh/discord-kernel`) for PR 2 with the 2.0.0 CHANGELOG format ("Breaking change: migration" table): `sendEmbed` → `sendView` (old/new subpath), `moduleDisabledEmbed` → `moduleDisabledView`, `moduleUnavailableEmbed` → `moduleUnavailableView`, `Presenter` methods → `View`, `Context.reply(embed)` → `reply(view)` with the one-line rewrite `{ embeds: [embed] }`
- [ ] T027 [US4] Gate for PR 2: `pnpm typecheck && pnpm lint && pnpm knip && pnpm test && pnpm build`, zero errors, zero warnings

**Checkpoint**: PR 2 `refactor(discord)!: send views on every reply path` ready.

---

## Phase 6: User Story 3 - Use views in paginators and interactive messages (Priority: P2, PR 3)

**Goal**: interactive messages and paginators render views in either layout; the V2 flag lives in
`render-view.ts` only.

**Independent Test**: a paginator with V2 pages and one with V1 pages both navigate and end with
disabled controls in their layout; a V2 → V1 update is refused; the settings editor's tests keep
every assertion.

### Tests for User Story 3

- [ ] T028 [US3] Create the branch `refactor/003-interactive-views` from `refactor/003-send-views`
- [ ] T029 [P] [US3] Write `packages/kernel/tests/constitution/components-v2-flag.test.ts`: scan `packages/kernel/src/**/*.ts`; fail if `IsComponentsV2` appears in any file other than `discord/view/render-view.ts`, naming the offenders (fails until T037)
- [ ] T030 [P] [US3] Update the interactive-message tests under `packages/kernel/tests/discord/components/interactive-message/`: `InteractiveView.render` returns `View<S>`; the ended render disables every control in V1 and in V2 (replaces `disabledControls` cases); a render going from V2 to V1 throws `ViewLayoutSwitchError` and nothing is sent; V1 → V2 is sent with the flag
- [ ] T031 [P] [US3] Update `packages/kernel/tests/discord/components/paginator/*.test.ts`: `PaginatorRender` returns a view; V1 pages get the navigation row appended to `rows`; V2 pages get a `buttons` node appended to `components`; next/previous and the ended state work in both layouts
- [ ] T032 [P] [US3] Update `packages/kernel/tests/discord/components/persistent-paginator.test.ts`: `PersistentPage` is `{ view, pageCount }`; V2 pages survive a restart with the flag; replace its local `Extract<InteractiveMessagePayload…>` helper
- [ ] T033 [US3] Create `packages/kernel/tests/support/view-parts.ts` (shared narrowing helpers for V1 and V2 views, replacing the local `Extract<InteractiveMessagePayload<S>, …>` helpers in `persistent-paginator.test.ts` and `settings-editor-view.test.ts`), and update the settings-editor tests (`tests/discord/components/settings-editor/*.test.ts`) to it without removing any assertion (SC-006)

### Implementation for User Story 3

- [ ] T034 [US3] `packages/kernel/src/discord/components/interactive-message/interactive-message-collector.ts`: `InteractiveView<S> { render(state): View<S> }` (drop `disabledControls` and `DisabledInteractiveMessageComponents`); `renderOnto` uses `renderView` with the collector's last rendered layout as `previous`; ended render = `renderView(view.render(state), { state, disabled: true, previous })`; T030 passes
- [ ] T035 [US3] `packages/kernel/src/discord/components/paginator/paginator-view.ts` (`PaginatorRender<T>` → `View<PageState>`, navigation appended per layout; drop `PaginatorPayload`) and `packages/kernel/src/discord/components/paginator/mount-paginator.ts`; T031 passes
- [ ] T036 [US3] `packages/kernel/src/discord/components/persistent-paginator.ts`: `PersistentPage { view; pageCount }`, renders through `renderView` with the message's attachments; T032 passes
- [ ] T037 [US3] `packages/kernel/src/discord/components/interactive-message/mount-interactive-message.ts`: first `editReply` through `renderView` (flag no longer set here); delete `interactive-message-payload.ts` and `message-edit-options.ts` with their subpaths and tests (their cases now live in `render-view.test.ts`, T008); update `packages/kernel/src/discord/components/interactive-message/index.ts` and `packages/kernel/src/discord/components/paginator/index.ts` to drop removed re-exports and re-export `View` with `export { } from` where they re-exported the payload type; T029 passes
- [ ] T038 [US3] `packages/kernel/src/discord/components/settings-editor/settings-editor.view.ts`: V1 render returns `{ embeds, rows }` with `buttons` / `select` row nodes instead of pre-built `ActionRowBuilder`s; `SettingsEditorEmbedsChrome` unchanged otherwise
- [ ] T039 [US3] `packages/kernel/src/discord/components/settings-editor/settings-editor-card.view.ts`: build `{ components: [{ type: "container", accent, children }, ...outer row as a buttons node] }` per research R9 (`entry` with `action` → `section` with `texts: ["**title**\n" + lines]` and `{ button }`; `entry` without accessory → `text` with the same string; `text`, `separator`, `controls` → `text`, `separator`, `buttons`); keep `MAX_CARD_LEVEL_ENTRIES` and `BUTTONS_PER_ROW` logic; T033's settings-editor tests pass unchanged in what they assert

**Checkpoint**: interactive messages, paginators and the settings editor run on views.

---

## Phase 7: User Story 5 - Move from `createCard` to the container node (Priority: P3, PR 3)

**Goal**: `createCard` is gone; its users have a documented replacement for each block.

**Independent Test**: every 2.x card block kind, rewritten per the migration table, renders the
same component JSON.

- [ ] T040 [US5] Write `packages/kernel/tests/discord/view/card-migration.test.ts`: for each row of contracts/public-api.md "Card block → container child", the container child's rendered JSON equals what `createCard` produced in 2.0.0 (expected JSON copied from `tests/discord/ui/card.test.ts` before deletion); then delete `packages/kernel/src/discord/ui/card.ts`, `tests/discord/ui/card.test.ts` and the `./discord/ui/card` subpath (remove the temporary `CardSelectMenu` alias from T004); move any `card.test.ts` case not covered by `validate-view.test.ts` or `render-view.test.ts` into them
- [ ] T041 [US5] Add `.changeset/<name>.md` (major) for PR 3 with: removed subpaths (`./discord/ui/card`, `…/interactive-message-payload`, `…/message-edit-options`), removed symbols and replacements (`InteractiveMessagePayload` → `View`, `DisabledInteractiveMessageComponents` → `renderView(…, { disabled: true })`, `toMessageEditOptions` → `renderView`, `PaginatorPayload` → `View<PageState>`, `CardSelectMenu` → `AnySelectMenu`, `MAX_CARD_*` → `MAX_V2_*`), changed types (`InteractiveView`, `PaginatorRender`, `PersistentPage`), and the full card block → container child table from contracts/public-api.md
- [ ] T042 [US5] Update the sandbox for PR 3 signatures (`apps/sandbox-bot/src/components/paginator/paginator.component.ts` and its `createPaginatorRender`: return `{ embeds: [embed] }`); sandbox builds and its tests pass
- [ ] T043 [US5] Gate for PR 3: `pnpm typecheck && pnpm lint && pnpm knip && pnpm test && pnpm build`, zero errors, zero warnings

**Checkpoint**: PR 3 `refactor(discord)!: interactive messages and paginators render views` ready.

---

## Phase 8: Polish and sandbox demo (PR 4)

**Purpose**: FR-020 and SC-007, the hand check, documentation.

- [ ] T044 Create the branch `feat/003-sandbox-views` from `refactor/003-interactive-views`
- [ ] T045 Create `apps/sandbox-bot/src/modules/demo/commands/view-demo/` following `apps/sandbox-bot/README.md` "Project layout": `view-demo.command.ts`; `message/{message.definition, message.handler, message.view}.ts` (option `ephemeral`; view: top-level `text`, two `container`s with different `accent`s, a `section` with a button whose handler answers through `ctx.reply`, a `section` with a thumbnail, a `separator`, a `gallery` of two image URLs, a `file` named `view-demo.txt` sent in `files` from an in-memory buffer); `pages/{pages.definition, pages.handler, pages.view}.ts` (a V2 paginator over a fixed list of 12 items, 4 per page); register it in the demo module; texts as catalog keys in the demo catalog (en, fr with "vous"), names via `*_MESSAGES`; imports from public subpaths only
- [ ] T046 [P] Add sandbox tests for `message.view.ts` and `pages.view.ts` (render each with `renderView` and assert node order and the file component) under `apps/sandbox-bot/tests/` mirroring the folder
- [ ] T047 [P] Update `CLAUDE.md` "One definition per concept" table: add rows for `View` (`@/discord/view/view`), `renderView` (`@/discord/view/render-view`, the only place that sets the V2 flag), view limits (`@/discord/view/view-limits`); update `packages/kernel/README.md` sections that mention `createCard`, `sendEmbed` or embeds-only replies
- [ ] T048 Hand check on Discord per quickstart.md §3 (steps 1–6), including the local, uncommitted 11-children container check; if Discord rejects it, add `MAX_CONTAINER_CHILDREN` to `view-limits.ts` with a validation rule and test before merging; record the results in the PR description
- [ ] T049 Gate for PR 4: `pnpm typecheck && pnpm lint && pnpm knip && pnpm test && pnpm build`, zero errors, zero warnings
- [ ] T050 After PR 4 merges: set roadmap spec 1 in `docs/roadmap.md` to "Specified and delivered (`specs/003-view-rendering`)" with a one-paragraph delivery note, as spec 2's entry

---

## Dependencies & Execution Order

### Phase dependencies

- Setup (T001) → Foundational (T002–T005) → US2 (T006–T012): PR 1.
- US1 (T013–T018) needs PR 1. US4 (T019–T027) needs T017 (`sendView`). Both in PR 2.
- US3 (T028–T039) needs PR 2 (presenter and `sendView` settled). US5 (T040–T043) needs T034–T039
  (no caller of `createCard` left). Both in PR 3.
- Polish (T044–T050) needs PR 3.

### Within each story

- Tests first, failing for the right reason (missing type or behaviour), then implementation.
- Types (T005) before validation (T009) before compilation (T010) before render (T011).
- Gate task last in each PR.

### Parallel opportunities

- T002 and T003 (different new files).
- T006, T007, T008 (three new test files).
- T016 with T015 (different test files).
- T019 and T020 (different files).
- T029, T030, T031, T032 (disjoint test files).
- T046 and T047 (sandbox tests vs. docs).

## Parallel Example: User Story 2

```text
Task: "T006 view-types.test.ts compile-time rules"
Task: "T007 validate-view.test.ts limits and attachments"
Task: "T008 render-view.test.ts node compilation and flags"
```

## Implementation Strategy

### MVP first

PR 1 (Phase 2 + US2) is the smallest shippable increment: the view type and renderer, additive,
releasable as a minor if PR 2 slips. PR 2 makes it usable from every reply (US1 + US4). PR 3 ends
the dual model and removes `createCard`. PR 4 proves it on Discord.

### Stacked delivery

| PR | Branch | Tasks | Stories |
|---|---|---|---|
| 1 | `feat/003-view-render` | T001–T012 | Foundational, US2 |
| 2 | `refactor/003-send-views` | T013–T027 | US1, US4 |
| 3 | `refactor/003-interactive-views` | T028–T043 | US3, US5 |
| 4 | `feat/003-sandbox-views` | T044–T050 | polish |
