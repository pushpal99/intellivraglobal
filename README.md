# Intellivra Global — marketing site

Static marketing site for **intellivraglobal.com**. Plain HTML, CSS and vanilla JavaScript,
generated from a single YAML config by a small Node build step, deployed to Netlify by GitHub
Actions. The contact form is delivered by a Netlify serverless function.

> **To change any contact or company info, edit `config/site.yaml` and rebuild.**
> Nothing is hardcoded in the templates.

```
INTELLIVRAGLOBAL/
├── config/site.yaml            ← SINGLE SOURCE OF TRUTH (company, contact, services, FAQs)
├── build.js                    ← reads the YAML, writes dist/
├── src/
│   ├── pages/*.html            page templates ({{ tokens }} + a <!--meta--> block)
│   ├── partials/               header.html, footer.html
│   └── assets/                 css/, js/, img/
├── netlify/functions/
│   └── send-contact.js         contact form → email (Resend)
├── tools/                      build-time checks and a dev server
├── netlify.toml                build command, publish dir, functions dir, redirects, headers
├── .github/workflows/deploy.yml  CI: build + lint on PRs, deploy on push to main
├── .env.example                every variable you need to set, with no real values
└── dist/                       generated — gitignored, never edited by hand
```

---

## Quick start

```bash
npm ci          # install (js-yaml is the only dependency)
npm run build   # config/site.yaml + src/ -> dist/
npm run serve   # preview dist/ at http://localhost:8080
npm run dev     # build, then serve
npm run lint    # contacts + JSON-LD + SEO/a11y audit + function tests
npm test        # serverless function tests only (no email is sent)
```

---

## 1. Editing company and contact details

Everything lives in **`config/site.yaml`**: legal name, tagline, description, all email
addresses, phones, WhatsApp, both office addresses, social links, business hours, the Google
Maps embed, footer legal text, and `contact.form_recipient`.

```yaml
contact:
  form_recipient: akram.akram.raza25@gmail.com   # where the contact form is delivered
  email: hello@intellivraglobal.com
  phone: "+1 (469) 555-0142"                     # display format
  phone_raw: "+14695550142"                      # E.164, used for tel: links and schema
  whatsapp_raw: "14695550142"                    # digits only, used for wa.me links

offices:                                          # add or remove freely; the UI repeats over this list
  - label: US Headquarters
    street: 1301 Central Expressway South, Suite 200
    ...
```

Edit, then `npm run build`. The build injects the values into every page **and** regenerates:

| Output | Contains |
| --- | --- |
| `dist/*.html` | visible copy, `mailto:`/`tel:`/`wa.me` links, offices, footer |
| JSON-LD in each page | `Organization` (with `contactPoint`, `address`, `sameAs`), `WebSite` + `SearchAction`, `WebPage`/`AboutPage`/`ContactPage`, `BreadcrumbList`, six `Service` nodes, `FAQPage`, `ItemList` |
| `dist/sitemap.xml` | every indexable page with `lastmod`, `changefreq`, `priority` |
| `dist/robots.txt` | search + AI crawler allowlist (from `crawlers:` in the YAML) |
| `dist/llms.txt` | machine-readable company summary for answer engines |
| `netlify/functions/_site-config.json` | the recipient and messages the function needs |

Services, industries and FAQs also live in the YAML, so the visible accordions and the
`FAQPage`/`Service` structured data are generated from the same entries and cannot drift apart.
Adding a service adds its card, its detail section, its footer link, its search entry and its
schema node — in one place.

`npm run lint:contacts` fails the build if any of those values is ever pasted into a template.

### Template syntax

`src/pages/*.html` open with a `<!--meta ... -->` JSON block (title, description, nav label,
sitemap priority, which FAQ set to render), then use:

| Syntax | Meaning |
| --- | --- |
| `{{ contact.email }}` | escaped value from the YAML |
| `{{{ raw }}}` | unescaped (used for inline SVG) |
| `{{> header }}` | include `src/partials/header.html` |
| `{{#each services}} … {{/each}}` | loop; inside use `{{ this.name }}`, `{{ @index }}`, `{{ @padded }}`, `{{ @first }}` |
| `{{#if this.label}} … {{else}} … {{/if}}` | conditional |

An unknown token fails the build rather than rendering blank.

---

