# MISSION: BUILD A SPECIFICATION-DRIVEN DOCUMENT VIEWER WITH SYNCHRONIZED PATH HIGHLIGHTING

Hãy xây dựng một ứng dụng Web (Single Page Application - SPA) dùng để đọc và truy vết tài liệu theo các yêu cầu kỹ thuật chi tiết dưới đây.

---

## 🌐 PHẦN 0: MÔI TRƯỜNG CHẠY & KHỞI ĐỘNG (RUNTIME & BOOTSTRAP)

### 1. Chạy trên browser thuần
- Ứng dụng là **static SPA**, không cần backend.
- Người dùng mở file HTML (hoặc deploy lên static host), chạy trực tiếp trên trình duyệt.
- Dùng **[File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)** (`showDirectoryPicker`) để người dùng **chọn thư mục gốc** chứa dữ liệu — tương tự công cụ "Select folder" trong OS.
- Fallback (trình duyệt không hỗ trợ): hiển thị thông báo hướng dẫn dùng Chrome/Edge hoặc bật quyền tương ứng.

### 2. Luồng khởi động
1. Hiển thị màn hình welcome với nút **"Chọn thư mục"**.
2. Người dùng chọn thư mục gốc → validate cấu trúc (bắt buộc có `/docs` và `relations.json`).
3. Đọc và parse toàn bộ file `*.p` trong `/docs`, build **In-memory Index**.
4. Load `styles.json` nếu có → merge/override lên **default style hardcoded**; nếu không có file → dùng hoàn toàn default style hardcoded.
5. Hiển thị giao diện chính; sidebar liệt kê các file `*.p` (sắp xếp **theo tên file alphabet**).
6. Không tự mở Page nào — chờ người dùng chọn từ sidebar.

### 3. Tech stack đề xuất (MVP)
- **Vanilla HTML/CSS/TypeScript** hoặc **Vite + React** — ưu tiên đơn giản, ít dependency.
- State: in-memory store (không cần persist thư mục đã chọn giữa các phiên — mỗi lần mở app chọn lại).
- Không cần build phức tạp cho MVP; có thể chạy local bằng `npx serve` hoặc mở trực tiếp qua dev server.

---

## 📂 PHẦN A: CẤU TRÚC THƯ MỤC VÀ DỮ LIỆU (DATA STRUCTURES)

Ứng dụng đọc dữ liệu từ thư mục gốc do người dùng chọn.

**Bắt buộc:** `/docs`, `relations.json`  
**Tùy chọn:** `styles.json` (thiếu file → dùng default style hardcoded — xem mục c)

```
<root>/
├── docs/              # Bắt buộc — danh sách phẳng, không có thư mục con
│   ├── *.p            # File JSON — nội dung từng Page
│   └── *.{jpg,png,gif}
├── relations.json     # Bắt buộc — liên kết giữa các Component
└── styles.json        # Tùy chọn — override default style hardcoded
```

### 1. Cấu trúc dữ liệu chi tiết

#### a) File Trang (`*.p`)
Mỗi file là một **mảng JSON** chứa danh sách Component sắp xếp từ trên xuống dưới.

```json
{
  "id": "string (globally unique ID)",
  "type": "header" | "title" | "body" | "listItem" | "img" | "ref",
  "status": "pending" | "working" | "done" | "blocked" | "undefined",
  "content": "string (text; img → tên file trong /docs; ref → id component gốc)"
}
```

**Quy tắc `type: "ref"`:**
- `content` = ID component gốc cần hiển thị lại.
- Render: tra cứu component gốc, hiển thị **y hệt** nội dung gốc (`type`, `content`, `status` của gốc).
- Chuỗi ref lồng nhau (ref → ref → …) resolve đệ quy đến component không phải `ref`.
- Click thân component ref: trace/highlight theo **ID instance** (không tự trace theo gốc).
- Format riêng: viền dashed, nền sọc nhẹ + **icon link** góc trên phải.
- Click icon link → chọn **component gốc** (`content`) trên page chứa nó, trace connector như bình thường.

#### b) File `/relations.json`
Bản đồ liên kết giữa các Component ID.

