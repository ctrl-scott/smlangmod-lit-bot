// workers/kjv_worker.js
// Ensure kjv_strongs.js sits in the SAME folder as this worker.
import { kjvStrongsData } from './kjv_strongs.js';

const STRONGS_RE = /\b[HG]\d{3,5}\b/i;
const BOOKS = new Set([
  "Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth",
  "1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra",
  "Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Solomon",
  "Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos",
  "Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi",
  "Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians",
  "Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy",
  "2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John",
  "3 John","Jude","Revelation"
]);

onmessage = (e) => {
  const { kind, qid, query, opts } = e.data || {};
  if (kind !== 'kjv:search') return;

  try {
    const results = searchKJV(query || '', opts || { limit: 5, phrase: false });
    postMessage({ kind: 'kjv:done', qid, results });
  } catch (err) {
    postMessage({ kind: 'kjv:error', qid, error: (err && err.message) || String(err) });
  }
};

// Main search: returns an array of { reference, snippet }
function searchKJV(query, opts) {
  const limit = Math.max(1, opts.limit || 5);
  const q = query.trim();
  const results = [];

  // A) Strong’s ID
  if (STRONGS_RE.test(q)) {
    const target = q.toUpperCase();
    for (const v of kjvStrongsData.verses) {
      if (!v?.text) continue;
      if (v.text.toUpperCase().includes(`{${target}}`)) {
        results.push({ reference: refOf(v), snippet: v.text });
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  // B) Quoted phrase (exact substring)
  const phraseMatch = q.match(/^["“](.+?)["”]$/);
  if (phraseMatch) {
    const needle = phraseMatch[1].toLowerCase();
    for (const v of kjvStrongsData.verses) {
      if (!v?.text) continue;
      if (v.text.toLowerCase().includes(needle)) {
        results.push({ reference: refOf(v), snippet: v.text });
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  // C) Book name (e.g., Psalms)
  const title = capitalizeWords(q);
  if (BOOKS.has(title)) {
    for (const v of kjvStrongsData.verses) {
      if (v.book_name === title) {
        results.push({ reference: refOf(v), snippet: v.text || '' });
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  // D) General word: match book name OR verse text
  const token = q.toLowerCase();
  for (const v of kjvStrongsData.verses) {
    if (!v?.text) continue;
    if (v.book_name.toLowerCase().includes(token) || v.text.toLowerCase().includes(token)) {
      results.push({ reference: refOf(v), snippet: v.text });
      if (results.length >= limit) break;
    }
  }
  return results;
}

function refOf(v) {
  return `${v.book_name} ${v.chapter}:${v.verse}`;
}
function capitalizeWords(s) {
  return s.replace(/\w+\b/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}
