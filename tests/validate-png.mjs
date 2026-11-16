// SPDX-License-Identifier: MIT
// Independent, strict validator for our one-image PNG deliverable.
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const table = Uint32Array.from({ length: 256 }, (_, value) => {
  let n = value;
  for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n >>> 0;
});

export function checksum(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = table[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

export function validatePNG(bytes) {
  assert(bytes.length >= 57, 'PNG is truncated');
  assert(bytes.length <= 1048576, 'PNG exceeds one MiB');
  assert(bytes.subarray(0, 8).equals(SIGNATURE), 'PNG signature mismatch');
  const chunks = [], data = [];
  let offset = 8, width, height, seenData = false, endedData = false, seenEnd = false;
  while (offset < bytes.length) {
    assert(offset + 12 <= bytes.length, 'Truncated chunk header');
    const length = bytes.readUInt32BE(offset);
    assert(length <= bytes.length - offset - 12, 'Truncated chunk payload');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    assert(/^[A-Za-z]{4}$/.test(type), 'Invalid PNG chunk type');
    const payload = bytes.subarray(offset + 8, offset + 8 + length);
    const expected = bytes.readUInt32BE(offset + 8 + length);
    assert.equal(checksum(bytes.subarray(offset + 4, offset + 8 + length)), expected, `${type} CRC mismatch`);
    if (!chunks.length) assert.equal(type, 'IHDR', 'IHDR must be first');
    if (type === 'IHDR') {
      assert.equal(chunks.length, 0, 'Duplicate IHDR');
      assert.equal(length, 13, 'Invalid IHDR length');
      width = payload.readUInt32BE(0);
      height = payload.readUInt32BE(4);
      assert(width > 0 && width <= 1024, 'Width out of bounds');
      assert(height > 0 && height <= 1024, 'Height out of bounds');
      assert.equal(payload[8], 8, 'Expected eight-bit samples');
      assert.equal(payload[9], 2, 'Expected RGB colour type');
      assert.equal(payload[10], 0, 'Invalid compression method');
      assert.equal(payload[11], 0, 'Invalid filter method');
      assert.equal(payload[12], 0, 'Expected no interlacing');
    } else if (type === 'IDAT') {
      assert(!endedData, 'Nonconsecutive IDAT chunks');
      assert(length > 0, 'Empty image data');
      seenData = true;
      data.push(payload);
    } else if (type === 'IEND') {
      assert(seenData, 'Missing image data');
      assert.equal(length, 0, 'Nonempty IEND');
      assert.equal(offset + 12, bytes.length, 'Trailing bytes after IEND');
      seenEnd = true;
      endedData = true;
    } else {
      // The renderer has no metadata, profiles, text, or extra image payloads.
      assert.fail(`Unexpected chunk ${type}`);
    }
    chunks.push(type);
    offset += length + 12;
  }
  assert(seenEnd, 'Missing IEND');
  assert.equal(offset, bytes.length, 'Unconsumed image bytes');
  const stride = width * 3;
  const expectedLength = (stride + 1) * height;
  const compressed = Buffer.concat(data);
  const stream = inflateSync(compressed, { maxOutputLength: expectedLength, info: true });
  assert.equal(stream.engine.bytesWritten, compressed.length, 'Trailing compressed bytes');
  const raw = stream.buffer;
  assert.equal(raw.length, expectedLength, 'Pixel stream length mismatch');
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    assert(filter <= 4, 'Invalid scanline filter');
    for (let x = 0; x < stride; x++) {
      const left = x >= 3 ? rgb[y * stride + x - 3] : 0;
      const up = y ? rgb[(y - 1) * stride + x] : 0;
      const corner = y && x >= 3 ? rgb[(y - 1) * stride + x - 3] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      if (filter === 2) predictor = up;
      if (filter === 3) predictor = Math.floor((left + up) / 2);
      if (filter === 4) {
        const p = left + up - corner;
        const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - corner);
        predictor = a <= b && a <= c ? left : b <= c ? up : corner;
      }
      rgb[y * stride + x] = (raw[y * (stride + 1) + x + 1] + predictor) & 255;
    }
  }
  return { width, height, chunks, rgb, bytes: bytes.length };
}
