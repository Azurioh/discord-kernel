# Feature Specification: Module Settings — Declare Once, Render Everywhere

**Feature Branch**: `001-module-settings`

**Created**: 2026-09-23

**Status**: Draft

**Input**: User description: "Module settings — declare once, render everywhere. A bot author who
wants a module to be configurable must today hand-build one interface per surface, duplicate
validation, and has no machine-readable description that a web dashboard could render. The kernel
must let a module declare its settings once, as data, and derive every surface from that
declaration."

## User Scenarios & Testing *(mandatory)*

Two kinds of users are involved:

- **Bot author**: a developer who writes a feature module on top of the kernel.
- **Guild administrator**: a member of a Discord server who configures a bot for that server.
  Today they configure through Discord. A web dashboard is a later, separate feature; this
  feature only produces the description that the dashboard will consume.

### User Story 1 - Declare settings once and read them with types (Priority: P1)

A bot author declares the settings of their module in one place: each field has a kind (channel,
role, number, text…), a default value, and optional bounds. In the module's business logic, the
author reads the current settings of a guild and gets values whose types follow the declaration,
without writing any type by hand. A guild that has never been configured gets the defaults.

**Why this priority**: every other story renders or validates this declaration. Without it,
nothing else exists.

**Independent Test**: declare a module with one field of each kind, read the settings of an
unconfigured guild from an in-memory store, and check that every value equals its default and
that a wrongly typed use is rejected by the type checker.

**Acceptance Scenarios**:

1. **Given** a module declaration with defaults and a guild with no stored settings, **When** the
   author reads that guild's settings, **Then** every field returns its default and nothing is
   written to the store.
2. **Given** a module declaration, **When** the author accesses a field that is not declared,
   or treats a number field as text, **Then** the type checker reports an error.
3. **Given** stored settings for guild A, **When** the author reads settings for guild B,
   **Then** guild B gets its own values (or defaults) and never guild A's.

---

### User Story 2 - Validate once, for every surface (Priority: P1)

A guild administrator submits new values, through Discord today or through the web later. The
kernel validates the submission with the one validation derived from the declaration, and
either stores the values or returns errors that name the invalid fields, in the administrator's
language.

**Why this priority**: two validations drift. One shared validation is the core promise of the
feature and the precondition for opening a second surface safely.

**Independent Test**: submit the same set of valid and invalid values through the Discord path and
through the generic (surface-neutral) path, and check that both accept and reject exactly the same
values with the same error keys.

**Acceptance Scenarios**:

1. **Given** a number field with bounds 1 to 5, **When** an administrator submits 7, **Then** the
   submission is rejected with a translated error that names the field and the allowed range.
2. **Given** a required field without a default, **When** an administrator submits a change that
   leaves it empty, **Then** the submission is rejected.
3. **Given** a submission with one invalid field and one valid field, **When** it is validated,
   **Then** nothing is stored and all invalid fields are reported together.
4. **Given** a valid submission, **When** it is stored, **Then** a settings-changed notification is
   emitted with the guild, the module and the changed field names.

---

### User Story 3 - Configure from Discord without writing an interface (Priority: P2)

A bot author gets a working Discord configuration screen for their module from the declaration
alone. A guild administrator opens it, sees the fields grouped and ordered as declared, and edits
them. When there are more fields than Discord allows in one form, the screen splits them into
pages or several forms automatically.

**Why this priority**: it replaces today's hand-built screens and proves the declaration is
sufficient to render a real surface.

**Independent Test**: declare a module with more fields than one Discord form allows, open the
generated screen, and edit a field on the second page.

**Acceptance Scenarios**:

1. **Given** a declaration with 8 fields in 2 groups, **When** an administrator opens the screen,
   **Then** fields appear in their declared groups and order, and no Discord limit is exceeded.
2. **Given** a channel field restricted to text channels, **When** the administrator picks a value,
   **Then** only text channels are offered.
3. **Given** a secret field, **When** the administrator opens the screen, **Then** the field shows
   whether a value is set, never the value itself, and can be replaced or cleared.

---

### User Story 4 - Describe settings for other surfaces (Priority: P2)

A future HTTP API or web dashboard asks the kernel for the description of a module's settings in a
given language. It receives a standard, machine-readable schema with every label already
translated, plus the hints it needs to choose good controls (groups, order, units, examples,
autocomplete mode).

**Why this priority**: it is the contract that the later API and dashboard features build on.

**Independent Test**: request the description of a module in French and in a language with no
translations, validate both against the schema standard, and check the labels.

