# Agent playbook — Document Viewer (doc-tree)

Use this file when an AI agent **creates or edits** a Document Viewer project on disk (`.p`, sidecar `.md`, `groups.json`, …).

**Full spec:** [HUONG-DAN-TAO-TAI-LIEU.md](./HUONG-DAN-TAO-TAI-LIEU.md) (canonical field rules, save shape, remote layout).

**In-app help (end users):** `src/bundled-help/docs/guide.full.md`.

---

## Core model (30 seconds)

| Concept | Rule |
|---------|------|
| **pageId** | `.p` filename stem (`intro.p` → `intro`). Fixed for life of page. |
| **local id** | Component `id` inside a `.p` file (`c1`, `h1`). Unique per page. |
| **global id** | `{pageId}.{localId}` — used in `groups.json`, sidecar `.md` links, comments. |
| **Never** put global ids in `.p` files | Only local ids in page JSON. |

```
docs/intro.p          → pageId intro, components intro.c1, intro.c2, …
docs/intro.c1.md      → sidecar for md component intro.c1 only
groups.json           → [["intro.c1", "detail.c2"], …]
relations.json        → pageNames, pageOrder (no groups/comments on save)
```

---

## Which file to edit

| Goal | Files |
|------|--------|
| Add/reorder components on a page | `docs/{page}.p` |
| Markdown body | `docs/{globalId}.md` (component must be `type: "md"`, `content: ""`) |
| Cross-page trace/highlight (persisted) | `groups.json` — global ids, ≥2 members, 2 pages only |
| Link from md text to another component | Sidecar: `[label](targetGlobalId)` or same-page `[label](c2)` |
| Sidebar title / order | `relations.json` → `pageNames`, `pageOrder` |
| Threaded comments | `comments.json` (usually leave to UI) |
| User read state | `{username}.reads.json` — **do not** fabricate unless asked |

---

## Component types (current app)

Valid `type` values: `header` | `title` | `body` | `listItem` | `img` | `md` | `action`

There is **no** `ref` type. Use **`md` + markdown link** or **`groups.json`** instead.

| type | `content` |
|------|-----------|
| text types | plain text only; `\n` = newline; no Markdown/HTML |
| `img` | filename in `docs/` (e.g. `diagram.png`) |
| `md` | always `""`; body in `docs/{globalId}.md` |
| `action` | JSON; prefer UI Action Editor for complex shapes |

Valid `status`: `undefined` | `pending` | `working` | `done` | `blocked`

Invalid `type`/`status` → component **skipped on load** (silent).

---

## Linking strategies

### A. Persisted groups (`groups.json`)

Use when components on **different pages** should **trace/highlight** together when selected. Always use **global ids**.

#### Group rules — read carefully (agents often get this wrong)

A group is kept on save when **all** of these hold:

| # | Rule | Meaning |
|---|------|---------|
| 1 | **≥ 2 members** | `["intro.c1"]` alone is removed |
| 2 | **≥ 2 distinct pageIds** across the group | See **same-page-only** below |
| 3 | **≤ 2 distinct pageIds** | Cannot add a member from a 3rd page in the UI |

**Same-page-only (INVALID — removed on save)**

Every member has the **same** pageId prefix. There is **no** member from another page.

```json
["intro.c1", "intro.c2"]
```

→ **Removed on save.** Two components on one page is not a persisted group. Use a Markdown in-app link inside `md`, or accept no persisted group.

**Multiple members on one page + members on another page (VALID — not a violation)**

The group spans **exactly 2 pageIds**, but one page may contribute **more than one** member. This is **allowed** and **expected**.

```json
["intro.c1", "intro.c2", "detail.c1"]
```

| Member | pageId |
|--------|--------|
| `intro.c1` | `intro` |
| `intro.c2` | `intro` |
| `detail.c1` | `detail` |

- Distinct pageIds: `intro`, `detail` → **2 pages** ✓  
- Member count: **3** ✓  
- **Not** same-page-only (because `detail.c1` is on another page) ✓  
- **Saved to `groups.json`** ✓

**Minimal valid cross-page group**

```json
[["intro.c1", "detail.c2"]]
```

#### Trace vs membership (do not confuse with save rules)

Being **in the same saved group** ≠ always **highlighted together** when the user selects one member:

- When the user selects `intro.c1`, the app usually highlights **cross-page** group mates (e.g. `detail.c1`), **not** same-page siblings (e.g. `intro.c2`).
- When the user selects `detail.c1`, **both** `intro.c1` and `intro.c2` may highlight (they are cross-page relative to `detail`).

So a valid group may contain same-page “extras”; save rules do not forbid that.

**Decision tree for agents**

```
Does the group have members from 2+ different pageIds?
├─ NO  → INVALID (same-page-only). Will be removed on save.
└─ YES → How many distinct pageIds?
         ├─ 1 → INVALID (same as above)
         ├─ 2 → VALID (any member count ≥ 2, including several on one page)
         └─ 3+ → INVALID (too many pages)
```

### B. Markdown in-app links (sidecar)

