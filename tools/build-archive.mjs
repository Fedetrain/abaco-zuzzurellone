#!/usr/bin/env node
/**
 * build-archive.mjs
 * ---------------------------------------------------------------------------
 * Genera l'archivio delle parole del giorno: una pagina per enigma gia'
 * passato, piu' l'indice `archivio.html`, e riscrive `sitemap.xml`.
 *
 * Perche' esiste: il sito aveva tre pagine indicizzabili e AdSense l'ha
 * respinto per «contenuti di scarso valore» (manca la «manutenzione
 * strutturale costante»). Ogni giorno il gioco produce un enigma nuovo e una
 * partita ottimale diversa: e' contenuto vero, calcolato, gia' suo. Qui lo si
 * scrive su disco invece di buttarlo via a mezzanotte.
 *
 * Si rigenera con:
 *     node tools/build-archive.mjs
 *
 * ponytail: rigenerazione manuale. Se e quando conta averlo aggiornato ogni
 * giorno senza pensarci, un workflow GitHub con `schedule:` che lancia questo
 * script e committa -- attenzione a non toccare Settings -> Pages (STATO.md).
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://abacozuzzurellone.site';
const OUTDIR = path.join(ROOT, 'archivio');

/* --- carico il gioco vero, non una sua copia ------------------------------ */
const sandbox = { console, Intl, Math, Set, Map, Date, Uint8Array, Int32Array, Array };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['data/dizionario.js', 'assets/core.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}
const AZ = sandbox.AZ;
const { words, tiers } = AZ.unpack(sandbox.ABACO_DATA.packed, sandbox.ABACO_DATA.count);
const dict = new AZ.Dizionario(words, tiers);
const nf = new Intl.NumberFormat('it-IT', { useGrouping: 'always' });
const nf1 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const df = new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeZone: 'Europe/Rome' });

/* --- la partita ottimale: la ricerca binaria giocata fino in fondo -------- */
function partitaOttimale(target) {
  const mosse = [];
  let lo = 0, hi = dict.size;
  for (let n = 0; n < 40; n++) {
    const restano = dict.countRange(lo, hi);
    const i = dict.nthInRange(lo, hi, Math.floor(restano / 2));
    if (i < 0) break;
    const parola = dict.words[i];
    const c = AZ.compare(parola, target);
    mosse.push({ parola, restano, esito: c === 0 ? 'centro' : c < 0 ? 'dopo' : 'prima' });
    if (c === 0) break;
    if (c < 0) lo = i + 1; else hi = i;
  }
  return mosse;
}

/* --- il registro: un giorno passato non cambia piu' -----------------------
   `dailyIndex` pesca l'ennesima parola del pool, quindi se il pool cambia --
   e cambia ogni volta che si tocca il dizionario -- cambiano anche le parole
   dei giorni gia' giocati, e l'archivio racconta una storia che non e'
   successa. Il registro le congela: un giorno che c'e' gia' si rilegge, non
   si ricalcola. Solo i giorni nuovi vengono estratti dal gioco.

   ⚠️ `archivio/parole.json` e' un dato, non un file generato: va committato,
   e non si riscrive a mano. Se sparisce, l'archivio si reinventa il passato.
--------------------------------------------------------------------------- */
const LEDGER = path.join(OUTDIR, 'parole.json');
fs.mkdirSync(OUTDIR, { recursive: true });
const registro = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : {};

/* --- i giorni gia' passati ------------------------------------------------ */
const oggi = AZ.dayKey(new Date());
const giorni = [];
let nuovi = 0;
const deriva = [];
for (let d = new Date(Date.UTC(2026, 8, 4)); AZ.dayKey(d) < oggi; d.setUTCDate(d.getUTCDate() + 1)) {
  const key = AZ.dayKey(d);
  const i = AZ.dailyIndex(dict, key);
  let parola = registro[key];
  if (!parola) {
    if (i < 0) continue;
    parola = registro[key] = dict.words[i];
    nuovi += 1;
  } else if (i >= 0 && dict.words[i] !== parola) {
    // La spia: il registro vince, ma sapere che il pool si e' mosso conta.
    deriva.push(`${key}: in archivio «${parola}», il dizionario di oggi direbbe «${dict.words[i]}»`);
  }
  giorni.push({ key, n: AZ.dayNumber(key), parola, mosse: partitaOttimale(parola) });
}
fs.writeFileSync(LEDGER, JSON.stringify(registro, null, 1) + String.fromCharCode(10));
giorni.reverse();   // il piu' recente in cima

