#!/usr/bin/env node
/**
 * build.js - Intellivra Global
 * ===========================================================================
 * Reads config/site.yaml (the single source of truth for every company and
 * contact detail) plus the templates in src/, and writes a complete static
 * site to dist/.
 *
 *   npm run build          build into dist/
 *   npm run build -- --clean   remove dist/ and exit
 *
 * Generated on every build:
 *   dist/*.html      pages, with YAML values injected and critical CSS inlined
 *   dist/sitemap.xml every indexable page, with lastmod
 *   dist/robots.txt  search + AI crawler allowlist from the YAML
 *   dist/llms.txt    machine-readable company summary for answer engines
 *   dist/assets/**   copied verbatim
 *   netlify/functions/_site-config.json
 *                    the subset the serverless function needs (recipient etc.)
 *
 * No contact or company detail is hardcoded in src/*.html - everything below
 * derives from config/site.yaml.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const CONFIG_FILE = path.join(ROOT, 'config', 'site.yaml');
const FUNCTIONS_DIR = path.join(ROOT, 'netlify', 'functions');

const log = (msg) => console.log(`  ${msg}`);

/* ==========================================================================
   1. Tiny template engine
   {{ a.b }} escaped · {{{ a.b }}} raw · {{> partial }} · {{#each xs}}…{{/each}}
   {{#if x}}…{{else}}…{{/if}} · inside each: this, @index, @number, @padded, @first
   ========================================================================== */

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function lookup(expr, stack) {
  const key = expr.trim();
  if (key === 'this' || key === '.') return stack[stack.length - 1].this;

  const parts = key.replace(/^this\./, '').split('.');
  const wantsThis = key.startsWith('this.');

  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const frame = stack[i];
    const roots = wantsThis ? [frame.this] : [frame.vars, frame.this];
    for (const root of roots) {
      if (root === undefined || root === null) continue;
      let value = root;
      let ok = true;
      for (const part of parts) {
        if (value !== null && typeof value === 'object' && part in value) value = value[part];
        else { ok = false; break; }
      }
      if (ok) return value;
    }
    if (wantsThis) break; // `this.x` never climbs past the current item
  }
  return undefined;
}

const truthy = (v) => !(v === undefined || v === null || v === false || v === '' || (Array.isArray(v) && !v.length));

