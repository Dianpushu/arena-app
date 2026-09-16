// 從 assets/icon.svg（Arena 競技場標誌）產生桌面圖示：
//   - assets/icon.png（1024px：視窗圖示＋系統匣圖示用）
//   - assets/icon.ico（多尺寸：Windows 安裝包＋工作列用）
// 用法：npm run gen:icon（`npm run dist:win` 與 CI 都會自動先跑這一步）。
//
// 設計：官網的暖米色圓角底（#f5f1e8）＋ 深色標誌（#1c1917），
// 在深淺色工作列上都清晰可辨。

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import pngToIcoPkg from 'png-to-ico';

const pngToIco = pngToIcoPkg.default ?? pngToIcoPkg;

const root = process.cwd();
const svgPath = path.join(root, 'assets', 'icon.svg');
const pngOut = path.join(root, 'assets', 'icon.png');
const icoOut = path.join(root, 'assets', 'icon.ico');

const BG = '#f5f1e8'; // 官網紙色
const MARK = '#1c1917'; // 暖黑
const MARK_RATIO = 0.72; // 標誌佔邊長比例
const CORNER_RATIO = 0.22; // 圓角比例

try {
  await fs.access(svgPath);
} catch {
  console.error(`找不到 ${svgPath}。`);
  process.exit(1);
}

/** 合成單一尺寸的完整圖示（米色圓角底＋置中標誌）。 */
async function compose(size) {
  const svg = (await fs.readFile(svgPath, 'utf8')).replaceAll('currentColor', MARK);
  const markSize = Math.round(size * MARK_RATIO);
  const mark = await sharp(Buffer.from(svg)).resize(markSize, markSize).png().toBuffer();
  const radius = Math.round(size * CORNER_RATIO);
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`,
  );
  return sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([
      { input: mark, gravity: 'center' },
      { input: mask, blend: 'dest-in' },
    ])
    .png()
    .toBuffer();
}

// 1) 主 PNG（1024px）
await fs.writeFile(pngOut, await compose(1024));
console.log(`✅ 已產生 ${pngOut}`);

// 2) Windows .ico（工作列/檔案總管/標題列各尺寸）
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arena-icon-'));
try {
  const files = [];
  for (const s of [16, 24, 32, 48, 64, 128, 256]) {
    const f = path.join(tmp, `icon-${s}.png`);
    await fs.writeFile(f, await compose(s));
    files.push(f);
  }
  const buf = await pngToIco(files);
  await fs.writeFile(icoOut, buf);
  console.log(`✅ 已產生 ${icoOut}（${(buf.length / 1024).toFixed(1)} KB）`);
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}
