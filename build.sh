#!/usr/bin/env bash
# ---------------------------------------------------------------
# Đóng gói bản deploy cho Cloudflare Pages (Direct Upload)
# Chạy:  ./build.sh
# Kết quả: dist/  và  project-notes-cloudflare.zip
# ---------------------------------------------------------------
set -e
cd "$(dirname "$0")"

OUT="dist"
ZIP="project-notes-cloudflare.zip"

# 1. Kiểm tra config.js đã điền key thật chưa
if grep -q "YOUR-PROJECT-REF\|YOUR-ANON" config.js; then
  echo "✗ config.js vẫn còn giá trị mẫu. Hãy điền SUPABASE_URL và SUPABASE_ANON_KEY trước."
  exit 1
fi
KEYLINE=$(grep "SUPABASE_ANON_KEY" config.js | head -1)
if echo "$KEYLINE" | grep -qi "sb_secret_\|service_role"; then
  echo "✗ SUPABASE_ANON_KEY hình như là secret / service_role key. TUYỆT ĐỐI không deploy key này."
  exit 1
fi

# 2. Dựng thư mục dist
rm -rf "$OUT" "$ZIP"
mkdir -p "$OUT"
cp index.html styles.css app.js config.js _headers "$OUT"/

# 3. Nén — các file nằm ở gốc file zip (Cloudflare yêu cầu vậy)
( cd "$OUT" && zip -q -r "../$ZIP" . )

echo "✓ Đã tạo $OUT/ và $ZIP"
echo
echo "  Kéo thả một trong hai vào Cloudflare Pages > Upload assets:"
echo "    thư mục : $(pwd)/$OUT"
echo "    file zip: $(pwd)/$ZIP"
