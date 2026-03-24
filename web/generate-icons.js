// Generates public/icon.png (512x512) using only Node built-ins.
// Run with: node generate-icons.js

const zlib = require("zlib");
const fs = require("fs");

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([t, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, t, data, crcBuf]);
}

function makePNG(size, pixelFn) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  // compression, filter, interlace = 0

  const rowLen = 1 + size * 3;
  const raw = Buffer.alloc(rowLen * size);
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelFn(x, y, size);
      raw[y * rowLen + 1 + x * 3] = r;
      raw[y * rowLen + 1 + x * 3 + 1] = g;
      raw[y * rowLen + 1 + x * 3 + 2] = b;
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", Buffer.alloc(0))]);
}

// Distance from point (px,py) to line segment (x1,y1)-(x2,y2)
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function iconPixel(x, y, size) {
  const s = size;
  // Background: #09090b
  const bg = [9, 9, 11];
  // Line color: soft blue-white #a5b4fc (indigo-300)
  const line = [165, 180, 252];

  // Upward trending sparkline — 5 points
  const pts = [
    [s * 0.15, s * 0.72],
    [s * 0.32, s * 0.58],
    [s * 0.50, s * 0.42],
    [s * 0.68, s * 0.30],
    [s * 0.85, s * 0.20],
  ];

  const thick = s * 0.042; // line thickness

  // Check proximity to each segment
  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegment(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) < thick) {
      return line;
    }
  }

  // Dots at each point
  for (const [px, py] of pts) {
    if (Math.hypot(x - px, y - py) < thick * 1.4) return line;
  }

  return bg;
}

const png512 = makePNG(512, iconPixel);
fs.writeFileSync("public/icon-512.png", png512);
console.log("✓ public/icon-512.png created (512x512)");

const png192 = makePNG(192, iconPixel);
fs.writeFileSync("public/icon-192.png", png192);
console.log("✓ public/icon-192.png created (192x192)");

// Keep icon.png as 512 for any other references
fs.writeFileSync("public/icon.png", png512);
console.log("✓ public/icon.png created (512x512)");
