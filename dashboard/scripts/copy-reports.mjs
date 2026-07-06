// Chạy trước khi build (npm run prebuild) — copy report JSON từ ../reports
// vào public/reports/ để Vite bundle vào static output, và tạo index.json
// làm manifest liệt kê các report có sẵn (vì static hosting không cho list
// thư mục trực tiếp).

import { readdirSync, mkdirSync, copyFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_SRC = join(__dirname, "..", "..", "reports");
const REPORTS_DEST = join(__dirname, "..", "public", "reports");

function main() {
  if (!existsSync(REPORTS_SRC)) {
    console.warn(`[copy-reports] Không tìm thấy thư mục ${REPORTS_SRC}, bỏ qua.`);
    return;
  }

  mkdirSync(REPORTS_DEST, { recursive: true });

  const files = readdirSync(REPORTS_SRC).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    copyFileSync(join(REPORTS_SRC, file), join(REPORTS_DEST, file));
  }

  // Manifest sắp xếp mới nhất trước (tên file dạng YYYY-MM-DD.json nên sort string là đủ)
  const manifest = files.sort().reverse();
  writeFileSync(join(REPORTS_DEST, "index.json"), JSON.stringify(manifest, null, 2));

  console.log(`[copy-reports] Đã copy ${files.length} report vào public/reports/`);
}

main();
