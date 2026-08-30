/* ==========================================================================
   Booking modal — class and workshop product pages

   Turns the page's own "Book Now" / "Make a Booking" pills into openers for
   the booking widget, and takes the widget out of the page flow. Pattern the
   client asked for, from elderflowernursery.co.za.

   The widget is an app block we cannot edit (the Shopify CLI is blocked from
   the partner org), so this MOVES the rendered .shopify-app-block into the
   dialog rather than re-rendering it. A move preserves node identity, and the
   block's inline <script> is an IIFE that has already run by the time this
   deferred script executes, so every listener it bound stays bound. Nothing
   in the widget reads its own ancestors (checked: no parentElement/closest/
   MutationObserver against a wrapper), so the new parent is invisible to it.

   Openers are matched by HREF, not by class: the theme editor lets the client
   point the hero or detail button at a real URL instead, and that must still
   navigate. Only the in-page booking anchors are hijacked.
   ========================================================================== */
(function () {
  'use strict';

  /* The two in-page anchors the rebrand class sections ship with:
     rb-class-hero and rb-class-detail both default to #rb-book, and
     rb-class-detail's own wrapper carries the id from its "anchor" setting
     (default "booking"). Anything marked data-rb-book opens it too. */
  var OPENER_HASHES = ['#rb-book', '#booking'];

  var modal = null;
  var dialog = null;
  var pane = null;
  var host = null; // the emptied .shopify-section the widget came out of
  var opener = null; // element to hand focus back to

  function init() {
    modal = document.getElementById('rb-bkm');
    if (!modal) return;
    dialog = modal.querySelector('.rb-bkm__dialog');
    pane = modal.querySelector('[data-rb-bkm-body]');
    modal.removeAttribute('hidden');

    relocate();

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeydown);

    /* Deep link: /products/<class>#rb-book opens the widget straight away,
       so the studio can send that link in an email. */
    if (OPENER_HASHES.indexOf(window.location.hash) > -1 && pane.firstElementChild) {
      open(null);
    }

    bindEditor();
  }

  /* ---------------------------------------------------------------------- */

  function widgetBlock() {
    var widget = document.querySelector('.bk-widget');
    if (!widget) return null;
    return widget.closest('.shopify-app-block') || widget;
  }

  /** Move the app block into the dialog. Idempotent. */
  function relocate() {
    if (!pane) return false;
    if (pane.querySelector('.bk-widget')) return true;

    var block = widgetBlock();
    if (!block) return false;

    var section = block.closest('.shopify-section');
    pane.appendChild(block);

    /* Hide the section it came out of — but only if the widget was all it
       held. A section with other app blocks still in it stays on the page. */
    if (section && !section.querySelector('.shopify-app-block, .shopify-block')) {
      section.classList.add('rb-bkm-host');
      host = section;
    }
    return true;
  }

  /* ---------------------------------------------------------------------- */

  function openerFor(target) {
    if (!target || typeof target.closest !== 'function') return null;
    var el = target.closest('a[href], button');
    if (!el) return null;
    if (modal.contains(el)) return null;
    if (el.hasAttribute('data-rb-book')) return el;
    var href = el.getAttribute('href') || '';
    return OPENER_HASHES.indexOf(href) > -1 ? el : null;
  }

  function onClick(e) {
    if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;

    var closer = e.target && typeof e.target.closest === 'function'
      ? e.target.closest('[data-rb-bkm-close]')
      : null;
    if (closer && modal.contains(closer)) {
      e.preventDefault();
      close();
      return;
    }

    var trigger = openerFor(e.target);
    if (!trigger) return;

    /* No widget on the page (an app block that failed to render, say) — leave
       the anchor alone so it still scrolls somewhere sane. */
    if (!relocate()) return;

    e.preventDefault();
    open(trigger);
  }

  function onKeydown(e) {
    if (!modal.classList.contains('is-open')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') trapTab(e);
  }

  /* ---------------------------------------------------------------------- */

  function open(trigger) {
    opener = trigger || null;
    modal.classList.add('is-open');
    document.documentElement.classList.add('rb-bkm-open');
    if (dialog) dialog.focus();
  }

  function close() {
    modal.classList.remove('is-open');
    document.documentElement.classList.remove('rb-bkm-open');
    if (opener && document.contains(opener)) opener.focus();
    opener = null;
  }

  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), ' +
    'select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

  function trapTab(e) {
    var items = [];
    var all = dialog.querySelectorAll(FOCUSABLE);
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.offsetWidth || el.offsetHeight || el.getClientRects().length) items.push(el);
    }
    if (!items.length) return;

    var first = items[0];
    var last = items[items.length - 1];
    var active = document.activeElement;

    if (e.shiftKey && (active === first || active === dialog)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ----------------------------------------------------------------------
     Theme editor. The merchant can no longer see the widget by scrolling to
     it, so selecting the app block (or its section) opens the dialog, and
     deselecting closes it. A section re-render hands us a brand-new block —
     drop the stale one we are holding and take the new one.
     ---------------------------------------------------------------------- */
  function bindEditor() {
    if (!window.Shopify || !window.Shopify.designMode) return;

    document.addEventListener('shopify:section:load', function (e) {
      if (!e.target || !e.target.querySelector || !e.target.querySelector('.bk-widget')) return;
      pane.innerHTML = '';
      if (host) {
        host.classList.remove('rb-bkm-host');
        host = null;
      }
      relocate();
    });

    ['shopify:section:select', 'shopify:block:select'].forEach(function (name) {
      document.addEventListener(name, function (e) {
        var t = e.target;
        if (!t || !t.querySelector) return;
        if (!t.querySelector('.bk-widget') && !t.classList.contains('rb-bkm-host')) return;
        if (relocate()) open(null);
      });
    });

    ['shopify:section:deselect', 'shopify:block:deselect'].forEach(function (name) {
      document.addEventListener(name, function () { close(); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
