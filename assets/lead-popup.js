(function () {
  'use strict';

  var STORAGE_KEY  = 'sa_lead_popup_dismissed';
  var DISMISS_DAYS = 30;
  var API_URL      = window.__saLeadApiUrl     || 'https://sa-art-fair-admin.vercel.app';
  var GOOGLE_ID    = window.__saGoogleClientId || '';
  var FB_ID        = window.__saFbAppId        || '';
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

  function loadGSI() {
    if (window.google && window.google.accounts) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true; s.defer = true;
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function loadFBSDK() {
    if (window.FB) return Promise.resolve();
    return new Promise(function (resolve) {
      window.fbAsyncInit = function () {
        FB.init({ appId: FB_ID, version: 'v18.0', cookie: true, xfbml: false });
        resolve();
      };
      var s = document.createElement('script');
      s.src = 'https://connect.facebook.net/en_US/sdk.js';
      s.async = true; s.defer = true;
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

    var googleBtn = GOOGLE_ID
      ? '<button id="sa-popup-google" style="width:100%;padding:11px 16px;background:#fff;border:1.5px solid #dadce0;border-radius:3px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;font-size:.88rem;font-weight:500;color:#3c4043;margin-bottom:9px">'
        + '<svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>'
        + 'Continue with Google</button>'
      : '';

    var fbBtn = FB_ID
      ? '<button id="sa-popup-facebook" style="width:100%;padding:11px 16px;background:#1877f2;border:none;border-radius:3px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;font-size:.88rem;font-weight:600;color:#fff;margin-bottom:9px">'
        + '<svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047v-2.66c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.931-1.956 1.886v2.265h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>'
        + 'Continue with Facebook</button>'
      : '';

    var divider = (googleBtn || fbBtn)
      ? '<div style="display:flex;align-items:center;gap:10px;margin:4px 0 16px"><div style="flex:1;height:1px;background:#ebe5df"></div><span style="font-size:.7rem;color:#bbb;font-weight:600;text-transform:uppercase;letter-spacing:.06em">or</span><div style="flex:1;height:1px;background:#ebe5df"></div></div>'
      : '';

    modal.innerHTML = '<div id="sa-popup-body">'
      + '<button id="sa-popup-close" aria-label="Close" style="position:absolute;top:12px;right:14px;background:none;border:none;cursor:pointer;width:30px;height:30px;display:flex;align-items:center;justify-content:center;color:#aaa;border-radius:50%">'
      + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      + '</button>'
      + '<p style="font-size:.68rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:' + RUST + ';margin:0 0 10px">SA Art Fair</p>'
      + '<h3 style="margin:0 0 8px;font-size:1.15rem;font-weight:700;line-height:1.3;color:' + DARK + '">Stay in the loop.</h3>'
      + '<p style="margin:0 0 20px;font-size:.85rem;color:#777;line-height:1.6">Be first to know about new artists, exhibitions and exclusive works.</p>'
      + googleBtn + fbBtn + divider
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

    /* Google sign-in */
    var gBtn = document.getElementById('sa-popup-google');
    if (gBtn && GOOGLE_ID) {
      gBtn.addEventListener('click', function () {
        gBtn.disabled = true; gBtn.textContent = 'Connecting…';
        loadGSI().then(function () {
          google.accounts.id.initialize({
            client_id: GOOGLE_ID,
            callback: function (resp) {
              try {
                var parts   = resp.credential.split('.');
                var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                submitLead(payload.email, payload.name || '', 'google');
              } catch (e) { gBtn.disabled = false; gBtn.textContent = 'Continue with Google'; }
            },
            ux_mode: 'popup',
            cancel_on_tap_outside: true
          });
          google.accounts.id.prompt(function (n) {
            if (n.isNotDisplayed() || n.isSkippedMoment()) { gBtn.disabled = false; gBtn.textContent = 'Continue with Google'; }
          });
        }).catch(function () { gBtn.disabled = false; gBtn.textContent = 'Continue with Google'; });
      });
    }

    /* Facebook login */
    var fbBtnEl = document.getElementById('sa-popup-facebook');
    if (fbBtnEl && FB_ID) {
      fbBtnEl.addEventListener('click', function () {
        fbBtnEl.disabled = true; fbBtnEl.textContent = 'Connecting…';
        loadFBSDK().then(function () {
          FB.login(function (resp) {
            if (resp.status === 'connected') {
              FB.api('/me', { fields: 'name,email' }, function (user) {
                if (user && user.email) { submitLead(user.email, user.name || '', 'facebook'); }
                else { fbBtnEl.disabled = false; fbBtnEl.textContent = 'Continue with Facebook'; }
              });
            } else { fbBtnEl.disabled = false; fbBtnEl.textContent = 'Continue with Facebook'; }
          }, { scope: 'email' });
        }).catch(function () { fbBtnEl.disabled = false; fbBtnEl.textContent = 'Continue with Facebook'; });
      });
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
