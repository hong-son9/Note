# 🚀 Deploy lên Cloudflare Pages (Direct Upload)

Cách này **không cần Git**, chỉ kéo thả file. Miễn phí, có HTTPS sẵn.

## Bước 1 — Đóng gói

```bash
cd ~/Downloads/project-notes
./build.sh
```

Script sẽ kiểm tra `config.js` đã có key thật chưa (và chặn nếu lỡ dán nhầm secret key),
rồi tạo ra:

- `dist/` — thư mục để kéo thả
- `project-notes-cloudflare.zip` — file zip để upload

Chỉ 5 file được đóng gói: `index.html`, `styles.css`, `app.js`, `config.js`, `_headers`.
`schema.sql`, `README.md`, `build.sh` **không** lên server.

## Bước 2 — Tạo Pages project

1. Vào https://dash.cloudflare.com → **Compute (Workers & Pages)** → **Create**
2. Chọn tab **Pages** → mục **Upload assets** → **Get started**
3. Đặt tên project, ví dụ `project-notes` → **Create project**
4. Kéo thả **thư mục `dist`** (hoặc file zip) vào khung upload
5. Bấm **Deploy site**

Xong — web chạy ở `https://<tên-project>.pages.dev`.

## Bước 3 — Khai báo domain với Supabase

Vào Supabase Dashboard → **Authentication → URL Configuration**:

- **Site URL**: `https://<tên-project>.pages.dev`
- **Redirect URLs**: thêm dòng trên vào

Đăng nhập bằng mật khẩu vẫn chạy nếu bỏ qua bước này, nhưng làm cho đủ để sau này
dùng được link đặt lại mật khẩu / xác nhận email.

## Cập nhật về sau

Sửa code xong thì:

```bash
./build.sh
```

Vào Pages project → tab **Deployments** → **Create new deployment** → kéo thả `dist` lại.
Mỗi lần upload là một bản deploy mới, có thể rollback về bản cũ bất cứ lúc nào.

---

## Về bảo mật

`config.js` được deploy công khai, ai xem source cũng thấy `SUPABASE_ANON_KEY`.
**Đây là thiết kế bình thường của Supabase** — key này chỉ có quyền mà RLS cho phép.
Điều kiện để an toàn:

| Việc cần làm | Ở đâu |
|---|---|
| RLS bật trên cả 3 bảng + policy `auth.uid() = user_id` | đã có trong `schema.sql` |
| **Tắt đăng ký tài khoản mới** | Authentication → Sign In / Providers → Email → tắt *Allow new users to sign up* |
| Không bao giờ để `service_role` / `sb_secret_…` trong `config.js` | `build.sh` tự chặn |

Thiếu bước tắt đăng ký thì người lạ vẫn có thể tự tạo tài khoản trên trang của bạn —
họ không đọc được ghi chú của bạn (RLS chặn), nhưng sẽ chiếm chỗ trong project Supabase.

### Muốn chặn hẳn người lạ vào được trang

Cloudflare Pages có **Cloudflare Access** (miễn phí tới 50 user):
Pages project → **Settings → General → Enable Access policy**, đặt policy chỉ cho email của bạn.
Khi đó người lạ mở link sẽ bị chặn ngay ở cổng, chưa thấy được cả màn hình đăng nhập.
