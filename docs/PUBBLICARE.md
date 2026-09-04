# Mettere online il gioco

Il sito è **statico puro**: nessuna build, nessun server. Basta che i file
stiano dietro un web server qualsiasi.

---

## 1. GitHub Pages (dove sta adesso)

Il repository è già pubblicato su
<https://fedetrain.github.io/abaco-zuzzurellone/>, ramo `main`, cartella root.

Ogni `git push` sul ramo `main` ripubblica il sito in **1–2 minuti**. Non c'è
altro da fare.

Se un giorno servisse riattivarlo da zero:

```bash
gh api -X POST repos/Fedetrain/abaco-zuzzurellone/pages \
  -f "source[branch]=main" -f "source[path]=/"
```

---

## 2. Il dominio `abacozuzzurellone.site`

Nel repository c'è già il file **`CNAME`** con dentro `abacozuzzurellone.site`.
GitHub lo legge a ogni pubblicazione: è quello che dice a Pages «rispondi anche
su questo dominio».

Restano due cose da fare, una dal pannello del registrar e una da GitHub.

### 2a. DNS — su Namecheap

> Il dominio è registrato su **Namecheap** e oggi punta ancora alla loro pagina
> di parcheggio (`abacozuzzurellone.site` → `192.64.119.30`,
> `www` → `parkingpage.namecheap.com`). Finché quei record restano lì, il sito
> non si vede: vanno **cancellati**, non affiancati.

Percorso: **Namecheap → Domain List → `abacozuzzurellone.site` → Manage →
Advanced DNS**.

1. In **Host Records** cancella tutto quello che c'è (di solito una `URL
   Redirect Record` su `@` e un `CNAME` `www → parkingpage.namecheap.com`).
2. Aggiungi i cinque record della tabella qui sotto con **Add New Record**.
   In Namecheap la colonna «Nome» si chiama **Host** e il valore **Value**;
   per il dominio nudo il Host è `@`.
3. Salva con la spunta verde di ogni riga.
4. In **Domain → Nameservers** deve restare selezionato **Namecheap BasicDNS**:
   se sono impostati nameserver di terzi, l'Advanced DNS non viene letto.



Crea **cinque** record. Quattro `A` per il dominio nudo e un `CNAME` per il www:

| Tipo | Nome / Host | Valore | TTL |
|---|---|---|---|
| A | `@` | `185.199.108.153` | 3600 |
| A | `@` | `185.199.109.153` | 3600 |
| A | `@` | `185.199.110.153` | 3600 |
| A | `@` | `185.199.111.153` | 3600 |
| CNAME | `www` | `fedetrain.github.io.` | 3600 |

> Se il pannello accetta anche i record `AAAA` (IPv6), aggiungi pure
> `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`,
> `2606:50c0:8003::153`. Non sono obbligatori.

Attenzione a due errori comuni:
- il valore del CNAME è `fedetrain.github.io.` — **il nome utente**, non il
  nome del repository, e con il punto finale se il pannello lo richiede;
- niente record `A` che puntino a un parcheggio del registrar: vanno cancellati,
  altrimenti il dominio continua a mostrare la pagina pubblicitaria del venditore.

La propagazione richiede da qualche minuto a 24 ore. Si controlla così:

```bash
nslookup abacozuzzurellone.site
# devono comparire i quattro 185.199.10x.153
```

### 2b. GitHub — Settings → Pages

1. Vai su <https://github.com/Fedetrain/abaco-zuzzurellone/settings/pages>.
2. In **Custom domain** scrivi `abacozuzzurellone.site` e salva.
   (Se il file `CNAME` è già nel repository il campo risulta già compilato.)
3. Aspetta che il controllo DNS diventi verde.
4. Spunta **Enforce HTTPS**. Il certificato Let's Encrypt viene emesso da
   GitHub in automatico e può metterci fino a un'ora: se la casella è ancora
   grigia, riprova più tardi — non è un errore.

### 2c. Aggiornare gli indirizzi nel codice

Quando il dominio funziona, il link che il pulsante **Condividi** mette nel
testo va cambiato:

- `assets/app.js`, funzione `shareText()` → `var url = 'https://abacozuzzurellone.site/';`

Le meta tag `og:url`, `canonical`, `sitemap.xml` e `robots.txt` puntano già al
dominio nuovo.

---

## 3. Vercel (in alternativa, o in parallelo)

Vercel serve un sito statico senza configurazione e con CDN globale.

```bash
npm i -g vercel
cd abaco-zuzzurellone
vercel            # prima volta: crea il progetto
vercel --prod     # pubblica
```

Alle domande rispondi: framework **Other**, build command **vuoto**, output
directory **`.`** (la radice del repository).

Oppure dal sito, senza CLI: <https://vercel.com/new> → *Import Git Repository*
→ scegli `abaco-zuzzurellone` → *Deploy*.

### Dominio su Vercel

Project → **Settings → Domains** → aggiungi `abacozuzzurellone.site`. Vercel ti
darà i record da mettere nel DNS, che sono **diversi** da quelli di GitHub:

| Tipo | Nome | Valore |
|---|---|---|
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com.` |

> **Un dominio, un posto solo.** Non si possono tenere insieme i record A di
> GitHub e quelli di Vercel: scegline uno. Se passi a Vercel, cancella il file
> `CNAME` dal repository, altrimenti GitHub Pages continua a reclamare il
> dominio e il certificato HTTPS fa avanti e indietro.

**Cosa scegliere.** Per un sito statico da 1 MB le prestazioni sono
equivalenti. GitHub Pages è già configurato e non ha limiti di banda pratici
per questo traffico: non c'è motivo di spostarsi, a meno di volere le
anteprime automatiche per ogni pull request, che Vercel dà gratis.

---

## 4. Lista di controllo prima di annunciare il sito

- [ ] `https://abacozuzzurellone.site` si apre e il lucchetto è verde
- [ ] `http://` reindirizza a `https://`
- [ ] `www.abacozuzzurellone.site` funziona anche lui
- [ ] `/privacy.html`, `/robots.txt`, `/sitemap.xml`, `/ads.txt` rispondono
- [ ] il link in `shareText()` punta al dominio nuovo
- [ ] il sito è registrato su [Google Search Console](https://search.google.com/search-console)
      e la sitemap è stata inviata
- [ ] `node tools/run-tests.mjs` passa
