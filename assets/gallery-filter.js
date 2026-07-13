/* Gallery collection search / filter / sort.
   Companion to sections/collection-gallery.liquid (data-gf-* attributes).
   The server-rendered grid stays paginated for plain browsing; the moment a
   search/filter/sort is active we fetch the FULL collection once via
   /collections/<handle>/products.json (so results cover every page, not just
   the visible one) and render matching tiles client-side into an identical
   masonry grid. State mirrors to URL params
   (?q=&artist=&medium=&colour=&price=&avail=&sort=) so views are shareable.
   Desktop toolbar, mobile chip row and bottom sheet drive one shared state.
   Prices render in the store money format ("R 1,200.00") so currency.js
   converts them like server-rendered ones. Re-inits on shopify:section:load. */
(function () {
  'use strict';

  var SORTS = ['featured', 'newest', 'price-asc', 'price-desc', 'az'];

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function stripHtml(s) {
    var div = document.createElement('div');
    div.innerHTML = s || '';
    return div.textContent || '';
  }

  function formatZar(amount) {
    return 'R ' + Number(amount).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function initRoot(root) {
    if (root.dataset.gfInit === 'true') return;
    root.dataset.gfInit = 'true';

    var collectionUrl = root.dataset.gfUrl || '/collections/gallery';
    var serverEl  = root.querySelector('[data-gf-server]');
    var resultsEl = root.querySelector('[data-gf-results]');
    var emptyEl   = root.querySelector('[data-gf-empty]');
    var countEl   = root.querySelector('[data-gf-count]');
    var sheet     = root.querySelector('[data-gf-sheet]');
    if (!serverEl || !resultsEl) return;

    var serverCountText = countEl ? countEl.textContent : '';

    var state = { q: '', artist: '', mediums: [], colours: [], price: '', avail: false, sort: 'featured' };

    /* Full catalog, fetched lazily on first filter activation */
    var items = null;
    var loading = false;
    var loadFailed = false;

    /* ── URL params ── */
    function readParams() {
      var p = new URLSearchParams(location.search);
      state.q       = p.get('q') || '';
      state.artist  = p.get('artist') || '';
      state.mediums = (p.get('medium') || '').split(',').filter(Boolean);
      state.colours = (p.get('colour') || '').split(',').filter(Boolean);
      state.price   = p.get('price') || '';
      state.avail   = p.get('avail') === '1';
      var sort = p.get('sort') || 'featured';
      state.sort = SORTS.indexOf(sort) >= 0 ? sort : 'featured';
    }

    function writeParams() {
      var p = new URLSearchParams(location.search);
      ['q', 'artist', 'medium', 'colour', 'price', 'avail', 'sort', 'page'].forEach(function (k) { p.delete(k); });
      if (state.q) p.set('q', state.q);
      if (state.artist) p.set('artist', state.artist);
      if (state.mediums.length) p.set('medium', state.mediums.join(','));
      if (state.colours.length) p.set('colour', state.colours.join(','));
      if (state.price) p.set('price', state.price);
      if (state.avail) p.set('avail', '1');
      if (state.sort !== 'featured') p.set('sort', state.sort);
      var qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    }

    function isActive() {
      return !!(state.q || state.artist || state.mediums.length || state.colours.length ||
        state.price || state.avail || state.sort !== 'featured');
    }

    /* ── Catalog fetch (all pages) ── */
    function loadItems(done) {
      if (items) { done(); return; }
      if (loading) return; /* apply() is re-run when the in-flight load finishes */
      loading = true;
      loadFailed = false;
      if (countEl) {
        countEl.textContent = 'Loading works…';
        countEl.classList.add('is-visible');
      }
      var all = [];
      function page(n) {
        fetch(collectionUrl + '/products.json?limit=250&page=' + n)
          .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          })
          .then(function (d) {
            var ps = d.products || [];
            ps.forEach(function (p, i) {
              var tags = p.tags || [];
              var mediums = [], colours = [], dummy = false;
              tags.forEach(function (t) {
                if (t.indexOf('medium-') === 0) mediums.push(t.slice(7));
                else if (t.indexOf('colour-') === 0) colours.push(t.slice(7));
                else if (t === 'dummy') dummy = true;
              });
              var price = null, available = false;
              (p.variants || []).forEach(function (v) {
                var vp = parseFloat(v.price);
                if (!isNaN(vp) && (price === null || vp < price)) price = vp;
                if (v.available) available = true;
              });
              var img = (p.images && p.images[0]) || null;
              all.push({
                position: all.length,
                title: p.title,
                url: collectionUrl + '/products/' + p.handle,
                vendor: p.vendor || '',
                price: price === null ? 0 : price,
                available: available,
                mediums: mediums,
                colours: colours,
                dummy: dummy,
                created: Date.parse(p.created_at) || 0,
                image: img,
                haystack: (p.title + ' ' + p.vendor + ' ' + (p.product_type || '') + ' ' +
                  mediums.join(' ').replace(/-/g, ' ') + ' ' + colours.join(' ') + ' ' +
                  stripHtml(p.body_html)).toLowerCase()
              });
            });
            if (ps.length === 250) { page(n + 1); return; }
            items = all;
            loading = false;
            done();
          })
          .catch(function () {
            loading = false;
            loadFailed = true;
            done();
          });
      }
      page(1);
    }

    /* ── Matching ── */
    function matches(it) {
      if (state.artist && it.vendor !== state.artist) return false;
      if (state.avail && !it.available) return false;
      if (state.mediums.length && !state.mediums.some(function (m) { return it.mediums.indexOf(m) >= 0; })) return false;
      if (state.colours.length && !state.colours.some(function (c) { return it.colours.indexOf(c) >= 0; })) return false;
      if (state.price) {
        var parts = state.price.split('-');
        var min = parseFloat(parts[0]) || 0;
        var max = parts[1] ? parseFloat(parts[1]) : Infinity;
        if (it.price < min || it.price >= max) return false;
      }
      if (state.q) {
        var terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
        for (var i = 0; i < terms.length; i++) {
          if (it.haystack.indexOf(terms[i]) < 0) return false;
        }
      }
      return true;
    }

    function sortItems(list) {
      var out = list.slice();
      if (state.sort === 'newest') out.sort(function (a, b) { return b.created - a.created; });
      else if (state.sort === 'price-asc') out.sort(function (a, b) { return a.price - b.price; });
      else if (state.sort === 'price-desc') out.sort(function (a, b) { return b.price - a.price; });
      else if (state.sort === 'az') out.sort(function (a, b) { return a.title.localeCompare(b.title); });
      else out.sort(function (a, b) { return a.position - b.position; });
      return out;
    }

    /* ── Rendering (mirrors the Liquid tile markup exactly) ── */
    function tileHtml(it) {
      var imgHtml;
      if (it.image) {
        var src = it.image.src + (it.image.src.indexOf('?') >= 0 ? '&' : '?') + 'width=900';
        imgHtml = '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(it.title) + '" loading="lazy"' +
          (it.image.width ? ' width="' + it.image.width + '" height="' + it.image.height + '"' : '') + '>';
      } else {
        imgHtml = '<div class="cgal-item__noimg"></div>';
      }
      return '<a href="' + escapeHtml(it.url) + '" class="cgal-item">' +
        imgHtml +
        (it.dummy ? '<span class="saf-dummy-badge">&#9679; Placeholder</span>' : '') +
        (it.available ? '' : '<span class="saf-sold-badge">Sold</span>') +
        '<div class="cgal-overlay"><div class="cgal-info">' +
        '<p class="cgal-title">' + escapeHtml(it.title) + '</p>' +
        '<p class="cgal-price">' + escapeHtml(formatZar(it.price)) + '</p>' +
        '</div></div></a>';
    }

    /* ── Apply ── */
    function apply() {
      var active = isActive();
      writeParams();
      reflect();

      if (!active) {
        serverEl.hidden = false;
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
        if (emptyEl) emptyEl.hidden = true;
        if (countEl) { countEl.textContent = serverCountText; countEl.classList.remove('is-visible'); }
        setApplyLabel(null);
        return;
      }

      if (!items) {
        loadItems(apply);
        if (loadFailed && countEl) {
          countEl.textContent = 'Search is unavailable right now — please refresh.';
          countEl.classList.add('is-visible');
          serverEl.hidden = false;
          resultsEl.hidden = true;
        }
        return;
      }

      var visible = sortItems(items.filter(matches));

      serverEl.hidden = true;
      resultsEl.hidden = visible.length === 0;
      resultsEl.innerHTML = visible.map(tileHtml).join('');
      if (emptyEl) emptyEl.hidden = visible.length > 0;
      if (countEl) {
        countEl.textContent = visible.length === 1 ? '1 work' : visible.length + ' works';
        countEl.classList.add('is-visible');
      }
      setApplyLabel(visible.length);
    }

    function setApplyLabel(n) {
      var applyBtn = root.querySelector('[data-gf-apply]');
      if (!applyBtn) return;
      if (n === null) { applyBtn.textContent = 'Show all works'; return; }
      applyBtn.textContent = n === 1 ? 'Show 1 work' : 'Show ' + (n || 'no') + ' works';
    }

    /* ── Reflect state to every control ── */
    function reflect() {
      var q = root.querySelector('[data-gf-q]');
      if (q && q.value !== state.q) q.value = state.q;

      root.querySelectorAll('[data-gf-artist], [data-gf-sheet-artist]').forEach(function (sel) {
        if (sel.value !== state.artist) sel.value = state.artist;
      });

      var priceSel = root.querySelector('[data-gf-price]');
      if (priceSel && priceSel.value !== state.price) priceSel.value = state.price;
      root.querySelectorAll('[data-gf-sheet-prices] input').forEach(function (r) {
        r.checked = r.value === state.price;
        r.closest('.saf-af__pill').classList.toggle('is-on', r.checked);
      });

      var sortSel = root.querySelector('[data-gf-sort]');
      if (sortSel && sortSel.value !== state.sort) sortSel.value = state.sort;
      root.querySelectorAll('[data-gf-sheet-sorts] input').forEach(function (r) {
        r.checked = r.value === state.sort;
        r.closest('.saf-af__pill').classList.toggle('is-on', r.checked);
      });

      root.querySelectorAll('[data-gf-medium], [data-gf-sheet-medium]').forEach(function (cb) {
        cb.checked = state.mediums.indexOf(cb.value) >= 0;
        var pill = cb.closest('.saf-af__pill');
        if (pill) pill.classList.toggle('is-on', cb.checked);
      });
      root.querySelectorAll('[data-gf-chip-medium]').forEach(function (chip) {
        chip.setAttribute('aria-pressed', state.mediums.indexOf(chip.dataset.gfChipMedium) >= 0 ? 'true' : 'false');
      });
      var medCount = root.querySelector('[data-gf-med-count]');
      if (medCount) {
        medCount.hidden = !state.mediums.length;
        medCount.textContent = state.mediums.length;
      }

      root.querySelectorAll('[data-gf-colour], [data-gf-sheet-colour]').forEach(function (cb) {
        cb.checked = state.colours.indexOf(cb.value) >= 0;
        var pill = cb.closest('.saf-af__pill');
        if (pill) pill.classList.toggle('is-on', cb.checked);
      });
      root.querySelectorAll('[data-gf-chip-colour]').forEach(function (chip) {
        chip.setAttribute('aria-pressed', state.colours.indexOf(chip.dataset.gfChipColour) >= 0 ? 'true' : 'false');
      });
      var colCount = root.querySelector('[data-gf-col-count]');
      if (colCount) {
        colCount.hidden = !state.colours.length;
        colCount.textContent = state.colours.length;
      }

      root.querySelectorAll('[data-gf-avail], [data-gf-chip-avail]').forEach(function (chip) {
        chip.setAttribute('aria-pressed', state.avail ? 'true' : 'false');
      });
      var sheetAvail = root.querySelector('[data-gf-sheet-avail]');
      if (sheetAvail) {
        sheetAvail.checked = state.avail;
        var pill = sheetAvail.closest('.saf-af__pill');
        if (pill) pill.classList.toggle('is-on', state.avail);
      }
    }

    /* ── Bindings ── */
    var q = root.querySelector('[data-gf-q]');
    if (q) {
      var deb;
      q.addEventListener('input', function () {
        clearTimeout(deb);
        deb = setTimeout(function () { state.q = q.value.trim(); apply(); }, 160);
      });
    }

    root.querySelectorAll('[data-gf-artist], [data-gf-sheet-artist]').forEach(function (sel) {
      sel.addEventListener('change', function () { state.artist = sel.value; apply(); });
    });

    var priceSel = root.querySelector('[data-gf-price]');
    if (priceSel) priceSel.addEventListener('change', function () { state.price = priceSel.value; apply(); });
    root.querySelectorAll('[data-gf-sheet-prices] input').forEach(function (r) {
      r.addEventListener('change', function () { if (r.checked) { state.price = r.value; apply(); } });
    });

    var sortSel = root.querySelector('[data-gf-sort]');
    if (sortSel) sortSel.addEventListener('change', function () { state.sort = sortSel.value; apply(); });
    root.querySelectorAll('[data-gf-sheet-sorts] input').forEach(function (r) {
      r.addEventListener('change', function () { if (r.checked) { state.sort = r.value; apply(); } });
    });

    function toggleIn(arr, v) {
      var i = arr.indexOf(v);
      if (i >= 0) arr.splice(i, 1); else arr.push(v);
      apply();
    }
    root.querySelectorAll('[data-gf-medium], [data-gf-sheet-medium]').forEach(function (cb) {
      cb.addEventListener('change', function () { toggleIn(state.mediums, cb.value); });
    });
    root.querySelectorAll('[data-gf-chip-medium]').forEach(function (chip) {
      chip.addEventListener('click', function () { toggleIn(state.mediums, chip.dataset.gfChipMedium); });
    });
    root.querySelectorAll('[data-gf-colour], [data-gf-sheet-colour]').forEach(function (cb) {
      cb.addEventListener('change', function () { toggleIn(state.colours, cb.value); });
    });
    root.querySelectorAll('[data-gf-chip-colour]').forEach(function (chip) {
      chip.addEventListener('click', function () { toggleIn(state.colours, chip.dataset.gfChipColour); });
    });

    root.querySelectorAll('[data-gf-avail], [data-gf-chip-avail]').forEach(function (chip) {
      chip.addEventListener('click', function () { state.avail = !state.avail; apply(); });
    });
    var sheetAvail = root.querySelector('[data-gf-sheet-avail]');
    if (sheetAvail) sheetAvail.addEventListener('change', function () { state.avail = sheetAvail.checked; apply(); });

    root.querySelectorAll('[data-gf-clear]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state = { q: '', artist: '', mediums: [], colours: [], price: '', avail: false, sort: 'featured' };
        closeSheet();
        apply();
      });
    });

    /* dropdowns: close on outside click / Escape */
    root.querySelectorAll('[data-gf-dd]').forEach(function (dd) {
      document.addEventListener('click', function (e) {
        if (dd.open && !dd.contains(e.target)) dd.open = false;
      });
      dd.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') dd.open = false;
      });
    });

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
    var openBtn = root.querySelector('[data-gf-open-sheet]');
    if (openBtn) openBtn.addEventListener('click', openSheet);
    root.querySelectorAll('[data-gf-sheet-close]').forEach(function (el) {
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
    document.querySelectorAll('[data-gf-root]').forEach(initRoot);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  document.addEventListener('shopify:section:load', function (e) {
    var root = e.target.querySelector('[data-gf-root]');
    if (root) initRoot(root);
  });
})();
