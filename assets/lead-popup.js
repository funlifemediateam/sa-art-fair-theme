(function () {
  'use strict';

  var STORAGE_KEY  = 'sa_lead_popup_dismissed';
  var DISMISS_DAYS = 30;
  var API_URL      = window.__saLeadApiUrl     || 'https://sa-art-fair-admin.vercel.app';
  var GOOGLE_ID    = window.__saGoogleClientId || '';
  var DARK         = '#1d1c21';
  var ORANGE       = '#0f4a52';
  var RUST         = '#0f4a52';

  var shown = false;
  var timer = null;

  function shouldShow() {
    if (shown) return false;
    if (document.getElementById('sa-quiz-overlay')) return false;
    try {
      var ts = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
      if (ts && Date.now() - ts < DISMISS_DAYS * 86400000) return false;
    } catch (e) {}
    return true;
  }

  function dismiss() {
    shown = true;
    clearTimeout(timer);
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch (e) {}
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

  function submitLead(email, name, source) {
    if (!email) return;
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
      + '<h3 style="margin:0 0 10px;font-size:1.2rem;font-weight:700;color:' + DARK + '">You\'re in' + (name ? ', ' + name.split(' ')[0] : '') + '.</h3>'
      + '<p style="margin:0;font-size:0.9rem;color:#666;line-height:1.6">Welcome to SA Art Fair. We\'ll be in touch with new artists, exhibitions and exclusive works.</p>'
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
    var googleSlot = GOOGLE_ID
      ? '<div id="sa-popup-google-wrap" style="margin-bottom:9px">'
        + '<div id="sa-popup-google" style="display:flex;justify-content:center"></div>'
        + '</div>'
      : '';

    /* The two hairlines carry display:block for a reason: they are empty
       divs, and base.css hides every `div:empty` outright. Inline flex/height
       can't undo that — `display` has to be set inline to beat the
       stylesheet — so without it both rules collapse to 0x0 and "or" sits
       alone against the left edge. Don't drop it as redundant. */
    var divider = GOOGLE_ID
      ? '<div id="sa-popup-or" style="display:flex;align-items:center;gap:10px;margin:4px 0 16px"><div style="display:block;flex:1;height:1px;background:#ebe5df"></div><span style="font-size:.7rem;color:#bbb;font-weight:600;text-transform:uppercase;letter-spacing:.06em">or</span><div style="display:block;flex:1;height:1px;background:#ebe5df"></div></div>'
      : '';

    modal.innerHTML = '<div id="sa-popup-body">'
      + '<button id="sa-popup-close" aria-label="Close" style="position:absolute;top:12px;right:14px;background:none;border:none;cursor:pointer;width:30px;height:30px;display:flex;align-items:center;justify-content:center;color:#aaa;border-radius:50%">'
      + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      + '</button>'
      + '<p style="font-size:.68rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:' + RUST + ';margin:0 0 10px">SA Art Fair</p>'
      + '<h3 style="margin:0 0 8px;font-size:1.15rem;font-weight:700;line-height:1.3;color:' + DARK + '">Stay in the loop.</h3>'
      + '<p style="margin:0 0 20px;font-size:.85rem;color:#777;line-height:1.6">Be first to know about new artists, exhibitions and exclusive works.</p>'
      + googleSlot + divider
      + '<div style="margin-bottom:10px">'
      + '<input id="sa-popup-name" type="text" placeholder="Your name (optional)" autocomplete="name" style="width:100%;padding:10px 13px;border:1.5px solid #e5ddd7;border-radius:3px;font-size:.88rem;color:' + DARK + ';outline:none;margin-bottom:8px;box-sizing:border-box">'
      + '<input id="sa-popup-email" type="email" placeholder="your@email.com" autocomplete="email" style="width:100%;padding:10px 13px;border:1.5px solid #e5ddd7;border-radius:3px;font-size:.88rem;color:' + DARK + ';outline:none;box-sizing:border-box">'
      + '<p id="sa-popup-err" style="display:none;color:#c0392b;font-size:.75rem;margin:5px 0 0">Please enter a valid email address.</p>'
      + '</div>'
      + '<button id="sa-popup-submit" style="width:100%;padding:12px;background:' + DARK + ';color:#fff;border:none;cursor:pointer;border-radius:2px;font-size:.8rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Subscribe</button>'
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
    if (GOOGLE_ID) {
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
    createPopup();
  }

  /* Exit intent: mouse moves toward closing the tab (y < 5px) */
  document.addEventListener('mouseleave', function (e) {
    if (e.clientY < 5) showPopup();
  });

  /* 30-second timer fallback */
  timer = setTimeout(function () { showPopup(); }, 30000);

  /* Mobile: scroll-based fallback (60% depth) since exit intent doesn't fire on touch */
  if ('ontouchstart' in window) {
    clearTimeout(timer);
    timer = setTimeout(function () { showPopup(); }, 20000);
    var scrollFired = false;
    window.addEventListener('scroll', function () {
      if (scrollFired) return;
      var depth = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
      if (depth > 0.6) { scrollFired = true; showPopup(); }
    }, { passive: true });
  }
})();
