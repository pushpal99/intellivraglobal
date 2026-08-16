# Intellivra Global — marketing site

Static marketing site for **intellivraglobal.com**: plain HTML, CSS and vanilla JavaScript.
No framework, no bundler, no build step. Open `index.html` in a browser and it works.

```
INTELLIVRAGLOBAL/
├── index.html              Home
├── services.html           Six service lines, one anchored section each
├── industries.html         Six industries
├── about.html              Mission, leadership, why "Intellivra"
├── careers.html            Openings rendered from config/jobs.json
├── contact.html            Form + contact details + map
├── search.html             Site search (noindex; backs the SearchAction schema)
├── 404.html                Not-found page
├── llms.txt                Machine-readable company summary for AI crawlers
├── robots.txt              Explicitly allows GPTBot, ClaudeBot, PerplexityBot, CCBot…
├── sitemap.xml             Generated; all indexable URLs with lastmod
├── config/
│   ├── site.config.json    ← ALL contact details live here. Nothing else.
│   └── jobs.json           ← Careers listings
├── assets/
│   ├── css/critical.css    Canonical copy of the CSS inlined in every <head>
│   ├── css/main.css        Everything below the fold
│   ├── js/config-loader.js Reads site.config.json → populates data-config elements
│   ├── js/main.js          Mobile nav + footer year
│   ├── js/careers.js       Renders jobs.json + JobPosting JSON-LD
│   ├── js/contact.js       Posts the form to the configured endpoint
│   ├── js/search.js        Client-side site search
│   └── img/                Logo, favicons, OG image, client-logo placeholders
└── tools/                  serve.js (local dev server) + optional maintenance scripts
```

---

## 1. Editing contact details — config only

**Every** email address, phone number, WhatsApp number, office address, social link, map URL
and form endpoint lives in **`config/site.config.json`**. Nothing is hardcoded in HTML — not in
the visible copy, and not in the structured data either.

Edit the JSON, save, reload. That is the whole workflow.

```jsonc
{
  "contact": {
    "email": "hello@intellivraglobal.com",     // TODO: replace
    "phone": "+1 (469) 555-0142",              // display format
    "phoneRaw": "+14695550142",                // E.164, used for tel: links
    "whatsappRaw": "14695550142"               // digits only, used for wa.me links
  },
  "offices": [ /* add or remove offices freely — the UI repeats over this array */ ],
  "social":  { "linkedin": "…", "x": "…", "github": "…" },
  "maps":    { "embedUrl": "…", "linkUrl": "…" },
  "forms":   { "contactEndpoint": "https://formspree.io/f/TODO_REPLACE_ME" }
}
```

Everything marked `TODO` in the file (and in the `_TODO` array at the top) needs a real value
before launch. Keys starting with `_` are notes and are ignored by the site.

### How the binding works

`assets/js/config-loader.js` fetches the JSON and fills any element carrying a `data-config*`
attribute:

| Attribute | Effect |
| --- | --- |
| `data-config="contact.email"` | sets `textContent` |
| `data-config-href="social.linkedin"` | sets `href` |
| `data-config-src="maps.embedUrl"` | sets `src` (iframes get `loading="lazy"`) |
| `data-config-mailto="contact.email"` | builds a `mailto:` link (add `data-config-subject`) |
| `data-config-text` | also use the bound value as the link label |
| `data-config-tel="contact.phoneRaw"` | builds a `tel:` link |
| `data-config-whatsapp="true"` | builds a `wa.me` link with the configured message |
| `data-config-attr="title:maps.title"` | sets arbitrary attributes (pipe-separated) |
| `data-config-repeat="offices"` | repeats its `<template>` per array item, `{{street}}` tokens |
| `data-config-fallback="…"` | text to show if the config cannot be loaded |

**Adding a new contact field:** add it to the JSON, then reference it in HTML with the dotted
path. No JavaScript changes needed.

**If the config fails to load** (offline, 404, bad JSON) every bound element degrades to
"Contact us via LinkedIn" and links point at the LinkedIn page. The site never shows a blank or
broken contact block.

### Structured data uses the same source

The static JSON-LD in each page deliberately contains **no** contact values. `config-loader.js`
injects an `Organization` node with `email`, `telephone`, `sameAs`, `address`, `location` and
`contactPoint` built from the config, sharing the same `@id` so consumers merge the two.
`node tools/strip-contacts.js` fails the build if any config value ever leaks into an HTML file.