```json
{
  "connectors": {
    "component_id_A": ["component_id_B", "component_id_C"],
    "component_id_B": ["component_id_D"]
  }
}
```

**Quy tắc liên kết:**
- Liên kết **không phân chiều** — có thể theo bất cữ hướng nào. Khi click Component_X, tập liên quan = union của:
  - Các ID trong `connectors[Component_X]` (nếu có)
  - Các ID **gốc** mà trong `connectors[gốc]` có chứa `Component_X` (reverse lookup)
- Nếu Component_X **không có** bất kỳ liên kết nào (không là key, cũng không xuất hiện trong value) → chỉ highlight **chính Component_X**.

#### c) File `/styles.json` (tùy chọn)

Nếu **không có** file này, ứng dụng dùng **default style hardcoded** (định nghĩa bên dưới). Nếu **có**, các giá trị trong file override default tương ứng; key thiếu vẫn fallback về default.

**Schema khi có file:**

```json
{
  "statuses": {
    "pending":  { "backgroundColor": "string (HEX/RGBA)" },
    "working":  { "backgroundColor": "string (HEX/RGBA)" },
    "done":     { "backgroundColor": "string (HEX/RGBA)" },
    "blocked":  { "backgroundColor": "string (HEX/RGBA)" },
    "undefined": { "backgroundColor": "string (HEX/RGBA)" }
  },
  "type": {
    "header":   { "fontSize": "string", "color": "string" },
    "title":    { "fontSize": "string", "color": "string" },
    "body":     { "fontSize": "string", "color": "string" },
    "listItem": { "fontSize": "string", "color": "string" }
  },
  "selectedComponent": {
    "borderColor": "string",
    "borderWidth": "string",
    "borderStyle": "solid"
  },
  "linkedScrollMarker": {
    "backgroundColor": "string (HEX/RGBA)",
    "width": "string (vd: 4px)"
  }
}
```

**Default style hardcoded** (dùng khi không có `styles.json`, hoặc khi key bị thiếu):

```json
{
  "statuses": {
    "pending":  { "backgroundColor": "#FFF3CD" },
    "working":  { "backgroundColor": "#CCE5FF" },
    "done":     { "backgroundColor": "#D4EDDA" },
    "blocked":  { "backgroundColor": "#F8D7DA" },
    "undefined": { "backgroundColor": "#E9ECEF" }
  },
  "type": {
    "header":   { "fontSize": "24px", "color": "#212529" },
    "title":    { "fontSize": "20px", "color": "#343A40" },
    "body":     { "fontSize": "16px", "color": "#495057" },
    "listItem": { "fontSize": "16px", "color": "#495057" }
  },
  "selectedComponent": {
    "borderColor": "#0D6EFD",
    "borderWidth": "2px",
    "borderStyle": "solid"
  },
  "linkedScrollMarker": {
    "backgroundColor": "#0D6EFD",
    "width": "4px"
  }
}
```

- `linkedScrollMarker`: màu/kích thước marker trên thanh scrollbar (xem Phần B).
- `type: "img"`: không có entry riêng; ảnh dùng quy tắc layout cố định, vẫn áp dụng `status.backgroundColor` nếu có wrapper.

---

## 💻 PHẦN B: QUY CÁCH GIAO DIỆN & TƯƠNG TÁC (UI/UX)

Giao diện chia 2 khu vực ngang:

### 1. Left Side — Sidebar (25% màn hình)
- Collapse / Expand được.
- **Collapse:** rộng 0%, ẩn danh sách; hiện Floating Button "Expand" góc trái.
- **Expand:** rộng 25%; liệt kê tất cả `*.p` trong `/docs` (alphabet); highlight file đang active.
- Khi sidebar collapse, Right Side chiếm 100% chiều rộng còn lại.

### 2. Right Side — Page Panel Area (75%, hoặc 100% khi sidebar collapse)
Các Page Panel xếp **ngang**, mỗi panel đại diện **một file `.p` duy nhất** (không trùng lặp).

#### Cơ chế Panel
| Trạng thái | Mô tả |
|---|---|
| **Expand** | Chia đều không gian với các panel Expand khác |
| **Shrink** | Rộng 30px; ẩn nội dung; hiện tên file xoay trên thanh đứng |

