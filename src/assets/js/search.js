/*!
 * search.js - Intellivra Global
 * Client-side site search over an index generated at build time from
 * config/site.yaml (embedded in the page as #search-index). No network calls,
 * no dependencies - and nothing to keep in sync by hand.
 */
(function () {
  'use strict';

  var form = document.getElementById('search-form');
  var input = document.getElementById('q');
  var results = document.getElementById('search-results');
  var statusBox = document.getElementById('search-status');
  var indexEl = document.getElementById('search-index');
  if (!form || !input || !results || !indexEl) return;

  var INDEX = [];
  try {
    INDEX = JSON.parse(indexEl.textContent) || [];
  } catch (err) {
    INDEX = [];
  }

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function score(entry, terms) {
    var title = entry.title.toLowerCase();
    var haystack = (entry.title + ' ' + entry.section + ' ' + entry.text).toLowerCase();
    return terms.reduce(function (total, term) {
      if (title.indexOf(term) !== -1) return total + 3;
      return haystack.indexOf(term) !== -1 ? total + 1 : total;
    }, 0);
  }

  function setStatus(message) {
    results.innerHTML = '';
    statusBox.hidden = false;
    statusBox.textContent = message;
  }

  function run(query) {
    var terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);

    if (!terms.length) {
      setStatus('Type a term above to search the site.');
      return;
    }

    var matches = INDEX.map(function (entry) {
      return { entry: entry, score: score(entry, terms) };
    })
      .filter(function (row) { return row.score > 0; })
      .sort(function (a, b) { return b.score - a.score; });

    if (!matches.length) {
      setStatus('Nothing matched "' + query + '". Try "staff augmentation", "cloud" or "healthcare".');
      return;
    }

    statusBox.hidden = true;
    results.innerHTML = matches
      .map(function (row) {
        return (
          '<article class="result">' +
          '<span class="result__section">' + esc(row.entry.section) + '</span>' +
          '<h3><a href="' + esc(row.entry.url) + '">' + esc(row.entry.title) + '</a></h3>' +
          '<p>' + esc(row.entry.text) + '</p>' +
          '</article>'
        );
      })
      .join('');
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var query = input.value.trim();
    var url = query ? '/search.html?q=' + encodeURIComponent(query) : '/search.html';
    if (window.history && window.history.replaceState) window.history.replaceState(null, '', url);
    run(query);
  });

  var initial = new URLSearchParams(window.location.search).get('q');
  if (initial) {
    input.value = initial;
    run(initial);
  }
})();
