#!/usr/bin/env node
/**
 * build-dictionary.mjs
 * ---------------------------------------------------------------------------
 * Builds `data/dizionario.txt` + `data/dizionario.js` from four upstream
 * sources (see data/SOURCE.md):
 *
 *   tools/sources/it_IT.aff   Hunspell it_IT affix rules (LibreOffice)  GPL-3.0
 *   tools/sources/it_IT.dic   Hunspell it_IT stem list                  GPL-3.0
 *   tools/sources/it_full.txt OpenSubtitles frequency list (hermitdave) MIT
 *   tools/sources/badwords.txt  Italian profanity list (napolux)        MIT
 *
 * Run `node tools/fetch-sources.mjs` first to download them.
 *
 * The vocabulary is:
 *
 *   (every inflected form the affix rules generate  ∩  attested in the corpus)
 *   ∪  every stem in the .dic
 *
 * The intersection is what makes "casa", "cani", "mangio" and the other
 * everyday inflections exist; without it the game only knew lemmas. Requiring
 * corpus attestation keeps out the 2.7 million theoretical monsters the affix
 * rules also produce ("mangiaglieliene"), which are valid Italian but nobody
 * would ever guess them and they would wreck the "words left" counter.
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
import { unmunch } from './unmunch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'tools', 'sources');
const OUT = path.join(ROOT, 'data', 'dizionario.txt');

// Italian letters we accept. Everything else -- proper nouns, abbreviations,
// apostrophes, hyphens -- is dropped.
const ALLOWED = /^[a-zàáèéìíîòóùú]+$/;
const MIN_LEN = 3;
const MAX_LEN = 16;

// Difficulty cut-offs, expressed as raw occurrences in the OpenSubtitles
// corpus rather than a rank: the corpus has a long flat tail where ranks stop
// meaning anything.
const EASY_MIN_FREQ = 2000;
const MEDIUM_MIN_FREQ = 100;
// Easy words are additionally kept short, so the "facile" pool stays friendly.
const EASY_MAX_LEN = 9;

const read = (file) => fs.readFileSync(path.join(SRC, file), 'utf8');

/** hermitdave list: `word count`, sorted by descending frequency. */
function parseFrequency(text) {
  const freq = new Map();
  for (const line of text.split(/\r?\n/)) {
    const sp = line.indexOf(' ');
    if (sp < 0) continue;
    const w = line.slice(0, sp);
    if (!freq.has(w)) freq.set(w, Number(line.slice(sp + 1)) || 0);
  }
  return freq;
}

/** Hunspell .dic head-words, minus the capitalised proper nouns. */
function parseStems(text) {
  const out = new Set();
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('/') || /^\d+$/.test(s)) continue;
    const w = s.split('/')[0].split(/\s|\t/)[0];
    if (!w || w[0] !== w[0].toLowerCase()) continue;
    out.add(w.toLowerCase());
  }
  return out;
}

const forms = unmunch(read('it_IT.aff'), read('it_IT.dic'), /^[a-zàáèéìíîòóùú]{2,20}$/);
const freq = parseFrequency(read('it_full.txt'));
const stems = parseStems(read('it_IT.dic'));

const vocab = new Set();
for (const w of forms) if (freq.has(w)) vocab.add(w);
for (const w of stems) vocab.add(w);

for (const w of [...vocab]) {
  if (!ALLOWED.test(w) || w.length < MIN_LEN || w.length > MAX_LEN) vocab.delete(w);
}

let removedBad = 0;
for (const line of read('badwords.txt').split(/\r?\n/)) {
  const w = line.trim().toLowerCase();
  if (w && vocab.delete(w)) removedBad += 1;
}

// A tiny hand-curated addendum for real Italian words Hunspell happens to miss
// -- "zuzzurellone" being the one this game is named after.
const forcedTier = new Map();
for (const line of fs.readFileSync(path.join(ROOT, 'tools', 'extra-words.txt'), 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const [w, t] = trimmed.split(/\t+/);
  vocab.add(w);
  forcedTier.set(w, Number(t));
}

const collator = new Intl.Collator('it', { sensitivity: 'variant' });

// The game is "from abaco to zuzzurellone": those two words ARE the board.
// Inflections can sneak in just outside them ("abachi" sorts before "abaco"),
// which would leave the field with an edge the rules say is impossible.
const FIRST = 'abaco';
const LAST = 'zuzzurellone';
for (const w of [...vocab]) {
  if (collator.compare(w, FIRST) < 0 || collator.compare(w, LAST) > 0) vocab.delete(w);
}


const words = [...vocab].sort(collator.compare);

const counts = [0, 0, 0];
const tiers = words.map((w) => {
  const f = freq.get(w) ?? 0;
  let tier = 2;
  if (f >= EASY_MIN_FREQ && w.length <= EASY_MAX_LEN) tier = 0;
  else if (f >= MEDIUM_MIN_FREQ) tier = 1;
  if (forcedTier.has(w)) tier = forcedTier.get(w);
  counts[tier] += 1;
  return tier;
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, words.map((w, i) => `${w}\t${tiers[i]}`).join('\n') + '\n', 'utf8');

// ---------------------------------------------------------------------------
// Front-coded payload shipped to the browser.
//
// The list is sorted, so consecutive entries share long prefixes. Each entry is
// encoded as:   <base36 shared-prefix length><suffix letters><tier digit>
// Words contain letters only, tiers are digits, so the stream self-delimits and
// needs no separators. It is loaded as a <script> (not fetch) so the game also
// runs when index.html is opened straight from disk over file://.
// ---------------------------------------------------------------------------
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

const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0);
console.log(`dizionario.txt written: ${words.length} words, ${kb(OUT)} KB`);
console.log(`dizionario.js  written: ${kb(JS_OUT)} KB (front-coded)`);
console.log(`  tier 0 (facile):    ${counts[0]}`);
console.log(`  tier 1 (medio):     ${counts[1]}  -> pool medio = ${counts[0] + counts[1]}`);
console.log(`  tier 2 (difficile): ${counts[2]}  -> pool difficile = ${words.length}`);
console.log(`  profanities removed: ${removedBad}`);
console.log(`  first: ${words[0]}   last: ${words[words.length - 1]}`);
