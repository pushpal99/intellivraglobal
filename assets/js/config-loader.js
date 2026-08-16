/*!
 * config-loader.js - Intellivra Global
 * ---------------------------------------------------------------------------
 * The ONLY place contact details enter the DOM. No page hardcodes an email,
 * phone number, address, social URL or map URL; every one of them is read from
 * /config/site.config.json at runtime and written into elements that carry a
 * data-config* attribute.
 *
 * Supported attributes
 *   data-config="contact.email"                -> textContent
 *   data-config-html="legal.footerText"        -> innerHTML (trusted config only)
 *   data-config-href="social.linkedin"         -> href
 *   data-config-src="maps.embedUrl"            -> src
 *   data-config-attr="title:maps.title|aria-label:company.legalName"
 *   data-config-mailto="contact.email"         -> href="mailto:..."
 *   data-config-text                           -> use the bound value as the label too
 *   data-config-tel="contact.phoneRaw"         -> href="tel:..."
 *   data-config-whatsapp="true"                -> builds a wa.me link + message
 *   data-config-repeat="offices"               -> clones its <template> per item,
 *                                                 resolving {{street}} style tokens
 *   data-config-fallback="Contact us via LinkedIn"  -> per-element failure text
 *
 * Failure handling: if the fetch fails (offline, 404, or a file:// origin that
 * blocks JSON requests) the loader falls back to window.__INTELLIVRA_CONFIG__
 * when the optional local-preview shim is present, and otherwise degrades every
 * bound element to friendly text plus a LinkedIn link, never a blank page.
 */