- Use when **text inside md** should link to another component.
- Syntax: `[visible text](flows.c1)` or `[text](c2)` (local id on same page as md component).
- Creates a **virtual group** (highlight/trace only; not written to `groups.json`).
- Cross-page targets trace when selecting md or target; same-page targets are clickable but omitted from cross-page trace.
- External URLs (`https://`, `mailto:`, `#`, `/`) are not component links.

---

## Agent workflows

### New page

1. Create `docs/{pageId}.p` — JSON array of components with unique local ids.
2. Add `"pageId.p"` to `relations.json` → `pageOrder` (and `pageNames` if display name ≠ pageId).
3. For each `md` component, create empty or filled `docs/{pageId}.{localId}.md`.

### Add md component with cross-page link

1. In `docs/pageA.p`: `{ "id": "c3", "type": "md", "status": "done", "content": "" }`
2. Create `docs/pageA.c3.md`:

   ```markdown
   See [detail section](pageB.c1) for more.
   ```

3. Optional: also add `["pageA.c3", "pageB.c1"]` to `groups.json` if you need persisted trace independent of md edits.

### Cross-page relation without md

1. Ensure components exist on two pages.
2. Append one group to `groups.json` with both **global ids**.

### Rename display title only

- Update `relations.json` → `pageNames["intro.p"]`.
- Do **not** rename `.p` file or change pageId unless user explicitly migrates ids.

---

## Checklist before finishing

- [ ] Every `.p` file is a valid JSON **array**
- [ ] Local ids unique within each page; global ids unique project-wide
- [ ] Every `md` has `content: ""` and matching `docs/{globalId}.md`
- [ ] `img` content is basename only (file exists or will be added under `docs/`)
- [ ] `groups.json` entries use global ids; each group uses **exactly 2 pageIds** (multiple members on one page is OK)
- [ ] No subdirectories under `docs/`
- [ ] Markdown links use resolvable component ids
- [ ] Did not put Markdown inside non-`md` `content` fields

---

## Common agent mistakes

| Mistake | Fix |
|---------|-----|
| Treating `["intro.c1","intro.c2","detail.c1"]` as invalid | **Valid.** Only **same-page-only** groups are removed. Multiple members on one page + another page = OK. |
| `type: "ref"` | Removed from app; use `md` link or `groups.json` |
| Global id as `"id"` in `.p` | Use local id only |
| Markdown in `body` `content` | Use `md` + sidecar |
| Md body in `.p` `content` | Empty string + sidecar file |
| Same-page-**only** group `["intro.c1","intro.c2"]` | Won't persist; need a member on a **second** page, or use md link |
| `groups` inside `relations.json` on new projects | App saves groups to `groups.json` only |
| Wrong sidecar name | Must be `{globalId}.md` exactly (e.g. `intro.c1.md`) |
| `[text](https://…)` expecting component trace | External URLs ignored for in-app linking |

---

## UI behaviour (for agents explaining to users)

| Action | Shortcut |
|--------|----------|
| Edit persisted link groups | Hold **Alt**, click components, release Alt |
| Create md → component link | Select md → select preview text → **Alt** + click target |
| Remove md component link | **Ctrl+click** link in preview |
| Full-screen component editor | `E`; **Ctrl+S** = Done in that dialog only |

---

## Minimal valid project

**`docs/overview.p`**

```json
[
  { "id": "h1", "type": "header", "status": "done", "content": "Overview" },
  { "id": "c1", "type": "md", "status": "done", "content": "" }
]
```

**`docs/overview.c1.md`**

```markdown
Jump to [details](detail.c1).
```

**`docs/detail.p`**

```json
[
  { "id": "h1", "type": "header", "status": "done", "content": "Detail" },
  { "id": "c1", "type": "body", "status": "done", "content": "Detail body." }
]
```

**`relations.json`**

```json
{
  "pageNames": {},
  "pageOrder": ["overview.p", "detail.p"]
}
```

**`groups.json`** (optional persisted trace)

```json
[["overview.c1", "detail.c1"]]
```

---

## Groups: invalid vs valid (quick reference)

| Group | Distinct pageIds | Saved? |
|-------|------------------|--------|
| `["intro.c1", "intro.c2"]` | 1 (`intro` only) | **No** — same-page-only |
| `["intro.c1", "detail.c1"]` | 2 | **Yes** |
| `["intro.c1", "intro.c2", "detail.c1"]` | 2 | **Yes** — multiple on `intro` is OK |
| `["intro.c1", "detail.c1", "appendix.c1"]` | 3 | **No** — too many pages |

---

## When unsure

1. Re-read [HUONG-DAN-TAO-TAI-LIEU.md](./HUONG-DAN-TAO-TAI-LIEU.md) for the exact field being edited.
2. Grep this repo: `src/types.ts` (`ComponentType`), `src/lib/groupRelations.ts` (group limits), `src/lib/mdComponentLinks.ts` (href resolution).
3. Prefer **small, valid diffs** — one page or one group per change when possible.
4. If unsure whether a group is valid: see **Groups: invalid vs valid** table above. `["intro.c1","intro.c2","detail.c1"]` is **valid**.
