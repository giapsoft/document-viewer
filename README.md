# Document Viewer

Document reader with component trace/highlight linking. Edit in the browser; save to Supabase.

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

Documents are stored as a single `{docId}/bundle.zip` (text + images inside). Legacy multi-file layouts are still loaded; the next Save migrates them to `bundle.zip`.

## Usage

1. **Saved documents** — list on the welcome screen; click to open. Deep link: `?doc=DOCUMENT_ID` (also `?page=`).
2. **Select folder** — Chrome/Edge, pick a local folder:
   ```
   your-folder/
   ├── docs/*.p
   ├── relations.json
   └── styles.json   (optional)
   ```
3. Edit in memory. Press **Save** to write to Supabase. Local folders are not auto-saved to disk.

Example local folder: [`sample-data/`](./sample-data/)

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
- Folder picker works best on Chrome and Edge.
