<!--
Sync Impact Report (2.0.0)
- Version change: 1.0.0 → 2.0.0 (MAJOR: Principle I redefined)
- Modified principles: I. Vendor-Free Core — now allows pure, ecosystem-standard libraries as
  regular dependencies when hidden from public types; peer dependency when exposed. Allowed: zod.
- Added sections: none. Governance gains the rule for adding an allowed pure library (MINOR).
- Removed sections: none
- Templates requiring updates: none
- Follow-up TODOs: none

Sync Impact Report (1.0.0)
- Version change: template (unversioned) → 1.0.0
- Modified principles: all eight placeholders replaced (initial ratification)
  - [PRINCIPLE_1_NAME] → I. Vendor-Free Core (NON-NEGOTIABLE)
  - [PRINCIPLE_2_NAME] → II. Clean Architecture
  - [PRINCIPLE_3_NAME] → III. Declare Once, Render Everywhere
  - [PRINCIPLE_4_NAME] → IV. Multi-Tenant by Default
  - [PRINCIPLE_5_NAME] → V. Localised by Construction
  - added → VI. Type Safety at the Boundary
  - added → VII. Test-First with In-Memory Twins
  - added → VIII. Semver Discipline
- Added sections: Technical Constraints, Development Workflow & Quality Gates, Governance
- Removed sections: none
- Templates requiring updates: none (plan/spec/tasks templates read the constitution at runtime)
- Follow-up TODOs: none
-->

# discord-kernel Constitution

`@azurioh/discord-kernel` is a reusable framework kernel for Discord bots. It targets both small
single-guild bots and public, sharded, multi-guild bots. Every design decision is judged against
the public, sharded case; the single-process bot is its degenerate case.

## Core Principles

### I. Vendor-Free Core (NON-NEGOTIABLE)

- The core package MUST declare `discord.js` as a peer dependency.
- The core MUST NOT import a database driver, HTTP library, logger implementation, message bus,
  cache vendor, or any library that performs I/O or talks to a vendor service.
- The core MAY depend on a pure library (no I/O, no network, no vendor service) that is the
  ecosystem standard for its concern, as a regular dependency, only if that library never
  appears in the core's public types. A library that appears in public types MUST be a peer
  dependency.
- Allowed pure libraries: `zod` (schema validation and JSON Schema generation).
- Every other external capability MUST be expressed as a port (interface) in the core.
- Adapters MUST live in consuming bots or in opt-in sibling packages of this monorepo.

Rationale: the kernel is the innermost ring. Being a package, and not a folder, is what keeps
outer rings out of its dependency graph. Hiding pure libraries behind kernel types keeps them
replaceable and keeps consumers free of their versions.

### II. Clean Architecture

- Dependencies MUST point inward: domain ← application ← infrastructure/presentation.
- Feature modules MUST be vertical slices. Use cases MUST NOT import `discord.js`, transports,
  or adapters.
- A module that needs another module's capability MUST go through a port, never a direct import.

Rationale: the same use case must run behind a Discord command, an HTTP route, or a test.

### III. Declare Once, Render Everywhere

- Module capabilities that are exposed to users (settings, manifest) MUST be declared as data.
- Every interface (Discord, HTTP, web) MUST render from the same declaration.
- Every interface MUST validate through the same server-side validation. Client-side checks
  are convenience only.

Rationale: two declarations drift; one declaration cannot.

### IV. Multi-Tenant by Default

- All persisted module state MUST be scoped to a guild (`guildId` is mandatory).
- Designs MUST hold when the gateway runs as several shards and the API runs as a separate
  process. An in-process mode MUST work with the same code, through in-memory adapters.
- No design MAY rely on process-local state being the single source of truth across processes.

Rationale: a public bot cannot be retrofitted for sharding after the fact.

### V. Localised by Construction

- Every user-facing string MUST be a catalog key with a mandatory English source.
- Locale MUST be resolved per request or per interaction, never per process.
- Errors shown to users MUST carry a translation key.

Rationale: public bots serve many languages; hard-coded strings are defects.

### VI. Type Safety at the Boundary

- Public APIs MUST be fully typed. Value types MUST be inferred from declarations, not repeated.
- Invalid combinations (for example, mixing Components V1 and V2 in one message) MUST fail at
  compile time where the type system allows it, and at runtime with a clear error otherwise.
- Untrusted input (Discord payloads, HTTP bodies) MUST be validated before it reaches a use case.

Rationale: consumers learn the kernel through its types.

### VII. Test-First with In-Memory Twins

- Every port MUST ship an in-memory implementation that consumers can use in their own tests.
- No feature MAY merge without tests. Behaviour changes MUST start with a failing test.

Rationale: a kernel that is hard to test makes every bot built on it hard to test.

### VIII. Semver Discipline

- Packages are versioned with changesets.
- A breaking change to an exported API MUST be a major bump and MUST include a migration note.
- Additive changes are minor; fixes are patch.

Rationale: several bots depend on this kernel and upgrade on their own schedule.

## Technical Constraints

- Language: TypeScript, strict mode, ESM. Runtime: Node.js `>=22.12.0`.
- Package manager: pnpm. The repository is a pnpm workspace publishing the core package and
  its opt-in sibling packages (adapters, HTTP, bus).
- Tooling: Biome (lint and format), Vitest (tests), knip (unused code and dependencies).
- Discord limits (component counts, text lengths, 25 choices per select or autocomplete)
  MUST be enforced by the kernel, not left to each consumer.

## Development Workflow & Quality Gates

- Every feature starts from a spec under `specs/`, then a plan, then tasks.
- A change is done only when type-check, Biome, knip and Vitest pass with zero errors and
  zero warnings.
- Every public API change updates the README or the package documentation in the same change.
- Every user-visible package change includes a changeset.

## Governance

- This constitution overrides specs, plans and tasks. A plan that violates a principle MUST
  either be changed or record the violation and its justification in its complexity tracking.
- Adding a library to the allowed pure libraries (Principle I) is a MINOR amendment and MUST
  state why the library is pure and why it is the ecosystem standard.
- Amendments require a version bump of this document and a changelog note:
  MAJOR for removing or redefining a principle, MINOR for adding a principle or section or
  materially expanding guidance, PATCH for wording fixes.
- Every spec review and code review checks compliance with the principles above.

**Version**: 2.0.0 | **Ratified**: 2026-09-23 | **Last Amended**: 2026-09-23