**Acceptance Scenarios**:

1. **Given** a module with French translations, **When** the description is requested in French,
   **Then** every label, description, group name, unit and static choice is in French.
2. **Given** a key missing in the requested language, **When** the description is requested,
   **Then** that key falls back to English and all other keys stay translated.
3. **Given** a module with a secret field, **When** the description is requested, **Then** the
   secret field is described as write-only and no value, default or example of it appears.
4. **Given** any module description, **When** it is checked against the schema standard,
   **Then** it is valid.

---

### User Story 5 - Suggest values while typing (Priority: P3)

A bot author adds suggestions to a field: either a fixed list of choices, or a function that
searches values on the server (for example, a game catalog). The same suggestions serve Discord
autocomplete and, later, the web. When a stored value is shown again, the administrator sees its
readable label, not its raw identifier. A field can be strict: only values the suggestions know
are accepted.

**Why this priority**: it greatly improves configuration comfort, but a module is usable without
it.

**Independent Test**: declare a field with a dynamic search, query it, store a suggested value,
read its label back, then try to store an unknown value on a strict field.

**Acceptance Scenarios**:

1. **Given** a field with a dynamic search, **When** an administrator types a query, **Then** at
   most 25 suggestions are returned, each with a translated label.
2. **Given** a dynamic search that takes longer than 2.5 seconds, **When** it is queried, **Then**
   the query ends with an empty result and a logged timeout, and the surface stays responsive.
3. **Given** a strict field, **When** an administrator submits a value the search does not know,
   **Then** the submission is rejected.
4. **Given** a stored identifier, **When** the field is displayed, **Then** its readable label is
   shown.
5. **Given** a search that depends on another field (for example, maps of the chosen game),
   **When** it is queried, **Then** it receives the other values currently entered.
6. **Given** a searchable field on the Discord screen, **When** the administrator opens it,
   **Then** a select menu lists the first 25 results for an empty query, and, if the field is not
   strict, a free text entry is also offered.

---

### User Story 6 - Evolve a module's settings safely (Priority: P3)

A bot author releases a new version of their module that adds, removes or reshapes settings.
Guilds configured with the old version keep working: new fields read their defaults, removed
fields are ignored, and reshaped fields are converted once by a migration the author provides.

**Why this priority**: required before any public bot ships a second version, but not before the
first.

**Independent Test**: store settings under version 1, change the declaration to version 2 with a
migration, and read the settings.

**Acceptance Scenarios**:

1. **Given** stored version-1 settings and a version-2 declaration that adds a field, **When** the
   settings are read, **Then** the new field returns its default.
2. **Given** a version-2 declaration with a migration, **When** version-1 settings are read,
   **Then** the migration runs once, the result is validated, and the stored settings move to
   version 2.
3. **Given** a migration whose result fails validation, **When** it runs, **Then** the stored
   settings are left unchanged, an error is reported, and the guild reads defaults for the invalid
   fields.

---

### User Story 7 - Enable or disable modules per guild (Priority: P2)

A guild administrator chooses which of the bot's modules are active on their server, without
affecting any other server. A bot author gives each module a default state (enabled or disabled).
On a guild where a module is disabled, its commands and interactive components answer with a
translated message saying the module is disabled on this server, and its guild-bound event
handlers are not run for that guild.

**Why this priority**: public bots ship many modules; each server needs only some of them.

**Independent Test**: disable a module on guild A, run one of its commands on guild A and on
guild B.

**Acceptance Scenarios**:

1. **Given** a module disabled on guild A, **When** a member runs its command on guild A,
   **Then** the command does not run and a translated "disabled on this server" message is shown.
2. **Given** the same module, **When** a member runs the command on guild B where it is enabled,
   **Then** the command runs normally.
3. **Given** a module declared as disabled by default, **When** a guild has never changed it,
   **Then** the module is disabled on that guild.
4. **Given** a module disabled on guild A, **When** a guild-bound event for guild A occurs,
   **Then** the module's handler is not run for that event.

---

### User Story 8 - Choose the bot's language per guild (Priority: P2)

A guild administrator sets the language the bot uses on their server. The bot uses it whenever
the member's own language is not available.

**Why this priority**: public bots serve communities in many languages; the member's Discord
language is not always the community's language, and not always supported.

**Independent Test**: set the guild language to French, then trigger a message for a member whose
Discord language is not supported.

**Acceptance Scenarios**:

1. **Given** a guild language set to French and a member whose language is unsupported, **When**
   the bot replies, **Then** the reply is in French.
