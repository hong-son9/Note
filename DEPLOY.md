# 🚀 Deploy lên Cloudflare Workers bằng Git

Push lên nhánh `main` → Cloudflare tự build và deploy. Không phải kéo thả file nữa.

Worker hiện tại: **misty-grass-d263** → https://misty-grass-d263.hongson15102002.workers.dev

---

## Cách hoạt động

```
push lên main
   └→ Cloudflare clone repo
        └→ npx wrangler deploy
             └→ wrangler đọc wrangler.jsonc, thấy build.command
                  └→ chạy ./build.sh  (dựng dist/, sinh config.js từ biến môi trường)
                       └→ đẩy dist/ lên Worker
```

Lệnh build nằm trong `wrangler.jsonc` chứ không phải ô "Build command" trên dashboard,
nên không lo quên điền hay điền sai.

`config.js` **không nằm trong git** vì chứa key Supabase. Trên Cloudflare nó được
`build.sh` sinh ra lúc build từ hai biến môi trường. Dưới máy thì vẫn lấy từ file `config.js`
như cũ — cùng một script, không phải nhớ hai cách làm.

---

## Cài đặt một lần

### 1. Nối repo

Cloudflare Dashboard → **Workers & Pages** → `misty-grass-d263` → **Settings** → **Build**
→ **Connect** → chọn repo `hong-son9/Note`, nhánh `main`.

### 2. Khai báo lệnh build

| Ô | Điền |
|---|---|
| Root directory | `/` |
| Build command | **để trống** |
| Deploy command | `npx wrangler deploy` |

`build.sh` được gọi từ `wrangler.jsonc` (`build.command`), nên ô Build command không cần điền.
Có điền cũng không sao, chỉ là build chạy hai lần.

### 3. Thêm biến môi trường cho build

Vẫn ở mục **Build** → **Build variables and secrets** → thêm 2 biến:

| Tên | Giá trị | Kiểu |
|---|---|---|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` | Text |
| `SUPABASE_ANON_KEY` | key `anon` / `publishable` | Secret |

Lấy ở Supabase → **Project Settings → API**.

> Phải là **build variables**, không phải runtime variables — `build.sh` chạy ở bước build.

### 4. Xong

```bash
git push
```

Cloudflare tự build và deploy. Xem tiến trình ở tab **Deployments**.

---

## Còn deploy tay được không?

Vẫn được, dùng khi cần thử gấp mà chưa muốn commit:

```bash
./build.sh          # lấy key từ config.js dưới máy
```

Rồi kéo thả `dist/` hoặc `project-notes-cloudflare.zip` vào **Deployments → Create new deployment**.

---

## Kiểm tra đã lên đúng bản chưa

Góc trái dưới, cạnh email, có dấu build dạng `b2026-09-11.1`. Đối chiếu với hằng số
`BUILD` ở đầu `app.js`. Lệch nhau nghĩa là đang xem bản cũ trong cache — `Ctrl+Shift+R`.

---

## Về bảo mật

| Việc cần làm | Ở đâu |
|---|---|
| RLS bật trên cả 3 bảng + policy `auth.uid() = user_id` | đã có trong `schema.sql` |
| **Tắt đăng ký tài khoản mới** | Supabase → Authentication → Sign In / Providers → Email → tắt *Allow new users to sign up* |
| Không bao giờ để `service_role` / `sb_secret_…` làm anon key | `build.sh` tự chặn, cả hai đường lấy key |

Key `anon` luôn công khai trong `config.js` mà trình duyệt tải về — đó là thiết kế của Supabase.
Giữ nó ngoài repo public chỉ để bot quét GitHub không nhặt được, **không** phải lớp bảo vệ chính.
Lớp bảo vệ chính là RLS và việc tắt đăng ký.

### Chặn hẳn người lạ vào trang

Worker → **Settings → Access** → bật **Cloudflare Access**, đặt policy chỉ cho email của bạn.
Miễn phí tới 50 user. Người lạ mở link sẽ bị chặn trước cả màn hình đăng nhập.
