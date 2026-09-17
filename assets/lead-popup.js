(function () {
  'use strict';

  var STORAGE_KEY  = 'sa_lead_popup_dismissed';
  var SIGNED_KEY   = 'sa_lead_popup_signed';    /* they already joined, here */
  var SEEN_KEY     = 'sa_lead_popup_seen';      /* this browser has been before */
  var NEWVISIT_KEY = 'sa_lead_popup_newvisit';  /* session: started as a new visitor */
  var COUNT_KEY    = 'sa_lead_popup_counted';   /* session: impression already counted */
  var CACHE_KEY    = 'sa_popup_settings';       /* session: settings + when fetched */
  var CACHE_MS     = 10 * 60 * 1000;
  var FETCH_MS     = 4000;                      /* give up and use the defaults */
  var API_URL      = window.__saLeadApiUrl     || 'https://sa-art-fair-admin.vercel.app';
  var GOOGLE_ID    = window.__saGoogleClientId || '';
  var PAGE         = window.__saPopupPage      || 'other';
  var DARK         = '#1d1c21';
  var ORANGE       = '#0f4a52';
  var RUST         = '#0f4a52';

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

  function shouldShow() {
    if (shown) return false;
    if (!S.enabled) return false;
    if (onExcludedPage()) return false;
    if (document.getElementById('sa-quiz-overlay')) return false;
    if (!S.pages[PAGE]) return false;
    if (S.audience.newVisitorsOnly && !isNewVisitor) return false;
    if (S.audience.skipSignedUp && lsGet(SIGNED_KEY)) return false;
    if (S.audience.skipMidBooking && (holdActive() || holdBarShowing())) return false;
    var ts = parseInt(lsGet(STORAGE_KEY) || '0', 10);
    if (ts && Date.now() - ts < S.timing.dismissDays * 86400000) return false;
    return true;
  }

  function dismiss() {
    shown = true;
    clearTimeout(timer);
    lsSet(STORAGE_KEY, String(Date.now()));
    var modal = document.getElementById('sa-lead-popup');
    if (modal) {
      modal.style.opacity = '0';
      modal.style.transform = 'translateY(8px)';
      setTimeout(function () { if (modal.parentNode) modal.parentNode.removeChild(modal); }, 220);
    }
    var overlay = document.getElementById('sa-lead-popup-overlay');
    if (overlay) {
      overlay.style.opacity = '0';
      setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 220);
    }
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
    if (!raw || typeof raw !== 'object') return;
    ['timing', 'pages', 'audience', 'copy'].forEach(function (group) {
      if (!raw[group] || typeof raw[group] !== 'object') return;
      Object.keys(S[group]).forEach(function (k) {
        var v = raw[group][k];
        if (typeof v === typeof S[group][k] && !(typeof v === 'string' && !v)) S[group][k] = v;
      });
    });
    if (typeof raw.enabled === 'boolean') S.enabled = raw.enabled;
    if (typeof raw.google === 'boolean') S.google = raw.google;
  }

  function settingsSettled() {
    if (settled) return;
    settled = true;
    armTriggers();
  }

  function loadSettings() {
    var cached = ssGet(CACHE_KEY);
    if (cached) {
      try {
        var c = JSON.parse(cached);
        if (c && Date.now() - c.at < CACHE_MS) { mergeSettings(c.v); settingsSettled(); return; }
      } catch (e) {}
    }
    var done = false;
    var giveUp = setTimeout(function () { if (!done) { done = true; settingsSettled(); } }, FETCH_MS);
    fetch(API_URL + '/api/popup-settings', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) {
        if (done) return;
        done = true; clearTimeout(giveUp);
        if (v) { mergeSettings(v); ssSet(CACHE_KEY, JSON.stringify({ at: Date.now(), v: v })); }
        settingsSettled();
      })
      .catch(function () {
        if (done) return;
        done = true; clearTimeout(giveUp);
        settingsSettled();   /* the baked-in defaults stand */
      });
  }

  /* ── Impressions ──
     One per browser session. A page word and nothing else: no email, no id,
     nothing that identifies anyone. sendBeacon so it cannot hold the page up. */
  function countImpression() {
    if (ssGet(COUNT_KEY)) return;
    ssSet(COUNT_KEY, '1');
    var url = API_URL + '/api/popup-impression';
    var body = JSON.stringify({ page: PAGE });
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
    body.innerHTML = '<div style="text-align:center;padding:20px 0">'
      + '<div style="width:52px;height:52px;border-radius:50%;background:' + ORANGE + ';margin:0 auto 18px;display:flex;align-items:center;justify-content:center">'
      + '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
      + '</div>'
      + '<h3 style="margin:0 0 10px;font-size:1.2rem;font-weight:700;color:' + DARK + '">' + esc(S.copy.thanksHeading) + (name ? ', ' + esc(name.split(' ')[0]) : '') + '.</h3>'
      + '<p style="margin:0;font-size:0.9rem;color:#666;line-height:1.6">' + esc(S.copy.thanksBody) + '</p>'
      + '</div>';
    setTimeout(dismiss, 2400);
  }

  function createPopup() {
    shown = true;

    var overlay = document.createElement('div');
    overlay.id = 'sa-lead-popup-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.45);opacity:0;transition:opacity .22s';
    overlay.addEventListener('click', dismiss);
    document.body.appendChild(overlay);

    var modal = document.createElement('div');
    modal.id = 'sa-lead-popup';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Stay in the loop with SA Art Fair');
    modal.style.cssText = [
      'position:fixed;bottom:24px;right:24px;z-index:99999',
      'width:100%;max-width:400px',
      'background:#fff;border-radius:8px',
      'box-shadow:0 12px 48px rgba(0,0,0,.22)',
      'padding:28px 24px 20px',
      'opacity:0;transform:translateY(12px)',
      'transition:opacity .22s,transform .22s'
    ].join(';');

    /* Google renders its own official button into this slot once the GSI
       script has loaded. Both this and the divider are hidden if that fails —
       a visitor must never see a button that does nothing. */
    var googleOn = GOOGLE_ID && S.google;

    var googleSlot = googleOn
      ? '<div id="sa-popup-google-wrap" style="margin-bottom:9px">'
        + '<div id="sa-popup-google" style="display:flex;justify-content:center"></div>'
        + '</div>'
      : '';

    /* The two hairlines carry display:block for a reason: they are empty
       divs, and base.css hides every `div:empty` outright. Inline flex/height
       can't undo that — `display` has to be set inline to beat the
       stylesheet — so without it both rules collapse to 0x0 and "or" sits
       alone against the left edge. Don't drop it as redundant. */
    var divider = googleOn
      ? '<div id="sa-popup-or" style="display:flex;align-items:center;gap:10px;margin:4px 0 16px"><div style="display:block;flex:1;height:1px;background:#ebe5df"></div><span style="font-size:.7rem;color:#bbb;font-weight:600;text-transform:uppercase;letter-spacing:.06em">or</span><div style="display:block;flex:1;height:1px;background:#ebe5df"></div></div>'
      : '';

    modal.innerHTML = '<div id="sa-popup-body">'
      + '<button id="sa-popup-close" aria-label="Close" style="position:absolute;top:12px;right:14px;background:none;border:none;cursor:pointer;width:30px;height:30px;display:flex;align-items:center;justify-content:center;color:#aaa;border-radius:50%">'
      + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      + '</button>'
      + '<p style="font-size:.68rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:' + RUST + ';margin:0 0 10px">' + esc(S.copy.eyebrow) + '</p>'
      + '<h3 style="margin:0 0 8px;font-size:1.15rem;font-weight:700;line-height:1.3;color:' + DARK + '">' + esc(S.copy.heading) + '</h3>'
      + '<p style="margin:0 0 20px;font-size:.85rem;color:#777;line-height:1.6">' + esc(S.copy.body) + '</p>'
      + googleSlot + divider
      + '<div style="margin-bottom:10px">'
      + '<input id="sa-popup-name" type="text" placeholder="Your name (optional)" autocomplete="name" style="width:100%;padding:10px 13px;border:1.5px solid #e5ddd7;border-radius:3px;font-size:.88rem;color:' + DARK + ';outline:none;margin-bottom:8px;box-sizing:border-box">'
      + '<input id="sa-popup-email" type="email" placeholder="your@email.com" autocomplete="email" style="width:100%;padding:10px 13px;border:1.5px solid #e5ddd7;border-radius:3px;font-size:.88rem;color:' + DARK + ';outline:none;box-sizing:border-box">'
      + '<p id="sa-popup-err" style="display:none;color:#c0392b;font-size:.75rem;margin:5px 0 0">Please enter a valid email address.</p>'
      + '</div>'
      + '<button id="sa-popup-submit" style="width:100%;padding:12px;background:' + DARK + ';color:#fff;border:none;cursor:pointer;border-radius:2px;font-size:.8rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase">' + esc(S.copy.button) + '</button>'
      + '<p style="margin:10px 0 0;font-size:.67rem;color:#bbb;text-align:center">No spam. Unsubscribe anytime.</p>'
      + '</div>';

    document.body.appendChild(modal);

    /* Animate in */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.style.opacity = '1';
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
          text: 'continue_with', shape: 'rectangular',
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