## 2. Contact form

### How it works

1. The visitor submits `contact.html`. `src/assets/js/contact.js` validates in the browser and
   POSTs JSON with `fetch()` — the page never reloads.
2. `netlify/functions/send-contact.js` validates again server-side, applies spam checks, and
   sends the email through Resend.
3. It goes to `contact.form_recipient` from `config/site.yaml`. The address is **not** in the
   function source; the build writes it to `netlify/functions/_site-config.json`.
4. `Reply-To` is set to the visitor, so replying from your inbox reaches them directly.

Spam handling, in order: a honeypot field (named in the YAML) that returns a fake success;
a minimum fill time of 3 seconds; and a per-IP rate limit of 3 messages per 10 minutes.
The rate limit is per function container — for hard guarantees, add Netlify rate limiting.

### Setting it up with Resend (primary path)

1. Create an account at <https://resend.com>.
2. **Domains → Add domain** → `intellivraglobal.com`, then add the DNS records Resend shows.
   Until the domain is verified you can only send to your own address.
3. **API Keys → Create API Key** (send access is enough). Copy it once.
4. In Netlify: **Site configuration → Environment variables → Add**:

   | Key | Value |
   | --- | --- |
   | `EMAIL_API_KEY` | the Resend key (`re_…`) |
   | `EMAIL_FROM` | `Intellivra Global <noreply@intellivraglobal.com>` |
   | `EMAIL_PROVIDER` | `resend` (optional; it is the default) |

5. Redeploy. Send a test message from `/contact.html`.

The key is never committed and never appears in the GitHub workflow — only in Netlify.

### Swapping the email provider

`send-contact.js` has a `PROVIDERS` map. Each entry supplies an endpoint, headers, a body
builder and an error reader. A Postmark adapter is already there as a worked example: set
`EMAIL_PROVIDER=postmark` and put the server token in `EMAIL_API_KEY`. Adding SendGrid or
Mailgun is one more object, not a rewrite.

### Zero-backend fallback: Web3Forms

If Resend is not set up yet — or you want the form live before touching DNS — Web3Forms needs
no server at all.

1. Get a free access key at <https://web3forms.com> (enter the destination address; they email
   you the key).
2. In `config/site.yaml`:

   ```yaml
   forms:
     provider: web3forms                  # was: netlify
     web3forms_access_key: "your-key-here"
   ```

3. `npm run build` and deploy.

The form then posts straight to `https://api.web3forms.com/submit` with the access key, and the
serverless function is bypassed entirely. Trade-offs: the access key is visible in the page
source (it only allows sending to the address you registered), delivery and templating are
Web3Forms', and the per-IP rate limit and fill-time check no longer apply — only the honeypot,
which Web3Forms also supports. Switch back by setting `provider: netlify`.

---

## 3. Theme

The palette is defined once, as CSS custom properties in the `:root` block of
`src/assets/css/critical.css`. There are no hex or `rgba()` literals anywhere else in the CSS.

| Token | Value | Used for |
| --- | --- | --- |
| `--navy-900` | `#0f2a43` | header, footer, closing CTA band, stat numerals |
| `--accent` | `#1f5f8b` | the single accent: links, primary buttons, active states |
| `--gray-50` … `--gray-900` | neutral scale | surfaces, borders, three levels of text |
| `--line-control` | `#7e8896` | form control borders (3:1 for WCAG 1.4.11) |

Backgrounds are white and `--gray-50`; navy is reserved for the header, footer and the one
closing band per page. Headings use Inter Tight, body copy uses Inter, both from a single
Google Fonts request. Decorative scroll animations were removed — only short hover, focus and
open/close transitions remain, and they are disabled under `prefers-reduced-motion`.

Every text/background pair meets WCAG AA; the lowest is 5.24:1 (subtle text on `--gray-100`)
and interactive borders sit at 3.59:1.

Changing the palette means editing the tokens, running `npm run build`, and re-running
`python tools/make-images.py` (needs Pillow) to re-render `og-image.png`, `apple-touch-icon.png`
and `favicon-32.png` in the new colours. `favicon.svg` and `logo.svg` are hand-edited SVGs that
also carry the navy.

---

## 4. Deploying

### One-time setup

**Netlify**

