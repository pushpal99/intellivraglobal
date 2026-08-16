#!/usr/bin/env node
/**
 * audit.js - Intellivra Global
 *
 * Static self-review of the built site in dist/: SEO, accessibility and
 * performance checks that do not need a browser. Run after every build:
 *
 *   npm run build && node tools/audit.js
 *
 * Exit code is 1 if any ERROR is found. WARN entries are advisory.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT = path.resolve(__dirname, '..');
const ROOT = path.join(PROJECT, 'dist');
const yaml = require('js-yaml');
const cfg = yaml.load(fs.readFileSync(path.join(PROJECT, 'config', 'site.yaml'), 'utf8'));
const BASE = String(cfg.site.url).replace(/\/+$/, '');

if (!fs.existsSync(ROOT)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));

let errors = 0;
let warnings = 0;
const err = (page, msg) => { errors += 1; console.log(`  ERROR  ${page}: ${msg}`); };
const warn = (page, msg) => { warnings += 1; console.log(`  warn   ${page}: ${msg}`); };

const titles = new Map();
const descriptions = new Map();

/** Strip <script>, <style>, <template> and HTML comments before markup checks. */
function stripNoise(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<template[\s\S]*?<\/template>/gi, '');
}

console.log('\n== Per-page checks ==\n');

