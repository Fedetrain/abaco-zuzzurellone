# Piano pubblicitario — Abaco Zuzzurellone

Documento operativo: **dove** stanno gli annunci, **perché** stanno lì, **cosa
fare** per accenderli e **come** far salire l'incasso. Il codice che li serve è
`assets/ads.js`: finché `ABACO_ADS.client` è vuoto il sito non carica nulla e
non mette nessun cookie.

---

## 1. Le tre posizioni, e perché sono quelle

| # | Posizione | Dove | Quando si vede | Perché rende |
|---|---|---|---|---|
| **A** | `data-ad="home"` | Home, sotto il selettore di livello | All'arrivo, prima di scegliere la modalità | Prima impressione di ogni sessione. Alta *viewability* perché la home è corta e l'utente ci sosta a scegliere il livello. |
| **B** | `data-ad="end"` | Schermata del risultato, fra le statistiche e i pulsanti | A fine partita | **È il riquadro che vale di più.** L'utente si è appena fermato, sta leggendo il suo punteggio, e la posizione è naturale — non interrompe niente. Una partita dura 1–3 minuti: questo slot si ricarica spesso. |
| **C** | `data-ad="guida"` | In fondo alla Guida | Quando si legge come si gioca | È l'unica pagina con testo lungo. Gli annunci accanto a contenuto editoriale prendono offerte più alte di quelli accanto a un gioco, e la Guida è anche la pagina che porta traffico da Google. |

### Dove **non** ci sono, di proposito

- **Mai dentro la partita** (`#screen-play`). Un annuncio accanto al campo di
  testo produce click accidentali: Google li classifica come *traffico non
  valido*, li scala dai guadagni e, se sono tanti, chiude l'account. Ed è il
  modo più veloce per far chiudere la scheda a chi sta giocando.
- **Niente interstiziali a schermo intero, niente pop-up, niente autoplay.**
  Su un gioco di parole fanno crollare le partite per sessione, che è la
  metrica da cui dipende tutto il resto.
- **Niente annunci sopra la piega nella schermata di gioco.** La regola AdSense
  è che il contenuto deve restare la cosa principale.

---

## 2. Cosa fare, in ordine

### Passo 1 — mettere il sito online con un dominio proprio
AdSense rifiuta i sottodomini gratuiti generici. `abacozuzzurellone.site` va
benissimo. → vedi `docs/PUBBLICARE.md`.

### Passo 2 — le pagine che AdSense pretende
Sono già nel repository:
- `privacy.html` — informativa privacy e cookie, linkata nel footer di ogni pagina ✅
- la **Guida** — contenuto originale e sostanziale ✅
- contatto (issue GitHub, nella privacy) ✅

### Passo 3 — creare l'account
1. <https://adsense.google.com> → *Inizia*, con l'account Google che vuoi usare per gli incassi.
2. Sito: `abacozuzzurellone.site`.
3. Paese **Italia**, tipo di account: *Individuale* (o *Azienda* se hai partita IVA).
4. Inserisci **IBAN** e dati fiscali (modulo fiscale USA: da compilare, sei
   residente fuori dagli USA → nessuna ritenuta).

### Passo 4 — verificare la proprietà del sito
AdSense dà uno snippet come:

```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX" crossorigin="anonymous"></script>
```

**Non incollarlo a mano nell'HTML.** Basta scrivere il tuo `ca-pub-…` in
`assets/ads.js`:

```js
window.ABACO_ADS = {
  client: 'ca-pub-XXXXXXXXXXXXXXXX',
  slots: { home: '', end: '', guida: '' },
};
```

Da quel momento `ads.js` carica lo script da solo su tutte le pagine, ed è
quello che serve alla verifica. Fai commit e push: GitHub Pages pubblica in
un paio di minuti, poi premi *Verifica* in AdSense.

> L'approvazione richiede in genere **da qualche giorno a due settimane**.
> Finché non arriva, i riquadri restano vuoti: è normale.

### Passo 5 — creare le tre unità pubblicitarie
In AdSense → **Annunci → Per unità pubblicitaria → Display**. Creane **tre**,
tutte *Responsive*, chiamandole `home`, `end`, `guida`. Ogni unità ti dà un
`data-ad-slot` numerico. Copiali in `assets/ads.js`:

```js
slots: { home: '1234567890', end: '2345678901', guida: '3456789012' },
```

