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
   * they carry meaning in the ordering (pero / però).
   */
  function normalize(input) {
    return String(input == null ? '' : input)
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
     Holds the sorted vocabulary plus, for each difficulty, the list of
     indices that make up that difficulty's *universe* -- the set of words the
     secret is drawn from and the set the "words left" counter talks about.
     Guesses are always validated against the full vocabulary, so a player is
     never told a real Italian word does not exist.
  --------------------------------------------------------------------- */
  var LIVELLI = {
    facile: { label: 'Facile', maxTier: 0 },
    medio: { label: 'Medio', maxTier: 1 },
    difficile: { label: 'Difficile', maxTier: 2 },
  };

  function Dizionario(words, tiers) {
    this.words = words;
    this.tiers = tiers;
    this.size = words.length;
    this.index = new Map();
    for (var i = 0; i < words.length; i++) this.index.set(words[i], i);

    // Cumulative counts so that "how many level-L words are in [lo, hi)" is an
    // O(1) subtraction instead of an O(n) scan. cum[t][i] = number of words
    // with tier <= t among the first i entries.
    this.cum = [];
    for (var t = 0; t < 3; t++) {
      var arr = new Int32Array(words.length + 1);
      for (var j = 0; j < words.length; j++) {
        arr[j + 1] = arr[j] + (tiers[j] <= t ? 1 : 0);
      }
      this.cum.push(arr);
    }
  }

  /** True when the word is part of the full Italian vocabulary. */
  Dizionario.prototype.has = function (word) {
    return this.index.has(word);
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

  /** Number of words of the given difficulty in the half-open range [lo, hi). */
  Dizionario.prototype.countRange = function (lo, hi, livello) {
    var t = LIVELLI[livello].maxTier;
    if (hi <= lo) return 0;
    var c = this.cum[t];
    return c[Math.min(hi, this.size)] - c[Math.max(lo, 0)];
  };

  /** The n-th word of the given difficulty inside [lo, hi), or -1. */
  Dizionario.prototype.nthOfLevel = function (lo, hi, livello, n) {
    var maxTier = LIVELLI[livello].maxTier;
    var seen = 0;
    for (var i = lo; i < hi; i++) {
      if (this.tiers[i] <= maxTier) {
        if (seen === n) return i;
        seen += 1;
      }
    }
    return -1;
  };

  /** A random word index of the given difficulty inside [lo, hi). */
  Dizionario.prototype.randomIndex = function (lo, hi, livello, rnd) {
    var total = this.countRange(lo, hi, livello);
    if (total <= 0) return -1;
    var pick = Math.floor((rnd || Math.random)() * total);
    return this.nthOfLevel(lo, hi, livello, pick);
  };

  /**
   * The middle word of the given difficulty inside [lo, hi): the move a
   * perfect binary search plays. Splitting on *word count* rather than on
   * alphabet position is what makes each answer worth a full bit.
   */
  Dizionario.prototype.medianIndex = function (lo, hi, livello) {
    var total = this.countRange(lo, hi, livello);
    if (total <= 0) return -1;
    return this.nthOfLevel(lo, hi, livello, total >> 1);
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
     6. Formatting helpers
     --------------------------------------------------------------------- */
  function formatNumber(n) {
    return new Intl.NumberFormat('it-IT').format(n);
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
    LIVELLI: LIVELLI,
    optimalGuesses: optimalGuesses,
    applyGuess: applyGuess,
    applyAnswer: applyAnswer,
    judgeTimed: judgeTimed,
    ESITO: ESITO,
    formatNumber: formatNumber,
    formatTime: formatTime,
  };
})(typeof window !== 'undefined' ? window : globalThis);