for (const page of pages) {
  const raw = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const html = stripNoise(raw);
  const has = (re) => re.test(raw);
  const grab = (re) => { const m = raw.match(re); return m ? m[1] : null; };

  /* ---------- title & description ---------- */
  const title = grab(/<title>([\s\S]*?)<\/title>/i);
  if (!title) err(page, 'missing <title>');
  else {
    if (title.length > 60) warn(page, `title is ${title.length} chars (target < 60): "${title}"`);
    if (titles.has(title)) err(page, `duplicate title, also used by ${titles.get(title)}`);
    titles.set(title, page);
  }

  const desc = grab(/<meta name="description" content="([^"]*)"/i);
  if (!desc) err(page, 'missing meta description');
  else {
    if (desc.length > 155) err(page, `meta description is ${desc.length} chars (max 155)`);
    if (desc.length < 70) warn(page, `meta description is only ${desc.length} chars`);
    if (descriptions.has(desc)) err(page, `duplicate meta description, also on ${descriptions.get(desc)}`);
    descriptions.set(desc, page);
  }

  /* ---------- canonical ---------- */
  const canonical = grab(/<link rel="canonical" href="([^"]*)"/i);
  if (!canonical) err(page, 'missing canonical');
  else {
    const expected = page === 'index.html' ? `${BASE}/` : `${BASE}/${page}`;
    if (canonical !== expected) err(page, `canonical is ${canonical}, expected ${expected}`);
  }

  /* ---------- social cards ---------- */
  for (const tag of ['og:type', 'og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt', 'og:site_name']) {
    if (!has(new RegExp(`property="${tag}"`))) err(page, `missing ${tag}`);
  }
  for (const tag of ['twitter:card', 'twitter:image', 'twitter:image:alt']) {
    if (!has(new RegExp(`name="${tag}"`))) err(page, `missing ${tag}`);
  }

  /* ---------- semantic structure ---------- */
  if (!has(/<html lang="en">/)) err(page, 'missing lang attribute on <html>');
  if (!has(/<meta charset="utf-8">/i)) err(page, 'missing charset');
  if (!has(/name="viewport"/)) err(page, 'missing viewport meta');
  if (!has(/<header class="site-header">/)) err(page, 'missing <header>');
  if (!has(/<main id="main">/)) err(page, 'missing <main id="main">');
  if (!has(/<footer class="site-footer">/)) err(page, 'missing <footer>');
  if (!has(/class="skip-link"/)) err(page, 'missing skip link');

  const h1s = html.match(/<h1[\s>]/g) || [];
  if (h1s.length !== 1) err(page, `${h1s.length} <h1> elements (expected exactly 1)`);

  // Heading hierarchy: never skip a level going down.
  const levels = [...html.matchAll(/<h([1-4])[\s>]/g)].map((m) => Number(m[1]));
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i] > levels[i - 1] + 1) {
      err(page, `heading jumps from h${levels[i - 1]} to h${levels[i]}`);
      break;
    }
  }

  /* ---------- images ---------- */
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  imgs.forEach((tag) => {
    if (!/\salt="/.test(tag)) err(page, `<img> without alt: ${tag.slice(0, 80)}`);
    else if (/\salt=""/.test(tag) && !/role="presentation"/.test(tag)) warn(page, 'empty alt without role="presentation"');
    if (!/width="/.test(tag) || !/height="/.test(tag)) err(page, `<img> without width/height (layout shift): ${tag.slice(0, 80)}`);
    if (!/loading="lazy"/.test(tag)) warn(page, `<img> not lazy-loaded: ${tag.slice(0, 60)}`);
  });

  /* ---------- inline svg accessibility ---------- */
  const svgs = [...html.matchAll(/<svg\b[^>]*>/g)].map((m) => m[0]);
  svgs.forEach((tag) => {
    const decorative = /aria-hidden="true"/.test(tag);
    const labelled = /role="img"/.test(tag) && (/aria-label/.test(tag) || /aria-labelledby/.test(tag));
    if (!decorative && !labelled) err(page, `<svg> is neither aria-hidden nor labelled: ${tag.slice(0, 80)}`);
  });

  /* ---------- iframes ---------- */
  [...html.matchAll(/<iframe\b[^>]*>/g)].forEach((m) => {
    if (!/title="/.test(m[0])) err(page, '<iframe> without title');
    if (!/loading="lazy"/.test(m[0])) warn(page, '<iframe> not lazy-loaded');
  });

  /* ---------- navigation & landmarks ---------- */
  [...html.matchAll(/<nav\b[^>]*>/g)].forEach((m) => {
    if (!/aria-label|aria-labelledby/.test(m[0])) err(page, `<nav> without an accessible name: ${m[0].slice(0, 70)}`);
  });

  /* ---------- forms ---------- */
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  inputs.forEach((tag) => {
    const id = (tag.match(/\sid="([^"]+)"/) || [])[1];
    const hidden = /type="(hidden|submit|button)"/.test(tag);
    if (hidden) return;
    if (!id) { err(page, `form control without id: ${tag.slice(0, 70)}`); return; }
    if (!new RegExp(`<label[^>]*for="${id}"`).test(html) && !/aria-label/.test(tag)) {
      err(page, `no <label for="${id}"> and no aria-label`);
    }
  });

  /* ---------- performance ---------- */
  if (!has(/<style id="critical">/)) err(page, 'critical CSS is not inlined');
  if (!has(/rel="preload" as="style" href="\/assets\/css\/main\.css"/)) err(page, 'main.css is not loaded asynchronously');
  [...raw.matchAll(/<script\b(?![^>]*type="application\/ld\+json")[^>]*src="[^"]*"[^>]*>/g)].forEach((m) => {
    if (!/\sdefer\b|\sasync\b/.test(m[0])) err(page, `render-blocking script: ${m[0].slice(0, 70)}`);
  });

  /* ---------- structured data ---------- */
  const ld = [...raw.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (page !== '404.html' && page !== 'search.html' && !ld.length) err(page, 'no JSON-LD');
  ld.forEach((m) => {
    try { JSON.parse(m[1]); } catch (e) { err(page, `invalid JSON-LD: ${e.message}`); }
  });

  /* ---------- internal links ---------- */
  const hrefs = [...html.matchAll(/(?<![-\w])href="([^"#][^"]*?)"/g)].map((m) => m[1]);
  hrefs
    .filter((h) => !/^(https?:|mailto:|tel:|#)/.test(h))
    .forEach((href) => {
      const target = href.split('#')[0];
      if (!target) return;
      if (!fs.existsSync(path.join(ROOT, target))) err(page, `broken link: ${href}`);
    });

  // Same-page anchors must exist.
  [...html.matchAll(/(?<![-\w])href="#([^"]+)"/g)].map((m) => m[1]).forEach((id) => {
    if (!new RegExp(`id="${id}"`).test(raw)) err(page, `anchor #${id} has no target`);
  });

  // Cross-page anchors must exist in the target page.
  [...html.matchAll(/(?<![-\w])href="([a-z0-9-]+\.html)#([^"]+)"/g)].forEach((m) => {
    const target = path.join(ROOT, m[1]);
    if (!fs.existsSync(target)) return;
    if (!new RegExp(`id="${m[2]}"`).test(fs.readFileSync(target, 'utf8'))) {
      err(page, `anchor ${m[1]}#${m[2]} has no target`);
    }
  });
}

/* ---------- site-level checks ---------- */

console.log('\n== Site-level checks ==\n');

const site = (msg) => { errors += 1; console.log(`  ERROR  ${msg}`); };

for (const file of ['robots.txt', 'sitemap.xml', 'llms.txt']) {
  if (!fs.existsSync(path.join(ROOT, file))) site(`missing dist/${file}`);
}
for (const file of ['README.md', 'config/site.yaml', 'netlify.toml', '.github/workflows/deploy.yml', '.env.example', '.gitignore', 'build.js', 'netlify/functions/send-contact.js']) {
  if (!fs.existsSync(path.join(PROJECT, file))) site(`missing ${file}`);
}

// The Careers page and its data must be gone, with no links left behind.
for (const gone of ['careers.html', 'config/jobs.json', 'src/pages/careers.html', 'src/assets/js/careers.js']) {
  if (fs.existsSync(path.join(PROJECT, gone))) site(`${gone} should have been removed`);
}
pages.forEach((page) => {
  const raw = fs.readFileSync(path.join(ROOT, page), 'utf8');
  if (/careers\.html|JobPosting|jobs\.json/i.test(raw)) site(`${page} still references the removed Careers page`);
});

const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Bingbot', 'CCBot']
  .forEach((bot) => {
    if (!new RegExp(`User-agent: ${bot}\\s*\\nAllow: /`, 'i').test(robots)) site(`robots.txt does not explicitly allow ${bot}`);
  });
if (!robots.includes(`Sitemap: ${BASE}/sitemap.xml`)) site('robots.txt has no Sitemap line');

const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
pages.forEach((page) => {
  const raw = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const noindex = /content="noindex/.test(raw);
  const loc = page === 'index.html' ? `${BASE}/` : `${BASE}/${page}`;
  const listed = sitemap.includes(`<loc>${loc}</loc>`);
  if (noindex && listed) site(`sitemap lists noindex page ${page}`);
  if (!noindex && !listed) site(`sitemap is missing ${page}`);
});
[...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].forEach((m) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m[1])) site(`sitemap lastmod is not ISO date: ${m[1]}`);
});

