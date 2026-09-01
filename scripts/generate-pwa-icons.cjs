// Simple script to generate valid PNG icons for PWA
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPng(width, height, r, g, b) {
  // Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace

  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // Raw image data with filter byte 0 at start of each scanline
  const scanlineLength = width * 4 + 1;
  const rawData = Buffer.alloc(height * scanlineLength);

  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.44;
  const innerRadius = width * 0.38;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter None

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= innerRadius) {
        // Center badge - Deep Navy with Gold / White Accent
        if (Math.abs(dx) < width * 0.15 && Math.abs(dy) < height * 0.15) {
          rawData[pxOffset] = 250;     // R
          rawData[pxOffset + 1] = 204; // G
          rawData[pxOffset + 2] = 21;  // B (Gold)
          rawData[pxOffset + 3] = 255; // A
        } else {
          rawData[pxOffset] = 15;      // R
          rawData[pxOffset + 1] = 23;  // G
          rawData[pxOffset + 2] = 42;  // B (Navy)
          rawData[pxOffset + 3] = 255; // A
        }
      } else if (dist <= radius) {
        // Gold Border Ring
        rawData[pxOffset] = 234;     // R
        rawData[pxOffset + 1] = 179; // G
        rawData[pxOffset + 2] = 8;   // B (Amber Gold)
        rawData[pxOffset + 3] = 255; // A
      } else {
        // Royal Blue Outer Fill
        rawData[pxOffset] = 0;       // R
        rawData[pxOffset + 1] = 68;  // G
        rawData[pxOffset + 2] = 181; // B (Royal Blue)
        rawData[pxOffset + 3] = 255; // A
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
    }
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const typeAndData = buf.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

const publicDir = path.join(__dirname, '..', 'public');
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPng(192, 192, 0, 68, 181));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPng(512, 512, 0, 68, 181));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createPng(512, 512, 0, 68, 181));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPng(180, 180, 0, 68, 181));
console.log('PWA icon assets created successfully');
