// crops a png to what's drawn and adds the same white margin on every side, since
// mermaid leaves uneven space around some diagrams. node built-ins only
const fs = require("fs");
const zlib = require("zlib");

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function decode(buf) {
  let pos = 8, width, height, bitDepth, colorType;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
      if (data[12] !== 0) throw new Error("interlaced pngs aren't supported");
    }
    if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const bpp = { 6: 4, 2: 3 }[colorType];
  if (bitDepth !== 8 || !bpp) throw new Error(`unsupported png (depth ${bitDepth}, color type ${colorType})`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp, px = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      line[i] = (line[i] + pred) & 255;
    }
    for (let x = 0; x < width; x++) {
      const s = x * bpp, d = (y * width + x) * 4;
      px[d] = line[s]; px[d + 1] = line[s + 1]; px[d + 2] = line[s + 2]; px[d + 3] = bpp === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { width, height, px };
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(zlib.crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encode({ width, height, px }) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) px.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
                        chunk("IEND", Buffer.alloc(0))]);
}

// pad is in image pixels. anything darker than near-white counts as drawn
function trim(file, pad = 40) {
  const img = decode(fs.readFileSync(file));
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (img.px[i + 3] > 0 && Math.min(img.px[i], img.px[i + 1], img.px[i + 2]) < 245) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return;
  const width = x1 - x0 + 1 + pad * 2, height = y1 - y0 + 1 + pad * 2;
  const px = Buffer.alloc(width * height * 4, 255);
  for (let y = y0; y <= y1; y++) {
    img.px.copy(px, ((y - y0 + pad) * width + pad) * 4, (y * img.width + x0) * 4, (y * img.width + x1 + 1) * 4);
  }
  fs.writeFileSync(file, encode({ width, height, px }));
}

module.exports = { trim };
