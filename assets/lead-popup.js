(function () {
  'use strict';

  var STORAGE_KEY  = 'sa_lead_popup_dismissed';
  var SIGNED_KEY   = 'sa_lead_popup_signed';    /* they already joined, here */
  var SEEN_KEY     = 'sa_lead_popup_seen';      /* this browser has been before */
  var NEWVISIT_KEY = 'sa_lead_popup_newvisit';  /* session: started as a new visitor */
  var CLAIM_KEY    = 'sa_popup_claimed';        /* session: which card went first */
  var COUNT_KEY    = 'sa_popup_counted_lead';   /* session: impression counted */
  var CACHE_KEY    = 'sa_popup_settings';       /* session: settings + when fetched */
  var CACHE_MS     = 10 * 60 * 1000;
  var FETCH_MS     = 4000;                      /* give up and use the defaults */
  var API_URL      = window.__saLeadApiUrl     || 'https://sa-art-fair-admin.vercel.app';
  var GOOGLE_ID    = window.__saGoogleClientId || '';
  var PAGE         = window.__saPopupPage      || 'other';

  /* ── Look ──
     Everything visual lives in one injected stylesheet rather than in inline
     styles, because hover, focus and the @supports test for backdrop-filter
     cannot be expressed inline. Colours and families come from the rebrand
     tokens in saf-rebrand.css via var(), with the 2026-08 values as
     fallbacks, so this card follows the brand if those ever change.

     NOTE: 1rem = 12px on this theme (html 62.5% x body scale 120), which is
     why every size below is in px. The old inline styles were written for a
     16px root and rendered a quarter too small. */
  var STYLE_ID = 'sa-popup-styles';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      /* Invisible catcher. No dark scrim: the page stays visible and usable
         behind the card, and an outside click still dismisses (see below). */
      '#sa-lead-popup-overlay{position:fixed;inset:0;z-index:99998;background:transparent;pointer-events:none}',

      '#sa-lead-popup{position:fixed;bottom:24px;right:24px;z-index:99999;box-sizing:border-box;',
      'width:calc(100vw - 32px);max-width:400px;padding:26px 24px 20px;',
      'background:#fff;color:var(--rb-ink,#1e1e1e);',
      'font-family:var(--rb-sans,"Afacad","Helvetica Neue",Arial,sans-serif);',
      'border:1px solid rgba(30,30,30,.08);border-radius:14px;',
      'box-shadow:0 18px 60px rgba(30,30,30,.28);',
      'opacity:0;transform:translateY(12px);transition:opacity .22s,transform .22s}',

      /* Frosted only where it is supported; solid white everywhere else, so
         the fallback is the readable one. Only the BACKGROUND is translucent
         — text, inputs and buttons are children and stay fully opaque. */
      '@supports ((backdrop-filter:blur(14px)) or (-webkit-backdrop-filter:blur(14px))){',
      '#sa-lead-popup{background:rgba(255,255,255,.82);',
      '-webkit-backdrop-filter:blur(14px) saturate(120%);backdrop-filter:blur(14px) saturate(120%);',
      'border-color:rgba(255,255,255,.55);box-shadow:0 18px 60px rgba(30,30,30,.34)}}',

      '#sa-popup-close{position:absolute;top:10px;right:12px;width:34px;height:34px;display:flex;',
      'align-items:center;justify-content:center;background:none;border:none;cursor:pointer;',
      'color:rgba(30,30,30,.45);border-radius:50%}',
      '#sa-popup-close:hover{color:var(--rb-ink,#1e1e1e);background:rgba(30,30,30,.06)}',

      '.sa-pop__eyebrow{margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:.14em;',
      'text-transform:uppercase;color:var(--rb-cherry,#b00e3f)}',
      '.sa-pop__heading{margin:0 0 8px;font-family:var(--rb-serif,"IvyPresto Display","Playfair Display",Georgia,serif);',
      'font-size:26px;font-weight:400;line-height:1.15;color:var(--rb-ink,#1e1e1e)}',
      '.sa-pop__body{margin:0 0 18px;font-size:15px;line-height:1.55;color:rgba(30,30,30,.72)}',

      '#sa-popup-google-wrap{margin-bottom:10px}',
      '#sa-popup-google{display:flex;justify-content:center}',
      '.sa-pop__or{display:flex;align-items:center;gap:10px;margin:4px 0 16px}',
      /* base.css hides every `div:empty`, and these two rules ARE empty divs.
         An inline display would work but two classes (0,2,0) also outrank
         `div:empty` (0,1,1), which keeps it in the stylesheet. */
      '.sa-pop__or .sa-pop__rule{display:block;flex:1;height:1px;background:rgba(30,30,30,.14)}',
      '.sa-pop__or-label{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(30,30,30,.7)}',

      '.sa-pop__fields{margin-bottom:10px}',
      '.sa-pop__input{width:100%;box-sizing:border-box;padding:12px 14px;background:#fff;',
      'border:1.5px solid rgba(30,30,30,.18);border-radius:10px;',
      'font-family:inherit;font-size:15px;color:var(--rb-ink,#1e1e1e);outline:none;',
      'transition:border-color .15s ease,box-shadow .15s ease}',
      '.sa-pop__input + .sa-pop__input{margin-top:8px}',
      '.sa-pop__input::placeholder{color:rgba(30,30,30,.55)}',
      '.sa-pop__input:focus{border-color:var(--rb-coral,#e27b70);box-shadow:0 0 0 3px rgba(226,123,112,.22)}',
      '#sa-popup-err{display:none;margin:6px 0 0;font-size:13px;color:var(--rb-cherry,#b00e3f)}',

      '#sa-popup-submit{width:100%;padding:14px;cursor:pointer;border:none;border-radius:999px;',
      'background:var(--rb-cherry,#b00e3f);color:#fff;font-family:inherit;font-size:14px;',
      'font-weight:700;letter-spacing:.08em;text-transform:uppercase;transition:background .18s ease}',
      '#sa-popup-submit:hover{background:#8f0b33}',
      '#sa-popup-submit:focus-visible{outline:3px solid var(--rb-coral,#e27b70);outline-offset:2px}',

      /* These three were .5/.42/.45 and failed WCAG AA even on a white
         page; over a dark photo the frosted card lifts to about #d1d1d1,
         where they were worse. Do not lighten them again. */
      '.sa-pop__fine{margin:10px 0 0;font-size:12px;color:rgba(30,30,30,.7);text-align:center}',

      '.sa-pop__thanks{text-align:center;padding:16px 0 6px}',
      '.sa-pop__tick{width:54px;height:54px;margin:0 auto 16px;border-radius:50%;',
      'background:var(--rb-cherry,#b00e3f);color:#fff;display:flex;align-items:center;justify-content:center}',
      '.sa-pop__thanks .sa-pop__heading{margin:0 0 8px;font-size:22px}',
      '.sa-pop__thanks .sa-pop__body{margin:0}',

      '@media screen and (max-width:480px){',
      '#sa-lead-popup{right:16px;left:16px;bottom:16px;width:auto;padding:24px 20px 18px}',
      '.sa-pop__heading{font-size:23px}}'
    ].join('');
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ── Settings ──
     These are the pop-up exactly as it behaved on 17 Sep 2026, and they are
     what runs if the settings call is slow, fails, or comes back as rubbish.
     The same values live in DEFAULTS in netlify/functions/popup-settings.js —
     change one, change the other.

     Editable from the booking admin's Popup tab. Nothing here ever blocks the
     page: the fetch is fired and forgotten, and the triggers are armed on
     these defaults straight away, then re-armed if settings arrive. */
  var S = {
    enabled: true,
    timing: { desktopDelaySec: 30, mobileDelaySec: 20, exitIntent: true, scrollEnabled: true, scrollPercent: 60, dismissDays: 30 },
    pages: { home: true, artwork: true, class: true, blog: true, other: true },
    audience: { newVisitorsOnly: false, skipSignedUp: true, skipMidBooking: true },
    copy: {
      eyebrow: 'SA Art Fair',
      heading: 'Stay in the loop.',
      body: 'Be first to know about new artists, exhibitions and exclusive works.',
      button: 'Subscribe',
      thanksHeading: 'You’re in',
      thanksBody: 'Welcome to SA Art Fair. We’ll be in touch with new artists, exhibitions and exclusive works.'
    },
    google: true
  };

  var shown = false;
  var timer = null;
  var outsideClick = null;
  var loadedAt = Date.now();
  var settled  = false;   /* settings have landed (or been given up on) */

  /* Copy now arrives from the admin. The server strips markup out of it before
     it is ever stored; this is the second lock, at the point of insertion. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

  /* First time in this browser? Worked out once, on the first page of the
     visit, and remembered for the rest of the session — otherwise page two of
     someone's first visit would already count as a returning visitor.
     If storage is unreadable we treat them as new, which shows the pop-up
     rather than silently suppressing it. */
  var isNewVisitor = (function () {
    if (ssGet(NEWVISIT_KEY)) return true;
    var seen = lsGet(SEEN_KEY);
    lsSet(SEEN_KEY, '1');
    if (!seen) { ssSet(NEWVISIT_KEY, '1'); return true; }
    return false;
  }());

  /* Someone part-way through paying for a seat. sa_bk_timers is
     { "<productId>": { end: <ms> } } — presence is not enough, because
     expired entries sit there until custom.js next prunes them. */
  function holdActive() {
    try {
      var t = JSON.parse(lsGet('sa_bk_timers') || '{}');
      var now = Date.now();
      return Object.keys(t).some(function (k) { return t[k] && (t[k].end || 0) > now; });
    } catch (e) { return false; }
  }

  /* The hold bar is the same hold, already on screen */
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
    var who = ssGet(CLAIM_KEY);
    if (who && who !== 'lead') return true;
    return !!(document.getElementById('saf-nl-body') || document.getElementById('sa-quiz-overlay'));
  }

  function shouldShow() {
    if (shown) return false;
    if (!S.enabled) return false;
    if (onExcludedPage()) return false;
    if (!S.pages[PAGE]) return false;
    if (claimedByOther()) return false;
    if (S.audience.newVisitorsOnly && !isNewVisitor) return false;
    if (S.audience.skipSignedUp && lsGet(SIGNED_KEY)) return false;
    if (S.audience.skipMidBooking && (holdActive() || holdBarShowing())) return false;
    var ts = parseInt(lsGet(STORAGE_KEY) || '0', 10);
    /* 0 days means never show it to them again */
    if (ts && (S.timing.dismissDays === 0 || Date.now() - ts < S.timing.dismissDays * 86400000)) return false;
    return true;
  }

  function dismiss() {
    shown = true;
    clearTimeout(timer);
    if (outsideClick) { document.removeEventListener('click', outsideClick, true); outsideClick = null; }
    lsSet(STORAGE_KEY, String(Date.now()));
    var modal = document.getElementById('sa-lead-popup');
    if (modal) {
      modal.style.opacity = '0';
      modal.style.transform = 'translateY(8px)';
      setTimeout(function () { if (modal.parentNode) modal.parentNode.removeChild(modal); }, 220);
    }
    var overlay = document.getElementById('sa-lead-popup-overlay');
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  /* Google could not be offered: take the button slot AND its "or" divider
     away, so the card falls back cleanly to email only. */
  function hideGoogleArea() {
    var wrap = document.getElementById('sa-popup-google-wrap');
    var or   = document.getElementById('sa-popup-or');
    if (wrap) wrap.style.display = 'none';
    if (or)   or.style.display   = 'none';
  }

  function loadGSI() {
    if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.getElementById('sa-gsi-script');
      if (s) { s.addEventListener('load', resolve); s.addEventListener('error', reject); return; }
      s = document.createElement('script');
      s.id  = 'sa-gsi-script';
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true; s.defer = true;
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  /* ── Settings: fetch once, cache for the session ──
     Never blocks, never delays the page, and can only ever make the pop-up
     appear LATER than it would have on the defaults, never sooner. */

  function mergeSettings(raw) {
    var src = raw && typeof raw === 'object' ? raw.lead : null;
    if (!src || typeof src !== 'object') return;
    ['timing', 'pages', 'audience', 'copy'].forEach(function (group) {
      if (!src[group] || typeof src[group] !== 'object') return;
      Object.keys(S[group]).forEach(function (k) {
        var v = src[group][k];
        if (typeof v === typeof S[group][k] && !(typeof v === 'string' && !v)) S[group][k] = v;
      });
    });
    if (typeof src.enabled === 'boolean') S.enabled = src.enabled;
    if (typeof src.google === 'boolean') S.google = src.google;
  }

  function settingsSettled() {
    if (settled) return;
    settled = true;
    armTriggers();
  }

  /* One request and one session cache, shared with newsletter-popup.js: both
     scripts are deferred, so whichever runs first starts the fetch and the
     other joins it rather than asking again. */
  function fetchSettings() {
    if (window.__saPopupSettings) return window.__saPopupSettings;
    var cached = ssGet(CACHE_KEY);
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
      fetch(API_URL + '/api/popup-settings', { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (v) {
          if (done) return;
          done = true; clearTimeout(giveUp);
          if (v) ssSet(CACHE_KEY, JSON.stringify({ at: Date.now(), v: v }));
          resolve(v);
        })
        .catch(function () { if (!done) { done = true; clearTimeout(giveUp); resolve(null); } });
    });
    return window.__saPopupSettings;
  }

  function loadSettings() {
    fetchSettings().then(function (v) {
      if (v) mergeSettings(v);
      settingsSettled();
    });
  }

  /* ── Impressions ──
     One per browser session. A page word and nothing else: no email, no id,
     nothing that identifies anyone. sendBeacon so it cannot hold the page up. */
  function countImpression() {
    if (ssGet(COUNT_KEY)) return;
    ssSet(COUNT_KEY, '1');
    var url = API_URL + '/api/popup-impression';
    var body = JSON.stringify({ popup: 'lead', page: PAGE });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))) return;
    } catch (e) {}
    try {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
    } catch (e) {}
  }

  function submitLead(email, name, source) {
    if (!email) return;
    lsSet(SIGNED_KEY, String(Date.now()));
    fetch(API_URL + '/api/quiz-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, name: name || '', source: source || 'popup' })
    }).catch(function () {});
    showThanks(name);
  }

  function showThanks(name) {
    var body = document.getElementById('sa-popup-body');
    if (!body) return;
    body.innerHTML = '<div class="sa-pop__thanks">'
      + '<div class="sa-pop__tick">'
      + '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
      + '</div>'
      + '<h3 class="sa-pop__heading">' + esc(S.copy.thanksHeading) + (name ? ', ' + esc(name.split(' ')[0]) : '') + '.</h3>'
      + '<p class="sa-pop__body">' + esc(S.copy.thanksBody) + '</p>'
      + '</div>';
    setTimeout(dismiss, 2400);
  }

  function createPopup() {
    shown = true;
    ssSet(CLAIM_KEY, 'lead');   /* this visit is ours */

    injectStyles();

    /* No dark scrim any more. The overlay is kept as an invisible,
       click-through layer so nothing that referenced it breaks; dismissing on
       an outside click is now a document listener, which leaves the page
       genuinely usable behind the card rather than merely visible. */
    var overlay = document.createElement('div');
    overlay.id = 'sa-lead-popup-overlay';
    document.body.appendChild(overlay);

    var modal = document.createElement('div');
    modal.id = 'sa-lead-popup';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'false');
    modal.setAttribute('aria-label', 'Stay in the loop with SA Art Fair');

    /* Google renders its own official button into this slot once the GSI
       script has loaded. Both this and the divider are hidden if that fails —
       a visitor must never see a button that does nothing. */
    var googleOn = GOOGLE_ID && S.google;

    var googleSlot = googleOn
      ? '<div id="sa-popup-google-wrap"><div id="sa-popup-google"></div></div>'
      : '';

    var divider = googleOn
      ? '<div id="sa-popup-or" class="sa-pop__or">'
        + '<div class="sa-pop__rule"></div>'
        + '<span class="sa-pop__or-label">or</span>'
        + '<div class="sa-pop__rule"></div></div>'
      : '';

    modal.innerHTML = '<div id="sa-popup-body">'
      + '<button id="sa-popup-close" aria-label="Close">'
      + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      + '</button>'
      + '<p class="sa-pop__eyebrow">' + esc(S.copy.eyebrow) + '</p>'
      + '<h3 class="sa-pop__heading">' + esc(S.copy.heading) + '</h3>'
      + '<p class="sa-pop__body">' + esc(S.copy.body) + '</p>'
      + googleSlot + divider
      + '<div class="sa-pop__fields">'
      + '<input id="sa-popup-name" class="sa-pop__input" type="text" placeholder="Your name (optional)" autocomplete="name">'
      + '<input id="sa-popup-email" class="sa-pop__input" type="email" placeholder="your@email.com" autocomplete="email">'
      + '<p id="sa-popup-err">Please enter a valid email address.</p>'
      + '</div>'
      + '<button id="sa-popup-submit">' + esc(S.copy.button) + '</button>'
      + '<p class="sa-pop__fine">No spam. Unsubscribe anytime.</p>'
      + '</div>';

    document.body.appendChild(modal);

    /* Click anywhere outside the card to dismiss. Bound on the next frame so
       the click or keypress that led here can't close it immediately. */
    setTimeout(function () {
      outsideClick = function (e) { if (!modal.contains(e.target)) dismiss(); };
      document.addEventListener('click', outsideClick, true);
    }, 0);

    /* Animate in */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        modal.style.opacity   = '1';
        modal.style.transform = 'translateY(0)';
      });
    });

    /* Close button */
    document.getElementById('sa-popup-close').addEventListener('click', dismiss);

    /* Manual email submit */
    document.getElementById('sa-popup-submit').addEventListener('click', function () {
      var email  = (document.getElementById('sa-popup-email') || {}).value || '';
      var name   = (document.getElementById('sa-popup-name')  || {}).value || '';
      var errEl  = document.getElementById('sa-popup-err');
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        if (errEl) errEl.style.display = 'block';
        return;
      }
      if (errEl) errEl.style.display = 'none';
      submitLead(email.trim(), name.trim(), 'popup');
    });

    /* Google sign-in — Google's own rendered button, no One Tap prompt */
    if (googleOn) {
      loadGSI().then(function () {
        var slot = document.getElementById('sa-popup-google');
        if (!slot) return;                       /* dismissed while loading */
        google.accounts.id.initialize({
          client_id: GOOGLE_ID,
          callback: function (resp) {
            try {
              var parts   = resp.credential.split('.');
              var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
              submitLead(payload.email, payload.name || '', 'google');
            } catch (e) { hideGoogleArea(); }
          },
          cancel_on_tap_outside: true
        });
        /* Measured, not fixed: the modal is 400px wide on a desktop (352px of
           content) but narrower on a phone, and renderButton only accepts
           200–400. */
        var w = Math.max(200, Math.min(400, Math.round(slot.getBoundingClientRect().width) || 352));
        google.accounts.id.renderButton(slot, {
          type: 'standard', theme: 'outline', size: 'large',
          text: 'continue_with', shape: 'pill',
          logo_alignment: 'center', width: w
        });
        /* renderButton fails SILENTLY when the origin is not authorised — it
           just leaves the slot empty — so check rather than trust. */
        setTimeout(function () {
          if (!slot.firstElementChild || !slot.offsetHeight) hideGoogleArea();
        }, 1200);
      }).catch(hideGoogleArea);
    }

    /* Enter key on email field */
    var emailField = document.getElementById('sa-popup-email');
    if (emailField) emailField.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('sa-popup-submit').click();
    });
  }

  function showPopup() {
    if (!shouldShow()) return;
    /* Counted before it is drawn, not after: the decision to show is what the
       number means, and counting last would lose it if drawing ever threw. */
    countImpression();
    createPopup();
  }

  /* ── Triggers ──
     Armed once on the baked-in defaults, then armed again if settings arrive.
     The delay is always measured from when the page loaded, so settings can
     only ever push the pop-up LATER: a longer delay extends the wait, and a
     shorter one that has already passed fires at its own configured moment,
     never before it. */

  var touch = 'ontouchstart' in window;
  var scrollFired = false;
  var scrollBound = false;

  function armTriggers() {
    clearTimeout(timer);
    if (!S.enabled) return;

    var delayMs  = (touch ? S.timing.mobileDelaySec : S.timing.desktopDelaySec) * 1000;
    var waitedMs = Date.now() - loadedAt;
    timer = setTimeout(showPopup, Math.max(0, delayMs - waitedMs));

    /* Exit intent doesn't fire on a touch screen, which is what the scroll
       trigger is there for. */
    if (touch && S.timing.scrollEnabled && !scrollBound) {
      scrollBound = true;
      window.addEventListener('scroll', function () {
        if (scrollFired || !S.timing.scrollEnabled) return;
        var depth = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
        if (depth > S.timing.scrollPercent / 100) { scrollFired = true; showPopup(); }
      }, { passive: true });
    }
  }

  document.addEventListener('mouseleave', function (e) {
    /* Mouse moving off the top of the window, towards the tab bar */
    if (S.timing.exitIntent && e.clientY < 5) showPopup();
  });

  armTriggers();      /* on the defaults, immediately */
  loadSettings();     /* then again, once the real settings land */
})();
