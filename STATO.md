# Stato del progetto

Aggiornato al **6 settembre 2026**. Questo file è il punto di ripresa:
cosa è fatto, cosa manca, e cosa serve sapere prima di rimetterci le mani.

**Sito live:** <https://abacozuzzurellone.site> · **Repo:** `Fedetrain/abaco-zuzzurellone`

---

## ✅ Fatto

### Una sola difficoltà (6 settembre)
- [x] **Via i tre livelli.** Niente selettore in home, niente `prefs.level`,
      niente chip nel titolo della partita. Restano **due insiemi**, ed è la
      distinzione che regge tutto il gioco:
      - **le giocabili** — 38.025 parole d'uso comune. Da qui esce la parola
        segreta, e su queste conta il numero al centro della barra.
      - **il vocabolario** — 308.012 forme. Su queste si validano le proposte,
        così nessuna parola italiana vera viene mai rifiutata.
- [x] `AZ.LIVELLI` sparito. `countRange(lo, hi)`, `nthInRange(lo, hi, n)`,
      `medianIndex(lo, hi)`, `breakdown(lo, hi)`, `dailyIndex(dict, key)`:
      tutte senza il parametro livello. Il `Dizionario` tiene **un solo**
      array cumulativo invece di tre (3 MB di `Int32Array` → 1,2 MB).
- [x] **Una parola del giorno**, non tre. Lo stato salvato è
      `prefs.daily = { key, partita }`; i salvataggi della vecchia forma a tre
      livelli vengono buttati invece che letti male (`state()` controlla
      `'partita' in prefs.daily`). In home una pastiglia sola, con lo stato
      scritto a parole.
- [x] Numeri della home e della guida riallineati: prima la home prometteva
      «18 mosse per 257.359 parole» mentre in partita l'ottimale diceva 16.
      Ora `.g-count` = giocabili, `.g-total` = vocabolario, `.g-opt` =
      `⌈log₂(giocabili+1)⌉`, e vengono tutti dallo stesso posto.

### Il dizionario: 257.361 → 308.012 parole (6 settembre)
- [x] **Bug del flag `È`.** Il `.aff` di LibreItalia 5.1.0 marca quattro lemmi
      con il flag `È` e poi **non definisce nessuna tabella `È`**: `sedere`,
      `possedere`, `risedere`, `soprassedere` uscivano dall'espansione senza
      nessuna coniugazione. «sedete» e «possediamo» non esistevano.
      `tools/unmunch.mjs` ora aliasa `È` → `B` (il paradigma regolare in -ere);
      le forme con dittongo (`siedo`, `possiede`…) stanno in `extra-words.txt`.
- [x] **Chiusura dei paradigmi.** L'attestazione nel corpus è per-forma, quindi
      accettava `bellissima` e rifiutava `bellissime`. Ora, quando una forma di
      un quartetto genere/numero è attestata, le altre tre entrano — **purché
      le generi il `.aff`**, che è ciò che tiene fuori le desinenze inventate.
      **+50.615 parole.**
- [x] `extra-words.txt` cresciuto a mano con parole vere che lo stem list del
      2020 non ha: `altronde`, `bruschetta`, `chattare`, `droide`, `ketamina`…

### Bug e pulizia (6 settembre)
- [x] `renderResult` era una catena di `if` con un `else` appeso a uno solo di
      loro: il conto alla rovescia del giorno restava acceso o si spegneva a
      seconda di quale ramo capitava per ultimo. Ora è una **mappa di viste**
      per modalità, con lo stato comune deciso una volta sola.
- [x] Il click sulla barra e il pulsante «apri l'alfabeto» scrivevano
      preferenze diverse: aprivi dalla barra, tornavi, ed era di nuovo chiuso.
- [x] Il fuoco sul campo di testo veniva rubato anche quando, ripresa una
      partita del giorno già chiusa, si era ormai sulla schermata del risultato.
- [x] `Field.init` chiamava `normalize('NFD')` su tutte le parole del
      vocabolario all'avvio; ora solo sulle poche iniziali accentate.
- [x] `computeTicks` aveva due rami identici, il primo irraggiungibile.
- [x] `azzera` le statistiche chiedeva conferma a nessuno: ora è a due tempi
      (`azzera` → `sicuro?`, che scade da solo in 4 secondi).
