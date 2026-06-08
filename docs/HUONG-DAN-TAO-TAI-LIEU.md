# Tạo tài liệu cho Document Viewer

Spec ngắn để agent tạo/sửa dữ liệu. Không đề cập `styles.json` (tùy chọn, chỉ đọc khi load).

## Thuật ngữ id

| Thuật ngữ | Ví dụ | Ghi chú |
|-----------|-------|---------|
| **pageId** | `intro` | Tên file bỏ `.p` (`intro.p` → `intro`). Cố định; prefix của global id. |
| **local id** | `p1` | Id component **trong file `.p`** (unique trong trang). |
| **global id** | `intro.p1` | `pageId` + `.` + `local id`. Id trong app, `groups`, file sidecar `.md`, comments, read state. |

**Công thức:** `global id` = `{pageId}.{localId}`

## Cấu trúc thư mục

```text
<root>/
├── docs/                # app tạo khi có trang (có thể chưa có khi mới mở folder trống)
│   ├── *.p              # mỗi file = 1 trang (JSON array)
│   ├── *.md             # markdown sidecar cho component `md` (tên = global id, vd. `intro.notes.md`)
│   └── *.png|jpg|gif    # ảnh (tùy chọn, cùng thư mục docs/)
├── relations.json       # pageNames, pageOrder, pinnedPages (metadata)
├── groups.json          # nhóm liên kết component (có thể nhúng trong relations.json khi load cũ)
├── comments.json        # comment có thread (có thể nhúng trong relations.json khi load cũ)
└── {username}.reads.json  # trạng thái đã đọc theo user (app ghi khi lưu)
```

- Chỉ file **phẳng** trong `docs/` — không có thư mục con.
- Sidebar sắp xếp trang theo `pageOrder` trong `relations.json`; trang chưa có trong `pageOrder` xếp cuối (alphabet).

## File trang (`*.p`)

Mảng JSON. Thứ tự phần tử = thứ tự hiển thị trên trang.

```json
{
  "id": "b1",
  "type": "body",
  "status": "done",
  "content": "Nội dung",
  "version": 2
}
```

| Trường | Bắt buộc | Ghi chú |
|--------|----------|---------|
| `id` | có | **local id** trong trang (vd. `b1`, `c2`). App ghép thành **global id** `pageId.b1` khi load |
| `type` | có | xem bảng dưới |
| `status` | có | xem bảng dưới |
| `content` | có | text; với `img` / `md` / `action` có ý nghĩa đặc biệt |
| `version` | không | Bộ đếm chỉnh sửa (thiếu = 0). App tự tăng khi sửa trong UI; dùng cho read/unread |

**Không cần (và không nên) ghi global id** trong `.p` — chỉ dùng local id; app tự sinh `c1`, `c2`, … khi insert trong UI.

## `pageId` và `pageName`

- **pageId** — xem bảng thuật ngữ. **Cố định** trong app (không đổi khi đổi pageName).
- **pageName** = tên hiển thị (có thể đổi trong app). Lưu trong `relations.json` → `pageNames` (key = tên file, vd. `intro.p`).
- **global id** (`intro.b1`, …) do app cấp khi tạo component — **không đổi** sau đó (không rename trong UI).

```json
{
  "pageNames": {
    "intro.p": "Introduction"
  },
  "pageOrder": ["intro.p", "detail.p"]
}
```

- Không có entry `pageNames` → pageName mặc định = pageId (stem file).
- Đổi tên page trong app **chỉ** đổi pageName; file `.p` và pageId giữ nguyên.
- `pageOrder`: thứ tự trang trên sidebar (kéo thả trong app cập nhật field này).

## `type`

| Giá trị | `content` |
|---------|-----------|
| `header` | văn bản |
| `title` | văn bản |
| `body` | văn bản |
| `listItem` | văn bản (app thêm bullet) |
| `img` | **tên file** ảnh trong `docs/` (vd. `diagram.png`) |
| `md` | để trống `""` — nội dung Markdown nằm ở file sidecar `{globalId}.md` (vd. global id `intro.notes` → `intro.notes.md`) |
| `action` | JSON mô tả animation before/after (ảnh, vùng tương tác, `frame_ratio`, …). Ảnh tham chiếu tên file trong `docs/` |

- Text (`header`/`title`/`body`/`listItem`): plain, `\n` = xuống dòng. Không Markdown/HTML.
- `md`: Markdown trong file sidecar cùng thư mục `docs/`; tên file = **global id** + `.md`.
- `action`: JSON string; app parse và render animation. Soạn bằng Action Editor trong UI là cách đáng tin cậy nhất.

## `status`