/* --- HTML ----------------------------------------------------------------- */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function pagina({ slug, base, title, description, h1, body }) {
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}/${slug}">
<meta name="theme-color" content="#f2ede3" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#100e0c" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${base}assets/icon.svg">
<meta property="og:type" content="article">
<meta property="og:locale" content="it_IT">
<meta property="og:url" content="${SITE}/${slug}">
<meta property="og:title" content="${esc(h1)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE}/docs/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE}/docs/og.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..900&family=Inter:wght@300..800&family=JetBrains+Mono:wght@400;700&display=swap">
<link rel="stylesheet" href="${base}assets/style.css">
</head>
<body>

<!-- generato da tools/build-archive.mjs - non modificare a mano -->

<div class="backdrop" aria-hidden="true">
  <div class="backdrop-glow backdrop-glow--a"></div>
  <div class="backdrop-glow backdrop-glow--z"></div>
  <div class="backdrop-grain"></div>
</div>

<header class="topbar">
  <a class="brand" href="${base}" aria-label="Vai al gioco">
    <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" class="mark-bg"/>
      <g class="mark-rods"><path d="M6 10h20M6 16h20M6 22h20"/></g>
      <g class="mark-beads"><circle cx="10.5" cy="10" r="2.7"/><circle cx="20.5" cy="16" r="2.7"/><circle cx="14" cy="22" r="2.7"/></g>
    </svg>
    <span class="brand-name">Abaco<span>Zuzzurellone</span></span>
  </a>
  <nav class="topbar-actions">
    <a class="btn btn--ghost btn--small" href="${base}">Gioca ora &rarr;</a>
  </nav>
</header>

<main id="main">
<section class="screen screen--doc" style="display:block">
  <div class="play-head">
    <a class="backbtn" href="${base}archivio.html" aria-label="Torna all'archivio">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
    </a>
    <h1 class="play-title">${esc(h1)}</h1>
  </div>
  <div class="doc">
${body}
  </div>
  <p class="guide-cta"><a class="btn btn--big" href="${base}">Gioca l'enigma di oggi</a></p>
  <aside class="adslot" data-ad="guida" data-ad-format="fluid" data-ad-layout="in-article" aria-label="Pubblicit&agrave;">
    <span class="adslot-tag">pubblicit&agrave;</span>
  </aside>
</section>
</main>

<footer class="sitefoot">
  <span>Parole dal dizionario Hunspell <b>it_IT</b> di LibreItalia (GPL-3.0).</span>
  <a href="${base}guida.html">Come si gioca</a>
  <a href="${base}privacy.html">Privacy e cookie</a>
  <a href="https://github.com/Fedetrain/abaco-zuzzurellone" rel="noopener">codice su GitHub</a>
</footer>

<script src="${base}assets/ads.js"></script>
</body>
</html>
`;
}

/* --- una pagina per enigma ------------------------------------------------ */
fs.mkdirSync(OUTDIR, { recursive: true });
const ottimale = Math.ceil(Math.log2(dict.poolSize + 1));
for (const g of giorni) {
  const data = df.format(new Date(g.key + 'T12:00:00Z'));
  const righe = g.mosse.map((m, i) => `      <tr>
        <td>${i + 1}</td>
        <td><b>${esc(m.parola)}</b></td>
        <td>${nf.format(m.restano)}</td>
        <td>${m.esito === 'centro' ? 'e&rsquo; la parola' : m.esito}</td>
      </tr>`).join('\n');
  const n = g.mosse.length;
  const body = `    <section class="doc-block">
    <p>L&rsquo;enigma numero <b>${g.n}</b>, quello del ${esc(data)}, era
    <b>${esc(g.parola)}</b>. Partiva da ${nf.format(dict.poolSize)} parole giocabili,
    fra <i>abaco</i> e <i>zuzzurellone</i>.</p>
    </section>

    <section class="doc-block">
    <h2>La partita giocata al meglio</h2>
    <p>Chi dimezza il campo a ogni mossa ci arriva in <b>${n}</b>
    ${n === 1 ? 'tentativo' : 'tentativi'}. Questa &egrave; la sequenza: ogni riga propone
    la parola che sta esattamente a met&agrave; di quello che resta, e la risposta dice da
    che parte continuare.</p>

    <table class="doc-table">
      <thead><tr><th>#</th><th>Proposta</th><th>Parole in campo</th><th>Risposta</th></tr></thead>
      <tbody>
