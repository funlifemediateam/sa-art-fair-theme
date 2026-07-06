(function () {
  'use strict';

  function init() {
    var startBtn = document.getElementById('sa-quiz-start-btn');
    var overlay  = document.getElementById('sa-quiz-overlay');
    if (!startBtn || !overlay) return;

    var API_URL = window.__saQuizApiUrl || 'https://sa-art-fair-admin.vercel.app';

    var cfg     = null;
    var answers = [];
    var step    = 0;

    var DARK   = '#1d1c21';
    var ORANGE = '#f26b52';
    var RUST   = '#a35536';

    function esc(s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function fetchConfig() {
      return fetch(API_URL + '/api/quiz-config', { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json(); });
    }

    function computeResult() {
      if (!cfg || !cfg.personalities || !cfg.questions) return null;
      var scores = {};
      cfg.personalities.forEach(function (p) { scores[p.id] = 0; });
      answers.forEach(function (a) {
        var q   = cfg.questions[a.question_index];
        var opt = q && q['option_' + a.side];
        if (opt && opt.scores) {
          Object.keys(opt.scores).forEach(function (pid) {
            scores[pid] = (scores[pid] || 0) + (parseInt(opt.scores[pid], 10) || 0);
          });
        }
      });
      var best = null, bestScore = -1;
      cfg.personalities.forEach(function (p) {
        if ((scores[p.id] || 0) > bestScore) { bestScore = scores[p.id]; best = p; }
      });
      return best;
    }

    /* ── Inject styles once ── */
    if (!document.getElementById('sa-quiz-styles')) {
      var s = document.createElement('style');
      s.id = 'sa-quiz-styles';
      s.textContent = [
        '#sa-quiz-overlay * { box-sizing: border-box; }',
        '.sa-choice {',
        '  flex: 1; position: relative; cursor: pointer; overflow: hidden;',
        '  border: 3px solid transparent; border-radius: 6px;',
        '  transition: border-color .18s, transform .18s; background: #f0ece8;',
        '}',
        '.sa-choice:hover { border-color: #fff; transform: scale(1.012); }',
        '.sa-choice.sa-chosen { border-color: ' + ORANGE + '; }',
        '.sa-choice img { width: 100%; height: 100%; object-fit: cover; display: block; }',
        '.sa-hover-mask {',
        '  position: absolute; inset: 0; background: rgba(0,0,0,0);',
        '  transition: background .2s; pointer-events: none;',
        '  display: flex; align-items: flex-end; padding: 18px;',
        '}',
        '.sa-choice:hover .sa-hover-mask { background: rgba(0,0,0,.28); }',
        '.sa-choice-cta {',
        '  color: #fff; font-size: .7rem; font-weight: 700;',
        '  letter-spacing: .12em; text-transform: uppercase;',
        '  opacity: 0; transition: opacity .2s;',
        '  text-shadow: 0 1px 4px rgba(0,0,0,.5);',
        '}',
        '.sa-choice:hover .sa-choice-cta { opacity: 1; }',
        '.sa-check {',
        '  position: absolute; top: 14px; right: 14px;',
        '  width: 30px; height: 30px; border-radius: 50%;',
        '  background: ' + ORANGE + '; display: flex; align-items: center; justify-content: center;',
        '  opacity: 0; transform: scale(.5); transition: opacity .18s, transform .18s;',
        '}',
        '.sa-choice.sa-chosen .sa-check { opacity: 1; transform: scale(1); }',
        '.sa-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin: 0 3px; transition: background .3s, transform .3s; }',
        '.sa-dot-past   { background: ' + DARK + '; }',
        '.sa-dot-now    { background: ' + ORANGE + '; transform: scale(1.5); }',
        '.sa-dot-future { background: #ddd; }',
        '.sa-text-choice { transition: border-color .15s, background .15s; }',
        '.sa-text-choice:hover { border-color: ' + DARK + '; background: #faf8f6; }',
        '.sa-text-choice.sa-chosen { border-color: ' + ORANGE + '; background: #fdf9f5; }',
        '.sa-text-choice.sa-chosen .sa-opt-badge { border-color: ' + ORANGE + '; background: ' + ORANGE + '; color: #fff; }',
        '@media (max-width: 640px) {',
        '  .sa-pairs { flex-direction: column !important; gap: 4px !important; }',
        '  .sa-choice { flex: none !important; height: 42vw !important; min-height: 180px; max-height: 280px; }',
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
        + '<p style="font-size:.7rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:' + RUST + ';margin:0 0 18px">Art Personality</p>'
        + '<h1 style="font-size:clamp(1.9rem,5vw,3rem);font-weight:700;line-height:1.1;letter-spacing:-.025em;color:' + DARK + ';margin:0 0 22px">' + esc(cfg.title || "What's Your Art Personality?") + '</h1>'
        + '<p style="font-size:1rem;color:#666;line-height:1.75;margin:0 0 10px">' + esc(cfg.subtitle || '') + '</p>'
        + (cfg.description ? '<p style="font-size:.85rem;color:#999;line-height:1.72;margin:0 0 40px;max-width:440px;margin-left:auto;margin-right:auto">' + esc(cfg.description) + '</p>' : '<div style="height:28px"></div>')
        + '<button id="sa-quiz-begin" style="display:inline-flex;align-items:center;gap:10px;padding:16px 44px;background:' + DARK + ';color:#fff;font-size:.82rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;border:none;cursor:pointer;border-radius:2px">'
        + esc(cfg.cta_text || 'Discover Your Art Personality')
        + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>'
        + '</button>'
        + '<p style="margin:16px 0 0;font-size:.72rem;color:#ccc;letter-spacing:.05em">' + ((cfg.questions && cfg.questions.length) || 10) + ' questions · 3 minutes</p>'
        + '</div>';
    }

    /* ── Render: image question ── */
    function renderImageQuestion(qi) {
      var q     = cfg.questions[qi];
      var total = cfg.questions.length;

      var html = '<div style="width:100%;max-width:1080px;margin:0 auto;padding:28px 18px 48px">';

      html += '<div style="text-align:center;margin-bottom:20px">'
        + dots(qi, total)
        + '<p style="font-size:.7rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#c4b9b2;margin:12px 0 0">Question ' + (qi + 1) + ' of ' + total + '</p>'
        + '</div>';

      if (q.label) {
        html += '<p style="text-align:center;font-size:clamp(.95rem,2.2vw,1.2rem);color:' + DARK + ';font-weight:500;margin:0 0 26px;line-height:1.4">' + esc(q.label) + '</p>';
      }

      html += '<div class="sa-pairs" style="display:flex;gap:6px;height:clamp(260px,46vh,600px)">';
      ['a', 'b'].forEach(function (side) {
        var opt = q['option_' + side] || {};
        html += '<div class="sa-choice" data-side="' + side + '">'
          + (opt.image
            ? '<img src="' + esc(opt.image) + '" alt="" loading="eager">'
            : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#ccc;font-size:.8rem">No image</div>')
          + '<div class="sa-hover-mask"><span class="sa-choice-cta">' + (side === 'a' ? 'Choose A' : 'Choose B') + '</span></div>'
          + '<div class="sa-check"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>'
          + '</div>';
      });
      html += '</div>';

      html += '<div style="text-align:center;margin-top:18px">'
        + '<button id="sa-quiz-back" style="background:none;border:none;cursor:pointer;font-size:.78rem;color:#c4b9b2;letter-spacing:.05em;padding:8px 16px">← Back</button>'
        + '</div></div>';

      return html;
    }

    /* ── Render: text question (4-option pills) ── */
    function renderTextQuestion(qi) {
      var q     = cfg.questions[qi];
      var total = cfg.questions.length;
      var sides = ['a', 'b', 'c', 'd'].filter(function (s) {
        return q['option_' + s] && q['option_' + s].label;
      });

      var html = '<div style="width:100%;max-width:600px;margin:0 auto;padding:28px 24px 48px">';

      html += '<div style="text-align:center;margin-bottom:28px">'
        + dots(qi, total)
        + '<p style="font-size:.7rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#c4b9b2;margin:12px 0 0">Question ' + (qi + 1) + ' of ' + total + '</p>'
        + '</div>';

      html += '<h2 style="text-align:center;font-size:clamp(1.05rem,2.8vw,1.45rem);font-weight:700;letter-spacing:-.02em;color:' + DARK + ';margin:0 0 30px;line-height:1.35">'
        + esc(q.label) + '</h2>';

      html += '<div style="display:flex;flex-direction:column;gap:10px">';
      sides.forEach(function (side) {
        var opt = q['option_' + side];
        html += '<button class="sa-text-choice" data-side="' + side + '" style="'
          + 'width:100%;text-align:left;padding:16px 20px;'
          + 'background:#fff;border:1.5px solid #e5ddd7;border-radius:8px;cursor:pointer;'
          + 'font-size:.93rem;color:' + DARK + ';line-height:1.45;'
          + 'display:flex;align-items:center;gap:14px'
          + '">'
          + '<span class="sa-opt-badge" style="'
          + 'flex-shrink:0;width:28px;height:28px;border-radius:50%;'
          + 'border:1.5px solid #d5cdc7;display:flex;align-items:center;justify-content:center;'
          + 'font-size:.68rem;font-weight:700;color:#aaa;letter-spacing:.04em;transition:all .15s'
          + '">' + side.toUpperCase() + '</span>'
          + '<span>' + esc(opt.label) + '</span>'
          + '</button>';
      });
      html += '</div>';

      html += '<div style="text-align:center;margin-top:20px">'
        + '<button id="sa-quiz-back" style="background:none;border:none;cursor:pointer;font-size:.78rem;color:#c4b9b2;letter-spacing:.05em;padding:8px 16px">← Back</button>'
        + '</div></div>';

      return html;
    }

    /* ── Question dispatcher ── */
    function renderQuestion(qi) {
      var q = cfg.questions[qi];
      return (q.type === 'text') ? renderTextQuestion(qi) : renderImageQuestion(qi);
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

    function handleOAuthSuccess(email, name, authSource) {
      var nameEl  = document.getElementById('sa-quiz-name');
      var emailEl = document.getElementById('sa-quiz-email');
      if (nameEl  && name)  nameEl.value  = name;
      if (emailEl && email) emailEl.value = email;
      var submitBtn = document.getElementById('sa-quiz-submit');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Calculating your result…';
        var result = computeResult();
        fetch(API_URL + '/api/quiz-lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, name: name || '', result_id: result && result.id, result_name: result && result.name, source: authSource })
        }).catch(function() {}).finally(function() { setBody(renderResult(result)); });
      }
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

      return '<div style="max-width:460px;margin:0 auto;padding:68px 24px;text-align:center">'
        + '<div style="width:56px;height:56px;border-radius:50%;background:' + ORANGE + ';margin:0 auto 22px;display:flex;align-items:center;justify-content:center">'
        + '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>'
        + '</div>'
        + '<p style="font-size:.7rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:' + RUST + ';margin:0 0 12px">Almost there</p>'
        + '<h2 style="font-size:clamp(1.5rem,4vw,2rem);font-weight:700;letter-spacing:-.02em;margin:0 0 12px;color:' + DARK + '">Where should we send your result?</h2>'
        + '<p style="font-size:.9rem;color:#888;line-height:1.65;margin:0 0 28px">Sign in or enter your email to reveal your art personality type.</p>'
        + googleBtn + fbBtn + divider
        + '<div style="text-align:left;margin-bottom:14px">'
        + '<label style="display:block;font-size:.74rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#777;margin-bottom:8px">Name</label>'
        + '<input id="sa-quiz-name" type="text" placeholder="Your name" autocomplete="name" style="width:100%;padding:13px 16px;border:1.5px solid #e5ddd7;border-radius:3px;font-size:.95rem;outline:none;color:' + DARK + '">'
        + '</div>'
        + '<div style="text-align:left;margin-bottom:28px">'
        + '<label style="display:block;font-size:.74rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#777;margin-bottom:8px">Email <span style="color:#c0392b">*</span></label>'
        + '<input id="sa-quiz-email" type="email" placeholder="you@example.com" autocomplete="email" style="width:100%;padding:13px 16px;border:1.5px solid #e5ddd7;border-radius:3px;font-size:.95rem;outline:none;color:' + DARK + '">'
        + '<p id="sa-quiz-email-err" style="display:none;color:#c0392b;font-size:.78rem;margin:6px 0 0">Please enter a valid email address.</p>'
        + '</div>'
        + '<button id="sa-quiz-submit" style="width:100%;padding:16px;background:' + DARK + ';color:#fff;font-size:.82rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;border:none;cursor:pointer;border-radius:2px;display:flex;align-items:center;justify-content:center;gap:10px">'
        + 'Reveal my personality'
        + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>'
        + '</button>'
        + '<p style="margin:16px 0 0;font-size:.7rem;color:#bbb">By continuing you agree to receive marketing emails. Unsubscribe anytime.</p>'
        + '</div>';
    }

    /* ── Render: result ── */
    function renderResult(personality) {
      if (!personality) {
        return '<div style="max-width:540px;margin:0 auto;padding:68px 24px;text-align:center">'
          + '<h2 style="font-size:1.8rem;font-weight:700;color:' + DARK + ';margin:0 0 16px">Quiz complete!</h2>'
          + '<p style="color:#888">Thanks for taking the test.</p>'
          + '<button id="sa-quiz-close-result" style="margin-top:32px;padding:14px 36px;background:' + DARK + ';color:#fff;border:none;cursor:pointer;font-size:.82rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-radius:2px">Continue browsing</button>'
          + '</div>';
      }

      var artworks = (personality.recommendations || []).filter(function (r) { return r.image; });
      var actions  = (personality.recommendations || []).filter(function (r) { return !r.image; });

      var html = '<div style="max-width:640px;margin:0 auto;padding:48px 24px 72px">';

      html += '<p style="font-size:.7rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:' + RUST + ';text-align:center;margin:0 0 14px">Your Art Personality</p>';
      html += '<h2 style="font-size:clamp(2rem,5vw,2.8rem);font-weight:700;letter-spacing:-.025em;text-align:center;margin:0 0 24px;color:' + DARK + '">' + esc(personality.name) + '</h2>';

      if (personality.description) {
        html += '<p style="font-size:1rem;line-height:1.8;color:#666;text-align:center;margin:0 0 40px">' + esc(personality.description) + '</p>';
      }

      if (artworks.length) {
        html += '<div style="margin-bottom:16px">'
          + '<p style="font-size:.68rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#bbb;text-align:center;margin:0 0 14px">Art you might love</p>'
          + '<div style="display:grid;grid-template-columns:' + (artworks.length >= 2 ? '1fr 1fr' : '1fr') + ';gap:10px;margin-bottom:16px">';
        artworks.forEach(function (r) {
          html += '<a href="' + esc(r.url) + '" style="display:block;text-decoration:none;border-radius:4px;overflow:hidden;background:#f0ece8">'
            + '<div style="aspect-ratio:4/3;overflow:hidden">'
            + '<img src="' + esc(r.image) + '" alt="' + esc(r.title) + '" style="width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s" loading="lazy" onmouseover="this.style.transform=\'scale(1.04)\'" onmouseout="this.style.transform=\'\'">'
            + '</div>'
            + '<p style="margin:0;padding:10px 12px;font-size:.8rem;font-weight:600;color:' + DARK + '">' + esc(r.title) + '</p>'
            + '</a>';
        });
        html += '</div>';
      }

      if (actions.length) {
        html += '<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-bottom:12px">';
        actions.forEach(function (r) {
          html += '<a href="' + esc(r.url) + '" style="display:inline-flex;align-items:center;gap:6px;padding:11px 22px;background:' + DARK + ';color:#fff;font-size:.78rem;font-weight:700;text-decoration:none;border-radius:2px;letter-spacing:.06em;text-transform:uppercase">' + esc(r.title) + '</a>';
        });
        html += '</div>';
      }

      if (artworks.length) html += '</div>';

      html += '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:32px">'
        + '<button id="sa-quiz-retake" style="padding:13px 28px;background:none;border:1.5px solid ' + DARK + ';color:' + DARK + ';font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;border-radius:2px">Retake quiz</button>'
        + '<button id="sa-quiz-close-result" style="padding:13px 28px;background:' + DARK + ';color:#fff;font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border:none;cursor:pointer;border-radius:2px">Continue browsing</button>'
        + '</div>';

      html += '</div>';
      return html;
    }

    /* ── Overlay shell (sticky header + scrollable body) ── */
    function overlayShell(content) {
      return '<div style="min-height:100%;display:flex;flex-direction:column">'
        + '<div style="position:sticky;top:0;z-index:1;background:rgba(255,255,255,.96);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid #f0e8e0;padding:14px 22px;display:flex;align-items:center;justify-content:space-between">'
        + '<span style="font-size:.65rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#c4b9b2">SA Art Fair · Art Personality Quiz</span>'
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

    /* ── Event binding (called after every render) ── */
    function bindOverlayEvents() {
      var closeBtn = document.getElementById('sa-quiz-close');
      if (closeBtn) closeBtn.onclick = hideOverlay;

      var beginBtn = document.getElementById('sa-quiz-begin');
      if (beginBtn) beginBtn.onclick = function () { step = 0; setBody(renderQuestion(0)); };

      var backBtn = document.getElementById('sa-quiz-back');
      if (backBtn) {
        backBtn.onclick = function () {
          if (step > 0) {
            step--;
            answers = answers.filter(function (a) { return a.question_index < step; });
            setBody(renderQuestion(step));
          } else {
            setBody(renderIntro());
          }
        };
      }

      document.querySelectorAll('.sa-choice').forEach(function (el) {
        el.onclick = function () {
          var side = el.dataset.side;
          document.querySelectorAll('.sa-choice').forEach(function (c) { c.classList.remove('sa-chosen'); });
          el.classList.add('sa-chosen');
          answers = answers.filter(function (a) { return a.question_index !== step; });
          answers.push({ question_index: step, side: side });
          setTimeout(function () {
            step++;
            setBody(step < cfg.questions.length ? renderQuestion(step) : renderEmailCapture());
          }, 220);
        };
      });

      document.querySelectorAll('.sa-text-choice').forEach(function (el) {
        el.onclick = function () {
          var side = el.dataset.side;
          document.querySelectorAll('.sa-text-choice').forEach(function (c) { c.classList.remove('sa-chosen'); });
          el.classList.add('sa-chosen');
          answers = answers.filter(function (a) { return a.question_index !== step; });
          answers.push({ question_index: step, side: side });
          setTimeout(function () {
            step++;
            setBody(step < cfg.questions.length ? renderQuestion(step) : renderEmailCapture());
          }, 180);
        };
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
          submitBtn.innerHTML = 'Calculating your result…';
          var result = computeResult();
          fetch(API_URL + '/api/quiz-lead', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, name: name, result_id: result && result.id, result_name: result && result.name, source: 'email' })
          }).catch(function () {}).finally(function () { setBody(renderResult(result)); });
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
