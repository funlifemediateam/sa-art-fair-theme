(function () {
  'use strict';

  var cfg = window.__safNewsletter || {};
  var API       = cfg.apiUrl || 'https://sa-art-fair-admin.vercel.app';
  var DELAY     = typeof cfg.delayMs === 'number' ? cfg.delayMs : 12000;
  var CODE      = (cfg.code || '').trim();
  var OFFER     = (cfg.offer || '10% off your first order').trim();
  var HEADING   = (cfg.heading || 'Get 10% off your first order').trim();
  var BODY      = (cfg.body || 'Join our list for first access to new artists, exhibitions and exclusive works.').trim();
  var SHOP      = cfg.shop || 'SA Art Fair';

  var SHOWN_KEY = 'saf_newsletter_shown';   // once per visitor
  var LEAD_KEY  = 'sa_lead_popup_dismissed'; // set by lead-popup.js when it is dealt with

  var opened = false;

  function ls(k)      { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }

  /* Cart / checkout / active-booking pages are off-limits. */
  function onExcludedPage() {
    var p = (window.location.pathname || '').toLowerCase();
    if (p.indexOf('/cart') === 0 || p.indexOf('/checkout') !== -1 || p.indexOf('/challenge') !== -1) return true;
    if (document.body.classList.contains('template-cart')) return true;
    if (document.querySelector('[data-api]')) return true;             // booking widget on page
    var bc = document.getElementById('sa-bk-banner-container');
    if (bc && bc.children.length) return true;                         // active hold-timer banner
    if (ls('sa_bk_timers')) return true;                               // hold in progress
    return false;
  }

  /* Never compete with the quiz lead popup. */
  function leadPopupBlocking() {
    if (document.getElementById('sa-lead-popup') ||
        document.getElementById('sa-lead-popup-overlay') ||
        document.getElementById('sa-quiz-overlay')) return true;       // on screen right now
    // Still eligible this session (never dismissed) → it fires early, let it go first.
    if (!ls(LEAD_KEY)) return true;
    return false;
  }

  function eligible() {
    if (opened) return false;
    if (ls(SHOWN_KEY)) return false;
    if (onExcludedPage()) return false;
    if (leadPopupBlocking()) return false;
    return true;
  }

  var overlay, modal;

  function remove() {
    if (modal)   { modal.style.opacity = '0'; modal.style.transform = 'translate(-50%, calc(-50% + 10px))'; }
    if (overlay) { overlay.style.opacity = '0'; }
    setTimeout(function () {
      if (modal && modal.parentNode)     modal.parentNode.removeChild(modal);
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey);
    }, 240);
  }

  function dismiss() { remove(); }

  function onKey(e) { if (e.key === 'Escape') dismiss(); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function submit(email) {
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
    var codeBlock = CODE
      ? '<div class="saf-nl__code" role="group" aria-label="Your discount code">'
        + '<span class="saf-nl__code-value" id="saf-nl-code">' + esc(CODE) + '</span>'
        + '<button type="button" class="saf-nl__copy" id="saf-nl-copy">Copy</button>'
        + '</div>'
        + '<p class="saf-nl__fine">Use it at checkout. ' + esc(OFFER) + '.</p>'
      : '<p class="saf-nl__fine">You’re on the list. We’ll be in touch.</p>';

    body.innerHTML =
      '<div class="saf-nl__success">'
      + '<div class="saf-nl__check" aria-hidden="true">'
      + '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
      + '</div>'
      + '<h3 class="saf-nl__heading">You’re in.</h3>'
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
    lsSet(SHOWN_KEY, String(Date.now()));  // once per visitor, whatever they do next

    overlay = document.createElement('div');
    overlay.className = 'saf-nl-overlay';
    overlay.addEventListener('click', dismiss);
    document.body.appendChild(overlay);

    modal = document.createElement('div');
    modal.className = 'saf-nl';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', HEADING);
    modal.innerHTML =
      '<button type="button" class="saf-nl__close" id="saf-nl-close" aria-label="Close">'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      + '</button>'
      + '<div id="saf-nl-body">'
      + '<p class="saf-nl__eyebrow">' + esc(SHOP) + '</p>'
      + '<div class="saf-nl__offer">' + esc(OFFER) + '</div>'
      + '<h3 class="saf-nl__heading">' + esc(HEADING) + '</h3>'
      + '<p class="saf-nl__text">' + esc(BODY) + '</p>'
      + '<form class="saf-nl__form" id="saf-nl-form" novalidate>'
      + '<input type="email" id="saf-nl-email" class="saf-nl__input" placeholder="your@email.com" autocomplete="email" required>'
      + '<button type="submit" class="saf-nl__submit">Get my code</button>'
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

  /* Only arm the timer if we're eligible now, so we never appear right as the
     lead popup is doing its thing. Eligibility is re-checked at fire time too. */
  if (eligible()) {
    setTimeout(tryShow, DELAY);
  }
})();