(function () {
  'use strict';

  var CONFIG_URL = document.documentElement.getAttribute('data-config-url') || 'config/site.config.json';
  var GLOBAL_FALLBACK = 'Contact us via LinkedIn';
  var LINKEDIN_FALLBACK = 'https://www.linkedin.com/company/intellivraglobal';

  /* ---------- tiny helpers ------------------------------------------------ */

  function get(obj, path) {
    if (!obj || !path) return undefined;
    return path.split('.').reduce(function (acc, key) {
      if (acc === null || acc === undefined) return undefined;
      var idx = key.match(/^(\w+)\[(\d+)\]$/); // offices[0]
      if (idx) {
        var arr = acc[idx[1]];
        return Array.isArray(arr) ? arr[Number(idx[2])] : undefined;
      }
      return acc[key];
    }, obj);
  }

  function fill(template, item) {
    return String(template).replace(/\{\{\s*([\w.\[\]]+)\s*\}\}/g, function (match, path) {
      var value = get(item, path);
      return value === undefined || value === null ? '' : String(value);
    });
  }

  function each(selector, root, fn) {
    var nodes = (root || document).querySelectorAll(selector);
    Array.prototype.forEach.call(nodes, fn);
  }

  /* ---------- binding ----------------------------------------------------- */

  function applyBindings(cfg, root) {
    root = root || document;

    each('[data-config]', root, function (el) {
      var value = get(cfg, el.getAttribute('data-config'));
      if (value !== undefined && value !== null && value !== '') el.textContent = value;
    });

    each('[data-config-html]', root, function (el) {
      var value = get(cfg, el.getAttribute('data-config-html'));
      if (typeof value === 'string' && value) el.innerHTML = value;
    });

    each('[data-config-href]', root, function (el) {
      var value = get(cfg, el.getAttribute('data-config-href'));
      if (value) el.setAttribute('href', value);
    });

    each('[data-config-src]', root, function (el) {
      var value = get(cfg, el.getAttribute('data-config-src'));
      if (!value) return;
      if (el.tagName === 'IFRAME') el.setAttribute('loading', el.getAttribute('loading') || 'lazy');
      el.setAttribute('src', value);
    });

    each('[data-config-attr]', root, function (el) {
      el.getAttribute('data-config-attr').split('|').forEach(function (pair) {
        var bits = pair.split(':');
        var attr = (bits.shift() || '').trim();
        var value = get(cfg, bits.join(':').trim());
        if (attr && value) el.setAttribute(attr, value);
      });
    });

    each('[data-config-mailto]', root, function (el) {
      var address = get(cfg, el.getAttribute('data-config-mailto'));
      if (!address) return;
      var subject = el.getAttribute('data-config-subject');
      el.setAttribute('href', 'mailto:' + address + (subject ? '?subject=' + encodeURIComponent(subject) : ''));
      // Only links that opt in show the raw address as their label.
      if (el.hasAttribute('data-config-text')) el.textContent = address;
    });

    each('[data-config-tel]', root, function (el) {
      var raw = get(cfg, el.getAttribute('data-config-tel'));
      if (!raw) return;
      el.setAttribute('href', 'tel:' + String(raw).replace(/[^\d+]/g, ''));
    });

    each('[data-config-whatsapp]', root, function (el) {
      var number = get(cfg, 'contact.whatsappRaw');
      if (!number) return;
      var text = get(cfg, 'contact.whatsappMessage');
      el.setAttribute('href', 'https://wa.me/' + String(number).replace(/\D/g, '') + (text ? '?text=' + encodeURIComponent(text) : ''));
      el.setAttribute('rel', 'noopener');
    });

    each('[data-config-repeat]', root, function (host) {
      var items = get(cfg, host.getAttribute('data-config-repeat'));
      var tpl = host.querySelector('template');
      if (!Array.isArray(items) || !tpl) return;
      host.innerHTML = items.map(function (item) { return fill(tpl.innerHTML, item); }).join('');
      host.removeAttribute('data-config-repeat');
    });

    injectOrganizationSchema(cfg);

    document.documentElement.setAttribute('data-config-state', 'ready');
    document.dispatchEvent(new CustomEvent('config:ready', { detail: cfg }));
  }

  /* ---------- structured data -------------------------------------------- *
   * The static JSON-LD in each page deliberately carries no contact details.
   * They are added here from the config and merged by consumers through the
   * shared @id, so schema.org output has exactly one source of truth too.
   * -------------------------------------------------------------------------- */

  function injectOrganizationSchema(cfg) {
    if (!cfg || !cfg.site || !cfg.site.url) return;

    var base = String(cfg.site.url).replace(/\/+$/, '');
    var contact = cfg.contact || {};
    var offices = Array.isArray(cfg.offices) ? cfg.offices : [];
    var hours = (cfg.businessHours && cfg.businessHours.structured) || [];

    var postal = function (office) {
      return {
        '@type': 'PostalAddress',
        streetAddress: office.street,
        addressLocality: office.locality,
        addressRegion: office.region,
        postalCode: office.postalCode,
        addressCountry: office.countryCode || office.country
      };
    };

    var node = {
      '@type': 'Organization',
      '@id': base + '/#organization',
      name: (cfg.company && cfg.company.shortName) || cfg.site.name,
      legalName: cfg.company && cfg.company.legalName,
      url: base + '/',
      logo: cfg.site.logo,
      email: contact.email,
      telephone: contact.phoneRaw || contact.phone,
      sameAs: Object.keys(cfg.social || {}).map(function (key) { return cfg.social[key]; }).filter(Boolean),
      address: offices.map(postal),
      location: offices.map(function (office) {
        return {
          '@type': 'Place',
          name: (cfg.site.name || 'Office') + ' - ' + office.label,
          address: postal(office),
          telephone: office.phoneRaw || office.phone
        };
      }),
      contactPoint: [
        {
          '@type': 'ContactPoint',
          contactType: 'sales',
          email: contact.salesEmail || contact.email,
          telephone: contact.phoneRaw || contact.phone,
          areaServed: 'US',
          availableLanguage: ['English'],
          hoursAvailable: hours.map(function (slot) {
            return {
              '@type': 'OpeningHoursSpecification',
              dayOfWeek: slot.days,
              opens: slot.opens,
              closes: slot.closes
            };
          })
        },
        {
          '@type': 'ContactPoint',
          contactType: 'human resources',
          email: contact.careersEmail || contact.email,
          areaServed: offices.map(function (office) { return office.countryCode; }).filter(Boolean),
          availableLanguage: ['English']
        }
      ]
    };

    try {
      var script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-generated', 'config-loader.js');
      script.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': [node] });
      document.head.appendChild(script);
    } catch (err) {
      /* structured data is an enhancement; never block the page for it */
    }
  }

  /* ---------- graceful degradation ---------------------------------------- */

  function applyFallback(reason) {
    each('[data-config],[data-config-html],[data-config-mailto],[data-config-repeat]', document, function (el) {
      var text = el.getAttribute('data-config-fallback') || GLOBAL_FALLBACK;
      el.textContent = text;
    });
    each('[data-config-href],[data-config-mailto],[data-config-tel],[data-config-whatsapp]', document, function (el) {
      el.setAttribute('href', el.getAttribute('data-config-fallback-href') || LINKEDIN_FALLBACK);
      el.setAttribute('rel', 'noopener');
    });
    // An empty map frame collapses entirely rather than leaving a bordered box.
    each('[data-config-src]', document, function (el) {
      if (el.getAttribute('src')) return;
      var frame = el.closest ? el.closest('.map-frame') : null;
      var doomed = frame || el;
      if (doomed.parentNode) doomed.parentNode.removeChild(doomed);
    });

    document.documentElement.setAttribute('data-config-state', 'fallback');
    document.dispatchEvent(new CustomEvent('config:failed', { detail: { reason: String(reason) } }));
  }

  /* ---------- load -------------------------------------------------------- */

  function boot(cfg, source) {
    window.INTELLIVRA_CONFIG = cfg;
    try {
      applyBindings(cfg);
      if (source !== 'fetch' && window.console) {
        console.info('[intellivra] config loaded from the local-preview shim.');
      }
    } catch (err) {
      applyFallback(err);
    }
  }

  // file:// previews cannot fetch JSON; tools/sync-config.js writes an optional
  // shim (config/site.config.local.js) that defines window.__INTELLIVRA_CONFIG__.
  function useShimOr(onFail, reason) {
    if (window.__INTELLIVRA_CONFIG__) {
      boot(window.__INTELLIVRA_CONFIG__, 'shim');
      return;
    }
    onFail(reason);
  }

  function load() {
    if (!window.fetch) {
      useShimOr(applyFallback, 'no-fetch');
      return;
    }
    fetch(CONFIG_URL, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (cfg) { boot(cfg, 'fetch'); })
      .catch(function (err) { useShimOr(applyFallback, err); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
