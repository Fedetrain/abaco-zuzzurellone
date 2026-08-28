#!/usr/bin/env node
/**
 * build-dictionary.mjs
 * ---------------------------------------------------------------------------
 * Builds `data/dizionario.txt` from the upstream sources (see data/SOURCE.md):
 *
 *   tools/sources/it_IT.dic   Hunspell it_IT stem list (LibreOffice)  GPL-3.0
 *   tools/sources/it_50k.txt  OpenSubtitles frequency list (hermitdave) MIT
 *   tools/sources/badwords.txt  Italian profanity list (napolux)        MIT
 *   tools/sources/parole-280k.txt / parole-660k.txt
 *                             Italian word-form lists (napolux)         MIT
 *
 * Run `node tools/fetch-sources.mjs` first to download them.
 *
 * The Hunspell .dic alone is a *stem* list: thousands of everyday words
 * ("casa", "porta", "libro", "pizza", "tavolo"...) only exist there as affix
 * expansions of other stems, so taking the stems verbatim ships a vocabulary
 * that is missing simple words while keeping every obscure one. To fix that,
 * frequent words (top MEDIUM_RANK of the subtitle corpus) that are missing
 * from the stem list are added back, provided they appear in BOTH napolux
 * word-form lists and survive the filters below.
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

/** Plain one-word-per-line list. */
function parseWordList(text) {
  return new Set(
    text
      .split(/\r?\n/)
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** Accent-stripped form, used to spot de-accented subtitle typos. */
function fold(w) {
  return w.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const dic = parseDic(read('it_IT.dic'));
const rank = parseFrequency(read('it_50k.txt'));
const bad = parseBadwords(read('badwords.txt'));
const forms280 = parseWordList(read('parole-280k.txt'));
const forms660 = parseWordList(read('parole-660k.txt'));
const properNames = parseWordList(read('nomi-propri.txt'));

let removedBad = 0;
for (const w of bad) {
  if (dic.delete(w)) removedBad += 1;
}

// ---------------------------------------------------------------------------
// Common words the stem list is missing.
//
// A frequency-list word is added only if ALL of these hold:
//   - rank within MEDIUM_RANK: we are recovering *simple* words, nothing rare;
//   - passes the same letter/length filters as every other entry;
//   - present in BOTH independent napolux word-form lists -- this drops the
//     subtitle corpus junk: proper names (john, tom), clitic agglutinations
//     (farlo, dirmi), interjections and typos;
//   - no foreign letters (j k w x y): keeps anglicisms like "okay" out, and
//     the stem list already covers the few legitimate ones;
//   - not an Italian first name ("angela", "sara"...): subtitles are all
//     lowercase, so names sail through the capital-letter filter;
//   - not a de-accented typo of an accented word: the subtitle corpus is
//     full of "perche", "cosi", "insegnero" written without the accent.
//     A candidate is rejected when an accented variant of the same letters
//     has comparable or better frequency (the corpus is sloppy enough that
//     the typo "perche" actually outranks "perché" -- hence the 2x margin,
//     not a strict comparison). "cosa" survives: its only accented twin,
//     "cosà", is nowhere near it in frequency;
//   - not in the profanity list (inflected variants included).
// ---------------------------------------------------------------------------
const NO_FOREIGN = /^[a-il-vzàáèéìíîòóùú]+$/; // ALLOWED minus j k w x y

// Best (lowest) corpus rank of any accented word, keyed by its accent-less
// spelling: accentedRank.get('perche') is the rank of "perché".
const accentedRank = new Map();
for (const [w, r] of rank) {
  const f = fold(w);
  if (f === w) continue;
  const cur = accentedRank.get(f);
  if (cur == null || r < cur) accentedRank.set(f, r);
}

const added = [];
for (const [w, r] of rank) {
  if (r > MEDIUM_RANK) continue;
  if (dic.has(w)) continue;
  if (w.length < MIN_LEN || w.length > MAX_LEN) continue;
  if (!ALLOWED.test(w) || !NO_FOREIGN.test(w)) continue;
  if (!forms280.has(w) || !forms660.has(w)) continue;
  if (properNames.has(w)) continue;
  const ar = accentedRank.get(w);
  if (ar != null && ar < r * 2) continue;
  if (badWithVariants(w)) continue;
  dic.add(w);
  added.push(w);
}

/**
 * The profanity list mostly holds lemmas; the frequency corpus holds inflected
 * forms too, so "prostitute" would slip past a filter that only knows
 * "prostituta". Checking the word plus its final-vowel swaps covers the
 * regular singular/plural/gender variants.
 */
function badWithVariants(w) {
  if (bad.has(w)) return true;
  const base = w.slice(0, -1);
  return ['a', 'e', 'i', 'o'].some((v) => bad.has(base + v));
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
console.log(`  common words recovered (missing stems): ${added.length}`);
console.log(`  first: ${words[0]}   last: ${words[words.length - 1]}`);
