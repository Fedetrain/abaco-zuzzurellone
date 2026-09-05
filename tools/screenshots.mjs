#!/usr/bin/env node
/**
 * screenshots.mjs -- regenerates docs/*.png (the README pictures) and
 * docs/og.png (the card shown when the link is shared) by driving the real
 * game in a headless Chromium over the DevTools protocol. No dependencies:
 * Node 22 has a WebSocket, Chromium comes from Playwright's cache, Chrome or
 * the PATH (override with CHROME=/path/to/chrome).
 *
 *   node tools/screenshots.mjs            # everything
 *   node tools/screenshots.mjs og home    # a subset, by name
 *
 * Games are made deterministic by seeding Math.random before each one, so
 * the pictures come out the same every time the dictionary does not change.
 * Set ABACO_FONTS_DIR to a folder holding a fonts.css plus its .woff2 files
 * to serve the web fonts locally when the machine cannot reach Google Fonts.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs');
const FONTS_DIR = process.env.ABACO_FONTS_DIR || '';
const GOOGLE_FONTS = /https:\/\/fonts\.googleapis\.com\/css2\?[^"']*/g;

/* ------------------------------------------------------------------ browser */
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const globs = [];
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.HOME || '', '.cache', 'ms-playwright');
  if (fs.existsSync(pw)) {
    for (const d of fs.readdirSync(pw)) {
      if (d.startsWith('chromium_headless_shell')) globs.push(path.join(pw, d, 'chrome-linux', 'headless_shell'));
      if (d.startsWith('chromium-')) globs.push(path.join(pw, d, 'chrome-linux', 'chrome'), path.join(pw, d, 'chrome-mac', 'Chromium.app/Contents/MacOS/Chromium'));
    }
  }
  globs.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  for (const g of globs) if (fs.existsSync(g)) return g;
  for (const name of ['google-chrome', 'chromium', 'chromium-browser', 'chrome']) {
    try { return execSync(`command -v ${name}`, { encoding: 'utf8' }).trim(); } catch { /* next */ }
  }
  throw new Error('No Chromium found: set CHROME=/path/to/chrome');
}

/* ------------------------------------------------------------- static server */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let file = url.pathname.startsWith('/__fonts/')
      ? path.join(FONTS_DIR, url.pathname.slice('/__fonts/'.length))
      : path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    const ext = path.extname(file);
    let body = fs.readFileSync(file);
    if (ext === '.html') {
      let html = body.toString('utf8');
      if (FONTS_DIR) html = html.replace(GOOGLE_FONTS, '/__fonts/fonts.css');
      if (path.basename(file) === 'og.html') html = html.replaceAll('{{count}}', it.format(TOTAL)).replaceAll('{{optimal}}', OPTIMAL_WORD);
      body = Buffer.from(html, 'utf8');
    }
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