- Mỗi panel có nút Shrink / Expand thủ công.
- **Tối đa 3 panel Expand** cùng lúc. Panel thứ 4 buộc Expand → panel Expand **xa current page nhất** (ưu tiên bên phải) chuyển Shrink.
- **Current page luôn Expand** và không bị Shrink tự động.

#### Vòng đời mở Page
- Khu vực panel **chỉ hiển thị các page đang active** trong ngữ cảnh hiện tại — **không** liệt kê toàn bộ page trong project, **không** giữ panel page cũ ở trạng thái Shrink.
- Click Page trên sidebar → **chỉ 1 panel** (page vừa chọn), Expand; xóa selection component.
- Click Component không liên kết → **chỉ 1 panel** (page chứa component).
- Click Component có liên kết → panel chỉ gồm các page liên quan (theo thứ tự spec), tối đa 3 Expand, còn lại Shrink.
- **Current page** luôn Expand; không cho Shrink thủ công current page.
- Expand thủ công panel thứ 4 → tự Shrink panel Expand xa current nhất (ưu tiên bên phải); **không thể** có quá 3 panel Expand cùng lúc.

#### Hiển thị nội dung Page
- Render Component top → bottom; mỗi Page View scroll độc lập.
- **Text** (`header`, `title`, `body`, `listItem`): hiển thị plain text; hỗ trợ `\n` xuống dòng; không parse Markdown/HTML.
- **`listItem`:** thêm bullet `•` phía trước, indent nhẹ.
- **`img`** (sau resolve `ref` nếu có):
  - Nguồn: `/docs/{content}`
  - Căn giữa ngang; `max-width: 85%` chiều rộng panel; giữ tỷ lệ.
- Style: `fontSize`/`color` theo `type`; `backgroundColor` theo `status` — cả hai lấy từ Component **sau resolve ref**.

#### Scrollbar markers (thay auto-scroll)
- **Không** auto-scroll khi chọn Component.
- Mỗi Page Panel có **custom scrollbar overlay** (hoặc pseudo-track bên cạnh scrollbar) hiển thị **marker** tại vị trí tương đối (theo % chiều cao nội dung) của mỗi Component liên kết đang được highlight trên page đó.
- Marker dùng style `linkedScrollMarker` từ `styles.json`.
- Nhiều Component liên kết trên cùng page → nhiều marker; marker trùng vị trí gần nhau có thể merge hoặc xếp sát.
- User tự scroll; marker giúp nhận biết vị trí cần tới.

#### Highlight & dim
- Component được chọn + Component liên quan: viền `selectedComponent`.
- Component **không liên quan** trên cùng page: `opacity: 0.6`.
- Click vùng trống (backdrop panel, không trúng Component) → **bỏ chọn**, xóa highlight và scrollbar markers.

---

## 🔄 PHẦN C: LUỒNG XỬ LÝ SỰ KIỆN (CORE INTERACTION LOGIC)

### In-memory Index (build khi load)
| Index | Mục đích |
|---|---|
| `Component_ID → Page_File` | Tìm page chứa component |
| `Component_ID → Component_Data` | Resolve `ref` khi render |
| `Component_ID → [Connected_IDs]` | Graph liên kết **hai chiều** (build từ `connectors`) |

### Hành động 1: Click Page trên Sidebar
1. Mở hoặc kích hoạt panel tương ứng (không trùng).
2. Đưa panel lên **vị trí đầu tiên** bên trái.
3. Expand panel đó.
4. Đặt làm **current page**; xóa selection Component cũ (nếu có).

### Hành động 2: Click Component (**Component_X**)

**Bước 1 — Xác định selection (theo ID instance, không resolve ref):**
- `Component_X` = selected (dùng ID của chính instance được click).
- Page chứa `Component_X` = **current page**; panel luôn Expand, đưa lên đầu.

**Bước 2 — Tập liên quan:**
```
related = { Component_X }
if connectors graph has edges for Component_X:
    related += all connected IDs (both directions)
else:
    related = { Component_X }   // chỉ highlight chính nó
```

