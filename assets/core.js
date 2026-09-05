/* =========================================================================
   Abaco Zuzzurellone -- core logic
   -------------------------------------------------------------------------
   Pure, DOM-free game logic. Exposed as the global `AZ` so that it can be
   loaded with a plain <script> tag both by index.html and by tests.html,
   which keeps everything working from the file:// protocol (ES modules and
   fetch() are blocked there by the browser's CORS rules).
   ========================================================================= */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------------
     1. Italian collation
     ---------------------------------------------------------------------
     Default JS string comparison is code-point based: "però" would sort
     after "zebra" because U+00F2 > "z". Italian dictionaries treat an accent
     as a secondary difference, so `pero` < `però` < `persona`. Intl.Collator
     with the 'it' locale gets that right; `sensitivity: 'variant'` keeps
     accented forms distinct instead of folding them together.
  --------------------------------------------------------------------- */
  var collator = new Intl.Collator('it', { sensitivity: 'variant' });

  /** Italian-aware three-way comparison. < 0, 0, > 0 like every comparator. */
  function compare(a, b) {
    return collator.compare(a, b);
  }

  /**
   * Normalises user input: trims, lowercases, collapses inner whitespace and
   * converts the typewriter apostrophe. Accents are deliberately preserved --
   * they carry meaning in the ordering (pero / però) -- but they are composed
   * to NFC first: some keyboards emit "o" + combining accent, which would
   * never match the precomposed "ò" the dictionary stores.
   */
  function normalize(input) {
    return String(input == null ? '' : input)
      .normalize('NFC')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[‘’ʼ]/g, "'");
  }

  /* ---------------------------------------------------------------------
     2. Front-coded dictionary codec (mirrors tools/build-dictionary.mjs)
     ---------------------------------------------------------------------
     Stream of entries: <base36 shared-prefix length><suffix><tier digit>.
     Words are letters only and tiers are digits, so the stream is
     self-delimiting and no separator byte is needed.
  --------------------------------------------------------------------- */
  function unpack(packed, expectedCount) {
    var words = expectedCount ? new Array(expectedCount) : [];
    var tiers = expectedCount ? new Uint8Array(expectedCount) : [];
    var i = 0;
    var n = 0;
    var prev = '';
    var len = packed.length;

    while (i < len) {
      var shared = parseInt(packed[i], 36);
      i += 1;
      var start = i;
      // Advance to the tier digit that terminates this entry.
      while (i < len && (packed[i] < '0' || packed[i] > '9')) i += 1;
      var word = prev.slice(0, shared) + packed.slice(start, i);
      var tier = packed.charCodeAt(i) - 48;
      i += 1;
      words[n] = word;
      tiers[n] = tier;
      prev = word;
      n += 1;
    }

    if (!expectedCount) {
      words.length = n;
    }
    return { words: words, tiers: tiers, count: n };
  }

  /** Encoder, kept next to the decoder so the round-trip can be tested. */
  function pack(words, tiers) {
    var out = '';
    var prev = '';
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var p = 0;
      var max = Math.min(prev.length, w.length, 35);
      while (p < max && prev[p] === w[p]) p++;
      out += p.toString(36) + w.slice(p) + tiers[i];
      prev = w;
    }
    return out;
  }

  /* ---------------------------------------------------------------------
     3. Dictionary
     ---------------------------------------------------------------------
     Two sets of words, and the distinction is the whole design:

       il vocabolario  every word the game accepts as real -- 308 000 forms,
                       so a player is never told a real Italian word does not
                       exist. This is what `has()` answers.
       le giocabili    the common subset the secret is drawn from, and the
                       set the "words left" counter talks about. This is what
                       `countRange()` answers.

     A word is playable when its tier is <= POOL_TIER; the tier byte comes
     straight from tools/build-dictionary.mjs.
  --------------------------------------------------------------------- */
  var POOL_TIER = 1;

  function Dizionario(words, tiers) {
    this.words = words;
    this.tiers = tiers;
    this.size = words.length;

    // Cumulative count of playable words, so "how many are in [lo, hi)" is an
    // O(1) subtraction instead of a scan. cum[i] = playable words among the
    // first i entries.
    var cum = new Int32Array(words.length + 1);
    for (var j = 0; j < words.length; j++) {
      cum[j + 1] = cum[j] + (tiers[j] <= POOL_TIER ? 1 : 0);
    }
    this.cum = cum;
    this.poolSize = cum[words.length];
  }

  /** Position of an exact word, or -1. */
  Dizionario.prototype.indexOf = function (word) {
    var i = this.lowerBound(word);
    return i < this.size && this.words[i] === word ? i : -1;
  };

  /** True when the word is part of the full Italian vocabulary. */
  Dizionario.prototype.has = function (word) {
    return this.indexOf(word) >= 0;
  };

  /**
   * Index of the first entry that is >= word (classic lower bound), using the
   * Italian comparator. Returns a value in [0, size].
   */
  Dizionario.prototype.lowerBound = function (word) {
    var lo = 0;
    var hi = this.size;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (compare(this.words[mid], word) < 0) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  /** Number of playable words in the half-open range [lo, hi). */
  Dizionario.prototype.countRange = function (lo, hi) {
    if (hi <= lo) return 0;
    return this.cum[Math.min(hi, this.size)] - this.cum[Math.max(lo, 0)];
  };

  /** The n-th playable word inside [lo, hi), or -1. */
  Dizionario.prototype.nthInRange = function (lo, hi, n) {
    var c = this.cum;
    var a = Math.max(lo, 0);
    var b = Math.min(hi, this.size);
    var target = c[a] + n + 1;   // cum[i+1] first reaches this at i
    if (n < 0 || b <= a || target > c[b]) return -1;
    while (a < b) {
      var mid = (a + b) >> 1;
      if (c[mid + 1] < target) a = mid + 1;
      else b = mid;
    }
    return a < Math.min(hi, this.size) ? a : -1;
  };

  /** A random playable word index inside [lo, hi). */
  Dizionario.prototype.randomIndex = function (lo, hi, rnd) {
    var total = this.countRange(lo, hi);
    if (total <= 0) return -1;
    return this.nthInRange(lo, hi, Math.floor((rnd || Math.random)() * total));
  };

  /**
   * The middle playable word inside [lo, hi): the move a perfect binary
   * search plays. Splitting on *word count* rather than on alphabet position
   * is what makes each answer worth a full bit.
   */
  Dizionario.prototype.medianIndex = function (lo, hi) {
    var total = this.countRange(lo, hi);
    if (total <= 0) return -1;
    return this.nthInRange(lo, hi, total >> 1);
  };

  /* ---------------------------------------------------------------------
     3-bis. Scomposizione alfabetica dell'intervallo
     ---------------------------------------------------------------------
     Il pannello "apri l'alfabeto" chiede, per ogni lettera, quante parole
     sono ancora in gioco e quante ne ha in tutto. Sono 26 domande che si
     risolvono con 26 lowerBound (~17 confronti l'una) piu' due sottrazioni
     sui cumulativi: nessuna scansione delle 267.251 parole.

     Quando l'intervallo entra dentro una sola lettera la scomposizione
     scende di un livello da sola: il prefisso comune ai due estremi diventa
     piu' lungo e le "lettere" mostrate sono i caratteri successivi
     (dentro la r: ra re ri ro ru...). E' il gioco stesso, reso visibile.
  --------------------------------------------------------------------- */
  var ALFABETO = 'abcdefghijklmnopqrstuvwxyz'.split('');
  var LETTERE_ITALIANE = 'abcdefghilmnopqrstuvz';

  /** Toglie gli accenti: "élite" e "però" vivono sotto e e sotto o. */
  function fold(word) {
    return String(word).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  /**
   * Il prefisso immediatamente successivo, in ordine alfabetico, a tutto il
   * blocco che comincia per `p`: "per" -> "pes", "pez" -> "pf", "zzz" -> null
   * (fine del vocabolario).
   */
  function nextPrefix(p) {
    for (var i = p.length - 1; i >= 0; i--) {
      var c = p.charCodeAt(i);
      if (c >= 97 && c < 122) return p.slice(0, i) + String.fromCharCode(c + 1);
    }
    return null;
  }

  /** Intervallo di indici di tutte le parole che cominciano per `prefisso`. */
  Dizionario.prototype.prefixRange = function (prefisso) {
    if (!prefisso) return { lo: 0, hi: this.size };
    var lo = this.lowerBound(prefisso);
    var next = nextPrefix(prefisso);
    var hi = next == null ? this.size : this.lowerBound(next);
    return { lo: lo, hi: Math.max(lo, hi) };
  };

  /**
   * Il prefisso comune ai due estremi dell'intervallo, senza accenti. E'
   * esattamente la profondita' a cui il gioco e' arrivato: finche' i due
   * estremi cominciano per lettere diverse vale '', poi 'r', poi 're'...
   */
  Dizionario.prototype.commonPrefix = function (lo, hi) {
    if (hi - lo <= 0 || this.size === 0) return '';
    var a = fold(this.words[Math.max(0, Math.min(lo, this.size - 1))]);
    var b = fold(this.words[Math.max(0, Math.min(hi, this.size) - 1)]);
    var k = 0;
    while (k < a.length && k < b.length && a[k] === b[k]) k += 1;
    return a.slice(0, k);
  };

  function statoDi(s, e, lo, hi) {
    if (e <= lo) return 'prima';
    if (s >= hi) return 'dopo';
    if (s >= lo && e <= hi) return 'dentro';
    return 'parziale';
  }

  /**
   * Scompone l'intervallo [lo, hi) lettera per lettera al livello giusto.
   * Restituisce:
   *   prefisso     il prefisso comune ai due estremi ('' all'inizio)
   *   profondita   quanti caratteri sono ormai fissati (= prefisso.length)
   *   ambito       l'intervallo di tutte le parole con quel prefisso
   *   voci         una per lettera: { lettera, prefisso, lo, hi, totale,
   *                vive, stato, straniera }
   *   esatta       la voce che e' esattamente il prefisso ("re" dentro "re"),
   *                oppure null
   *   vive/totale  parole giocabili in campo e parole giocabili dell'ambito
   *   max          il totale piu' alto fra le voci, per scalare le barre
   */
  Dizionario.prototype.breakdown = function (lo, hi) {
    lo = Math.max(0, Math.min(lo, this.size));
    hi = Math.max(lo, Math.min(hi, this.size));

    var prefisso = this.commonPrefix(lo, hi);
    // Intervallo di una parola sola: mostro comunque l'ultima scelta fatta,
    // altrimenti il pannello sarebbe una griglia vuota.
    if (hi - lo <= 1 && prefisso.length) prefisso = prefisso.slice(0, -1);

    var ambito = this.prefixRange(prefisso);
    var i;

    // Confini delle 26 lettere dentro l'ambito: monotoni per costruzione,
    // perche' lowerBound e' monotona e prefisso+'a' < prefisso+'b' < ...
    var bordi = new Array(ALFABETO.length + 1);
    for (i = 0; i < ALFABETO.length; i++) {
      var b = this.lowerBound(prefisso + ALFABETO[i]);
      bordi[i] = b < ambito.lo ? ambito.lo : (b > ambito.hi ? ambito.hi : b);
    }
    bordi[ALFABETO.length] = ambito.hi;

    var voci = [];
    var max = 0;
    for (i = 0; i < ALFABETO.length; i++) {
      var s = bordi[i];
      var e = bordi[i + 1];
      // In cima si mostrano tutte e 26 le lettere, anche quelle senza parole
      // giocabili: il vuoto e' un'informazione. Piu' in basso si tengono solo
      // le combinazioni che nel vocabolario esistono davvero.
      if (prefisso.length && e - s === 0) continue;
      var totale = this.countRange(s, e);
      if (totale > max) max = totale;
      voci.push({
        lettera: ALFABETO[i],
        prefisso: prefisso + ALFABETO[i],
        lo: s,
        hi: e,
        totale: totale,
        vive: this.countRange(Math.max(s, lo), Math.min(e, hi)),
        stato: statoDi(s, e, lo, hi),
        straniera: LETTERE_ITALIANE.indexOf(ALFABETO[i]) < 0,
      });
    }

    var esatta = null;
    if (prefisso.length && bordi[0] > ambito.lo) {
      esatta = {
        lettera: '·',
        prefisso: prefisso,
        parola: this.words[ambito.lo],
        lo: ambito.lo,
        hi: bordi[0],
        totale: this.countRange(ambito.lo, bordi[0]),
        vive: this.countRange(Math.max(ambito.lo, lo), Math.min(bordi[0], hi)),
        stato: statoDi(ambito.lo, bordi[0], lo, hi),
        straniera: false,
      };
      if (esatta.totale > max) max = esatta.totale;
    }

    return {
      prefisso: prefisso,
      profondita: prefisso.length,
      ambito: ambito,
      voci: voci,
      esatta: esatta,
      vive: this.countRange(lo, hi),
      totale: this.countRange(ambito.lo, ambito.hi),
      max: max,
    };
  };

  /* ---------------------------------------------------------------------
     4. Interval maths
     --------------------------------------------------------------------- */

  /**
   * Minimum number of guesses a perfect binary search needs, worst case, to
   * pin down one word out of n. Every answer splits the candidates in half,
   * so the count is ceil(log2(n + 1)): 17 guesses cover 131 071 words.
   */
  function optimalGuesses(n) {
    if (n <= 1) return n <= 0 ? 0 : 1;
    return Math.ceil(Math.log2(n + 1));
  }

  /**
   * Applies a guess to an interval of indices.
   * Returns { esito: 'trovata' | 'prima' | 'dopo', lo, hi }.
   * 'prima' means the secret comes alphabetically *before* the guess, so the
   * guess becomes the new upper bound.
   */
  function applyGuess(range, guessIndex, secretIndex) {
    if (guessIndex === secretIndex) {
      return { esito: 'trovata', lo: guessIndex, hi: guessIndex + 1 };
    }
    if (secretIndex < guessIndex) {
      return { esito: 'prima', lo: range.lo, hi: Math.min(range.hi, guessIndex) };
    }
    return { esito: 'dopo', lo: Math.max(range.lo, guessIndex + 1), hi: range.hi };
  }

  /**
   * Applies the *player's* answer while the computer is guessing. `risposta`
   * is 'prima' (my word comes before yours) or 'dopo'. An interval that ends
   * up empty means the answers contradicted each other.
   */
  function applyAnswer(range, guessIndex, risposta) {
    var next =
      risposta === 'prima'
        ? { lo: range.lo, hi: Math.min(range.hi, guessIndex) }
        : { lo: Math.max(range.lo, guessIndex + 1), hi: range.hi };
    next.contraddizione = next.hi <= next.lo;
    return next;
  }

  /* ---------------------------------------------------------------------
     5. Timed challenge scoring
     --------------------------------------------------------------------- */
  var ESITO = {
    OK: 'ok',
    FUORI: 'fuori',
    INESISTENTE: 'inesistente',
    DUPLICATA: 'duplicata',
    ESTREMO: 'estremo',
  };

  /**
   * Judges one submission in the timed challenge.
   *   +1  word exists, sits strictly between the two bounds, is new
   *   -1  word exists but is outside the range
   *   -1  word is not in the dictionary
   *    0  already submitted, or equal to one of the two bounds
   */
  function judgeTimed(dict, word, bounds, alreadyUsed) {
    var w = normalize(word);
    if (!w) return { esito: ESITO.INESISTENTE, punti: 0, parola: w };
    if (alreadyUsed.has(w)) return { esito: ESITO.DUPLICATA, punti: 0, parola: w };
    if (w === bounds.da || w === bounds.a) return { esito: ESITO.ESTREMO, punti: 0, parola: w };
    if (!dict.has(w)) return { esito: ESITO.INESISTENTE, punti: -1, parola: w };
    var inside = compare(bounds.da, w) < 0 && compare(w, bounds.a) < 0;
    if (!inside) return { esito: ESITO.FUORI, punti: -1, parola: w };
    return { esito: ESITO.OK, punti: 1, parola: w };
  }

  /* ---------------------------------------------------------------------
     5-bis. La parola del giorno
     ---------------------------------------------------------------------
     Una parola al giorno, uguale per tutti e senza server: la data e' il
     seme. Il giorno e' quello italiano (Europe/Rome) e non quello del fuso
     di chi gioca, altrimenti chi sta a Tokyo e chi sta a Lisbona
     condividerebbero due parole diverse con lo stesso numero.
  --------------------------------------------------------------------- */
  var GIORNO_ZERO = '2026-09-04';   // il primo enigma
  var romeDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' });

  /** La data italiana di un istante, come 'YYYY-MM-DD'. */
  function dayKey(date) {
    return romeDay.format(date || new Date());
  }

  /** Il numero progressivo dell'enigma: 1 il primo giorno. */
  function dayNumber(key) {
    var a = Date.UTC.apply(null, GIORNO_ZERO.split('-').map(Number).map(function (n, i) { return i === 1 ? n - 1 : n; }));
    var b = Date.UTC.apply(null, key.split('-').map(Number).map(function (n, i) { return i === 1 ? n - 1 : n; }));
    return Math.round((b - a) / 86400000) + 1;
  }

  /** FNV-1a a 32 bit: deterministico, uguale su ogni browser. */
  function hash32(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return h >>> 0;
  }

  /** Indice della parola del giorno, o -1. */
  function dailyIndex(dict, key) {
    var total = dict.poolSize;
    if (total <= 0) return -1;
    return dict.nthInRange(0, dict.size, hash32(key) % total);
  }

  /** Millisecondi che mancano alla mezzanotte italiana. */
  function msToNextDay(now) {
    var d = now || new Date();
    var today = dayKey(d);
    // Cerco in avanti a passi di un'ora: e' un modo goffo ma immune ai
    // cambi di ora legale, che a marzo e ottobre spostano la mezzanotte.
    var t = d.getTime();
    var step = 3600000;
    while (dayKey(new Date(t)) === today) t += step;
    // Ora sono dentro il giorno dopo: torno indietro al minuto esatto.
    while (dayKey(new Date(t - 60000)) !== today) t -= 60000;
    return t - d.getTime();
  }

  /* ---------------------------------------------------------------------
     6. Formatting helpers
     --------------------------------------------------------------------- */
  var NF = new Intl.NumberFormat('it-IT', { useGrouping: 'always' });
  function formatNumber(n) {
    return NF.format(n);
  }

  function formatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  root.AZ = {
    collator: collator,
    compare: compare,
    normalize: normalize,
    pack: pack,
    unpack: unpack,
    Dizionario: Dizionario,
    optimalGuesses: optimalGuesses,
    applyGuess: applyGuess,
    applyAnswer: applyAnswer,
    judgeTimed: judgeTimed,
    ESITO: ESITO,
    dayKey: dayKey,
    dayNumber: dayNumber,
    hash32: hash32,
    dailyIndex: dailyIndex,
    msToNextDay: msToNextDay,
    formatNumber: formatNumber,
    formatTime: formatTime,
  };
})(typeof window !== 'undefined' ? window : globalThis);
