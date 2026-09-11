# 🗂️ DevNotes — Ghi chú dự án

Web app thuần **HTML + CSS + JavaScript**, dữ liệu lưu trên **Supabase** (Auth + Postgres).

```
Dự án  →  Note (tab)  →  Nội dung (dòng trong bảng)
```

Ví dụ: dự án `Aurora Backend` → các note `Cách chạy dự án`, `Bảng cần nhớ`, `Ticket tìm hiểu` →
mỗi note là một tab, bên trong là bảng các mục nội dung.

---

## 1. Tạo project Supabase

1. Vào https://supabase.com → **New project**.
2. Mở **SQL Editor → New query**, dán toàn bộ nội dung file [`schema.sql`](schema.sql) rồi **Run**.
   (Tạo 3 bảng, index, RLS policy và trigger `updated_at`.)
3. Vào **Project Settings → API**, copy:
   - `Project URL`
   - `anon public` key

## 2. Điền key

Mở [`config.js`](config.js) và thay 2 giá trị:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi..."
};
```

> `anon key` là key công khai, an toàn khi để ở front-end **vì đã bật RLS**.
> Không bao giờ dán `service_role` key vào đây.

## 3. Tạo tài khoản cho chính bạn

App **chỉ có màn hình đăng nhập** (dùng cá nhân, không cho đăng ký). Tạo user thủ công:

1. **Authentication → Providers → Email**: bật **Email**.
2. **Authentication → Users → Add user → Create new user**
   - nhập email + mật khẩu
   - tick **Auto Confirm User** để dùng được ngay.
3. Khoá đăng ký từ bên ngoài: **Authentication → Sign In / Providers → Email → tắt "Allow new users to sign up"**.

Đổi mật khẩu sau này: cũng ở **Authentication → Users**, bấm vào user → *Reset password*.

## 4. Chạy web

Mở thẳng `index.html` bằng trình duyệt cũng chạy được, nhưng **nên chạy qua HTTP server**
để tránh vấn đề CORS / clipboard:

```bash
cd ~/Downloads/project-notes

# Cách 1 — Python (có sẵn trên Linux)
python3 -m http.server 5173

