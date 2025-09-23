// kjv-worker.js
import { kjvStrongsData } from '.js/kjv_strongs.js';  // Assuming you have the KJV data imported

// Listen for messages from the main script
onmessage = function (e) {
  const { kind, qid, query, opts } = e.data;

  if (kind === 'kjv:search') {
    const results = searchKJV(query, opts);
    postMessage({ kind: 'kjv:done', qid, results });
  }
};

// Function to search for Strong's number in the KJV data
function searchKJV(query, opts = { limit: 5 }) {
  const strongsRe = /\b[HG]\d{3,5}\b/i;
  const results = [];
  const queryLower = query.toLowerCase();

  // Search through all the verses in the KJV Strongs data
  for (let verse of kjvStrongsData.verses) {
    if (verse.text && strongsRe.test(verse.text)) {
      // If the query matches a Strong's number, extract and format the verse
      const strongMatch = verse.text.match(strongsRe);
      if (strongMatch) {
        results.push({
          book: verse.book_name,
          chapter: verse.chapter,
          verse: verse.verse,
          text: verse.text // return the raw verse text
        });

        // Limit the number of results based on the given options
        if (results.length >= opts.limit) break;
      }
    }
  }

  return results;
}

