/*
  rb-safe-contact.js — assembles the scrape-protected contact links written by
  snippets/rb-safe-contact.liquid.

  The markup only carries an encoded value (data-rbsc) and a harmless
  /pages/contact href. Nothing is decoded on page load: the visitor's first real
  interaction — pointer move, touch, wheel, scroll, key press or click — builds
  every tel: / wa.me / mailto: link on the page at once, so a crawler that runs
  JavaScript but never interacts still finds no number or address.

  Encoding (mirror of the snippet): URL-safe base64, "=" padding removed, each
  digit swapped for a punctuation mark, the whole string reversed.
*/
(function () {
  'use strict';

  // the snippet loads this once per link, so only the first copy runs
  if (window.rbSafeContact) return;

  var DIGITS = { '~': '0', '!': '1', '*': '2', '(': '3', ')': '4', ',': '5', ';': '6', '$': '7', '^': '8', '|': '9' };
  var TRIGGERS = ['pointermove', 'mousemove', 'pointerdown', 'mousedown', 'touchstart', 'wheel', 'scroll', 'keydown', 'click'];
  var armed = false;

  function decode(code) {
    var b64 = '';
    for (var i = code.length - 1; i >= 0; i--) {
      var ch = code.charAt(i);
      b64 += DIGITS[ch] || ch;
    }
    b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64);
    if (!window.TextDecoder) return bin;
    var bytes = new Uint8Array(bin.length);
    for (var j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
    return new TextDecoder().decode(bytes);
  }

  function hrefFor(kind, value, message) {
    if (kind === 'e') return 'mailto:' + value;
    var digits = value.replace(/\D/g, '');
    if (kind === 'w') {
      return 'https://wa.me/' + digits + (message ? '?text=' + encodeURIComponent(message) : '');
    }
    // "+27 72 …" and a bare "2772…" are international; a leading 0 is a local number
    var plus = /^\s*\+/.test(value) || !/^\s*0/.test(value) ? '+' : '';
    return 'tel:' + plus + digits;
  }

  function reveal(link) {
    var code = link.getAttribute('data-rbsc');
    if (!code) return;
    var value;
    try {
      value = decode(code);
    } catch (e) {
      return; // keep the contact-page fallback rather than a broken link
    }
    var kind = link.getAttribute('data-rbsc-kind');
    link.setAttribute('href', hrefFor(kind, value, link.getAttribute('data-rbsc-msg')));
    if (kind === 'w') {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener');
    }
    if (link.hasAttribute('data-rbsc-show')) {
      var text = link.querySelector('[data-rbsc-text]');
      if (text) text.textContent = value;
    }
    link.removeAttribute('data-rbsc');
    link.setAttribute('data-rbsc-done', '');
  }

  function revealAll() {
    armed = true;
    var links = document.querySelectorAll('a[data-rbsc]');
    for (var i = 0; i < links.length; i++) reveal(links[i]);
  }

  function onFirstInteraction(event) {
    if (event.isTrusted === false) return; // a script-dispatched event is not a visitor
    for (var i = 0; i < TRIGGERS.length; i++) {
      window.removeEventListener(TRIGGERS[i], onFirstInteraction, true);
    }
    revealAll();
  }

  for (var i = 0; i < TRIGGERS.length; i++) {
    window.addEventListener(TRIGGERS[i], onFirstInteraction, { capture: true, passive: true });
  }

  // A link that turns up later (theme editor re-render, injected markup) is
  // assembled the moment it is clicked; the browser then follows the new href.
  document.addEventListener('click', function (event) {
    if (!event.isTrusted || !event.target.closest) return;
    var link = event.target.closest('a[data-rbsc]');
    if (link) reveal(link);
  }, true);

  document.addEventListener('shopify:section:load', function () {
    if (armed) revealAll();
  });

  window.rbSafeContact = { revealAll: revealAll };
})();