**Bước 3 — Điều phối panel (không trùng page):**
- Nếu Component_X **không có liên kết** (chỉ highlight chính nó) → **chỉ hiển thị 1 panel** duy nhất là page chứa Component_X; đóng/ẩn các panel page khác đang mở.
- Nếu có liên kết:
  - Gom `related` theo **Page_File** (mỗi page chỉ một panel).
  - Thứ tự panel:
    1. **Current page** (chứa Component_X) — luôn đầu tiên
    2. Các page còn lại theo **thứ tự ID trong connectors** (duyệt outgoing từ Component_X trước, rồi incoming; page trùng chỉ xuất hiện một lần)
  - Page chưa mở → tạo panel mới; page đã mở → **chỉ highlight Component tương ứng**, không tạo panel mới.
  - Expand tối đa 3 page **đầu tiên** trong danh sách trên; các page sau → Shrink (current page không bao giờ Shrink).

**Bước 4 — Highlight & scrollbar markers:**
- Áp dụng viền `selectedComponent` cho mọi instance trong `related` (đúng ID, kể cả nhiều component cùng page).
- Dim component không thuộc `related` trên các page đang hiển thị.
- Vẽ scrollbar markers cho vị trí các Component trong `related` trên từng page tương ứng.

---

## ⚠️ PHẦN D: VALIDATION & XỬ LÝ LỖI

| Tình huống | Hành vi |
|---|---|
| Thiếu `/docs` hoặc `relations.json` | Chặn load; hiện lỗi rõ ràng trên màn hình welcome |
| Không có `styles.json` | Load bình thường; dùng **default style hardcoded** (Phần A.c) |
| File `.p` JSON lỗi | Bỏ qua file đó; liệt kê warning trong console/UI; các file hợp lệ vẫn load |
| Component ID trùng nhau | Warning; instance đầu tiên được index, instance sau bị bỏ qua khi lookup |
| `ref` trỏ ID không tồn tại | Hiển thị placeholder `[ref not found: {id}]` tại Component đó |
| `ref` vòng tròn (A→B→A) | Dừng resolve khi gặp ID đã duyệt; hiển thị placeholder `[circular ref]` |
| Ảnh không tồn tại | Hiển thị placeholder broken image + tên file |
| Connector trỏ ID không tồn tại | Bỏ qua ID đó khi trace; không crash |
| `styles.json` tồn tại nhưng thiếu key hoặc parse lỗi | Key lỗi/thiếu → fallback default hardcoded; file parse lỗi hoàn toàn → dùng toàn bộ default hardcoded |

---

## 📋 PHẦN E: CHECKLIST MVP

- [ ] Chọn thư mục qua File System Access API
- [ ] Parse & index toàn bộ data
- [ ] Sidebar + Page Panel layout (25/75, collapse)
- [ ] Render component (text, img, ref)
- [ ] Panel Expand/Shrink, max 3 Expand
- [ ] Click sidebar → mở/activate page
- [ ] Click component → bidirectional trace + highlight
- [ ] Không duplicate panel cho cùng page
- [ ] Scrollbar markers cho component liên kết
- [ ] Dim non-related components
- [ ] Click outside → deselect
- [ ] Error handling cơ bản (Phần D)

---

## 📎 PHỤ LỤC: VÍ DỤ DỮ LIỆU MẪU

### `docs/intro.p`
```json
[
  { "id": "h1", "type": "header", "status": "done", "content": "Giới thiệu" },
  { "id": "b1", "type": "body",   "status": "done", "content": "Nội dung mục A" },
  { "id": "r1", "type": "ref",   "status": "pending", "content": "b2" }
]
```

### `docs/detail.p`
```json
[
  { "id": "b2", "type": "body", "status": "working", "content": "Chi tiết mục A" },
  { "id": "i1", "type": "img",  "status": "done", "content": "diagram.png" }
]
```

### `relations.json`
```json
{
  "connectors": {
    "b1": ["b2"],
    "b2": ["b1"]
  }
}
```

*Click `b1` → highlight `b1` + `b2`; mở `intro.p` (current) và `detail.p`; marker scrollbar tại vị trí `b1` và `b2`. Click `r1` → highlight chỉ `r1` (ID riêng), dù hiển thị nội dung của `b2`.*
