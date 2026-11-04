# Feature Specification: One View for Components V1 and V2

**Feature Branch**: `spec/003-view-rendering`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "Rendering: a single View type for Discord Components V1 and V2
(roadmap spec 1). Problem: bots built on the kernel can send Components V2 only through
mountInteractiveMessage; every other send path (ctx.reply, sendEmbed, followUp, guards, routers,
lifecycle dispatcher, paginators, Presenter) accepts only V1 embeds, and the V2 DSL (createCard)
builds a single Container with no top-level text, no File, no multiple containers. Users: module
authors (sandbox bot, then the BSK bot) who want to choose V1 or V2 per message. Requirements: one
View<S> type, either V1 { embeds, rows } or V2 { components } written as plain data objects tagged
by `type`; mixing V1 and V2 fails at compile time. V2 nodes: text, container (accent, children),
section (button or thumbnail accessory), separator, gallery, file, control and select rows. Every
send path takes a View and sets IsComponentsV2 itself, from one place. Presenter returns a View;
DefaultPresenter stays V1. InteractiveMessagePayload is replaced by View. createCard is removed;
the settings-editor card view moves to the container node. Discord limits (component count, text
length) are checked by the kernel before sending, through named constants. Breaking: major 3.0.0
with a createCard -> container migration note. Non-goals: V1 embeds as data (V1 keeps
EmbedBuilder); settings-editor visual redesign; changes to V2 modals (createModal, promptModal); V2
components outside the listed set; the BSK migration."

## Clarifications

### Session 2026-11-04

- Q: What shape does the V2 DSL take? → A: Plain data objects tagged by `type` (like today's card
  blocks), not helper functions and not Discord builders.
- Q: What happens to `createCard`? → A: Removed in 3.0.0; each card block maps to a container
  child, with a migration note. No deprecation period.
- Q: Does the presenter return views? → A: Yes; the default presenter stays V1.
- Q: Does the kernel refuse a V2 → V1 edit everywhere? → A: Only where it owns the message
  (paginators, interactive message); elsewhere Discord's rejection is surfaced and logged.

## Context

Discord offers two message layouts. The classic one (V1) is a text content, up to ten embeds and
up to five rows of buttons or selects. The newer one (Components V2) replaces all of it with a tree
of components (text displays, containers, sections, separators, media galleries, files) and is
switched on per message by a flag; a V2 message must not carry content or embeds.

The kernel covers V1 everywhere: `buildEmbed`, buttons, action rows and the four selects, and every
send path takes embeds. V2 is reachable from one place only: an interactive message mounted with a
card layout, which is also the only code that sets the V2 flag. Its builder, `createCard`, makes a
single container; a module cannot put text above it, send two containers, attach a file component,
or answer a plain command, a guard denial or a kernel error in V2. A module author who wants V2
today has to leave the kernel and call the Discord library by hand, which bypasses the reply-state
handling, the limits and the localisation the kernel provides.