${righe}
      </tbody>
    </table>

    <p>Il numero nella terza colonna &egrave; il motivo per cui il gioco finisce presto:
    scende all&rsquo;incirca della met&agrave; a ogni riga. Da ${nf.format(dict.poolSize)}
    parole servono al massimo ${ottimale} tentativi, sempre, qualunque sia la parola
    segreta. &Egrave; una ricerca binaria, e la <a href="../guida.html">guida</a>
    spiega perch&eacute;.</p>`;
  fs.writeFileSync(path.join(OUTDIR, `enigma-${g.n}.html`), pagina({
    slug: `archivio/enigma-${g.n}.html`,
    base: '../',
    title: `Parola del giorno n. ${g.n} - «${g.parola}» | Abaco Zuzzurellone`,
    description: `La parola del ${data} era «${g.parola}». La partita ottimale la trova in ${n} ${n === 1 ? 'tentativo' : 'tentativi'}: ecco la sequenza, mossa per mossa.`,
    h1: `Enigma ${g.n}: «${g.parola}»`,
    body,
  }));
}

/* --- l'indice ------------------------------------------------------------- */
const voci = giorni.map((g) => `      <li><a href="archivio/enigma-${g.n}.html"><b>${esc(g.parola)}</b>
        <span>n. ${g.n} &middot; ${esc(df.format(new Date(g.key + 'T12:00:00Z')))} &middot; ${g.mosse.length} ${g.mosse.length === 1 ? 'mossa' : 'mosse'}</span></a></li>`).join('\n');
const media = giorni.length ? giorni.reduce((s, g) => s + g.mosse.length, 0) / giorni.length : 0;
fs.writeFileSync(path.join(ROOT, 'archivio.html'), pagina({
  slug: 'archivio.html',
  base: '',
  title: 'Archivio delle parole del giorno - Abaco Zuzzurellone',
  description: `Tutte le parole del giorno di Abaco Zuzzurellone, dal 4 settembre 2026 a oggi: ${giorni.length} enigmi, ciascuno con la partita ottimale mossa per mossa.`,
  h1: 'Archivio delle parole del giorno',
  body: `    <section class="doc-block">
    <p>Ogni giorno il gioco estrae una parola fra le ${nf.format(dict.poolSize)}
    giocabili. Qui ci sono tutti gli enigmi gi&agrave; passati, ${giorni.length} finora,
    ognuno con la partita giocata al meglio. In media bastano <b>${nf1.format(media)}</b>
    tentativi.</p>
    </section>

    <section class="doc-block">
    <ul class="doc-list doc-list--archivio">
${voci}
    </ul>

    <p>L&rsquo;enigma di oggi non &egrave; in questa lista: si gioca
    <a href="./">nella pagina del gioco</a>, e compare qui domani.</p>
    </section>`,
}));

/* --- sitemap -------------------------------------------------------------- */
const url = (loc, freq, pri) => `  <url><loc>${loc}</loc><changefreq>${freq}</changefreq><priority>${pri}</priority></url>`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${url(SITE + '/', 'daily', '1.0')}
${url(SITE + '/guida.html', 'monthly', '0.8')}
${url(SITE + '/archivio.html', 'daily', '0.8')}
${giorni.map((g) => url(`${SITE}/archivio/enigma-${g.n}.html`, 'yearly', '0.6')).join('\n')}
${url(SITE + '/privacy.html', 'yearly', '0.3')}
</urlset>
`);

if (deriva.length) {
  console.warn(`
⚠  ${deriva.length} giorni su ${giorni.length} non uscirebbero piu' cosi' dal dizionario attuale.`);
  console.warn('   Il registro vince, perche i giorni passati sono gia stati giocati. Ma il pool e cambiato:');
  for (const r of deriva.slice(0, 5)) console.warn('     ' + r);
  if (deriva.length > 5) console.warn(`     ... e altri ${deriva.length - 5}.`);
  console.warn('');
}
console.log(`${giorni.length} enigmi in archivio/ (${nuovi} nuovi nel registro), archivio.html e sitemap.xml riscritti.`);
