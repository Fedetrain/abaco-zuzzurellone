/* =========================================================================
   Abaco Zuzzurellone -- riquadri pubblicitari
   -------------------------------------------------------------------------
   Nessuna pubblicità viene caricata finché ABACO_ADS.client è vuoto: il sito
   resta pulito, e nessuno script di terze parti parte. Appena c'è un ID
   AdSense valido i riquadri si accendono da soli.

   Regole che questo file fa rispettare, e il perché:

   1. Mai un annuncio dentro la partita (#screen-play). Un click accidentale
      sopra il campo di testo è traffico non valido: AdSense lo scala dai
      guadagni e, ripetuto, chiude l'account. Ed è anche brutto giocarci.
   2. Caricamento pigro: un riquadro si riempie solo quando entra davvero
      nello schermo. Le schermate qui sono tutte nella stessa pagina, quindi
      senza questo si pagherebbe l'impression di annunci mai visti -- che
      abbassa il CTR e quindi il prezzo.
   3. Spazio riservato in anticipo: min-height sul contenitore, così quando
      l'annuncio arriva non fa saltare il testo (Cumulative Layout Shift).
   ========================================================================= */
window.ABACO_ADS = {
  /* Il tuo publisher id AdSense, tutto compreso: 'ca-pub-0000000000000000'.
     Finché è vuoto, nel sito non c'è nessuna pubblicità e nessun tracciante. */
  client: '',

  /* Gli id numerici dei tre blocchi creati in AdSense (Annunci → Per unità
     pubblicitaria → Display). Uno per posizione: servono separati per poter
     leggere nei report quale posizione rende. */
  slots: {
    home: '',    // sotto il selettore di livello, in home
    end: '',     // schermata del risultato, fra le statistiche e i pulsanti
    guida: '',   // in fondo alla guida
  },
};

(function () {
  'use strict';

  var cfg = window.ABACO_ADS;
  var slots = Array.prototype.slice.call(document.querySelectorAll('[data-ad]'));
  if (!slots.length) return;

  if (!cfg.client) return;   // non configurato: i riquadri restano nascosti

  document.documentElement.classList.add('has-ads');

  var script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' +
               encodeURIComponent(cfg.client);
  document.head.appendChild(script);

  function fill(box) {
    var name = box.dataset.ad;
    var slot = cfg.slots[name];
    if (!slot || box.dataset.filled) return;
    box.dataset.filled = '1';

    var ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', cfg.client);
    ins.setAttribute('data-ad-slot', slot);
    ins.setAttribute('data-ad-format', box.dataset.adFormat || 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');
    box.appendChild(ins);

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) { /* bloccato da un ad blocker: pazienza, il gioco funziona */ }
  }

  // Le schermate sono tutte nel DOM ma nascoste con [hidden]: un elemento
  // nascosto non interseca mai, quindi l'observer da solo basta a non
  // caricare gli annunci delle schermate che nessuno ha ancora aperto.
  if (!('IntersectionObserver' in window)) {
    slots.forEach(fill);
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      fill(e.target);
      io.unobserve(e.target);
    });
  }, { rootMargin: '200px' });
  slots.forEach(function (box) { io.observe(box); });
})();