### Local `file://` preview

Browsers block `fetch()` of local JSON, so opening `index.html` straight from disk shows the
fallback text. Two ways around it:

```bash
node tools/serve.js               # recommended: http://localhost:8080, zero dependencies
node tools/serve.js 3000          # ...or on another port
# or
node tools/sync-config.js         # writes config/site.config.local.js, a window.__INTELLIVRA_CONFIG__ shim
```

`tools/serve.js` mirrors how Cloudflare Pages and Netlify behave: `/` resolves to `index.html`,
unknown paths return `404.html` with a real 404 status, and responses are sent `no-store` so a
refresh always shows your latest edit.

If you use the shim, add `<script src="config/site.config.local.js"></script>` before
`config-loader.js` in each page's `<head>`, and re-run the script after editing the config.
Remove it before deploying with `node tools/sync-config.js --remove`.

---

## 2. Deploying

The site is a folder of static files. No build command, no output directory transformation.

### Cloudflare Pages

1. Push this folder to GitHub/GitLab.
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Build settings:
   - **Framework preset:** `None`
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/`
4. Deploy, then **Custom domains** → add `intellivraglobal.com` and `www.intellivraglobal.com`.
5. Cloudflare serves `404.html` for unknown paths automatically.

Or without Git: `npx wrangler pages deploy . --project-name=intellivraglobal`

### Netlify

1. Drag the folder onto <https://app.netlify.com/drop>, or connect the repo.
2. Build settings: **build command** empty, **publish directory** `.`.
3. Netlify uses `404.html` automatically. Add a `_redirects` file if you later need rules.
4. **Domain management** → add the custom domain and enable HTTPS.

Or from the CLI: `npx netlify-cli deploy --prod --dir=.`

### GitHub Pages

1. Push to a repo, then **Settings → Pages**.
2. **Source:** `Deploy from a branch`; **Branch:** `main`, folder `/ (root)`.
3. Add a `CNAME` file containing `intellivraglobal.com`, and point DNS at GitHub's IPs.
4. A `.nojekyll` file is already included so Jekyll does not strip anything unexpected.

> **Note:** GitHub Pages serves `404.html` for missing pages but does not let you set custom
> headers. Cloudflare Pages or Netlify are the better fit if you want a CSP or cache-control
> headers later.

### Post-deploy checklist

- [ ] `https://intellivraglobal.com/robots.txt` and `/sitemap.xml` return 200
- [ ] `https://intellivraglobal.com/llms.txt` returns 200 as `text/plain`
- [ ] Submit the sitemap in Google Search Console and Bing Webmaster Tools
- [ ] Validate structured data at <https://validator.schema.org> and Google's Rich Results Test
- [ ] Check the OG card at <https://www.opengraph.xyz>
- [ ] Run Lighthouse on the deployed URL (not `file://` — scores are meaningless locally)

---

## 3. Updating the sitemap

`sitemap.xml` is generated. After adding, renaming or deleting a page:

```bash
node tools/build-seo.js          # rewrites sitemap.xml and llms.txt
node tools/build-seo.js --check  # CI: exit 1 if either file is stale
```

`lastmod` comes from each file's modification time, pages marked `noindex` are excluded
automatically, and priorities live in the `WEIGHTS` map at the top of the script. If you prefer
to hand-edit, keep the format — the file is plain XML.

The same script regenerates **`llms.txt`** from `site.config.json` plus each page's `<title>`
and meta description, so a contact change flows through to the AI-crawler summary without
being retyped.

---

## 4. Updating jobs (`config/jobs.json`)

Careers listings are data. Add an object to the `jobs` array and the page renders a card, a
department filter and a `JobPosting` JSON-LD node for it — no HTML changes.

```jsonc
{
  "id": "IG-2026-031",                       // shown as the requisition number
  "title": "Senior Platform Engineer",
  "department": "Cloud & DevOps",            // becomes a filter button
  "employmentType": "FULL_TIME",             // FULL_TIME | PART_TIME | CONTRACTOR | TEMPORARY | INTERN
  "engagement": "Contract-to-Hire",          // free text, shown as a tag
  "workplace": "Remote",                     // Remote | Hybrid | On-site  (Remote adds TELECOMMUTE)
  "location": { "locality": "Austin", "region": "TX", "country": "US" },
  "datePosted": "2026-08-16",                // ISO date; required by Google Jobs
  "validThrough": "2026-11-30",              // ISO date; expired posts should be removed
  "salary": { "min": 80, "max": 100, "currency": "USD", "unit": "HOUR" },  // unit: HOUR | YEAR
  "summary": "One sentence a candidate can scan.",
  "responsibilities": ["…"],
  "requirements": ["…"],
  "applyEmailSubject": "Application - Senior Platform Engineer (IG-2026-031)"
}
```