const llms = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
if (!/^# /.test(llms)) site('llms.txt does not start with an H1');
if (!/\n> /.test(llms)) site('llms.txt has no blockquote summary');
if (!llms.includes(`${BASE}/contact.html`)) site('llms.txt does not link the contact page');
if (/careers\.html|\/careers/i.test(llms)) site('llms.txt still links the removed Careers page');
if (!llms.includes(cfg.contact.email)) site('llms.txt is missing the contact email');

for (const key of ['company.legal_name', 'company.tagline', 'contact.form_recipient', 'contact.email', 'contact.phone', 'contact.whatsapp', 'maps.embed_url', 'business_hours.summary', 'legal.footer_text', 'forms.endpoint']) {
  const value = key.split('.').reduce((acc, k) => (acc || {})[k], cfg);
  if (!value) site(`config/site.yaml is missing ${key}`);
}
if (!Array.isArray(cfg.offices) || cfg.offices.length < 2) site('config/site.yaml should define at least two offices (US + India)');
if (!Array.isArray(cfg.social) || !cfg.social.length) site('config/site.yaml should define social links');

// The contact form must reach the configured recipient through the function.
const fn = fs.readFileSync(path.join(PROJECT, 'netlify', 'functions', 'send-contact.js'), 'utf8');
if (!fn.includes('EMAIL_API_KEY')) site('the serverless function does not read EMAIL_API_KEY');
if (!fn.includes("require('./_site-config.json')")) site('the serverless function does not read the generated site config');
if (fn.includes(cfg.contact.form_recipient)) site('the serverless function hardcodes the recipient');
if (!fn.includes('honeypot_field') || !fn.includes('rateLimited')) site('the serverless function is missing spam handling');

const contactHtml = fs.readFileSync(path.join(ROOT, 'contact.html'), 'utf8');
if (!contactHtml.includes(cfg.forms.endpoint)) site('contact.html does not point at the configured form endpoint');
if (!contactHtml.includes(cfg.forms.honeypot_field)) site('contact.html has no honeypot field');
if (/<form[^>]+action="(?!#)/.test(contactHtml) && !contactHtml.includes('data-endpoint')) site('contact.html should submit via fetch, not a form action');

/* ---------- summary ---------- */

console.log(`\n${'='.repeat(58)}`);
console.log(`${pages.length} pages audited - ${errors} error(s), ${warnings} warning(s)`);
console.log('='.repeat(58) + '\n');
process.exit(errors ? 1 : 0);
