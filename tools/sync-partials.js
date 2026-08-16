#!/usr/bin/env node
/**
 * sync-partials.js - Intellivra Global
 *
 * OPTIONAL maintenance helper. The site needs no build step: every .html file
 * in the repo is complete, standalone and works when opened directly. This
 * script only keeps the repeated chunks (inlined critical CSS, shared <head>
 * assets, header, footer) identical across pages.
 *
 * Each page marks a managed region like this:
 *
 *   <!-- @sync:header -->    ... generated ...    <!-- @sync:end -->
 *
 * Run after editing tools/partials/* or assets/css/critical.css:
 *
 *   node tools/sync-partials.js          # rewrite pages
 *   node tools/sync-partials.js --check  # fail if any page is stale (CI)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PARTIALS = path.join(__dirname, 'partials');
const CHECK = process.argv.includes('--check');

const PAGES = [
  'index.html',
  'services.html',
  'industries.html',
  'about.html',
  'careers.html',
  'contact.html',
  'search.html',
  '404.html',
];

const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const blocks = {
  critical: () =>
    '<style id="critical">\n' + read(path.join(ROOT, 'assets', 'css', 'critical.css')).trim() + '\n</style>',
  'head-assets': () => read(path.join(PARTIALS, 'head-assets.html')).trim(),
  header: () => read(path.join(PARTIALS, 'header.html')).trim(),
  footer: () => read(path.join(PARTIALS, 'footer.html')).trim(),
};

/** Mark the nav link for the current page. */
function markCurrent(html, page) {
  const target = page === '404.html' ? null : page;
  return html.replace(/<a href="([a-z0-9-]+\.html)"( class="[^"]*")?>/g, (match, href, cls) =>
    href === target ? `<a href="${href}"${cls || ''} aria-current="page">` : match
  );
}

let stale = 0;

for (const page of PAGES) {
  const file = path.join(ROOT, page);
  if (!fs.existsSync(file)) {
    console.warn(`  skip   ${page} (missing)`);
    continue;
  }

  const original = read(file);
  let next = original;

  for (const [name, load] of Object.entries(blocks)) {
    const re = new RegExp(`(<!-- @sync:${name} -->)([\\s\\S]*?)(<!-- @sync:end -->)`, 'g');
    if (!re.test(next)) continue;
    re.lastIndex = 0;
    let body = load();
    if (name === 'header') body = markCurrent(body, page);
    next = next.replace(re, (m, open, _old, close) => `${open}\n${body}\n${close}`);
  }

  if (next === original) {
    console.log(`  ok     ${page}`);
    continue;
  }

  stale += 1;
  if (CHECK) {
    console.error(`  STALE  ${page}`);
  } else {
    fs.writeFileSync(file, next, 'utf8');
    console.log(`  synced ${page}`);
  }
}

if (CHECK && stale) {
  console.error(`\n${stale} page(s) out of sync. Run: node tools/sync-partials.js`);
  process.exit(1);
}

console.log(`\nDone. ${PAGES.length} pages checked.`);
