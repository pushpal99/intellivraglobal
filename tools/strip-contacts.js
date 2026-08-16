#!/usr/bin/env node
/**
 * strip-contacts.js - Intellivra Global
 *
 * Enforces the project's hard rule: no company or contact detail is hardcoded
 * in a source template. Every value must come from config/site.yaml via the
 * build. The built output in dist/ obviously contains the real values - that
 * is the point of the build - so only src/ is checked.
 *
 *   node tools/strip-contacts.js      (also runs as `npm run lint:contacts`)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const cfg = yaml.load(fs.readFileSync(path.join(ROOT, 'config', 'site.yaml'), 'utf8'));

/** Every literal that must never appear in a source template. */
function forbiddenValues() {
  const values = new Set();
  const add = (value) => {
    if (typeof value === 'string' && value.trim().length > 3) values.add(value.trim());
  };

  const c = cfg.contact;
  [c.form_recipient, c.email, c.sales_email, c.careers_email, c.phone, c.phone_raw, c.whatsapp, c.whatsapp_raw]
    .forEach(add);
  (cfg.social || []).forEach((s) => add(s.url));
  add(cfg.maps.embed_url);
  add(cfg.maps.link_url);
  add(cfg.legal.copyright_holder);
  add(cfg.legal.footer_text);
  add(cfg.company.legal_name);
  add(cfg.business_hours.summary);
  (cfg.offices || []).forEach((office) => {
    [office.street, office.postal_code, office.phone, office.phone_raw, office.email, office.hours].forEach(add);
  });
  (cfg.forms.web3forms_access_key ? [cfg.forms.web3forms_access_key] : []).forEach(add);

  return [...values];
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(html|js|css)$/.test(entry.name) ? [full] : [];
  });
}

const values = forbiddenValues();
const files = walk(SRC);
let violations = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const text = fs.readFileSync(file, 'utf8');
  const hits = values.filter((value) => text.includes(value));

  if (hits.length) {
    violations += hits.length;
    console.error(`FAIL ${rel}`);
    hits.forEach((hit) => console.error(`       hardcoded: ${hit}`));
  } else {
    console.log(`ok   ${rel}`);
  }
}

// The serverless function must not hardcode the recipient either.
const fnPath = path.join(ROOT, 'netlify', 'functions', 'send-contact.js');
if (fs.existsSync(fnPath)) {
  const fn = fs.readFileSync(fnPath, 'utf8');
  if (fn.includes(cfg.contact.form_recipient)) {
    violations += 1;
    console.error('FAIL netlify/functions/send-contact.js');
    console.error(`       hardcoded recipient: ${cfg.contact.form_recipient}`);
  } else {
    console.log('ok   netlify/functions/send-contact.js');
  }
  if (/EMAIL_API_KEY\s*=\s*['"]/.test(fn) || /\bre_[A-Za-z0-9]{10,}/.test(fn)) {
    violations += 1;
    console.error('FAIL netlify/functions/send-contact.js contains what looks like an API key');
  }
}

if (violations) {
  console.error(`\n${violations} hardcoded value(s) found. Move them to config/site.yaml and reference them with {{ tokens }}.`);
  process.exit(1);
}

console.log(`\nClean: ${files.length} source files checked against ${values.length} config values.`);
