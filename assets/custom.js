(function () {

  /* ── Hero: size to exactly fill visible viewport below header ── */
  function fitHero() {
    /* Refresh --header-height first: StickyHeader measures it at connectedCallback,
       before async CSS loads, which can capture a wildly wrong value (e.g. the
       unstyled inline search). The homepage negative-margin overlay depends on it. */
    var headerSection = document.querySelector('.section-header');
    if (headerSection) {
      document.documentElement.style.setProperty('--header-height', headerSection.offsetHeight + 'px');
    }
    var banner = document.querySelector('.banner--large:not(.banner--adapt)');
    if (!banner) return;
    var h;
    if (document.body.classList.contains('template-index')) {
      /* Homepage: header overlays the hero (pulled up via negative margin), so the
         hero only needs to clear the announcement bar above it. */
      var annBar = document.querySelector('.announcement-bar-section');
      var annH = annBar ? annBar.getBoundingClientRect().height : 0;
      h = window.innerHeight - annH;
    } else {
      /* Measure the sticky header height — NOT banner.top, which is scroll-relative and
         goes negative when scrolled, causing the hero to render impossibly tall on resize. */
      var header = document.querySelector('sticky-header') || document.querySelector('.header-wrapper');
      var headerH = header ? header.getBoundingClientRect().height : 0;
      h = window.innerHeight - headerH;
    }
    if (h > 0) banner.style.setProperty('--hero-fit-height', h + 'px');
  }

  /* ── Homepage: transparent header over hero until scrolled ── */
  function initTransparentHeader() {
    var wrapper = document.querySelector('.header-wrapper--transparent');
    if (!wrapper) return;
    var section = document.querySelector('.section-header');
    if (!section) return;
    var ticking = false;
    var badgesHidden = false;
    function update() {
      ticking = false;
      var atTop = window.scrollY < 40;
      section.classList.toggle('header-at-top', atTop);
      /* While the header is transparent at page top, fade any card badge that
         falls inside the header strip — z-index can't hide what's visible
         *through* a transparent header. */
      if (atTop || badgesHidden) {
        var headerBottom = section.getBoundingClientRect().bottom;
        badgesHidden = false;
        document
          .querySelectorAll('.saf-dummy-badge, .saf-sold-badge, .saf-timing-badge')
          .forEach(function (badge) {
            var hide = atTop && badge.getBoundingClientRect().top < headerBottom;
            if (hide) badgesHidden = true;
            badge.classList.toggle('saf-badge--under-header', hide);
          });
      }
    }
    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
    update();
  }

  /* ── Desktop: open header icon dropdowns on hover ── */
  /* Path labels navigate to their landing page. Without this the browser also
     runs the summary's toggle, flashing the mega panel open as the page
     unloads. Modifier/middle clicks fall through so open-in-new-tab still
     works. */
  function initPathLabelLinks() {
    document.querySelectorAll('.saf-pnav__label').forEach(function (link) {
      link.addEventListener('click', function (event) {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        window.location.href = link.href;
      });
    });
  }

  function initHeaderHoverMenus() {
    if (!window.matchMedia('(hover: hover) and (min-width: 990px)').matches) return;
    /* Path mega menus hover-open too: the label now navigates, so the panel
       needs a way to appear that is not a click. mouseleave only fires once
       the pointer leaves all descendants, so the absolutely-positioned panel
       counts as inside. */
    document.querySelectorAll('.header__icon-menu, .saf-pnav header-menu').forEach(function (menu) {
      var details = menu.querySelector('details');
      if (!details) return;
      var closeTimer;
      menu.addEventListener('mouseenter', function () {
        window.clearTimeout(closeTimer);
        details.setAttribute('open', '');
        var summary = details.querySelector('summary');
        if (summary) summary.setAttribute('aria-expanded', 'true');
      });
      menu.addEventListener('mouseleave', function () {
        closeTimer = window.setTimeout(function () {
          details.removeAttribute('open');
          var summary = details.querySelector('summary');
          if (summary) summary.setAttribute('aria-expanded', 'false');
        }, 150);
      });
    });
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
    /* Publish the mobile Buy/Make bar + hold bar heights for custom.css */
    syncBarHeights();
    window.addEventListener('resize', syncBarHeights, { passive: true });
    window.addEventListener('orientationchange', syncBarHeights);

    /* Show expired toast if we just reloaded after a timer expiry (the /cart
       page reloads; the value is the class URL for "Book again", or '1') */
    var justExpired = sessionStorage.getItem('sa_bk_expired');
    if (justExpired) {
      sessionStorage.removeItem('sa_bk_expired');
      showExpiredToast(justExpired);
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
        var expiredUrl = '';  /* "Book again" target for the expiry toast */

        /* 1. Process existing timers */
        productIds.forEach(function (pid) {
          var data = timersObj[pid];
          var rem  = (data.end || 0) - Date.now();

          /* Remember the class page for "Book again" (additive field; the widget
             may overwrite the entry on a new add — it is re-captured here) */
          if (!data.url) {
            cart.items.some(function (item) {
              if (String(item.product_id) !== String(pid) || !item.url) return false;
              data.url = item.url.split('?')[0];
              return true;
            });
          }

          var timerKeys = [];
          if (data.cartKeys && Array.isArray(data.cartKeys)) {
            data.cartKeys.forEach(function (k) { if (k && k.key) timerKeys.push(k.key); });
          } else if (data.cartKey) { timerKeys.push(data.cartKey); }

          var stillInCart = timerKeys.length === 0 || timerKeys.some(function (k) { return cartKeySet[k]; });

          if (rem <= 0 || !stillInCart) {
            if (rem <= 0) {
              timerKeys.forEach(function (k) { toRemove[k] = true; });
              if (!expiredUrl && data.url) expiredUrl = data.url;
            }
            delete timersObj[pid];
            sessionStorage.removeItem('sa_bk_collapsed_' + pid);
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

        var removals = Promise.all(removeKeys.map(function (k) {
          return fetch('/cart/change.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: k, quantity: 0 })
          }).catch(function () {});
        }));

        /* The cart page lists the lines, so it reloads (toast after reload).
           Everywhere else: update the header count and show the toast in place. */
        if (window.location.pathname.indexOf('/cart') === 0) {
          sessionStorage.setItem('sa_bk_expired', expiredUrl || '1');
          removals
            .then(function () { window.location.reload(); })
            .catch(function () { window.location.reload(); });
          return;
        }
        removals.then(function () {
          updateCartCount();
          showExpiredToast(expiredUrl);
        });
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
      if ('ResizeObserver' in window) new ResizeObserver(syncBarHeights).observe(c);
    }
    return c;
  }

  function showTimerBanner(productId, data, endTime) {
    var bannerId = 'sa-bk-banner-' + productId;
    if (document.getElementById(bannerId)) return;

    var collapseKey = 'sa_bk_collapsed_' + productId;
    var container = getOrCreateBannerContainer();
    var banner    = document.createElement('div');
    banner.id        = bannerId;
    banner.className = 'sa-bk-banner';
    banner.innerHTML = [
      '<div class="bk-banner-inner">',
        '<div class="bk-banner-left">',
          '<span class="bk-banner-timer"></span>',
          '<span class="bk-banner-text">',
            '<strong>' + (data.title || 'Booking') + '</strong>',
            (data.session ? '<span class="bk-banner-sep"> &mdash; </span><span class="bk-banner-session">' + data.session + '</span>' : ''),
            '<br>',
            '<span class="bk-banner-msg">Your spot is reserved — checkout before the timer runs out.</span>',
          '</span>',
        '</div>',
        '<div class="bk-banner-actions">',
          '<a href="/checkout" class="bk-banner-checkout">Checkout now &rarr;</a>',
          '<button class="bk-banner-dismiss" aria-label="Minimise">&times;</button>',
        '</div>',
      '</div>',
      '<a href="/checkout" class="bk-banner-pill"><span class="bk-banner-pill-timer"></span> &middot; Checkout &rarr;</a>'
    ].join('');

    /* Minimised earlier this session: render straight into the pill */
    if (sessionStorage.getItem(collapseKey)) banner.classList.add('bk-collapsed');

    container.appendChild(banner);
    syncBarHeights();

    /* rAF does not run in a background tab, so the timeout makes sure the bar
       never sits off-screen with the timer ticking */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { banner.classList.add('bk-banner-in'); });
    });
    setTimeout(function () { banner.classList.add('bk-banner-in'); }, 60);

    var timerEl     = banner.querySelector('.bk-banner-timer');
    var pillTimerEl = banner.querySelector('.bk-banner-pill-timer');
    var msgEl       = banner.querySelector('.bk-banner-msg');

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
        sessionStorage.removeItem(collapseKey);

        var onCart = window.location.pathname.indexOf('/cart') === 0;
        var removed = removeHeldCartItems(data).catch(function () {});

        banner.classList.remove('bk-banner-in');
        setTimeout(function () { banner.remove(); syncBarHeights(); }, 400);

        if (onCart) {
          /* The cart page lists the lines, so it reloads; the toast follows the reload */
          sessionStorage.setItem('sa_bk_expired', data.url || '1');
          removed.then(function () { window.location.reload(); });
        } else {
          removed.then(function () { updateCartCount(); });
          showExpiredToast(data.url);
        }
      } else {
        var t = fmtMs(rem);
        var urgent = rem < 120000;
        if (timerEl) timerEl.textContent = t;
        if (pillTimerEl) pillTimerEl.textContent = t;
        if (urgent !== banner.classList.contains('bk-urgent')) {
          banner.classList.toggle('bk-urgent', urgent);
          syncBarHeights();
        }
        if (msgEl) {
          msgEl.textContent = urgent
            ? 'Hurry — ' + t + ' left to checkout.'
            : 'Your spot is reserved — checkout before the timer runs out.';
        }
      }
    }

    tick();
    var iv = setInterval(tick, 1000);

    /* × minimises to the pill (for the rest of this browser session); the
       interval stays alive so expiry still fires */
    banner.querySelector('.bk-banner-dismiss').addEventListener('click', function () {
      banner.classList.add('bk-collapsed');
      sessionStorage.setItem(collapseKey, '1');
      syncBarHeights();
    });
  }

  /* On phones the theme's fixed Buy Art / Make Art bar (.rb-mobile-paths) sits
     at the bottom; custom.css stacks the hold bar on top of it and pads the page
     using these two heights. The expanded-banner total also matches what
     whatsapp.js publishes under the same name when the WhatsApp button is on. */
  function syncBarHeights() {
    var paths = document.querySelector('.rb-mobile-paths');
    var pathsH = paths && getComputedStyle(paths).display === 'flex' ? paths.offsetHeight : 0;
    var bannerH = 0;
    var c = document.getElementById('sa-bk-banner-container');
    if (c) {
      Array.prototype.forEach.call(c.querySelectorAll('.sa-bk-banner'), function (b) {
        if (!b.classList.contains('bk-collapsed')) bannerH += b.offsetHeight;
      });
    }
    document.documentElement.style.setProperty('--rb-mobile-paths-h', pathsH + 'px');
    document.documentElement.style.setProperty('--saf-bk-banner-h', bannerH + 'px');
  }

  /* Header cart count after held lines are removed without a reload
     (same bubble markup the booking widget updates) */
  function updateCartCount() {
    return fetch('/cart.js')
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        document.querySelectorAll('.cart-count-bubble').forEach(function (bubble) {
          bubble.querySelectorAll('span').forEach(function (s) { s.textContent = cart.item_count; });
          bubble.style.display = cart.item_count ? '' : 'none';
        });
      })
      .catch(function () {});
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

  function showExpiredToast(url) {
    if (document.getElementById('sa-bk-expired')) return;
    var toast = document.createElement('div');
    toast.id = 'sa-bk-expired';
    toast.setAttribute('role', 'status');
    toast.innerHTML = 'Your booking reservation expired. <a href="/collections/workshops-classes">Book again &rarr;</a>';
    /* Back to the class they held, when we know it (same-site paths only) */
    if (typeof url === 'string' && url.charAt(0) === '/' && url.charAt(1) !== '/') {
      toast.querySelector('a').setAttribute('href', url);
    }
    document.body.appendChild(toast);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { toast.classList.add('bk-show'); });
    });
    setTimeout(function () { toast.classList.add('bk-show'); }, 60);
    setTimeout(function () {
      toast.style.opacity = '0';
      setTimeout(function () { toast.remove(); }, 400);
    }, 10000);
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
    initTransparentHeader();
    initHeaderHoverMenus();
    initPathLabelLinks();
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
