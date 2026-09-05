/* =========================================================================
   Abaco Zuzzurellone -- interfaccia e regia di gioco
   Dipende solo da assets/core.js (globale AZ) e da data/dizionario.js.
   ========================================================================= */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var num = AZ.formatNumber;

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = function () { return REDUCED.matches; };

  /* ─────────────────────────────────────────────────────────────────────
     Archivio locale — ogni accesso è protetto: ci sono browser (e finestre
     private) in cui localStorage lancia al solo tocco.
  ───────────────────────────────────────────────────────────────────── */
  var STORE_KEY = 'abaco-zuzzurellone/v1';
  var store = {
    read: function () {
      try {
        var raw = localStorage.getItem(STORE_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (e) { return {}; }
    },
    write: function (data) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { /* ignora */ }
    },
  };
  var prefs = store.read();
  if (!prefs.stats) prefs.stats = {};
  var savePrefs = function () { store.write(prefs); };

  /* ─────────────────────────────────────────────────────────────────────
     Tema
  ───────────────────────────────────────────────────────────────────── */
  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-theme', theme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }
  applyTheme(prefs.theme);
  $('#btn-theme').addEventListener('click', function () {
    var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var current = prefs.theme || (systemDark ? 'dark' : 'light');
    prefs.theme = current === 'dark' ? 'light' : 'dark';
    applyTheme(prefs.theme);
    savePrefs();
    sfx.click();
  });

  /* ─────────────────────────────────────────────────────────────────────
     Suoni — Web Audio, nessun file esterno, spenti di default.
  ───────────────────────────────────────────────────────────────────── */
  var sfx = (function () {
    var ctx = null;
    var on = prefs.sound === true;

    function tone(freq, start, dur, type, peak) {
      if (!on) return;
      try {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        var t = ctx.currentTime + start;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(peak || 0.13, t + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      } catch (e) { /* audio non disponibile: pazienza */ }
    }

    return {
      get enabled() { return on; },
      set enabled(v) { on = v; },
      click: function () { tone(520, 0, 0.05, 'sine', 0.05); },
      narrow: function () { tone(360, 0, 0.09, 'triangle', 0.09); tone(540, 0.05, 0.12, 'sine', 0.07); },
      bad: function () { tone(150, 0, 0.16, 'sawtooth', 0.07); },
      win: function () {
        [523, 659, 784, 1046].forEach(function (f, i) { tone(f, i * 0.09, 0.34, 'sine', 0.11); });
      },
      urgent: function () { tone(880, 0, 0.06, 'square', 0.04); },
    };
  })();

  var soundBtn = $('#btn-sound');
  function renderSound() {
    soundBtn.setAttribute('aria-pressed', String(sfx.enabled));
    soundBtn.setAttribute('aria-label', 'Suoni: ' + (sfx.enabled ? 'attivi' : 'disattivati'));
  }
  renderSound();
  soundBtn.addEventListener('click', function () {
    sfx.enabled = !sfx.enabled;
    prefs.sound = sfx.enabled;
    savePrefs();
    renderSound();
    if (sfx.enabled) sfx.narrow();
  });

  /* ─────────────────────────────────────────────────────────────────────
     Schermate
  ───────────────────────────────────────────────────────────────────── */
  var SCREENS = ['home', 'play', 'end', 'rules', 'stats'];
  var current = 'home';
  var previous = 'home';

  function show(name) {
    if (name === current) return;
    previous = current;
    current = name;
    SCREENS.forEach(function (s) {
      var el = document.getElementById('screen-' + s);
      if (s === name) {
        el.hidden = false;
        el.classList.remove('is-entering');
        void el.offsetWidth;              // forza il restart dell'animazione
        el.classList.add('is-entering');
      } else {
        el.hidden = true;
      }
    });
    window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
  }

  function goBack() {
    if (game.timer) stopTimer();
    Alfa.close();
    Daily.hideCountdown();
    Daily.render();
    show('home');
  }

  $$('[data-back]').forEach(function (b) { b.addEventListener('click', goBack); });
  $('#btn-home').addEventListener('click', goBack);
  $('#btn-rules').addEventListener('click', function () { show('rules'); });
  $('#btn-stats').addEventListener('click', function () { renderStats(); show('stats'); });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    // Esc chiude prima l'alfabeto, poi la schermata: è l'ordine che ci si
    // aspetta quando sul telefono il pannello copre mezzo schermo.
    if (Alfa.isOpen()) { Alfa.close(); return; }
    if (current !== 'home') goBack();
  });

  /* ─────────────────────────────────────────────────────────────────────
     Il campo: la barra dell'intervallo.
     Un'unica animazione a requestAnimationFrame governa sia l'intervallo
     (con easing elastico) sia il "viewport", cioè la porzione di alfabeto
     inquadrata, che si stringe quando l'intervallo diventa minuscolo.
  ───────────────────────────────────────────────────────────────────── */
  var Field = (function () {
    var elSpan = $('#field-span');
    var elOutL = $('#field-out-l');
    var elOutR = $('#field-out-r');
    var elRails = $('#field-rails');
    var elMarks = $('#field-marks');
    var elScale = $('#field-scale');
    var elZoom = $('#field-zoom');
    var elCount = $('#field-count');
    var elCountNum = $('#count-num');
    var elCountLab = $('#count-label');
    var elField = $('#field');
    var elTrack = $('#field-track');
    var elLo = $('#bound-lo');
    var elHi = $('#bound-hi');

    var N = 1;
    var lo = 0, hi = 1;                    // intervallo obiettivo
    var aLo = 0, aHi = 1, fLo = 0, fHi = 1; // animato / punto di partenza
    var vLo = 0, vHi = 1, avLo = 0, avHi = 1, fvLo = 0, fvHi = 1;
    var t0 = 0, dur = 0, raf = null;
    var marks = [];
    var ticks = [];
    var letterTicks = null;
    var countFrom = 0, countTo = 0, countT0 = 0;
    var etichetta = ['parole nel campo', 'parola nel campo'];
    var trackW = 600;   // stima iniziale, sostituita alla prima misura

    function measure() {
      var w = elTrack.getBoundingClientRect().width;
      // Se il campo non è ancora visibile la larghezza è 0: tengo l ultima
      // misura buona invece di azzerare la scala dell alfabeto.
      if (w > 1) trackW = w;
    }

    function easeOutBack(t) {
      var c1 = 1.35, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function easeOutExpo(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }

    function init(dict) {
      N = dict.size;
      letterTicks = [];
      var seen = {};
      for (var i = 0; i < N; i++) {
        // "élite" appartiene alla e: le iniziali accentate si accorpano alla
        // lettera base, altrimenti la scala mostrerebbe una "é" fra e ed f.
        // Il normalize costa, e su 300.000 parole serve solo per le poche
        // iniziali accentate: le altre sono già la loro lettera base.
        var c = dict.words[i][0];
        if (c > 'z') c = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (!seen[c]) { seen[c] = true; letterTicks.push({ i: i, label: c }); }
      }
    }

    /* Sceglie le etichette della scala per la porzione inquadrata: le lettere
       quando si vede tutto il vocabolario, prefissi via via più lunghi mano a
       mano che si entra dentro una parola. Un prefisso deve comparire una
       volta sola: «gravita», «gravità», «gravitano» tagliati a sette lettere
       danno due «gravita» con «gravità» in mezzo, e la scala mostrava lo
       stesso nome per due posti diversi. In quel caso si allunga il taglio. */
    var MAX_PREFIX = 12;
    function computeTicks(a, b) {
      var n = b - a;
      // Finché si vede tanto vocabolario le etichette sono le iniziali; più
      // in basso diventano prefissi sempre più lunghi.
      if (n > 40000) return thinOut(letterTicks, a, b);
      for (var L = 1; L <= MAX_PREFIX; L++) {
        var items = [];
        var last = null;
        var seen = {};
        var doppio = false;
        for (var i = a; i < b; i++) {
          var p = game.dict.words[i].slice(0, L);
          if (p !== last) {
            if (seen[p]) doppio = true;
            seen[p] = true;
            items.push({ i: i, label: p });
            last = p;
          }
        }
        if ((items.length >= 7 && !doppio) || L === MAX_PREFIX) return thinOut(subsample(items, 11), a, b);
      }
      return [];
    }
    function subsample(items, max) {
      if (items.length <= max) return items;
      var out = [];
      for (var k = 0; k < max; k++) out.push(items[Math.round(k * (items.length - 1) / (max - 1))]);
      return out;
    }
    /* Toglie le etichette che finirebbero una addosso all'altra. La distanza
       minima dipende da quanto sono lunghe le due etichette vicine, non da un
       numero fisso: così le lettere singole possono stare fitte — ed è proprio
       il punto, la "s" si prende più spazio di j-k-q-w-x-y messe insieme —
       mentre i prefissi lunghi si diradano da soli. Chi non trova posto sulla
       prima riga prova la seconda, sotto: raddoppiare le righe raddoppia lo
       spazio senza cambiare il criterio, e molte meno lettere spariscono del
       tutto (a schermo intero, senza la seconda riga anche una "h" o una "q"
       — pur essendo lettere italiane vere — restavano quasi sempre fuori). */
    var CHAR_PX = 6.6;   // larghezza di un carattere del monospaziato a .62rem
    var TICK_ROWS = 2;
    function thinOut(items, a, b) {
      var span = b - a;
      // Quanta parte di campo si prende ogni etichetta: è il criterio con cui
      // decidiamo chi sopravvive. Scartare da sinistra a destra terrebbe le
      // lettere microscopiche (h, j, k) buttando via quelle grosse che le
      // seguono (i, l): qui vince chi occupa più vocabolario.
      var cand = [];
      for (var k = 0; k < items.length; k++) {
        var pct = (items[k].i - a) / span * 100;
        if (pct < -1 || pct > 101) continue;
        var next = k + 1 < items.length ? items[k + 1].i : b;
        cand.push({ item: items[k], pct: pct, peso: next - items[k].i });
      }
      var byWeight = cand.slice().sort(function (x, y) { return y.peso - x.peso; });
      var rows = [];
      for (var r = 0; r < TICK_ROWS; r++) rows.push([]);
      byWeight.forEach(function (c) {
        var len = c.item.label.length;
        for (var r = 0; r < rows.length; r++) {
          var row = rows[r];
          var fits = true;
          for (var j = 0; j < row.length; j++) {
            var needed = ((row[j].item.label.length + len) / 2 * CHAR_PX + 7) / trackW * 100;
            if (Math.abs(c.pct - row[j].pct) < needed) { fits = false; break; }
          }
          if (fits) { row.push({ item: c.item, pct: c.pct, row: r }); return; }
        }
      });
      var kept = [];
      rows.forEach(function (row) { kept = kept.concat(row); });
      return kept
        .sort(function (x, y) { return x.pct - y.pct; })
        .map(function (c) { return { i: c.item.i, label: c.item.label, row: c.row }; });
    }

    function renderTicks() {
      elScale.innerHTML = '';
      elRails.innerHTML = '';
      ticks.forEach(function (t, k) {
        var el = document.createElement('span');
        el.className = 'tick';
        el.style.setProperty('--t', k);
        el.style.setProperty('--row', t.row || 0);
        el.textContent = t.label;
        t.el = el;
        elScale.appendChild(el);

        var rail = document.createElement('span');
        rail.className = 'rail';
        t.rail = rail;
        elRails.appendChild(rail);
      });
    }

    function chooseViewport() {
      var w = hi - lo;
      if (w / N > 0.05 || w <= 0) return [0, N];
      var want = Math.max(w * 3.2, 30);
      var c = (lo + hi) / 2;
      var a = Math.round(c - want / 2);
      if (a < 0) a = 0;
      var b = a + want;
      if (b > N) { b = N; a = Math.max(0, b - want); }
      return [Math.round(a), Math.round(b)];
    }

    function frame(now) {
      var t = dur <= 0 ? 1 : Math.min(1, (now - t0) / dur);
      var e = reduced() ? 1 : easeOutBack(t);
      var ev = reduced() ? 1 : easeInOut(t);

      aLo = fLo + (lo - fLo) * e;
      aHi = fHi + (hi - fHi) * e;
      avLo = fvLo + (vLo - fvLo) * ev;
      avHi = fvHi + (vHi - fvHi) * ev;

      draw();

      // conteggio: scende con la sua curva, un filo più lenta
      var ct = Math.min(1, (now - countT0) / 700);
      var cv = Math.round(countFrom + (countTo - countFrom) * (reduced() ? 1 : easeOutExpo(ct)));
      elCountNum.textContent = num(cv);
      elCountLab.textContent = etichetta[cv === 1 ? 1 : 0];

      if (t < 1 || ct < 1) raf = requestAnimationFrame(frame);
      else raf = null;
    }

    function pct(i) { return (i - avLo) / Math.max(1, avHi - avLo) * 100; }

    function draw() {
      var l = pct(aLo), r = pct(aHi);
      var left = Math.max(-4, Math.min(104, l));
      var width = Math.max(0.35, Math.min(108, r) - left);
      elSpan.style.left = left + '%';
      elSpan.style.width = width + '%';

      // Il gradiente deve restare ancorato alla traccia: se il blocco è largo
      // W% e comincia a L%, dipingo uno sfondo largo 100/W volte il blocco e
      // lo sposto di quanto serve perché il suo inizio cada su L=0 della
      // traccia. Con background-position in %, lo scorrimento vale
      // p/100 * (larghezzaBlocco - larghezzaSfondo), da cui la formula.
      elSpan.style.backgroundSize = (100 / width * 100) + '% 100%';
      elSpan.style.backgroundPositionX =
        width >= 99.99 ? '0%' : (left / (100 - width) * 100) + '%';

      // Le due zone escluse, che dicono da che parte si è stretto il campo.
      elOutL.style.width = Math.max(0, Math.min(100, l)) + '%';
      elOutR.style.left = Math.max(0, Math.min(100, r)) + '%';

      for (var k = 0; k < marks.length; k++) {
        var p = pct(marks[k].i + 0.5);
        marks[k].el.style.left = p + '%';
        marks[k].el.classList.toggle('is-out', p < -0.5 || p > 100.5);
      }
      for (var j = 0; j < ticks.length; j++) {
        if (!ticks[j].el) continue;
        var tp = pct(ticks[j].i);
        var visible = tp >= -2 && tp <= 102;
        ticks[j].el.style.left = tp + '%';
        ticks[j].el.style.opacity = visible ? '1' : '0';
        ticks[j].el.classList.toggle('is-in', tp >= l - 0.5 && tp <= r + 0.5);
        if (ticks[j].rail) {
          ticks[j].rail.style.left = tp + '%';
          ticks[j].rail.style.opacity = visible ? '' : '0';
        }
      }
    }

    /* Porta l'animazione al fotogramma finale, subito. In una scheda in
       secondo piano requestAnimationFrame non viene mai chiamata: senza
       questo, chi cambia scheda a metà mossa ritrova il campo e il conteggio
       congelati sui valori di prima, e non si correggono più da soli. */
    function settle() {
      aLo = lo; aHi = hi; fLo = lo; fHi = hi;
      avLo = vLo; avHi = vHi; fvLo = vLo; fvHi = vHi;
      countFrom = countTo;
      elCountNum.textContent = num(countTo);
      elCountLab.textContent = etichetta[countTo === 1 ? 1 : 0];
      draw();
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = null; } settle(); }
      else settle();
    });

    function animate() {
      measure();
      var vp = chooseViewport();
      var vpChanged = vp[0] !== vLo || vp[1] !== vHi;
      fLo = aLo; fHi = aHi; fvLo = avLo; fvHi = avHi;
      vLo = vp[0]; vHi = vp[1];
      if (vpChanged) { ticks = computeTicks(vLo, vHi); renderTicks(); }

      var zoom = N / Math.max(1, vHi - vLo);
      elZoom.textContent = 'zoom ×' + (zoom >= 10 ? Math.round(zoom) : zoom.toFixed(1));
      elZoom.classList.toggle('is-on', zoom > 1.4);

      measure();
      t0 = performance.now();
      dur = reduced() ? 0 : 850;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    }

    function setBound(el, word, klass) {
      var cur = el.querySelector('.morph-cur');
      if (cur && cur.textContent === word) return;
      var old = el.querySelector('.morph-old');
      if (old) old.remove();
      if (cur) {
        cur.className = 'morph-old';
        setTimeout(function () { if (cur.parentNode) cur.remove(); }, 460);
      }
      var next = document.createElement('span');
      next.className = 'morph-cur';
      next.textContent = word;
      el.appendChild(next);
      if (klass) el.parentNode.classList.add(klass);
    }

    window.addEventListener('resize', function () {
      measure();
      ticks = computeTicks(Math.round(vLo), Math.round(vHi));
      renderTicks();
      draw();
    });

    return {
      init: init,

      /** Riporta il campo a tutto il vocabolario. */
      reset: function (loWord, hiWord, label) {
        marks.forEach(function (m) { m.el.remove(); });
        marks = [];
        etichetta = label || ['parole nel campo', 'parola nel campo'];
        elCountLab.textContent = etichetta[0];
        lo = 0; hi = N; aLo = 0; aHi = N; fLo = 0; fHi = N;
        vLo = 0; vHi = N; avLo = 0; avHi = N; fvLo = 0; fvHi = N;
        measure();
        ticks = computeTicks(0, N); renderTicks();
        elZoom.classList.remove('is-on');
        elField.classList.remove('is-tight');
        setBound(elLo, loWord);
        setBound(elHi, hiWord);
        draw();
        Alfa.set(0, N);
      },

      /** Nuovo intervallo + nuovo conteggio, con animazione. */
      set: function (nextLo, nextHi, count, loWord, hiWord) {
        lo = nextLo; hi = nextHi;
        countFrom = countTo; countTo = count; countT0 = performance.now();
        setBound(elLo, loWord);
        setBound(elHi, hiWord);
        elCount.classList.remove('is-pop'); void elCount.offsetWidth;
        elCount.classList.add('is-pop');
        elSpan.classList.remove('is-sweep'); void elSpan.offsetWidth;
        elSpan.classList.add('is-sweep');
        elField.classList.toggle('is-tight', count <= 40);
        animate();
        Alfa.set(nextLo, nextHi);
      },

      /** Salta al fotogramma finale: serve dopo aver rigiocato in blocco le
          mosse di una partita ripresa, dove le animazioni non hanno senso. */
      settle: settle,

      setCount: function (count) {
        countFrom = countTo; countTo = count; countT0 = performance.now();
        if (!raf) raf = requestAnimationFrame(frame);
      },

      /** Un segnalino sulla traccia, colorato in base all'esito. */
      mark: function (i, kind) {
        var el = document.createElement('span');
        el.className = 'mark mark--' + kind;
        el.style.left = pct(i + 0.5) + '%';
        elMarks.appendChild(el);
        marks.push({ i: i, el: el });
      },

      /** @param {[string,string]} label plurale e singolare. */
      setLabel: function (label) { etichetta = label; elCountLab.textContent = label[0]; },
    };
  })();

  /* ─────────────────────────────────────────────────────────────────────
     L'alfabeto aperto
     ---------------------------------------------------------------------
     La scala sotto la barra è per forza diradata: più si stringe il campo,
     più mostra prefissi invece di lettere, e qualcuna sparisce per mancanza
     di spazio. Qui l'alfabeto si apre per intero — una casella per lettera,
     con lo stato rispetto al campo, le parole ancora in gioco e il peso di
     ciascuna sul vocabolario.

     Quando il campo entra tutto dentro una lettera il pannello scende di un
     livello da solo (dentro la r: ra re ri ro ru…), poi di un altro ancora.
     Il conto è AZ.breakdown, che lavora a colpi di lowerBound: 26 ricerche
     binarie, mai una scansione delle 267.251 parole.
  ───────────────────────────────────────────────────────────────────── */
  var Alfa = (function () {
    var elWrap = $('#alfa');
    var elToggle = $('#alfa-toggle');
    var elName = $('.alfa-toggle-name');
    var elHint = $('#alfa-hint');
    var elCap = $('#alfa-cap');
    var elCrumbs = $('#alfa-crumbs');
    var elGrid = $('#alfa-grid');
    var elLegend = $('#alfa-legend');
    var elCounts = $('#alfa-counts');
    var elScrim = $('#alfa-scrim');
    var elClose = $('#alfa-close');
    var elField = $('#field');

    var ORDINALI = ['prima', 'seconda', 'terza', 'quarta', 'quinta', 'sesta',
                    'settima', 'ottava', 'nona', 'decima'];
    var TAG = {
      dentro:   { testo: 'in campo',  aria: 'in campo' },
      parziale: { testo: 'a metà',    aria: 'a cavallo di un estremo' },
      prima:    { testo: 'fuori ←',   aria: 'esclusa: viene prima del campo' },
      dopo:     { testo: 'fuori →',   aria: 'esclusa: viene dopo il campo' },
    };

    var open = false;
    var lo = 0, hi = 0;

    function ordinale(n) {
      return n < ORDINALI.length ? ORDINALI[n] : (n + 1) + 'ª';
    }

    function esc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /* Una casella: lettera, conteggi, barra proporzionale, stato a parole. */
    function cella(v, max, i, extra) {
      var vuota = v.totale === 0;
      var stato = TAG[v.stato] || TAG.dentro;
      var classi = ['alfa-cell', 'alfa-cell--' + v.stato];
      if (vuota) classi.push('alfa-cell--vuota');
      if (extra) classi.push(extra);

      var peso = max > 0 ? Math.max(v.totale > 0 ? 2 : 0, v.totale / max * 100) : 0;
      var quota = v.totale > 0 ? v.vive / v.totale * 100 : 0;

      var etichetta = extra === 'alfa-cell--esatta'
        ? '·'
        : esc(v.lettera) + (v.straniera ? '<sup>str</sup>' : '');

      var testoStato = vuota && v.stato !== 'prima' && v.stato !== 'dopo'
        ? 'nessuna'
        : stato.testo;

      var aria = (extra === 'alfa-cell--esatta'
          ? 'la parola «' + v.parola + '» stessa'
          : 'lettera ' + v.lettera) +
        ': ' + (vuota ? 'nessuna parola giocabile'
                      : num(v.vive) + ' in gioco su ' + num(v.totale)) +
        ', ' + stato.aria + '.';

      return '<li class="' + classi.join(' ') + '" style="--i:' + i + '" aria-label="' + esc(aria) + '">' +
        '<span class="alfa-key" aria-hidden="true">' + etichetta + '</span>' +
        '<span class="alfa-num" aria-hidden="true"><b>' + num(v.vive) + '</b>' +
          '<em>&#8202;/&#8202;' + num(v.totale) + '</em></span>' +
        '<span class="alfa-meter" aria-hidden="true"><i style="width:' + peso.toFixed(2) + '%">' +
          '<b style="width:' + quota.toFixed(2) + '%"></b></i></span>' +
        '<span class="alfa-tag" aria-hidden="true">' + testoStato +
          (extra === 'alfa-cell--esatta' ? ' · «' + esc(v.parola) + '»' : '') + '</span>' +
        '</li>';
    }

    function render() {
      if (!game.dict) return;
      var b = game.dict.breakdown(lo, hi);
      var inCampo = b.voci.filter(function (v) { return v.vive > 0; }).length +
                    (b.esatta && b.esatta.vive > 0 ? 1 : 0);

      /* — la riga di riepilogo — */
      if (b.profondita === 0) {
        elCap.innerHTML =
          'Si decide la <em>prima lettera</em>. <b>' + num(b.vive) + '</b> parole in campo, ' +
          'sparse su <b>' + inCampo + '</b> lettere delle 26.';
      } else {
        elCap.innerHTML =
          'Il campo è tutto dentro <em>«' + esc(b.prefisso) + '…»</em>: ora si decide la ' +
          '<em>' + ordinale(b.profondita) + ' lettera</em>. <b>' + num(b.vive) + '</b> ' +
          (b.vive === 1 ? 'parola in gioco' : 'parole in gioco') +
          ' sulle <b>' + num(b.totale) + '</b> che cominciano così.';
      }

      /* — le lettere ormai fissate — */
      var crumbs = ['<li><b>tutto</b></li>'];
      for (var k = 0; k < b.prefisso.length; k++) {
        crumbs.push('<li><b>' + esc(b.prefisso.slice(0, k + 1)) + '</b></li>');
      }
      elCrumbs.innerHTML = crumbs.join('');

      /* — la griglia — */
      var celle = [];
      var i = 0;
      if (b.esatta) celle.push(cella(b.esatta, b.max, i++, 'alfa-cell--esatta'));
      b.voci.forEach(function (v) { celle.push(cella(v, b.max, i++)); });
      elGrid.innerHTML = celle.join('');

      elLegend.innerHTML =
        'La barra lunga dice <b>quanto vocabolario pesa</b> quella lettera, la parte accesa ' +
        'quello <b>ancora in gioco</b>. Le lettere barrate sono già escluse dall\'ordine ' +
        'alfabetico: nessuna risposta potrà più riportarcele.' +
        (b.profondita === 0
          ? ' Quando il campo entrerà dentro una lettera sola, qui compariranno i secondi caratteri.'
          : '');

      elHint.textContent = b.profondita === 0
        ? '26 lettere · ' + inCampo + ' in campo'
        : '«' + b.prefisso + '» · ' + ordinale(b.profondita) + ' lettera';
    }

    function setOpen(v) {
      open = !!v;
      elWrap.classList.toggle('is-open', open);
      elField.classList.toggle('is-alfa-open', open);
      elToggle.setAttribute('aria-expanded', String(open));
      elName.textContent = open ? 'chiudi l\'alfabeto' : 'apri l\'alfabeto';
      if (open) render();
    }

    /** Apre o chiude e ricorda la scelta, modalità per modalità. */
    function toggle() {
      sfx.click();
      setOpen(!open);
      prefs.alfa = prefs.alfa || {};
      if (game.mode) prefs.alfa[game.mode] = open;
      savePrefs();
    }

    elToggle.addEventListener('click', toggle);
    elClose.addEventListener('click', function () { setOpen(false); });
    elScrim.addEventListener('click', function () { setOpen(false); });

    // La barra è il posto naturale dove cercare di "aprire" l'alfabeto:
    // cliccarla fa esattamente la stessa cosa del pulsante — preferenza
    // ricordata compresa — che resta il comando raggiungibile da tastiera.
    $('#field-track').addEventListener('click', toggle);

    elCounts.addEventListener('change', function () {
      elWrap.classList.toggle('is-nocount', !elCounts.checked);
      prefs.alfaCounts = elCounts.checked;
      savePrefs();
    });
    if (prefs.alfaCounts === false) {
      elCounts.checked = false;
      elWrap.classList.add('is-nocount');
    }

    return {
      /** Nuovo intervallo: ridisegna se aperto, aggiorna comunque il richiamo. */
      set: function (nextLo, nextHi) {
        lo = nextLo; hi = nextHi;
        if (open) render();
        else if (game.dict) {
          var b = game.dict.breakdown(lo, hi);
          elHint.textContent = b.profondita === 0
            ? '26 lettere · ' +
              (b.voci.filter(function (v) { return v.vive > 0; }).length) + ' in campo'
            : '«' + b.prefisso + '» · ' + ordinale(b.profondita) + ' lettera';
        }
      },

      /* Aperto di default dove insegna qualcosa (il computer che dimezza,
         la caccia alle parole in mezzo), chiuso in «Indovina tu» dove la
         sfida sta proprio nel tenere il campo a mente. La scelta però
         resta all'utente e si ricorda, modalità per modalità. */
      mode: function (mode) {
        var salvato = prefs.alfa && prefs.alfa[mode];
        setOpen(salvato == null ? mode !== 'indovina' : salvato);
      },

      isOpen: function () { return open; },
      close: function () { setOpen(false); },
      refresh: function () { if (open) render(); },
    };
  })();

  /* ─────────────────────────────────────────────────────────────────────
     Stato di gioco
  ───────────────────────────────────────────────────────────────────── */
  var game = {
    dict: null,
    mode: null,
    lo: 0, hi: 0,
    // Etichette degli estremi mostrati sopra la barra: sono le *parole dette*
    // ("dopo casa" -> da casa), non le voci di dizionario adiacenti all'
    // intervallo interno, che sarebbero parole simili mai nominate.
    loWord: '', hiWord: '',
    secret: -1,
    history: [],
    tried: null,
    timer: null,
    result: null,
  };

  /** Le parole da cui esce la parola segreta e su cui si conta il campo. */
  function poolSize() { return game.dict.poolSize; }

  /** «Restano 12 parole» / «Resta 1 parola»: l'accordo lo fa il numero. */
  function restano(n, grassetto) {
    var v = grassetto ? '<b>' + num(n) + '</b>' : num(n);
    return (n === 1 ? 'Resta ' : 'Restano ') + v + (n === 1 ? ' parola' : ' parole');
  }

  /* ─────────────────────────────────────────────────────────────────────
     Feedback
  ───────────────────────────────────────────────────────────────────── */
  var elFeedback = $('#feedback');
  function say(text, kind) {
    elFeedback.textContent = text || '';
    elFeedback.className = 'feedback' + (kind ? ' is-' + kind : '');
    if (text) {
      void elFeedback.offsetWidth;
      elFeedback.classList.add('is-flash');
    }
  }
  function flashBar(form, kind) {
    form.classList.remove('is-bad', 'is-good');
    void form.offsetWidth;
    form.classList.add('is-' + kind);
    setTimeout(function () { form.classList.remove('is-' + kind); }, 700);
  }
  function tick(el) {
    el.classList.remove('is-tick'); void el.offsetWidth; el.classList.add('is-tick');
  }

  /* ─────────────────────────────────────────────────────────────────────
     Avvio di una partita
  ───────────────────────────────────────────────────────────────────── */
  function startMode(mode) {
    game.mode = mode;
    game.history = [];
    game.tried = new Set();
    game.lo = 0;
    game.hi = game.dict.size;
    game.loWord = game.dict.words[0];
    game.hiWord = game.dict.words[game.dict.size - 1];
    game.result = null;
    stopTimer();

    $('#play-title').textContent =
      mode === 'indovina' ? 'Indovina tu' :
      mode === 'computer' ? 'Indovina il computer' :
      mode === 'giorno' ? 'Parola del giorno #' + AZ.dayNumber(Daily.today()) : 'Sfida a tempo';

    // La parola del giorno riusa per intero il pannello di «Indovina tu»:
    // stesso campo, stessa cronologia, stesse regole. Cambia solo da dove
    // viene la parola e il fatto che si gioca una volta sola.
    var panel = mode === 'giorno' ? 'indovina' : mode;
    $$('.panel').forEach(function (p) { p.hidden = true; });
    $('#panel-' + panel).hidden = false;
    say('');

    // La schermata va mostrata *prima* di preparare il campo: da nascosto
    // il track misura zero e la scala dell'alfabeto non saprebbe dove andare.
    show('play');
    Alfa.mode(mode);

    if (mode === 'indovina') startIndovina();
    if (mode === 'giorno') startGiorno();
    if (mode === 'computer') startComputer();
    if (mode === 'tempo') startTempo();
  }

  $$('.mode').forEach(function (card) {
    card.addEventListener('click', function () { sfx.click(); startMode(card.dataset.mode); });
  });

  /* ═══════════════════ LA PAROLA DEL GIORNO ═════════════════════════
     Una parola al giorno, uguale per tutti: il seme è la data italiana,
     quindi non serve nessun server e non c'è niente da sincronizzare. Un
     solo tentativo a testa — che vuol dire che la partita va ripresa dov'era
     se qualcuno ricarica la pagina, altrimenti bastava un F5 per
     ricominciare da capo e il punteggio condiviso non varrebbe niente.
     Salviamo solo le parole proposte: lo stato si ricostruisce rigiocandole,
     che è più corto da salvare e impossibile da desincronizzare.
  ═══════════════════════════════════════════════════════════════════ */
  var Daily = (function () {
    var elDots = $('#daily-dots');
    var elNum = $('#daily-num');
    var elNext = $('#end-next');
    var countdown = null;

    function today() { return AZ.dayKey(); }

    /** Lo stato salvato del giorno corrente, ripulito da quelli vecchi.
        `partita` assente distingue anche i salvataggi della vecchia versione
        a tre livelli, che vanno buttati invece che letti male. */
    function state() {
      var key = today();
      if (!prefs.daily || prefs.daily.key !== key || !('partita' in prefs.daily)) {
        prefs.daily = { key: key, partita: null };
        savePrefs();
      }
      return prefs.daily;
    }

    function save(entry) {
      state().partita = entry;
      savePrefs();
    }

    /**
     * Streak: giorni di fila in cui la parola è stata risolta.
     * Si aggiorna solo alla prima vittoria del giorno.
     */
    function bumpStreak() {
      var key = today();
      var st = prefs.streak || { last: null, n: 0, best: 0 };
      if (st.last === key) return st;
      var ieri = AZ.dayKey(new Date(Date.now() - 86400000));
      st.n = st.last === ieri ? st.n + 1 : 1;
      st.last = key;
      st.best = Math.max(st.best || 0, st.n);
      prefs.streak = st;
      savePrefs();
      return st;
    }

    /** La streak è viva solo se l'ultima vittoria è di oggi o di ieri. */
    function streakNow() {
      var st = prefs.streak;
      if (!st || !st.last) return 0;
      var key = today();
      var ieri = AZ.dayKey(new Date(Date.now() - 86400000));
      return st.last === key || st.last === ieri ? st.n : 0;
    }

    /** Lo stato della parola di oggi, sotto il titolo in home. */
    function render() {
      if (!game.dict) return;
      elNum.textContent = '#' + AZ.dayNumber(today());
      var e = state().partita;
      var cls = !e ? 'todo' : e.done ? 'win' : 'doing';
      var testo = !e
        ? 'da giocare'
        : e.done
          ? 'risolta in ' + e.parole.length + (e.parole.length === 1 ? ' tentativo' : ' tentativi')
          : 'ripresa: ' + e.parole.length + (e.parole.length === 1 ? ' tentativo' : ' tentativi');
      var st = streakNow();
      elDots.innerHTML =
        '<span class="dot dot--' + cls + '">' + testo + '</span>' +
        (st ? '<span class="daily-streak">🔥 ' + st + (st === 1 ? ' giorno' : ' giorni') + '</span>' : '');
    }

    function stopCountdown() {
      if (countdown) { clearInterval(countdown); countdown = null; }
    }

    /** «La prossima fra 3:41:07» sulla schermata del risultato. */
    function showCountdown() {
      stopCountdown();
      elNext.hidden = false;
      var tick = function () {
        var ms = AZ.msToNextDay();
        if (ms <= 1000) { stopCountdown(); elNext.textContent = 'La nuova parola è pronta.'; return; }
        var s = Math.floor(ms / 1000);
        var pad = function (n) { return ('0' + n).slice(-2); };
        elNext.textContent = 'La prossima fra ' + Math.floor(s / 3600) + ':' +
          pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60) + '.';
      };
      tick();
      countdown = setInterval(tick, 1000);
    }

    return {
      render: render,
      state: state,
      save: save,
      bumpStreak: bumpStreak,
      streakNow: streakNow,
      showCountdown: showCountdown,
      stopCountdown: stopCountdown,
      hideCountdown: function () { stopCountdown(); elNext.hidden = true; },
      today: today,
    };
  })();

  /* ══════════════════ MODALITÀ 1 — indovina tu ══════════════════════ */
  var formIndovina = $('#form-indovina');
  var inputIndovina = $('#input-indovina');
  var histIndovina = $('#history-indovina');

  function startIndovina() {
    var d = game.dict;
    game.secret = d.randomIndex(0, d.size);
    histIndovina.innerHTML = '';
    inputIndovina.value = '';
    inputIndovina.disabled = false;
    $('#try-count').textContent = '0';
    $('#try-optimal').textContent = AZ.optimalGuesses(poolSize());
    Field.reset(d.words[0], d.words[d.size - 1], ['parole nel campo', 'parola nel campo']);
    Field.setCount(poolSize());
    setTimeout(function () {
      if ('ontouchstart' in window) return;              // niente tastiera a schermo
      if (current !== 'play' || inputIndovina.disabled) return;
      inputIndovina.focus();
    }, 350);
    say('Ho pensato una parola fra ' + num(poolSize()) + '. Tocca a te.');
  }

  /**
   * La parola del giorno. Riusa startIndovina per l'apparecchiatura e poi
   * sostituisce la parola segreta con quella del seme, rigiocando le
   * proposte già fatte oggi se c'è una partita da riprendere.
   */
  function startGiorno() {
    var d = game.dict;
    startIndovina();
    game.secret = AZ.dailyIndex(d, Daily.today());

    var entry = Daily.state().partita;
    if (entry && entry.done) { showGiornoResult(entry); return; }

    var parole = entry ? entry.parole : [];
    say(parole.length
      ? 'Ripresa: avevi già provato ' + parole.length +
        (parole.length === 1 ? ' parola.' : ' parole.')
      : 'La parola di oggi. Uguale per tutti fino a mezzanotte.');
    parole.forEach(function (w) { playGuess(w, true); });
    Field.settle();
  }

  /** Rimette in scena una partita del giorno già conclusa. */
  function showGiornoResult(entry) {
    game.history = [];
    entry.parole.forEach(function (w) { playGuess(w, true); });
    Field.settle();
    var opt = AZ.optimalGuesses(poolSize());
    var n = game.history.length;
    game.result = {
      mode: 'giorno', word: game.dict.words[game.secret], n: n, opt: opt,
      delta: n - opt, pool: poolSize(), parole: entry.parole,
      giorno: AZ.dayNumber(Daily.today()),
    };
    renderResult();
    show('end');
  }

  formIndovina.addEventListener('submit', function (e) {
    e.preventDefault();
    var d = game.dict;
    var w = AZ.normalize(inputIndovina.value);
    if (!w) return;

    if (!d.has(w)) {
      flashBar(formIndovina, 'bad');
      say('«' + w + '» non è nel vocabolario del gioco.', 'bad');
      sfx.bad();
      return;
    }
    if (game.tried.has(w)) {
      flashBar(formIndovina, 'bad');
      say('L\'hai già provata.', 'bad');
      sfx.bad();
      return;
    }

    var idx = d.indexOf(w);
    if (idx < game.lo || idx >= game.hi) {
      flashBar(formIndovina, 'bad');
      say('«' + w + '» è già fuori dal campo: lo sai di sicuro.', 'bad');
      sfx.bad();
      return;
    }

    inputIndovina.value = '';
    playGuess(w, false);
  });

  /**
   * Gioca una proposta già validata. `muta` serve alla parola del giorno,
   * che ripercorre le proposte salvate per ricostruire la partita: stesso
   * codice, così una partita ripresa non può divergere da com'era.
   */
  function playGuess(w, muta) {
    var d = game.dict;
    var idx = d.indexOf(w);
    if (idx < 0 || idx < game.lo || idx >= game.hi) return;

    game.tried.add(w);
    var res = AZ.applyGuess({ lo: game.lo, hi: game.hi }, idx, game.secret);
    game.lo = res.lo; game.hi = res.hi;

    var left = d.countRange(game.lo, game.hi);
    game.history.push({ word: w, idx: idx, esito: res.esito, lo: game.lo, hi: game.hi, left: left });

    var n = game.history.length;
    $('#try-count').textContent = n;
    if (!muta) tick($('#try-count'));
    addHistoryRow(histIndovina, n, w, res.esito, left);
    Field.mark(idx, res.esito === 'trovata' ? 'hit' : res.esito === 'prima' ? 'a' : 'z');

    if (game.mode === 'giorno' && !muta) saveGiorno(res.esito === 'trovata');

    if (res.esito === 'trovata') {
      Field.set(idx, idx + 1, 1, w, w);
      inputIndovina.disabled = true;
      if (!muta) { flashBar(formIndovina, 'good'); sfx.win(); finish(); }
      return;
    }

    // Gli estremi mostrati sono le parole effettivamente proposte: chi scrive
    // «casa» deve vedere "da casa" o "a casa", non la voce di dizionario
    // adiacente (casacca, casà...) che non ha mai nominato.
    if (res.esito === 'prima') game.hiWord = w;
    else game.loWord = w;
    Field.set(game.lo, game.hi, left, game.loWord, game.hiWord);
    if (muta) return;
    flashBar(formIndovina, 'good');
    sfx.narrow();
    say((res.esito === 'prima' ? 'Prima' : 'Dopo') + ' di «' + w + '». ' +
        restano(left) + '.', 'good');
  }

  function finish() {
    if (game.mode === 'giorno') finishGiorno();
    else finishIndovina();
  }

  /** Salva la partita del giorno dopo ogni mossa: un F5 non la azzera. */
  function saveGiorno(vinta) {
    Daily.save({
      parole: game.history.map(function (h) { return h.word; }),
      done: !!vinta,
    });
    if (vinta) Daily.bumpStreak();
  }

  function finishGiorno() {
    var pool = poolSize();
    var opt = AZ.optimalGuesses(pool);
    var n = game.history.length;
    game.result = {
      mode: 'giorno', word: game.dict.words[game.secret], n: n, opt: opt,
      delta: n - opt, pool: pool, vinta: true,
      parole: game.history.map(function (h) { return h.word; }),
      giorno: AZ.dayNumber(Daily.today()),
    };
    recordStats('giorno', function (s) {
      s.partite = (s.partite || 0) + 1;
      s.tentativi = (s.tentativi || 0) + n;
      s.best = s.best == null ? n : Math.min(s.best, n);
    });
    Daily.render();
    setTimeout(function () { renderResult(); show('end'); }, 1100);
  }

  function addHistoryRow(list, n, word, esito, left) {
    var li = document.createElement('li');
    var dirClass = esito === 'trovata' ? 'hit' : esito === 'prima' ? 'a' : 'z';
    var dirText = esito === 'trovata' ? '● trovata' : esito === 'prima' ? '← prima' : 'dopo →';
    li.innerHTML =
      '<span class="h-num">' + n + '</span>' +
      '<span class="h-word"></span>' +
      '<span class="h-dir h-dir--' + dirClass + '">' + dirText + '</span>' +
      '<span class="h-left">' + num(left) + '</span>';
    li.querySelector('.h-word').textContent = word;
    list.insertBefore(li, list.firstChild);
  }

  function finishIndovina() {
    var pool = poolSize();
    var opt = AZ.optimalGuesses(pool);
    var n = game.history.length;
    var delta = n - opt;

    recordStats('indovina', function (s) {
      s.partite = (s.partite || 0) + 1;
      s.tentativi = (s.tentativi || 0) + n;
      s.deltaTot = (s.deltaTot || 0) + delta;
      s.best = s.best == null ? n : Math.min(s.best, n);
      s.streak = delta <= 0 ? (s.streak || 0) + 1 : 0;
      s.maxStreak = Math.max(s.maxStreak || 0, s.streak);
      var key = delta <= -2 ? '-2' : delta >= 3 ? '3' : String(delta);
      s.dist = s.dist || {};
      s.dist[key] = (s.dist[key] || 0) + 1;
    });

    game.result = { mode: 'indovina', word: game.dict.words[game.secret], n: n, opt: opt, delta: delta, pool: pool };
    setTimeout(function () { renderResult(); show('end'); }, 1100);
  }

  /* ══════════════════ MODALITÀ 2 — indovina il computer ═════════════ */
  var cpuReason = $('#cpu-reason');
  var cpuWord = $('#cpu-word');
  var histComputer = $('#history-computer');
  var cpuCurrent = -1;

  function startComputer() {
    var d = game.dict;
    histComputer.innerHTML = '';
    $('#cpu-count').textContent = '0';
    $('#cpu-optimal').textContent = AZ.optimalGuesses(poolSize());
    $('#cpu-start-wrap').hidden = false;
    $('#cpu-answers').hidden = true;
    setCpuWord('—');
    cpuReason.innerHTML =
      'Pensa una parola italiana fra le <b>' + num(poolSize()) +
      '</b> parole giocabili e tienila a mente.';
    Field.reset(d.words[0], d.words[d.size - 1], ['parole possibili', 'parola possibile']);
    Field.setCount(poolSize());
    say('');
  }

  function setCpuWord(text) {
    var holder = cpuWord.querySelector('.morph');
    var cur = holder.querySelector('.morph-cur');
    if (cur) {
      cur.className = 'morph-old';
      var stale = cur;
      setTimeout(function () { if (stale.parentNode) stale.remove(); }, 460);
    }
    var next = document.createElement('span');
    next.className = 'morph-cur';
    next.textContent = text;
    holder.appendChild(next);
  }

  $('#cpu-start').addEventListener('click', function () {
    sfx.click();
    $('#cpu-start-wrap').hidden = true;
    $('#cpu-answers').hidden = false;
    cpuThink();
  });

  function cpuThink() {
    var d = game.dict;
    var left = d.countRange(game.lo, game.hi);
    var idx = d.medianIndex(game.lo, game.hi);

    if (idx < 0) { finishComputer('contraddizione'); return; }

    // Mentre "pensa" i tre pulsanti restano spenti: cliccarli non farebbe
    // nulla e sembrerebbe che il gioco si sia perso il colpo.
    $('.cpu').classList.add('is-thinking');
    $$('#cpu-answers [data-answer]').forEach(function (b) { b.disabled = true; });
    setTimeout(function () {
      cpuCurrent = idx;
      $$('#cpu-answers [data-answer]').forEach(function (b) { b.disabled = false; });
      $('.cpu').classList.remove('is-thinking');
      setCpuWord(d.words[idx]);
      cpuReason.innerHTML = restano(left, true) + '. Provo quella esattamente a metà.';
      sfx.narrow();
    }, reduced() ? 0 : 480);
  }

  $$('#cpu-answers [data-answer]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var d = game.dict;
      if (cpuCurrent < 0) return;
      var answer = btn.dataset.answer;
      var word = d.words[cpuCurrent];
      var n = game.history.length + 1;

      if (answer === 'trovata') {
        game.history.push({ word: word, idx: cpuCurrent, esito: 'trovata', left: 1 });
        addHistoryRow(histComputer, n, word, 'trovata', 1);
        Field.mark(cpuCurrent, 'hit');
        Field.set(cpuCurrent, cpuCurrent + 1, 1, word, word);
        $('#cpu-count').textContent = n; tick($('#cpu-count'));
        sfx.win();
        finishComputer('trovata');
        return;
      }

      var next = AZ.applyAnswer({ lo: game.lo, hi: game.hi }, cpuCurrent, answer);
      Field.mark(cpuCurrent, answer === 'prima' ? 'a' : 'z');

      if (next.contraddizione) {
        game.history.push({ word: word, idx: cpuCurrent, esito: answer, left: 0 });
        addHistoryRow(histComputer, n, word, answer, 0);
        $('#cpu-count').textContent = n; tick($('#cpu-count'));
        sfx.bad();
        finishComputer('contraddizione');
        return;
      }

      game.lo = next.lo; game.hi = next.hi;
      var left = d.countRange(game.lo, game.hi);
      game.history.push({ word: word, idx: cpuCurrent, esito: answer, lo: game.lo, hi: game.hi, left: left });
      addHistoryRow(histComputer, n, word, answer, left);
      $('#cpu-count').textContent = n; tick($('#cpu-count'));
      // Come in «Indovina tu»: l'estremo aggiornato è la parola appena
      // provata dal computer, non la voce adiacente dell'intervallo interno.
      if (answer === 'prima') game.hiWord = word;
      else game.loWord = word;
      Field.set(game.lo, game.hi, left, game.loWord, game.hiWord);
      cpuCurrent = -1;
      cpuThink();
    });
  });

  function finishComputer(esito) {
    $('#cpu-answers').hidden = true;
    var n = game.history.length;
    var opt = AZ.optimalGuesses(poolSize());
    recordStats('computer', function (s) {
      s.partite = (s.partite || 0) + 1;
      if (esito === 'trovata') {
        s.vinte = (s.vinte || 0) + 1;
        s.passi = (s.passi || 0) + n;
        s.best = s.best == null ? n : Math.min(s.best, n);
      } else {
        s.contraddizioni = (s.contraddizioni || 0) + 1;
      }
    });
    game.result = { mode: 'computer', esito: esito, n: n, opt: opt,
                    word: cpuCurrent >= 0 ? game.dict.words[cpuCurrent] : null };
    setTimeout(function () { renderResult(); show('end'); }, 1000);
  }

  /* ══════════════════ MODALITÀ 3 — sfida a tempo ════════════════════ */
  var DURATA = 180;
  var formTempo = $('#form-tempo');
  var inputTempo = $('#input-tempo');
  var chips = $('#tempo-chips');
  var ring = $('#timer-ring');
  var RING_LEN = 2 * Math.PI * 32;
  var tempo = { score: 0, ok: 0, ko: 0, left: DURATA, bounds: null, words: null };

  function startTempo() {
    var d = game.dict;
    // Gli estremi si scelgono contando le parole *comuni*, non le parole del
    // vocabolario. Contando quelle grezze, 1 500 voci consecutive stanno tutte
    // dentro lo stesso prefisso ("intervenite" → "inventa"): l'intervallo
    // sembra largo e invece non contiene nulla che a qualcuno venga in mente.
    // Con questo, in mezzo ci sono sempre COMUNI_MIN..COMUNI_MAX parole d'uso.
    var COMUNI_MIN = 70, COMUNI_MAX = 220;
    var quante = COMUNI_MIN + Math.floor(Math.random() * (COMUNI_MAX - COMUNI_MIN));
    var rank = Math.floor(Math.random() * Math.max(1, d.poolSize - quante - 1));
    var a = d.nthInRange(0, d.size, rank);
    var b = d.nthInRange(0, d.size, rank + quante + 1);
    if (a < 0 || b < 0 || b <= a) { a = 0; b = Math.min(d.size - 1, 2000); }

    tempo = { score: 0, ok: 0, ko: 0, left: DURATA, bounds: { da: d.words[a], a: d.words[b] },
              words: new Set(), lo: a, hi: b + 1 };

    chips.innerHTML = '';
    $('#tempo-score').textContent = '0';
    $('#tempo-ok').textContent = '0';
    $('#tempo-ko').textContent = '0';
    $('#timer-text').textContent = AZ.formatTime(DURATA);
    $('#timer').classList.remove('is-urgent');
    ring.style.strokeDasharray = RING_LEN;
    ring.style.strokeDashoffset = 0;
    inputTempo.disabled = true;
    $('#tempo-submit').disabled = true;
    $('#tempo-start-wrap').hidden = false;

    Field.reset(d.words[0], d.words[d.size - 1], ['parole in mezzo', 'parola in mezzo']);
    setTimeout(function () {
      // Qui vale tutto il vocabolario, non solo le giocabili: in mezzo ci si
      // può infilare qualunque parola che il gioco riconosca.
      Field.set(a, b + 1, Math.max(0, b - a - 1), d.words[a], d.words[b]);
    }, 60);
    say('Quante parole sai infilare fra «' + d.words[a] + '» e «' + d.words[b] + '»?');
  }

  $('#tempo-start').addEventListener('click', function () {
    sfx.click();
    $('#tempo-start-wrap').hidden = true;
    inputTempo.disabled = false;
    $('#tempo-submit').disabled = false;
    inputTempo.focus();
    Field.setLabel(['parole trovate', 'parola trovata']);
    Field.setCount(0);
    runTimer();
  });

  function runTimer() {
    stopTimer();
    game.timer = setInterval(function () {
      tempo.left -= 1;
      $('#timer-text').textContent = AZ.formatTime(tempo.left);
      ring.style.strokeDashoffset = RING_LEN * (1 - tempo.left / DURATA);
      if (tempo.left === 30) $('#timer').classList.add('is-urgent');
      if (tempo.left <= 10 && tempo.left > 0) sfx.urgent();
      if (tempo.left <= 0) { stopTimer(); finishTempo(); }
    }, 1000);
  }
  function stopTimer() {
    if (game.timer) { clearInterval(game.timer); game.timer = null; }
  }

  formTempo.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!game.timer) return;
    var res = AZ.judgeTimed(game.dict, inputTempo.value, tempo.bounds, tempo.words);
    if (!res.parola) return;
    inputTempo.value = '';

    if (res.esito === AZ.ESITO.DUPLICATA) {
      flashBar(formTempo, 'bad'); say('Già scritta.', 'bad'); sfx.bad(); return;
    }
    if (res.esito === AZ.ESITO.ESTREMO) {
      flashBar(formTempo, 'bad'); say('Gli estremi non contano.', 'bad'); sfx.bad(); return;
    }

    tempo.words.add(res.parola);
    tempo.score += res.punti;

    var chip = document.createElement('span');
    chip.textContent = res.parola;
    if (res.esito === AZ.ESITO.OK) {
      tempo.ok += 1;
      chip.className = 'chip chip--ok';
      flashBar(formTempo, 'good');
      say('+1 · ' + num(tempo.ok) + (tempo.ok === 1 ? ' parola' : ' parole'), 'good');
      sfx.narrow();
      Field.mark(game.dict.indexOf(res.parola), 'hit');
      Field.setCount(tempo.ok);
    } else {
      tempo.ko += 1;
      chip.className = 'chip chip--ko';
      flashBar(formTempo, 'bad');
      say(res.esito === AZ.ESITO.FUORI ? '−1 · fuori intervallo' : '−1 · non è nel vocabolario', 'bad');
      sfx.bad();
    }
    chips.insertBefore(chip, chips.firstChild);

    $('#tempo-score').textContent = tempo.score;
    $('#tempo-ok').textContent = tempo.ok;
    $('#tempo-ko').textContent = tempo.ko;
    tick($('#tempo-score'));
  });

  function finishTempo() {
    inputTempo.disabled = true;
    $('#tempo-submit').disabled = true;
    sfx.win();
    recordStats('tempo', function (s) {
      s.partite = (s.partite || 0) + 1;
      s.punti = (s.punti || 0) + tempo.score;
      s.parole = (s.parole || 0) + tempo.ok;
      s.best = s.best == null ? tempo.score : Math.max(s.best, tempo.score);
    });
    game.result = { mode: 'tempo', score: tempo.score, ok: tempo.ok, ko: tempo.ko, bounds: tempo.bounds };
    setTimeout(function () { renderResult(); show('end'); }, 600);
  }

  /* ─────────────────────────────────────────────────────────────────────
     Schermata risultato
  ───────────────────────────────────────────────────────────────────── */
  function rstat(value, label, kind, i) {
    return '<div class="rstat' + (kind ? ' rstat--' + kind : '') + '" style="--i:' + i + '">' +
           '<b>' + value + '</b><i>' + label + '</i></div>';
  }

  /* Una vista per modalità. Prima era una catena di `if` con un `else`
     appeso a uno solo di loro: il conto alla rovescia del giorno restava
     acceso, o si spegneva, a seconda di quale ramo capitava per ultimo. */
  var VISTE = {

    indovina: function (r, ui) {
      ui.kicker.textContent = 'Indovina tu · ' + num(r.pool) + ' parole in gioco';
      ui.title.textContent = r.delta <= 0 ? 'Perfetto.' : r.delta <= 2 ? 'Trovata!' : 'Trovata.';
      ui.word.textContent = r.word;
      ui.sub.innerHTML = r.delta < 0
        ? 'Hai fatto <b>' + Math.abs(r.delta) + '</b> ' + tentativi(Math.abs(r.delta)) +
          ' meno della ricerca binaria perfetta. Fortuna o fiuto?'
        : r.delta === 0
          ? 'Esattamente quanti ne servivano nel caso peggiore. Chirurgico.'
          : '<b>' + r.delta + '</b> ' + tentativi(r.delta) +
            ' oltre l\'ottimale. Prova a puntare sempre a metà del campo rimasto.';
      ui.stats.innerHTML =
        rstat(r.n, 'tentativi', r.delta <= 0 ? 'win' : '', 0) +
        rstat(r.opt, 'ottimale', '', 1) +
        rstat((r.delta > 0 ? '+' : '') + r.delta, 'scarto', r.delta <= 0 ? 'win' : 'lose', 2);
      renderPath(ui.path);
      ui.caption.textContent =
        'Il campo dopo ogni tentativo — dall\'intero vocabolario a una parola sola.';
      if (r.delta <= 0) burst();
    },

    giorno: function (r, ui) {
      var st = Daily.streakNow();
      ui.kicker.textContent = 'Parola del giorno #' + r.giorno;
      ui.title.textContent = r.delta <= 0 ? 'Perfetto.' : r.delta <= 2 ? 'Presa!' : 'Presa.';
      ui.word.textContent = r.word;
      ui.sub.innerHTML =
        '<b>' + r.n + '</b> ' + tentativi(r.n) +
        (r.delta < 0 ? ', meno della ricerca perfetta.' :
         r.delta === 0 ? ', esattamente quanti ne servivano.' :
         ' — l\'ottimale era <b>' + r.opt + '</b>.') +
        (st ? ' Sei al <b>' + st + '°</b> giorno di fila.' : '');
      ui.stats.innerHTML =
        rstat(r.n, 'tentativi', r.delta <= 0 ? 'win' : '', 0) +
        rstat(r.opt, 'ottimale', '', 1) +
        rstat(st, st === 1 ? 'giorno di fila' : 'giorni di fila', st > 1 ? 'win' : '', 2);
      renderPath(ui.path);
      ui.caption.textContent = 'Il campo dopo ogni tentativo.';
      Daily.showCountdown();
      if (r.delta <= 0) burst();
    },

    computer: function (r, ui) {
      ui.kicker.textContent = 'Indovina il computer · ' + num(poolSize()) + ' parole in gioco';
      if (r.esito === 'trovata') {
        ui.title.textContent = 'Presa.';
        ui.word.textContent = r.word || '';
        ui.sub.innerHTML = 'Mi sono bastate <b>' + r.n + '</b> mosse su un massimo di <b>' +
                           r.opt + '</b>. Ogni tua risposta ha buttato via metà del campo.';
        ui.stats.innerHTML = rstat(r.n, 'mosse', 'win', 0) + rstat(r.opt, 'al massimo', '', 1) +
          rstat(Math.round(100 - 100 / Math.pow(2, r.n)) + '%', 'campo escluso', '', 2);
        burst();
      } else {
        ui.title.textContent = 'Qui non torna.';
        ui.word.textContent = '';
        ui.sub.innerHTML = 'Le risposte si contraddicono: non resta nessuna parola che le ' +
          'soddisfi tutte. Capita — l\'ordine alfabetico è più scivoloso di quanto sembri.';
        ui.stats.innerHTML = rstat(r.n, 'mosse', '', 0) + rstat(0, 'candidate', 'lose', 1);
      }
      renderPath(ui.path);
      ui.caption.textContent = 'Il dimezzamento, mossa per mossa.';
    },

    tempo: function (r, ui) {
      ui.kicker.textContent = 'Sfida a tempo · 3 minuti';
      ui.title.textContent = r.score > 0 ? 'Tempo!' : 'Tempo scaduto.';
      ui.word.textContent = r.bounds.da + ' → ' + r.bounds.a;
      ui.sub.innerHTML = '<b>' + r.ok + '</b> ' + (r.ok === 1 ? 'parola valida' : 'parole valide') +
        (r.ko ? ', ' + r.ko + ' ' + (r.ko === 1 ? 'errore' : 'errori') : ', nessun errore') + '.';
      ui.stats.innerHTML = rstat(r.score, 'punti', r.score > 0 ? 'win' : 'lose', 0) +
        rstat(r.ok, 'valide', '', 1) + rstat(r.ko, 'errori', r.ko ? 'lose' : '', 2);
      if (r.ok >= 10) burst();
    },
  };

  function tentativi(n) { return n === 1 ? 'tentativo' : 'tentativi'; }

  function renderResult() {
    var r = game.result;
    if (!r || !VISTE[r.mode]) return;

    var ui = {
      kicker: $('#end-kicker'), title: $('#end-title'), word: $('#end-word'),
      sub: $('#end-sub'), stats: $('#end-stats'), path: $('#end-path'),
      caption: $('#end-path-caption'),
    };
    $('#sharebox').hidden = true;
    ui.path.innerHTML = '';
    ui.caption.textContent = '';

    // Stato che vale per tutte le modalità, deciso una volta sola: la vista
    // che lo vuole diverso lo cambia, e nessuna può lasciarlo acceso per
    // sbaglio a quella dopo.
    Daily.hideCountdown();
    $('#end-again').textContent = r.mode === 'giorno' ? 'Gioca un\'altra parola' : 'Ancora';

    VISTE[r.mode](r, ui);
  }

  /** Il percorso: un mattoncino per tentativo, largo quanto l'intervallo. */
  function renderPath(container) {
    var N = game.dict.size;
    var rows = [{ lo: 0, hi: N }].concat(
      game.history.filter(function (h) { return h.lo != null; })
                  .map(function (h) { return { lo: h.lo, hi: h.hi }; })
    );
    rows.forEach(function (row, i) {
      var el = document.createElement('div');
      el.className = 'path-row';
      el.style.setProperty('--i', i);
      var seg = document.createElement('div');
      seg.className = 'path-seg';
      seg.style.setProperty('--i', i);
      seg.style.left = (row.lo / N * 100) + '%';
      seg.style.width = Math.max(0.5, (row.hi - row.lo) / N * 100) + '%';
      el.appendChild(seg);
      container.appendChild(el);
    });
  }

  /** Piccola esplosione: 16 quadratini, meno di un secondo. */
  function burst() {
    if (reduced()) return;
    var host = $('.result');
    var old = host.querySelector('.burst');
    if (old) old.remove();
    var b = document.createElement('div');
    b.className = 'burst';
    var colors = ['var(--abaco)', 'var(--zuzz)', 'var(--gold)', 'var(--green)'];
    for (var i = 0; i < 16; i++) {
      var s = document.createElement('span');
      var ang = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
      var dist = 90 + Math.random() * 110;
      s.style.setProperty('--x', Math.cos(ang) * dist + 'px');
      s.style.setProperty('--y', Math.sin(ang) * dist * 0.75 + 'px');
      s.style.setProperty('--r', Math.round(Math.random() * 300 - 150) + 'deg');
      s.style.setProperty('--d', (i * 12) + 'ms');
      s.style.setProperty('--c', colors[i % colors.length]);
      b.appendChild(s);
    }
    host.appendChild(b);
    setTimeout(function () { if (b.parentNode) b.remove(); }, 1600);
  }

  $('#end-again').addEventListener('click', function () {
    sfx.click();
    // La parola del giorno è una sola: «Ancora» apre una partita libera,
    // non ne rigioca una che darebbe la stessa parola già vista.
    startMode(game.mode === 'giorno' ? 'indovina' : game.mode);
  });

  /* ─────────────────────────────────────────────────────────────────────
     Condivisione stile Wordle
  ───────────────────────────────────────────────────────────────────── */
  function shareText() {
    var r = game.result;
    var url = 'https://abacozuzzurellone.site/';
    if (!r) return 'Abaco Zuzzurellone 🧮\n' + url;
    var lines = ['Abaco Zuzzurellone 🧮'];

    if (r.mode === 'giorno') {
      var st = Daily.streakNow();
      lines[0] = 'Abaco Zuzzurellone #' + r.giorno + ' 🧮';
      lines.push(r.n + '/' + r.opt +
                 (r.delta <= 0 ? ' 🎯' : '') + (st > 1 ? ' · 🔥' + st : ''));
      lines.push(game.history.map(function (h) {
        return h.esito === 'trovata' ? '🎯' : h.esito === 'prima' ? '⬅️' : '➡️';
      }).join(''));
      lines.push(narrowingBar());
    } else if (r.mode === 'indovina') {
      lines.push('Indovina tu · ' + num(r.pool) + ' parole');
      lines.push('🎯 ' + r.n + ' tentativi — ottimale ' + r.opt +
                 (r.delta < 0 ? ' · ' + Math.abs(r.delta) + ' sotto!' :
                  r.delta === 0 ? ' · in pari' : ' · +' + r.delta));
      lines.push(game.history.map(function (h) {
        return h.esito === 'trovata' ? '🎯' : h.esito === 'prima' ? '⬅️' : '➡️';
      }).join(''));
      lines.push(narrowingBar());
    } else if (r.mode === 'computer') {
      lines.push('Indovina il computer');
      lines.push(r.esito === 'trovata'
        ? '🤖 mi ha beccato in ' + r.n + ' mosse (max ' + r.opt + ')'
        : '🤖 ' + r.n + ' mosse e poi il vuoto: risposte incoerenti');
      lines.push(narrowingBar());
    } else {
      lines.push('Sfida a tempo · 3:00');
      lines.push('« ' + r.bounds.da + ' … ' + r.bounds.a + ' »');
      lines.push('🏆 ' + r.score + ' punti — ' + r.ok + ' valide, ' + r.ko + ' errori');
      lines.push(new Array(Math.min(20, r.ok) + 1).join('🟩') +
                 new Array(Math.min(10, r.ko) + 1).join('🟥'));
    }
    lines.push(url);
    return lines.filter(Boolean).join('\n');
  }

  /** Barretta che mostra quanto si è ristretto il campo. */
  function narrowingBar() {
    var last = game.history[game.history.length - 1];
    if (!last) return '';
    var total = poolSize();
    var left = Math.max(1, last.left != null ? last.left : 1);
    var filled = Math.max(0, Math.min(10, Math.round(left / total * 10)));
    return '▓'.repeat(10) + ' → ' + (filled ? '▓'.repeat(filled) : '▏') +
           '░'.repeat(10 - filled) + '  (' + num(total) + ' → ' + num(left) + ')';
  }

  $('#end-share').addEventListener('click', function () {
    var text = shareText();
    sfx.click();

    var done = function (msg) {
      var label = $('#end-share span');
      var old = label.textContent;
      label.textContent = msg;
      setTimeout(function () { label.textContent = old; }, 1800);
    };

    // Sul telefono il foglio di condivisione nativo è l'unica strada che
    // porta davvero il messaggio in WhatsApp: gli appunti richiedono che
    // l'utente apra un'app e incolli, e quasi nessuno lo fa.
    if (navigator.share) {
      navigator.share({ text: text }).then(function () { done('Grazie!'); }, function () { /* annullato */ });
      return;
    }

    var box = $('#sharebox');
    box.textContent = text;
    box.hidden = false;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { done('Copiato!'); },
        function () { done('Copia a mano ↓'); }
      );
      return;
    }
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      ta.remove();
      done('Copiato!');
    } catch (e) { done('Copia a mano ↓'); }
  });

  /* ─────────────────────────────────────────────────────────────────────
     Statistiche
  ───────────────────────────────────────────────────────────────────── */
  function recordStats(mode, mutate) {
    if (!prefs.stats[mode]) prefs.stats[mode] = {};
    mutate(prefs.stats[mode]);
    savePrefs();
  }

  function cell(value, label) {
    return '<div class="stat-cell"><b>' + value + '</b><i>' + label + '</i></div>';
  }

  function renderStats() {
    var s = prefs.stats || {};
    var out = [];
    var g = s.indovina || {};
    var c = s.computer || {};
    var t = s.tempo || {};
    var q = s.giorno || {};

    if (!g.partite && !c.partite && !t.partite && !q.partite) {
      $('#stats-body').innerHTML =
        '<div class="doc-block"><h3>Ancora niente</h3>' +
        '<p class="stat-empty">Gioca una partita e qui comparirà il tuo storico. ' +
        'Resta su questo dispositivo, non va da nessuna parte.</p></div>';
      return;
    }

    if (q.partite) {
      var st = prefs.streak || {};
      out.push(
        '<section class="doc-block"><h3>Parola del giorno</h3>' +
        '<div class="stat-grid">' +
        cell(q.partite, 'risolte') +
        cell((q.tentativi / q.partite).toFixed(1), 'media tentativi') +
        cell(q.best == null ? '—' : q.best, 'record') +
        cell(Daily.streakNow(), 'giorni di fila') +
        cell(st.best || 0, 'streak record') +
        '</div></section>'
      );
    }
    if (g.partite) {
      var media = (g.tentativi / g.partite);
      var mediaDelta = (g.deltaTot / g.partite);
      out.push(
        '<section class="doc-block"><h3>Indovina tu</h3>' +
        '<div class="stat-grid">' +
        cell(g.partite, 'partite') +
        cell(media.toFixed(1), 'media tentativi') +
        cell(g.best, 'miglior partita') +
        cell((mediaDelta > 0 ? '+' : '') + mediaDelta.toFixed(1), 'scarto medio') +
        cell(g.streak || 0, 'streak') +
        cell(g.maxStreak || 0, 'streak record') +
        '</div>' + distBars(g.dist) + '</section>'
      );
    }
    if (c.partite) {
      out.push(
        '<section class="doc-block"><h3>Indovina il computer</h3>' +
        '<div class="stat-grid">' +
        cell(c.partite, 'partite') +
        cell(c.vinte || 0, 'indovinate') +
        cell(c.vinte ? (c.passi / c.vinte).toFixed(1) : '—', 'media mosse') +
        cell(c.best == null ? '—' : c.best, 'record') +
        cell(c.contraddizioni || 0, 'incoerenze') +
        '</div></section>'
      );
    }
    if (t.partite) {
      out.push(
        '<section class="doc-block"><h3>Sfida a tempo</h3>' +
        '<div class="stat-grid">' +
        cell(t.partite, 'partite') +
        cell(t.best == null ? '—' : t.best, 'miglior punteggio') +
        cell((t.punti / t.partite).toFixed(1), 'punti medi') +
        cell(t.parole || 0, 'parole trovate') +
        '</div></section>'
      );
    }
    $('#stats-body').innerHTML = out.join('');
  }

  /** Istogramma dello scarto rispetto alla ricerca perfetta. */
  function distBars(dist) {
    if (!dist) return '';
    var keys = ['-2', '-1', '0', '1', '2', '3'];
    var labels = { '-2': '≤ −2', '-1': '−1', '0': 'in pari', '1': '+1', '2': '+2', '3': '≥ +3' };
    var max = 1;
    keys.forEach(function (k) { max = Math.max(max, dist[k] || 0); });
    var rows = keys.map(function (k, i) {
      var v = dist[k] || 0;
      return '<div class="bar-row"><span>' + labels[k] + '</span>' +
             '<div class="bar-track"><div class="bar-fill' + (Number(k) <= 0 ? ' is-best' : '') +
             '" style="--i:' + i + ';width:' + (v / max * 100) + '%' + (v ? '' : ';min-width:0') + '"></div></div>' +
             '<span>' + v + '</span></div>';
    }).join('');
    return '<p class="doc-note" style="margin-top:1rem">Scarto dalla ricerca binaria perfetta</p>' +
           '<div class="bars">' + rows + '</div>';
  }

  // Azzerare è irreversibile e il pulsante sta a un dito dal tasto indietro:
  // il primo clic chiede conferma, e la richiesta scade da sola.
  var resetBtn = $('#stats-reset');
  var resetArmed = null;
  resetBtn.addEventListener('click', function () {
    if (!resetArmed) {
      resetBtn.textContent = 'sicuro?';
      resetBtn.classList.add('is-armed');
      resetArmed = setTimeout(function () {
        resetArmed = null;
        resetBtn.textContent = 'azzera';
        resetBtn.classList.remove('is-armed');
      }, 4000);
      return;
    }
    clearTimeout(resetArmed);
    resetArmed = null;
    resetBtn.textContent = 'azzera';
    resetBtn.classList.remove('is-armed');
    prefs.stats = {};
    savePrefs();
    renderStats();
  });

  /* ─────────────────────────────────────────────────────────────────────
     Dimostrazione del dimezzamento nella pagina delle regole
  ───────────────────────────────────────────────────────────────────── */
  function renderHalving(n) {
    var parts = [];
    var v = n;
    for (var k = 0; k < 8 && v > 1; k++) {
      parts.push(k === 0 ? num(v) : '<b>' + num(v) + '</b>');
      v = Math.ceil(v / 2);
    }
    parts.push('<b>1</b>');
    $('#halving-demo').innerHTML = parts.join('<span>→</span>');
  }

  /* ─────────────────────────────────────────────────────────────────────
     Caricamento del vocabolario
     Il file è un <script> e non una fetch: così la pagina funziona anche
     aperta da disco (file://), dove fetch verrebbe bloccata dal CORS.
  ───────────────────────────────────────────────────────────────────── */
  var loader = $('#loader');
  var loaderFill = $('#loader-fill');
  var loaderText = $('#loader-text');

  function progress(p, text) {
    loaderFill.style.width = p + '%';
    if (text) loaderText.textContent = text;
  }

  function boot(data) {
    progress(70, 'metto le parole in fila…');
    setTimeout(function () {
      var out = AZ.unpack(data.packed, data.count);
      game.dict = new AZ.Dizionario(out.words, out.tiers);
      Field.init(game.dict);

      // I numeri nel testo vengono dal vocabolario, non da una costante: cambiare
      // dizionario non deve lasciare in giro un "17 mosse per 130.000 parole" falso.
      // .g-count = le parole giocabili, .g-total = tutto ciò che il gioco accetta.
      var pool = poolSize();
      $('#hero-count').textContent = num(pool);
      $$('.g-count').forEach(function (el) { el.textContent = num(pool); });
      $$('.g-total').forEach(function (el) { el.textContent = num(game.dict.size); });
      $$('.g-opt').forEach(function (el) { el.textContent = AZ.optimalGuesses(pool); });
      Daily.render();
      renderHalving(pool);

      progress(100, 'pronto');
      setTimeout(function () {
        document.body.removeAttribute('data-loading');
        $('#screen-home').classList.add('is-entering');
        // Onboarding leggero: la prima volta il pulsante delle regole ammicca.
        if (!prefs.visto) {
          prefs.visto = true; savePrefs();
          var rb = $('#btn-rules');
          rb.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }],
            { duration: 700, iterations: 3, easing: 'cubic-bezier(.22,1.28,.38,1)' }
          );
        }
      }, 260);
    }, 40);
  }

  function fail(msg) {
    loader.classList.add('is-error');
    loaderText.textContent = msg;
    loaderFill.style.width = '100%';
  }

  progress(25, 'apro il vocabolario…');
  var script = document.createElement('script');
  script.src = 'data/dizionario.js';
  script.onload = function () {
    if (!window.ABACO_DATA) { fail('Vocabolario illeggibile.'); return; }
    boot(window.ABACO_DATA);
  };
  script.onerror = function () {
    fail('Non riesco a caricare data/dizionario.js — controlla che il file sia accanto a index.html.');
  };
  document.head.appendChild(script);
})();
