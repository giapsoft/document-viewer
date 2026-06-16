# Document Authoring Guide

Short spec for agents creating or editing Document Viewer projects. Optional `styles.json` is read on load but not required for hand-authored data.

## ID terminology

| Term | Example | Notes |
|------|---------|-------|
| **pageId** | `intro` | File stem without `.p` (`intro.p` → `intro`). Fixed; prefix of every global id on that page. |
| **local id** | `c1` | Component id **inside a `.p` file** (unique within the page). |
| **global id** | `intro.c1` | `pageId` + `.` + `local id`. Used in the app, `groups.json`, Markdown sidecars, comments, and read state. |

**Formula:** `global id` = `{pageId}.{localId}`

When inserting components in the UI, the app auto-assigns local ids `c1`, `c2`, …

## Directory layout

```text
<root>/
├── docs/                      # created when pages exist (may be absent on an empty new folder)
│   ├── *.p                    # one file = one page (JSON array)
│   ├── *.md                   # Markdown sidecar for `md` components (filename = global id + `.md`)
│   └── *.png|jpg|jpeg|gif     # images (optional, flat under docs/)
├── relations.json             # pageNames, pageOrder, pinnedPages (metadata only on save)
├── groups.json                # persisted link groups (may be embedded in relations.json on legacy load)
├── comments.json              # threaded comments (may be embedded in relations.json on legacy load)
├── {username}.reads.json      # per-user component read versions (written on save)
├── {username}.comment-reads.json
├── lock.json                  # present only for password-protected export
└── payload.enc                # encrypted bundle for password-protected export
```

- **Flat files only** under `docs/` — no subdirectories.
- Sidebar order comes from `pageOrder` in `relations.json`; pages not listed there sort last (alphabetically by filename).

## Page files (`*.p`)

JSON array. Element order = display order on the page.

```json
{
  "id": "c1",
  "type": "body",
  "status": "done",
  "content": "Body text",
  "version": 2
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | **local id** (e.g. `c1`, `h1`). App builds **global id** `pageId.c1` at load |
| `type` | yes | see table below |
| `status` | yes | see table below |
| `content` | yes | meaning depends on `type` |
| `version` | no | edit counter (missing = 0). App bumps on UI edits; used for read/unread |

**Do not write global ids inside `.p` files** — local ids only.

## `pageId` and `pageName`

- **pageId** — fixed for the life of the page (renaming display title does not change it).
- **pageName** — display label in the sidebar. Stored in `relations.json` → `pageNames` (key = page filename, e.g. `intro.p`).
- **global ids** are assigned when components are created and **do not change** when you rename a page title.

```json
{
  "pageNames": {
    "intro.p": "Introduction"
  },
  "pageOrder": ["intro.p", "detail.p"]
}
```

- Missing `pageNames` entry → display name defaults to pageId.
- Renaming a page in the app updates **pageName only**; the `.p` filename and pageId stay the same.
- `pageOrder` — sidebar / panel order (drag-and-drop in the app updates this field).

## Component `type`

| Value | `content` |
|-------|-----------|
| `header` | plain text |
| `title` | plain text |
| `body` | plain text |
| `listItem` | plain text (app renders a bullet) |
| `img` | **filename** of an image in `docs/` (e.g. `diagram.png`) |
| `md` | `""` — Markdown body lives in sidecar `docs/{globalId}.md` |
| `action` | JSON string for before/after animation (images, tap region, `frame_ratio`, …). Use the Action Editor in the UI for reliable JSON |

- Text types: plain text only; `\n` = line break. No Markdown or HTML in `content`.
- Invalid `type` or `status` → that component is skipped on load.

## `status`

`undefined` | `pending` | `working` | `done` | `blocked`

## `relations.json`, `groups.json`, `comments.json`

**On save**, the app writes `relations.json` **without** `groups` or `comments` — those live in separate files. **On load**, embedded `groups` / `comments` inside `relations.json` are still read if the standalone files are missing (backward compatibility).

**`relations.json` (saved shape)**

```json
{
  "pageNames": {},
  "pageOrder": ["a.p", "b.p"],
  "pinnedPages": []
}
```

| Field | Notes |
|-------|-------|
| `pageNames` | Map `intro.p` → display name |
| `pageOrder` | Sidebar order |
| `pinnedPages` | Normalized on load; **no UI** in the current app |

**`groups.json`**

```json
[
  ["intro.c1", "detail.c2"],
  ["detail.c2", "appendix.c3"]
]
```

Array of groups. Each group is an array of **global ids**. Selecting a component traces/highlights linked members across open panels.

### Group rules (persisted groups)

These rules match `src/lib/groupRelations.ts` (`MAX_PAGES_PER_GROUP = 2`, `MIN_GROUP_MEMBER_COUNT = 2`):

1. **At least 2 members** per group. Smaller groups are **removed on save**.
2. **At least 2 different pages** — groups where every member shares the same pageId prefix are **removed on save** (same-page-only groups are not kept).
3. **At most 2 pages** per group. Link mode in the app blocks adding a member from a third page.
4. A global id **may appear in multiple groups**.
5. Use **full global ids** in JSON (`pageId.localId`), especially for cross-page links.

### Link mode (UI)

- Hold **Alt** to enter link mode; release Alt to commit (or discard if unchanged).
- **With a selection**: edit groups that contain the selected component, or create a new group containing it.
- **Without a selection**: first click starts a new group; further clicks add/remove members.
- **Unlink** (toolbar): delete the active group or all groups containing the selected component.

### Markdown in-app links (`md` → component)

Markdown body lives in sidecar `docs/{globalId}.md`. In-app links use normal Markdown syntax:

```markdown
See [luồng xử lý](flows.c1) for details.
```

| `href` | Resolved as |
|--------|-------------|
| `flows.c1` | Global id |
| `c1` | Local id on the **same page** → `pageId.c1` |

Ignored for component linking: `https://…`, `mailto:`, `#…`, `/…`.

