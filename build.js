#!/usr/bin/env node
// ---------------------------------------------------------------
// Đóng gói bản deploy vào dist/
//
// Viết bằng Node (không phải bash) để `wrangler deploy` chạy được ở cả hai nơi:
//   - Dưới máy Windows : wrangler gọi lệnh build qua cmd, không chạy được ./build.sh
//                        -> lấy key từ config.js
//   - Trên Cloudflare  : lấy key từ biến môi trường SUPABASE_URL / SUPABASE_ANON_KEY
//                        (config.js không nằm trong git)
// ---------------------------------------------------------------
const fs = require("fs");
const path = require("path");

process.chdir(__dirname);
const OUT = "dist";
const fail = (msg) => { console.error("✗ " + msg); process.exit(1); };

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of ["index.html", "styles.css", "app.js", "_headers"]) {
  fs.copyFileSync(f, path.join(OUT, f));
}

// ---------- config.js ----------
const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
let key;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  console.log("→ Dựng config.js từ biến môi trường");
  key = SUPABASE_ANON_KEY;
  fs.writeFileSync(path.join(OUT, "config.js"),
    "window.APP_CONFIG = {\n" +
    "  SUPABASE_URL: " + JSON.stringify(SUPABASE_URL) + ",\n" +
    "  SUPABASE_ANON_KEY: " + JSON.stringify(SUPABASE_ANON_KEY) + "\n" +
    "};\n");
} else {
  console.log("→ Dùng config.js dưới máy");
  if (!fs.existsSync("config.js")) {
    fail("Không có config.js, cũng không có SUPABASE_URL / SUPABASE_ANON_KEY.\n" +
         "  Copy config.example.js thành config.js rồi điền key, hoặc đặt 2 biến môi trường.");
  }
  const cfg = fs.readFileSync("config.js", "utf8");
  if (/YOUR-PROJECT-REF|YOUR-ANON/.test(cfg)) {
    fail("config.js vẫn còn giá trị mẫu. Hãy điền SUPABASE_URL và SUPABASE_ANON_KEY trước.");
  }
  key = (cfg.split("\n").find((l) => l.includes("SUPABASE_ANON_KEY")) || "");
  fs.copyFileSync("config.js", path.join(OUT, "config.js"));
}

// ---------- chốt chặn: không bao giờ deploy secret key ----------
if (/sb_secret_|service_role/i.test(key)) {
  fs.rmSync(OUT, { recursive: true, force: true });
  fail("Key hình như là secret / service_role. TUYỆT ĐỐI không deploy key này.");
}

console.log("✓ Đã tạo " + OUT + "/");
