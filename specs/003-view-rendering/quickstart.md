# Quickstart: validate One View for Components V1 and V2

How to prove the feature works. Shapes: [data-model.md](./data-model.md); public API:
[contracts/public-api.md](./contracts/public-api.md).

## 1. Prerequisites

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.22.1/installation/bin:/opt/homebrew/bin:$PATH"
pnpm install
```

## 2. Automated checks (each PR)

From the repository root, all with zero errors and zero warnings:

```bash
pnpm typecheck && pnpm lint && pnpm knip && pnpm test && pnpm build
```

What the tests must show, by story:

| Story | Test file (under `packages/kernel/tests/`) | Proves |
|---|---|---|
| US1 | `discord/view/view-types.test.ts` | a view mixing `embeds` and `components` does not compile (`@ts-expect-error`); a container in a container does not compile; a section with 0 or 4 texts does not compile (SC-002) |
| US1 | `discord/command/send-view.test.ts` | reply / deferred edit / follow-up, V1 and V2, ephemeral or not: recorded payload flags and fields |
| US1 | `constitution/components-v2-flag.test.ts` | `IsComponentsV2` named in `render-view.ts` only (SC-003) |
| US2 | `discord/view/render-view.test.ts` | every node renders the expected Discord JSON in order; nulls skipped; disabled render; each limit of FR-009 refused one item over (SC-004); missing attachment refused |
| US3 | `discord/components/paginator/*.test.ts`, `persistent-paginator.test.ts`, `interactive-message/*.test.ts` | V1 and V2 pages; ended render disabled in both layouts; V2 → V1 update refused |
| US3 | `discord/components/settings-editor/*.test.ts` | unchanged assertions after the card view migration (SC-006) |
| US4 | `discord/default-presenter.test.ts`, `bot/*-presenter-v2.test.ts` | default presenter JSON equals 2.x; a V2 presenter yields V2 replies for every kind (SC-005) |

## 3. Hand check on Discord (last PR)

Start the sandbox against a test guild (`apps/sandbox-bot/README.md`), deploy commands, then:

1. `/view-demo message` → one message: a text line, then two containers with accent colours; a
   section with a button, a section with a thumbnail, a gallery, a downloadable file shown inline.
   Press the button: the handler answers.
2. `/view-demo message` with the ephemeral option → same message, visible only to you
   (confirms Ephemeral + V2, unconfirmed in research R1).
3. `/view-demo pages` → V2 page 1; "next" / "previous" change pages; after the idle timeout the
   buttons are disabled and the layout stays V2.
4. Locally (not committed), give one demo container 11 children and run `/view-demo message`:
   note whether Discord accepts it. If rejected, add the cap as a constant before merging
   (research R1).
5. Run a sandbox command that fails a guard: the default presenter's V1 reply is unchanged
   (V2 presenter replies are covered by the automated tests, SC-005).
6. `/settings` in card layout: looks and behaves as on 2.0.0 (SC-006).

Record the result in the last PR description (SC-007).