- [x] `done` e `vinta` nella partita del giorno erano lo stesso booleano
      scritto due volte, e il ramo «lasciata» era codice morto.

### Il dizionario (agosto/settembre)
- [x] **Il bug grosso è chiuso.** Il gioco diceva che `casa`, `cani`, `mangio`,
      `pizza`, `libro`, `albero` non esistevano: il `.dic` di Hunspell è una lista
      di **lemmi**, e i lemmi italiani non sono le parole che si digitano.
- [x] `tools/unmunch.mjs` applica le regole di affissazione (`.aff`) e interseca
      i ~3 milioni di forme generate con il corpus OpenSubtitles.
- [x] Scoperto e documentato: le liste `napolux/paroleitaliane` (280k, 660k)
      **non sono usabili** come vocabolario — sono state ripulite sottraendo un
      elenco di cognomi, e con i cognomi sono sparite `casa`, `cane`, `mare`,
      `albero`. Vale per tutte le taglie.

### Bug corretti (agosto/settembre)
- [x] `formatNumber` non raggruppava i numeri a 4 cifre.
- [x] Il campo si **congelava per sempre** cambiando scheda a metà mossa
      (`requestAnimationFrame` non gira in background).
- [x] `nthOfLevel` scandiva l'intervallo linearmente: 250k iterazioni per mossa.
- [x] La `Map` da 257k voci costava ~150 ms a ogni caricamento.
- [x] La sfida a tempo sceglieva gli estremi contando parole grezze.
- [x] Accordo di numero: «1 parole trovate» e «Restano 1 parole».
- [x] Sottolineature e colore `:visited` ereditati sui link di `privacy.html`.

### La barra del campo
- [x] Il gradiente è dipinto nello spazio della **traccia**.
- [x] Le due zone escluse sono tinte blu (prima) e rosso (dopo).
- [x] Hairline allineate alle lettere della scala, al posto della griglia al 4%.
- [x] Merge del lavoro di una sessione parallela: normalizzazione **NFC**
      dell'input, estremi che mostrano le **parole dette**, scala su due righe.

### Contenuti e funzioni
- [x] **Parola del giorno** — una al giorno, uguale per tutti fino a mezzanotte
      italiana. Seme = data, nessun server. Un tentativo, con ripresa dopo un F5.
      Streak 🔥 e conto alla rovescia alla prossima.
- [x] **Guida** riscritta: indice, turno passo per passo, come leggere la barra
      elemento per elemento, strategia, FAQ.
- [x] **`guida.html`** come pagina vera: URL, `<title>` e meta description
      mirati, dati strutturati FAQ, in sitemap. È **generata** da
      `tools/build-guide.mjs`, non scritta a mano.
- [x] **Condividi** promosso a pulsante principale, con `navigator.share`.
- [x] 38 test, verdi (`node tools/run-tests.mjs`).

### Online
- [x] Dominio `abacozuzzurellone.site` attivo, **HTTPS** attivo,
      `http://` → `https://`, `www` → dominio nudo, `github.io` → dominio.
- [x] `privacy.html`, `robots.txt`, `sitemap.xml`, `ads.txt`,
      `manifest.webmanifest`, Open Graph, dati strutturati.
- [x] Tre riquadri pubblicitari (`home`, `end`, `guida`), mai dentro la partita.
- [x] Publisher id AdSense `ca-pub-9010134003844365` in `assets/ads.js` e in
      `ads.txt`; lo script di verifica è live su tutte le pagine.

---

## ⏳ Da fare — in ordine di priorità

### 0. Guardare il gioco davvero
- [ ] **Le schermate non sono state riviste a occhio dopo il 6 settembre**:
      l'estensione Chrome non era collegata e Edge headless non ha prodotto
      screenshot. La lezione di metodo qui sotto vale ancora: apri
      `index.html`, gioca una partita per modalità e guarda.
      In particolare: la chiusa della home (`.hero-foot`, che ha preso il posto
      del selettore di livello) e la pastiglia della parola del giorno.

### 1. AdSense (bloccato sull'approvazione)
- [ ] **Aggiungere il sito** in AdSense → *Siti → Aggiungi sito*:
      `abacozuzzurellone.site`, senza `https://` e senza `www`.