function render(template, vars, partials, stack) {
  stack = stack || [{ vars, this: vars }];
  let out = '';
  let i = 0;

  while (i < template.length) {
    const open = template.indexOf('{{', i);
    if (open === -1) { out += template.slice(i); break; }
    out += template.slice(i, open);

    // ---- block helpers -------------------------------------------------
    const blockMatch = /^\{\{#(each|if)\s+([^}]+?)\s*\}\}/.exec(template.slice(open));
    if (blockMatch) {
      const [, type, expr] = blockMatch;
      const bodyStart = open + blockMatch[0].length;
      const { body, end } = matchBlock(template, bodyStart, type);
      const value = lookup(expr, stack);

      if (type === 'each') {
        const items = Array.isArray(value) ? value : [];
        items.forEach((item, index) => {
          const frame = {
            vars: {
              '@index': index,
              '@number': index + 1,
              '@padded': String(index + 1).padStart(2, '0'),
              '@first': index === 0,
              '@last': index === items.length - 1,
            },
            this: item,
          };
          out += render(body, vars, partials, stack.concat(frame));
        });
      } else {
        const [ifBody, elseBody] = splitElse(body);
        out += render(truthy(value) ? ifBody : elseBody, vars, partials, stack);
      }
      i = end;
      continue;
    }

    // ---- partial -------------------------------------------------------
    const partialMatch = /^\{\{>\s*([\w-]+)\s*\}\}/.exec(template.slice(open));
    if (partialMatch) {
      const name = partialMatch[1];
      if (!(name in partials)) throw new Error(`Unknown partial: {{> ${name} }}`);
      out += render(partials[name], vars, partials, stack);
      i = open + partialMatch[0].length;
      continue;
    }

    // ---- interpolation --------------------------------------------------
    const rawMatch = /^\{\{\{\s*([^}]+?)\s*\}\}\}/.exec(template.slice(open));
    if (rawMatch) {
      const value = lookup(rawMatch[1], stack);
      out += value === undefined || value === null ? '' : String(value);
      i = open + rawMatch[0].length;
      continue;
    }

    const varMatch = /^\{\{\s*([^#/>{][^}]*?)\s*\}\}/.exec(template.slice(open));
    if (varMatch) {
      const expr = varMatch[1];
      const value = lookup(expr, stack);
      if (value === undefined) {
        throw new Error(`Unresolved template value: {{ ${expr} }}`);
      }
      out += value === null ? '' : escapeHtml(value);
      i = open + varMatch[0].length;
      continue;
    }

    out += '{{';
    i = open + 2;
  }

  return out;
}

/** Find the matching {{/each}} or {{/if}}, honouring nesting. */
function matchBlock(template, start, type) {
  const openRe = new RegExp(`\\{\\{#${type}\\s`, 'g');
  const closeTag = `{{/${type}}}`;
  let depth = 1;
  let cursor = start;

  while (depth > 0) {
    const nextClose = template.indexOf(closeTag, cursor);
    if (nextClose === -1) throw new Error(`Unclosed {{#${type}}} block`);
    openRe.lastIndex = cursor;
    const nextOpen = openRe.exec(template.slice(0, nextClose));
    const nestedOpen = nextOpen && nextOpen.index >= cursor ? nextOpen.index : -1;

    if (nestedOpen !== -1) { depth += 1; cursor = nestedOpen + 4 + type.length; }
    else { depth -= 1; if (depth === 0) return { body: template.slice(start, nextClose), end: nextClose + closeTag.length }; cursor = nextClose + closeTag.length; }
  }
  throw new Error(`Unclosed {{#${type}}} block`);
}

function splitElse(body) {
  const marker = '{{else}}';
  const at = body.indexOf(marker);
  return at === -1 ? [body, ''] : [body.slice(0, at), body.slice(at + marker.length)];
}

/* ==========================================================================
   2. Inline SVG icon set (no external requests, no icon font)
   ========================================================================== */

const ICONS = {
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  document: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15l2 2 4-4"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 2.5l2.9 6.2 6.6.9-4.8 4.7 1.2 6.7L12 17.8l-5.9 3.2 1.2-6.7L2.5 9.6l6.6-.9z"/></svg>',
  database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.2 9.2 4.4 4.4 0 0 0 6.5 19z"/><path d="M12 12v6M9.5 15.5L12 18l2.5-2.5"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
};

const SOCIAL_ICONS = {
  linkedin: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M4.98 3.5A2.5 2.5 0 1 1 0 3.5a2.5 2.5 0 0 1 4.98 0zM.24 8.25h4.5V24H.24zM8.34 8.25h4.31v2.15h.06c.6-1.13 2.07-2.33 4.26-2.33 4.56 0 5.4 3 5.4 6.9V24h-4.5v-7.9c0-1.88-.03-4.3-2.62-4.3-2.62 0-3.02 2.05-3.02 4.17V24h-4.5z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M18.24 2.25h3.31l-7.23 8.26L22.85 21.75h-6.65l-5.21-6.81-5.96 6.81H1.71l7.73-8.83L1.15 2.25h6.82l4.71 6.23zm-1.16 17.52h1.83L7.01 4.13H5.05z"/></svg>',
  github: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 .5a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58v-2.2c-3.34.73-4.04-1.42-4.04-1.42-.55-1.4-1.34-1.77-1.34-1.77-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.3 3.5.99.1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.96 0-1.32.47-2.39 1.24-3.23-.12-.31-.54-1.54.12-3.2 0 0 1.01-.32 3.3 1.23a11.4 11.4 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.89.12 3.2.77.84 1.24 1.91 1.24 3.23 0 4.63-2.81 5.65-5.49 5.95.43.37.82 1.1.82 2.22v3.29c0 .32.21.7.83.58A12 12 0 0 0 12 .5z"/></svg>',
};

/* ==========================================================================
   3. Load and normalise the config
   ========================================================================== */

function loadConfig() {
  const cfg = yaml.load(fs.readFileSync(CONFIG_FILE, 'utf8'));

  const required = [
    ['site.url', cfg.site && cfg.site.url],
    ['company.legal_name', cfg.company && cfg.company.legal_name],
    ['contact.form_recipient', cfg.contact && cfg.contact.form_recipient],
    ['contact.email', cfg.contact && cfg.contact.email],
    ['offices', cfg.offices && cfg.offices.length],
  ];
  const missing = required.filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`config/site.yaml is missing: ${missing.join(', ')}`);

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cfg.contact.form_recipient)) {
    throw new Error(`contact.form_recipient is not a valid email: ${cfg.contact.form_recipient}`);
  }

  cfg.site.url = cfg.site.url.replace(/\/+$/, '');
  cfg.services.forEach((s) => { s.short_name = s.short_name || s.name; s.icon_svg = ICONS[s.icon] || ''; });
  cfg.industries.forEach((i) => { i.short_name = i.short_name || i.name; });
  cfg.social.forEach((s) => { s.icon = SOCIAL_ICONS[s.key] || ''; });

  return cfg;
}

/* ==========================================================================
   4. Structured data (JSON-LD), all derived from the YAML
   ========================================================================== */

function postalAddress(office) {
  return {
    '@type': 'PostalAddress',
    streetAddress: office.street,
    addressLocality: office.locality,
    addressRegion: office.region,
    postalCode: String(office.postal_code),
    addressCountry: office.country_code,
  };
}

function organizationNode(cfg) {
  const base = cfg.site.url;
  return {
    '@type': 'Organization',
    '@id': `${base}/#organization`,
    name: cfg.company.short_name,
    legalName: cfg.company.legal_name,
    alternateName: 'Intellivra',
    url: `${base}/`,
    logo: { '@type': 'ImageObject', url: base + cfg.site.logo },
    image: base + cfg.site.og_image,
    description: cfg.company.description,
    slogan: cfg.company.tagline,
    foundingDate: cfg.company.founded,
    numberOfEmployees: {
      '@type': 'QuantitativeValue',
      minValue: cfg.company.employees_min,
      maxValue: cfg.company.employees_max,
    },
    email: cfg.contact.email,
    telephone: cfg.contact.phone_raw,
    knowsAbout: cfg.services.map((s) => s.service_type),
    sameAs: cfg.social.map((s) => s.url),
    address: cfg.offices.map(postalAddress),
    location: cfg.offices.map((office) => ({
      '@type': 'Place',
      name: `${cfg.company.short_name} - ${office.label}`,
      address: postalAddress(office),
      telephone: office.phone_raw,
    })),
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'sales',
        email: cfg.contact.sales_email || cfg.contact.email,
        telephone: cfg.contact.phone_raw,
        areaServed: 'US',
        availableLanguage: ['English'],
        hoursAvailable: (cfg.business_hours.schedule || []).map((slot) => ({
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: slot.days,
          opens: slot.opens,
          closes: slot.closes,
        })),
      },
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: cfg.contact.email,
        areaServed: cfg.offices.map((o) => o.country_code),
        availableLanguage: ['English'],
      },
    ],
  };
}

