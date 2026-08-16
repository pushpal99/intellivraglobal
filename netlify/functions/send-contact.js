/**
 * send-contact.js - Intellivra Global
 * ===========================================================================
 * Receives the website contact form and delivers it by email.
 *
 *  - The recipient is NOT hardcoded here. It comes from config/site.yaml
 *    (contact.form_recipient), which `npm run build` snapshots into
 *    _site-config.json next to this file. Change the YAML, rebuild, redeploy.
 *  - The API key is NOT in the repo. It is read from the EMAIL_API_KEY
 *    environment variable, set in the Netlify UI (Site settings > Environment).
 *  - The email provider is pluggable: see PROVIDERS below. Resend is the
 *    default; adding another provider means adding one object, not rewriting
 *    the handler.
 *
 * Environment variables (set in Netlify, never committed):
 *   EMAIL_API_KEY   required - the transactional email API key
 *   EMAIL_FROM      optional - verified sender, e.g. "Intellivra Global <noreply@intellivraglobal.com>"
 *   EMAIL_PROVIDER  optional - "resend" (default)
 *
 * Responses are always JSON:
 *   200 { ok: true,  message }
 *   4xx { ok: false, error, fields? }
 *   5xx { ok: false, error }
 */

'use strict';

const siteConfig = require('./_site-config.json');

/* ---------------------------------------------------------------------------
   Provider adapters. Each one turns a normalised message into an HTTP request.
   To swap providers: add an entry here and set EMAIL_PROVIDER in Netlify.
   --------------------------------------------------------------------------- */

