## Getting started

From the **home screen** you can:

1. **New document** — start an in-memory draft with one page. Press **Export** to link a local folder or publish to remote storage.
2. **Select folder** — open an existing doc-tree on disk (Chrome or Edge recommended).
3. **Saved documents** — open a remote document when Supabase is configured (`?id=LINK_ID` in the URL).
4. **About** / **User guide** — open this built-in help (also available from the toolbar while editing).

A doc-tree folder looks like:

```text
your-folder/
├── docs/*.p              pages
├── docs/{globalId}.md    Markdown sidecars
├── docs/*.png|jpg        images
├── relations.json        page names and order
├── groups.json           cross-page component links
├── comments.json         threaded comments (optional)
├── {username}.reads.json per-user read state (optional)
├── lock.json             password-protected export only
└── payload.enc           password-protected export only
```

For a linking demo: **Select folder** and choose the `sample-data/` directory from the project repository (see README).

---

## Workspace layout

| Area | Purpose |
|------|---------|
| **Sidebar** | Page list — click to add/remove panels. Drag to reorder pages. **Max** slider sets how many page panels can be open (default **2**, range 1–8). |
| **Panels** | Side-by-side page views. Closing a panel removes it from the workspace; open pages stay fixed while you select components. |
| **Linked lists** | Optional sidebar panel (link icon on a selected component, or `Alt+L`) — lists **persisted** groups from `groups.json`. |
| **Top bar** | Selection history, unlink, link-mode hint, keyboard legend. |
| **Toolbar** | Export, Reload (local), Close, **About** / **User guide** links. |
| **Edit bar** | Appears when a component is selected — type, status, content, insert/delete. |
| **Comment panel** | Right side — threaded comments (can shrink to a vertical tab). |

Set a **username** (1–20 alphanumeric characters) to use comments and read/unread tracking.

---

## Reading and navigation

- **Click a component** to select it. Related components highlight on **already open** panels: blue dashed border for direct group members (including Markdown virtual links); orange for transitive trace.
- **Open panels do not change** when you select a component on another page — only selection and highlights update. Panels change when you open a page from the sidebar, follow a **Markdown in-app link**, focus a **comment** anchor, or similar navigation.
- **Markdown links** (`[text](globalId)` in a sidecar) jump to the target component, open its page if needed, and flash the target briefly.
- **Scrollbar markers** on the right of each panel jump to highlighted components.
- **Selection history**: `←` / `→` when nothing is selected.
- **Move between components**: `↑` / `↓` on the selected page.
- **Unread navigation**: `U` / `Shift+U` jumps to the next/previous unread component (requires username).
- **Linked lists panel**: `Alt+L` toggles when a component is selected.

---

## Component linking (trace/highlight)

**Persisted links** are stored in **`groups.json`** — arrays of **global ids** (`pageId.localId`, e.g. `intro.c1`).

**Edit links in the UI:**

1. Select a component (optional).
2. **Hold Alt** — link mode starts; a preview shows current groups.
3. Click components to add or remove them from the active group.
4. **Release Alt** to save changes (or discard if unchanged).

Rules:

- A group must span **at least 2 components** on **at least 2 pages** (same-page-only groups are removed on save).
- Maximum **2 pages** per group when editing in the app.
- **Unlink** in the top bar removes the active group or all groups for the selected component.

**Markdown virtual groups** (not saved): each `md` component automatically links to in-app targets in its sidecar. They affect highlight/trace only — not `groups.json` and not the Linked lists panel. Cross-page targets trace when you select the `md` component or a linked target; same-page targets still work as clickable links in the preview but do not join cross-page trace.

**Markdown in-app links** in sidecar `docs/{globalId}.md`:

```markdown
See [flow overview](flows.c1) for details.
```

| `href` | Resolved as |
|--------|-------------|
| `flows.c1` | Global id |
| `c1` | Local id on the same page |