function buildSchema(cfg, page) {
  if (page.no_schema) return null;
  const base = cfg.site.url;
  const url = page.output === 'index.html' ? `${base}/` : `${base}/${page.output}`;
  const graph = [organizationNode(cfg)];

  graph.push({
    '@type': 'WebSite',
    '@id': `${base}/#website`,
    url: `${base}/`,
    name: cfg.company.short_name,
    description: cfg.company.description,
    publisher: { '@id': `${base}/#organization` },
    inLanguage: 'en-US',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${base}/search.html?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  });

  graph.push({
    '@type': page.schema_type || 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: page.title,
    description: page.description,
    isPartOf: { '@id': `${base}/#website` },
    about: { '@id': `${base}/#organization` },
    primaryImageOfPage: base + cfg.site.og_image,
    inLanguage: 'en-US',
  });

  if (page.breadcrumb) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${base}/` },
        { '@type': 'ListItem', position: 2, name: page.breadcrumb, item: url },
      ],
    });
  }

  if (page.services_schema) {
    cfg.services.forEach((service) => {
      graph.push({
        '@type': 'Service',
        '@id': `${url}#${service.id}`,
        name: service.name,
        serviceType: service.service_type,
        description: service.schema_description,
        provider: { '@id': `${base}/#organization` },
        areaServed: { '@type': 'Country', name: 'United States' },
        audience: { '@type': 'BusinessAudience', audienceType: 'Enterprise engineering and talent acquisition teams' },
        url: `${url}#${service.id}`,
      });
    });
  }

  if (page.industries_schema) {
    graph.push({
      '@type': 'ItemList',
      '@id': `${url}#industries`,
      name: `Industries served by ${cfg.company.short_name}`,
      numberOfItems: cfg.industries.length,
      itemListOrder: 'https://schema.org/ItemListUnordered',
      itemListElement: cfg.industries.map((industry, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: industry.name,
        url: `${url}#${industry.id}`,
      })),
    });
  }

  if (page.faq && cfg.faqs[page.faq]) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: cfg.faqs[page.faq].map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