const PROVIDERS = {
  resend: {
    endpoint: 'https://api.resend.com/emails',
    headers: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
    body: ({ from, to, replyTo, subject, text, html }) =>
      JSON.stringify({ from, to: [to], reply_to: replyTo, subject, text, html }),
    // Resend returns { id } on success and { message, name } on failure.
    errorMessage: (payload) => (payload && (payload.message || payload.name)) || 'Unknown provider error',
  },

  // Example of how little a second provider costs. Not active unless
  // EMAIL_PROVIDER=postmark and a Postmark token is supplied.
  postmark: {
    endpoint: 'https://api.postmarkapp.com/email',
    headers: (apiKey) => ({
      'X-Postmark-Server-Token': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: ({ from, to, replyTo, subject, text, html }) =>
      JSON.stringify({ From: from, To: to, ReplyTo: replyTo, Subject: subject, TextBody: text, HtmlBody: html }),
    errorMessage: (payload) => (payload && payload.Message) || 'Unknown provider error',
  },
};

/* ---------------------------------------------------------------------------
   Spam controls
   --------------------------------------------------------------------------- */

const RATE_LIMIT = { max: 3, windowMs: 10 * 60 * 1000 }; // 3 messages / 10 min / IP
const MIN_FILL_SECONDS = 3; // a human takes longer than this to complete the form

// Per-container memory. Netlify may run several containers, so this throttles
// casual abuse rather than a determined attacker. For hard limits, put the
// site behind Netlify rate limiting or a WAF rule.
const recentSubmissions = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const hits = (recentSubmissions.get(ip) || []).filter((t) => now - t < RATE_LIMIT.windowMs);
  hits.push(now);
  recentSubmissions.set(ip, hits);

  // Opportunistic cleanup so the map cannot grow without bound.
  if (recentSubmissions.size > 500) {
    for (const [key, times] of recentSubmissions) {
      if (!times.some((t) => now - t < RATE_LIMIT.windowMs)) recentSubmissions.delete(key);
    }
  }
  return hits.length > RATE_LIMIT.max;
}

/* ---------------------------------------------------------------------------
   Validation
   --------------------------------------------------------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (value, max) => String(value === undefined || value === null ? '' : value).trim().slice(0, max);

function validate(data) {
  const fields = {};
  const name = clean(data.name, 120);
  const email = clean(data.email, 180);
  const message = clean(data.message, 4000);
  const company = clean(data.company, 120);
  const phone = clean(data.phone, 40);
  const engagement = clean(data.engagement, 120);
  const timeline = clean(data.timeline, 60);

  if (name.length < 2) fields.name = 'Please tell us your name.';
  if (!EMAIL_RE.test(email)) fields.email = 'Please enter a valid email address.';
  if (message.length < 20) fields.message = 'Please add a little more detail (at least 20 characters).';
  if (phone && !/^[\d\s()+.-]{6,40}$/.test(phone)) fields.phone = 'Please check the phone number.';

  // Newlines in a header-bound field are a classic injection attempt.
  if (/[\r\n]/.test(name) || /[\r\n]/.test(email)) fields.name = 'Please remove line breaks from your name and email.';

  return { fields, value: { name, email, message, company, phone, engagement, timeline } };
}

/* ---------------------------------------------------------------------------
   Message composition
   --------------------------------------------------------------------------- */

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function compose(input, meta) {
  const rows = [
    ['Name', input.name],
    ['Email', input.email],
    ['Company', input.company || '-'],
    ['Phone', input.phone || '-'],
    ['Interested in', input.engagement || 'Not specified'],
    ['Timeline', input.timeline || 'Not specified'],
  ];

  const text = [
    `New enquiry from the ${siteConfig.site_name} website`,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    'Message:',
    input.message,
    '',
    '---',
    `Sent ${meta.timestamp} from ${siteConfig.site_url}/contact.html`,
  ].join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;background:#f7f8fa;padding:24px;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#16202b">
  <table role="presentation" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e1e6ec;border-radius:6px;border-collapse:separate">
    <tr><td style="background:#0f2a43;color:#ffffff;padding:18px 24px;border-radius:6px 6px 0 0;font-size:16px;font-weight:600">
      New enquiry from the ${escapeHtml(siteConfig.site_name)} website
    </td></tr>
    <tr><td style="padding:24px">
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
        ${rows
          .map(
            ([label, value]) =>
              `<tr><td style="padding:6px 0;color:#5a6572;width:130px;vertical-align:top">${escapeHtml(label)}</td>` +
              `<td style="padding:6px 0;color:#16202b">${escapeHtml(value)}</td></tr>`
          )
          .join('')}
      </table>
      <p style="margin:20px 0 6px;color:#5a6572;font-size:13px;text-transform:uppercase;letter-spacing:.08em">Message</p>
      <div style="white-space:pre-wrap;font-size:15px;line-height:1.6;border-left:3px solid #1f5f8b;padding-left:14px">${escapeHtml(
        input.message
      )}</div>
      <p style="margin-top:24px;font-size:13px;color:#5a6572">
        Reply directly to this email to reach ${escapeHtml(input.name)}.
      </p>
    </td></tr>
    <tr><td style="padding:14px 24px;border-top:1px solid #e1e6ec;color:#5a6572;font-size:12px;border-radius:0 0 6px 6px">
      Sent ${escapeHtml(meta.timestamp)} from ${escapeHtml(siteConfig.site_url)}/contact.html
    </td></tr>
  </table>
</body></html>`;

  return { text, html };
}

/* ---------------------------------------------------------------------------
   Handler
   --------------------------------------------------------------------------- */

const json = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(payload),
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { Allow: 'POST, OPTIONS' }, body: '' };
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'This endpoint only accepts POST requests.' });
  }

  // ---- parse ------------------------------------------------------------
  let data;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
    const contentType = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
    data = contentType.includes('application/json')
      ? JSON.parse(raw || '{}')
      : Object.fromEntries(new URLSearchParams(raw));
  } catch {
    return json(400, { ok: false, error: 'We could not read that submission. Please try again.' });
  }

  // ---- spam checks ------------------------------------------------------
  // 1. Honeypot: a hidden field only a bot would fill in.
  const honeypotField = siteConfig.honeypot_field || 'company_website';
  if (clean(data[honeypotField], 200)) {
    // Answer 200 so bots see success and do not retry with a different shape.
    return json(200, { ok: true, message: siteConfig.success_message });
  }

  // 2. Time-to-submit: forms completed instantly are automated.
  const startedAt = Number(data.form_started_at);
  if (Number.isFinite(startedAt) && startedAt > 0) {
    const seconds = (Date.now() - startedAt) / 1000;
    if (seconds < MIN_FILL_SECONDS) {
      return json(429, { ok: false, error: 'That was submitted a little too quickly. Please try again.' });
    }
  }

  // 3. Per-IP throttle.
  const ip =
    (event.headers['x-nf-client-connection-ip'] ||
      (event.headers['x-forwarded-for'] || '').split(',')[0] ||
      'unknown').trim();
  if (rateLimited(ip)) {
    return json(429, {
      ok: false,
      error: 'You have sent several messages already. Please email us directly if it is urgent.',
    });
  }

  // ---- validation -------------------------------------------------------
  const { fields, value } = validate(data);
  if (Object.keys(fields).length) {
    return json(422, { ok: false, error: 'Please check the highlighted fields and try again.', fields });
  }

  // ---- provider ---------------------------------------------------------
  const providerName = (process.env.EMAIL_PROVIDER || 'resend').toLowerCase();
  const provider = PROVIDERS[providerName];
  const apiKey = process.env.EMAIL_API_KEY;

  if (!provider) {
    console.error(`Unknown EMAIL_PROVIDER: ${providerName}`);
    return json(500, { ok: false, error: siteConfig.error_message });
  }
  if (!apiKey) {
    console.error('EMAIL_API_KEY is not set in the Netlify environment.');
    return json(500, { ok: false, error: siteConfig.error_message });
  }
  if (!siteConfig.recipient) {
    console.error('No recipient in _site-config.json - run `npm run build` before deploying.');
    return json(500, { ok: false, error: siteConfig.error_message });
  }

  // ---- send -------------------------------------------------------------
  const timestamp = new Date().toUTCString();
  const { text, html } = compose(value, { timestamp });
  const from = process.env.EMAIL_FROM || `${siteConfig.from_name} <onboarding@resend.dev>`;
  const subject = `Website enquiry: ${value.name}${value.company ? ` (${value.company})` : ''}`;

  try {
    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: provider.headers(apiKey),
      body: provider.body({ from, to: siteConfig.recipient, replyTo: value.email, subject, text, html }),
    });

    if (!response.ok) {
      let payload = null;
      try { payload = await response.json(); } catch { /* non-JSON error body */ }
      console.error(`${providerName} responded ${response.status}: ${provider.errorMessage(payload)}`);
      return json(502, { ok: false, error: siteConfig.error_message });
    }

    return json(200, { ok: true, message: siteConfig.success_message });
  } catch (err) {
    console.error(`Email send failed: ${err.message}`);
    return json(502, { ok: false, error: siteConfig.error_message });
  }
};
