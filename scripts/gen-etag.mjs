// scripts/gen-etag.mjs
// Generate assets/etag.txt as a SHA-256 of file metadata.
// Writes only if content changed.

import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { createHash } from 'crypto';

const isPdf = (p) => /\.pdf$/i.test(p);

async function walk(dir, base) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...await walk(abs, base));
    } else if (e.isFile() && isPdf(e.name)) {
      const rel = path.relative(base, abs).split(path.sep).join('/');
      const st = await fs.stat(abs);
      out.push({
        path: rel,
        size: st.size,
        mtimeMs: Math.floor(st.mtimeMs)
      });
    }
  }
  return out;
}

async function writeIfChanged(filePath, content) {
  try {
    const prev = await fs.readFile(filePath, 'utf8');
    if (prev === content) {
      console.log(`No change: ${filePath}`);
      return false;
    }
  } catch {
    // File missing or unreadable; proceed to write
  }
  await fs.writeFile(filePath, content, 'utf8');
  console.log(`Wrote: ${filePath}`);
  return true;
}

async function main() {
  // Default to ./public/assets; allow override via CLI
  const assetsDir = process.argv[2] || path.join(process.cwd(), '/', 'assets');
  const etagPath = path.join(assetsDir, 'etag.txt');

  try {
    const st = await fs.stat(assetsDir);
    if (!st.isDirectory()) throw new Error('Not a directory');
  } catch {
    console.error(`Assets directory not found: ${assetsDir}`);
    process.exit(1);
  }

  const meta = await walk(assetsDir, assetsDir);
  // Stable ordering to ensure deterministic hash
  meta.sort((a, b) => a.path.localeCompare(b.path, 'en'));

  const payload = JSON.stringify(meta);
  const hash = createHash('sha256').update(payload).digest('hex');
  const content = hash + '\n';

  await writeIfChanged(etagPath, content);
}

main().catch((err) => {
  console.error('gen-etag failed:', err?.message || err);
  process.exit(1);
});