`undefined` | `pending` | `working` | `done` | `blocked`

## `relations.json`, `groups.json`, `comments.json`

**Khi lưu**, app ghi `relations.json` **không** chứa `groups` / `comments` — hai phần đó nằm ở file riêng. **Khi load**, vẫn đọc `groups` / `comments` nhúng trong `relations.json` nếu file riêng chưa có (tương thích ngược).

```json
{
  "pageNames": {},
  "pageOrder": ["a.p", "b.p"],
  "pinnedPages": [],
  "groups": [
    ["intro.b1", "detail.b2"],
    ["detail.b2", "appendix.b3"]
  ]
}
```

| Field | Ghi chú |
|-------|---------|
| `pageNames` | Map `intro.p` → tên hiển thị |
| `pageOrder` | Thứ tự sidebar / panel |
| `pinnedPages` | Có trong schema, được normalize khi load — **chưa có UI** trong app hiện tại |
| `groups` | Mảng nhóm **global id**. Click component → trace/highlight; mở panel trang liên quan |

### Quy tắc `groups`

- Mỗi nhóm cần **≥ 2** member; nhóm chỉ cùng một trang bị **loại khi lưu**.
- Tối đa **2 trang** trong một nhóm (app chặn khi sửa bằng Link mode).
- Một global id **có thể nằm ở nhiều nhóm**.
- Id trong nhóm **phải khác trang** để nhóm được giữ sau khi lưu.

### Link mode trong app

- Giữ **Ctrl** để vào link mode; thả Ctrl để lưu thay đổi (hoặc huỷ nếu không đổi).
- **Đã chọn component**: sửa nhóm mà component đó thuộc (hoặc tạo nhóm mới chứa component đó nếu chưa có nhóm).
- **Chưa chọn component**: click component đầu tiên tạo nhóm mới; click tiếp thêm/bỏ member.
- **Unlink** (toolbar): xoá nhóm active hoặc mọi nhóm chứa component đang chọn.

### `comments.json`

Mảng comment có thread. Mỗi entry:

| Trường | Ghi chú |
|--------|---------|
| `id` | Unique string |
| `parentId` | `null` = comment gốc |
| `author` | Tên hiển thị (1–20 alphanumeric) |
| `body` | Nội dung |
| `createdAt` | Unix ms |
| `updatedAt` | Unix ms (merge conflict) |
| `deletedAt` | Tombstone khi xóa |
| `anchor` | Tuỳ chọn: `{ "kind": "component", "componentId": "intro.b1" }` hoặc `{ "kind": "md-range", "componentId", "start", "end", "excerpt", "segments?" }` |

## Read state (`{username}.reads.json`)

Map `global id` → số version đã đọc. Component được coi **đã đọc** khi `reads[id] >= component.version`.

```json
{
  "intro.b1": 3,
  "detail.b2": 1
}
```

- Username: `^[A-Za-z0-9]{1,20}$` (dùng chung với comments).
- Remote: lưu tại `{docId}/reads/{username}.reads.json` trên Supabase.

## Ví dụ tối thiểu

**`docs/a.p`**
```json
[
  { "id": "h1", "type": "header", "status": "done", "content": "Trang A" },
  { "id": "b1", "type": "body", "status": "done", "content": "Liên kết sang B qua groups." }
]
```

**`docs/b.p`**
```json
[
  { "id": "h2", "type": "header", "status": "done", "content": "Trang B" },
  { "id": "b2", "type": "body", "status": "working", "content": "Chi tiết." }
]
```

**`relations.json`** (sau khi lưu từ app — không chứa `groups`)
```json
{
  "pageNames": {},
  "pageOrder": ["a.p", "b.p"]
}
```

**`groups.json`**
```json
[
  ["a.b1", "b.b2"]
]
```

## Quy tắc quan trọng

- **local id** unique trong từng file `.p`; **global id** unique toàn project.
- `groups` dùng **global id** (khác trang bắt buộc ghi đầy đủ `pageId.localId`).
- Liên kết component giữa các trang: thêm **global id** vào cùng một nhóm — **không** tạo component copy trên trang khác.
- Đổi tên file `.p` → cập nhật key trong `pageNames` và `pageOrder`, cập nhật prefix global id trong `groups` / comments / md sidecar nếu cần giữ links.
- Trong app (mở **local project folder**): **+ New page**, **✎** đổi **pageName**, **×** xóa page, kéo thả đổi thứ tự. File và pageId không đổi khi rename pageName.
- `type` / `status` không hợp lệ → component đó bị bỏ khi load.
- Draft **New document** (chưa Export): dữ liệu chỉ trong bộ nhớ cho đến khi liên kết folder hoặc publish remote.