1. **Add new site → Import an existing project** → pick the GitHub repo.
2. Build settings come from `netlify.toml` (`npm run build`, publish `dist`, functions
   `netlify/functions`). Leave the UI fields empty.
3. Add the environment variables from section 2.
4. **Domain management** → add `intellivraglobal.com` and `www.intellivraglobal.com`.
5. Copy the **Site ID** from **Site configuration → General**.

**GitHub**

1. **Settings → Secrets and variables → Actions → New repository secret**:

   | Secret | Where to get it |
   | --- | --- |
   | `NETLIFY_AUTH_TOKEN` | Netlify → User settings → Applications → Personal access tokens |
   | `NETLIFY_SITE_ID` | Netlify → Site configuration → General → Site ID |

2. Do **not** add `EMAIL_API_KEY` here. It belongs in Netlify only.

### The pipeline

`.github/workflows/deploy.yml`:

- **Pull request into `main`** → `npm ci` → `npm run build` → `npm run lint` → upload the built
  site as an artifact. **No deploy.**
- **Push to `main`** (including a merged PR) → the same checks, then deploy to production with
  the Netlify CLI.

Every tunable is an `env:` value at the top of the workflow, so changing the Node version,
build command, publish directory, functions directory or site name is a one-line edit:

```yaml
env:
  NODE_VERSION: "20"
  BUILD_COMMAND: "npm run build"
  PUBLISH_DIR: "dist"
  FUNCTIONS_DIR: "netlify/functions"
  SITE_NAME: "intellivraglobal"
  NETLIFY_CLI_VERSION: "17"
```

Netlify's own Git integration can stay on for deploy previews; the Actions workflow is what
publishes production.

### Manual deploy

```bash
npm run build
npx netlify-cli deploy --prod --dir=dist --functions=netlify/functions
```

### Post-deploy checklist

- [ ] `/robots.txt`, `/sitemap.xml`, `/llms.txt` return 200
- [ ] `/careers` and `/careers.html` 301 to `/contact.html` (redirects in `netlify.toml`)
- [ ] Send a real message through `/contact.html` and confirm it arrives
- [ ] Check the function log in Netlify if it does not
- [ ] Submit the sitemap in Google Search Console and Bing Webmaster Tools
- [ ] Validate structured data at <https://validator.schema.org>
- [ ] Run Lighthouse against the deployed URL

---

## 5. Maintenance scripts

| Command | What it does |
| --- | --- |
| `npm run build` | Generate `dist/` from `config/site.yaml` and `src/` |
| `npm run clean` | Delete `dist/` |
| `npm run serve` | Preview `dist/` on http://localhost:8080 |
| `npm run dev` | Build, then serve |
| `npm run lint` | All four checks below |
| `npm run lint:contacts` | Fail if any contact/company value is hardcoded in `src/` or the function |
| `npm run lint:jsonld` | Parse and validate every JSON-LD block in `dist/` |
| `npm run lint:audit` | Titles, descriptions, canonicals, OG/Twitter, headings, alt text, labels, dead links, sitemap coverage, spam handling |
| `npm test` | Exercise the serverless function with a stubbed `fetch` — no email sent, no key needed |
| `python tools/make-images.py` | Re-render the OG image and icons (needs Pillow) |

To test the function with the real Netlify runtime locally:

```bash
npm run build
npx netlify-cli dev          # serves dist/ and /.netlify/functions/*
```

---

## 6. Notes and remaining TODOs

- The Careers page was removed. `/careers` and `/careers.html` redirect to `/contact.html`;
  the `careers@` mailbox is still published on the contact page.
- `search.html` is `noindex` and excluded from the sitemap; it exists so the `SearchAction` in
  the `WebSite` schema points somewhere real. Its index is generated from the YAML.

Before launch:

- [ ] Replace every `TODO` in `config/site.yaml` (addresses, phone numbers, real mailboxes)
- [ ] Point `contact.form_recipient` at the real destination if it should not stay a personal Gmail
- [ ] Replace the six client-logo placeholders in `src/assets/img/` and their alt text
- [ ] Replace the three placeholder testimonials on the home page with approved quotes
- [ ] Replace the four leadership placeholders on `about.html`
- [ ] Confirm the metrics on the home and about pages against the ATS and finance
- [ ] Publish privacy and terms pages, then link them from `legal:` in the YAML