# Cách 2 — Node
npx serve .
```

Mở http://localhost:5173

Trong VS Code: cài extension **Live Server** → chuột phải `index.html` → *Open with Live Server*.

---

## Cách dùng

| Thao tác | Ở đâu |
|---|---|
| Đăng nhập | Màn hình đầu tiên |
| Thêm / sửa / xoá dự án | Sidebar trái và thanh trên cùng |
| Thêm / đổi tên / xoá note | Nút **+ Thêm note** cạnh dãy tab, và **✎** / **🗑** |
| Sắp xếp note | **Kéo tab** sang trái/phải — note quan trọng để lên đầu, thứ tự tự lưu |
| Ghi chú | Gõ thẳng vào trang giấy, định dạng bằng thanh công cụ — **không có nút Lưu, không có popup** |
| Tìm dự án | Ô tìm ở sidebar |
| Tìm mọi ghi chú | Ô tìm trên thanh trên cùng, hoặc `Ctrl/Cmd + K` |

### Tìm kiếm toàn bộ

`Ctrl/Cmd + K` (hoặc bấm ô tìm ở thanh trên) → gõ từ 2 ký tự trở lên. Kết quả quét **mọi dự án,
mọi note**, hiện đường dẫn `Dự án › Note` kèm đoạn trích có bôi vàng chỗ khớp.

- `↑` `↓` chọn kết quả · `Enter` mở · `Esc` đóng
- Mở xong sẽ tự nhảy tới đúng đoạn và bôi đen nó trong trang giấy
- Tối đa 60 kết quả một lần tìm

Hai hạn chế cần biết:

- Tìm trên HTML thô, nên nếu từ khoá bị **cắt ngang bởi định dạng** (ví dụ chữ `run` trong
  `npm run dev` được in đậm riêng) thì có thể không khớp
- Ký tự `*` và `%` bị bỏ khỏi từ khoá vì PostgREST coi chúng là ký tự đại diện

### Trang giấy — soạn thảo có định dạng

Mỗi note (tab) là **một trang giấy duy nhất**, luôn ở chế độ gõ được, có thanh công cụ phía trên:

| Nhóm | Có gì |
|---|---|
| Kiểu đoạn | Văn bản · Tiêu đề lớn/vừa/nhỏ · Khối code · Trích dẫn |
| Cỡ chữ | 12 → 40 px |
| Kiểu chữ | **B** in đậm |
| Liên kết | 🔗 bôi đen chữ rồi bấm (hoặc `Ctrl+L`), dán địa chỉ vào |
| Dọn dẹp | ✕ xoá định dạng của phần đang bôi đen, gỡ cả liên kết |

Cách dùng: bôi đen phần chữ → chọn trên thanh công cụ.

**Liên kết:** bôi đen chữ → bấm 🔗 → dán địa chỉ. Hoặc nhanh hơn: copy link sẵn rồi bôi đen chữ
và `Ctrl+V` — chữ đó tự thành liên kết. Bấm vào liên kết là mở tab mới; giữ `Alt` khi bấm nếu
muốn đặt con trỏ vào để sửa chữ.

**Không có màu.** Chữ luôn dùng màu mặc định của theme để đọc được trên nền tối. **Màu nền bị
loại hẳn** ở khâu lọc — vì chữ có nền thì gõ tiếp ngay sau nó sẽ bị ăn theo nền đó, rất khó chịu.
Ghi chú cũ lỡ có nền sẽ được dọn sạch ngay khi mở, và ghi đè ở lần lưu kế tiếp.

**Dán không bị thừa dòng.** Nguồn copy thường kèm ký tự xuống dòng ở cuối hoặc bọc cả đoạn trong
một thẻ khối; cả hai đều bị cắt trước khi chèn.

**Tự lưu:**

- Lưu sau 1,2 giây ngừng gõ, và lưu ngay khi bấm ra ngoài hoặc chuyển tab
- `Ctrl/Cmd + S` — lưu ngay · `Ctrl+B` / `Ctrl+I` / `Ctrl+U` — đậm / nghiêng / gạch chân
- `Tab` — chèn 2 dấu cách, không nhảy focus
- Trạng thái góc phải thanh công cụ: `● Chưa lưu` → `Đang lưu…` → `✓ Đã lưu lúc 09:41`
- Đóng tab trình duyệt khi còn thay đổi chưa lưu sẽ được cảnh báo
- Chấm nhỏ trên mỗi tab sáng lên khi note đó đã có nội dung
- Kéo tab để đổi thứ tự; thứ tự lưu vào cột `position` của `note_tabs` (chỉ dùng được trên máy tính, không kéo được trên cảm ứng)

**Về dữ liệu:** nội dung lưu dưới dạng HTML trong cột `content`. Nội dung cũ dạng văn bản thuần
được tự nhận diện và chuyển sang HTML khi mở, không cần đổi schema. Mọi HTML đều đi qua bộ lọc
(chỉ giữ thẻ định dạng cơ bản, chặn `script` / thuộc tính sự kiện) cả khi tải lên lẫn khi dán vào.

## Cấu trúc file

```
project-notes/
├── index.html        # Giao diện
├── styles.css        # Theme xám tối, chữ trắng
├── app.js            # Toàn bộ logic: auth + soạn thảo + CRUD Supabase
├── config.js         # ⚠️ Điền URL & anon key ở đây
├── config.example.js # Mẫu để commit lên git
├── _headers          # Header bảo mật cho Cloudflare Pages
├── build.sh          # Đóng gói bản deploy -> dist/ + .zip
├── wrangler.jsonc    # Cấu hình Cloudflare Workers (deploy từ Git)
├── schema.sql        # SQL tạo bảng + RLS
├── DEPLOY.md         # Hướng dẫn deploy lên Cloudflare Pages
└── README.md
```

Deploy lên Cloudflare: xem [DEPLOY.md](DEPLOY.md) — nối repo với Workers Builds, `git push` là tự lên.

> Nếu đưa lên git, thêm `config.js` vào `.gitignore` và chỉ commit `config.example.js`.