- [ ] Aspettare l'approvazione (da pochi giorni a due settimane).
- [ ] Creare **tre unità Display responsive** chiamate `home`, `end`, `guida` e
      incollare i tre numeri in `slots` dentro `assets/ads.js`.
      Finché sono vuote i riquadri restano chiusi: nessun buco grigio in pagina.
- [ ] **Privacy e messaggistica → Normativa UE**: attivare il messaggio di
      consenso di Google (CMP certificata IAB TCF).
- [ ] **Annunci → Per sito → Modifica**: Auto ads spenti tranne **Anchor**.
- [ ] ⚠️ **AdMob non è utilizzabile**: è per app native. Per un sito è AdSense.

### 2. Farsi trovare
- [ ] Registrare il sito su [Google Search Console](https://search.google.com/search-console)
      e inviare `sitemap.xml`.
- [ ] Registrarlo anche su Bing Webmaster Tools.
- [ ] Screenshot aggiornati in `docs/` — quelli attuali sono della versione di
      agosto, **col selettore di livello che non esiste più**.
- [ ] Immagine Open Graph dedicata (ora punta a `docs/home-dark.png`, vecchio).

### 3. Idee, in ordine di quanto porterebbero
- [ ] **Notifica/promemoria della parola del giorno**.
- [ ] **Archivio**: rigiocare le parole dei giorni passati.
- [ ] **Modalità a due sullo stesso telefono**, con passaggio del dispositivo.
- [ ] Qualche pagina di contenuto in più (`/la-parola-piu-lunga`,
      `/perche-abaco-e-zuzzurellone`): sono porte d'ingresso da Google.
- [ ] Service worker per giocare davvero offline dopo la prima visita.

---

## ⚠️ Trappole da ricordare

**GitHub Pages può smettere di pubblicare in silenzio.** Toccare
*Settings → Pages* può far passare `build_type` da `legacy` a `workflow`; senza
un file in `.github/workflows/` i push non pubblicano più, **senza nessun errore
e senza nessun run**. Diagnosi e rimedio:

```bash
gh api repos/Fedetrain/abaco-zuzzurellone/pages --jq .build_type
gh api -X PUT repos/Fedetrain/abaco-zuzzurellone/pages \
  -f build_type=legacy -f "source[branch]=main" -f "source[path]=/"
gh api -X POST repos/Fedetrain/abaco-zuzzurellone/pages/builds
```

**`guida.html` è generata, non scritta.** Se modifichi la guida dentro
`index.html`, rigenera — altrimenti la pagina che Google indicizza diverge:

```bash
node tools/build-guide.mjs
```

**Il `.aff` italiano ha flag dichiarati e mai definiti.** `È` era uno di
quelli, e costava quattro verbi interi. Se un giorno si aggiorna il dizionario,
ricontrolla: lo script che li trova è tre righe (leggi i flag usati nel `.dic`,
sottrai quelli con una tabella nel `.aff`).

**La cache di GitHub Pages è di 10 minuti** (`Cache-Control: max-age=600`).
Dopo un deploy il browser può ancora servire il vecchio `app.js`.

**Non mettere mai un annuncio dentro `#screen-play`.** Un click accidentale
accanto al campo di testo è traffico non valido: AdSense lo scala dai guadagni e,
ripetuto, chiude l'account.

**Il DNS è su Namecheap**, quattro record `A` verso `185.199.108–111.153` più un
`CNAME` `www → fedetrain.github.io.`. Il file `CNAME` nel repo va tenuto.

**Lezione di metodo (confermata due volte):** i bug di questa app si trovano
**guardando**, non leggendo il codice. Il conteggio congelato in scheda in
secondo piano è saltato fuori solo perché la barra non si muoveva in uno
screenshot.

---

## Comandi utili

```bash
node tools/run-tests.mjs        # 38 test, girano anche in browser (tests.html)
node tools/build-guide.mjs      # rigenera guida.html da index.html
node tools/fetch-sources.mjs    # riscarica le liste sorgente (git-ignored)
node tools/build-dictionary.mjs # ricostruisce data/dizionario.{txt,js}
```
