# Tạo tài liệu cho Document Viewer

Spec ngắn để agent tạo/sửa dữ liệu. Không đề cập `styles.json`.

## Cấu trúc thư mục

```text
<root>/
├── docs/
│   ├── *.p              # mỗi file = 1 trang (JSON array)
│   └── *.png|jpg|...    # ảnh (tùy chọn, cùng thư mục docs/)
└── relations.json       # bắt buộc
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
| `id` | có | **unique toàn project** |
| `type` | có | xem bảng dưới |
| `status` | có | xem bảng dưới |
| `content` | có | text; với `img`/`ref` có ý nghĩa đặc biệt |

## `type`

| Giá trị | `content` |
|---------|-----------|
| `header` | văn bản |
| `title` | văn bản |
| `body` | văn bản |
| `listItem` | văn bản (app thêm bullet) |
| `img` | **tên file** ảnh trong `docs/` (vd. `diagram.png`) |
| `ref` | **id component gốc** (cùng hoặc khác trang) |

- Text: plain, `\n` = xuống dòng. Không Markdown/HTML.

## `status`

`undefined` | `pending` | `working` | `done` | `blocked`

## `relations.json`

```json
{
  "groups": [
    ["b1", "b2", "b4"],
    ["b2", "b3", "b7"]
  ]
}
```

- `groups`: mảng các **nhóm** component.
- Mỗi nhóm = mảng id. Click một id → highlight **toàn bộ nhóm** đó.
- Một id **có thể nằm ở nhiều nhóm** (node trung gian phục vụ nhiều cụm).
- Id trong nhóm có thể **khác trang**.
- Thêm id vào nhóm: append vào **một** mảng nhóm — không cần nối từng cặp.
- Sample data: id bắt đầu `2lists-` = node thuộc **nhiều nhóm** (vd. `2lists-bridge`).

**Nhiều nhóm:** click → highlight **một nhóm** (list đầu tiên chứa component). Nút ← Group / Group → xoay giữa các nhóm — mỗi lần chỉ highlight + mở panel của nhóm đang chọn.

**Link mode:** sửa **một list** tại một thời điểm; ← List / List → xoay giữa các list **chứa component vừa chọn** (ẩn nếu chỉ thuộc 0–1 list).

## `ref` vs nhóm

| | `ref` | `groups` |
|---|-------|----------|
| Mục đích | hiển thị lại nội dung gốc | trace/highlight khi click |
| ID riêng | có (id của bản ref) | dùng id component |
| Click block ref | chọn id ref, **không** kéo theo nhóm của gốc | — |

- `ref` resolve đệ quy tới component không phải `ref`. Vòng ref → `[circular ref]`. Id sai → `[ref not found: …]`.

## Ví dụ tối thiểu

**`docs/a.p`**
```json
[
  { "id": "h1", "type": "header", "status": "done", "content": "Trang A" },
  { "id": "b1", "type": "body", "status": "done", "content": "Liên kết sang B." }
]
```

**`docs/b.p`**
```json
[
  { "id": "h2", "type": "header", "status": "done", "content": "Trang B" },
  { "id": "b2", "type": "body", "status": "working", "content": "Chi tiết." },
  { "id": "r1", "type": "ref", "status": "pending", "content": "b1" }
]
```

**`relations.json`**
```json
{
  "groups": [
    ["b1", "b2"]
  ]
}
```

## Quy tắc quan trọng

- Mỗi `id` **một lần** trong toàn project (trong file `.p`). Trùng → warning, chỉ bản đầu được dùng.
- Cùng id có thể xuất hiện trong **nhiều nhóm** trong `relations.json`.
- `type`/`status` sai → file `.p` đó bị bỏ.
- `img`: chỉ tên file, không đường dẫn con.
- Đổi/xóa `id` → cập nhật mọi nhóm và mọi `ref` trỏ tới id đó.
