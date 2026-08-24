#!/usr/bin/env node
/** Node runner for tests.js -- same test file the browser page tests.html uses. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { console, Intl, Math, Set, Map, Date, Uint8Array, Int32Array, Array };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const file of ['data/dizionario.js', 'assets/core.js', 'tests.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
}

const results = sandbox.AZ_TESTS.results;
let failed = 0;
for (const r of results) {
  if (r.ok) console.log(`  PASS  ${r.name}`);
  else {
    failed += 1;
    console.log(`  FAIL  ${r.name}\n        ${r.message}`);
  }
}
console.log(`\n${results.length - failed}/${results.length} test superati`);
process.exit(failed ? 1 : 0);