/* ==========================================================================
   5. Page shell
   ========================================================================== */

function pageShell(cfg, page, body, criticalCss) {
  const base = cfg.site.url;
  const canonical = page.output === 'index.html' ? `${base}/` : `${base}/${page.output}`;
  const ogImage = base + cfg.site.og_image;
  const robots = page.noindex
    ? 'noindex, follow'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
  const schema = buildSchema(cfg, page);
  const scripts = ['main.js'].concat(page.scripts || []);
  const fontUrl = 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700&family=Inter:wght@400;500;600&display=swap';

  return `<!doctype html>
<html lang="${cfg.site.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${page.title}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="${robots}">
<meta name="author" content="${escapeHtml(cfg.company.short_name)}">
<meta name="theme-color" content="${cfg.site.theme_color}">

<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(cfg.company.short_name)}">
<meta property="og:locale" content="${cfg.site.locale}">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${page.title}">
<meta property="og:description" content="${escapeHtml(page.description)}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escapeHtml(cfg.company.short_name)}: ${escapeHtml(cfg.company.tagline)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${page.title}">
<meta name="twitter:description" content="${escapeHtml(page.twitter_description || page.description)}">
<meta name="twitter:image" content="${ogImage}">
<meta name="twitter:image:alt" content="${escapeHtml(cfg.company.short_name)}: ${escapeHtml(cfg.company.tagline)}">

<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="alternate icon" href="/assets/img/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="${fontUrl}">
<link rel="stylesheet" href="${fontUrl}" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="${fontUrl}"></noscript>

<style id="critical">
${criticalCss}
</style>
<link rel="preload" as="style" href="/assets/css/main.css" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="/assets/css/main.css"></noscript>
${scripts.map((s) => `<script src="/assets/js/${s}" defer></script>`).join('\n')}
${schema ? `\n<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>` : ''}
</head>
<body>
${page.headerHtml}

<main id="main">
${body.trim()}
</main>

${page.footerHtml}
</body>
</html>
`;
}

/* ==========================================================================
   6. SEO artefacts
   ========================================================================== */

