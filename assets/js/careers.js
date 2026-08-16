/*!
 * careers.js - Intellivra Global
 * Renders the openings listed in /config/jobs.json and emits one JobPosting
 * JSON-LD node per opening so each role is eligible for Google Jobs and for
 * answer-engine extraction. Apply links are built from site.config.json, so no
 * email address is ever hardcoded in careers.html.
 */
(function () {
  'use strict';

  var JOBS_URL = 'config/jobs.json';

  var list = document.getElementById('jobs-list');
  var status = document.getElementById('jobs-status');
  var filters = document.getElementById('jobs-filters');
  var countEl = document.getElementById('jobs-count');
  if (!list) return;

  var state = { jobs: [], filter: 'All', careersEmail: null };

  /* ---------- helpers ---------- */

  function esc(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function place(job) {
    var loc = job.location || {};
    var bits = [loc.locality, loc.region].filter(Boolean).join(', ');
    return bits || loc.country || 'Location on request';
  }

  function money(job) {
    var s = job.salary;
    if (!s || !s.min) return '';
    var unit = s.unit === 'HOUR' ? '/hr' : '/yr';
    var fmt = function (n) {
      if (s.unit === 'HOUR') return n.toLocaleString('en-US');
      return Math.round(n / 1000) + 'k';
    };
    var symbol = s.currency === 'INR' ? '₹' : '$';
    return symbol + fmt(s.min) + ' - ' + symbol + fmt(s.max) + ' ' + s.currency + unit;
  }

  function posted(job) {
    if (!job.datePosted) return '';
    var date = new Date(job.datePosted + 'T00:00:00Z');
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }

  /* ---------- rendering ---------- */

  function cardHtml(job) {
    var applyHref = state.careersEmail
      ? 'mailto:' + state.careersEmail + '?subject=' + encodeURIComponent(job.applyEmailSubject || ('Application - ' + job.title))
      : 'contact.html';
    var salary = money(job);

    return '' +
      '<article class="job reveal" data-department="' + esc(job.department) + '">' +
        '<div class="job__top">' +
          '<h3>' + esc(job.title) + '</h3>' +
          '<span class="job__id">Req ' + esc(job.id) + '</span>' +
        '</div>' +
        '<p class="job__summary">' + esc(job.summary) + '</p>' +
        '<ul class="tag-row">' +
          '<li class="tag tag--accent">' + esc(job.engagement) + '</li>' +
          '<li class="tag">' + esc(job.workplace) + '</li>' +
          '<li class="tag">' + esc(place(job)) + '</li>' +
          '<li class="tag">' + esc(job.department) + '</li>' +
        '</ul>' +
        '<div class="job__foot">' +
          '<span class="job__salary">' + (salary ? esc(salary) : 'Compensation shared on the first call') +
            (posted(job) ? ' <span class="job__id">&middot; posted ' + esc(posted(job)) + '</span>' : '') +
          '</span>' +
          '<a class="btn btn--ghost btn--sm" href="' + esc(applyHref) + '">Apply for ' +
            '<span class="sr-only">' + esc(job.title) + '</span> this role</a>' +
        '</div>' +
      '</article>';
  }

  function render() {
    var visible = state.jobs.filter(function (job) {
      return state.filter === 'All' || job.department === state.filter;
    });

    list.setAttribute('aria-busy', 'false');

    if (!visible.length) {
      list.innerHTML = '';
      show('No openings in this team right now. Send us your resume and we will match you to the next requisition.');
      if (countEl) countEl.textContent = 'No open roles in this team';
      return;
    }

    hide();
    list.innerHTML = visible.map(cardHtml).join('');
    if (countEl) {
      countEl.textContent = visible.length + (visible.length === 1 ? ' open role' : ' open roles');
    }
  }

  function show(message) {
    if (!status) return;
    status.textContent = message;
    status.hidden = false;
  }

  function hide() { if (status) status.hidden = true; }

  function buildFilters() {
    if (!filters) return;
    var departments = ['All'].concat(state.jobs.map(function (j) { return j.department; })
      .filter(function (value, index, arr) { return value && arr.indexOf(value) === index; }));

    filters.innerHTML = departments.map(function (dept) {
      return '<button type="button" aria-pressed="' + (dept === state.filter) + '" data-filter="' + esc(dept) + '">' + esc(dept) + '</button>';
    }).join('');

    filters.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-filter]');
      if (!button) return;
      state.filter = button.getAttribute('data-filter');
      Array.prototype.forEach.call(filters.querySelectorAll('button'), function (b) {
        b.setAttribute('aria-pressed', String(b === button));
      });
      render();
    });
  }

  /* ---------- structured data ---------- */

  function jobPostingSchema(job, cfg) {
    var loc = job.location || {};
    var org = {
      '@type': 'Organization',
      name: (cfg && cfg.company && cfg.company.legalName) || 'Intellivra Global',
      sameAs: (cfg && cfg.site && cfg.site.url) || 'https://intellivraglobal.com',
      logo: (cfg && cfg.site && cfg.site.logo) || 'https://intellivraglobal.com/assets/img/logo.svg'
    };

    var node = {
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: job.title,
      identifier: { '@type': 'PropertyValue', name: org.name, value: job.id },
      description: '<p>' + esc(job.summary) + '</p>' +
        '<h3>Responsibilities</h3><ul>' + (job.responsibilities || []).map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' +
        '<h3>Requirements</h3><ul>' + (job.requirements || []).map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>',
      datePosted: job.datePosted,
      validThrough: job.validThrough,
      employmentType: job.employmentType,
      hiringOrganization: org,
      industry: 'Information Technology',
      directApply: true,
      jobLocation: {
        '@type': 'Place',
        address: {
          '@type': 'PostalAddress',
          addressLocality: loc.locality,
          addressRegion: loc.region,
          addressCountry: loc.country
        }
      }
    };

    if (job.workplace === 'Remote') {
      node.jobLocationType = 'TELECOMMUTE';
      node.applicantLocationRequirements = { '@type': 'Country', name: loc.country === 'IN' ? 'India' : 'USA' };
    }

    if (job.salary && job.salary.min) {
      node.baseSalary = {
        '@type': 'MonetaryAmount',
        currency: job.salary.currency,
        value: {
          '@type': 'QuantitativeValue',
          minValue: job.salary.min,
          maxValue: job.salary.max,
          unitText: job.salary.unit
        }
      };
    }

    return node;
  }

  function injectSchema(cfg) {
    if (!state.jobs.length) return;
    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-generated', 'careers.js');
    script.textContent = JSON.stringify(state.jobs.map(function (job) { return jobPostingSchema(job, cfg); }));
    document.head.appendChild(script);
  }

  /* ---------- boot ---------- */

  function start(cfg) {
    state.careersEmail = cfg && cfg.contact ? cfg.contact.careersEmail || cfg.contact.email : null;

    fetch(JOBS_URL, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        state.jobs = (data && data.jobs) || [];
        buildFilters();
        render();
        injectSchema(cfg);
      })
      .catch(function () {
        if (window.__INTELLIVRA_JOBS__) {
          state.jobs = window.__INTELLIVRA_JOBS__.jobs || [];
          buildFilters();
          render();
          injectSchema(cfg);
          return;
        }
        list.innerHTML = '';
        list.setAttribute('aria-busy', 'false');
        if (countEl) countEl.textContent = 'Openings unavailable';
        show('Our live openings could not be loaded. Email your resume or connect with us on LinkedIn and a recruiter will respond within one business day.');
      });
  }

  if (window.INTELLIVRA_CONFIG) start(window.INTELLIVRA_CONFIG);
  else {
    document.addEventListener('config:ready', function (event) { start(event.detail); });
    document.addEventListener('config:failed', function () { start(null); });
  }
})();
