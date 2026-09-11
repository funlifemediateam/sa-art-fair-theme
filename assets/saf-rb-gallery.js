/* ==========================================================================
   Teacher gallery — full-screen photo/video viewer on class pages.

   Data comes from snippets/rb-gallery.liquid (a JSON block per page); any
   element with [data-rb-gallery-open] opens it: the "Gallery" link in the
   page nav and the class hero picture.

   Agreed with Keagan 2026-09-11:
   - full screen, frosted LIGHT background with the page blurred behind
   - swipe on touch, arrows + keys on desktop, thumbnail strip, counter
   - videos play muted when their slide is showing, a sound button (or a tap
     on the video) turns sound on, and they pause + rewind when you leave
   - no captions
   - Esc, the close button, Back, or a swipe down closes it

   Swiping is the browser's own scroll-snap, not a hand-rolled drag: it keeps
   momentum and trackpad swipes native, and the active slide is simply the
   one the track has scrolled to.

   Rendered by two sections on the same page, so this file can be included
   twice — the guard below makes the second copy a no-op.
   ========================================================================== */
(function () {
  if (window.rbGallery) return;
  window.rbGallery = { open: open, close: close };

  var ICON = {
    close: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7"/></svg>',
    muted: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
    sound: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5v14l11-7z"/></svg>'
  };

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var data = null;
  var root, track, stage, counter, prevBtn, nextBtn, thumbsBox;
  var slides = [];
  var thumbs = [];
  var index = -1;
  var isOpen = false;
  var muted = true;
  var opener = null;
  var pushedHistory = false;
  var skipPop = false;
  var scrollTimer = null;
  var target = null; /* slide a button/thumb/key is scrolling to */

  function readData() {
    var el = document.querySelector('script[data-rb-gallery]');
    if (!el) return null;
    try {
      var d = JSON.parse(el.textContent);
      return d && d.items && d.items.length ? d : null;
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
    var name = data.name ? data.name : 'Gallery';
    var photoN = 0;
    var videoN = 0;

    var html = '<div class="rb-gal__bar">'
      + '<p class="rb-gal__title"><span class="rb-gal__name">' + esc(name) + '</span>'
      + (many ? '<span class="rb-gal__count" aria-live="polite"></span>' : '') + '</p>'
      + '<button type="button" class="rb-gal__close" data-rb-gal-close aria-label="Close gallery">' + ICON.close + '</button>'
      + '</div>'
      + '<div class="rb-gal__stage">'
      + '<div class="rb-gal__track">';

    items.forEach(function (it, i) {
      var label = (it.type === 'video' ? 'Video ' + (++videoN) : 'Photo ' + (++photoN));
      html += '<div class="rb-gal__slide" role="group" aria-roledescription="slide" aria-label="' + (i + 1) + ' of ' + items.length + '">'
        + '<div class="rb-gal__frame" style="--rb-gal-ar:' + (Number(it.ar) || 1) + '">';
      if (it.type === 'video') {
        html += '<video class="rb-gal__media" muted playsinline loop preload="none"'
          + (it.poster ? ' poster="' + esc(it.poster) + '"' : '')
          + ' data-src="' + esc(it.src) + '" aria-label="' + esc(name + ', ' + label.toLowerCase()) + '"></video>'
          + '<button type="button" class="rb-gal__play" data-rb-gal-play aria-label="Play video" hidden>' + ICON.play + '</button>'
          + '<button type="button" class="rb-gal__sound" data-rb-gal-sound aria-pressed="false" aria-label="Turn sound on">' + ICON.muted + '</button>';
      } else {
        html += '<img class="rb-gal__media" alt="' + esc(name + ', ' + label.toLowerCase()) + '" decoding="async" draggable="false"'
          + ' data-src="' + esc(it.src) + '"' + (it.srcset ? ' data-srcset="' + esc(it.srcset) + '"' : '') + ' sizes="100vw">';
      }
      html += '</div></div>';
      it.label = label;
    });

    html += '</div>';
    if (many) {
      html += '<button type="button" class="rb-gal__arrow rb-gal__arrow--prev" data-rb-gal-prev aria-label="Previous">' + ICON.prev + '</button>'
        + '<button type="button" class="rb-gal__arrow rb-gal__arrow--next" data-rb-gal-next aria-label="Next">' + ICON.next + '</button>';
    }
    html += '</div>';

    if (many) {
      html += '<div class="rb-gal__thumbs" role="tablist" aria-label="All photos and videos">';
      items.forEach(function (it, i) {
        html += '<button type="button" class="rb-gal__thumb' + (it.type === 'video' ? ' rb-gal__thumb--video' : '') + '"'
          + ' role="tab" data-rb-gal-go="' + i + '" aria-label="' + esc(it.label) + '">'
          + (it.thumb ? '<img src="' + esc(it.thumb) + '" alt="" loading="lazy" draggable="false">' : '')
          + (it.type === 'video' ? '<span class="rb-gal__thumb-play">' + ICON.play + '</span>' : '')
          + '</button>';
      });
      html += '</div>';
    }

    root = document.createElement('div');
    root.className = 'rb-gal' + (many ? '' : ' rb-gal--single');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', name + ' gallery');
    root.tabIndex = -1;
    root.hidden = true;
    root.innerHTML = html;
    document.body.appendChild(root);

    stage = root.querySelector('.rb-gal__stage');
    track = root.querySelector('.rb-gal__track');
    counter = root.querySelector('.rb-gal__count');
    prevBtn = root.querySelector('[data-rb-gal-prev]');
    nextBtn = root.querySelector('[data-rb-gal-next]');
    thumbsBox = root.querySelector('.rb-gal__thumbs');
    slides = Array.prototype.slice.call(root.querySelectorAll('.rb-gal__slide'));
    thumbs = Array.prototype.slice.call(root.querySelectorAll('.rb-gal__thumb'));

    root.addEventListener('click', onRootClick);
    track.addEventListener('scroll', onScroll, { passive: true });
    bindSwipeDown();

    slides.forEach(function (slide) {
      var v = slide.querySelector('video');
      if (!v) return;
      v.addEventListener('playing', function () { setPlayButton(slide, false); });
    });

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
    var sbw = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.setProperty('--rb-gal-sbw', Math.max(0, sbw) + 'px');
    document.documentElement.classList.add('rb-gal-open');
    root.hidden = false;
    root.classList.remove('is-dragging');
    root.style.removeProperty('--rb-gal-pull');
    root.style.removeProperty('--rb-gal-fade');

    index = -1;
    jumpTo(Math.max(0, Math.min(start || 0, slides.length - 1)));
    /* a frame later so the fade-in transition actually runs */
    requestAnimationFrame(function () { root.classList.add('is-open'); });

    var closeBtn = root.querySelector('[data-rb-gal-close]');
    if (closeBtn) closeBtn.focus({ preventScroll: true });
    document.addEventListener('keydown', onKeydown);

    /* Back closes the gallery instead of leaving the class page — people
       arriving from an ad reach for the phone's back gesture first. */
    if (!(window.Shopify && window.Shopify.designMode) && window.history && history.pushState) {
      try {
        history.pushState({ rbGallery: true }, '');
        pushedHistory = true;
      } catch (e) {
        pushedHistory = false;
      }
    }
  }

  function close(fromHistory) {
    if (!isOpen) return;
    isOpen = false;
    document.removeEventListener('keydown', onKeydown);
    slides.forEach(function (slide) { stopVideo(slide); });
    root.classList.remove('is-open');

    var finish = function () {
      if (isOpen) return;
      root.hidden = true;
      document.documentElement.classList.remove('rb-gal-open');
      document.documentElement.style.removeProperty('--rb-gal-sbw');
    };
    if (reduceMotion) finish();
    else setTimeout(finish, 220);

    if (opener && document.contains(opener) && opener.focus) opener.focus({ preventScroll: true });
    opener = null;

    if (pushedHistory) {
      pushedHistory = false;
      if (!fromHistory && history.state && history.state.rbGallery) {
        /* back() lands asynchronously; don't let it close a gallery reopened meanwhile */
        skipPop = true;
        history.back();
      }
    }
  }

  window.addEventListener('popstate', function () {
    if (skipPop) { skipPop = false; return; }
    if (isOpen) close(true);
  });

  /* ---------------------------------------------------------------------- */
  /* Moving between slides                                                  */
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
       already set the destination, so the slides it passes are ignored. */
    if (target === null) {
      var i = slideAtScroll();
      if (i !== index) setActive(i);
    }
    /* the video decision waits until the track has settled */
    scrollTimer = setTimeout(function () {
      target = null;
      var j = slideAtScroll();
      if (j !== index) setActive(j);
      else syncVideos();
    }, 120);
  }

  function setActive(i) {
    i = Math.max(0, Math.min(i, slides.length - 1));
    var changed = i !== index;
    index = i;

    if (counter) counter.textContent = (i + 1) + ' / ' + slides.length;
    if (prevBtn) prevBtn.disabled = i === 0;
    if (nextBtn) nextBtn.disabled = i === slides.length - 1;

    thumbs.forEach(function (t, n) {
      t.setAttribute('aria-selected', n === i ? 'true' : 'false');
    });
    /* Off-screen slides take no focus, so Tab can't scroll the track sideways.
       Making a slide inert while something in it has focus (the sound button,
       then an arrow key) would drop focus out of the dialog onto the page, so
       hand it to the new slide's sound button, or the dialog itself. */
    var focusLost = false;
    slides.forEach(function (slide, n) {
      var off = n !== i;
      if (off && slide.contains(document.activeElement)) focusLost = true;
      slide.inert = off;
    });
    if (focusLost) {
      var sound = slides[i].querySelector('[data-rb-gal-sound]');
      (sound || root).focus({ preventScroll: true });
    }
    if (changed && thumbsBox && thumbs[i]) {
      var t = thumbs[i];
      var left = t.offsetLeft - (thumbsBox.clientWidth - t.offsetWidth) / 2;
      thumbsBox.scrollTo({ left: Math.max(0, left), behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    /* load this slide and its neighbours; nothing else is fetched */
    for (var n = i - 1; n <= i + 1; n++) loadSlide(n);
    syncVideos();
  }

  function loadSlide(n) {
    var slide = slides[n];
    if (!slide || slide.dataset.loaded) return;
    slide.dataset.loaded = '1';
    var img = slide.querySelector('img.rb-gal__media');
    if (img) {
      if (img.dataset.srcset) img.srcset = img.dataset.srcset;
      img.src = img.dataset.src;
      return;
    }
    var v = slide.querySelector('video');
    if (v) {
      v.src = v.dataset.src;
      v.preload = n === index ? 'auto' : 'metadata';
    }
  }

  /* Only the slide actually on screen plays; everything else is paused and
     rewound so coming back starts it from the top. */
  function syncVideos() {
    if (!isOpen) return;
    var settled = Math.abs(track.scrollLeft - index * track.clientWidth) < 4;
    slides.forEach(function (slide, n) {
      if (n === index && settled) playVideo(slide);
      else if (n !== index) stopVideo(slide);
    });
  }

  function playVideo(slide) {
    var v = slide.querySelector('video');
    if (!v) return;
    if (!v.getAttribute('src')) loadSlide(slides.indexOf(slide));
    v.muted = muted;
    if (!v.paused) return;
    var p = v.play();
    if (p && p.catch) {
      p.catch(function () {
        if (slides[index] !== slide) return;
        /* iOS lets a video start by itself only when muted. Once someone has
           turned sound on, the next video can be refused, so drop back to
           muted and keep it playing; the sound button is one tap away. */
        if (!v.muted) {
          setMuted(true);
          v.muted = true;
          v.play().catch(function () { setPlayButton(slide, true); });
          return;
        }
        /* refused even muted (iOS low-power mode, data saver): offer a tap */
        setPlayButton(slide, true);
      });
    }
  }

  function stopVideo(slide) {
    var v = slide.querySelector('video');
    if (!v) return;
    if (!v.paused) v.pause();
    if (v.currentTime) {
      try { v.currentTime = 0; } catch (e) { /* not seekable yet */ }
    }
    setPlayButton(slide, false);
  }

  function setPlayButton(slide, show) {
    var b = slide.querySelector('[data-rb-gal-play]');
    if (b) b.hidden = !show;
  }

  function setMuted(value) {
    muted = value;
    root.querySelectorAll('[data-rb-gal-sound]').forEach(function (b) {
      b.setAttribute('aria-pressed', muted ? 'false' : 'true');
      b.setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off');
      b.innerHTML = muted ? ICON.muted : ICON.sound;
    });
  }

  function toggleSound() {
    setMuted(!muted);
    var slide = slides[index];
    var v = slide && slide.querySelector('video');
    if (!v) return;
    v.muted = muted;
    /* the tap is a user gesture, so a video autoplay refused can start now */
    if (v.paused) {
      var p = v.play();
      if (p && p.catch) p.catch(function () { setPlayButton(slide, true); });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Input                                                                  */
  /* ---------------------------------------------------------------------- */

  function onRootClick(e) {
    var t = e.target;
    if (t.closest('[data-rb-gal-close]')) { close(); return; }
    if (t.closest('[data-rb-gal-prev]')) { go(index - 1); return; }
    if (t.closest('[data-rb-gal-next]')) { go(index + 1); return; }
    var thumb = t.closest('[data-rb-gal-go]');
    if (thumb) { go(Number(thumb.getAttribute('data-rb-gal-go'))); return; }
    if (t.closest('[data-rb-gal-sound]')) { toggleSound(); return; }
    var playBtn = t.closest('[data-rb-gal-play]');
    if (playBtn) {
      var slide = playBtn.closest('.rb-gal__slide');
      var v = slide.querySelector('video');
      v.muted = muted;
      v.play().catch(function () {});
      setPlayButton(slide, false);
      return;
    }
    if (t.closest('video')) toggleSound();
  }

  function onKeydown(e) {
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
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

  /* Swipe down to close on a phone. The track is touch-action: pan-x, so the
     browser keeps horizontal swiping and leaves vertical drags to us. */
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
      root.style.setProperty('--rb-gal-pull', dy + 'px');
      root.style.setProperty('--rb-gal-fade', Math.max(0.35, 1 - dy / 480).toFixed(3));
    }, { passive: true });

    function clearPull() {
      root.style.removeProperty('--rb-gal-pull');
      root.style.removeProperty('--rb-gal-fade');
    }

    function end() {
      if (mode !== 'pull') { mode = null; return; }
      mode = null;
      root.classList.remove('is-dragging');
      var fast = dy > 40 && (dy / Math.max(1, Date.now() - t0)) > 0.6;
      if (dy > 120 || fast) {
        close();
        setTimeout(clearPull, 240);
      } else {
        clearPull();
      }
    }
    stage.addEventListener('touchend', end);
    stage.addEventListener('touchcancel', end);
  }

  /* ---------------------------------------------------------------------- */
  /* Triggers                                                               */
  /* ---------------------------------------------------------------------- */

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-rb-gallery-open]');
    if (!t) return;
    e.preventDefault();
    open(0, t);
  });

  /* the hero picture is a div with role=button, so Enter/Space are ours */
  document.addEventListener('keydown', function (e) {
    if (isOpen || (e.key !== 'Enter' && e.key !== ' ')) return;
    var t = e.target.closest && e.target.closest('[data-rb-gallery-open]');
    if (!t || t.tagName === 'BUTTON' || t.tagName === 'A') return;
    e.preventDefault();
    open(0, t);
  });
})();
