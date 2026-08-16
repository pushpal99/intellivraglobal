/*!
 * contact.js - Intellivra Global
 * Submits the contact form with fetch() - the page never reloads. Everything
 * configurable (endpoint, provider, messages, honeypot field name) arrives as
 * data-* attributes injected at build time from config/site.yaml.
 *
 * Messages shown to visitors are plain English on purpose: no status codes,
 * no jargon, and always a way to reach us if something goes wrong.
 */
(function () {
  'use strict';

  var form = document.getElementById('contact-form');
  if (!form) return;

  var statusBox = document.getElementById('form-status');
  var submitBtn = form.querySelector('button[type="submit"]');
  var startedField = document.getElementById('form_started_at');

  var settings = {
    endpoint: form.getAttribute('data-endpoint') || '',
    provider: form.getAttribute('data-provider') || 'netlify',
    honeypot: form.getAttribute('data-honeypot') || 'company_website',
    accessKey: form.getAttribute('data-access-key') || '',
    success: form.getAttribute('data-success') || 'Thank you. Your message has been sent.',
    error: form.getAttribute('data-error') || 'We could not send your message. Please email us instead.'
  };

  // Timestamp the moment the page is ready; the server rejects instant submits.
  if (startedField) startedField.value = String(Date.now());

  /* ---------- status and field errors ---------- */

  function setStatus(state, message) {
    if (!statusBox) return;
    statusBox.hidden = false;
    statusBox.setAttribute('data-state', state);
    statusBox.textContent = message;
  }

  function clearStatus() {
    if (statusBox) statusBox.hidden = true;
  }

  function showFieldError(name, message) {
    var input = form.querySelector('[name="' + name + '"]');
    var slot = document.getElementById(name + '-error');
    if (slot) {
      slot.textContent = message;
      slot.hidden = false;
    }
    if (input) input.setAttribute('aria-invalid', 'true');
  }

  function clearFieldErrors() {
    Array.prototype.forEach.call(form.querySelectorAll('.field-error'), function (el) {
      el.textContent = '';
      el.hidden = true;
    });
    Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid]'), function (el) {
      el.removeAttribute('aria-invalid');
    });
  }

  /* ---------- client-side checks (the server repeats all of them) ---------- */

  function validate() {
    var problems = [];
    var name = form.elements.name.value.trim();
    var email = form.elements.email.value.trim();
    var message = form.elements.message.value.trim();

    if (name.length < 2) problems.push(['name', 'Please tell us your name.']);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) problems.push(['email', 'Please enter a valid email address.']);
    if (message.length < 20) problems.push(['message', 'Please add a little more detail so we can help.']);
    if (!form.elements.consent.checked) problems.push(['consent', 'Please tick the box so we can reply to you.']);

    return problems;
  }

  /* ---------- submit ---------- */

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    clearFieldErrors();
    clearStatus();

    var problems = validate();
    if (problems.length) {
      problems.forEach(function (pair) { showFieldError(pair[0], pair[1]); });
      setStatus('error', 'Please check the highlighted fields above and try again.');
      var firstField = form.querySelector('[name="' + problems[0][0] + '"]');
      if (firstField) firstField.focus();
      return;
    }

    if (!settings.endpoint) {
      setStatus('error', settings.error);
      return;
    }

    var payload = {};
    new FormData(form).forEach(function (value, key) { payload[key] = value; });

    // Web3Forms is the zero-backend fallback path (see the README). It needs
    // its access key in the payload; the Netlify function does not.
    if (settings.provider === 'web3forms') {
      payload.access_key = settings.accessKey;
      payload.subject = 'Website enquiry from ' + (payload.name || 'a visitor');
      payload.botcheck = '';
    }

    var originalLabel = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
    }
    setStatus('pending', 'Sending your message...');

    fetch(settings.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          return { ok: response.ok, status: response.status, body: body };
        });
      })
      .then(function (result) {
        // Web3Forms answers { success: true }; our function answers { ok: true }.
        var succeeded = result.ok && (result.body.ok === true || result.body.success === true);

        if (succeeded) {
          form.reset();
          if (startedField) startedField.value = String(Date.now());
          setStatus('success', result.body.message || settings.success);
          if (statusBox) statusBox.focus && statusBox.focus();
          return;
        }

        if (result.body.fields) {
          Object.keys(result.body.fields).forEach(function (key) {
            showFieldError(key, result.body.fields[key]);
          });
        }
        setStatus('error', result.body.error || result.body.message || settings.error);
      })
      .catch(function () {
        setStatus('error', settings.error);
      })
      .then(function () {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel || 'Send message';
        }
      });
  });
})();
