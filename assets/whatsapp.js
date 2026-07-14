(function () {
  'use strict';

  /* Keeps the floating WhatsApp button clear of the booking hold-timer banner.
     The banner (#sa-bk-banner-container) is created lazily by custom.js and sits
     at the bottom of the viewport (above the mobile CTA bar on small screens).
     We publish its live height to a CSS custom property; custom.css adds that to
     the button's `bottom` so the two never overlap on any width. */

  var root = document.documentElement;

  function setBannerHeight() {
    var c = document.getElementById('sa-bk-banner-container');
    var h = c ? c.getBoundingClientRect().height : 0;
    root.style.setProperty('--saf-bk-banner-h', h > 0 ? h + 'px' : '0px');
  }

  var ro = 'ResizeObserver' in window ? new ResizeObserver(setBannerHeight) : null;
  var observed = null;

  function hook() {
    var c = document.getElementById('sa-bk-banner-container');
    if (c && c !== observed) {
      observed = c;
      if (ro) ro.observe(c);
    }
    setBannerHeight();
  }

  /* The banner container appears only when a booking hold is active — watch for it. */
  if ('MutationObserver' in window) {
    new MutationObserver(hook).observe(document.body, { childList: true, subtree: true });
  }
  window.addEventListener('resize', setBannerHeight, { passive: true });

  hook();
})();