2. **Given** a member whose language is supported, **When** the bot replies, **Then** the reply is
   in the member's language.
3. **Given** no guild language set, **When** the member's language is unsupported, **Then** the
   bot uses the server's Discord language if supported, otherwise English.

---

### User Story 9 - Know when a module is not configured yet (Priority: P2)

Some module features cannot work until an administrator sets required values (for example, the
channel where tickets are created). A bot author marks which commands need the module to be
configured. Until it is, those commands answer with a translated message telling the member that
an administrator must configure the module; the module's other commands keep working.

**Why this priority**: modules are usable per guild with defaults, and a missing required value
must fail clearly instead of silently.

**Independent Test**: declare a required field without default, run a command that needs it and
one that does not, then set the field and run the first command again.

**Acceptance Scenarios**:

1. **Given** a required field without default is unset on a guild, **When** a member runs a
   command that needs the module configured, **Then** it does not run and a translated "not
   configured" message names what is missing for administrators.
2. **Given** the same guild, **When** a member runs a command that does not need configuration,
   **Then** it runs normally.
3. **Given** an administrator sets the missing value, **When** the first command runs again,
   **Then** it runs normally.
4. **Given** any module and guild, **When** its configuration status is requested, **Then** the
   list of missing required fields is returned (empty when configured).

### Edge Cases

- A channel, role or user stored in the settings is deleted from the guild: reads return the
  identifier unchanged, and surfaces show it as unavailable; validation of a new submission
  rejects it.
- A dynamic search throws an error: the query returns an empty result and the error is logged;
  it never breaks the surface.
- A dynamic search returns more than 25 results: the result is cut to 25.
- Stored data contains a field the declaration no longer knows: it is ignored on read and dropped
  on the next write.
- Stored data is of a version newer than the running declaration (rollback of the bot): reads
  fail safe to defaults for incompatible fields and an error is logged; nothing is overwritten.
- Two modules declare the same settings identifier: startup fails with a clear error.
- A field references a translation key that does not exist in English: startup fails with a
  clear error.
- A list field receives more items than its maximum, or duplicate items: the submission is
  rejected.
- A submission targets a guild other than the one the surface is bound to: it is rejected.

## Requirements *(mandatory)*

### Functional Requirements

**Declaration**

- **FR-001**: The kernel MUST let a module declare its settings once, as data, with a unique
  identifier, a schema version, fields, optional groups, and an optional migration between
  versions.
- **FR-002**: Settings MUST be scoped to a guild. Every read and write MUST name the guild.
- **FR-003**: The kernel MUST support these field kinds: channel (with a filter on channel types),
  role, user, color, duration, choice from a fixed set, integer, decimal number (both with optional
  minimum and maximum), text (with optional minimum and maximum length), boolean, secret, and a
  list variant of channel, role, user, choice, integer and text with optional minimum and maximum
  item counts, and a set of named on/off toggles (one boolean per declared key).
- **FR-004**: Every field MUST support an optional default value and a required flag. A required
  field without a default MUST be reported as unset until an administrator sets it.
- **FR-005**: Duplicate settings identifiers across modules MUST fail startup with a clear error.

**Reading**

- **FR-006**: Module logic MUST read a guild's settings through one call that returns values
  typed from the declaration.
- **FR-007**: Reading a guild with no stored settings MUST return defaults and MUST NOT write
  anything.
- **FR-008**: Secret values MUST be readable by module logic, and MUST NOT be returned by any read
  intended for a user-facing surface.

**Validation and writing**

- **FR-009**: The kernel MUST derive exactly one validation from each declaration, and every
  surface MUST use it before storing.
- **FR-010**: Validation MUST check kind, bounds, required fields, list sizes, duplicates in lists,
  channel-type filters, and strict suggestions.
- **FR-011**: A submission MUST be stored entirely or not at all, and MUST report every invalid
  field at once.
- **FR-012**: Validation errors MUST carry a translation key and the parameters needed to render
  them in the administrator's language.
- **FR-013**: After a successful write, the kernel MUST emit a settings-changed notification with
  the guild, the module and the changed field names, through a replaceable notification point.

**Storage**

- **FR-014**: Storage MUST be abstracted behind a port so that any database can be used by
  consumers.
- **FR-015**: The kernel MUST ship an in-memory storage implementation and a reusable contract test
  suite that any consumer storage implementation can run.

**Evolution**

- **FR-016**: Fields added to a declaration MUST read their defaults for already-configured guilds.
- **FR-017**: Stored fields absent from the declaration MUST be ignored on read and dropped on the
  next write.
