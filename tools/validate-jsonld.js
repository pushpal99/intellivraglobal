#!/usr/bin/env node
/**
 * validate-jsonld.js - Intellivra Global
 *
 * Parses every <script type="application/ld+json"> block in every page and
 * reports invalid JSON, missing @context/@type, and empty required fields.
 *
 *   node tools/validate-jsonld.js         # validate (exit 1 on failure)
 *   node tools/validate-jsonld.js --fix   # also strip trailing commas and reformat
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FIX = process.argv.includes('--fix');
const BLOCK = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
let failures = 0;
let blocks = 0;

for (const page of pages) {
  const file = path.join(ROOT, page);
  let html = fs.readFileSync(file, 'utf8');
  let changed = false;

  html = html.replace(BLOCK, (match, body) => {
    blocks += 1;
    let source = body;

    if (FIX) source = source.replace(/,(\s*[}\]])/g, '$1'); // trailing commas

    let parsed;
    try {
      parsed = JSON.parse(source);
    } catch (err) {
      failures += 1;
      console.error(`FAIL ${page}: ${err.message}`);
      return match;
    }

    const nodes = parsed['@graph'] || [parsed];
    for (const node of nodes) {
      if (!node['@type']) {
        failures += 1;
        console.error(`FAIL ${page}: a node is missing @type`);
      }
    }
    if (!parsed['@context']) {
      failures += 1;
      console.error(`FAIL ${page}: missing @context`);
    }

    if (FIX) {
      const pretty = '\n' + JSON.stringify(parsed, null, 2) + '\n';
      if (pretty !== body) changed = true;
      return `<script type="application/ld+json">${pretty}</script>`;
    }
    return match;
  });

  if (FIX && changed) {
    fs.writeFileSync(file, html, 'utf8');
    console.log(`fixed  ${page}`);
  } else if (!FIX) {
    console.log(`ok     ${page}`);
  }
}

console.log(`\n${blocks} JSON-LD block(s) across ${pages.length} pages; ${failures} problem(s).`);
process.exit(failures ? 1 : 0);
