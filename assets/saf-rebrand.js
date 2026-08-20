/* SA Art Fair rebrand — drawer menu.
   Vanilla, no dependencies, matching the rest of this theme's assets.
   Rebinds on shopify:section:load so the theme editor stays live. */
(function () {
  'use strict';

  var FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])';

  function setup(root) {
    var opener = root.querySelector('[data-rb-drawer-open]');
    var drawer = root.querySelector('[data-rb-drawer]');
    if (!opener || !drawer || drawer.dataset.rbBound === '1') return;
    drawer.dataset.rbBound = '1';

    var panel = drawer.querySelector('.rb-drawer__panel');
    var lastFocus = null;

    function open() {
      lastFocus = document.activeElement;
      drawer.classList.add('is-open');
      opener.setAttribute('aria-expanded', 'true');
      opener.setAttribute('aria-label', 'Close menu');
      document.body.style.overflow = 'hidden';
      var first = panel.querySelector(FOCUSABLE);
      if (first) first.focus();
      document.addEventListener('keydown', onKeydown);
    }

    function close() {
      drawer.classList.remove('is-open');
      opener.setAttribute('aria-expanded', 'false');
      opener.setAttribute('aria-label', 'Open menu');
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeydown);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function onKeydown(e) {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      // keep focus inside the panel while it is modal
      var items = Array.prototype.filter.call(
        panel.querySelectorAll(FOCUSABLE),
        function (el) { return el.offsetParent !== null; }
      );
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    opener.addEventListener('click', function () {
      if (drawer.classList.contains('is-open')) close();
      else open();
    });

    drawer.querySelectorAll('[data-rb-drawer-close]').forEach(function (el) {
      el.addEventListener('click', close);
    });
  }

  function init(scope) {
    (scope || document).querySelectorAll('.rb-header-section').forEach(setup);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); });
  } else {
    init();
  }

  document.addEventListener('shopify:section:load', function (e) { init(e.target); });
})();
