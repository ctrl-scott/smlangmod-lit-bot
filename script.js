//import * as nlp from './libs/compromise/builds/compromise.min.js';
// ---------- lightweight utilities ----------
const $ = sel => document.querySelector(sel);
const chat = $('#chatbox');
const logWin = $('#log-window');
const input = $('#user-input');
const form = $('#chat-form');
const sendBtn = $('#send-btn');
const Bot = 'Jolene';
const bot = 'Jolene (Computer)';

// Logging function to append messages to the log window
function log(msg) {
  const line = document.createElement('div');
  line.textContent = msg;
  logWin.appendChild(line);
  logWin.scrollTop = logWin.scrollHeight;
}

// Function to add messages to the chatbox
function addMsg(sender, text) {
  const div = document.createElement('div');
  div.className = `msg ${sender === 'You' ? 'me' : 'bot'}`;
  div.innerHTML = escapeHTML(text);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

/* Escape HTML function to avoid XSS attacks
*/
const escapeHTML = s => {
  if (typeof s !== 'string') return '';  // Return empty string if input is not a string
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
};
/*
const escapeHTML = s => s.replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);*/

// ---------- compromise (NLP library) ----------
//import nlp from 'https://cdn.skypack.dev/compromise';
//const nlp = window.__nlp;

// ---------- minimal sentiment analysis ----------
const POS = new Set(['good', 'great', 'awesome', 'amazing', 'love', 'nice', 'happy', 'glad']);
const NEG = new Set(['bad', 'sad', 'angry', 'horrible', 'upset', 'frustrating', 'annoyed']);

function getSentiment(s) {
  const toks = s.toLowerCase().split(/\W+/);
  let p = 0, n = 0;
  toks.forEach(t => { if (POS.has(t)) p++; if (NEG.has(t)) n++; });
  return p > n ? 'positive' : n > p ? 'negative' : 'neutral';
}

// ---------- lazy PDF extraction (on-demand) ----------
const pdfLibPromise = (async () => {
  // defer load until first time we actually need PDF.js
  const mod = await import('./libs/pdfjs-5.4.149-dist/build/pdf.mjs');
  mod.GlobalWorkerOptions.workerSrc = './libs/pdfjs-5.4.149-dist/build/pdf.worker.mjs';
  return mod;
})();

async function extractPDFTextOnce(pdfPath, pageLimit = 3) {
  const pdfjs = await pdfLibPromise;
  const doc = await pdfjs.getDocument(pdfPath).promise;
  const max = Math.min(doc.numPages, pageLimit);
  let text = '';
  for (let i = 1; i <= max; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    text += tc.items.map(it => it.str).join(' ') + ' ';
  }
  return text;
}

// small memo so repeated queries don’t refetch/parse
const pdfCache = new Map(); // key: path -> text
async function getPdfSnippet(which, chars = 600) {
  // map short names to asset paths
  const paths = {
    pride: './assets/PP_Austen_PD_1.pdf',
    devlin: './assets/HowtoSpeakWrite_Devlin_PD_1.pdf',
    jimmie: './assets/AdvnturesJimmieDale_Packard_PD_1.pdf'
  };
  const path = paths[which];
  if (!path) return null;

  if (!pdfCache.has(path)) {
    log(`PDF load on demand: ${path}`);
    const text = await extractPDFTextOnce(path, 4); // first few pages only
    pdfCache.set(path, text);
  }
  const full = pdfCache.get(path) || '';
  return full.slice(0, chars);
}

// ---------- KJV/Strongs streaming search via Web Worker ----------
// Worker Setup: Ensure worker is initialized correctly
const kjvWorker = new Worker('kjv_worker.js', { type: 'module' });

// Listen for results from the worker
kjvWorker.onmessage = function (e) {
  const { kind, qid, results, error } = e.data;

  if (error) {
    console.log(`KJV Worker Error: ${error}`);
    addMsg(Bot, `Sorry, something went wrong with the search.`);
  } else if (kind === 'kjv:done') {
    console.log(`Results from Worker: ${JSON.stringify(results)}`);
    displayResults(results);
  }
};



/* Send the search query to the worker
function searchKJVStream(query, opts = { limit: 5, phrase: false }) {
  return new Promise((resolve, reject) => {
    const queryId = Date.now();  // unique query ID to match results
    const onResult = (e) => {
      if (e.data.qid !== queryId) return;
      kjvWorker.removeEventListener('message', onResult);
      if (e.data.kind === 'kjv:done') {
        resolve(e.data.results);
      } else if (e.data.kind === 'kjv:error') {
        reject(new Error(e.data.error));
      }
    };

    kjvWorker.addEventListener('message', onResult);
    kjvWorker.postMessage({ kind: 'kjv:search', qid: queryId, query, opts });
  });
}
*/
// ---------- query router (fast paths first) ----------
// ---------- Strong's Reference (H####) Regex ----------
const STRONGS_RE = /\b[HG]\d{3,5}\b/i;

async function getBotResponse(userText) {
  const msg = userText.trim();
  if (!msg) return "Say something and I’ll try my best 🙂";

  const lc = msg.toLowerCase();
  
  // ---------- Friendly basics (greetings, etc.) ----------
  if (/\b(hi|hello|hey)\b/.test(lc)) return "Hello! What would you like to explore?";
  if (/\bhow are you\b/.test(lc)) return "I'm doing great—thanks for asking! How about you?";

  // ---------- Strong's lookup (priority) ----------
  if (STRONGS_RE.test(msg)) {
    const res = await searchKJVStream(msg, { limit: 5 });
    if (res.length) return formatKJV(res, `Results for ${msg}`);
    return `I didn’t find Strong’s reference ${msg}.`;
  }

  // ---------- PDF Snippets (specific works) ----------
  if (/\b(jane|austen|pride|elizabeth|bingley|darcy)\b/.test(lc)) {
    const snip = await getPdfSnippet('pride', 800);
    if (snip) return `From Pride & Prejudice (opening snippet):\n${snip}`;
  }
  if (/\b(jimmie|dale|st\.?\s*james)\b/.test(lc)) {
    const snip = await getPdfSnippet('jimmie', 800);
    if (snip) return `From The Adventures of Jimmie Dale (opening snippet):\n${snip}`;
  }
  if (/\b(speak and write|devlin|perspicuity|precision)\b/.test(lc)) {
    const snip = await getPdfSnippet('devlin', 800);
    if (snip) return `From How to Speak and Write Correctly (opening snippet):\n${snip}`;
  }

  // ---------- Entity-guided KJV Search (names, places, dates) ----------
  const doc = nlp(lc);
  const people = doc.people().out('array');
  const places = doc.places().out('array');
  const dates  = doc.match('#Date').out('array');

  if (people.length) {
    const name = people[0];
    const res = await searchKJVStream(name, { limit: 5 });
    if (res.length) return formatKJV(res, `Mentions related to "${name}"`);
  }
  if (places.length) {
    const place = places[0];
    const res = await searchKJVStream(place, { limit: 5 });
    if (res.length) return formatKJV(res, `Mentions of "${place}"`);
  }
  if (dates.length) {
    const dateq = dates[0];
    const res = await searchKJVStream(dateq, { limit: 5 });
    if (res.length) return formatKJV(res, `References related to "${dateq}"`);
  }

  // ---------- General KJV Search (fallback) ----------
  const res = await searchKJVStream(msg, { limit: 5 });
  if (res.length) return formatKJV(res, `Here’s what I found:`);

  // ---------- Sentiment Fallback (positive/negative/neutral) ----------
  const sent = getSentiment(msg);
  if (sent === 'positive') return "Love the energy—keep it coming! Want to explore a text or a topic?";
  if (sent === 'negative') return "Sorry it’s feeling rough—want to switch topics or look something up?";

  return "I didn’t find a good match yet. Try a Strong’s ID (e.g., H7225), a phrase in quotes, or name a work (e.g., Jimmie Dale).";
}

// ---------- Search KJV Stream (via Worker) ----------
async function searchKJVStream(query, opts = { limit: 5, phrase: false }) {
  return new Promise((resolve, reject) => {
    const queryId = Date.now();  // unique query ID to match results
    const onResult = (e) => {
      if (e.data.qid !== queryId) return;
      kjvWorker.removeEventListener('message', onResult);
      if (e.data.kind === 'kjv:done') {
        resolve(e.data.results);
      } else if (e.data.kind === 'kjv:error') {
        reject(new Error(e.data.error));
      }
    };

    kjvWorker.addEventListener('message', onResult);
    kjvWorker.postMessage({ kind: 'kjv:search', qid: queryId, query, opts });
  });
}
// Function to display the results from the KJV search
function displayResults(results) {
  if (results.length === 0) {
    addMsg('Bot', "Sorry, I couldn't find any relevant references.");
  } else {
    const formattedResults = results.map(result => {
      const reference = `${result.book} ${result.chapter}:${result.verse}`;
      let snippet = result.text;

      // Optional: Remove Strong's numbers for cleaner display
      snippet = snippet.replace(/{[H|G]\d+}/g, '');  // Remove Strong's references

      // Or, you could format it by keeping the Strong's numbers visible
      // snippet = snippet.replace(/{([H|G]\d+)}/g, '[$1]');  // Optional formatting

      return `• ${escapeHTML(reference)} — ${escapeHTML(snippet)}`;
    }).join('\n');
    
    addMsg('Bot', `Here’s what I found:\n${formattedResults}`);
  }
}


/*function displayResults(results) {
  if (results.length === 0) {
    addMsg('Bot', "Sorry, I couldn't find any relevant references.");
  } else {
    const formattedResults = results.map(result => {
      const reference = result.reference || "No reference";  // Ensure reference exists
      const snippet = result.snippet || "No snippet available";  // Ensure snippet exists
      return `• ${escapeHTML(reference)} — ${escapeHTML(snippet)}`;
    }).join('\n');
    
    addMsg('Bot', `Here’s what I found:\n${formattedResults}`);
  }
}*/
function formatKJV(items, title) {
  // items: [{id, snippet, text}]
  const lines = items.map(it => `• ${escapeHTML(it.id)} — ${it.snippet}`);
  return `${title}\n${lines.join('\n')}`;
}

// ---------- UI handling (debounced submit) ----------
let pending = false;
function setBusy(b) {
  pending = b;
  sendBtn.disabled = b;
  input.disabled = b;
}


form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || pending) return;
  addMsg('You', text);
  input.value = '';
  setBusy(true);
  try {
    const reply = await getBotResponse(text);
    addMsg('Jolene (Computer)', reply);
  } catch (err) {
    log(`ERR: ${err.message}`);
    addMsg('Jolene (Computer)', "Something hiccuped during search. Try a simpler query or another keyword.");
  } finally {
    setBusy(false);
  }
});
