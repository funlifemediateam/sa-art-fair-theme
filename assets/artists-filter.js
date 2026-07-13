/* Artists page search / filter / sort.
   Reads data-af-* attributes rendered by sections/page-artists.liquid.
   All filtering is client-side; state is mirrored to URL params
   (?q=&artist=&medium=&teaches=&sort=) so filtered views are shareable.
   Desktop toolbar, mobile chip row and mobile bottom sheet all drive one
   shared state and stay in sync. Re-inits on shopify:section:load. */
(function () {
  'use strict';

  function initRoot(root) {
    if (root.dataset.afInit === 'true') return;
    root.dataset.afInit = 'true';

    var grid = root.querySelector('[data-af-grid]');
    if (!grid) return;
    var cards = Array.prototype.slice.call(grid.querySelectorAll('[data-af-card]'));
    if (!cards.length) return;
    var initialOrder = cards.slice();

    var isCarousel      = root.hasAttribute('data-af-carousel');
    var carouselSection = root.querySelector('[data-af-carousel-section]');
    var gridSection     = root.querySelector('[data-af-grid-section]');
    var emptyEl         = root.querySelector('[data-af-empty]');
    var countEl         = root.querySelector('[data-af-count]');
    var sheet           = root.querySelector('[data-af-sheet]');

    var state = { q: '', artist: '', mediums: [], teaches: false, sort: 'featured' };

    /* ── URL params ── */
    function readParams() {
      var p = new URLSearchParams(location.search);
      state.q       = p.get('q') || '';
      state.artist  = p.get('artist') || '';
      state.mediums = (p.get('medium') || '').split(',').filter(Boolean);
      state.teaches = p.get('teaches') === '1';
      var sort = p.get('sort') || 'featured';
      state.sort = ['featured', 'az', 'za', 'teachers'].indexOf(sort) >= 0 ? sort : 'featured';
    }

    function writeParams() {
      var p = new URLSearchParams(location.search);
      ['q', 'artist', 'medium', 'teaches', 'sort'].forEach(function (k) { p.delete(k); });
      if (state.q) p.set('q', state.q);
      if (state.artist) p.set('artist', state.artist);
      if (state.mediums.length) p.set('medium', state.mediums.join(','));
      if (state.teaches) p.set('teaches', '1');
      if (state.sort !== 'featured') p.set('sort', state.sort);
      var qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    }

    function isActive() {
      return !!(state.q || state.artist || state.mediums.length || state.teaches || state.sort !== 'featured');
    }

    /* ── Apply ── */
    function norm(s) { return (s || '').toLowerCase(); }

    function matches(card) {
      var d = card.dataset;
      if (state.artist && d.afHandle !== state.artist) return false;
      if (state.teaches && d.afTeaches !== 'true') return false;
      var cardMediums = (d.afMediums || '').split(',').filter(Boolean);
      if (state.mediums.length) {
        var hit = state.mediums.some(function (m) { return cardMediums.indexOf(m) >= 0; });
        if (!hit) return false;
      }
      if (state.q) {
        var mediumWords = cardMediums.join(' ').replace(/-/g, ' ');
        var hay = norm(d.afName + ' ' + d.afRole + ' ' + d.afBio + ' ' + mediumWords);
        var terms = norm(state.q).split(/\s+/).filter(Boolean);
        for (var i = 0; i < terms.length; i++) {
          if (hay.indexOf(terms[i]) < 0) return false;
        }
      }
      return true;
    }

    function apply() {
      var visible = [];
      cards.forEach(function (card) {
        var ok = matches(card);
        card.classList.toggle('is-filtered-out', !ok);
        if (ok) visible.push(card);
      });

      /* sort by reordering grid children */
      var order = initialOrder.slice();
      if (state.sort === 'az' || state.sort === 'za') {
        order.sort(function (a, b) { return (a.dataset.afName || '').localeCompare(b.dataset.afName || ''); });
        if (state.sort === 'za') order.reverse();
      } else if (state.sort === 'teachers') {
        order.sort(function (a, b) {
          var ta = a.dataset.afTeaches === 'true' ? 0 : 1;
          var tb = b.dataset.afTeaches === 'true' ? 0 : 1;
          if (ta !== tb) return ta - tb;
          return (a.dataset.afName || '').localeCompare(b.dataset.afName || '');
        });
      }
      order.forEach(function (card) { grid.appendChild(card); });

      /* carousel ↔ grid swap */
      var active = isActive();
      if (isCarousel && carouselSection && gridSection) {
        carouselSection.hidden = active;
        gridSection.hidden = !active;
      }

      /* empty state + count */
      if (emptyEl) emptyEl.hidden = visible.length > 0;
      if (countEl) {
        if (active) {
          countEl.textContent = visible.length === 1 ? '1 artist' : visible.length + ' artists';
          countEl.classList.add('is-visible');
        } else {
          countEl.textContent = '';
          countEl.classList.remove('is-visible');
        }
      }

      /* sheet apply button label */
      var applyBtn = root.querySelector('[data-af-apply]');
      if (applyBtn) {
        applyBtn.textContent = visible.length === 1 ? 'Show 1 artist'
          : 'Show ' + (visible.length ? visible.length : 'no') + ' artists';
      }

      writeParams();
      reflect();
    }

    /* ── Reflect state to every control ── */
    function reflect() {
      var q = root.querySelector('[data-af-q]');
      if (q && q.value !== state.q) q.value = state.q;

      root.querySelectorAll('[data-af-artist], [data-af-sheet-artist]').forEach(function (sel) {
        if (sel.value !== state.artist) sel.value = state.artist;
      });

      var sortSel = root.querySelector('[data-af-sort]');
      if (sortSel && sortSel.value !== state.sort) sortSel.value = state.sort;
      root.querySelectorAll('[data-af-sheet-sorts] input').forEach(function (r) {
        r.checked = r.value === state.sort;
        r.closest('.saf-af__pill').classList.toggle('is-on', r.checked);
      });

      root.querySelectorAll('[data-af-medium], [data-af-sheet-medium]').forEach(function (cb) {
        cb.checked = state.mediums.indexOf(cb.value) >= 0;
        var pill = cb.closest('.saf-af__pill');
        if (pill) pill.classList.toggle('is-on', cb.checked);
      });
      root.querySelectorAll('[data-af-chip-medium]').forEach(function (chip) {
        chip.setAttribute('aria-pressed', state.mediums.indexOf(chip.dataset.afChipMedium) >= 0 ? 'true' : 'false');
      });

      var medCount = root.querySelector('[data-af-med-count]');
      if (medCount) {
        medCount.hidden = !state.mediums.length;
        medCount.textContent = state.mediums.length;
      }

      root.querySelectorAll('[data-af-teaches], [data-af-chip-teaches]').forEach(function (chip) {
        chip.setAttribute('aria-pressed', state.teaches ? 'true' : 'false');
      });
      var sheetTeaches = root.querySelector('[data-af-sheet-teaches]');
      if (sheetTeaches) {
        sheetTeaches.checked = state.teaches;
        var pill = sheetTeaches.closest('.saf-af__pill');
        if (pill) pill.classList.toggle('is-on', state.teaches);
      }
    }

    /* ── Bindings ── */
    var q = root.querySelector('[data-af-q]');
    if (q) {
      var deb;
      q.addEventListener('input', function () {
        clearTimeout(deb);
        deb = setTimeout(function () { state.q = q.value.trim(); apply(); }, 160);
      });
    }

    root.querySelectorAll('[data-af-artist], [data-af-sheet-artist]').forEach(function (sel) {
      sel.addEventListener('change', function () { state.artist = sel.value; apply(); });
    });

    var sortSel = root.querySelector('[data-af-sort]');
    if (sortSel) sortSel.addEventListener('change', function () { state.sort = sortSel.value; apply(); });
    root.querySelectorAll('[data-af-sheet-sorts] input').forEach(function (r) {
      r.addEventListener('change', function () { if (r.checked) { state.sort = r.value; apply(); } });
    });

    function toggleMedium(m) {
      var i = state.mediums.indexOf(m);
      if (i >= 0) state.mediums.splice(i, 1); else state.mediums.push(m);
      apply();
    }
    root.querySelectorAll('[data-af-medium], [data-af-sheet-medium]').forEach(function (cb) {
      cb.addEventListener('change', function () { toggleMedium(cb.value); });
    });
    root.querySelectorAll('[data-af-chip-medium]').forEach(function (chip) {
      chip.addEventListener('click', function () { toggleMedium(chip.dataset.afChipMedium); });
    });

    root.querySelectorAll('[data-af-teaches], [data-af-chip-teaches]').forEach(function (chip) {
      chip.addEventListener('click', function () { state.teaches = !state.teaches; apply(); });
    });
    var sheetTeaches = root.querySelector('[data-af-sheet-teaches]');
    if (sheetTeaches) sheetTeaches.addEventListener('change', function () { state.teaches = sheetTeaches.checked; apply(); });

    root.querySelectorAll('[data-af-clear]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state = { q: '', artist: '', mediums: [], teaches: false, sort: 'featured' };
        closeSheet();
        apply();
      });
    });

    /* medium dropdown: close on outside click / Escape */
    var dd = root.querySelector('[data-af-dd]');
    if (dd) {
      document.addEventListener('click', function (e) {
        if (dd.open && !dd.contains(e.target)) dd.open = false;
      });
      dd.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') dd.open = false;
      });
    }

    /* ── Bottom sheet ── */
    function openSheet() {
      if (!sheet) return;
      sheet.hidden = false;
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(function () { sheet.classList.add('is-open'); });
    }
    function closeSheet() {
      if (!sheet || sheet.hidden) return;
      sheet.classList.remove('is-open');
      document.body.style.overflow = '';
      setTimeout(function () { sheet.hidden = true; }, 300);
    }
    var openBtn = root.querySelector('[data-af-open-sheet]');
    if (openBtn) openBtn.addEventListener('click', openSheet);
    root.querySelectorAll('[data-af-sheet-close]').forEach(function (el) {
      el.addEventListener('click', closeSheet);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSheet();
    });

    /* ── Init from URL ── */
    readParams();
    apply();
  }

  function initAll() {
    document.querySelectorAll('[data-af-root]').forEach(initRoot);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  /* Theme editor: re-init after section re-render */
  document.addEventListener('shopify:section:load', function (e) {
    var root = e.target.querySelector('[data-af-root]');
    if (root) initRoot(root);
  });
})();