| Action | How |
|--------|-----|
| Create link | Select `md` component → select text in preview → hold **Alt** → click target component |
| Remove link | **Ctrl+click** link in preview (Cmd+click on Mac) |
| Navigate | Click link in preview (opens page if needed; target flashes) |
| Edit manually | Type `[text](componentId)` in sidecar or full-screen editor (`E`) |

External URLs, `mailto:`, `#`, and `/` paths are not treated as component links. UI link creation fails if the selected text contains `[` or `]`.

---

## Editing

With a component selected, use the **edit bar** at the bottom:

| Action | Shortcut |
|--------|----------|
| Full-screen editor | `E` |
| Save & close editor | `Ctrl+S` (in full-screen editor only) |
| Cycle status | `←` / `→` |
| Delete component | `Delete` |
| Insert above / below | `Alt+↑` / `Alt+↓` |
| Toggle read/unread | `Enter` |

**Component types:** `header`, `title`, `body`, `listItem`, `img`, `md`, `action`

**Status values:** `undefined`, `pending`, `working`, `done`, `blocked` — shown as background colours.

- **Markdown (`md`)** — body in sidecar `docs/{globalId}.md`. See **Component linking** above for `[text](componentId)` syntax and Alt/Ctrl shortcuts to create or remove in-app links.
- **Action** — before/after images with an animated interaction zone; edit visually in the full-screen editor. Selecting an action scrolls its page panel smoothly to center it on screen (panels do not open or close).
- **Images** — import from file or clipboard; large images are compressed automatically.

**Pages:** use **+ New page** in the sidebar, **✎** to rename the display name, **×** to delete. The file name and `pageId` stay fixed.

Each edit bumps the component **`version`**, which marks the component unread for users who had read an older version.

---

## Comments

Open the **comment panel** and set your username.

- Add a **root comment** or **reply** to an existing thread.
- **Edit or delete** only your own comments (matched by display name).
- **Anchor a comment** to a whole component or a **Markdown text range**:
  - Select your comment, hold **Alt**, click a component or drag-select text in Markdown, release Alt to save the anchor.
- Click a comment to **scroll** to its anchor (opens the target page if needed).

---

## Read state

Per-user read tracking uses `{username}.reads.json` (local folder root) or `{docId}/reads/` on remote storage.

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
| **Export dialog** | Local folder or remote; optional **password protection**; remote requires **Link ID** and supports **show/hide in Saved documents**; copy share link (`?id=LINK_ID`). |

**Reload** re-reads from disk (local) or re-fetches from the server (remote). If someone else saved a newer remote version, a banner offers **Reload** or **Overwrite**.

Password-protected exports store `lock.json` + `payload.enc` instead of plaintext project files. Viewers must enter the password before content loads.

---

## Keyboard shortcuts summary

| Key | Action |
|-----|--------|
| `←` / `→` | Selection history (no selection) or cycle status (with selection) |
| `↑` / `↓` | Adjacent component |
| `E` | Full-screen editor |
| `Delete` | Delete selected component |
| `Alt+↑` / `Alt+↓` | Insert component above/below |
| `Alt+L` | Toggle Linked lists panel (when a component is selected) |
| `Enter` | Toggle read/unread |
| `U` / `Shift+U` | Next / previous unread |
| **Alt** (hold) | Component link mode or comment anchor mode |
| `Escape` | Close dialogs |

Shortcuts are disabled while typing in inputs, in link mode, or in the full-screen editor.

---

## Doc-tree reference

| Term | Example | Notes |
|------|---------|-------|
| **pageId** | `intro` | File stem without `.p` — fixed |
| **local id** | `c1` | Unique within one `.p` file |
| **global id** | `intro.c1` | Used in groups, comments, md sidecar names |

Full authoring spec (file formats, validation, remote ids): see `docs/HUONG-DAN-TAO-TAI-LIEU.md` in the repository.
