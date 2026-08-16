/*!
 * contact.js - Intellivra Global
 * Wires the contact form to the endpoint stored in site.config.json
 * (forms.contactEndpoint). Plug in Formspree / Web3Forms there - nothing in
 * this file or in contact.html needs to change.
 *
 * Before the config resolves the form still works: it degrades to a normal
 * HTML POST if JS is unavailable, and shows the LinkedIn fallback if the
 * endpoint is missing or still set to the TODO placeholder.
 */
(function () {
  'use strict';

  var form = document.getElementById('contact-form');
  if (!form) return;

  var status = document.getElementById('form-status');
  var submit = form.querySelector('button[type="submit"]');
  var config = null;

  function setStatus(state, message) {
    if (!status) return;
    status.hidden = false;
    status.setAttribute('data-state', state);
    status.textContent = message;
  }

  function endpointReady() {
    var url = config && config.forms && config.forms.contactEndpoint;
    return typeof url === 'string' && /^https?:\/\//.test(url) && url.indexOf('TODO') === -1;
  }

  function applyConfig(cfg) {
    config = cfg;
    if (!cfg || !cfg.forms) return;
    if (cfg.forms.contactEndpoint) form.setAttribute('action', cfg.forms.contactEndpoint);
    if (cfg.forms.method) form.setAttribute('method', cfg.forms.method);
  }

  form.addEventListener('submit', function (event) {
    if (!form.checkValidity()) return; // let the browser show its own messages

    event.preventDefault();

    if (!endpointReady()) {
      setStatus('error', (config && config.forms && config.forms.errorMessage) ||
        'The form endpoint is not configured yet. Please email us or reach out on LinkedIn.');
      return;
    }

    var data = new FormData(form);
    var honeypot = (config.forms.honeypotField || '_gotcha');
    if (data.get(honeypot)) return; // silently drop bots

    if (submit) { submit.disabled = true; submit.textContent = 'Sending...'; }
    setStatus('pending', 'Sending your message...');

    fetch(config.forms.contactEndpoint, {
      method: config.forms.method || 'POST',
      body: data,
      headers: { Accept: 'application/json' }
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        form.reset();
        setStatus('success', config.forms.successMessage || 'Thanks - your message reached our team.');
      })
      .catch(function () {
        setStatus('error', config.forms.errorMessage || 'We could not send that message. Please email us directly.');
      })
      .then(function () {
        if (submit) { submit.disabled = false; submit.textContent = 'Send message'; }
      });
  });

  if (window.INTELLIVRA_CONFIG) applyConfig(window.INTELLIVRA_CONFIG);
  else {
    document.addEventListener('config:ready', function (event) { applyConfig(event.detail); });
    document.addEventListener('config:failed', function () {
      setStatus('error', 'Our form is temporarily unavailable. Please reach us on LinkedIn.');
    });
  }
})();
