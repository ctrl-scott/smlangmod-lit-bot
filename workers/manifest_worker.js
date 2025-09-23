// workers/manifest_worker.js
// A module Worker. No localStorage here; the main thread sends prevMarker
// and stores manifest+marker on success.

const ASSETS_DIR_URL = '/assets/';
const MANIFEST_JSON_URL = '/assets/manifest.json'; // optional; preferred if present
const OPTIONAL_ETAG_TXT = '/assets/etag.txt';      // optional manual bump file

// Extract ".pdf" links from a simple directory listing HTML
function extractPdfLinksFromHtml(html, baseUrl) {
  const re = /href\s*=\s*"(.*?)"/gi;
  const set = new Set();
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    if (/\.pdf$/i.test(href)) {
      try {
        const url = new URL(href, baseUrl).pathname;
        if (url.toLowerCase().startsWith(ASSETS_DIR_URL)) {
          set.add(url);
        } else if (!url.includes(':')) {
          set.add(ASSETS_DIR_URL + href.replace(/^\.?\//, ''));
        }
      } catch {/* ignore */}
    }
  }
  return Array.from(set).sort();
}

// Make a simple key from a filename
function toKey(fileNameOnly) {
  const base = fileNameOnly
    .replace(/\.[^.]+$/, '')
    .replace(/[_\-\s]+/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
  const first = (base.split(' ').filter(Boolean)[0]) || base || fileNameOnly.toLowerCase();
  return first;
}

// Build a map { key -> "/assets/Name.pdf" }, resolving collisions with suffixes
function buildKeyedManifest(paths) {
  const map = {};
  for (const p of paths) {
    const name = p.split('/').pop();
    let k = toKey(name);
    let i = 2;
    while (map[k]) k = `${toKey(name)}${i++}`;
    map[k] = p;
  }
  return map;
}

// Optional small file that you can update when assets change
async function fetchCustomEtag() {
  try {
    const r = await fetch(OPTIONAL_ETAG_TXT, { cache: 'no-cache' });
    if (r.ok) {
      const text = (await r.text()).trim();
      if (text) return text;
    }
  } catch {/* ignore */}
  return null;
}

// HEAD /assets/ to sniff ETag/Last-Modified/Content-Length
async function headAssetsDir() {
  try {
    const r = await fetch(ASSETS_DIR_URL, { method: 'HEAD', cache: 'no-cache' });
    if (r.ok) {
      return {
        etag: r.headers.get('ETag') || '',
        lm: r.headers.get('Last-Modified') || '',
        clen: r.headers.get('Content-Length') || ''
      };
    }
  } catch {/* ignore */}
  return { etag: '', lm: '', clen: '' };
}

// GET /assets/manifest.json if present
async function tryManifestJson() {
  try {
    const r = await fetch(MANIFEST_JSON_URL, { cache: 'no-cache' });
    if (!r.ok) return null;
    const data = await r.json();
    if (Array.isArray(data)) {
      // Array of filenames
      const paths = data
        .filter(x => typeof x === 'string' && /\.pdf$/i.test(x))
        .map(x => ASSETS_DIR_URL + x.replace(/^\.?\//, ''));
      return buildKeyedManifest(paths);
    }
    if (data && typeof data === 'object') {
      // Object form: { alias: "file.pdf" } or { alias: { file: "file.pdf" } }
      const out = {};
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === 'string') {
          out[k.toLowerCase()] = ASSETS_DIR_URL + v.replace(/^\.?\//, '');
        } else if (v && typeof v === 'object' && v.file) {
          out[k.toLowerCase()] = ASSETS_DIR_URL + String(v.file).replace(/^\.?\//, '');
        }
      }
      return out;
    }
  } catch {/* ignore */}
  return null;
}

// GET directory HTML and parse links
async function parseDirListing() {
  const r = await fetch(ASSETS_DIR_URL, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Failed to list ${ASSETS_DIR_URL}: ${r.status}`);
  const html = await r.text();
  const paths = extractPdfLinksFromHtml(html, ASSETS_DIR_URL);
  return buildKeyedManifest(paths);
}

// Decide if changed and build if needed
async function buildIfNeeded(prevMarker, prevHasManifest, force) {
  // 1) If you provide etag.txt, use it as the marker
  const custom = await fetchCustomEtag();
  if (custom && !force && prevHasManifest && prevMarker && custom === prevMarker) {
    return { type: 'unchanged' };
  }
  if (custom) {
    // Build using best source available
    const manifest = await (tryManifestJson() || parseDirListing());
    return { type: 'ready', manifest, marker: custom };
  }

  // 2) No custom marker: sniff headers via HEAD
  const head = await headAssetsDir();
  const marker = head.etag || head.lm || head.clen || '';

  if (!force && prevHasManifest && prevMarker && marker && marker === prevMarker) {
    return { type: 'unchanged' };
  }

  // 3) Build using best available listing
  const manifest = await (tryManifestJson() || parseDirListing());
  return { type: 'ready', manifest, marker: marker || String(Date.now()) };
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.type !== 'build') return;
    const prevMarker = msg.prevMarker || '';
    const prevHasManifest = !!msg.prevHasManifest;
    const force = !!msg.force;

    const out = await buildIfNeeded(prevMarker, prevHasManifest, force);
    self.postMessage(out);
  } catch (err) {
    self.postMessage({ type: 'error', error: (err && err.message) || String(err) });
  }
};