`createCard` has one user inside the kernel (the settings editor's card view), one test file and no
user in the sandbox. It is public since 2.0.0.

## User Scenarios & Testing *(mandatory)*

One kind of user is involved: the **module author**, a developer who writes commands, components
and views for a bot built on the kernel. Guild members only see the result (a message in one layout
or the other).

### User Story 1 - Answer a command in V1 or V2 with the same call (Priority: P1)

A module author describes a message once, as a view: either V1 (embeds and rows) or V2 (a list of
components). They hand it to the reply they already use. The kernel sends it whatever the
interaction state (not answered, deferred, already answered) and switches the V2 flag on by itself
when the view is V2.

**Why this priority**: it is the feature. Every other story reuses the view and the single send
point this story introduces.

**Independent Test**: a test command replies once with a V1 view and once with a V2 view, through
the command context, in each interaction state; the recorded payloads carry embeds and no flag for
the first, components and the V2 flag (and no content, no embeds) for the second.

**Acceptance Scenarios**:

1. **Given** a command that has not answered yet, **When** it replies with a V2 view, **Then** the
   message is sent with the V2 flag, the components, and no content or embeds.
2. **Given** a command that deferred its answer, **When** it replies with a V1 view, **Then** the
   deferred answer is edited with the embeds and rows, without the V2 flag.
3. **Given** a command that already answered, **When** it replies again with a view, **Then** the
   kernel sends a follow-up in the view's layout.
4. **Given** a module author writing a view, **When** the view holds both embeds and components,
   **Then** the bot does not compile.

---

### User Story 2 - Compose a full V2 message (Priority: P1)

A module author writes a V2 view as plain data: top-level text, several containers each with an
accent colour, sections with a button or a thumbnail beside them, separators, image galleries,
file components, and rows of buttons or selects. Buttons and selects are the same definitions as in
V1 and react to the same state.

**Why this priority**: without the full V2 vocabulary, the choice between V1 and V2 is not real.

**Independent Test**: a view with text, two containers, a section with a button, a section with a
thumbnail, a separator, a gallery, a file and a button row renders to the expected Discord
components, in order, with buttons disabled when the state disables them.

**Acceptance Scenarios**:

1. **Given** a V2 view with a top-level text then two containers, **When** it is rendered, **Then**
   the message holds a text display followed by two containers, in that order.
2. **Given** a file component naming an attachment, **When** the view is sent with that file,
   **Then** the file appears inline as a file component.
3. **Given** a file component naming an attachment that is not sent with the message, **When**
   the view is sent, **Then** the kernel refuses it before calling Discord, naming the missing file.
4. **Given** a section whose accessory is a button bound to the message state, **When** the state
   disables the button, **Then** the rendered button is disabled.
5. **Given** a view that exceeds a Discord limit (component count, total text length), **When** it
   is rendered, **Then** the kernel refuses it before calling Discord, naming the limit exceeded.

---

### User Story 3 - Use views in paginators and interactive messages (Priority: P2)

A module author builds a paginator or an interactive message whose pages or screens are views. A
page can be V1 or V2. The kernel keeps the controls (page buttons, close) working in both layouts
and disables them when the message ends.

**Why this priority**: lists and editors are where V2 layouts pay off most, and the settings editor
already relies on the interactive message.

**Independent Test**: a paginator whose pages are V2 views moves forward and back and ends with its
controls disabled; the same paginator with V1 pages behaves the same; the persistent paginator
does the same after a restart.

**Acceptance Scenarios**:

1. **Given** a paginator rendering V2 pages, **When** a member presses "next", **Then** the message
   is updated with the next V2 page and the V2 flag stays on.
2. **Given** an interactive message whose view is V2, **When** it times out, **Then** its buttons
   and selects are shown disabled in the same layout.
3. **Given** the settings editor in its card layout, **When** an administrator opens it, **Then** it
   looks and behaves as before this feature.

---

### User Story 4 - Kernel replies follow the bot's chosen layout (Priority: P2)

A bot author provides their own presenter that returns views. Every reply the kernel writes on its
own (confirmation, warning, error, denial, system error with incident reference, module disabled,
module unavailable, guard denial) then uses that layout. The default presenter keeps producing V1
replies.

**Why this priority**: a bot that switches to V2 should not mix V2 module messages with V1 kernel
errors.

**Independent Test**: a bot built with a presenter returning V2 views answers a failing command
with a V2 error; the same bot with the default presenter answers with a V1 embed.

**Acceptance Scenarios**:

1. **Given** a presenter that returns V2 views, **When** a command throws, **Then** the member sees
   a V2 system-error reply with its incident reference.
2. **Given** the default presenter, **When** a guard denies a command, **Then** the member sees the
   same V1 embed as before this feature.

---

### User Story 5 - Move from `createCard` to the container node (Priority: P3)

A module author who used `createCard` in 2.x reads the migration note of 3.0.0 and rewrites each
card as a container node: every card block has a direct counterpart in the container's children.

**Why this priority**: few users today, but the release must not strand them.

**Independent Test**: each 2.x card block kind, rewritten as the documented container child,
renders the same Discord component.

**Acceptance Scenarios**:

1. **Given** the 3.0.0 changeset, **When** a module author looks up a card block kind, **Then** the
   note names its container counterpart and the new import path.

---

### Edge Cases

- A V2 view with no components: refused before sending (Discord rejects an empty message).
- A V1 view with neither embeds nor rows nor content: refused before sending, as today.
- A V2 view sent as an edit of a message that was sent in V1, or the reverse: Discord does not let
  a message leave V2 once it is in V2. In paginators and interactive messages the kernel refuses
  the switch from V2 to V1 itself; on other send paths Discord's rejection is surfaced and logged
  (FR-011).
- An ephemeral reply in V2: the ephemeral flag and the V2 flag are both set.
- A view rendered for a state that disables every control (message ended): sections keep their
  text, accessories are disabled.
- A null entry in a list of children (conditional block): skipped, as card blocks are today.
- Text that exceeds a single text display's limit: refused, not silently cut; cutting stays an
  explicit choice of the author through the existing truncation helper.

## Requirements *(mandatory)*

### Functional Requirements

**The view**

- **FR-001**: The kernel MUST offer one view type, generic over the message state, that is either a
  V1 view (optional content, embeds, rows of buttons or selects) or a V2 view (a list of
  components).
- **FR-002**: A view that mixes V1 fields (content or embeds) with V2 components MUST fail to
  compile.
- **FR-003**: V2 components MUST be plain data objects tagged by a `type` field, with no Discord
  library type in their shape except the button and select definitions the kernel already owns.
- **FR-004**: The V2 vocabulary MUST include: text display, container (optional accent colour,
  optional spoiler, children), section (one to three text lines, accessory: a button or a
  thumbnail), separator (spacing, divider), media gallery, file, row of buttons, row of one select.
  Text display, section, separator, gallery, file and rows MUST be usable both at the top level and
  inside a container; containers MUST NOT nest.
- **FR-005**: Lists of components MUST accept null entries and skip them.
- **FR-006**: Buttons and selects in a V2 view MUST be the existing button and select definitions,
  rendered against the message state like in V1.

**Rendering and sending**

- **FR-007**: The kernel MUST turn a view into a Discord message payload in one place, and that
  place MUST be the only source file that sets the V2 flag.
- **FR-008**: Every kernel send path MUST take a view: the command context reply, the
  state-independent send helper (reply, edit of a deferred answer, follow-up), guard denials, the
  command and component routers' error and disabled replies, the lifecycle dispatcher, the
  paginator, the persistent paginator and the interactive message.
- **FR-009**: Rendering MUST check Discord's limits for the layout (V2: total component count,
  total text length, items per gallery, text lines per section, buttons per row, one select per
  row; V1: the existing embed limits and rows per message) through named constants, and MUST refuse a view
  that exceeds one before any call to Discord, with an error naming the limit.
