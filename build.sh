#!/usr/bin/env bash
# ---------------------------------------------------------------
# Đóng gói bản deploy vào dist/
#
# Chạy được ở hai nơi:
#   - Dưới máy    : lấy key từ config.js
#   - Trên Cloudflare : lấy key từ biến môi trường SUPABASE_URL / SUPABASE_ANON_KEY
#                       (config.js không nằm trong git)
# ---------------------------------------------------------------
set -e
cd "$(dirname "$0")"

OUT="dist"
ZIP="project-notes-cloudflare.zip"

rm -rf "$OUT" "$ZIP"
mkdir -p "$OUT"
cp index.html styles.css app.js _headers "$OUT"/

# ---------- config.js ----------
if [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_ANON_KEY" ]; then
  echo "→ Dựng config.js từ biến môi trường"
  KEY="$SUPABASE_ANON_KEY"
  cat > "$OUT/config.js" <<CFG
window.APP_CONFIG = {
  SUPABASE_URL: "$SUPABASE_URL",
  SUPABASE_ANON_KEY: "$SUPABASE_ANON_KEY"
};
CFG
else
  echo "→ Dùng config.js dưới máy"
  if [ ! -f config.js ]; then
    echo "✗ Không có config.js, cũng không có SUPABASE_URL / SUPABASE_ANON_KEY."
    echo "  Copy config.example.js thành config.js rồi điền key, hoặc đặt 2 biến môi trường."
    exit 1
  fi
  if grep -q "YOUR-PROJECT-REF\|YOUR-ANON" config.js; then
    echo "✗ config.js vẫn còn giá trị mẫu. Hãy điền SUPABASE_URL và SUPABASE_ANON_KEY trước."
    exit 1
  fi
  KEY=$(grep "SUPABASE_ANON_KEY" config.js | head -1)
  cp config.js "$OUT"/
fi

# ---------- chốt chặn: không bao giờ deploy secret key ----------
if echo "$KEY" | grep -qi "sb_secret_\|service_role"; then
  echo "✗ Key hình như là secret / service_role. TUYỆT ĐỐI không deploy key này."
  rm -rf "$OUT"
  exit 1
fi

# ---------- file zip để upload tay (bỏ qua nếu máy build không có zip) ----------
if command -v zip >/dev/null 2>&1; then
  ( cd "$OUT" && zip -q -r "../$ZIP" . )
  echo "✓ Đã tạo $OUT/ và $ZIP"
else
  echo "✓ Đã tạo $OUT/ (không có lệnh zip, bỏ qua bước nén)"
fi
