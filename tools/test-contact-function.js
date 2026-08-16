#!/usr/bin/env node
/**
 * test-contact-function.js - Intellivra Global
 *
 * Exercises netlify/functions/send-contact.js without sending real email:
 * global fetch is stubbed, so nothing leaves the machine and no API key is
 * needed. Run after a build (the function reads _site-config.json).
 *
 *   npm test
 */

'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const cfg = yaml.load(fs.readFileSync(path.join(ROOT, 'config', 'site.yaml'), 'utf8'));
const CONFIG_SNAPSHOT = path.join(ROOT, 'netlify', 'functions', '_site-config.json');

if (!fs.existsSync(CONFIG_SNAPSHOT)) {
  console.error('netlify/functions/_site-config.json missing. Run `npm run build` first.');
  process.exit(1);
}

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
  }
}

/* ---- fetch stub -------------------------------------------------------- */

let sent = [];
let nextResponse = { ok: true, status: 200, payload: { id: 'stub-id' } };

global.fetch = async (url, options) => {
  sent.push({ url, options, body: JSON.parse(options.body) });
  return {
    ok: nextResponse.ok,
    status: nextResponse.status,
    json: async () => nextResponse.payload,
  };
};

/* ---- helpers ----------------------------------------------------------- */

const { handler } = require(path.join(ROOT, 'netlify', 'functions', 'send-contact.js'));

const VALID = {
  name: 'Dana Whitfield',
  email: 'dana@example.com',
  company: 'Northvale Health',
  phone: '+1 469 555 0111',
  engagement: 'IT staff augmentation',
  timeline: 'Within 30 days',
  message: 'We need two senior data engineers for a Databricks migration starting next month.',
};

function post(body, extraHeaders, ip) {
  return handler({
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': ip || '203.0.113.5', ...extraHeaders },
    body: JSON.stringify(body),
  });
}

const parse = (res) => JSON.parse(res.body);

/* ---- tests ------------------------------------------------------------- */

(async () => {
  console.log('\n  send-contact.js\n');

  // 1. Method guard
  let res = await handler({ httpMethod: 'GET', headers: {}, body: '' });
  check('rejects GET with 405', res.statusCode === 405);

  // 2. Missing API key is a server error, not a silent success
  delete process.env.EMAIL_API_KEY;
  res = await post({ ...VALID, form_started_at: Date.now() - 20000 });
  check('fails cleanly when EMAIL_API_KEY is unset', res.statusCode === 500 && parse(res).ok === false);
  check('does not leak internals to the visitor', !/EMAIL_API_KEY/i.test(res.body), res.body);

  process.env.EMAIL_API_KEY = 'test-key-not-real';

  // 3. Validation
  res = await post({ name: 'D', email: 'nope', message: 'too short', form_started_at: Date.now() - 20000 });
  const invalid = parse(res);
  check('rejects invalid input with 422', res.statusCode === 422);
  check('reports per-field errors', invalid.fields && invalid.fields.name && invalid.fields.email && invalid.fields.message);
  check('field errors are plain English', /Please/.test(invalid.fields.email));

  // 4. Honeypot is silently accepted, and nothing is sent
  sent = [];
  res = await post({ ...VALID, form_started_at: Date.now() - 20000, [cfg.forms.honeypot_field]: 'http://spam.example' });
  check('honeypot returns 200 without sending', res.statusCode === 200 && sent.length === 0);

  // 5. Instant submissions are rejected
  res = await post({ ...VALID, form_started_at: Date.now() }, {}, '203.0.113.9');
  check('rejects a form submitted instantly', res.statusCode === 429);

  // 6. Happy path
  sent = [];
  res = await post({ ...VALID, form_started_at: Date.now() - 20000 }, {}, '198.51.100.7');
  const okBody = parse(res);
  check('accepts a valid submission', res.statusCode === 200 && okBody.ok === true);
  check('shows the configured success message', okBody.message === cfg.forms.success_message);
  check('calls the Resend endpoint', sent.length === 1 && sent[0].url === 'https://api.resend.com/emails');
  check('sends the API key as a bearer token', sent[0].options.headers.Authorization === 'Bearer test-key-not-real');
  check(
    'delivers to contact.form_recipient from the YAML',
    sent[0].body.to[0] === cfg.contact.form_recipient,
    `got ${sent[0].body.to && sent[0].body.to[0]}`
  );
  check('sets reply_to to the visitor', sent[0].body.reply_to === VALID.email);
  check('includes the message body', sent[0].body.text.includes(VALID.message));
  check('escapes HTML in the html part', !/<script>/i.test(sent[0].body.html));

  // 7. Provider failure surfaces as a friendly error
  nextResponse = { ok: false, status: 401, payload: { message: 'API key is invalid' } };
  res = await post({ ...VALID, form_started_at: Date.now() - 20000 }, {}, '198.51.100.8');
  check('maps a provider failure to 502 with a friendly message', res.statusCode === 502 && parse(res).error === cfg.forms.error_message);
  check('does not echo the provider error to the visitor', !/API key/i.test(res.body));
  nextResponse = { ok: true, status: 200, payload: { id: 'stub-id' } };

  // 8. Rate limiting per IP
  const ip = '198.51.100.20';
  const results = [];
  for (let i = 0; i < 5; i += 1) {
    results.push((await post({ ...VALID, form_started_at: Date.now() - 20000 }, {}, ip)).statusCode);
  }
  check('throttles repeated submissions from one IP', results.filter((s) => s === 429).length >= 1, results.join(','));

  // 9. XSS attempt is neutralised
  sent = [];
  await post(
    { ...VALID, name: '<script>alert(1)</script>', form_started_at: Date.now() - 20000 },
    {},
    '198.51.100.30'
  );
  check('escapes a script tag in the name', sent.length === 1 && sent[0].body.html.includes('&lt;script&gt;'));

  // 10. Header injection attempt
  res = await post({ ...VALID, name: 'Dana\r\nBcc: evil@example.com', form_started_at: Date.now() - 20000 }, {}, '198.51.100.31');
  check('rejects newlines in the name field', res.statusCode === 422);

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