Rules of thumb:

- **Remove expired roles.** Google penalises `JobPosting` markup for jobs that are no longer open.
- Keep `validThrough` in the future, and update `"updated"` at the top of the file.
- The apply button builds a `mailto:` from `contact.careersEmail` in `site.config.json`. To use an
  ATS instead, add an `applyUrl` field and use it in `cardHtml()` in `assets/js/careers.js`.
- Validate after editing: `node -e "JSON.parse(require('fs').readFileSync('config/jobs.json','utf8'))"`

---

## 5. Editing layout and styling

- **Design tokens** (colours, radii, spacing, type) live at the top of `assets/css/critical.css`.
- `critical.css` is the canonical copy of the CSS inlined into every page's `<head>`. Edit it
  there, then run `node tools/sync-partials.js` to push it into all eight pages.
- Header, footer and the shared `<head>` assets live in `tools/partials/`. The same script keeps
  them identical across pages and sets `aria-current="page"` on the right nav link.
- Everything below the fold is in `assets/css/main.css`, loaded asynchronously.
- Scroll reveals use CSS `animation-timeline: view()` with a `@supports` guard, so content is
  always visible even where the feature is unsupported, and animations are disabled under
  `prefers-reduced-motion`.

The `tools/` scripts are conveniences, never requirements — the committed HTML is complete and
standalone.

---

## 6. Maintenance scripts

| Command | What it does |
| --- | --- |
| `node tools/serve.js [port]` | Local dev server on http://localhost:8080 (no dependencies) |
| `node tools/sync-partials.js` | Push `critical.css`, head assets, header and footer into every page |
| `node tools/sync-partials.js --check` | CI guard: fail if a page is out of sync |
| `node tools/build-seo.js` | Regenerate `sitemap.xml` and `llms.txt` |
| `node tools/audit.js` | Full static self-review: titles, descriptions, canonicals, OG/Twitter, headings, alt text, labels, links, anchors, sitemap coverage |
| `node tools/strip-contacts.js` | Fail if any contact value is hardcoded in HTML |
| `node tools/validate-jsonld.js` | Parse and validate every JSON-LD block |
| `node tools/sync-config.js` | Write the `file://` preview shim |
| `python tools/make-images.py` | Re-render `og-image.png`, `apple-touch-icon.png`, `favicon-32.png` (needs Pillow) |

A reasonable CI job:

```bash
node tools/sync-partials.js --check
node tools/build-seo.js --check
node tools/strip-contacts.js
node tools/validate-jsonld.js
node tools/audit.js
```

---

## 7. SEO notes

- One `<h1>` per page; headings nest without skipping levels.
- Titles are under 60 characters, meta descriptions under 155, each written as a plain
  declarative sentence that leads with the entity name.
- Body copy is answer-first: each section opens with a factual sentence an LLM can quote, then
  elaborates.
- JSON-LD per page: `Organization`, `WebSite` + `SearchAction`, `WebPage`/`AboutPage`/`ContactPage`,
  `BreadcrumbList` on inner pages, six `Service` nodes on Services, `FAQPage` on Home and Services,
  `ItemList` on Industries, and `JobPosting` per opening on Careers.
- `llms.txt` follows the llms.txt convention: H1 name, blockquote summary, then linked sections.
- `robots.txt` explicitly allows GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot,
  Claude-User, PerplexityBot, Google-Extended, Bingbot, CCBot and others.
- Only `search.html` and `404.html` are `noindex`.

### Remaining TODOs before launch

- Replace every `TODO` in `config/site.config.json` (contact details, addresses, form endpoint).
- Replace the six client-logo placeholders in `assets/img/` and their alt text.
- Replace the three placeholder testimonials on the home page with approved, attributable quotes.
- Replace the four leadership placeholders on `about.html` with names, photos and LinkedIn URLs.
- Confirm the metrics quoted on Home and About against the ATS and finance.
- Publish `privacy.html` and `terms.html`, then link them from `legal` in the config.
