#!/usr/bin/env node
/**
 * build-guide.mjs
 * ---------------------------------------------------------------------------
 * Genera `guida.html` estraendo la sezione #screen-rules da index.html.
 *
 * Perché una pagina a parte, visto che la guida è già dentro il gioco: dentro
 * `index.html` è una <section hidden> senza URL, senza <title> e senza meta
 * description propri. Il testo lo leggono i crawler, ma non può posizionarsi
 * su Google per «come si gioca», «ordine alfabetico italiano» e simili --
 * ed è il traffico da ricerca la sola leva che conta davvero per gli incassi.
 *
 * Perché generata e non scritta a mano: due copie dello stesso testo divergono
 * sempre, e nel giro di un mese la pagina indicizzata è quella sbagliata.
 * Qui la sorgente è una sola. Si rigenera con:
 *
 *     node tools/build-guide.mjs
 *
 * I numeri (257.359 parole, 18 tentativi) sono riempiti a runtime da app.js
 * dentro il gioco; nella pagina statica vanno scritti qui, letti dal
 * dizionario, perché un crawler non li vedrebbe mai.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* --- i numeri veri, dal dizionario ---------------------------------------- */
const tiers = read('data/dizionario.txt')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((l) => Number(l.split('\t')[1]));
const total = tiers.length;
const conta = {
  facile: tiers.filter((t) => t <= 0).length,
  medio: tiers.filter((t) => t <= 1).length,
  difficile: total,
};
const it = new Intl.NumberFormat('it-IT', { useGrouping: 'always' });
const optimal = Math.ceil(Math.log2(total + 1));

/* --- la sezione, estratta da index.html ----------------------------------- */
const html = read('index.html');
const start = html.indexOf('<section class="screen screen--doc" id="screen-rules"');
const end = html.indexOf('\n</section>', start) + '\n</section>'.length;
if (start < 0 || end < start) throw new Error('non trovo #screen-rules in index.html');

let body = html.slice(start, end);

// La pagina statica non ha schermate: via l'involucro, via il pulsante
// "indietro" del gioco, e i segnaposto diventano numeri veri.
body = body
  .replace(/^<section[^>]*>\s*/, '')
  .replace(/\s*<\/section>$/, '')
  .replace(/<div class="play-head">[\s\S]*?<\/div>\s*/, '')
  .replace(/<aside class="adslot"[\s\S]*?<\/aside>\s*/g, '')
  .replace(/<b class="g-count">…<\/b>/g, `<b>${it.format(total - 2)}</b>`)
  .replace(/<b class="g-total">…<\/b>/g, `<b>${it.format(total)}</b>`)
  .replace(/<b class="g-opt">…<\/b>/g, `<b>${optimal}</b>`)
  .replace(/<b data-count="(facile|medio|difficile)">…<\/b>/g,
           (_, lv) => `<b>${it.format(conta[lv])}</b>`)
  // La dimostrazione del dimezzamento la disegna app.js: qui la scrivo io.
  .replace('<p class="halving" id="halving-demo"></p>', halving(total));

function halving(n) {
  const parts = [];
  let v = n;
  for (let k = 0; k < 8 && v > 1; k++) {
    parts.push(k === 0 ? it.format(v) : `<b>${it.format(v)}</b>`);
    v = Math.ceil(v / 2);
  }
  parts.push('<b>1</b>');
  return `<p class="halving">${parts.join('<span>→</span>')}</p>`;
}

/* --- dati strutturati: le FAQ sono l'unico pezzo che Google mostra ------- */
const faq = [...body.matchAll(/<dt>([^<]+)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)]
  .slice(-5)
  .map(([, q, a]) => ({
    '@type': 'Question',
    name: q.trim(),
    acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() },
  }));

const page = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Come si gioca ad Abaco Zuzzurellone — guida, regole e strategia</title>
<meta name="description" content="Guida completa al gioco di parole Abaco Zuzzurellone: regole, le tre modalità, come leggere la barra dell'intervallo, i livelli, la strategia e perché bastano ${optimal} tentativi per ${it.format(total)} parole.">
<link rel="canonical" href="https://abacozuzzurellone.site/guida.html">
<meta name="theme-color" content="#f2ede3" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#100e0c" media="(prefers-color-scheme: dark)">
<link rel="icon" href="assets/icon.svg">

<meta property="og:type" content="article">
<meta property="og:locale" content="it_IT">
<meta property="og:url" content="https://abacozuzzurellone.site/guida.html">
<meta property="og:title" content="Come si gioca ad Abaco Zuzzurellone">
<meta property="og:description" content="Regole, modalità, come leggere la barra dell'intervallo e la strategia del gioco di parole italiano.">
<meta property="og:image" content="https://abacozuzzurellone.site/docs/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://abacozuzzurellone.site/docs/og.png">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..900&family=Inter:wght@300..800&family=JetBrains+Mono:wght@400;700&display=swap">
<link rel="stylesheet" href="assets/style.css">

<script type="application/ld+json">
${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq }, null, 1)}
</script>
</head>
<body>

<!-- ═════════ generato da tools/build-guide.mjs — non modificare a mano ═════════
     La sorgente è la sezione #screen-rules di index.html. Rigenera con:
         node tools/build-guide.mjs
  ══════════════════════════════════════════════════════════════════════════ -->

<div class="backdrop" aria-hidden="true">
  <div class="backdrop-glow backdrop-glow--a"></div>
  <div class="backdrop-glow backdrop-glow--z"></div>
  <div class="backdrop-grain"></div>
</div>

<header class="topbar">
  <a class="brand" href="./" aria-label="Vai al gioco">
    <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" class="mark-bg"/>
      <g class="mark-rods"><path d="M6 10h20M6 16h20M6 22h20"/></g>
      <g class="mark-beads"><circle cx="10.5" cy="10" r="2.7"/><circle cx="20.5" cy="16" r="2.7"/><circle cx="14" cy="22" r="2.7"/></g>
    </svg>
    <span class="brand-name">Abaco<span>Zuzzurellone</span></span>
  </a>
  <nav class="topbar-actions">
    <a class="btn btn--ghost btn--small" href="./">Gioca ora →</a>
  </nav>
</header>

<main id="main">
<section class="screen screen--doc" style="display:block">
  <div class="play-head">
    <a class="backbtn" href="./" aria-label="Vai al gioco">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
    </a>
    <h1 class="play-title">Come si gioca</h1>
  </div>
${body}

  <p class="guide-cta"><a class="btn btn--big" href="./">Gioca ad Abaco Zuzzurellone</a></p>

  <aside class="adslot" data-ad="guida" aria-label="Pubblicità">
    <span class="adslot-tag">pubblicità</span>
  </aside>
</section>
</main>

<footer class="sitefoot">
  <span>Parole dal dizionario Hunspell <b>it_IT</b> di LibreItalia (GPL-3.0).</span>
  <a href="privacy.html">Privacy e cookie</a>
  <a href="https://github.com/Fedetrain/abaco-zuzzurellone" rel="noopener">codice su GitHub</a>
</footer>

<script src="assets/ads.js"></script>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, 'guida.html'), page, 'utf8');
console.log(`guida.html scritta: ${(page.length / 1024).toFixed(0)} KB, ${faq.length} FAQ nei dati strutturati`);
