(function () {

  /* ── Hero: size to exactly fill visible viewport below header ── */
  function fitHero() {
    var banner = document.querySelector('.banner--large:not(.banner--adapt)');
    if (!banner) return;
    /* Measure the sticky header height — NOT banner.top, which is scroll-relative and
       goes negative when scrolled, causing the hero to render impossibly tall on resize. */
    var header = document.querySelector('sticky-header') || document.querySelector('.header-wrapper');
    var headerH = header ? header.getBoundingClientRect().height : 0;
    var h = window.innerHeight - headerH;
    if (h > 0) banner.style.setProperty('--hero-fit-height', h + 'px');
  }

  /* ── Announcement bar: one pill at a time, slides to next ── */
  function initPillSlider() {
    var bar = document.querySelector('.announcement-pills-bar');
    if (!bar) return;
    var slider = bar.querySelector('.announcement-pills-slider');
    if (!slider) return;

    var slides = slider.querySelectorAll('.announcement-pill-slide');
    if (slides.length <= 1) return;

    /* Append clone of first slide so the loop back is seamless */
    var clone = slides[0].cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    slider.appendChild(clone);

    var count = slides.length; /* original count, not counting the clone */
    var current = 0;

    function slideTo(index, animate) {
      slider.style.transition = animate === false
        ? 'none'
        : 'transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)';
      slider.style.transform = 'translateX(-' + (index * 100) + '%)';
    }

    /* After sliding to the clone, silently jump back to real first slide */
    slider.addEventListener('transitionend', function () {
      if (current >= count) {
        current = 0;
        slideTo(current, false);
      }
    });

    setInterval(function () {
      current++;
      slideTo(current, true);
    }, 3000);
  }

  /* ── Booking: per-product cart timer banners ── */
  function initBookingTimers() {
    /* Show expired toast if we just reloaded after a timer expiry */
    if (sessionStorage.getItem('sa_bk_expired')) {
      sessionStorage.removeItem('sa_bk_expired');
      showExpiredToast();
    }

    /* Migrate legacy single-key timer to per-product object */
    var legacy = localStorage.getItem('sa_bk_timer');
    if (legacy) {
      try {
        var d = JSON.parse(legacy);
        if (d && d.end) {
          var existing = {};
          try { existing = JSON.parse(localStorage.getItem('sa_bk_timers') || '{}'); } catch (e) {}
          var lk = d.cartKey || d.title || 'legacy';
          if (!existing[lk]) existing[lk] = d;
          localStorage.setItem('sa_bk_timers', JSON.stringify(existing));
        }
      } catch (e) {}
      localStorage.removeItem('sa_bk_timer');
    }

    var timersObj = {};
    try { timersObj = JSON.parse(localStorage.getItem('sa_bk_timers') || '{}'); } catch (e) {}

    /* Always fetch cart — needed both for timer verification and orphan detection */
    fetch('/cart.js')
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        var cartKeySet = {};
        cart.items.forEach(function (item) { cartKeySet[item.key] = true; });

        var toRemove  = {};   /* cart keys scheduled for removal */
        var productIds = Object.keys(timersObj);

        /* 1. Process existing timers */
        productIds.forEach(function (pid) {
          var data = timersObj[pid];
          var rem  = (data.end || 0) - Date.now();

          var timerKeys = [];
          if (data.cartKeys && Array.isArray(data.cartKeys)) {
            data.cartKeys.forEach(function (k) { if (k && k.key) timerKeys.push(k.key); });
          } else if (data.cartKey) { timerKeys.push(data.cartKey); }

          var stillInCart = timerKeys.length === 0 || timerKeys.some(function (k) { return cartKeySet[k]; });

          if (rem <= 0 || !stillInCart) {
            if (rem <= 0) timerKeys.forEach(function (k) { toRemove[k] = true; });
            delete timersObj[pid];
          } else {
            showTimerBanner(pid, data, data.end);
          }
        });

        /* Persist cleaned timer state */
        if (Object.keys(timersObj).length) {
          localStorage.setItem('sa_bk_timers', JSON.stringify(timersObj));
        } else {
          localStorage.removeItem('sa_bk_timers');
        }

        /* 2. Build set of cart keys still covered by active timers */
        var coveredKeys = {};
        Object.keys(timersObj).forEach(function (pid) {
          var d = timersObj[pid];
          if (d.cartKeys && Array.isArray(d.cartKeys)) {
            d.cartKeys.forEach(function (k) { if (k && k.key) coveredKeys[k.key] = true; });
          } else if (d.cartKey) { coveredKeys[d.cartKey] = true; }
        });

        /* 3. Orphan detection: booking items in cart with no active timer */
        cart.items.forEach(function (item) {
          var props = item.properties || {};
          var isBooking = props['Booking Type'] || props['Booking Date'] || props['Booking Group'];
          if (isBooking && !coveredKeys[item.key] && !toRemove[item.key]) {
            toRemove[item.key] = true;
          }
        });

        var removeKeys = Object.keys(toRemove);
        if (!removeKeys.length) return;

        sessionStorage.setItem('sa_bk_expired', '1');
        Promise.all(removeKeys.map(function (k) {
          return fetch('/cart/change.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: k, quantity: 0 })
          }).catch(function () {});
        }))
          .then(function () { window.location.reload(); })
          .catch(function () { window.location.reload(); });
      })
      .catch(function () {
        /* Cart check failed — at least show banners for active timers */
        Object.keys(timersObj).forEach(function (pid) {
          var data = timersObj[pid];
          if ((data.end || 0) > Date.now()) showTimerBanner(pid, data, data.end);
        });
      });
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function fmtMs(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ':' + pad(s % 60);
  }

  function getOrCreateBannerContainer() {
    var c = document.getElementById('sa-bk-banner-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'sa-bk-banner-container';
      document.body.appendChild(c);
    }
    return c;
  }

  function showTimerBanner(productId, data, endTime) {
    var bannerId = 'sa-bk-banner-' + productId;
    if (document.getElementById(bannerId)) return;

    var container = getOrCreateBannerContainer();
    var banner    = document.createElement('div');
    banner.id        = bannerId;
    banner.className = 'sa-bk-banner';
    banner.innerHTML = [
      '<div class="bk-banner-inner">',
        '<div class="bk-banner-left">',
          '<span class="bk-banner-timer"></span>',
          '<span class="bk-banner-text">',
            '<strong>' + (data.title || 'Booking') + '</strong>' + (data.session ? ' &mdash; ' + data.session : '') + '<br>',
            'Your spot is reserved — checkout before the timer runs out.',
          '</span>',
        '</div>',
        '<div class="bk-banner-actions">',
          '<a href="/checkout" class="bk-banner-checkout">Checkout now &rarr;</a>',
          '<button class="bk-banner-dismiss" aria-label="Dismiss">&times;</button>',
        '</div>',
      '</div>'
    ].join('');

    container.appendChild(banner);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { banner.classList.add('bk-banner-in'); });
    });

    var timerEl = banner.querySelector('.bk-banner-timer');

    function tick() {
      var rem = endTime - Date.now();
      if (rem <= 0) {
        clearInterval(iv);
        /* Clear timer from localStorage before async work to prevent re-running on reload */
        var timers = {};
        try { timers = JSON.parse(localStorage.getItem('sa_bk_timers') || '{}'); } catch (e) {}
        delete timers[productId];
        if (Object.keys(timers).length) localStorage.setItem('sa_bk_timers', JSON.stringify(timers));
        else localStorage.removeItem('sa_bk_timers');
        banner.remove();
        sessionStorage.setItem('sa_bk_expired', '1');
        removeHeldCartItems(data)
          .then(function () { window.location.reload(); })
          .catch(function () { window.location.reload(); });
      } else {
        if (timerEl) {
          timerEl.textContent = fmtMs(rem);
          timerEl.style.color = rem < 120000 ? '#e05c5c' : '';
        }
      }
    }

    tick();
    var iv = setInterval(tick, 1000);

    /* Dismiss hides the banner but keeps the interval alive so expiry still fires */
    banner.querySelector('.bk-banner-dismiss').addEventListener('click', function () {
      banner.remove();
    });
  }

  function removeHeldCartItems(data) {
    var keys = [];
    if (data.cartKeys && Array.isArray(data.cartKeys)) {
      data.cartKeys.forEach(function(k) { if (k && k.key) keys.push(k.key); });
    } else if (data.cartKey) {
      keys.push(data.cartKey);
    }
    if (!keys.length) return Promise.resolve();
    return Promise.all(keys.map(function(k) {
      return fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: k, quantity: 0 })
      }).catch(function() {});
    }));
  }

  function showExpiredToast() {
    var toast = document.createElement('div');
    toast.id = 'sa-bk-expired';
    toast.innerHTML = 'Your booking reservation expired. <a href="/collections/workshops-classes">Book again &rarr;</a>';
    document.body.appendChild(toast);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { toast.classList.add('bk-show'); });
    });
    setTimeout(function () {
      toast.style.opacity = '0';
      setTimeout(function () { toast.remove(); }, 400);
    }, 7000);
  }

  function initCartRemoveFallback() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('cart-remove-button');
      if (!btn) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      var index = parseInt(btn.dataset.index, 10);
      if (isNaN(index) || index < 1) return;
      var row = btn.closest('.cart-item');
      if (row) { row.style.opacity = '0.4'; row.style.pointerEvents = 'none'; }
      fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line: index, quantity: 0 })
      })
        .then(function () { window.location.reload(); })
        .catch(function () {
          if (row) { row.style.opacity = ''; row.style.pointerEvents = ''; }
        });
    }, true);
  }

  function init() {
    /* Double rAF ensures sticky header has painted and fonts are applied before measuring */
    requestAnimationFrame(function () { requestAnimationFrame(fitHero); });
    initPillSlider();
    initBookingTimers();
    initCartRemoveFallback();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Re-measure after full load (web fonts / images can shift header height) */
  window.addEventListener('load', fitHero);
  window.addEventListener('resize', fitHero);
})();
