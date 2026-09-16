// 從 assets/icon.png 產生 Windows 用的 assets/icon.ico。
// 用法：npm run gen:icon（`npm run dist:win` 與 CI 都會自動先跑這一步）。
// 換圖示只要換掉 assets/icon.png 再跑一次即可。

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import pngToIcoPkg from 'png-to-ico';

const pngToIco = pngToIcoPkg.default ?? pngToIcoPkg;

const root = process.cwd();
const src = path.join(root, 'assets', 'icon.png');
const out = path.join(root, 'assets', 'icon.ico');

try {
  await fs.access(src);
} catch {
  console.error(`找不到 ${src}，請先放一張 512x512 以上的 PNG 圖示。`);
  process.exit(1);
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arena-icon-'));
try {
  // Windows 工作列/檔案總管/視窗標題列會用到不同尺寸，一次內嵌 7 種。
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const files = [];
  for (const s of sizes) {
    const f = path.join(tmp, `icon-${s}.png`);
    await sharp(src).resize(s, s, { fit: 'cover' }).png().toFile(f);
    files.push(f);
  }
  const buf = await pngToIco(files);
  await fs.writeFile(out, buf);
  console.log(`✅ 已產生 ${out}（${(buf.length / 1024).toFixed(1)} KB）`);
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}