Tre unità separate e non una sola: è l'unico modo per vedere nei report
**quale posizione rende** e spostare i soldi di conseguenza.

### Passo 6 — il consenso (obbligatorio in Italia)
In AdSense → **Privacy e messaggistica → Normativa UE**: attiva il messaggio
di consenso di Google (è una CMP certificata IAB TCF). Google lo mostra da
solo agli utenti europei prima di caricare gli annunci. **Non serve scrivere
un banner cookie a mano** — quello di Google è certificato, il tuo no.

### Passo 7 — `ads.txt`
Apri `ads.txt` nella radice del repository, togli il `#` dall'ultima riga e
metti il tuo id:

```
google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
```

È una riga sola e vale parecchi soldi: senza, molti acquirenti non fanno
offerte sul tuo inventario e AdSense mostra un avviso permanente.

### Passo 8 — Auto ads: attivare solo l'áncora
In AdSense → **Annunci → Per sito → Modifica**: lascia gli Auto ads
**disattivati** tranne il formato **Anchor** (banner ancorato in basso su
mobile). È l'unico formato automatico che non rischia di piazzarsi dentro la
partita. Tutto il resto lo controlli tu con i tre riquadri manuali.

---

## 3. Come far salire l'incasso

L'incasso è, letteralmente:

```
guadagno = visite × pagine per visita × annunci visibili per pagina × RPM
```

Le leve, in ordine di quanto rendono per il lavoro che costano:

**1. Traffico (la leva che conta più di tutte).**
Con 100 visite al giorno si parla di pochi euro al mese, con 10.000 di
qualche centinaio. Tutto il resto è ottimizzazione al margine.
- La **Guida** è la pagina che può posizionarsi su Google: contiene già le
  parole che la gente cerca («gioco di parole italiano», «ordine alfabetico»,
  «prima o dopo»). Aggiungere articoli brevi (`/come-si-gioca`, `/la-parola-più-lunga`)
  moltiplica le porte d'ingresso.
- Il **pulsante Condividi** produce già un testo alla Wordle con il link:
  è la fonte di traffico gratuito migliore che hai. Vale la pena renderlo più
  visibile a fine partita.
- Il **gioco del giorno** (stessa parola per tutti, ogni giorno) è la singola
  feature che più fa tornare la gente. Wordle è cresciuto su quella.

**2. Sessioni più lunghe.**
Ogni partita finita = un'impression del riquadro B. Il pulsante *Ancora* è
già lì di fianco: chi ne fa cinque di fila vale cinque volte tanto.

**3. Il momento giusto, non il numero.**
Tre riquadri ben piazzati rendono più di sei che infastidiscono: gli annunci
in eccesso fanno scendere il CTR di tutti, e con il CTR scende il prezzo.
Non aggiungerne altri prima di aver visto i report.

**4. Le stagioni.**
L'RPM in Italia oscilla molto: dicembre (Natale) vale il doppio di gennaio.
Se hai una spinta promozionale da fare, falla a novembre.

**5. Leggere i report ogni mese.**
AdSense → *Report → Unità pubblicitarie*. Guarda **RPM per unità**. Se il
riquadro `home` rende un terzo di `end`, sposta l'attenzione: magari va tolto
dalla home e messo in fondo alle Statistiche.

### Aspettative oneste

| Visite al giorno | Guadagno indicativo al mese |
|---|---|
| 100 | 1 – 5 € |
| 1 000 | 10 – 50 € |
| 10 000 | 100 – 500 € |

L'RPM tipico per un gioco in italiano è **0,50 – 2,00 €** ogni mille
visualizzazioni di pagina. La soglia di pagamento AdSense è **70 €**: sotto
quella, l'accumulo resta sul conto.

---

## 4. Alternative, se AdSense non approva o rende poco

- **Ezoic** — accetta siti piccoli, ottimizza i posizionamenti da solo, RPM
  spesso più alto di AdSense puro. In cambio prende una fetta e appesantisce
  il sito.
- **Google Ad Manager** — solo se un giorno il traffico diventa serio.
- **Ko-fi / Buy me a coffee** — un link nel footer, zero cookie, zero
  approvazioni. Su un gioco fatto bene rende sorprendentemente più di quanto
  ci si aspetti, e non appesantisce nulla.
- **Versione senza pubblicità a pagamento** — se un giorno il gioco ha un
  pubblico affezionato, è la strada che non litiga con la privacy.
