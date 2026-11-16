// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePNG, checksum } from './validate-png.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function run(output) {
  const result = spawnSync(process.execPath, [join(repo, 'main.ts')], {
    cwd: tmpdir(),
    env: { PATH: process.env.PATH, MAKEFUN_OUTPUT_DIR: output },
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(readdirSync(output), ['entry.png'], 'Exactly one output file');
  return readFileSync(join(output, 'entry.png'));
}

test('Node 22+ renders one complete deterministic PNG from any working directory', t => {
  const root = mkdtempSync(join(tmpdir(), 'lighthouse-entry-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const a = run(join(root, 'first'));
  const b = run(join(root, 'second'));
  assert.equal(sha256(a), sha256(b), 'Independent render hashes differ');
  assert(a.equals(b), 'Independent render bytes differ');
  assert(a.equals(readFileSync(join(repo, 'entry.png'))), 'Committed preview differs from source');
  const image = validatePNG(a);
  assert.equal(image.width, 1024);
  assert.equal(image.height, 1024);
  assert.deepEqual(image.chunks, ['IHDR', 'IDAT', 'IEND']);
  assert.equal(image.rgb.length, 1024 * 1024 * 3);
  const pixel = (x, y) => [...image.rgb.subarray((y * 1024 + x) * 3, (y * 1024 + x) * 3 + 3)];
  const sky = pixel(100, 100), shell = pixel(640, 730), lantern = pixel(660, 250);
  assert(shell[0] > shell[2] * 2, 'Warm subject should remain distinct from cool background');
  assert(sky[2] > sky[0], 'Storm background should remain cool');
  assert(lantern[0] > 190, 'Lantern should remain illuminated');
  t.diagnostic(`SHA-256 ${sha256(a)}; ${image.bytes} bytes; ${image.width}×${image.height}`);
});

test('CRC implementation agrees with the standard test vector', () => {
  assert.equal(checksum(Buffer.from('123456789')), 0xcbf43926);
});

test('validator rejects damaged or incomplete PNGs', () => {
  const original = readFileSync(join(repo, 'entry.png'));
  const badCRC = Buffer.from(original);
  badCRC[50] ^= 1;
  assert.throws(() => validatePNG(badCRC), /CRC mismatch/);
  assert.throws(() => validatePNG(original.subarray(0, original.length - 5)), /Truncated/);
  assert.throws(() => validatePNG(Buffer.concat([original, Buffer.from([0])])), /Trailing bytes/);
  const badWidth = Buffer.from(original);
  badWidth.writeUInt32BE(1025, 16);
  badWidth.writeUInt32BE(checksum(badWidth.subarray(12, 29)), 29);
  assert.throws(() => validatePNG(badWidth), /Width out of bounds/);
  const badSignature = Buffer.from(original);
  badSignature[0] = 0;
  assert.throws(() => validatePNG(badSignature), /signature mismatch/);
});

test('entry uses only built-in modules and no nondeterministic or network APIs', () => {
  const source = readFileSync(join(repo, 'main.ts'), 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
  assert.deepEqual(imports, ['node:fs', 'node:path', 'node:zlib']);
  assert(!/\bfetch\s*\(|\bhttps?[:.]|Math\.random|Date\.|new Date|child_process|process\.argv/.test(source));
  assert(source.includes("process.env.MAKEFUN_OUTPUT_DIR || '/output'"));
});
