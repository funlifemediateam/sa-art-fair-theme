(function () {
  'use strict';

  function init() {
    var startBtn = document.getElementById('sa-quiz-start-btn');
    var overlay  = document.getElementById('sa-quiz-overlay');
    if (!startBtn || !overlay) return;

    var API_URL = window.__saQuizApiUrl || 'https://sa-art-fair-admin.vercel.app';

    var cfg     = null;
    var answers = []; // { artwork_index, category_id, loved }
    var step    = 0;

    var DARK   = '#1d1c21';
    var ORANGE = '#0f4a52';
    var RUST   = '#0f4a52';
    var CORAL  = '#f26b52';

    function esc(s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function fetchConfig() {
      return fetch(API_URL + '/api/quiz-config', { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json(); });
    }

    /* ── Tally hearts per category, first-listed category wins ties ── */
    function computeResult() {
      if (!cfg || !cfg.categories || !cfg.artworks) return null;
      var counts = {};
      cfg.categories.forEach(function (c) { counts[c.id] = 0; });
      answers.forEach(function (a) {
        if (a.loved && counts.hasOwnProperty(a.category_id)) counts[a.category_id]++;
      });
      var best = null, bestCount = -1;
      cfg.categories.forEach(function (c) {
        if ((counts[c.id] || 0) > bestCount) { bestCount = counts[c.id]; best = c; }
      });
      return best;
    }

    /* ── Inject styles once ── */
    if (!document.getElementById('sa-quiz-styles')) {
      var s = document.createElement('style');
      s.id = 'sa-quiz-styles';
      s.textContent = [
        '#sa-quiz-overlay * { box-sizing: border-box; }',
        '.sa-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin: 0 3px; transition: background .3s, transform .3s; }',
        '.sa-dot-past   { background: ' + DARK + '; }',
        '.sa-dot-now    { background: ' + ORANGE + '; transform: scale(1.5); }',
        '.sa-dot-future { background: #ddd; }',
        '.sa-artwork-frame {',
        '  width: 100%; max-width: 460px; margin: 0 auto; border-radius: 8px; overflow: hidden;',
        '  background: #f0ece8; box-shadow: 0 12px 40px rgba(0,0,0,.14);',
        '}',
        '.sa-artwork-frame img { width: 100%; height: 100%; object-fit: cover; display: block; aspect-ratio: 4/5; }',
        '.sa-swipe-btn {',
        '  flex: 1; display: flex; align-items: center; justify-content: center; gap: 10px;',
        '  padding: 16px 20px; border-radius: 40px; cursor: pointer; font-size: .85rem; font-weight: 700;',
        '  letter-spacing: .06em; text-transform: uppercase; border: 1.5px solid transparent; transition: transform .12s, box-shadow .12s;',
        '}',
        '.sa-swipe-btn:active { transform: scale(.96); }',
        '.sa-swipe-btn--love { background: ' + CORAL + '; color: #fff; }',
        '.sa-swipe-btn--love:hover { box-shadow: 0 6px 18px rgba(242,107,82,.4); }',
        '.sa-swipe-btn--pass { background: #fff; color: ' + DARK + '; border-color: #e5ddd7; }',
        '.sa-swipe-btn--pass:hover { border-color: ' + DARK + '; }',
        '@media (max-width: 640px) {',
        '  .sa-artwork-frame { max-width: 320px; }',
        '}'
      ].join('\n');
      document.head.appendChild(s);
    }

    /* ── Dot progress indicator ── */
    function dots(current, total) {
      var h = '<div style="display:flex;align-items:center;justify-content:center">';
      for (var i = 0; i < total; i++) {
        var c = i < current ? 'sa-dot-past' : i === current ? 'sa-dot-now' : 'sa-dot-future';
        h += '<span class="sa-dot ' + c + '"></span>';
      }
      return h + '</div>';
    }

    /* ── Render: intro ── */
    function renderIntro() {
      return '<div style="max-width:540px;margin:0 auto;padding:68px 24px;text-align:center">'
        + '<p style="font-size:.7rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:' + RUST + ';margin:0 0 18px">Art You Love</p>'
        + '<h1 style="font-size:clamp(1.9rem,5vw,3rem);font-weight:700;line-height:1.1;letter-spacing:-.025em;color:' + DARK + ';margin:0 0 22px">' + esc(cfg.title || 'What Art Do You Love?') + '</h1>'
        + '<p style="font-size:1rem;color:#666;line-height:1.75;margin:0 0 10px">' + esc(cfg.subtitle || '') + '</p>'
        + (cfg.description ? '<p style="font-size:.85rem;color:#999;line-height:1.72;margin:0 0 40px;max-width:440px;margin-left:auto;margin-right:auto">' + esc(cfg.description) + '</p>' : '<div style="height:28px"></div>')
        + '<button id="sa-quiz-begin" style="display:inline-flex;align-items:center;gap:10px;padding:16px 44px;background:' + DARK + ';color:#fff;font-size:.82rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;border:none;cursor:pointer;border-radius:2px">'
        + esc(cfg.cta_text || 'Take The Quiz')
        + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>'
        + '</button>'
        + '<p style="margin:16px 0 0;font-size:.72rem;color:#ccc;letter-spacing:.05em">' + ((cfg.artworks && cfg.artworks.length) || 14) + ' artworks · 1 minute</p>'
        + '</div>';
    }

    /* ── Render: swipe screen (one artwork at a time) ── */
    function renderSwipe(ai) {
      var artwork = cfg.artworks[ai];
      var total   = cfg.artworks.length;

      var html = '<div style="width:100%;max-width:620px;margin:0 auto;padding:28px 18px 48px;text-align:center">';

      html += '<div style="margin-bottom:20px">'
        + dots(ai, total)
        + '<p style="font-size:.7rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#c4b9b2;margin:12px 0 0">' + (ai + 1) + ' of ' + total + '</p>'
        + '</div>';

      html += '<h2 style="font-size:clamp(1.15rem,2.6vw,1.5rem);font-weight:700;color:' + DARK + ';margin:0 0 22px;letter-spacing:-.01em">Do you love this?</h2>';

      html += '<div class="sa-artwork-frame">'
        + (artwork.image
          ? '<img src="' + esc(artwork.image) + '" alt="" loading="eager">'
          : '<div style="width:100%;aspect-ratio:4/5;display:flex;align-items:center;justify-content:center;color:#ccc;font-size:.8rem">No image</div>')
        + '</div>';

      html += '<div style="display:flex;gap:12px;max-width:420px;margin:28px auto 0">'
        + '<button class="sa-swipe-btn sa-swipe-btn--pass" data-loved="0">'
        + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        + '<span>Not for me</span></button>'
        + '<button class="sa-swipe-btn sa-swipe-btn--love" data-loved="1">'
        + '<span aria-hidden="true">❤️</span><span>Love it</span></button>'
        + '</div>';

      html += '</div>';
      return html;
    }

    /* ── OAuth helpers ── */
    var GOOGLE_CLIENT_ID = window.__saGoogleClientId || '';
    var FB_APP_ID        = window.__saFbAppId        || '';

    function loadGoogleGSI() {
      if (window.google && window.google.accounts) return Promise.resolve();
      return new Promise(function(resolve, reject) {
        var s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true; s.defer = true;
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    function loadFBSDK() {
      if (window.FB) return Promise.resolve();
      return new Promise(function(resolve) {
        window.fbAsyncInit = function() {
          FB.init({ appId: FB_APP_ID, version: 'v18.0', cookie: true, xfbml: false });
          resolve();
        };
        var s = document.createElement('script');
        s.src = 'https://connect.facebook.net/en_US/sdk.js';
        s.async = true; s.defer = true;
        document.head.appendChild(s);
      });
    }

    function submitLead(email, name, source) {
      var result = computeResult();
      return fetch(API_URL + '/api/quiz-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, name: name || '', result_id: result && result.id, result_name: result && result.name, source: source })
      }).catch(function () {}).then(function () { return result; });
    }

    function handleOAuthSuccess(email, name, authSource) {
      var submitBtn = document.getElementById('sa-quiz-submit');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Finding your art type…';
      }
      submitLead(email, name, authSource).then(function (result) { setBody(renderResult(result)); });
    }

    /* ── Render: email capture ── */
    function renderEmailCapture() {
      var googleBtn = GOOGLE_CLIENT_ID
        ? '<button id="sa-quiz-google" style="width:100%;padding:12px 16px;background:#fff;border:1.5px solid #dadce0;border-radius:3px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;font-size:.9rem;font-weight:500;color:#3c4043;margin-bottom:10px;transition:box-shadow .15s" onmouseover="this.style.boxShadow=\'0 1px 6px rgba(0,0,0,.12)\'" onmouseout="this.style.boxShadow=\'\'">'
          + '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>'
          + 'Continue with Google</button>' : '';
      var fbBtn = FB_APP_ID
        ? '<button id="sa-quiz-facebook" style="width:100%;padding:12px 16px;background:#1877f2;border:none;border-radius:3px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;font-size:.9rem;font-weight:600;color:#fff;margin-bottom:10px;transition:opacity .15s" onmouseover="this.style.opacity=\'.9\'" onmouseout="this.style.opacity=\'1\'">'
          + '<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047v-2.66c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.931-1.956 1.886v2.265h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>'
          + 'Continue with Facebook</button>' : '';
      var divider = (googleBtn || fbBtn)
        ? '<div style="display:flex;align-items:center;gap:12px;margin:4px 0 20px"><div style="flex:1;height:1px;background:#e5ddd7"></div><span style="font-size:.74rem;color:#bbb;font-weight:600;text-transform:uppercase;letter-spacing:.06em">or</span><div style="flex:1;height:1px;background:#e5ddd7"></div></div>'
        : '';

      return '<div style="max-width:440px;margin:0 auto;padding:68px 24px;text-align:center">'
        + '<div style="width:56px;height:56px;border-radius:50%;background:' + ORANGE + ';margin:0 auto 22px;display:flex;align-items:center;justify-content:center">'
        + '<span style="font-size:1.4rem" aria-hidden="true">❤️</span>'
        + '</div>'
        + '<p style="font-size:.7rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:' + RUST + ';margin:0 0 12px">Almost there</p>'
        + '<h2 style="font-size:clamp(1.4rem,4vw,1.9rem);font-weight:700;letter-spacing:-.02em;margin:0 0 12px;color:' + DARK + '">Want to discover your art type?</h2>'
        + '<p style="font-size:.9rem;color:#888;line-height:1.65;margin:0 0 28px">Enter your email and we’ll send you your result.</p>'
        + googleBtn + fbBtn + divider
        + '<div style="text-align:left;margin-bottom:14px">'
        + '<label style="display:block;font-size:.74rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#777;margin-bottom:8px">Name <span style="text-transform:none;font-weight:500;color:#bbb">(optional)</span></label>'
        + '<input id="sa-quiz-name" type="text" placeholder="Your name" autocomplete="name" style="width:100%;padding:13px 16px;border:1.5px solid #e5ddd7;border-radius:3px;font-size:.95rem;outline:none;color:' + DARK + '">'
        + '</div>'
        + '<div style="text-align:left;margin-bottom:28px">'
        + '<label style="display:block;font-size:.74rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#777;margin-bottom:8px">Email <span style="color:#c0392b">*</span></label>'
        + '<input id="sa-quiz-email" type="email" placeholder="you@example.com" autocomplete="email" style="width:100%;padding:13px 16px;border:1.5px solid #e5ddd7;border-radius:3px;font-size:.95rem;outline:none;color:' + DARK + '">'
        + '<p id="sa-quiz-email-err" style="display:none;color:#c0392b;font-size:.78rem;margin:6px 0 0">Please enter a valid email address.</p>'
        + '</div>'
        + '<button id="sa-quiz-submit" style="width:100%;padding:16px;background:' + DARK + ';color:#fff;font-size:.82rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;border:none;cursor:pointer;border-radius:2px;display:flex;align-items:center;justify-content:center;gap:10px">'
        + 'Reveal my art type'
        + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>'
        + '</button>'
        + '<p style="margin:16px 0 0;font-size:.7rem;color:#bbb">By continuing you agree to receive marketing emails. Unsubscribe anytime.</p>'
        + '</div>';
    }

    /* ── Render: result ── */
    function renderResult(category) {
      if (!category) {
        return '<div style="max-width:540px;margin:0 auto;padding:68px 24px;text-align:center">'
          + '<h2 style="font-size:1.8rem;font-weight:700;color:' + DARK + ';margin:0 0 16px">Quiz complete!</h2>'
          + '<p style="color:#888">Thanks for taking the quiz.</p>'
          + '<button id="sa-quiz-close-result" style="margin-top:32px;padding:14px 36px;background:' + DARK + ';color:#fff;border:none;cursor:pointer;font-size:.82rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-radius:2px">Continue browsing</button>'
          + '</div>';
      }

      var categoryArtworks = (cfg.artworks || []).filter(function (a) { return a.category_id === category.id && a.image; });

      var html = '<div style="max-width:640px;margin:0 auto;padding:48px 24px 72px;text-align:center">';

      html += '<p style="font-size:.7rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:' + RUST + ';margin:0 0 14px">Your Art Type Is</p>';
      html += '<h2 style="font-size:clamp(2rem,5vw,2.8rem);font-weight:700;letter-spacing:-.025em;margin:0 0 24px;color:' + DARK + ';text-transform:uppercase">' + esc(category.name) + '</h2>';

      if (category.description) {
        html += '<p style="font-size:1rem;line-height:1.8;color:#666;margin:0 0 24px">' + esc(category.description) + '</p>';
      }
      if (category.artists_text) {
        html += '<p style="font-size:.92rem;color:' + DARK + ';margin:0 0 40px"><strong>Artists you might love:</strong> ' + esc(category.artists_text) + '</p>';
      }

      if (categoryArtworks.length) {
        html += '<div style="display:grid;grid-template-columns:' + (categoryArtworks.length >= 2 ? '1fr 1fr' : '1fr') + ';gap:10px;margin-bottom:36px">';
        categoryArtworks.forEach(function (a) {
          html += '<div style="border-radius:4px;overflow:hidden;background:#f0ece8">'
            + '<div style="aspect-ratio:4/5;overflow:hidden">'
            + '<img src="' + esc(a.image) + '" alt="' + esc(a.title || '') + '" style="width:100%;height:100%;object-fit:cover;display:block">'
            + '</div>'
            + (a.title ? '<p style="margin:0;padding:8px 10px;font-size:.72rem;color:#999">' + esc(a.title) + '</p>' : '')
            + '</div>';
        });
        html += '</div>';
      }

      html += '<a href="/collections/gallery" style="display:inline-flex;align-items:center;gap:8px;padding:14px 32px;background:' + DARK + ';color:#fff;font-size:.78rem;font-weight:700;text-decoration:none;border-radius:2px;letter-spacing:.06em;text-transform:uppercase">'
        + 'Discover more art you’ll love'
        + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>'
        + '</a>';

      html += '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:16px">'
        + '<button id="sa-quiz-retake" style="padding:13px 28px;background:none;border:none;color:#999;font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;cursor:pointer">Retake quiz</button>'
        + '<button id="sa-quiz-close-result" style="padding:13px 28px;background:none;border:none;color:#999;font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;cursor:pointer">Close</button>'
        + '</div>';

      html += '</div>';
      return html;
    }

    /* ── Overlay shell (sticky header + scrollable body) ── */
    function overlayShell(content) {
      return '<div style="min-height:100%;display:flex;flex-direction:column">'
        + '<div style="position:sticky;top:0;z-index:1;background:rgba(255,255,255,.96);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid #f0e8e0;padding:14px 22px;display:flex;align-items:center;justify-content:space-between">'
        + '<span style="font-size:.65rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#c4b9b2">SA Art Fair · Art You Love</span>'
        + '<button id="sa-quiz-close" style="background:none;border:none;cursor:pointer;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#888;transition:background .15s" onmouseenter="this.style.background=\'#f5f0ec\'" onmouseleave="this.style.background=\'none\'">'
        + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        + '</button>'
        + '</div>'
        + '<div id="sa-quiz-body" style="flex:1;display:flex;align-items:center;justify-content:center">'
        + content + '</div></div>';
    }

    function showOverlay(content) {
      overlay.style.display = 'block';
      document.body.style.overflow = 'hidden';
      overlay.innerHTML = overlayShell(content);
      overlay.scrollTop = 0;
      bindOverlayEvents();
    }

    function hideOverlay() {
      overlay.style.display = 'none';
      document.body.style.overflow = '';
      answers = [];
      step    = 0;
    }

    function setBody(content) {
      var body = document.getElementById('sa-quiz-body');
      if (body) { body.innerHTML = content; bindOverlayEvents(); }
      overlay.scrollTop = 0;
    }

    function advanceFromSwipe(loved) {
      var artwork = cfg.artworks[step];
      answers = answers.filter(function (a) { return a.artwork_index !== step; });
      answers.push({ artwork_index: step, category_id: artwork.category_id, loved: loved });
      step++;
      setBody(step < cfg.artworks.length ? renderSwipe(step) : renderEmailCapture());
    }

    /* ── Event binding (called after every render) ── */
    function bindOverlayEvents() {
      var closeBtn = document.getElementById('sa-quiz-close');
      if (closeBtn) closeBtn.onclick = hideOverlay;

      var beginBtn = document.getElementById('sa-quiz-begin');
      if (beginBtn) beginBtn.onclick = function () { step = 0; setBody(renderSwipe(0)); };

      document.querySelectorAll('.sa-swipe-btn').forEach(function (el) {
        el.onclick = function () { advanceFromSwipe(el.dataset.loved === '1'); };
      });

      var googleBtn = document.getElementById('sa-quiz-google');
      if (googleBtn && GOOGLE_CLIENT_ID) {
        googleBtn.onclick = function() {
          googleBtn.disabled = true;
          googleBtn.textContent = 'Connecting…';
          loadGoogleGSI().then(function() {
            google.accounts.id.initialize({
              client_id: GOOGLE_CLIENT_ID,
              callback: function(resp) {
                try {
                  var parts   = resp.credential.split('.');
                  var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                  handleOAuthSuccess(payload.email, payload.name, 'google');
                } catch(e) {
                  googleBtn.disabled = false;
                  googleBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>Continue with Google';
                }
              },
              ux_mode: 'popup',
              cancel_on_tap_outside: true
            });
            google.accounts.id.prompt(function(notification) {
              if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                googleBtn.disabled = false;
                googleBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>Continue with Google';
              }
            });
          }).catch(function() {
            googleBtn.disabled = false; googleBtn.textContent = 'Continue with Google';
          });
        };
      }

      var fbBtn = document.getElementById('sa-quiz-facebook');
      if (fbBtn && FB_APP_ID) {
        fbBtn.onclick = function() {
          fbBtn.disabled = true; fbBtn.textContent = 'Connecting…';
          loadFBSDK().then(function() {
            FB.login(function(resp) {
              if (resp.status === 'connected') {
                FB.api('/me', { fields: 'name,email' }, function(user) {
                  if (user && user.email) {
                    handleOAuthSuccess(user.email, user.name || '', 'facebook');
                  } else {
                    fbBtn.disabled = false; fbBtn.textContent = 'Continue with Facebook';
                    alert('Facebook did not return your email. Please enter it manually.');
                  }
                });
              } else {
                fbBtn.disabled = false; fbBtn.textContent = 'Continue with Facebook';
              }
            }, { scope: 'email' });
          }).catch(function() { fbBtn.disabled = false; fbBtn.textContent = 'Continue with Facebook'; });
        };
      }

      var submitBtn = document.getElementById('sa-quiz-submit');
      if (submitBtn) {
        submitBtn.onclick = function () {
          var emailEl = document.getElementById('sa-quiz-email');
          var nameEl  = document.getElementById('sa-quiz-name');
          var errEl   = document.getElementById('sa-quiz-email-err');
          var email   = (emailEl && emailEl.value.trim()) || '';
          var name    = (nameEl  && nameEl.value.trim())  || '';
          if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            if (errEl) errEl.style.display = 'block';
            return;
          }
          if (errEl) errEl.style.display = 'none';
          submitBtn.disabled = true;
          submitBtn.innerHTML = 'Finding your art type…';
          submitLead(email, name, 'email').then(function (result) { setBody(renderResult(result)); });
        };
      }

      var retakeBtn = document.getElementById('sa-quiz-retake');
      if (retakeBtn) retakeBtn.onclick = function () { answers = []; step = 0; setBody(renderIntro()); };

      var closeResult = document.getElementById('sa-quiz-close-result');
      if (closeResult) closeResult.onclick = hideOverlay;
    }

    /* ── Bootstrap ── */
    startBtn.addEventListener('click', function () {
      if (cfg) { showOverlay(renderIntro()); return; }
      var origHTML = startBtn.innerHTML;
      startBtn.disabled = true;
      startBtn.innerHTML = '<span>Loading…</span>';
      fetchConfig()
        .then(function (data) {
          cfg = data;
          startBtn.disabled = false;
          startBtn.innerHTML = origHTML;
          showOverlay(renderIntro());
        })
        .catch(function () {
          startBtn.disabled = false;
          startBtn.innerHTML = origHTML;
          alert('Could not load quiz. Please try again.');
        });
    });

    overlay.addEventListener('click', function (e) { if (e.target === overlay) hideOverlay(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay.style.display !== 'none') hideOverlay(); });

  } // end init()

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