**Create a link in the UI**

1. Select the source `md` component.
2. Select text in the **preview** (not only the edit-bar textarea).
3. Hold **Alt** and click the target component → the app inserts `[selected text](targetId)` into the sidecar.
4. Selection must not contain `[` or `]` (add those links manually in Markdown if needed).

**Remove a link:** **Ctrl+click** the link in the preview (Cmd+click on Mac) → unwraps to plain text in the sidecar.

**When reading:** click a component link in the preview to jump to the target (opens its page if needed; target flashes briefly).

You can also type or edit `[text](componentId)` directly in the sidecar or full-screen Markdown editor.

### Markdown virtual groups (not saved)

For each `md` component, the app builds a **display-only** group: the md component plus in-app targets of Markdown links in its sidecar. These groups:

- Affect **selection highlight / trace** only (same visual rules as persisted groups)
- Are **not** written to `groups.json`
- Do **not** appear in the Linked lists panel
- Are rebuilt on every project load / index rebuild (including after remote MD files finish loading)

**Trace behaviour:** selecting the `md` component highlights linked targets on open panels, and selecting a target highlights the `md` source. Cross-page links participate fully in trace. Links to components on the **same page** as the `md` component still work for preview navigation but are omitted from cross-page trace (same rule as persisted groups).

### `comments.json`

Threaded comments. Each entry:

| Field | Notes |
|-------|-------|
| `id` | Unique string |
| `parentId` | `null` = root comment |
| `author` | Display name (`^[A-Za-z0-9]{1,20}$`) |
| `body` | Text |
| `createdAt` | Unix ms |
| `updatedAt` | Unix ms (merge / conflict) |
| `deletedAt` | Tombstone when deleted |
| `anchor` | Optional: `{ "kind": "component", "componentId": "intro.c1" }` or `{ "kind": "md-range", "componentId", "start", "end", "excerpt", "segments?" }` |

## Read state

**Local folder:** `{username}.reads.json` and `{username}.comment-reads.json` at project root.

**Remote (Supabase):** `{docId}/reads/{username}.reads.json` and `{docId}/reads/{username}.comment-reads.json`.

Component reads map **global id → version number** the user has read:

```json
{
  "intro.c1": 3,
  "detail.c2": 1
}
```

A component is **read** when `reads[id] >= component.version`.

Username pattern: `^[A-Za-z0-9]{1,20}$` (same as comments).

## Password-protected export

Optional on **Export**. When enabled, plaintext project files are replaced with:

- `lock.json` — encryption metadata
- `payload.enc` — encrypted document bundle

Opening requires the password before any content loads.

## Remote publishing

First publish to Supabase requires:

| Field | Rules |
|-------|-------|
| **Document title** | Display name in Saved documents list |
| **Link ID** | Required; `[A-Za-z0-9]`, min 2 chars; becomes remote document id and URL param |
| **Show in saved documents** | Maps to `is_published` (hidden from welcome list when off; direct `?id=` link still works) |

**Share URL format** (query param only):

```text
https://giapsoft.github.io/document-viewer/?id=YourLinkId
```

Remote storage layout: `{docId}/relations.json`, `{docId}/groups.json`, `{docId}/comments.json`, `{docId}/docs/*`, `{docId}/reads/*`.

## Minimal example

**`docs/a.p`**

```json
[
  { "id": "h1", "type": "header", "status": "done", "content": "Page A" },
  { "id": "c1", "type": "body", "status": "done", "content": "Linked to B via groups." }
]
```

**`docs/b.p`**

```json
[
  { "id": "h1", "type": "header", "status": "done", "content": "Page B" },
  { "id": "c1", "type": "body", "status": "working", "content": "Detail." }
]
```

**`relations.json`** (after save from the app)

```json
{
  "pageNames": {},
  "pageOrder": ["a.p", "b.p"]
}
```

**`groups.json`**

```json
[
  ["a.c1", "b.c1"]
]
```

## Important rules (summary)

- **local id** unique per `.p` file; **global id** unique project-wide.
- `groups.json` uses **global ids** only.
- Link components across pages by putting their global ids in the **same group** — do not duplicate components on another page.
- One persisted group: **≥ 2 members**, **≥ 2 pages**, **≤ 2 pages**.
- Renaming a `.p` file requires updating `pageNames`, `pageOrder`, and any global id prefixes in `groups.json`, comments, and `.md` sidecars if links must be preserved.
- In the app (local folder): **+ New page**, rename **pageName**, delete page, drag to reorder. Filename and pageId do not change when renaming pageName.
- **New document** (not exported): data stays in memory until you link a local folder or publish to remote storage.
