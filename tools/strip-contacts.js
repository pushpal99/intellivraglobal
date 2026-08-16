#!/usr/bin/env node
/**
 * strip-contacts.js - Intellivra Global (one-off + CI guard)
 *
 * Enforces the project's hard rule: no contact detail is ever hardcoded in an
 * HTML file. Visible contact details come from config/site.config.json through
 * config-loader.js, and the Organization contact JSON-LD is injected by the
 * same loader at runtime.
 *
 * Run as a guard (exit 1 on any violation):
 *   node tools/strip-contacts.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'site.config.json'), 'utf8'));

/** Every literal that must never appear in an .html file. */
function forbiddenValues() {
  const values = new Set();
  const add = (value) => {
    if (typeof value === 'string' && value.trim()) values.add(value.trim());
  };

  const c = cfg.contact || {};
  [c.email, c.salesEmail, c.careersEmail, c.phone, c.phoneRaw, c.whatsapp, c.whatsappRaw].forEach(add);
  Object.values(cfg.social || {}).forEach(add);
  add((cfg.maps || {}).embedUrl);
  add((cfg.maps || {}).linkUrl);
  add((cfg.forms || {}).contactEndpoint);
  (cfg.offices || []).forEach((office) => {
    [office.street, office.postalCode, office.phone, office.phoneRaw, office.email].forEach(add);
  });

  // Phone numbers also appear in schema.org dashed form (+1-469-555-0142).
  [c.phoneRaw, ...(cfg.offices || []).map((o) => o.phoneRaw)].filter(Boolean).forEach((raw) => {
    const digits = String(raw).replace(/\D/g, '');
    if (digits.length === 11) add(`+${digits[0]}-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`);
  });

  return [...values];
}

const values = forbiddenValues();
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
let violations = 0;

for (const page of pages) {
  const text = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const hits = values.filter((value) => text.includes(value));
  if (hits.length) {
    violations += hits.length;
    console.error(`FAIL ${page}`);
    hits.forEach((hit) => console.error(`       hardcoded: ${hit}`));
  } else {
    console.log(`ok   ${page}`);
  }
}

if (violations) {
  console.error(`\n${violations} hardcoded contact value(s) found. Move them to config/site.config.json and bind with data-config attributes.`);
  process.exit(1);
}

console.log(`\nClean: ${pages.length} pages, ${values.length} config values checked.`);
