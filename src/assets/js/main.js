/*!
 * main.js - Intellivra Global
 * Site chrome only: mobile navigation and the footer year. Everything visual
 * that can be done in CSS is done in CSS, so this file stays tiny and deferred.
 */
(function () {
  'use strict';

  /* ---------- mobile navigation ---------- */

  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('primary-nav');

  function setNav(open) {
    if (!toggle || !nav) return;
    toggle.setAttribute('aria-expanded', String(open));
    nav.setAttribute('data-open', String(open));
    toggle.setAttribute('aria-label', open ? 'Close main menu' : 'Open main menu');
  }

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      setNav(toggle.getAttribute('aria-expanded') !== 'true');
    });

    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setNav(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setNav(false);
        toggle.focus();
      }
    });

    // Reset state when the viewport grows past the mobile breakpoint.
    var wide = window.matchMedia('(min-width: 52.0625rem)');
    var onChange = function (event) { if (event.matches) setNav(false); };
    if (wide.addEventListener) wide.addEventListener('change', onChange);
    else if (wide.addListener) wide.addListener(onChange);
  }

  /* ---------- footer year ---------- */

  var year = String(new Date().getFullYear());
  Array.prototype.forEach.call(document.querySelectorAll('[data-year]'), function (el) {
    el.textContent = year;
  });
})();
