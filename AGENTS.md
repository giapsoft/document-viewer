# Instructions for AI agents

This repository is the **Document Viewer** app and hosts the **doc-tree** format spec for document projects the app loads.

## Editing document projects

When the task is to **create, migrate, or edit** a doc-tree project (files under `docs/*.p`, sidecar `docs/*.md`, `groups.json`, `relations.json`, …):

1. Read **[docs/AGENT-DOC-TREE.md](docs/AGENT-DOC-TREE.md)** — workflows, checklists, common mistakes.
2. Use **[docs/HUONG-DAN-TAO-TAI-LIEU.md](docs/HUONG-DAN-TAO-TAI-LIEU.md)** as the canonical field reference.

## Editing this app (React/TypeScript)

Follow normal repo conventions. End-user help lives in `src/bundled-help/docs/`.

## Do not

- Invent a `ref` component type (not supported).
- Put global component ids inside `.p` page files.
- Put Markdown bodies inside non-`md` component `content` fields.
- Commit `{username}.reads.json` or secrets unless the user asks.
- Reject groups like `["intro.c1","intro.c2","detail.c1"]` — they are **valid** (2 pageIds). Only **same-page-only** groups (all members on one page) are invalid.
