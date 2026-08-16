#!/usr/bin/env node
/**
 * sync-config.js - Intellivra Global
 *
 * OPTIONAL, for local file:// previews only.
 *
 * Browsers refuse to fetch() JSON from a file:// page, so double-clicking
 * index.html would otherwise show the "Contact us via LinkedIn" fallback text
 * instead of the real details. This script mirrors config/site.config.json and
 * config/jobs.json into a JS shim that assigns window.__INTELLIVRA_CONFIG__ and
 * window.__INTELLIVRA_JOBS__, which config-loader.js and careers.js use when the
 * fetch fails.
 *
 *   node tools/sync-config.js          # write config/site.config.local.js
 *   node tools/sync-config.js --check  # exit 1 if the shim is stale
 *   node tools/sync-config.js --remove # delete the shim (not needed in production)
 *
 * The shim is never required when the site is served over http(s). If you use
 * it, add this line to each page's <head>, before config-loader.js:
 *
 *   <script src="config/site.config.local.js"></script>
 *
 * Serving the folder instead avoids all of this:  npx serve .
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'config', 'site.config.local.js');
const MODE = process.argv.includes('--remove') ? 'remove' : process.argv.includes('--check') ? 'check' : 'write';

if (MODE === 'remove') {
  if (fs.existsSync(TARGET)) {
    fs.unlinkSync(TARGET);
    console.log('removed config/site.config.local.js');
  } else {
    console.log('nothing to remove');
  }
  process.exit(0);
}

const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'site.config.json'), 'utf8'));
const jobs = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'jobs.json'), 'utf8'));

const content = [
  '/* GENERATED FILE - do not edit.',
  '   Mirrors config/site.config.json and config/jobs.json for file:// previews.',
  '   Regenerate with: node tools/sync-config.js */',
  `window.__INTELLIVRA_CONFIG__ = ${JSON.stringify(site, null, 2)};`,
  `window.__INTELLIVRA_JOBS__ = ${JSON.stringify(jobs, null, 2)};`,
  '',
].join('\n');

const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8') : null;

if (current === content) {
  console.log('ok      config/site.config.local.js is current');
  process.exit(0);
}

if (MODE === 'check') {
  console.error('STALE   config/site.config.local.js - run: node tools/sync-config.js');
  process.exit(1);
}

fs.writeFileSync(TARGET, content, 'utf8');
console.log('written config/site.config.local.js');
