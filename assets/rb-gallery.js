/* ==========================================================================
   Class gallery lightbox.

   Data and markup root come from sections/rb-class-gallery.liquid, which gets
   its pictures from snippets/rb-class-gallery-data.liquid (class images first,
   the teacher's set as the fallback, nothing at all otherwise).

   That one source decides everything, so the tab and the lightbox can never
   disagree: the "Gallery" item in the page nav ships hidden and the class hero
   picture ships inert, and this file switches both on only when a gallery
   really is on the page.

   Brief (2026-09-16): one large picture in a translucent white mat on a dark
   blurred backdrop, a small thumbnail carousel underneath, arrow keys, Esc,
   swipe on mobile, focus trap, locked page behind, lazy loading, no reflow.
   ========================================================================== */
(function () {
  if (window.rbClassGallery) return;

  var ICON = {
    close: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5v14l11-7z"/></svg>'
  };

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var data = null;
  var root, track, stage, counter, prevBtn, nextBtn, thumbsBox;
  var slides = [];
  var thumbs = [];
  var index = -1;
  var isOpen = false;
  var opener = null;
  var pushedHistory = false;
  var skipPop = false;
  var lockedScrollY = 0; /* where the page was when the gallery opened */
  var scrollTimer = null;
  var target = null; /* the slide a button, thumb or key is scrolling to */
  var lastTabAt = 0; /* when Tab was last pressed — tells keyboard focus from a click */
  window.addEventListener('keydown', function (e) { if (e.key === 'Tab') lastTabAt = Date.now(); }, true);

  function readData() {
    var el = document.querySelector('script[data-rb-class-gallery]');
    if (!el) return null;
    try {
      var d = JSON.parse(el.textContent);
      if (!d || !d.items || !d.items.length) return null;
      /* captions on or off is a theme-editor setting, carried on the tag */
      d.captions = el.getAttribute('data-captions') !== 'false';
      return d;
    } catch (e) {
      return null;
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Build — once, on first open                                            */
  /* ---------------------------------------------------------------------- */

  function build() {
    var items = data.items;
    var many = items.length > 1;
    var name = data.name || 'Gallery';
    var captions = data.captions !== false;

    var html = '<div class="rb-clsgal__bar">'
      + '<p class="rb-clsgal__title"><span class="rb-clsgal__name">' + esc(name) + '</span>'
      + (many ? '<span class="rb-clsgal__count" aria-live="polite"></span>' : '') + '</p>'
      + '<button type="button" class="rb-clsgal__close" data-rb-clsgal-close aria-label="Close gallery">' + ICON.close + '</button>'
      + '</div>'
      + '<div class="rb-clsgal__stage">'
      + '<div class="rb-clsgal__track">';

    items.forEach(function (it, i) {
      var caption = captions && it.caption ? '<p class="rb-clsgal__caption">' + esc(it.caption) + '</p>' : '';
      var media;
      if (it.type === 'video') {
        /* Plays inline with the browser's own controls — the visitor presses
           play. preload=none: nothing downloads until they do. The failure
           panel stays hidden unless no rendition can play here. */
        media = '<div class="rb-clsgal__frame rb-clsgal__frame--video">'
          + '<video class="rb-clsgal__video" controls playsinline preload="none"'
          + (it.poster ? ' poster="' + esc(it.poster) + '"' : '')
          + ' aria-label="' + esc(it.alt || (name + ', video ' + (i + 1))) + '"></video>'
          + '<div class="rb-clsgal__vfail" hidden>'
          + (it.poster ? '<img src="' + esc(it.poster) + '" alt="" draggable="false">' : '')
          + '<p>This video can’t play in this browser.</p></div>'
          + '</div>';
      } else {
        media = '<div class="rb-clsgal__frame">'
          + '<img class="rb-clsgal__img" alt="' + esc(it.alt || (name + ', picture ' + (i + 1))) + '" decoding="async" draggable="false"'
          + ' data-src="' + esc(it.src) + '"' + (it.srcset ? ' data-srcset="' + esc(it.srcset) + '"' : '') + ' sizes="100vw">'
          + '</div>';
      }
      html += '<div class="rb-clsgal__slide" role="group" aria-roledescription="slide" aria-label="' + (i + 1) + ' of ' + items.length + '"'
        + ' style="--rb-clsgal-ar:' + (Number(it.ar) || 1.5) + '">'
        + '<figure class="rb-clsgal__mat" style="--rb-clsgal-ar:' + (Number(it.ar) || 1.5) + '">'
        + media + caption
        + '</figure></div>';
    });

    html += '</div>';
    if (many) {
      html += '<button type="button" class="rb-clsgal__arrow rb-clsgal__arrow--prev" data-rb-clsgal-prev aria-label="Previous">' + ICON.prev + '</button>'
        + '<button type="button" class="rb-clsgal__arrow rb-clsgal__arrow--next" data-rb-clsgal-next aria-label="Next">' + ICON.next + '</button>';
    }
    html += '</div>';

    if (many) {
      html += '<div class="rb-clsgal__thumbs" role="tablist" aria-label="All pictures">';
      items.forEach(function (it, i) {
        var isVideo = it.type === 'video';
        html += '<button type="button" class="rb-clsgal__thumb' + (isVideo ? ' rb-clsgal__thumb--video' : '') + '" role="tab" data-rb-clsgal-go="' + i + '"'
          + ' aria-label="' + (isVideo ? 'Video ' : 'Picture ') + (i + 1) + '">'
          + '<img src="' + esc(it.thumb || it.poster || it.src) + '" alt="" loading="lazy" draggable="false">'
          + (isVideo ? '<span class="rb-clsgal__thumb-play">' + ICON.play + '</span>' : '')
          + '</button>';
      });
      html += '</div>';
    }

    root = document.createElement('div');
    root.className = 'rb-clsgal' + (many ? '' : ' rb-clsgal--single');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', name + ' gallery');
    root.tabIndex = -1;
    root.hidden = true;
    root.innerHTML = html;
    document.body.appendChild(root);

    stage = root.querySelector('.rb-clsgal__stage');
    track = root.querySelector('.rb-clsgal__track');
    counter = root.querySelector('.rb-clsgal__count');
    prevBtn = root.querySelector('[data-rb-clsgal-prev]');
    nextBtn = root.querySelector('[data-rb-clsgal-next]');
    thumbsBox = root.querySelector('.rb-clsgal__thumbs');
    slides = Array.prototype.slice.call(root.querySelectorAll('.rb-clsgal__slide'));
    thumbs = Array.prototype.slice.call(root.querySelectorAll('.rb-clsgal__thumb'));

    root.addEventListener('click', onRootClick);
    track.addEventListener('scroll', onScroll, { passive: true });
    bindSwipeDown();
    window.addEventListener('resize', function () {
      if (isOpen && index >= 0) jumpTo(index);
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Open / close                                                           */
  /* ---------------------------------------------------------------------- */

  function open(start, trigger) {
    if (isOpen) return;
    if (!data) data = readData();
    if (!data) return;
    if (!root) build();

    opener = trigger || document.activeElement;
    isOpen = true;
    lockedScrollY = window.scrollY;
    var sbw = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.setProperty('--rb-clsgal-sbw', Math.max(0, sbw) + 'px');
    document.documentElement.classList.add('rb-clsgal-open');
    root.hidden = false;
    root.classList.remove('is-dragging');
    root.style.removeProperty('--rb-clsgal-pull');

    index = -1;
    jumpTo(Math.max(0, Math.min(start || 0, slides.length - 1)));
    requestAnimationFrame(function () { root.classList.add('is-open'); });

    /* Focus the dialog itself, not the close button: a focused button draws its
       focus ring for mouse and touch users too. Tab still reaches every control. */
    root.focus({ preventScroll: true });
    /* Capture phase on window, so no other script on the page (header drawer,
       search, booking modal) can swallow Escape before the gallery sees it. */
    window.addEventListener('keydown', onKeydown, true);

    /* Back closes the gallery rather than leaving the class page — people
       arriving from an ad reach for the phone's back gesture first. */
    if (!(window.Shopify && window.Shopify.designMode) && window.history && history.pushState) {
      try {
        history.pushState({ rbClassGallery: true }, '');
        pushedHistory = true;
      } catch (e) {
        pushedHistory = false;
      }
    }
  }

  function close(fromHistory) {
    if (!isOpen) return;
    isOpen = false;
    window.removeEventListener('keydown', onKeydown, true);
    root.classList.remove('is-open');
    /* nothing keeps playing behind a closed gallery */
    slides.forEach(stopVideo);

    /* The page scrolls again the moment the gallery starts closing (not after
       the fade), and lands exactly where it was — some browsers move the page
       while overflow is hidden. */
    document.documentElement.classList.remove('rb-clsgal-open');
    document.documentElement.style.removeProperty('--rb-clsgal-sbw');
    restoreScroll();

    var finish = function () {
      if (isOpen) return;
      root.hidden = true;
    };
    if (reduceMotion) finish();
    else setTimeout(finish, 220);

    if (opener && document.contains(opener) && opener.focus) opener.focus({ preventScroll: true });
    opener = null;

    if (pushedHistory) {
      pushedHistory = false;
      if (!fromHistory && history.state && history.state.rbClassGallery) {
        /* back() lands asynchronously; don't let it close a gallery reopened meanwhile */
        skipPop = true;
        history.back();
      }
    }
  }

  function restoreScroll() {
    if (Math.abs(window.scrollY - lockedScrollY) > 1) window.scrollTo(0, lockedScrollY);
  }

  window.addEventListener('popstate', function () {
    /* our own history.back() — the browser may restore a scroll position of its own */
    if (skipPop) { skipPop = false; restoreScroll(); return; }
    if (isOpen) close(true);
  });

  /* ---------------------------------------------------------------------- */
  /* Moving between pictures                                                */
  /* ---------------------------------------------------------------------- */

  function jumpTo(i) {
    target = null;
    track.scrollTo({ left: i * track.clientWidth, behavior: 'auto' });
    setActive(i);
  }

  function go(i) {
    if (i < 0 || i >= slides.length || i === index) return;
    target = i;
    track.scrollTo({ left: i * track.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' });
    setActive(i);
  }

  function slideAtScroll() {
    return Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  }

  function onScroll() {
    if (!isOpen) return;
    clearTimeout(scrollTimer);
    /* A swipe moves the counter as it crosses halfway. A jump from a button
       already set its destination, so the slides it passes are ignored. */
    if (target === null) {
      var i = slideAtScroll();
      if (i !== index) setActive(i);
    }
    scrollTimer = setTimeout(function () {
      target = null;
      var j = slideAtScroll();
      if (j !== index) setActive(j);
    }, 120);
  }

  function setActive(i) {
    i = Math.max(0, Math.min(i, slides.length - 1));
    index = i;

    if (counter) counter.textContent = (i + 1) + ' / ' + slides.length;
    if (prevBtn) prevBtn.disabled = i === 0;
    if (nextBtn) nextBtn.disabled = i === slides.length - 1;

    thumbs.forEach(function (t, n) {
      t.setAttribute('aria-selected', n === i ? 'true' : 'false');
    });
    if (thumbsBox && thumbs[i]) {
      var t = thumbs[i];
      var left = t.offsetLeft - (thumbsBox.clientWidth - t.offsetWidth) / 2;
      thumbsBox.scrollTo({ left: Math.max(0, left), behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    /* Off-screen slides take no focus, so Tab can't scroll the track sideways.
       Making one inert while it holds focus would drop focus onto the page. */
    var focusLost = false;
    slides.forEach(function (slide, n) {
      var off = n !== i;
      if (off && slide.contains(document.activeElement)) focusLost = true;
      slide.inert = off;
      /* moving to another item stops a video and rewinds it */
      if (off) stopVideo(slide);
    });
    if (focusLost) root.focus({ preventScroll: true });

    /* this picture and its neighbours load; nothing else is fetched */
    for (var n = i - 1; n <= i + 1; n++) loadSlide(n);
  }

  function stopVideo(slide) {
    var v = slide && slide.querySelector('video.rb-clsgal__video');
    if (!v) return;
    if (document.fullscreenElement === v && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    if (v.webkitDisplayingFullscreen && v.webkitExitFullscreen) v.webkitExitFullscreen();
    if (!v.paused) v.pause();
    if (v.currentTime) {
      try { v.currentTime = 0; } catch (e) { /* not seekable yet */ }
    }
  }

  /* MP4 first (every browser that plays video plays it), sharpest up to 1080p
     first; HLS last, and only where the browser plays it natively (Safari). */
  function sourceRank(s) {
    var t = String(s.type || '').toLowerCase();
    return t === 'video/mp4' ? 0 : (t.indexOf('mpegurl') >= 0 ? 2 : 1);
  }
  function sourceOrder(a, b) {
    var ra = sourceRank(a), rb = sourceRank(b);
    if (ra !== rb) return ra - rb;
    var ha = Number(a.h) || 0, hb = Number(b.h) || 0;
    var fa = ha <= 1080, fb = hb <= 1080;
    if (fa !== fb) return fa ? -1 : 1;
    return fa ? hb - ha : ha - hb;
  }

  function showVideoFailure(slide) {
    var v = slide.querySelector('video.rb-clsgal__video');
    var panel = slide.querySelector('.rb-clsgal__vfail');
    if (v) { v.pause(); v.hidden = true; }
    if (panel) panel.hidden = false;
  }

  function loadVideo(slide, item) {
    var v = slide.querySelector('video.rb-clsgal__video');
    var added = 0;
    (item.sources || []).slice().sort(sourceOrder).forEach(function (s) {
      var type = String(s.type || '').toLowerCase();
      if (!s.url || !type) return;
      var probe = type.indexOf('mpegurl') >= 0 ? 'application/vnd.apple.mpegurl' : type;
      if (!v.canPlayType(probe)) return;
      var el = document.createElement('source');
      el.src = s.url;
      el.type = type;
      v.appendChild(el);
      added++;
    });
    /* A browser that can play none of them gets the poster and a sentence,
       never a black box that does nothing. */
    if (!added) { showVideoFailure(slide); return; }
    var sources = v.querySelectorAll('source');
    sources[sources.length - 1].addEventListener('error', function () { showVideoFailure(slide); });
    v.addEventListener('error', function () { showVideoFailure(slide); });

    /* A click on the browser's own play button, timeline or volume leaves focus
       on a control INSIDE the <video> (its private shadow tree). Chrome then
       keeps the Escape key to itself — neither keydown nor keyup reaches the
       page, not even a window capture listener — so the gallery could not be
       closed with Esc once someone had pressed play (found live 2026-09-16).
       Those clicks don't dispatch pointer or click events to the page either;
       all that arrives is focus/focusin and the media events. So on those, hand
       focus back to the <video> element itself: Esc gets through and its own
       keyboard controls (Space to play) keep working. */
    function refocusVideo(delay) {
      setTimeout(function () {
        if (isOpen && document.activeElement === v) v.focus({ preventScroll: true });
      }, delay);
    }
    v.addEventListener('focusin', function () {
      /* someone tabbing into the controls from the keyboard is left where they are */
      if (Date.now() - lastTabAt < 400) return;
      refocusVideo(250);
    });
    ['play', 'pause', 'seeked', 'volumechange', 'ratechange'].forEach(function (type) {
      v.addEventListener(type, function () { refocusVideo(0); });
    });
  }

  function loadSlide(n) {
    var slide = slides[n];
    if (!slide || slide.dataset.loaded) return;
    slide.dataset.loaded = '1';
    if (data.items[n] && data.items[n].type === 'video') {
      loadVideo(slide, data.items[n]);
      return;
    }
    var img = slide.querySelector('img.rb-clsgal__img');
    if (!img) return;
    if (img.dataset.srcset) img.srcset = img.dataset.srcset;
    img.src = img.dataset.src;
  }

  /* ---------------------------------------------------------------------- */
  /* Input                                                                  */
  /* ---------------------------------------------------------------------- */

  function onRootClick(e) {
    var t = e.target;
    if (t.closest('[data-rb-clsgal-close]')) { close(); return; }
    if (t.closest('[data-rb-clsgal-prev]')) { go(index - 1); return; }
    if (t.closest('[data-rb-clsgal-next]')) { go(index + 1); return; }
    var thumb = t.closest('[data-rb-clsgal-go]');
    if (thumb) { go(Number(thumb.getAttribute('data-rb-clsgal-go'))); return; }
    /* A click on the dark area around the picture closes, like any lightbox.
       The picture and its mat, every button and the thumbnail strip do not. */
    if (!t.closest('.rb-clsgal__mat') && !t.closest('button') && !t.closest('.rb-clsgal__thumbs')) close();
  }

  function onKeydown(e) {
    if (!isOpen) return;
    if (e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27) {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); return; }
    if (e.key === 'Home') { e.preventDefault(); go(0); return; }
    if (e.key === 'End') { e.preventDefault(); go(slides.length - 1); return; }
    if (e.key === 'Tab') trapTab(e);
  }

  function trapTab(e) {
    var focusables = Array.prototype.filter.call(
      root.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'),
      function (el) { return !el.hidden && el.offsetParent !== null; }
    );
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!root.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }

  /* Swipe down to close. The track is touch-action: pan-x, so the browser keeps
     horizontal swiping and leaves vertical drags to us. */
  function bindSwipeDown() {
    var x0 = 0, y0 = 0, dy = 0, t0 = 0, mode = null;

    stage.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { mode = 'ignore'; return; }
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      dy = 0;
      t0 = Date.now();
      mode = null;
    }, { passive: true });

    stage.addEventListener('touchmove', function (e) {
      if (mode === 'ignore' || e.touches.length !== 1) return;
      var dx = e.touches[0].clientX - x0;
      var d = e.touches[0].clientY - y0;
      if (mode === null) {
        if (Math.abs(dx) < 8 && Math.abs(d) < 8) return;
        mode = (d > 0 && Math.abs(d) > Math.abs(dx) * 1.3) ? 'pull' : 'ignore';
        if (mode === 'pull') root.classList.add('is-dragging');
      }
      if (mode !== 'pull') return;
      dy = Math.max(0, d);
      root.style.setProperty('--rb-clsgal-pull', dy + 'px');
    }, { passive: true });

    function end() {
      if (mode !== 'pull') { mode = null; return; }
      mode = null;
      root.classList.remove('is-dragging');
      var fast = dy > 40 && (dy / Math.max(1, Date.now() - t0)) > 0.6;
      if (dy > 120 || fast) {
        close();
        setTimeout(function () { root.style.removeProperty('--rb-clsgal-pull'); }, 240);
      } else {
        root.style.removeProperty('--rb-clsgal-pull');
      }
    }
    stage.addEventListener('touchend', end);
    stage.addEventListener('touchcancel', end);
  }

  /* ---------------------------------------------------------------------- */
  /* Ways in — switched on only when the page really has a gallery          */
  /* ---------------------------------------------------------------------- */

  function wireTriggers() {
    data = readData();
    if (!data) return;

    /* the page nav's Gallery item ships hidden */
    document.querySelectorAll('[data-rb-gallery-tab]').forEach(function (li) {
      li.hidden = false;
    });

    /* the class hero picture ships as a plain picture */
    document.querySelectorAll('[data-rb-gallery-hero]').forEach(function (el) {
      el.classList.add('rb-clsgal-trigger');
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-haspopup', 'dialog');
      el.setAttribute('aria-label', 'Open the gallery' + (data.name ? ' for ' + data.name : ''));
      el.setAttribute('data-rb-gallery-open', '');
    });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-rb-gallery-open]');
    if (!t) return;
    e.preventDefault();
    open(0, t);
  });

  /* the hero is a div with role=button, so Enter and Space are ours */
  document.addEventListener('keydown', function (e) {
    if (isOpen || (e.key !== 'Enter' && e.key !== ' ')) return;
    var t = e.target.closest && e.target.closest('[data-rb-gallery-open]');
    if (!t || t.tagName === 'BUTTON' || t.tagName === 'A') return;
    e.preventDefault();
    open(0, t);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireTriggers);
  else wireTriggers();
  /* the theme editor re-renders sections without reloading the page */
  document.addEventListener('shopify:section:load', function () { data = null; wireTriggers(); });

  window.rbClassGallery = { open: open, close: close, refresh: wireTriggers };
})();