- **FR-018**: When the stored version is older than the declared version, the kernel MUST run the
  declared migration, validate its result, and store it under the new version. A failed migration
  MUST leave stored data unchanged.
- **FR-019**: When the stored version is newer than the declared version, the kernel MUST NOT
  overwrite stored data.

**Presentation hints**

- **FR-020**: Each field MUST accept optional presentation hints: group, order, unit, preferred
  control hint, advanced flag, examples, description and placeholder. Each module MUST accept an
  optional icon and group order. Hints MUST describe meaning, not layout, and surfaces MAY ignore
  them.

**Suggestions (autocomplete)**

- **FR-021**: A field MUST be able to declare either a fixed list of choices or a server-side
  search. A search receives the query, the guild, the requester's locale, the requester's
  identifier and the other values currently entered.
- **FR-022**: A field with a search MUST be able to declare how to turn a stored value back into a
  readable label.
- **FR-023**: A field MUST be able to be strict, in which case only values known to its
  suggestions are accepted on write.
- **FR-024**: Suggestions MUST never exceed 25 results. A search that runs longer than 2.5 seconds
  or fails MUST yield an empty result and a logged event.
- **FR-025**: Channel, role and user fields MUST get suggestions from the guild without any
  author-written search.
- **FR-026**: Suggestions MUST use the same choice format as the kernel's existing command
  autocomplete, so one search can serve both.
- **FR-026a**: Because Discord forms and select menus have no type-to-search, the Discord
  configuration screen MUST present a searchable field as a select menu filled with the first 25
  results of its search for an empty query. When the field is not strict, the screen MUST also
  offer free text entry, validated on save. Type-to-search is a web-surface capability.

**Localisation**

- **FR-027**: Every user-facing text in a declaration (labels, descriptions, group names, units,
  placeholders, static choice labels) MUST be a translation key of the kernel's catalog system.
- **FR-028**: A declaration referencing a key without an English source MUST fail startup.

**Surfaces**

- **FR-029**: The kernel MUST generate a Discord configuration screen from a declaration, honouring
  groups and order, and splitting fields across pages or forms so that no Discord limit is
  exceeded. The screen MUST be produced by translating the declaration into the existing Discord
  settings-editor component, not by replacing that component; bots that use the settings-editor
  directly today MUST keep working unchanged.
- **FR-030**: The kernel MUST produce, for a module and a requested locale, a machine-readable
  description in JSON Schema (draft 2020-12), with kernel-specific annotations for field kind,
  presentation hints and suggestion mode, and every text translated with a per-key English
  fallback.
- **FR-031**: The description MUST mark secret fields as write-only and MUST NOT include any
  secret value, default or example.

**Extension points**

- **FR-032**: Modules, groups and fields MUST accept an optional access declaration slot that this
  feature stores but does not enforce (enforcement belongs to the permissions feature).
- **FR-033**: The settings-changed notification point MUST have a default in-process
  implementation and MUST be replaceable (distributed delivery belongs to the event bus feature).

**Constraints**

- **FR-034**: The feature MUST NOT add any runtime dependency to the core package other than the
  pure libraries allowed by the constitution (Principle I). Such libraries MUST NOT appear in the
  feature's public types.

**System settings (provided by the kernel)**

- **FR-035**: The kernel MUST provide a system settings declaration, per guild, holding the
  enabled state of every registered module. Each module MUST be able to declare its default
  state; the default default is enabled.
- **FR-036**: Commands and interactive components of a module disabled on a guild MUST NOT run on
  that guild and MUST answer with a translated message. Guild-bound event handlers of that module
  MUST NOT run for that guild. Scheduled jobs are responsible for checking the state themselves,
  through a kernel-provided check.
- **FR-037**: The kernel MUST provide a system setting, per guild, for the bot's language on that
  guild, limited to the languages the bot supports.
- **FR-038**: For bot messages, the language MUST be chosen in this order: the member's language
  if supported, then the guild language setting, then the guild's Discord language if supported,
  then English.
- **FR-039**: System settings MUST be declared, validated, stored, described and rendered exactly
  like module settings (same declaration mechanism).

**Configuration status**

- **FR-040**: The kernel MUST report, for a module and a guild, the list of required fields that
  are unset.
- **FR-041**: A bot author MUST be able to mark a command or component as requiring its module to
  be configured. Until the status is empty, it MUST NOT run and MUST answer with a translated
  message; for members allowed to configure the bot, the message names the missing fields.

### Key Entities

- **Settings declaration**: a module's description of its settings — identifier, version, fields,
  groups, migration, module-level hints, access slot.
