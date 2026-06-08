## Getting started

From the **home screen** you can:

1. **New document** — start an in-memory draft with one page. Press **Export** to link a local folder or publish to remote storage.
2. **Select folder** — open an existing doc-tree on disk (Chrome or Edge recommended).
3. **Saved documents** — open a remote document when Supabase is configured.
4. **About** / **User guide** — open this built-in help (also available from the toolbar while editing).

A doc-tree folder looks like:

```text
your-folder/
├── docs/*.p              pages
├── docs/{globalId}.md    Markdown sidecars
├── docs/*.png|jpg        images
├── relations.json        page names and order
├── groups.json           cross-page component links
└── comments.json         threaded comments (optional)
```

---

## Workspace layout

| Area | Purpose |
|------|---------|
| **Sidebar** | Page list — click to add/remove panels. Drag to reorder pages. |
| **Panels** | Up to **3 expanded** page panels at once. Shrunk panels show a vertical title. |
| **Top bar** | Selection history, unlink, link-mode hint, keyboard legend. |
| **Toolbar** | Export, Reload (local), Close, **About** / **User guide** links. |
| **Edit bar** | Appears when a component is selected — type, status, content, insert/delete. |
| **Comment panel** | Right side — threaded comments (toggle from workspace). |

Set a **username** (1–20 alphanumeric characters) to use comments and read/unread tracking.

---

## Reading and navigation

- **Click a component** to select it. Related components (from `groups`) highlight in blue; indirect links show orange borders.
- Related **pages open in panels** automatically and scroll to highlighted components.
- **Scrollbar markers** on the right of each panel jump to highlighted components.
- **Selection history**: `←` / `→` when nothing is selected.
- **Move between components**: `↑` / `↓` on the selected page.
- **Unread navigation**: `U` / `Shift+U` jumps to the next/previous unread component (requires username).

---

## Component linking (trace/highlight)

Links are stored in **`groups.json`** — arrays of **global ids** (`pageId.localId`, e.g. `intro.b1`).

**Edit links in the UI:**

1. Select a component (optional).
2. **Hold Ctrl** — link mode starts; a preview shows current groups.
3. Click components to add or remove them from the active group.
4. **Release Ctrl** to save changes (or discard if unchanged).

Rules:

- A group must span **at least 2 components** on **at least 2 pages** (same-page-only groups are removed on save).
- Maximum **2 pages** per group when editing in the app.
- **Unlink** in the top bar removes the active group or all groups for the selected component.

---

## Editing

With a component selected, use the **edit bar** at the bottom:

| Action | Shortcut |
|--------|----------|
| Full-screen editor | `E` |
| Cycle status | `←` / `→` |
| Delete component | `Delete` |
| Insert above / below | `Alt+↑` / `Alt+↓` |
| Toggle read/unread | `Enter` |

**Component types:** `header`, `title`, `body`, `listItem`, `img`, `md`, `action`

**Status values:** `undefined`, `pending`, `working`, `done`, `blocked` — shown as background colours.

- **Markdown (`md`)** — body lives in a sidecar file `docs/{globalId}.md`. Use `[text](otherPage.componentId)` for in-app links.
- **Action** — before/after images with an animated interaction zone; edit visually in the full-screen editor.
- **Images** — import from file or clipboard; large images are compressed automatically.

**Pages:** use **+ New page** in the sidebar, **✎** to rename the display name, **×** to delete. The file name and `pageId` stay fixed.

Each edit bumps the component **`version`**, which marks the component unread for users who had read an older version.

---

## Comments

Open the **comment panel** and set your username.

- Add a **root comment** or **reply** to an existing thread.
- **Edit or delete** only your own comments (matched by display name).
- **Anchor a comment** to a whole component or a **Markdown text range**:
  - Select your comment, hold **Ctrl**, click a component or drag-select text in Markdown, release Ctrl to save the anchor.
- Click a comment to **scroll** to its anchor.

---

## Read state

Per-user read tracking uses `{username}.reads.json` (local folder) or remote storage under `reads/`.

- A component is **read** when your stored version ≥ the component's current `version`.
- Click the **read bar** on a component, or use **All read / All unread** on a page header.
- Unread counts appear in the sidebar and panel headers (`3/12` format).

---

## Save and sync

| Source | Behaviour |
|--------|-----------|
| **Draft** (no folder, no remote) | Stays in memory until **Export**. |
| **Local folder** | Auto-saves to disk every **3 seconds** after changes. |
| **Remote (Supabase)** | Auto-saves every **3 seconds** (paused while the full-screen editor is open). Only changed files upload. |
| **Export dialog** | Choose local folder or remote; set title; copy share link (`?doc=ID`). |

**Reload** re-reads from disk (local) or re-fetches from the server (remote). If someone else saved a newer remote version, a banner offers **Reload** or **Overwrite**.

---

## Keyboard shortcuts summary

| Key | Action |
|-----|--------|
| `←` / `→` | Selection history (no selection) or cycle status (with selection) |
| `↑` / `↓` | Adjacent component |
| `E` | Full-screen editor |
| `Delete` | Delete selected component |
| `Alt+↑` / `Alt+↓` | Insert component above/below |
| `Enter` | Toggle read/unread |
| `U` / `Shift+U` | Next / previous unread |
| **Ctrl** (hold) | Component link mode or comment anchor mode |
| `Escape` | Close dialogs |

Shortcuts are disabled while typing in inputs, in link mode, or in the full-screen editor.

---

## Doc-tree reference

| Term | Example | Notes |
|------|---------|-------|
| **pageId** | `intro` | File stem without `.p` — fixed |
| **local id** | `b1` | Unique within one `.p` file |
| **global id** | `intro.b1` | Used in groups, comments, md sidecar names |

Authoring spec for agents and advanced users: see `docs/HUONG-DAN-TAO-TAI-LIEU.md` in the repository.

For a linking demo, open the **sample-data** folder bundled with the project from the home screen.
