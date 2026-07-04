(function () {
  'use strict';

  function init() {
  var startBtn = document.getElementById('sa-quiz-start-btn');
  var overlay  = document.getElementById('sa-quiz-overlay');
  if (!startBtn || !overlay) return;

  var API_URL = window.__saQuizApiUrl || 'https://sa-art-fair-admin.vercel.app';

  var cfg       = null;
  var answers   = [];  // { question_index, side: 'a'|'b' }
  var step      = 0;   // current question index
  var phase     = 'loading'; // loading | intro | quiz | email | result

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

  /* ── Render helpers ── */

  function renderIntro() {
    var desc = cfg.description || '';
    return '<div style="max-width:640px;margin:0 auto;padding:40px 24px;text-align:center">'
      + '<p style="font-size:0.72rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#c9873a;margin:0 0 12px">Art Personality</p>'
      + '<h1 style="font-size:clamp(1.8rem,5vw,2.8rem);font-weight:700;line-height:1.15;margin:0 0 20px;color:#1a1a1a">' + esc(cfg.title || "What's Your Art Personality?") + '</h1>'
      + (cfg.subtitle ? '<p style="font-size:1.05rem;color:#555;line-height:1.65;margin:0 0 16px">' + esc(cfg.subtitle) + '</p>' : '')
      + (desc         ? '<p style="font-size:0.9rem;color:#777;line-height:1.7;margin:0 0 36px">'  + esc(desc)        + '</p>' : '<div style="height:20px"></div>')
      + '<button id="sa-quiz-begin" style="display:inline-flex;align-items:center;justify-content:center;padding:16px 40px;background:#2e1a28;color:#fff;font-size:0.85rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;border:none;cursor:pointer;border-radius:2px">'
      + esc(cfg.cta_text || 'Discover Your Art Personality') + '</button>'
      + '</div>';
  }

  function renderQuestion(qi) {
    var q   = cfg.questions[qi];
    var total = cfg.questions.length;
    var pct   = Math.round(((qi) / total) * 100);

    var html = '<div style="max-width:900px;margin:0 auto;padding:32px 24px">';

    /* Progress */
    html += '<div style="display:flex;align-items:center;gap:16px;margin-bottom:32px">'
      + '<button id="sa-quiz-back" style="background:none;border:none;cursor:pointer;padding:6px;color:#888;display:flex;align-items:center;gap:6px;font-size:0.82rem">'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>Back</button>'
      + '<div style="flex:1;height:4px;background:#eee;border-radius:2px;overflow:hidden">'
      + '<div style="height:100%;width:' + pct + '%;background:#2e1a28;border-radius:2px;transition:width 0.3s ease"></div>'
      + '</div>'
      + '<span style="font-size:0.78rem;color:#888;white-space:nowrap">' + (qi + 1) + ' / ' + total + '</span>'
      + '</div>';

    if (q.label) {
      html += '<p style="text-align:center;font-size:1rem;color:#555;margin:0 0 28px">' + esc(q.label) + '</p>';
    }

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">';
    ['a', 'b'].forEach(function (side) {
      var opt = q['option_' + side] || {};
      html += '<button class="sa-quiz-choice" data-side="' + side + '" style="background:none;border:2px solid transparent;border-radius:6px;padding:0;cursor:pointer;overflow:hidden;transition:border-color 0.15s,transform 0.15s;text-align:left">'
        + '<div style="aspect-ratio:4/3;overflow:hidden;background:#f0ece8">'
        + (opt.image
          ? '<img src="' + esc(opt.image) + '" alt="' + esc(opt.label || '') + '" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none">'
          : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:0.8rem">No image</div>')
        + '</div>'
        + (opt.label ? '<p style="margin:0;padding:10px 14px;font-size:0.82rem;color:#444;font-weight:500">' + esc(opt.label) + '</p>' : '')
        + '</button>';
    });
    html += '</div></div>';
    return html;
  }

  function renderEmailCapture() {
    return '<div style="max-width:520px;margin:0 auto;padding:60px 24px;text-align:center">'
      + '<p style="font-size:0.72rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#c9873a;margin:0 0 12px">Almost done</p>'
      + '<h2 style="font-size:clamp(1.5rem,4vw,2rem);font-weight:700;margin:0 0 14px;color:#1a1a1a">Where should we send your result?</h2>'
      + '<p style="font-size:0.9rem;color:#777;line-height:1.65;margin:0 0 32px">Enter your name and email to reveal your art personality type.</p>'
      + '<div style="text-align:left;margin-bottom:14px"><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:6px">Name</label>'
      + '<input id="sa-quiz-name" type="text" placeholder="Your name" style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #ddd;border-radius:4px;font-size:0.95rem;outline:none"></div>'
      + '<div style="text-align:left;margin-bottom:28px"><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:6px">Email <span style="color:#c0392b">*</span></label>'
      + '<input id="sa-quiz-email" type="email" placeholder="you@example.com" style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #ddd;border-radius:4px;font-size:0.95rem;outline:none">'
      + '<p id="sa-quiz-email-err" style="display:none;color:#c0392b;font-size:0.78rem;margin:6px 0 0">Please enter a valid email address.</p>'
      + '</div>'
      + '<button id="sa-quiz-submit" style="display:inline-flex;align-items:center;justify-content:center;padding:16px 40px;background:#2e1a28;color:#fff;font-size:0.85rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;border:none;cursor:pointer;border-radius:2px;width:100%">Reveal my personality</button>'
      + '</div>';
  }

  function renderResult(personality) {
    if (!personality) {
      return '<div style="max-width:640px;margin:0 auto;padding:60px 24px;text-align:center">'
        + '<h2 style="font-size:1.8rem;font-weight:700;color:#1a1a1a;margin:0 0 16px">Quiz complete!</h2>'
        + '<p style="color:#777">Thanks for taking the test.</p>'
        + '<button id="sa-quiz-close-result" style="margin-top:28px;padding:14px 32px;background:#2e1a28;color:#fff;border:none;cursor:pointer;font-size:0.85rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;border-radius:2px">Close</button>'
        + '</div>';
    }

    var html = '<div style="max-width:740px;margin:0 auto;padding:48px 24px">';

    html += '<p style="font-size:0.72rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#c9873a;text-align:center;margin:0 0 10px">Your Art Personality</p>';
    html += '<h2 style="font-size:clamp(1.8rem,5vw,2.6rem);font-weight:700;text-align:center;margin:0 0 20px;color:#2e1a28">' + esc(personality.name) + '</h2>';

    if (personality.image) {
      html += '<div style="margin:0 auto 28px;max-width:480px;border-radius:8px;overflow:hidden">'
        + '<img src="' + esc(personality.image) + '" alt="' + esc(personality.name) + '" style="width:100%;display:block;object-fit:cover">'
        + '</div>';
    }

    if (personality.description) {
      html += '<p style="font-size:1.05rem;line-height:1.75;color:#555;text-align:center;max-width:560px;margin:0 auto 36px">' + esc(personality.description) + '</p>';
    }

    if (personality.recommendations && personality.recommendations.length) {
      html += '<div style="background:#f6f3ef;border-radius:10px;padding:28px 32px;margin-bottom:32px">'
        + '<p style="font-size:0.78rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#888;margin:0 0 16px">Art you might love</p>'
        + '<div style="display:flex;flex-wrap:wrap;gap:10px">';
      personality.recommendations.forEach(function (r) {
        html += '<a href="' + esc(r.url) + '" style="display:inline-flex;align-items:center;padding:10px 18px;background:#2e1a28;color:#fff;font-size:0.82rem;font-weight:600;text-decoration:none;border-radius:3px">'
          + esc(r.title) + '</a>';
      });
      html += '</div></div>';
    }

    html += '<div style="text-align:center;display:flex;gap:12px;justify-content:center;flex-wrap:wrap">'
      + '<button id="sa-quiz-retake" style="padding:13px 28px;background:none;border:1.5px solid #2e1a28;color:#2e1a28;font-size:0.82rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer;border-radius:2px">Retake quiz</button>'
      + '<button id="sa-quiz-close-result" style="padding:13px 28px;background:#2e1a28;color:#fff;font-size:0.82rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;border:none;cursor:pointer;border-radius:2px">Continue browsing</button>'
      + '</div>';

    html += '</div>';
    return html;
  }

  /* ── Overlay render + bind ── */

  function showOverlay(content) {
    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
    overlay.innerHTML = '<div style="min-height:100vh;display:flex;flex-direction:column">'
      + '<div style="position:sticky;top:0;z-index:1;background:#fff;border-bottom:1px solid #eee;padding:14px 24px;display:flex;align-items:center;justify-content:space-between">'
      + '<span style="font-size:0.78rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#888">Art Personality Quiz</span>'
      + '<button id="sa-quiz-close" style="background:none;border:none;cursor:pointer;padding:6px;color:#888;display:flex;align-items:center">'
      + '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      + '</button></div>'
      + '<div id="sa-quiz-body" style="flex:1;display:flex;align-items:center">' + content + '</div>'
      + '</div>';
    bindOverlayEvents();
  }

  function hideOverlay() {
    overlay.style.display = 'none';
    document.body.style.overflow = '';
    answers = [];
    step    = 0;
    phase   = 'intro';
  }

  function setBody(content) {
    var body = document.getElementById('sa-quiz-body');
    if (body) { body.innerHTML = content; bindOverlayEvents(); }
  }

  function bindOverlayEvents() {
    var closeBtn = document.getElementById('sa-quiz-close');
    if (closeBtn) closeBtn.onclick = hideOverlay;

    /* Intro begin */
    var beginBtn = document.getElementById('sa-quiz-begin');
    if (beginBtn) {
      beginBtn.onclick = function () {
        step  = 0;
        phase = 'quiz';
        setBody(renderQuestion(step));
      };
    }

    /* Back button */
    var backBtn = document.getElementById('sa-quiz-back');
    if (backBtn) {
      backBtn.onclick = function () {
        if (step > 0) {
          step--;
          answers = answers.filter(function (a) { return a.question_index < step; });
          setBody(renderQuestion(step));
        } else {
          phase = 'intro';
          setBody(renderIntro());
        }
      };
    }

    /* Image choice */
    document.querySelectorAll('.sa-quiz-choice').forEach(function (btn) {
      btn.onmouseenter = function () { btn.style.borderColor = '#2e1a28'; btn.style.transform = 'scale(1.02)'; };
      btn.onmouseleave = function () { btn.style.borderColor = 'transparent'; btn.style.transform = ''; };
      btn.onclick = function () {
        var side = btn.dataset.side;
        answers = answers.filter(function (a) { return a.question_index !== step; });
        answers.push({ question_index: step, side: side });

        /* Flash selected */
        btn.style.borderColor = '#2e1a28';
        setTimeout(function () {
          step++;
          if (step < cfg.questions.length) {
            setBody(renderQuestion(step));
          } else {
            phase = 'email';
            setBody(renderEmailCapture());
          }
        }, 180);
      };
    });

    /* Email submit */
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

        submitBtn.disabled    = true;
        submitBtn.textContent = 'Loading…';

        var result = computeResult();

        fetch(API_URL + '/api/quiz-lead', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email: email, name: name, result_id: result && result.id, result_name: result && result.name })
        }).catch(function () {}).finally(function () {
          phase = 'result';
          setBody(renderResult(result));
        });
      };
    }

    /* Result actions */
    var retakeBtn = document.getElementById('sa-quiz-retake');
    if (retakeBtn) {
      retakeBtn.onclick = function () {
        answers = [];
        step    = 0;
        phase   = 'intro';
        setBody(renderIntro());
      };
    }

    var closeResult = document.getElementById('sa-quiz-close-result');
    if (closeResult) closeResult.onclick = hideOverlay;
  }

  /* ── Bootstrap ── */
  startBtn.addEventListener('click', function () {
    if (cfg) {
      phase = 'intro';
      showOverlay(renderIntro());
      return;
    }
    /* First open — fetch config */
    startBtn.disabled    = true;
    startBtn.textContent = 'Loading…';
    fetchConfig()
      .then(function (data) {
        cfg               = data;
        startBtn.disabled = false;
        /* Restore button text from section heading or default */
        var heading = document.getElementById('sa-quiz-heading');
        startBtn.textContent = (heading && heading.dataset.cta) || startBtn.dataset.originalText || 'Take the Test';
        phase = 'intro';
        showOverlay(renderIntro());
      })
      .catch(function () {
        startBtn.disabled    = false;
        startBtn.textContent = 'Take the Test';
        alert('Could not load quiz. Please try again shortly.');
      });
  });

  /* Preserve original button text */
  startBtn.dataset.originalText = startBtn.textContent;

  /* Close on overlay background click */
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) hideOverlay();
  });

  /* Close on Escape */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.style.display !== 'none') hideOverlay();
  });

  } // end init()

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
