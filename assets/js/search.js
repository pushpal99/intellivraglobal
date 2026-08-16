/*!
 * search.js - Intellivra Global
 * A tiny client-side index over the site's pages and sections. It exists so the
 * SearchAction declared in the WebSite JSON-LD points at a page that genuinely
 * works. No network calls, no dependencies.
 */
(function () {
  'use strict';

  var INDEX = [
    { url: 'services.html#staff-augmentation', title: 'IT staff augmentation', section: 'Services',
      text: 'Add pre-vetted engineers to your existing team on an hourly bill rate under your own management. Three month minimum, 30-day replacement guarantee, W2 C2C 1099.' },
    { url: 'services.html#contract-hire', title: 'Contract & contract-to-hire', section: 'Services',
      text: 'Trial an engineer on our payroll and convert with no conversion fee after six months. H-1B transfer, OPT, CPT, E-Verify, I-9 compliance handled.' },
    { url: 'services.html#direct-placement', title: 'Direct placement', section: 'Services',
      text: 'Permanent hiring at 18 to 22 percent of first-year base salary with a 90-day replacement guarantee. Contingent or retained search.' },
    { url: 'services.html#ai-data', title: 'AI & data engineering solutions', section: 'Services',
      text: 'Lakehouse pipelines, feature stores, RAG and LLM applications, evaluation harnesses, model risk documentation. Databricks Snowflake dbt Airflow Kafka Spark.' },
    { url: 'services.html#cloud-devops', title: 'Cloud & DevOps', section: 'Services',
      text: 'AWS Azure GCP landing zones, Terraform, Kubernetes platforms, CI/CD golden paths, observability and SLOs, FinOps cost optimisation.' },
    { url: 'services.html#managed-teams', title: 'Managed teams', section: 'Services',
      text: 'Outcome-based delivery pod with a named lead, priced per sprint or milestone under a statement of work. Onshore, blended or offshore with four-hour overlap.' },
    { url: 'industries.html#healthcare', title: 'Healthcare staffing', section: 'Industries',
      text: 'HIPAA, PHI, HL7, FHIR, Epic, Cerner, payers and providers, HITRUST, OIG exclusion screening.' },
    { url: 'industries.html#bfsi', title: 'Banking, financial services & insurance', section: 'Industries',
      text: 'Core banking, payments, fraud and AML analytics, model risk management, PCI DSS, SOX, FINRA screening.' },
    { url: 'industries.html#retail', title: 'Retail & e-commerce', section: 'Industries',
      text: 'Order management, fulfilment, personalisation, demand forecasting, peak readiness and load testing, Core Web Vitals.' },
    { url: 'industries.html#manufacturing', title: 'Manufacturing', section: 'Industries',
      text: 'MES, SCADA, IIoT, OPC UA, MQTT, predictive maintenance, SAP integration, OT security.' },
    { url: 'industries.html#energy', title: 'Energy & utilities', section: 'Industries',
      text: 'AMI meter data, outage and asset analytics, generation forecasting, GIS, NERC CIP personnel risk assessment.' },
    { url: 'industries.html#technology', title: 'Technology & SaaS', section: 'Industries',
      text: 'Product engineering pods, platform hardening, developer experience, QA automation, AI feature teams.' },
    { url: 'index.html#faq', title: 'IT staffing FAQ', section: 'Home',
      text: 'Engagement models, vetting process, pricing, replacement guarantee, VMS and MSP programmes, rate transparency, 48-hour shortlist.' },
    { url: 'about.html', title: 'About Intellivra Global', section: 'Company',
      text: 'Mission, leadership, why the name Intellivra, founded 2021, offices in Allen Texas and Hyderabad India.' },
    { url: 'careers.html', title: 'Careers and open roles', section: 'Company',
      text: 'Open jobs, how we hire, benefits, bench pay, immigration support, certification budget, apply to the hiring team.' },
    { url: 'contact.html', title: 'Contact Intellivra Global', section: 'Company',
      text: 'Email, phone, WhatsApp, office addresses, business hours, map, send a hiring requirement.' }
  ];

  var form = document.getElementById('search-form');
  var input = document.getElementById('q');
  var results = document.getElementById('search-results');
  var status = document.getElementById('search-status');
  if (!form || !input || !results) return;

  function esc(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function score(entry, terms) {
    var haystack = (entry.title + ' ' + entry.section + ' ' + entry.text).toLowerCase();
    return terms.reduce(function (total, term) {
      if (!term) return total;
      if (entry.title.toLowerCase().indexOf(term) !== -1) return total + 3;
      return haystack.indexOf(term) !== -1 ? total + 1 : total;
    }, 0);
  }

  function run(query) {
    var terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) {
      results.innerHTML = '';
      status.hidden = false;
      status.textContent = 'Type a term above to search the site.';
      return;
    }

    var matches = INDEX
      .map(function (entry) { return { entry: entry, score: score(entry, terms) }; })
      .filter(function (row) { return row.score > 0; })
      .sort(function (a, b) { return b.score - a.score; });

    if (!matches.length) {
      results.innerHTML = '';
      status.hidden = false;
      status.textContent = 'No matches for "' + query + '". Try "staff augmentation", "cloud" or "healthcare".';
      return;
    }

    status.hidden = true;
    results.innerHTML = matches.map(function (row) {
      return '<article class="job">' +
        '<div class="job__top">' +
          '<h3><a href="' + esc(row.entry.url) + '">' + esc(row.entry.title) + '</a></h3>' +
          '<span class="job__id">' + esc(row.entry.section) + '</span>' +
        '</div>' +
        '<p class="job__summary">' + esc(row.entry.text) + '</p>' +
      '</article>';
    }).join('');
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var query = input.value.trim();
    var url = query ? 'search.html?q=' + encodeURIComponent(query) : 'search.html';
    if (window.history && window.history.replaceState) window.history.replaceState(null, '', url);
    run(query);
  });

  var initial = new URLSearchParams(window.location.search).get('q');
  if (initial) {
    input.value = initial;
    run(initial);
  }
})();
