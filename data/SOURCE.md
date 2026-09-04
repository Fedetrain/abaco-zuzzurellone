# Word list — provenance and licence

**Short version: the word list in this folder is GPL-3.0, the rest of the repository is MIT.**
`data/dizionario.js` and `data/dizionario.txt` are derived works of a GPL-3.0
dictionary and are therefore distributed under the GPL-3.0, whose full text sits
next to them in [`LICENSE-DIZIONARIO.txt`](LICENSE-DIZIONARIO.txt). Everything
outside `data/` — the game engine, the stylesheet, the build tools, the tests —
is MIT (see [`../LICENSE`](../LICENSE)).

---

## 1. Primary source — the vocabulary

| | |
|---|---|
| **Name** | *Estensione linguistica italiana* — Hunspell `it_IT` dictionary |
| **Files used** | `it_IT.dic` (stem list, 95 381 entries) + `it_IT.aff` (affix rules) |
| **Upstream** | <https://github.com/LibreOffice/dictionaries/tree/master/it_IT> |
| **Origin** | Fork of *Dizionario italiano* from <http://linguistico.sourceforge.net/> |
| **Copyright** | © 2001–2007 Gianluca Turconi, Davide Prina · © 2010–2015 Andrea Pescetti · © 2020–2022 LibreItalia / Marina Latini |
| **Licence** | **GNU GPL version 3** — stated verbatim in the header of `it_IT.dic`, in `it_IT.aff` and in `README_it_IT.txt` |
| **Version** | 5.1.1 (07/11/2022) |

This is the spell-checking dictionary that ships with LibreOffice for Italian.

**Both files are used, and this matters.** The `.dic` on its own is a list of
lemmas — and Italian lemmas are not the words people type: `casa`, `cani`,
`mangio`, `bellissima` are all absent from it. A game built on the stem list
alone tells its players that ordinary Italian words do not exist, which is
exactly what this one used to do.

So `tools/unmunch.mjs` applies the affix rules and expands the stems into all
the forms they generate (about 3 million, once the article prefixes `l'`,
`dell'` … are dropped). That set is then intersected with source 2 below: a
form is kept only if somebody has actually written it. The intersection throws
away the theoretical monsters the rules also produce
(`mangiaglieliene`) while keeping every inflection in real use.

## 2. Frequency data — used only to grade difficulty

| | |
|---|---|
| **Name** | FrequencyWords — `content/2018/it/it_full.txt` |
| **Upstream** | <https://github.com/hermitdave/FrequencyWords> |
| **Derived from** | OpenSubtitles 2018 corpus |
| **Copyright** | © 2016 Hermit Dave |
| **Licence** | **MIT** |

This list does two jobs. It **attests** the inflected forms (a form the affix
rules generate is shipped only if it appears here at least once), and its raw
occurrence counts decide whether a word lands in the *facile*, *medio* or
*difficile* pool. No word text is taken from it: every word shipped is a form
the Hunspell dictionary generates.

## 3. Profanity list — used only as a negative filter

| | |
|---|---|
| **Name** | `paroleitaliane/lista_badwords.txt` |
| **Upstream** | <https://github.com/napolux/paroleitaliane> |
| **Copyright** | © 2016 Francesco Napoletano |
| **Licence** | **MIT** |

Its 453 entries are subtracted from the vocabulary; 121 of them matched. Nothing
from this file ends up in the shipped data.

## 4. Hand-written addendum

`tools/extra-words.txt` adds two real Italian words the Hunspell stem list is
missing — **zuzzurellone** and **zuzzurellona** — checked against the Treccani
and De Mauro dictionaries. Without them the game could not contain the word it
is named after. This file is original work, MIT-licensed like the rest of the
source code.

---

## How the shipped files are produced

```
node tools/fetch-sources.mjs      # downloads 1, 2 and 3 into tools/sources/ (git-ignored)
node tools/build-dictionary.mjs   # writes data/dizionario.txt and data/dizionario.js
```

The expansion step can also be run on its own:

```
node tools/unmunch.mjs tools/sources/it_IT.aff tools/sources/it_IT.dic /tmp/forms.txt
```

Filters applied by `tools/build-dictionary.mjs`:

* entries whose first character is uppercase are dropped — that is how proper
  nouns are marked in this dictionary (`Abacuc`, `Impruneta`, `Sanremo`…);
* only the letters `a–z` plus `à á è é ì í î ò ó ù ú` are allowed, so
  abbreviations, apostrophised and hyphenated forms go away;
* length is capped to 3–16 characters;
* the profanity list of source 3 is subtracted;
* anything sorting before `abaco` or after `zuzzurellone` is dropped: those two
  words are the board, and an inflection just outside them (`abachi`) would
  leave the field with an edge the rules say cannot exist;
* the survivors are sorted with `Intl.Collator('it')` — Italian collation, not
  code-point order, so `pera < pero < però < persona`.

### Result

| | |
|---|---|
| Words shipped | **257 361** |
| First / last entry | `abaco` / `zuzzurellone` |
| *facile* pool | 5 465 (≥ 2 000 occurrences in the corpus, ≤ 9 letters) |
| *medio* pool | 37 999 (≥ 100 occurrences) |
| *difficile* pool | 257 361 (everything) |
| `dizionario.txt` | 3.2 MB — `word<TAB>tier`, one per line, human-readable |
| `dizionario.js` | 1.0 MB — the same data front-coded (352 KB gzipped over the wire) |

`dizionario.js` is loaded with a `<script>` tag rather than `fetch()` so that
the game also runs when `index.html` is opened straight from disk over the
`file://` protocol, where `fetch()` is blocked by the browser's CORS rules.
