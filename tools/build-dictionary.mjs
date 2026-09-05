#!/usr/bin/env node
/**
 * build-dictionary.mjs
 * ---------------------------------------------------------------------------
 * Builds `data/dizionario.txt` + `data/dizionario.js` from the upstream
 * sources (see data/SOURCE.md):
 *
 *   tools/sources/it_IT.aff   Hunspell it_IT affix rules (LibreOffice)  GPL-3.0
 *   tools/sources/it_IT.dic   Hunspell it_IT stem list                  GPL-3.0
 *   tools/sources/it_full.txt OpenSubtitles frequency list (hermitdave) MIT
 *   tools/sources/badwords.txt  Italian profanity list (napolux)        MIT
 *   tools/sources/280000_parole_italiane.txt  word-form list (napolux)  MIT
 *   tools/sources/660000_parole_italiane.txt  word-form list (napolux)  MIT
 *
 * Run `node tools/fetch-sources.mjs` first to download them.
 *
 * The vocabulary is:
 *
 *   every stem in the .dic
 *   ∪  (every inflected form the affix rules generate  ∩  attested)
 *   ∪  tools/extra-words.txt
 *
 * where a form counts as attested when
 *
 *   - it occurs in the subtitle corpus, or
 *   - it is listed in BOTH napolux word-form lists AND it inflects a lemma
 *     that is itself common (>= MEDIUM_MIN_FREQ occurrences in the corpus).
 *
 * The first rule is what makes "casa", "cani", "mangio" and the other everyday
 * inflections exist; without it the game only knew lemmas. The second recovers
 * the written-language forms subtitles never use -- "affermavamo",
 * "visiteremmo", "annegavate" -- but only for verbs and nouns people actually
 * use, and only when two independent lists agree the form is real. Requiring
 * attestation keeps out the 2.4 million theoretical monsters the affix rules
 * also produce ("mangiaglieliene"), which are valid Italian but nobody would
 * ever guess them and they would wreck the "words left" counter.
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

/** napolux word-form lists: one word per line. */
function parseList(text) {
  const out = new Set();
  for (const line of text.split(/\r?\n/)) {
    const w = line.trim().toLowerCase();
    if (w) out.add(w);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Hand-written addendum, tools/extra-words.txt: `word[/FLAGS]<TAB>[tier]`.
// Entries carrying affix flags are appended to the stem list so the same
// rules inflect them; the bare word is always kept, its inflections are
// attested like everything else. A tier, when given, overrides the corpus.
// ---------------------------------------------------------------------------
const extraStems = [];
const extraWords = [];
const forcedTier = new Map();
for (const line of fs.readFileSync(path.join(ROOT, 'tools', 'extra-words.txt'), 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const [entry, t] = trimmed.split(/\t+/);
  const w = entry.split('/')[0];
  if (!ALLOWED.test(w)) throw new Error(`extra-words.txt: "${w}" is not a plain lowercase word`);
  extraWords.push(w);
  if (entry.includes('/')) extraStems.push(entry);
  if (t !== undefined && t !== '') forcedTier.set(w, Number(t));
}

// The upstream .dic marks sedere, possedere, risedere and soprassedere with
// flag È, which the upstream .aff never defines: tools/aff-patch.txt supplies
// it (siedo, possiede, sedevo, possederà...).
const affText = read('it_IT.aff') + '\n' +
  fs.readFileSync(path.join(ROOT, 'tools', 'aff-patch.txt'), 'utf8').replace(/^#.*$/gm, '');
const dicText = read('it_IT.dic') + '\n' + extraStems.join('\n') + '\n';

const freq = parseFrequency(read('it_full.txt'));
const stems = parseStems(dicText);
const list280 = parseList(read('280000_parole_italiane.txt'));
const list660 = parseList(read('660000_parole_italiane.txt'));
const bad = parseList(read('badwords.txt'));

// Highest corpus frequency among the stems that generate each form: the
// measure of whether the *lemma* is in use, whatever the form's own count.
const lemmaFreq = new Map();
// The profanity list holds lemmas; the affix rules conjugate them. A form is
// profane when every stem that produces it is on the list -- "chiavi" stays,
// because "chiave" makes it too, "chiavavo" goes.
const cleanStem = new Map();
const forms = unmunch(affText, dicText, /^[a-zàáèéìíîòóùú]{2,20}$/, (form, stem) => {
  const f = freq.get(stem) ?? 0;
  if ((lemmaFreq.get(form) ?? -1) < f) lemmaFreq.set(form, f);
  if (!bad.has(stem)) cleanStem.set(form, true);
  else if (!cleanStem.has(form)) cleanStem.set(form, false);
});

const vocab = new Set();
// ── DUE RECUPERI, NON UNO ──
//
// Il corpus di frequenza attesta le forme una per una, e ne lascia fuori
// parecchie che un italiano userebbe senza pensarci. Ci sono due modi
// indipendenti di riprenderle, e questo file li usa tutti e due — sono nati su
// due rami diversi e al merge del 06/09/2026 si e' visto che non si escludono:

// 1. LE LISTE. Una forma che compare in ENTRAMBE le liste di parole (280k e
//    660k, curate a mano da terzi) e il cui lemma e' abbastanza frequente e'
//    buona anche se il corpus non la attesta direttamente.
let recovered = 0;
for (const w of forms) {
  if (freq.has(w)) vocab.add(w);
  else if (list280.has(w) && list660.has(w) && (lemmaFreq.get(w) ?? 0) >= MEDIUM_MIN_FREQ) {
    vocab.add(w);
    recovered += 1;
  }
}

// 2. LA CHIUSURA DEI PARADIGMI. L'attestazione e' per-forma, quindi accettava
//    "bellissima" e rifiutava "bellissime", e il giocatore si sentiva dire che
//    una parola normalissima non esiste. Se una forma del quartetto
//    genere/numero e' attestata, il lemma e' dimostrabilmente in uso: si fanno
//    entrare anche le altre tre — ma solo se le regole d'affissi le generano,
//    ed e' quello che tiene fuori le desinenze inventate.
//
//    Gira DOPO il recupero dalle liste, non prima: cosi chiude i paradigmi
//    sull'insieme gia' arricchito, e ogni forma recuperata al punto 1 puo'
//    portarsi dietro le sue tre sorelle. Invertendo l'ordine si perderebbero.
//    ⚠ NON BASTA che le regole d affissi generino la forma.
//
//    L .aff marca sedere/possedere/soprassedere col flag E-accentata, che non
//    definisce, e unmunch lo rimappa sul paradigma regolare in -ere. Quella
//    rimappatura genera anche le forme SENZA dittongo — possedo, possede,
//    sedono — che in italiano non esistono: si dice possiedo. La chiusura le
//    faceva entrare tutte, perche  guardava solo se l affisso le genera.
//
//    Quindi si chiede una prova in piu : la forma deve comparire in ALMENO UNA
//    delle due liste curate a mano. Non e  un elenco di eccezioni per i tre
//    verbi — e  un filtro linguistico: le forme giuste (bellissime,
//    affermavamo, visiteremmo) stanno nelle liste, quelle inventate no.
//    Verificato il 06/09/2026, ed e  quello che fa passare il test
//    «possedo non deve stare nel vocabolario» di tests.js.
for (const w of [...vocab]) {
  if (!/[aeio]$/.test(w)) continue;
  const stem = w.slice(0, -1);
  for (const v of ['a', 'e', 'i', 'o']) {
    const f = stem + v;
    if (forms.has(f) && (list280.has(f) || list660.has(f))) vocab.add(f);
  }
}
for (const w of stems) vocab.add(w);

for (const w of [...vocab]) {
  if (!ALLOWED.test(w) || w.length < MIN_LEN || w.length > MAX_LEN) vocab.delete(w);
}

let removedBad = 0;
let removedBadForms = 0;
for (const w of bad) if (vocab.delete(w)) removedBad += 1;
for (const w of [...vocab]) {
  if (cleanStem.get(w) === false && vocab.delete(w)) removedBadForms += 1;
}

// The hand-written words bypass attestation (that is the point of the file),
// but not the profanity filter above nor the board bounds below.
for (const w of extraWords) vocab.add(w);

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
console.log(`  profanities removed: ${removedBad} words + ${removedBadForms} inflections of them`);
console.log(`  inflections attested by the word-form lists only: ${recovered}`);
console.log(`  hand-written entries (tools/extra-words.txt): ${extraWords.length}`);
console.log(`  first: ${words[0]}   last: ${words[words.length - 1]}`);
