#!/usr/bin/env node
/**
 * Downloads the upstream word-list sources into tools/sources/ (git-ignored),
 * so that `node tools/build-dictionary.mjs` can be reproduced from scratch.
 * See data/SOURCE.md for the provenance and licence of each file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.join(ROOT, 'tools', 'sources');

const FILES = [
  {
    name: 'it_IT.dic',
    url: 'https://raw.githubusercontent.com/LibreOffice/dictionaries/master/it_IT/it_IT.dic',
    note: 'Hunspell it_IT stem list -- GPL-3.0',
  },
  {
    name: 'it_50k.txt',
    url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/it/it_50k.txt',
    note: 'OpenSubtitles 2018 frequency list -- MIT',
  },
  {
    name: 'badwords.txt',
    url: 'https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane/lista_badwords.txt',
    note: 'Italian profanity list, used as a negative filter -- MIT',
  },
  {
    name: 'parole-280k.txt',
    url: 'https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane/280000_parole_italiane.txt',
    note: 'Italian word-form list, validates common-word additions -- MIT',
  },
  {
    name: 'parole-660k.txt',
    url: 'https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane/660000_parole_italiane.txt',
    note: 'Italian word-form list, validates common-word additions -- MIT',
  },
  {
    name: 'nomi-propri.txt',
    url: 'https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane/9000_nomi_propri.txt',
    note: 'Italian first names, negative filter for common-word additions -- MIT',
  },
];

fs.mkdirSync(DEST, { recursive: true });

for (const f of FILES) {
  process.stdout.write(`${f.name} ... `);
  const res = await fetch(f.url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${f.url}`);
  const text = await res.text();
  fs.writeFileSync(path.join(DEST, f.name), text, 'utf8');
  console.log(`${(text.length / 1024).toFixed(0)} KB  (${f.note})`);
}
console.log('\nNow run: node tools/build-dictionary.mjs');
