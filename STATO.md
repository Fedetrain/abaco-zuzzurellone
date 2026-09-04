# Stato del progetto

Aggiornato al **4 settembre 2026, sera**. Questo file è il punto di ripresa:
cosa è fatto, cosa manca, e cosa serve sapere prima di rimetterci le mani.

**Sito live:** <https://abacozuzzurellone.site> · **Repo:** `Fedetrain/abaco-zuzzurellone`

---

## ✅ Fatto

### Il dizionario
- [x] **Il bug grosso è chiuso.** Il gioco diceva che `casa`, `cani`, `mangio`,
      `pizza`, `libro`, `albero` non esistevano: il `.dic` di Hunspell è una lista
      di **lemmi**, e i lemmi italiani non sono le parole che si digitano.
- [x] `tools/unmunch.mjs` applica le regole di affissazione (`.aff`) e interseca
      i ~3 milioni di forme generate con il corpus OpenSubtitles: si tiene solo
      ciò che qualcuno ha davvero scritto.
- [x] **83.362 → 257.361 → 267.689 parole.** 1,1 MB, 360 KB gzip. Facile 5.469, medio 38.106.
- [x] Le forme che i sottotitoli non usano mai («affermavamo», «visiteremmo»)
      ora entrano se stanno in **entrambe** le liste napolux *e* il lemma è
      una parola comune (≥ 100 occorrenze): +9.953 flessioni, niente mostri.
- [x] **`sedere` e `possedere` non avevano nessuna coniugazione**: il `.dic`
      li marca con il flag `È`, che l'`.aff` di LibreOffice non definisce.
      `tools/aff-patch.txt` lo definisce: `siedo`, `possiede`, `sedevo`, `possederà`.
- [x] `tools/extra-words.txt` accetta i flag Hunspell (`bruschetta/Q` → bruschette)
      e il tier è facoltativo. 197 voci controllate su Treccani/Zingarelli:
      `bruschetta`, `iddio`, `boh`, `tantomeno`, `addirsi`, `ridammi`, `app`,
      `spritz`, `apericena`, `caffelatte`, `tagliaerba`, `phon`, `chignon`…
- [x] `tools/fetch-sources.mjs` era troncato (errore di sintassi): non si poteva
      più ricostruire il dizionario da zero.
- [x] Scoperto e documentato: le liste `napolux/paroleitaliane` (280k, 660k)
      **non sono usabili** come vocabolario — sono state ripulite sottraendo un
      elenco di cognomi, e con i cognomi sono sparite `casa`, `cane`, `mare`,
      `albero`. Vale per tutte le taglie.

