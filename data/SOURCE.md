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
| **File used** | `it_IT.dic` (the stem list, 95 381 entries) |
| **Upstream** | <https://github.com/LibreOffice/dictionaries/tree/master/it_IT> |
| **Origin** | Fork of *Dizionario italiano* from <http://linguistico.sourceforge.net/> |
| **Copyright** | © 2001–2007 Gianluca Turconi, Davide Prina · © 2010–2015 Andrea Pescetti · © 2020–2022 LibreItalia / Marina Latini |
| **Licence** | **GNU GPL version 3** — stated verbatim in the header of `it_IT.dic`, in `it_IT.aff` and in `README_it_IT.txt` |
| **Version** | 5.1.1 (07/11/2022) |

This is the spell-checking dictionary that ships with LibreOffice for Italian.
Only the `.dic` **stem list** is used: those are dictionary head-words (lemmas),
which is exactly the granularity the game wants. The affix rules in `.aff`,
which would expand the stems into millions of inflected forms, are not applied.

## 2. Frequency data — used only to grade difficulty

| | |
|---|---|
| **Name** | FrequencyWords — `content/2018/it/it_50k.txt` |
| **Upstream** | <https://github.com/hermitdave/FrequencyWords> |
| **Derived from** | OpenSubtitles 2018 corpus |
| **Copyright** | © 2016 Hermit Dave |
| **Licence** | **MIT** |

The rank of a word in this list decides whether it lands in the *facile*,
*medio* or *difficile* pool. No word text is taken from it — it only sorts the
words that already come from source 1.

## 3. Profanity list — used only as a negative filter

| | |
|---|---|
| **Name** | `paroleitaliane/lista_badwords.txt` |
| **Upstream** | <https://github.com/napolux/paroleitaliane> |
| **Copyright** | © 2016 Francesco Napoletano |
| **Licence** | **MIT** |

Its 453 entries are subtracted from the vocabulary; 49 of them matched. Nothing
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

Filters applied by `tools/build-dictionary.mjs`:

* entries whose first character is uppercase are dropped — that is how proper
  nouns are marked in this dictionary (`Abacuc`, `Impruneta`, `Sanremo`…);
* only the letters `a–z` plus `à á è é ì í î ò ó ù ú` are allowed, so
  abbreviations, apostrophised and hyphenated forms go away;
* length is capped to 3–14 characters;
* the profanity list of source 3 is subtracted;
* the survivors are sorted with `Intl.Collator('it')` — Italian collation, not
  code-point order, so `pera < pero < però < persona`.

### Result

| | |
|---|---|
| Words shipped | **83 362** |
| First / last entry | `abaco` / `zuzzurellone` |
| *facile* pool | 2 266 (top ~6 000 by frequency, ≤ 9 letters) |
| *medio* pool | 9 034 (top ~25 000 by frequency) |
| *difficile* pool | 83 362 (everything) |
| `dizionario.txt` | 1.0 MB — `word<TAB>tier`, one per line, human-readable |
| `dizionario.js` | 440 KB — the same data front-coded, this is what the game loads |

`dizionario.js` is loaded with a `<script>` tag rather than `fetch()` so that
the game also runs when `index.html` is opened straight from disk over the
`file://` protocol, where `fetch()` is blocked by the browser's CORS rules.
