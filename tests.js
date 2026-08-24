/* =========================================================================
   Abaco Zuzzurellone -- logic tests
   Runs in the browser (open tests.html) and in Node (node tools/run-tests.mjs).
   ========================================================================= */
(function (root) {
  'use strict';
  var AZ = root.AZ;

  var results = [];
  function test(name, fn) {
    try {
      fn();
      results.push({ name: name, ok: true });
    } catch (err) {
      results.push({ name: name, ok: false, message: err && err.message });
    }
  }
  function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
  }
  function eq(a, b, msg) {
    if (a !== b) throw new Error((msg || 'not equal') + ': got ' + a + ', expected ' + b);
  }

  /* A miniature dictionary used by most tests. Sorted the Italian way. */
  var MINI = [
    ['abaco', 2],
    ['albero', 0],
    ['casa', 0],
    ['cena', 0],
    ['pera', 0],
    ['pero', 1],
    ['però', 0],
    ['persona', 0],
    ['pesca', 0],
    ['zebra', 1],
    ['zuzzurellone', 2],
  ];
  function miniDict() {
    return new AZ.Dizionario(
      MINI.map(function (r) { return r[0]; }),
      MINI.map(function (r) { return r[1]; })
    );
  }

  /* ---------------------------------------------------------------- 1 */
  test('collation italiana: pero < però < persona', function () {
    assert(AZ.compare('pero', 'però') < 0, 'pero deve precedere però');
    assert(AZ.compare('però', 'persona') < 0, 'però deve precedere persona');
    assert(AZ.compare('pera', 'pero') < 0, 'pera deve precedere pero');
  });

  test('collation italiana: gli accenti non finiscono in fondo (ASCII bug)', function () {
    // With plain < the char code of "ò" (0x00F2) beats every ASCII letter,
    // so a naive sort pushes "però" after "persona" (and after "pesca").
    assert('però' > 'persona', 'precondizione: il confronto ASCII sbaglia');
    assert('perù' > 'perzona', 'precondizione: il confronto ASCII sbaglia');
    assert(AZ.compare('però', 'persona') < 0, 'il collator italiano deve correggere');
    assert(AZ.compare('perù', 'perzona') < 0, 'il collator italiano deve correggere');
  });

  test('collation italiana: sorting completo di un campione', function () {
    var sample = ['zebra', 'però', 'abaco', 'àncora', 'pero', 'persona', 'pera'];
    var sorted = sample.slice().sort(AZ.compare);
    eq(sorted.join(','), 'abaco,àncora,pera,pero,però,persona,zebra');
  });

  test('normalize: trim, minuscole, apostrofo tipografico, accenti preservati', function () {
    eq(AZ.normalize('  PERÒ  '), 'però');
    eq(AZ.normalize('un’altra'), "un'altra");
    eq(AZ.normalize(null), '');
  });

  /* ---------------------------------------------------------------- 2 */
  test('codec front-coded: round-trip esatto', function () {
    var words = MINI.map(function (r) { return r[0]; });
    var tiers = MINI.map(function (r) { return r[1]; });
    var out = AZ.unpack(AZ.pack(words, tiers), words.length);
    eq(out.count, words.length);
    eq(out.words.join('|'), words.join('|'));
    eq(Array.from(out.tiers).join(''), tiers.join(''));
  });

  test('codec front-coded: prefissi lunghi oltre 9 caratteri (base36)', function () {
    var words = ['internazionalizzare', 'internazionalizzato'];
    var out = AZ.unpack(AZ.pack(words, [2, 2]), 2);
    eq(out.words.join('|'), words.join('|'));
  });

  /* ---------------------------------------------------------------- 3 */
  test('lowerBound: posizione corretta anche per parole assenti', function () {
    var d = miniDict();
    eq(d.lowerBound('abaco'), 0);
    eq(d.lowerBound('aaa'), 0);
    eq(d.lowerBound('casa'), 2);
    eq(d.lowerBound('cane'), 2, 'cane sta fra albero e casa');
    eq(d.lowerBound('però'), 6);
    eq(d.lowerBound('zzzzz'), d.size);
  });

  test('has(): riconosce solo le parole del vocabolario', function () {
    var d = miniDict();
    assert(d.has('zuzzurellone'));
    assert(!d.has('sgrunf'));
  });

  /* ---------------------------------------------------------------- 4 */
  test('countRange: conteggio per livello nell intervallo', function () {
    var d = miniDict();
    eq(d.countRange(0, d.size, 'difficile'), 11, 'tutte le parole');
    eq(d.countRange(0, d.size, 'medio'), 9, 'tutte tranne le due di tier 2');
    eq(d.countRange(0, d.size, 'facile'), 7, 'solo i tier 0');
    // pera(4) pero(5) però(6) persona(7) pesca(8)
    eq(d.countRange(4, 9, 'difficile'), 5);
    eq(d.countRange(4, 9, 'facile'), 4, 'pero è tier 1, esce dal livello facile');
    eq(d.countRange(5, 5, 'difficile'), 0, 'intervallo vuoto');
  });

  test('medianIndex: sceglie la parola centrale per numero di parole', function () {
    var d = miniDict();
    // difficile, [0,11): 11 parole, la mediana (indice 5) è "pero"
    eq(d.words[d.medianIndex(0, d.size, 'difficile')], 'pero');
    // facile: 7 parole di tier 0 (albero, casa, cena, pera, però, persona,
    // pesca) -> la mediana in indice 3 è "pera"
    eq(d.words[d.medianIndex(0, d.size, 'facile')], 'pera');
    eq(d.medianIndex(3, 3, 'difficile'), -1, 'intervallo vuoto -> -1');
  });

  /* ---------------------------------------------------------------- 5 */
  test('optimalGuesses: ceil(log2(n+1))', function () {
    eq(AZ.optimalGuesses(0), 0);
    eq(AZ.optimalGuesses(1), 1);
    eq(AZ.optimalGuesses(2), 2);
    eq(AZ.optimalGuesses(3), 2);
    eq(AZ.optimalGuesses(4), 3);
    eq(AZ.optimalGuesses(7), 3);
    eq(AZ.optimalGuesses(100000), 17, '17 tentativi bastano per 100.000 parole');
    eq(AZ.optimalGuesses(131071), 17);
    eq(AZ.optimalGuesses(131072), 18);
  });

  /* ---------------------------------------------------------------- 6 */
  test('applyGuess: restringe l intervallo dal lato giusto', function () {
    var r = { lo: 0, hi: 11 };
    var a = AZ.applyGuess(r, 5, 8); // ho detto "pero", il segreto è "pesca"
    eq(a.esito, 'dopo');
    eq(a.lo, 6);
    eq(a.hi, 11);
    var b = AZ.applyGuess(r, 5, 2); // ho detto "pero", il segreto è "casa"
    eq(b.esito, 'prima');
    eq(b.lo, 0);
    eq(b.hi, 5);
    var c = AZ.applyGuess(r, 5, 5);
    eq(c.esito, 'trovata');
  });

  test('ricerca binaria: trova sempre la parola entro il numero ottimale', function () {
    var d = miniDict();
    var livello = 'difficile';
    var totale = d.countRange(0, d.size, livello);
    var limite = AZ.optimalGuesses(totale);
    for (var target = 0; target < d.size; target++) {
      var range = { lo: 0, hi: d.size };
      var steps = 0;
      var found = false;
      while (steps < 40) {
        var m = d.medianIndex(range.lo, range.hi, livello);
        if (m < 0) break;
        steps += 1;
        var res = AZ.applyGuess(range, m, target);
        range = { lo: res.lo, hi: res.hi };
        if (res.esito === 'trovata') { found = true; break; }
      }
      assert(found, 'non trovata la parola ' + d.words[target]);
      assert(steps <= limite, d.words[target] + ' ha richiesto ' + steps + ' > ' + limite);
    }
  });

  /* ---------------------------------------------------------------- 7 */
  test('applyAnswer: rileva le risposte incoerenti (intervallo vuoto)', function () {
    var r = { lo: 0, hi: 11 };
    var a = AZ.applyAnswer(r, 5, 'prima');   // -> [0,5)
    eq(a.hi, 5);
    assert(!a.contraddizione);
    var b = AZ.applyAnswer(a, 2, 'dopo');    // -> [3,5)
    eq(b.lo, 3);
    eq(b.hi, 5);
    assert(!b.contraddizione);
    var c = AZ.applyAnswer(b, 4, 'dopo');    // -> [5,5) : vuoto
    assert(c.contraddizione, 'deve segnalare la contraddizione');
  });

  test('applyAnswer: intervallo di una sola parola', function () {
    var r = { lo: 7, hi: 8 };
    var c = AZ.applyAnswer(r, 7, 'prima');
    assert(c.contraddizione);
  });

  /* ---------------------------------------------------------------- 8 */
  test('sfida a tempo: punteggio delle sottomissioni', function () {
    var d = miniDict();
    var bounds = { da: 'casa', a: 'pesca' };
    var used = new Set();

    var ok = AZ.judgeTimed(d, ' PERÒ ', bounds, used);
    eq(ok.esito, AZ.ESITO.OK);
    eq(ok.punti, 1);
    used.add(ok.parola);

    eq(AZ.judgeTimed(d, 'però', bounds, used).esito, AZ.ESITO.DUPLICATA);
    eq(AZ.judgeTimed(d, 'però', bounds, used).punti, 0);

    var fuori = AZ.judgeTimed(d, 'zebra', bounds, used);
    eq(fuori.esito, AZ.ESITO.FUORI);
    eq(fuori.punti, -1);

    var inesistente = AZ.judgeTimed(d, 'sgrunf', bounds, used);
    eq(inesistente.esito, AZ.ESITO.INESISTENTE);
    eq(inesistente.punti, -1);

    eq(AZ.judgeTimed(d, 'casa', bounds, used).esito, AZ.ESITO.ESTREMO, 'gli estremi non valgono');
    eq(AZ.judgeTimed(d, 'pesca', bounds, used).esito, AZ.ESITO.ESTREMO);
  });

  test('sfida a tempo: il confine usa la collation italiana', function () {
    var d = miniDict();
    // "però" sta fra "pero" e "persona" solo con la collation corretta.
    var bounds = { da: 'pero', a: 'persona' };
    eq(AZ.judgeTimed(d, 'però', bounds, new Set()).esito, AZ.ESITO.OK);
    eq(AZ.judgeTimed(d, 'pera', bounds, new Set()).esito, AZ.ESITO.FUORI);
  });

  /* ---------------------------------------------------------------- 9 */
  test('formattazione italiana di numeri e tempo', function () {
    eq(AZ.formatNumber(83362).replace(/ /g, '.'), '83.362');
    eq(AZ.formatTime(180), '3:00');
    eq(AZ.formatTime(9), '0:09');
    eq(AZ.formatTime(65), '1:05');
  });

  /* --------------------------------------------------------------- 10 */
  test('dizionario reale (se caricato): ordine, estremi e ricerca binaria', function () {
    var data = root.ABACO_DATA;
    if (!data) {
      throw new Error('SKIP: data/dizionario.js non caricato');
    }
    var out = AZ.unpack(data.packed, data.count);
    eq(out.count, data.count, 'conteggio coerente');
    var d = new AZ.Dizionario(out.words, out.tiers);
    eq(d.words[0], 'abaco', 'la prima voce del vocabolario');
    eq(d.words[d.size - 1], 'zuzzurellone', "l'ultima voce del vocabolario");

    // L'ordinamento del file deve già rispettare la collation italiana.
    for (var i = 1; i < d.size; i++) {
      if (AZ.compare(d.words[i - 1], d.words[i]) >= 0) {
        throw new Error('ordine rotto fra ' + d.words[i - 1] + ' e ' + d.words[i]);
      }
    }

    // Le parole accentate stanno al posto giusto.
    assert(d.has('però') && d.has('pero') && d.has('persona'));
    assert(d.lowerBound('pero') < d.lowerBound('però'));
    assert(d.lowerBound('però') < d.lowerBound('persona'));

    // Ricerca binaria su 200 parole a caso: mai oltre l'ottimale.
    var totale = d.countRange(0, d.size, 'difficile');
    var limite = AZ.optimalGuesses(totale);
    for (var k = 0; k < 200; k++) {
      var target = Math.floor(Math.random() * d.size);
      var range = { lo: 0, hi: d.size };
      var steps = 0;
      var found = false;
      while (steps < 60) {
        var m = d.medianIndex(range.lo, range.hi, 'difficile');
        if (m < 0) break;
        steps += 1;
        var res = AZ.applyGuess(range, m, target);
        range = { lo: res.lo, hi: res.hi };
        if (res.esito === 'trovata') { found = true; break; }
      }
      assert(found && steps <= limite,
        d.words[target] + ': ' + steps + ' tentativi (limite ' + limite + ')');
    }
  });

  root.AZ_TESTS = { results: results };
})(typeof window !== 'undefined' ? window : globalThis);
