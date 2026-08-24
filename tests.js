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

  /* ------------------------------------------------------- 4-bis --- */
  /* La scomposizione alfabetica dell'intervallo: quello che il pannello
     "apri l'alfabeto" mette in scena. */

  function voce(b, lettera) {
    return b.voci.filter(function (v) { return v.lettera === lettera; })[0];
  }

  test('breakdown: in cima mostra tutte e 26 le lettere, contate a livello', function () {
    var d = miniDict();
    var b = d.breakdown(0, d.size, 'difficile');
    eq(b.prefisso, '', 'in cima nessuna lettera è ancora fissata');
    eq(b.profondita, 0);
    eq(b.voci.length, 26, 'le lettere ci sono tutte, anche le vuote');
    eq(b.esatta, null);
    eq(voce(b, 'a').totale, 2, 'abaco, albero');
    eq(voce(b, 'c').totale, 2, 'casa, cena');
    eq(voce(b, 'p').totale, 5, 'pera pero però persona pesca');
    eq(voce(b, 'z').totale, 2, 'zebra, zuzzurellone');
    eq(voce(b, 'b').totale, 0, 'nessuna parola per b');
    eq(b.max, 5, 'la lettera più pesante è la p');
    eq(voce(b, 'j').straniera, true);
    eq(voce(b, 'p').straniera, false);
  });

  test('breakdown: la somma delle voci ricostruisce sempre l intervallo', function () {
    var d = miniDict();
    ['facile', 'medio', 'difficile'].forEach(function (livello) {
      for (var lo = 0; lo <= d.size; lo++) {
        for (var hi = lo; hi <= d.size; hi++) {
          var b = d.breakdown(lo, hi, livello);
          var vive = b.voci.reduce(function (a, v) { return a + v.vive; }, 0) +
                     (b.esatta ? b.esatta.vive : 0);
          var tot = b.voci.reduce(function (a, v) { return a + v.totale; }, 0) +
                    (b.esatta ? b.esatta.totale : 0);
          eq(vive, b.vive, 'vive [' + lo + ',' + hi + ') ' + livello);
          eq(tot, b.totale, 'totali [' + lo + ',' + hi + ') ' + livello);
        }
      }
    });
  });

  test('breakdown: lettere assenti dal livello facile restano visibili a zero', function () {
    var d = miniDict();
    var b = d.breakdown(0, d.size, 'facile');
    // abaco e zuzzurellone sono tier 2, zebra tier 1: nel livello facile la
    // z sparisce del tutto e la a resta con il solo "albero".
    eq(voce(b, 'z').totale, 0, 'la z non ha parole facili');
    eq(voce(b, 'z').stato, 'dentro', 'ma è comunque dentro il campo');
    eq(voce(b, 'a').totale, 1, 'solo albero');
    eq(b.voci.length, 26);
  });

  test('breakdown: stato di ogni lettera rispetto al campo', function () {
    var d = miniDict();
    // [2,4) = casa, cena: il campo è tutta e sola la c.
    var b = d.breakdown(0, d.size, 'difficile');
    eq(voce(b, 'a').stato, 'dentro');
    var c = d.breakdown(2, 4, 'difficile');
    // il prefisso comune di casa e cena è "c": si è già sceso di un livello
    eq(c.prefisso, 'c');
    eq(voce(c, 'a').stato, 'dentro', 'casa');
    eq(voce(c, 'e').stato, 'dentro', 'cena');
    eq(voce(c, 'a').vive, 1);
    eq(voce(c, 'e').vive, 1);
  });

  test('breakdown: estremo esattamente sul confine di una lettera', function () {
    var d = miniDict();
    // [2,4) in cima all'alfabeto: lo cade esattamente dove comincia la c e
    // hi esattamente dove finisce. Nessuna lettera deve risultare "a metà".
    var lo = d.lowerBound('c');
    var hi = d.lowerBound('p');
    eq(lo, 2); eq(hi, 4);
    // forzo la lettura al primo livello passando un intervallo che tocca
    // due lettere diverse: casa..cena resterebbe dentro la c.
    var b = d.breakdown(lo, d.size, 'difficile');
    eq(b.prefisso, '', 'da casa a zuzzurellone il prefisso comune è vuoto');
    eq(voce(b, 'a').stato, 'prima', 'la a è tutta prima del campo');
    eq(voce(b, 'b').stato, 'prima', 'anche la b, che è vuota');
    eq(voce(b, 'c').stato, 'dentro', 'la c comincia esattamente sul confine');
    eq(voce(b, 'z').stato, 'dentro');
    eq(voce(b, 'c').vive, 2);
    eq(voce(b, 'a').vive, 0);
  });

  test('breakdown: il campo dentro una sola lettera scende di livello', function () {
    var d = miniDict();
    // pera(4) pero(5) però(6) persona(7) pesca(8) -> prefisso comune "pe"
    var b = d.breakdown(4, 9, 'difficile');
    eq(b.prefisso, 'pe');
    eq(b.profondita, 2);
    eq(b.voci.length, 2, 'sotto il primo livello restano solo le lettere reali');
    eq(voce(b, 'r').totale, 4, 'pera pero però persona');
    eq(voce(b, 's').totale, 1, 'pesca');
    eq(voce(b, 'r').vive, 4);
    eq(voce(b, 's').vive, 1);

    // Ancora più stretto: pera..persona, tutte sotto "per".
    var c = d.breakdown(4, 8, 'difficile');
    eq(c.prefisso, 'per');
    eq(c.profondita, 3);
    eq(voce(c, 'a').totale, 1, 'pera');
    eq(voce(c, 'o').totale, 2, 'pero e però: l accento non fa lettera a sé');
    eq(voce(c, 's').totale, 1, 'persona');
    eq(voce(c, 's').stato, 'dentro');
  });

  test('breakdown: la parola che è esattamente il prefisso ha una voce sua', function () {
    // "re" è prefisso di "rea": non ha una lettera successiva e finirebbe
    // fuori da ogni casella se non la si contasse a parte.
    var d = new AZ.Dizionario(['re', 'rea', 'reale', 'rete'], [0, 0, 0, 0]);
    var b = d.breakdown(0, 4, 'difficile');
    eq(b.prefisso, 're');
    assert(b.esatta, 'ci deve essere la voce della parola esatta');
    eq(b.esatta.parola, 're');
    eq(b.esatta.totale, 1);
    eq(b.esatta.stato, 'dentro');
    eq(voce(b, 'a').totale, 2, 'rea, reale');
    eq(voce(b, 't').totale, 1, 'rete');
    eq(b.voci.length + 1, 3);
  });

  test('breakdown: intervallo di una parola sola mostra l ultima scelta', function () {
    var d = miniDict();
    var b = d.breakdown(7, 8, 'difficile');   // persona
    eq(b.prefisso, 'person', 'si torna indietro di un carattere');
    eq(voce(b, 'a').vive, 1);
    eq(b.vive, 1);
  });

  test('breakdown: intervallo vuoto non esplode', function () {
    var d = miniDict();
    var b = d.breakdown(5, 5, 'difficile');
    eq(b.vive, 0);
    eq(b.profondita, 0);
  });

  test('prefixRange: il blocco di un prefisso, anche in fondo all alfabeto', function () {
    var d = miniDict();
    eq(d.prefixRange('').lo, 0);
    eq(d.prefixRange('').hi, d.size);
    var p = d.prefixRange('pe');
    eq(p.lo, 4); eq(p.hi, 9);
    var z = d.prefixRange('z');
    eq(z.lo, 9); eq(z.hi, 11, 'la z non ha una lettera dopo: si arriva in fondo');
    var vuoto = d.prefixRange('q');
    eq(vuoto.lo, vuoto.hi, 'prefisso senza parole: intervallo vuoto');
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

  test('dizionario reale (se caricato): scomposizione alfabetica coerente', function () {
    var data = root.ABACO_DATA;
    if (!data) throw new Error('SKIP: data/dizionario.js non caricato');
    var out = AZ.unpack(data.packed, data.count);
    var d = new AZ.Dizionario(out.words, out.tiers);

    var b = d.breakdown(0, d.size, 'difficile');
    eq(b.voci.length, 26);
    eq(b.voci.reduce(function (a, v) { return a + v.totale; }, 0), d.size,
       'le 26 lettere coprono tutto il vocabolario');
    assert(voce(b, 's').totale > voce(b, 'j').totale + voce(b, 'k').totale +
           voce(b, 'q').totale + voce(b, 'w').totale + voce(b, 'x').totale +
           voce(b, 'y').totale,
      'la s pesa più di j k q w x y messe insieme');

    // Ogni parola deve cadere nella casella della propria iniziale, accenti
    // compresi: "élite" sta sotto la e, non in una lettera tutta sua.
    b.voci.forEach(function (v) {
      for (var i = v.lo; i < v.hi; i++) {
        var iniziale = d.words[i][0].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (iniziale !== v.lettera) {
          throw new Error(d.words[i] + ' è finita nella casella ' + v.lettera);
        }
      }
    });

    // Discesa di livello su un intervallo stretto e vero.
    var lo = d.lowerBound('recita');
    var hi = d.lowerBound('recluta');
    var r = d.breakdown(lo, hi, 'difficile');
    eq(r.prefisso, 'rec');
    eq(r.vive, d.countRange(lo, hi, 'difficile'));
    eq(r.voci.reduce(function (a, v) { return a + v.vive; }, 0) +
       (r.esatta ? r.esatta.vive : 0), r.vive);
    assert(r.voci.length >= 2 && r.voci.length < 26,
      'sotto "rec" restano solo le lettere che esistono davvero');
    assert(r.voci.some(function (v) { return v.stato === 'parziale'; }),
      'la lettera che contiene un estremo è a metà');

    // 26 lowerBound per chiamata: deve restare istantaneo anche a 83.362.
    var t0 = Date.now();
    for (var k = 0; k < 100; k++) d.breakdown(0, d.size, 'difficile');
    assert(Date.now() - t0 < 2000, 'breakdown troppo lento: niente scansioni');
  });

  root.AZ_TESTS = { results: results };
})(typeof window !== 'undefined' ? window : globalThis);
