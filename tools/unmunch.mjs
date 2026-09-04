/**
 * unmunch.mjs -- expands a Hunspell dictionary into its inflected forms.
 * ---------------------------------------------------------------------------
 * The it_IT .aff file uses only plain SFX/PFX rules with single-character
 * flags: no COMPOUND*, no NEEDAFFIX, no CIRCUMFIX. So strip/add/condition plus
 * the cross-product rule is the whole specification we have to honour.
 *
 * Without this step the vocabulary is the *stem* list, which does not contain
 * "casa", "cani" or "mangio" -- the reason players used to be told that
 * perfectly ordinary words do not exist.
 */
import fs from 'node:fs';

/** Parses the SFX/PFX tables out of an .aff file. */
export function parseAff(text) {
  const SFX = new Map();
  const PFX = new Map();
  for (const line of text.split(/\r?\n/)) {
    const p = line.trim().split(/\s+/);
    if (p[0] !== 'SFX' && p[0] !== 'PFX') continue;
    const table = p[0] === 'SFX' ? SFX : PFX;
    if (p.length === 4 && (p[2] === 'Y' || p[2] === 'N')) {
      table.set(p[1], { cross: p[2] === 'Y', rules: [] });
      continue;
    }
    const entry = table.get(p[1]);
    if (!entry) continue;
    const cond = p[4] && p[4] !== '.' ? p[4] : null;
    entry.rules.push({
      strip: p[2] === '0' ? '' : p[2],
      add: p[3] === '0' ? '' : p[3].split('/')[0],
      re: cond ? new RegExp(p[0] === 'SFX' ? cond + '$' : '^' + cond) : null,
    });
  }
  return { SFX, PFX };
}

function apply(word, entry, isSuffix) {
  const out = [];
  for (const r of entry.rules) {
    if (r.re && !r.re.test(word)) continue;
    if (isSuffix) {
      if (r.strip && !word.endsWith(r.strip)) continue;
      out.push(word.slice(0, word.length - r.strip.length) + r.add);
    } else {
      if (r.strip && !word.startsWith(r.strip)) continue;
      out.push(r.add + word.slice(r.strip.length));
    }
  }
  return out;
}

/**
 * @param {string} affText   contents of it_IT.aff
 * @param {string} dicText   contents of it_IT.dic
 * @param {RegExp} accept    forms not matching this are discarded on the spot.
 *                           Essential: the article prefixes (l', dell', ...)
 *                           cross-multiply into millions of apostrophised
 *                           forms that would blow past the Set size limit.
 * @returns {Set<string>}
 */
export function unmunch(affText, dicText, accept) {
  const { SFX, PFX } = parseAff(affText);
  const forms = new Set();
  const add = (w) => {
    if (accept.test(w)) forms.add(w);
  };

  for (const line of dicText.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('/') || /^\d+$/.test(s)) continue;
    const slash = s.indexOf('/');
    const stem = slash < 0 ? s : s.slice(0, slash);
    const flags = slash < 0 ? '' : s.slice(slash + 1);
    if (!stem) continue;
    add(stem);

    const crossable = [];
    const prefixFlags = [];
    for (const f of flags) {
      const sfx = SFX.get(f);
      if (sfx) {
        for (const w of apply(stem, sfx, true)) {
          add(w);
          if (sfx.cross) crossable.push(w);
        }
      }
      if (PFX.has(f)) prefixFlags.push(f);
    }
    for (const f of prefixFlags) {
      const pfx = PFX.get(f);
      for (const w of apply(stem, pfx, false)) add(w);
      if (pfx.cross) {
        for (const base of crossable) for (const w of apply(base, pfx, false)) add(w);
      }
    }
  }
  return forms;
}

/** Standalone: node tools/unmunch.mjs <aff> <dic> <out> */
if (process.argv[1] && process.argv[1].endsWith('unmunch.mjs') && process.argv.length > 4) {
  const [aff, dic, out] = process.argv.slice(2);
  const forms = unmunch(
    fs.readFileSync(aff, 'utf8'),
    fs.readFileSync(dic, 'utf8'),
    /^[a-zàáèéìíîòóùú]{2,20}$/
  );
  fs.writeFileSync(out, [...forms].sort().join('\n'), 'utf8');
  console.log('forms:', forms.size);
}
