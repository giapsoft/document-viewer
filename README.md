# Document Viewer

Multi-page document reader and editor with **component trace/highlight linking** across pages. Edit in the browser; save to a **local folder** (Chrome/Edge) or **Supabase** remote storage. Supports Markdown sidecars, images, before/after action animations, threaded comments, and per-user read tracking.

**Live demo:** https://giapsoft.github.io/document-viewer/

## Run

```bash
npm install
cp .env.example .env
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Run [`supabase/schema.sql`](./supabase/schema.sql) in **SQL Editor** (open table + storage policies).
3. Copy **Project URL** and **anon public key** into `.env`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
4. Restart `npm run dev`.

Policies in `schema.sql` are fully open (anyone can read/write). Fine for demos; tighten later if needed.

Remote documents are stored as separate files under `{docId}/` (`relations.json`, `groups.json`, `comments.json`, `docs/*`, `reads/*`). Only changed files are uploaded on save (content-hash skip).

## Usage

### Open a project

1. **New document** — in-memory draft with one starter page. Use **Export** to link a local folder or publish to remote storage.
2. **Select folder** — Chrome/Edge folder picker; loads a local doc-tree and enables auto-save to disk.
3. **Saved documents** — list on the welcome screen when Supabase is configured; click to open.
4. **Deep link** — `?id=DOCUMENT_ID` (e.g. `https://giapsoft.github.io/document-viewer/?id=UserStories`).

### Edit and save

- Edits are kept in memory. **Export** writes to a linked local folder or remote document (title, share link, rename).
- **Local folder only** (no remote link): auto-saves to disk every 3 seconds after changes.
- **Remote document**: auto-saves every 3 seconds (paused while the fullscreen content editor is open).
- **Reload** re-reads from disk (local) or re-fetches from Supabase (remote). A banner appears when a newer remote version exists.

### Doc-tree layout

```
your-folder/
├── docs/
│   ├── *.p              # pages (JSON arrays of components)
│   ├── {globalId}.md    # Markdown sidecars for `md` components
│   └── *.png|jpg|gif    # images (flat folder)
├── relations.json       # pageNames, pageOrder, metadata (no groups/comments on save)
├── groups.json          # component link groups (global ids)
├── comments.json        # threaded comments (optional)
├── styles.json          # optional visual overrides (load only; app does not write this)
└── {username}.reads.json  # per-user read state (written on save)
```

On load, `groups` and `comments` may still be embedded inside `relations.json` (legacy format). On save, the app splits them into `groups.json` and `comments.json`.

Example local folder: [`sample-data/`](./sample-data/)

Data format spec (for authors and agents): [`docs/HUONG-DAN-TAO-TAI-LIEU.md`](./docs/HUONG-DAN-TAO-TAI-LIEU.md)

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run deploy` | Build and deploy to GitHub Pages |
| `npm run test:links` | Run linked-component algorithm tests |

## Production build

```bash
npm run build
npm run preview
```

For GitHub Pages, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as repository **Secrets** used by the deploy workflow, or build locally with `.env` before `npm run deploy`.

## Deploy (GitHub Pages)

```bash
npm run deploy
```

## Notes

- Run via HTTP (`npm run dev` / `npm run preview`); do not open `index.html` directly (`file://`).
- Folder picker requires Chrome or Edge (File System Access API).
- Hold **Ctrl** to edit component link groups; release to persist. Comments and read state require a username (1–20 alphanumeric characters).
