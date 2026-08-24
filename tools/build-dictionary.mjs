#!/usr/bin/env node
/**
 * build-dictionary.mjs
 * ---------------------------------------------------------------------------
 * Builds `data/dizionario.txt` from three upstream sources (see data/SOURCE.md):
 *
 *   tools/sources/it_IT.dic   Hunspell it_IT stem list (LibreOffice)  GPL-3.0
 *   tools/sources/it_50k.txt  OpenSubtitles frequency list (hermitdave) MIT
 *   tools/sources/badwords.txt  Italian profanity list (napolux)        MIT
 *
 * Run `node tools/fetch-sources.mjs` first to download them.
 *
 * Output format: one entry per line, `word<TAB>tier`
 *   tier 0 = easy   (common word, also present in medium and hard)
 *   tier 1 = medium (moderately common)
 *   tier 2 = hard   (rest of the vocabulary)
 * The file is pre-sorted with Intl.Collator('it'), which is exactly the
 * comparator the game uses at runtime, so the browser never has to re-sort.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'tools', 'sources');
const OUT = path.join(ROOT, 'data', 'dizionario.txt');

// Italian letters we accept. Hunspell stems also contain proper nouns,
// abbreviations, apostrophes and hyphenated forms: all of those are dropped.
const ALLOWED = /^[a-zàáèéìíîòóùú]+$/;
const MIN_LEN = 3;
const MAX_LEN = 14;

// Frequency cut-offs (rank in the OpenSubtitles 50k list).
const EASY_RANK = 6000;
const MEDIUM_RANK = 25000;
// Easy words are additionally kept short, so the "facile" pool stays friendly.
const EASY_MAX_LEN = 9;

function read(file) {
  return fs.readFileSync(path.join(SRC, file), 'utf8');
}

/** Hunspell .dic: first line is a count, `/` lines are comments, `word/FLAGS`. */
function parseDic(text) {
  const out = new Set();
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('/')) continue;
    // Strip affix flags and morphological fields.
    const word = line.split('/')[0].split(/\s|\t/)[0];
    if (!word) continue;
    // A leading capital marks a proper noun in this dictionary.
    if (word[0] !== word[0].toLowerCase()) continue;
    const w = word.toLowerCase();
    if (w.length < MIN_LEN || w.length > MAX_LEN) continue;
    if (!ALLOWED.test(w)) continue;
    out.add(w);
  }
  return out;
}

/** hermitdave list: `word count`, already sorted by descending frequency. */
function parseFrequency(text) {
  const rank = new Map();
  let r = 0;
  for (const line of text.split(/\r?\n/)) {
    const word = line.split(' ')[0];
    if (!word) continue;
    r += 1;
    if (!rank.has(word)) rank.set(word, r);
  }
  return rank;
}

function parseBadwords(text) {
  return new Set(
    text
      .split(/\r?\n/)
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean)
  );
}

const dic = parseDic(read('it_IT.dic'));
const rank = parseFrequency(read('it_50k.txt'));
const bad = parseBadwords(read('badwords.txt'));

let removedBad = 0;
for (const w of bad) {
  if (dic.delete(w)) removedBad += 1;
}

// A tiny hand-curated addendum for real Italian words the Hunspell stem list
// happens to miss -- "zuzzurellone" being the one this game is named after.
const forcedTier = new Map();
for (const line of fs
  .readFileSync(path.join(ROOT, 'tools', 'extra-words.txt'), 'utf8')
  .split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const [w, t] = trimmed.split(/\t+/);
  dic.add(w);
  forcedTier.set(w, Number(t));
}

const collator = new Intl.Collator('it', { sensitivity: 'variant' });
const words = [...dic].sort(collator.compare);

const counts = [0, 0, 0];
const lines = words.map((w) => {
  const r = rank.get(w) ?? Infinity;
  let tier = 2;
  if (r <= EASY_RANK && w.length <= EASY_MAX_LEN) tier = 0;
  else if (r <= MEDIUM_RANK) tier = 1;
  if (forcedTier.has(w)) tier = forcedTier.get(w);
  counts[tier] += 1;
  return `${w}\t${tier}`;
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');

// ---------------------------------------------------------------------------
// Front-coded payload shipped to the browser.
//
// The list is sorted, so consecutive entries share long prefixes. Each entry is
// encoded as:   <base36 shared-prefix length><suffix letters><tier digit>
// Words contain letters only, tiers are digits, so the stream self-delimits and
// needs no separators. That takes ~1030 KB down to ~500 KB of plain ASCII-ish
// text, and it is loaded as a <script> (not fetch) so the game also runs when
// index.html is opened straight from disk with the file:// protocol.
// ---------------------------------------------------------------------------
const tiers = lines.map((l) => l.split('\t')[1]);
let payload = '';
let prev = '';
for (let i = 0; i < words.length; i++) {
  const w = words[i];
  let p = 0;
  const max = Math.min(prev.length, w.length, 35);
  while (p < max && prev[p] === w[p]) p++;
  payload += p.toString(36) + w.slice(p) + tiers[i];
  prev = w;
}

const JS_OUT = path.join(ROOT, 'data', 'dizionario.js');
fs.writeFileSync(
  JS_OUT,
  '/* Generated by tools/build-dictionary.mjs -- do not edit by hand.\n' +
    '   Derived from the LibreOffice Hunspell it_IT dictionary (GPL-3.0).\n' +
    '   See data/SOURCE.md and data/LICENSE-DIZIONARIO.txt. */\n' +
    'window.ABACO_DATA=' +
    JSON.stringify({ count: words.length, packed: payload }) +
    ';\n',
  'utf8'
);

const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
const jskb = (fs.statSync(JS_OUT).size / 1024).toFixed(0);
console.log(`dizionario.txt written: ${words.length} words, ${kb} KB`);
console.log(`dizionario.js  written: ${jskb} KB (front-coded)`);
console.log(`  tier 0 (facile):   ${counts[0]}`);
console.log(`  tier 1 (medio):    ${counts[1]}  -> pool medio = ${counts[0] + counts[1]}`);
console.log(`  tier 2 (difficile):${counts[2]}  -> pool difficile = ${words.length}`);
console.log(`  profanities removed: ${removedBad}`);
console.log(`  first: ${words[0]}   last: ${words[words.length - 1]}`);
