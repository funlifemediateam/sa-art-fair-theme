(function () {
  'use strict';

  /* ── "Get 10% off your first order" ──
     The second of the two storefront pop-ups. Its settings live in the booking
     admin's Popup tab (shop metafield booking_app.popup_settings, the `offer`
     half) and are fetched by the shared loader below.

     The values in S are how this card behaved when it was built on 14 Jul 2026
     and are what run if the settings call is slow, fails or returns rubbish.
     The same values live in OFFER_DEFAULTS in
     netlify/functions/popup-settings.js, and the admin's preview draws this
     markup a second time in popOfferBody() — change one, change the others.

     It has never been switched on: settings.saf_newsletter_enabled was false,
     and `enabled` here is false for the same reason. That theme setting is no
     longer read; the Popup tab is the single place both cards are controlled. */

  var SHOWN_KEY  = 'saf_newsletter_shown';   /* kept: visitors already carry it */
  var CLAIM_KEY  = 'sa_popup_claimed';       /* session: which card went first */
  var COUNT_KEY  = 'sa_popup_counted_offer'; /* session: impression counted */
  var CACHE_KEY  = 'sa_popup_settings';      /* session: shared with lead-popup */
  var CACHE_MS   = 10 * 60 * 1000;
  var FETCH_MS   = 4000;

  var cfg  = window.__safNewsletter || {};
  var API  = cfg.apiUrl || 'https://sa-art-fair-admin.vercel.app';
  var PAGE = window.__saPopupPage || 'other';

  var S = {
    enabled: false,
    timing: { desktopDelaySec: 12, mobileDelaySec: 12, exitIntent: false, scrollEnabled: false, scrollPercent: 60, dismissDays: 0 },
    pages: { home: true, artwork: true, class: false, blog: true, other: true },
    audience: { newVisitorsOnly: false, skipSignedUp: true, skipMidBooking: true },
    copy: {
      eyebrow:       'SA Art Fair',
      offer:         '10% off your first order',
      heading:       'Get 10% off your first order',
      body:          'Join our list for first access to new artists, exhibitions and exclusive works.',
      button:        'Get my code',
      thanksHeading: 'You’re in.',
      code:          'WELCOME10'
    }
  };

  var opened   = false;
  var timer    = null;
  var loadedAt = Date.now();
  var settled  = false;

  function ls(k)       { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function ss(k)       { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* First time in this browser? Worked out once and remembered for the visit,
     so page two of a first visit is not counted as a returning visitor. */
  var isNewVisitor = (function () {
    if (ss('sa_lead_popup_newvisit')) return true;
    var seen = ls('sa_lead_popup_seen');
    lsSet('sa_lead_popup_seen', '1');
    if (!seen) { ssSet('sa_lead_popup_newvisit', '1'); return true; }
    return false;
  }());

  /* Someone part-way through paying for a seat. sa_bk_timers is
     { "<productId>": { end: <ms> } } — presence is not enough, because expired
     entries sit there until custom.js next prunes them, which used to suppress
     this card for hours after a hold had lapsed. */
  function holdActive() {
    try {
      var t = JSON.parse(ls('sa_bk_timers') || '{}');
      var now = Date.now();
      return Object.keys(t).some(function (k) { return t[k] && (t[k].end || 0) > now; });
    } catch (e) { return false; }
  }

  function holdBarShowing() {
    var bc = document.getElementById('sa-bk-banner-container');
    return !!(bc && bc.children.length);
  }

  function onExcludedPage() {
    var p = (window.location.pathname || '').toLowerCase();
    return p.indexOf('/cart') === 0 || p.indexOf('/checkout') !== -1 || p.indexOf('/challenge') !== -1;
  }

  /* Only one card per visit. Whichever is due first claims the visit; the
     other stays down until a later one. Also refuses to open on top of the
     other card or the quiz, whatever the flag says. */
  function claimedByOther() {
    var who = ss(CLAIM_KEY);
    if (who && who !== 'offer') return true;
    return !!(document.getElementById('sa-lead-popup') ||
              document.getElementById('sa-lead-popup-overlay') ||
              document.getElementById('sa-quiz-overlay'));
  }

  function eligible() {
    if (opened) return false;
    if (!S.enabled) return false;
    if (onExcludedPage()) return false;
    if (!S.pages[PAGE]) return false;
    if (claimedByOther()) return false;
    if (S.audience.newVisitorsOnly && !isNewVisitor) return false;
    if (S.audience.skipSignedUp && ls('sa_lead_popup_signed')) return false;
    if (S.audience.skipMidBooking && (holdActive() || holdBarShowing())) return false;
    var ts = parseInt(ls(SHOWN_KEY) || '0', 10);
    /* 0 days means never show it to them again */
    if (ts && (S.timing.dismissDays === 0 || Date.now() - ts < S.timing.dismissDays * 86400000)) return false;
    return true;
  }

  /* ── Settings ──
     Shares one request and one session cache with lead-popup.js: both scripts
     are deferred, so whichever runs first starts the fetch and the other joins
     it. Never blocks the page; the delay is measured from page load, so
     settings can only ever push this card later, never sooner. */
  function mergeSettings(raw) {
    var o = raw && typeof raw === 'object' ? raw.offer : null;
    if (!o || typeof o !== 'object') return;
    ['timing', 'pages', 'audience', 'copy'].forEach(function (group) {
      if (!o[group] || typeof o[group] !== 'object') return;
      Object.keys(S[group]).forEach(function (k) {
        var v = o[group][k];
        if (typeof v === typeof S[group][k] && !(typeof v === 'string' && !v)) S[group][k] = v;
      });
    });
    if (typeof o.enabled === 'boolean') S.enabled = o.enabled;
  }

  function fetchSettings() {
    if (window.__saPopupSettings) return window.__saPopupSettings;
    var cached = ss(CACHE_KEY);
    if (cached) {
      try {
        var c = JSON.parse(cached);
        if (c && Date.now() - c.at < CACHE_MS) {
          window.__saPopupSettings = Promise.resolve(c.v);
          return window.__saPopupSettings;
        }
      } catch (e) {}
    }
    window.__saPopupSettings = new Promise(function (resolve) {
      var done = false;
      var giveUp = setTimeout(function () { if (!done) { done = true; resolve(null); } }, FETCH_MS);
      fetch(API + '/api/popup-settings', { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (v) {
          if (done) return;
          done = true; clearTimeout(giveUp);
          if (v) { try { ssSet(CACHE_KEY, JSON.stringify({ at: Date.now(), v: v })); } catch (e) {} }
          resolve(v);
        })
        .catch(function () { if (!done) { done = true; clearTimeout(giveUp); resolve(null); } });
    });
    return window.__saPopupSettings;
  }

  function loadSettings() {
    fetchSettings().then(function (v) {
      if (v) mergeSettings(v);
      if (settled) return;
      settled = true;
      armTriggers();
    });
  }

  /* One per browser session. A page word and which card — nothing else. */
  function countImpression() {
    if (ss(COUNT_KEY)) return;
    ssSet(COUNT_KEY, '1');
    var url = API + '/api/popup-impression';
    var body = JSON.stringify({ popup: 'offer', page: PAGE });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))) return;
    } catch (e) {}
    try {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
    } catch (e) {}
  }

  var overlay, modal, outsideClick = null;

  function remove() {
    if (modal)   { modal.style.opacity = '0'; modal.style.transform = 'translate(-50%, calc(-50% + 10px))'; }
    if (overlay) { overlay.style.opacity = '0'; }
    setTimeout(function () {
      if (modal && modal.parentNode)     modal.parentNode.removeChild(modal);
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey);
    }, 240);
    if (outsideClick) { document.removeEventListener('click', outsideClick, true); outsideClick = null; }
  }

  function dismiss() { remove(); }

  function onKey(e) { if (e.key === 'Escape') dismiss(); }

  function submit(email) {
    lsSet('sa_lead_popup_signed', String(Date.now()));
    fetch(API + '/api/quiz-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, name: '', source: 'newsletter' })
    }).catch(function () {});
    showSuccess();
  }

  function showSuccess() {
    var body = document.getElementById('saf-nl-body');
    if (!body) return;
    var CODE = S.copy.code;
    var codeBlock = CODE
      ? '<div class="saf-nl__code" role="group" aria-label="Your discount code">'
        + '<span class="saf-nl__code-value" id="saf-nl-code">' + esc(CODE) + '</span>'
        + '<button type="button" class="saf-nl__copy" id="saf-nl-copy">Copy</button>'
        + '</div>'
        + '<p class="saf-nl__fine">Use it at checkout. ' + esc(S.copy.offer) + '.</p>'
      : '<p class="saf-nl__fine">You’re on the list. We’ll be in touch.</p>';

    body.innerHTML =
      '<div class="saf-nl__success">'
      + '<div class="saf-nl__check" aria-hidden="true">'
      + '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
      + '</div>'
      + '<h3 class="saf-nl__heading">' + esc(S.copy.thanksHeading) + '</h3>'
      + codeBlock
      + '</div>';

    var copyBtn = document.getElementById('saf-nl-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var done = function () { copyBtn.textContent = 'Copied'; setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1800); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(CODE).then(done, done);
        } else {
          var r = document.createRange(); r.selectNode(document.getElementById('saf-nl-code'));
          var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
          try { document.execCommand('copy'); } catch (e) {}
          sel.removeAllRanges(); done();
        }
      });
    }
    setTimeout(dismiss, 6000);
  }

  function open() {
    if (opened) return;
    opened = true;
    ssSet(CLAIM_KEY, 'offer');              /* this visit is ours */
    lsSet(SHOWN_KEY, String(Date.now()));   /* whatever they do next */
    countImpression();

    overlay = document.createElement('div');
    overlay.className = 'saf-nl-overlay';
    document.body.appendChild(overlay);

    modal = document.createElement('div');
    modal.className = 'saf-nl';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', S.copy.heading);
    modal.innerHTML =
      '<button type="button" class="saf-nl__close" id="saf-nl-close" aria-label="Close">'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      + '</button>'
      + '<div id="saf-nl-body">'
      + '<p class="saf-nl__eyebrow">' + esc(S.copy.eyebrow) + '</p>'
      + (S.copy.offer ? '<div class="saf-nl__offer">' + esc(S.copy.offer) + '</div>' : '')
      + '<h3 class="saf-nl__heading">' + esc(S.copy.heading) + '</h3>'
      + '<p class="saf-nl__text">' + esc(S.copy.body) + '</p>'
      + '<form class="saf-nl__form" id="saf-nl-form" novalidate>'
      + '<input type="email" id="saf-nl-email" class="saf-nl__input" placeholder="your@email.com" autocomplete="email" required>'
      + '<button type="submit" class="saf-nl__submit">' + esc(S.copy.button) + '</button>'
      + '</form>'
      + '<p class="saf-nl__err" id="saf-nl-err" hidden>Please enter a valid email address.</p>'
      + '<p class="saf-nl__fine">No spam. Unsubscribe anytime.</p>'
      + '</div>';
    document.body.appendChild(modal);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.style.opacity = '1';
        modal.style.opacity = '1';
        modal.style.transform = 'translate(-50%, -50%)';
      });
    });

    document.getElementById('saf-nl-close').addEventListener('click', dismiss);
    document.addEventListener('keydown', onKey);

    /* Click anywhere outside the card to dismiss. Bound on the next frame so
       the click that led here can't close it immediately. */
    setTimeout(function () {
      outsideClick = function (e) { if (modal && !modal.contains(e.target)) dismiss(); };
      document.addEventListener('click', outsideClick, true);
    }, 0);

    document.getElementById('saf-nl-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = document.getElementById('saf-nl-email');
      var err   = document.getElementById('saf-nl-err');
      var email = (input.value || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        err.hidden = false;
        input.focus();
        return;
      }
      err.hidden = true;
      submit(email);
    });
  }

  function tryShow() { if (eligible()) open(); }

  /* ── Triggers ──
     Armed once the settings have landed. This card ships off, so on a normal
     day armTriggers() sets nothing at all. */
  var touch = 'ontouchstart' in window;
  var scrollFired = false;
  var scrollBound = false;

  function armTriggers() {
    clearTimeout(timer);
    if (!S.enabled) return;

    var delayMs  = (touch ? S.timing.mobileDelaySec : S.timing.desktopDelaySec) * 1000;
    var waitedMs = Date.now() - loadedAt;
    timer = setTimeout(tryShow, Math.max(0, delayMs - waitedMs));

    if (S.timing.scrollEnabled && !scrollBound) {
      scrollBound = true;
      window.addEventListener('scroll', function () {
        if (scrollFired || !S.timing.scrollEnabled) return;
        var depth = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
        if (depth > S.timing.scrollPercent / 100) { scrollFired = true; tryShow(); }
      }, { passive: true });
    }
  }

  document.addEventListener('mouseleave', function (e) {
    if (S.enabled && S.timing.exitIntent && e.clientY < 5) tryShow();
  });

  /* No triggers are armed on the built-in defaults, unlike lead-popup.js:
     this card is off by default, so there is nothing to arm until the real
     settings say otherwise. */
  loadSettings();
})();
