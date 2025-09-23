// scripts/gen-manifest.mjs
// Generate assets/manifest.json listing all PDFs (recurses subfolders).
// Writes only if content changed.

import fs from 'fs/promises';
import path from 'path';
import process from 'process';

const isPdf = (p) => /\.pdf$/i.test(p);

// Recursively walk a directory and return relative file paths
async function walk(dir, base) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...await walk(abs, base));
    } else if (e.isFile() && isPdf(e.name)) {
      const rel = path.relative(base, abs).split(path.sep).join('/'); // POSIX style
      out.push(rel);
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
  // Default to ./assets; allow override via CLI
  const assetsDir = process.argv[2] || path.join(process.cwd(), '/', 'assets');
  const manifestPath = path.join(assetsDir, 'manifest.json');

  // Validate directory
  try {
    const st = await fs.stat(assetsDir);
    if (!st.isDirectory()) throw new Error('Not a directory');
  } catch {
    console.error(`Assets directory not found: ${assetsDir}`);
    process.exit(1);
  }

  const files = await walk(assetsDir, assetsDir);
  files.sort((a, b) => a.localeCompare(b, 'en'));

  const json = JSON.stringify(files, null, 2) + '\n';
  await writeIfChanged(manifestPath, json);
}

main().catch((err) => {
  console.error('gen-manifest failed:', err?.message || err);
  process.exit(1);
});
