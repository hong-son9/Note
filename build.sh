#!/usr/bin/env bash
# ---------------------------------------------------------------
# Đóng gói bản deploy vào dist/ — phần chính nằm ở build.js
# (wrangler deploy gọi thẳng `node build.js`). Script này chỉ thêm
# bước nén zip để upload tay khi cần.
# ---------------------------------------------------------------
set -e
cd "$(dirname "$0")"

ZIP="project-notes-cloudflare.zip"
rm -f "$ZIP"
node build.js

if command -v zip >/dev/null 2>&1; then
  ( cd dist && zip -q -r "../$ZIP" . )
  echo "✓ Đã tạo $ZIP"
elif command -v powershell >/dev/null 2>&1; then
  powershell -NoProfile -Command "Compress-Archive -Path 'dist\*' -DestinationPath '$ZIP' -Force"
  echo "✓ Đã tạo $ZIP"
else
  echo "(không có lệnh zip, bỏ qua bước nén)"
fi