- **FR-010**: Rendering MUST refuse a file component whose attachment is not part of the message.
- **FR-011**: Where the kernel owns the message across updates (paginator, persistent paginator,
  interactive message), an update from a V2 view to a V1 view MUST be refused with an error before
  any call to Discord; V1 to V2 MUST be allowed. Elsewhere the kernel does not track a message's
  layout: Discord's rejection is surfaced as an error and logged, never swallowed.
- **FR-012**: Ephemeral replies MUST keep working in both layouts.
- **FR-013**: The interactive-message payload type MUST be replaced by the view; the paginator and
  persistent paginator page types MUST return views.

**Kernel replies**

- **FR-014**: The presenter port MUST return views for every reply kind it produces.
- **FR-015**: The default presenter MUST return V1 views that render exactly as its embeds did in
  2.x (same title, description, colour, footer).
- **FR-016**: Every reply the kernel writes on its own (module disabled, module unavailable, guard
  denial, system error) MUST go through the presenter or a view, so a V2 presenter changes all of
  them.

**Migration**

- **FR-017**: `createCard`, its card types and its public subpath MUST be removed; every card block
  kind MUST have a container child that renders the same component.
- **FR-018**: The settings editor's card view MUST render through the container node with no visible
  change.
- **FR-019**: The release MUST be a major version (3.0.0) whose changeset lists each removed or
  changed export with its replacement (old path → new path, card block → container child,
  embed-returning signatures → view-returning signatures).
- **FR-020**: The sandbox bot MUST demonstrate a V2 command reply (top-level text, at least two
  containers, a file) and a V2 paginator, through the public subpaths only.

### Key Entities

- **View**: what a module wants to show in one message; V1 or V2, never both. Generic over the
  state its buttons and selects read.
- **V1 view**: optional content, embeds (built with the existing embed helper), rows of buttons or
  one select.
- **V2 view**: an ordered list of V2 components.
- **V2 component**: a tagged data node: text, container, section, separator, gallery, file, button
  row, select row. A container holds the same nodes except containers.
- **Rendered message**: the Discord payload a view becomes for a given state: components or embeds,
  files, flags.
- **Presenter**: the port that turns a kernel reply kind (confirmation, warning, error, denial,
  system error) into a view.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A module author can answer a command in V1 or V2 by changing only the view they pass;
  the reply call is the same in 100% of send paths listed in FR-008.
- **SC-002**: Writing a view that mixes V1 and V2 fails to compile, proved by a compile-time test.
- **SC-003**: The V2 flag is set in exactly one source file of the kernel.
- **SC-004**: Every Discord limit listed in FR-009 is refused before sending, each proved by a test
  that sends one item over the limit.
- **SC-005**: A bot with a V2 presenter shows 0 V1 kernel replies across the reply kinds of
  FR-014 and FR-016, proved by one test per kind.
- **SC-006**: The settings editor's existing tests pass unchanged in what they assert after its
  card view moves to the container node.
- **SC-007**: The sandbox's V2 command and V2 paginator are checked by hand on Discord and render as
  described (text above two containers, a file, working page buttons).
- **SC-008**: The repository gate (type check, lint, dead-code check, tests, build) passes with zero
  errors and zero warnings.

## Assumptions

- V1 embeds stay built with the existing embed helper (Discord builder objects); describing embeds
  as data is out of scope.
- V2 modals (`createModal`, `promptModal`) already use the V2 modal components and are unchanged.
- Discord's current V2 rules apply: a V2 message carries no content and no embeds, at most 40
  components in total and 4000 characters of text across it; a message cannot go back from V2 to
  V1. The exact per-component limits are confirmed against the Discord documentation during
  planning.
- The settings editor keeps both its V1 and card layouts; redesigning it on views beyond the card
  view migration is a later feature (roadmap spec 1, "later").
- External users of `createCard` are few or none; a removal in a major release with a migration
  note is acceptable.
- Components outside the listed vocabulary (a standalone media component outside a gallery, new
  component types Discord may add) are out of scope.
- The BSK bot migration is a separate plan in its own repository.