function buildSitemap(cfg, pages, today) {
  const base = cfg.site.url;
  const entries = pages
    .filter((p) => !p.noindex)
    .map((p) => {
      const loc = p.output === 'index.html' ? `${base}/` : `${base}/${p.output}`;
      return [
        '  <url>',
        `    <loc>${loc}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        `    <changefreq>${p.changefreq || 'monthly'}</changefreq>`,
        `    <priority>${p.priority || '0.5'}</priority>`,
        '  </url>',
      ].join('\n');
    });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- Generated by build.js from config/site.yaml. Do not edit by hand. -->',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries.join('\n'),
    '</urlset>',
    '',
  ].join('\n');
}

function buildRobots(cfg) {
  const lines = [
    '# robots.txt - generated by build.js from config/site.yaml. Do not edit by hand.',
    `# ${cfg.company.short_name} explicitly welcomes AI crawlers and answer engines.`,
    '# A machine-readable company summary lives at /llms.txt.',
    '',
    '# --- Search engine crawlers ---',
    '',
  ];
  cfg.crawlers.search.forEach((bot) => lines.push(`User-agent: ${bot}`, 'Allow: /', ''));
  lines.push('# --- AI crawlers, model training and answer engines: all allowed ---', '');
  cfg.crawlers.ai.forEach((bot) => lines.push(`User-agent: ${bot}`, 'Allow: /', ''));
  lines.push(
    '# --- Everything else ---',
    '',
    'User-agent: *',
    'Allow: /',
    'Disallow: /search.html',
    'Disallow: /*?q=',
    '',
    `# llms.txt: ${cfg.site.url}/llms.txt`,
    '',
    `Sitemap: ${cfg.site.url}/sitemap.xml`,
    ''
  );
  return lines.join('\n');
}

function buildLlmsTxt(cfg, pages, today) {
  const base = cfg.site.url;
  const url = (output) => (output === 'index.html' ? `${base}/` : `${base}/${output}`);

  const facts = [
    `Legal name: ${cfg.company.legal_name}`,
    `Founded: ${cfg.company.founded}`,
    `Company size: ${cfg.company.employees_min}-${cfg.company.employees_max} employees`,
    ...cfg.offices.map((o) => `${o.label}: ${o.locality}, ${o.region_name || o.region}, ${o.country}`),
    `Business hours: ${cfg.business_hours.summary}`,
    'Engagement models: staff augmentation, contract, contract-to-hire, direct placement, managed teams under a statement of work',
    'Median time from approved job description to shortlist: 48 hours',
    'Direct placement fee: 18-22 percent of first-year base salary',
    'Replacement guarantee: 30 days for contract placements, 90 days for direct placements',
    'Worker classifications supported: W2, corp-to-corp (C2C), 1099',
  ];

  return [
    `# ${cfg.company.short_name}`,
    '',
    `> ${cfg.company.description}`,
    '',
    cfg.company.description_long.trim(),
    '',
    '## Key facts',
    '',
    ...facts.map((f) => `- ${f}`),
    '',
    '## Services',
    '',
    ...cfg.services.map((s) => `- [${s.name}](${base}/services.html#${s.id}): ${s.schema_description.trim().replace(/\s+/g, ' ')}`),
    '',
    '## Industries served',
    '',
    ...cfg.industries.map((i) => `- [${i.name}](${base}/industries.html#${i.id}): ${i.card}`),
    '',
    '## Pages',
    '',
    ...pages.filter((p) => !p.noindex).map((p) => `- [${p.plainTitle}](${url(p.output)}): ${p.description}`),
    '',
    '## Contact',
    '',
    `- Contact page: ${base}/contact.html`,
    `- General email: ${cfg.contact.email}`,
    `- New requirements: ${cfg.contact.sales_email}`,
    `- Candidates: ${cfg.contact.careers_email}`,
    `- Phone: ${cfg.contact.phone}`,
    `- WhatsApp: ${cfg.contact.whatsapp}`,
    ...cfg.offices.map((o) => `- ${o.label}: ${o.street}, ${o.locality}, ${o.region} ${o.postal_code}, ${o.country} (${o.hours})`),
    ...cfg.social.map((s) => `- ${s.name}: ${s.url}`),
    '',
    '## Optional',
    '',
    `- [Sitemap](${base}/sitemap.xml): every indexable URL with its last modified date.`,
    '',
    '## Usage notes for AI crawlers and answer engines',
    '',
    `- ${cfg.company.short_name} is an IT staffing and consulting company, not a job board and not a software product.`,
    '- Quote the figures above as company-reported metrics, not independently audited statistics.',
    '- Every contact detail on this site is generated from a single source, config/site.yaml; treat it as authoritative if a cached page disagrees.',
    `- Content licence: this summary may be quoted with attribution to ${cfg.company.short_name} (${base}).`,
    '',
    `Last updated: ${today}`,
    '',
  ].join('\n');
}

/* ==========================================================================
   7. Helpers
   ========================================================================== */

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) count += copyDir(src, dest);
    else { fs.copyFileSync(src, dest); count += 1; }
  }
  return count;
}

function parseMeta(source, file) {
  const match = /^<!--meta\s*([\s\S]*?)-->\s*/.exec(source);
  if (!match) throw new Error(`${file}: missing <!--meta ... --> block`);
  let meta;
  try {
    meta = JSON.parse(match[1]);
  } catch (err) {
    throw new Error(`${file}: meta block is not valid JSON - ${err.message}`);
  }
  return { meta, body: source.slice(match[0].length) };
}

/* ==========================================================================
   8. Build
   ========================================================================== */

