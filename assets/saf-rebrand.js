/* SA Art Fair rebrand — drawer menu and the scroll-snap carousels.
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

  /* ── Scroll-snap carousel ───────────────────────────────────────────────
     Used by the testimonial rail and any other .rb-rail with arrows. The rail
     scrolls natively; the arrows just page it by one card and then reflect
     whether there is anywhere left to go.

     Two gotchas this theme has hit before and both apply here:
       - a native img fires `dragstart` one move into a mouse drag, which
         cancels the pointer stream, so dragging is disabled explicitly rather
         than half-working;
       - pointer capture must not be taken on mousedown or the derived click
         is retargeted to the track and every link inside a card goes dead.
     This carousel therefore does not implement drag-to-scroll at all: the
     rail's own overflow handles trackpads and touch. */
  function setupCarousel(root) {
    if (root.dataset.rbCarousel === '1') return;
    root.dataset.rbCarousel = '1';

    var track = root.querySelector('[data-rb-carousel-track]');
    var prev = root.querySelector('[data-rb-carousel-prev]');
    var next = root.querySelector('[data-rb-carousel-next]');
    if (!track) return;

    track.addEventListener('dragstart', function (e) { e.preventDefault(); });

    function step() {
      var first = track.firstElementChild;
      if (!first) return track.clientWidth;
      var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return first.getBoundingClientRect().width + gap;
    }

    function reflect() {
      if (!prev || !next) return;
      var max = track.scrollWidth - track.clientWidth;
      prev.disabled = track.scrollLeft <= 1;
      next.disabled = track.scrollLeft >= max - 1;
    }

    if (prev) prev.addEventListener('click', function () { track.scrollLeft -= step(); });
    if (next) next.addEventListener('click', function () { track.scrollLeft += step(); });

    track.addEventListener('scroll', reflect, { passive: true });
    window.addEventListener('resize', reflect);
    reflect();
  }

  /* #book — send an ad click straight to the booking widget.

     A card elsewhere on the site cannot name the widget's real element id:
     Shopify renders a JSON-template section as
     "shopify-section-template--<template id>__booking", and every class product
     carries its own product.booking-<product id> template, so that number is
     different on every class page. Rather than teach each card a per-product id,
     the link says #book and this resolves it here.

     The widget is an app block that fetches its own data, so the section can be
     nearly empty at DOMContentLoaded and land at the wrong scroll offset. Retry
     a few times, and stop early once someone scrolls themselves. */
  function scrollToBooking() {
    if (window.location.hash !== '#book') return;

    var tries = 0;
    var userMoved = false;
    var startY = window.scrollY;
    function onUserScroll() {
      if (Math.abs(window.scrollY - startY) > 40) userMoved = true;
    }
    window.addEventListener('scroll', onUserScroll, { passive: true });

    function attempt() {
      var target =
        document.querySelector('[id^="shopify-section-"][id$="__booking"]') ||
        document.querySelector('.bk-page') ||
        document.querySelector('[data-api]');

      if (target) {
        target.scrollIntoView({ behavior: tries === 0 ? 'auto' : 'smooth', block: 'start' });
        startY = window.scrollY;
      }

      tries += 1;
      if (tries < 4 && !userMoved) {
        setTimeout(attempt, tries * 400);
      } else {
        window.removeEventListener('scroll', onUserScroll);
      }
    }
    attempt();
  }

  function init(scope) {
    var root = scope || document;
    root.querySelectorAll('.rb-header-section').forEach(setup);
    root.querySelectorAll('[data-rb-carousel]').forEach(setupCarousel);
    if (!scope) scrollToBooking();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); });
  } else {
    init();
  }

  document.addEventListener('shopify:section:load', function (e) { init(e.target); });
})();