- **Field**: one configurable value — key, kind, constraints, default, required flag, hints,
  suggestions, access slot.
- **Group**: an ordered, labelled set of fields within a declaration.
- **Stored settings**: the persisted values of one module for one guild, with the version they
  were written under.
- **Settings description**: the translated, machine-readable form of a declaration, for one locale.
- **Suggestion**: a value with a translated label, returned by a fixed list or a search.
- **Settings-changed notification**: guild, module, changed field names.
- **System settings**: the kernel's own per-guild declaration — enabled state per module and guild
  language.
- **Configuration status**: for a module and a guild, the list of unset required fields.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From one declaration and no other module code, a bot author obtains typed reads, a
  working Discord configuration screen and a translated settings description — verified on a
  sample module covering every field kind.
- **SC-002**: For every field kind, a shared test set of valid and invalid values produces
  identical accept/reject results and identical error keys on the Discord path and on the
  surface-neutral path (100 % agreement).
- **SC-003**: A settings description requested in a supported locale contains 0 untranslated
  texts, and one requested in an unsupported locale falls back to English for 100 % of texts; an
  automated check fails if any user-facing text is not a translation key.
- **SC-004**: Suggestions never exceed 25 items, and no configuration surface waits longer than
  2.5 seconds for a search.
- **SC-005**: Reading an unconfigured guild performs 0 writes; adding a field to a declaration
  requires 0 manual data changes for existing guilds.
- **SC-006**: Across all automated tests, no secret value ever appears in a settings description
  or in a surface-facing read.
- **SC-007**: The in-memory storage passes 100 % of the storage contract suite, and the suite can
  be run unchanged against a consumer's own storage.
- **SC-008**: The core package's runtime dependencies gain only libraries allowed by the
  constitution, and none of them appears in the feature's public types.
- **SC-009**: Disabling a module on one guild changes behaviour on 0 other guilds, and 100 % of
  that module's commands and components on that guild answer with the "disabled" message.
- **SC-010**: With a guild language set, 0 bot messages fall back to English for members whose
  language is unsupported, as long as the guild language has translations.
- **SC-011**: 100 % of commands marked as needing configuration refuse to run while a required
  value is missing, and run once it is set, with no restart.

## Decisions

- **2026-09-23 — Discord search UX**: Discord has no type-to-search outside slash-command options.
  The Discord screen shows the first 25 results of the empty-query search in a select menu, with
  free text entry for non-strict fields (FR-026a). The web surface offers full type-to-search.
- **2026-09-23 — Discord screen strategy**: the declaration is translated into the existing
  settings-editor component rather than replacing it (FR-029). A rewrite on the unified V1/V2 view
  model is deferred to that feature.
- **2026-09-23 — Validation library**: Zod is used internally for validation and schema output,
  hidden behind the kernel's field declarations (constitution 2.0.0, Principle I).
- **2026-09-23 — System settings**: per-guild module enablement and guild language are part of this
  feature (US7, US8), declared with the same mechanism as module settings. Configuration status
  and the "needs configuration" guard are part of it too (US9).
- **2026-09-23 — Operator console**: bot-wide settings, statistics and monitoring for the bot
  operator are a separate, later feature.

## Assumptions

- Consumers are TypeScript bot authors using the kernel's existing module, command, i18n and
  error systems.
- The existing Discord settings-editor component is the base for the generated Discord screen;
  its rendering may later move to the unified V1/V2 view model (separate feature) without
  changing this feature's behaviour.
- Guild-scoped settings cover the need; per-user and per-channel settings are not required now.
- "Unsupported locale" means a locale for which the module ships no catalog; English is always
  shipped (existing kernel rule).
- The 2.5-second search budget leaves room within Discord's 3-second autocomplete deadline.
- Durations are expressed and validated in whole seconds or larger units; sub-second precision is
  not needed.
- Colors accept the kernel's existing color input (hex values and registered aliases).

## Out of Scope

- HTTP server or API, and web dashboard.
- Distributed event delivery (event bus); only the replaceable notification point is included.
- Permission enforcement, permission keys, grants and audit log; only the access slot is included.
- Module actions (anything that triggers behaviour rather than storing configuration).
- Per-user settings, conditional fields (visible only when another field has a value), custom
  layouts.
- Database adapters other than the in-memory one.
- Bot-operator console (bot-wide settings, statistics, monitoring, maintenance for the person who
  runs the bot across all guilds): separate feature. Settings stay guild-scoped here; a bot-wide
  scope can be added later without breaking guild-scoped declarations.