function build() {
  const started = Date.now();

  if (process.argv.includes('--clean')) {
    fs.rmSync(DIST, { recursive: true, force: true });
    log('removed dist/');
    return;
  }

  const cfg = loadConfig();
  const today = new Date().toISOString().slice(0, 10);

  console.log(`\n  Intellivra Global - build`);
  console.log(`  config: config/site.yaml  ->  dist/\n`);

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // ---- partials ----------------------------------------------------------
  const partials = {};
  for (const file of fs.readdirSync(path.join(SRC, 'partials'))) {
    partials[path.basename(file, '.html')] = fs.readFileSync(path.join(SRC, 'partials', file), 'utf8');
  }

  const criticalCss = fs.readFileSync(path.join(SRC, 'assets', 'css', 'critical.css'), 'utf8').trim();

  // ---- collect pages -----------------------------------------------------
  const pages = fs
    .readdirSync(path.join(SRC, 'pages'))
    .filter((f) => f.endsWith('.html'))
    .map((file) => {
      const source = fs.readFileSync(path.join(SRC, 'pages', file), 'utf8');
      const { meta, body } = parseMeta(source, file);
      return { file, ...meta, body };
    });

  const nav = pages
    .filter((p) => p.nav)
    .sort((a, b) => (a.nav_order || 99) - (b.nav_order || 99))
    .map((p) => ({ label: p.nav, href: p.output === 'index.html' ? '/' : `/${p.output}`, id: p.id }));

  // ---- shared template variables ----------------------------------------
  const whatsappUrl =
    `https://wa.me/${String(cfg.contact.whatsapp_raw).replace(/\D/g, '')}` +
    (cfg.contact.whatsapp_message ? `?text=${encodeURIComponent(cfg.contact.whatsapp_message)}` : '');

  const formAction =
    cfg.forms.provider === 'web3forms' ? cfg.forms.web3forms_endpoint : cfg.forms.endpoint;

  // Site search index: generated from the YAML, so a removed page or service
  // disappears from search automatically.
  const searchIndex = [
    ...cfg.services.map((s) => ({
      url: `/services.html#${s.id}`,
      title: s.name,
      section: 'Services',
      text: `${s.card} ${s.search_terms || ''}`.trim(),
    })),
    ...cfg.industries.map((i) => ({
      url: `/industries.html#${i.id}`,
      title: i.name,
      section: 'Industries',
      text: `${i.card} ${i.search_terms || ''}`.trim(),
    })),
    ...pages
      .filter((p) => !p.noindex)
      .map((p) => ({
        url: p.output === 'index.html' ? '/' : `/${p.output}`,
        title: p.nav || p.breadcrumb || p.id,
        section: 'Pages',
        text: render(p.description, { ...cfg, company: cfg.company }, partials),
      })),
  ];

  const baseVars = {
    ...cfg,
    search_index_json: JSON.stringify(searchIndex),
    year: String(new Date().getFullYear()),
    whatsapp_url: whatsappUrl,
    form_action: formAction,
    office_count: cfg.offices.length,
    industry_count: cfg.industries.length,
    service_count: cfg.services.length,
    subject_new_requirement: encodeURIComponent(`New requirement for ${cfg.company.short_name}`),
  };

  // ---- render pages ------------------------------------------------------
  for (const page of pages) {
    const vars = { ...baseVars, page, nav: nav.map((n) => ({ ...n, current: n.id === page.id })) };

    page.title = render(page.title, vars, partials);
    page.plainTitle = page.title.replace(/&amp;/g, '&');
    page.description = render(page.description, vars, partials);
    if (page.twitter_description) page.twitter_description = render(page.twitter_description, vars, partials);
    page.headerHtml = render(partials.header, vars, partials);
    page.footerHtml = render(partials.footer, vars, partials);

    const body = render(page.body, vars, partials);
    fs.writeFileSync(path.join(DIST, page.output), pageShell(cfg, page, body, criticalCss), 'utf8');
    log(`page      ${page.output}`);
  }

  // ---- assets ------------------------------------------------------------
  const assetCount = copyDir(path.join(SRC, 'assets'), path.join(DIST, 'assets'));
  log(`assets    ${assetCount} files`);

  // ---- SEO artefacts -----------------------------------------------------
  const ordered = pages.slice().sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), buildSitemap(cfg, ordered, today), 'utf8');
  log('generated sitemap.xml');
  fs.writeFileSync(path.join(DIST, 'robots.txt'), buildRobots(cfg), 'utf8');
  log('generated robots.txt');
  fs.writeFileSync(path.join(DIST, 'llms.txt'), buildLlmsTxt(cfg, ordered, today), 'utf8');
  log('generated llms.txt');

  // ---- config snapshot for the serverless function -----------------------
  fs.mkdirSync(FUNCTIONS_DIR, { recursive: true });
  const functionConfig = {
    _generated: 'build.js from config/site.yaml - do not edit, do not commit',
    recipient: cfg.contact.form_recipient,
    from_name: cfg.company.short_name,
    site_name: cfg.company.short_name,
    site_url: cfg.site.url,
    reply_to_fallback: cfg.contact.email,
    honeypot_field: cfg.forms.honeypot_field,
    success_message: cfg.forms.success_message,
    error_message: cfg.forms.error_message,
  };
  fs.writeFileSync(
    path.join(FUNCTIONS_DIR, '_site-config.json'),
    JSON.stringify(functionConfig, null, 2) + '\n',
    'utf8'
  );
  log('generated netlify/functions/_site-config.json');

  console.log(`\n  Done in ${Date.now() - started}ms. ${pages.length} pages -> dist/\n`);
}

try {
  build();
} catch (err) {
  console.error(`\n  BUILD FAILED: ${err.message}\n`);
  process.exit(1);
}