/* ------------------------------------------------------------------ the data */
const words = fs.readFileSync(path.join(ROOT, 'data', 'dizionario.txt'), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t')[0]);
const idx = new Map(words.map((w, i) => [w, i]));
const TOTAL = words.length;
const it = new Intl.NumberFormat('it-IT');
const coll = new Intl.Collator('it', { sensitivity: 'variant' });
const OPTIMAL = Math.ceil(Math.log2(TOTAL + 1));
const OPTIMAL_WORD = { 17: 'Diciassette', 18: 'Diciotto', 19: 'Diciannove', 20: 'Venti' }[OPTIMAL] || String(OPTIMAL);
const median = (lo, hi) => words[Math.floor((idx.get(lo) + idx.get(hi)) / 2)];
const SEED = 'Math.random=(function(){var s=20260904;return function(){s=(s*1664525+1013904223)%4294967296;return s/4294967296;};})();';

/* ------------------------------------------------------------- CDP driver */
async function withBrowser(fn) {
  const proc = spawn(findChrome(), ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=0', '--no-proxy-server', '--font-render-hinting=none', 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    proc.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\S+)/); if (m) res(m[1]); });
    proc.on('exit', () => rej(new Error('browser exited\n' + buf)));
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
    else if (m.method) for (const l of listeners) l(m);
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params) => send(method, params, sessionId);
  const on = (method, fn) => listeners.push((m) => { if (m.method === method && m.sessionId === sessionId) fn(m.params); });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  let vp = null;
  const page = {
    async viewport(width, height, scale = 1, mobile = false) {
      vp = { width, height, deviceScaleFactor: scale, mobile, screenWidth: width, screenHeight: height };
      await cdp('Emulation.setDeviceMetricsOverride', vp);
      await cdp('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    },
    async dark(on) { await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: on ? 'dark' : 'light' }] }); },
    async goto(url) { const loaded = new Promise((r) => on('Page.loadEventFired', r)); await cdp('Page.navigate', { url }); await loaded; },
    async eval(expr) {
      const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
      return r.result.value;
    },
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    async waitFor(expr, timeout = 15000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await this.eval(expr)) return; await this.wait(100); } throw new Error('timeout waiting for ' + expr); },
    /* Full page = grow the viewport to the content (viewport-sized backgrounds
       keep covering), never captureBeyondViewport, which leaves a seam. */
    async shot(name, { fullPage = false, maxHeight = 4000 } = {}) {
      const file = path.join(OUT, name + '.png');
      if (fullPage) {
        const { cssContentSize, contentSize } = await cdp('Page.getLayoutMetrics');
        const h = Math.min(Math.ceil((cssContentSize || contentSize).height), maxHeight);
        await cdp('Emulation.setDeviceMetricsOverride', { ...vp, height: h, screenHeight: h }); await this.wait(400);
      }
      const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      if (fullPage) { await cdp('Emulation.setDeviceMetricsOverride', vp); await this.wait(200); }
      console.log(`  ${name}.png  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
    },
  };
  try { return await fn(page); } finally { ws.close(); proc.kill(); }
}

/* -------------------------------------------------------------- the flows */
function flows(page, base) {
  const URL = base + '/index.html';
  const text = (sel) => page.eval(`document.querySelector('${sel}').textContent.trim()`);
  const click = (sel) => page.eval(`document.querySelector('${sel}').click(); true`);
  const bounds = async () => [await text('#bound-lo .morph-cur'), await text('#bound-hi .morph-cur')];
  const ended = () => page.eval("!document.getElementById('screen-end').hidden");
  const submit = async (form, input, w) => { await page.eval(`document.getElementById('${input}').value=${JSON.stringify(w)}; document.getElementById('${form}').requestSubmit(); true`); };
  const guess = async (w) => { await submit('form-indovina', 'input-indovina', w); await page.wait(1300); };
  const closeAlfa = async () => { if (await page.eval("getComputedStyle(document.getElementById('alfa-panel')).display !== 'none'")) { await click('#alfa-close'); await page.wait(800); } };
  const fresh = async (w, h, scale, mobile, dark) => {
    await page.viewport(w, h, scale, mobile); await page.dark(dark);
    await page.goto(URL); await page.eval('localStorage.clear(); sessionStorage.clear(); true');
    await page.goto(URL);
    await page.waitFor("document.fonts.status === 'loaded' && !document.body.hasAttribute('data-loading')");
    await page.eval(SEED); await page.wait(1200);
  };
  const start = async (mode) => { await click(`[data-mode="${mode}"]`); await page.waitFor("!document.getElementById('screen-play').hidden"); await page.wait(1200); };

  return {
    async og() {
      await page.viewport(1200, 630, 1); await page.dark(false);
      await page.goto(base + '/tools/og.html');
      await page.waitFor("document.fonts.status === 'loaded'"); await page.wait(400);
      await page.shot('og');
    },
    async home() {
      await fresh(1280, 932, 1, false, false); await page.shot('home-light');
      await fresh(1280, 932, 1, false, true); await page.shot('home-dark');
      await fresh(390, 844, 2, true, false); await page.shot('mobile-light', { fullPage: true, maxHeight: 1259 });
      await fresh(390, 844, 2, true, true); await page.shot('mobile-dark');
    },
    async indovina() {
      await fresh(1280, 900, 1, false, false); await start('indovina');
      for (let i = 0; i < 2; i++) { const [lo, hi] = await bounds(); await guess(median(lo, hi)); }
      await click('#alfa-toggle'); await page.wait(1200); await page.shot('alfabeto-aperto', { fullPage: true, maxHeight: 1120 });
      await closeAlfa();
      for (let i = 0; i < 3; i++) { const [lo, hi] = await bounds(); await guess(median(lo, hi)); }
      await page.wait(800); await page.shot('indovina-tu');
      for (let i = 0; i < 40 && !(await ended()); i++) { const [lo, hi] = await bounds(); if (idx.get(hi) - idx.get(lo) - 1 <= 7) break; await guess(median(lo, hi)); }
      await page.wait(800); await page.shot('campo-stretto');
      for (let i = 0; i < 12 && !(await ended()); i++) { const [lo, hi] = await bounds(); const n = idx.get(hi) - idx.get(lo) - 1; await guess(n <= 1 ? words[idx.get(lo) + 1] : median(lo, hi)); }
      await page.waitFor("!document.getElementById('screen-end').hidden"); await page.wait(2500);
      await page.shot('risultato', { fullPage: true, maxHeight: 1100 });
    },
    async alfabetoMobile() {
      await fresh(390, 844, 2, true, true); await start('indovina');
      for (let i = 0; i < 4; i++) { const [lo, hi] = await bounds(); await guess(median(lo, hi)); }
      await click('#alfa-toggle'); await page.wait(1200); await page.shot('alfabeto-mobile');
    },
    async computer() {
      await fresh(1280, 900, 1, false, false); await start('computer');
      await click('#cpu-start'); await page.wait(1500);
      for (let i = 0; i < 6; i++) { const w = await text('#cpu-word'); await click(`[data-answer="${coll.compare('mandarino', w) < 0 ? 'prima' : 'dopo'}"]`); await page.wait(1600); }
      await closeAlfa(); await page.wait(800); await page.shot('indovina-il-computer', { fullPage: true, maxHeight: 1130 });
    },
    async tempo() {
      await fresh(1280, 900, 1, false, false); await start('tempo');
      await click('#tempo-start'); await page.wait(1500);
      const [lo, hi] = await bounds(); const a = idx.get(lo), b = idx.get(hi);
      for (const f of [0.2, 0.5, 0.8, 0.35, 0.65]) { await submit('form-tempo', 'input-tempo', words[Math.floor(a + (b - a) * f)]); await page.wait(900); }
      await closeAlfa(); await page.wait(600); await page.shot('sfida-a-tempo');
    },
  };
}

/* -------------------------------------------------------------------- main */
const wanted = process.argv.slice(2);
const { server, base } = await serve();
try {
  await withBrowser(async (page) => {
    const all = flows(page, base);
    for (const [name, run] of Object.entries(all)) {
      if (wanted.length && !wanted.includes(name)) continue;
      console.log(name);
      await run();
    }
  });
} finally {
  server.close();
}