### Bug corretti
- [x] `formatNumber` non raggruppava i numeri a 4 cifre: «5919» accanto a «13.636».
- [x] Il campo si **congelava per sempre** cambiando scheda a metà mossa
      (`requestAnimationFrame` non gira in background e nient'altro scriveva lo stato).
- [x] `nthOfLevel` scandiva l'intervallo linearmente: 250k iterazioni per mossa.
- [x] La `Map` da 257k voci costava ~150 ms a ogni caricamento per quello che
      `lowerBound` già rispondeva.
- [x] La sfida a tempo sceglieva gli estremi contando parole grezze
      («intervenite → inventa», 1500 flessioni della stessa radice). Ora conta
      parole comuni: «bui → cadavere», «svaniti → svolgono».
- [x] Accordo di numero: «1 parole trovate» e «Restano 1 parole» comparivano
      alla fine di ogni intervallo stretto.
- [x] Sottolineature e colore `:visited` ereditati sui link di `privacy.html` e
      `guida.html`, dove il gioco usa `<button>`.
- [x] La scala del campo mostrava lo stesso prefisso in due posti («gravita»,
      «gravità», «gravita»): tagliati a sette lettere, «gravita» e «gravitano»
      coincidono. Ora il taglio si allunga finché i prefissi sono tutti diversi.

### La barra del campo
- [x] Il gradiente è dipinto nello spazio della **traccia**: un campo stretto
      mantiene il colore di *dove sta*, non riparte dal blu di abaco.
- [x] Le due zone escluse sono tinte blu (prima) e rosso (dopo).
- [x] Via la griglia fissa al 4% — non voleva dire niente; al suo posto hairline
      allineate alle lettere della scala.
- [x] Merge del lavoro di una sessione parallela: normalizzazione **NFC**
      dell'input, estremi che mostrano le **parole dette** (`casa`, non `casacca`),
      scala dell'alfabeto **su due righe**.

### Contenuti e funzioni
- [x] **Parola del giorno** — tre parole al giorno, una per livello, uguali per
      tutti fino a mezzanotte italiana. Seme = data, nessun server. Un tentativo
      a testa, con ripresa dopo un F5. Streak 🔥, tre pallini di stato in home,
      conto alla rovescia alla prossima.
- [x] **Guida** riscritta: indice, turno passo per passo, come leggere la barra
      elemento per elemento, strategia, FAQ.
- [x] **`guida.html`** come pagina vera: URL, `<title>` e meta description
      mirati, dati strutturati FAQ, in sitemap, linkata da tutti i footer.
      È **generata** da `tools/build-guide.mjs`, non scritta a mano.
- [x] **Condividi** promosso a pulsante principale, con `navigator.share` sul
      telefono.
- [x] 38 test, verdi (`node tools/run-tests.mjs`).

### Online
- [x] Dominio `abacozuzzurellone.site` attivo, **HTTPS** attivo,
      `http://` → `https://`, `www` → dominio nudo, `github.io` → dominio.
- [x] `privacy.html`, `robots.txt`, `sitemap.xml`, `ads.txt`,
      `manifest.webmanifest`, Open Graph, dati strutturati.
- [x] Tre riquadri pubblicitari (`home`, `end`, `guida`), mai dentro la partita.
- [x] Publisher id AdSense `ca-pub-9010134003844365` in `assets/ads.js` e in
      `ads.txt`; lo script di verifica è live su tutte le pagine.
- [x] **Immagine Open Graph dedicata**, `docs/og.png` (1200×630): è quella che
      compare quando si condivide il link, su `index.html` e `guida.html`.
- [x] **Screenshot rifatti** con la versione attuale, e riproducibili:
      `node tools/screenshots.mjs` guida il gioco vero in un Chromium headless
      (partite deterministiche, seme fisso) e riscrive `docs/*.png` e `og.png`.

---

## ⏳ Da fare — in ordine di priorità

### 1. AdSense (bloccato sull'approvazione)
- [ ] **Aggiungere il sito** in AdSense → *Siti → Aggiungi sito*:
      `abacozuzzurellone.site`, senza `https://` e senza `www`.
      *(Prima non funzionava perché il dominio non rispondeva ancora.)*
- [ ] Aspettare l'approvazione (da pochi giorni a due settimane).
- [ ] Creare **tre unità Display responsive** chiamate `home`, `end`, `guida` e
      incollare i tre numeri in `slots` dentro `assets/ads.js`.
      Finché sono vuote i riquadri restano chiusi: nessun buco grigio in pagina.
- [ ] **Privacy e messaggistica → Normativa UE**: attivare il messaggio di
      consenso di Google (CMP certificata IAB TCF). Non serve un banner a mano.
- [ ] **Annunci → Per sito → Modifica**: Auto ads spenti tranne **Anchor**.
- [ ] ⚠️ **AdMob non è utilizzabile**: è per app native. Per un sito è AdSense.

### 2. Farsi trovare
- [ ] Registrare il sito su [Google Search Console](https://search.google.com/search-console)
      e inviare `sitemap.xml`.
- [ ] Registrarlo anche su Bing Webmaster Tools (due minuti, traffico in più).

### 3. Idee, in ordine di quanto porterebbero
- [ ] **Notifica/promemoria della parola del giorno** — anche solo un invito a
      mettere il sito in home schermata.
- [ ] **Classifica del giorno** senza account (solo locale, «hai fatto meglio
      del tuo record»).
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
e senza nessun run**. È già successo oggi. Diagnosi e rimedio:

```bash
gh api repos/Fedetrain/abaco-zuzzurellone/pages --jq .build_type
gh api -X PUT repos/Fedetrain/abaco-zuzzurellone/pages \
  -f build_type=legacy -f "source[branch]=main" -f "source[path]=/"
gh api -X POST repos/Fedetrain/abaco-zuzzurellone/pages/builds
```

**Gli screenshot e `og.png` sono generati.** Dopo una modifica visibile o un
cambio del dizionario, `node tools/screenshots.mjs` (serve un Chromium: quello
di Playwright, Chrome, o `CHROME=/percorso`). Se la macchina non raggiunge
Google Fonts, `ABACO_FONTS_DIR` punta a una cartella con `fonts.css` e i
`.woff2` scaricati a mano.

**`guida.html` è generata, non scritta.** Se modifichi la guida dentro
`index.html`, rigenera — altrimenti la pagina che Google indicizza diverge:

```bash
node tools/build-guide.mjs
```

**La cache di GitHub Pages è di 10 minuti** (`Cache-Control: max-age=600`).
Dopo un deploy il browser può ancora servire il vecchio `app.js`: per verificare
davvero, ricarica forzato o `curl` con una query string a caso.

**Non mettere mai un annuncio dentro `#screen-play`.** Un click accidentale
accanto al campo di testo è traffico non valido: AdSense lo scala dai guadagni e,
ripetuto, chiude l'account.

**Il DNS è su Namecheap**, quattro record `A` verso `185.199.108–111.153` più un
`CNAME` `www → fedetrain.github.io.`. Il file `CNAME` nel repo va tenuto.

---

## Comandi utili

```bash
node tools/run-tests.mjs        # 38 test, girano anche in browser (tests.html)
node tools/build-guide.mjs      # rigenera guida.html da index.html
node tools/screenshots.mjs      # rifà docs/*.png e docs/og.png con un Chromium headless
node tools/fetch-sources.mjs    # riscarica le liste sorgente (git-ignored)
node tools/build-dictionary.mjs # ricostruisce data/dizionario.{txt,js}
```
