# Document Viewer

Local document reader with component trace/highlight linking.

Spec: [document-viewer-plan.md](./document-viewer-plan.md)

## Run

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

## Usage

1. **Use sample data** — button on the welcome screen (quick try).
2. **Select folder** — use Chrome/Edge, pick a folder with this structure:
   ```
   your-folder/
   ├── docs/*.p
   ├── relations.json
   └── styles.json   (optional)
   ```
   Sample folder: [`sample-data/`](./sample-data/) (4 long pages, many links — good for scroll marker testing)

### Sample testing tips

| Click | Result |
|---|---|
| `b1` (intro, mid page) | 3 pages: intro + detail + appendix; multiple markers |
| `b2` | 4 related pages → 3 expanded + 1 shrunk |
| `l1` | intro + specs (2 pages) |
| `b5` / `l2` | Single panel only |
| `b-intro-end` | Marker near bottom of intro scrollbar |

## Production build

```bash
npm run build
npm run preview
```

## Notes

- Run via HTTP (`npm run dev` / `npm run preview`); do not open `index.html` directly (`file://`).
- File System Access API works best on Chrome and Edge.
