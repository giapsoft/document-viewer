# Tạo tài liệu cho Document Viewer

Spec ngắn để agent tạo/sửa dữ liệu. Không đề cập `styles.json`.

## Thuật ngữ id

| Thuật ngữ | Ví dụ | Ghi chú |
|-----------|-------|---------|
| **pageId** | `intro` | Tên file bỏ `.p` (`intro.p` → `intro`). Cố định; prefix của global id. |
| **local id** | `p1` | Id component **trong file `.p`** (unique trong trang). |
| **global id** | `intro.p1` | `pageId` + `.` + `local id`. Id trong app, `groups`, file sidecar `.md`. |

**Công thức:** `global id` = `{pageId}.{localId}`

## Cấu trúc thư mục

```text
<root>/
├── docs/                # app tạo khi tạo trang đầu tiên (có thể chưa có khi mới mở folder)
│   ├── *.p              # mỗi file = 1 trang (JSON array)
│   ├── *.md             # markdown sidecar cho component `md` (tên = global id, vd. `intro.notes.md`)
│   └── *.png|jpg|...    # ảnh (tùy chọn, cùng thư mục docs/)
└── relations.json       # app ghi khi lưu; thiếu thì mặc định `{ "pageNames": {}, "groups": [] }`
```

- Chỉ file **phẳng** trong `docs/` — không có thư mục con.
- Sidebar sắp xếp trang theo **tên file** (alphabet).

## File trang (`*.p`)

Mảng JSON. Thứ tự phần tử = thứ tự hiển thị trên trang.

```json
{
  "id": "b1",
  "type": "body",
  "status": "done",
  "content": "Nội dung"
}
```

| Trường | Bắt buộc | Ghi chú |
|--------|----------|---------|
| `id` | có | **local id** trong trang (vd. `b1`, `c2`). App ghép thành **global id** `pageId.b1` khi load |
| `type` | có | xem bảng dưới |
| `status` | có | xem bảng dưới |
| `content` | có | text; với `img`/`md` có ý nghĩa đặc biệt |

**Không cần (và không nên) ghi global id** trong `.p` — chỉ dùng local id; app tự sinh `c1`, `c2`, … khi insert trong UI.

## `pageId` và `pageName`

- **pageId** — xem bảng thuật ngữ. **Cố định** trong app (không đổi khi đổi pageName).
- **pageName** = tên hiển thị (có thể đổi trong app). Lưu trong `relations.json` → `pageNames`.
- **global id** (`intro.b1`, …) do app cấp khi tạo component — **không đổi** sau đó (không rename trong UI).

```json
{
  "pageNames": {
    "intro.p": "Introduction"
  },
  "groups": []
}
```

- Không có entry → pageName mặc định = pageId (stem file).
- Đổi tên page trong app **chỉ** đổi pageName; file `.p` và pageId giữ nguyên.

## `type`

| Giá trị | `content` |
|---------|-----------|
| `header` | văn bản |
| `title` | văn bản |
| `body` | văn bản |
| `listItem` | văn bản (app thêm bullet) |
| `img` | **tên file** ảnh trong `docs/` (vd. `diagram.png`) |
| `md` | để trống `""` — nội dung Markdown nằm ở file sidecar `{globalId}.md` (vd. global id `intro.notes` → `intro.notes.md`) |

- Text (`header`/`title`/`body`/`listItem`): plain, `\n` = xuống dòng. Không Markdown/HTML.
- `md`: Markdown trong file sidecar cùng thư mục `docs/`; tên file = **global id** + `.md` (không lặp pageId).

## `status`

`undefined` | `pending` | `working` | `done` | `blocked`

## `relations.json`

```json
{
  "pageNames": {},
  "pinnedPages": ["detail.p"],
  "groups": [
    ["intro.b1", "detail.b2"],
    ["detail.b2", "appendix.b3"]
  ]
}
```

- `pinnedPages` (tùy chọn): tên file trang (vd. `detail.p`) luôn hiển thị ở **panel phụ** khi không phải trang chính; bật/tắt bằng nút 📌 trong sidebar.
- `groups`: mảng các **nhóm** component (**global id**). Dùng để trace/highlight khi click component — mở các trang liên quan.
- Một id **có thể nằm ở nhiều nhóm**.
- Id trong nhóm có thể **khác trang**.

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

**`relations.json`**
```json
{
  "pageNames": {},
  "groups": [
    ["a.b1", "b.b2"]
  ]
}
```

## Quy tắc quan trọng

- **local id** unique trong từng file `.p`; **global id** unique toàn project.
- `groups` dùng **global id** (khác trang bắt buộc ghi đầy đủ).
- Để liên kết component giữa các trang: thêm **global id** vào cùng một nhóm trong `groups` — **không** tạo component copy trên trang khác.
- Đổi tên file `.p` → cập nhật key trong `pageNames`, giữ value pageId cũ để không gãy links.
- Trong app (mở **local project folder**): **+ New page**, **✎** đổi **pageName**, **×** xóa page. File và pageId không đổi.
- `type`/`status` sai → component đó bị bỏ khi load.
