/* SA Art Fair rebrand — "Available Artworks" filtering.

   The server renders a normal paginated grid so the page is complete without
   JS and stays crawlable. The moment a filter is touched we fetch the whole
   collection once from /collections/<handle>/products.json and render matches
   client-side, because a client-side filter that only sees the current page
   silently lies about how many works match.

   Mediums and colours come from the store's `medium-*` and `colour-*` product
   tags, the same taxonomy the admin writes.

   Markup contract: every hook is a data-rba-* attribute, so the Liquid and
   this file can be read side by side. Rebinds on shopify:section:load. */
(function () {
  'use strict';

  var MONEY = { thousands: ' ', decimal: '.' };

  function formatZar(cents) {
    var n = (cents / 100).toFixed(2).split('.');
    return 'R ' + n[0].replace(/\B(?=(\d{3})+(?!\d))/g, MONEY.thousands) + MONEY.decimal + n[1];
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fromTags(tags, prefix) {
    var out = [];
    (tags || []).forEach(function (t) {
      var s = String(t).toLowerCase();
      if (s.indexOf(prefix) === 0) out.push(s.slice(prefix.length));
    });
    return out;
  }

  function initRoot(root) {
    if (root.dataset.rbaInit === 'true') return;
    root.dataset.rbaInit = 'true';

    var url = root.dataset.rbaUrl || '/collections/all';
    var serverEl = root.querySelector('[data-rba-server]');
    var resultsEl = root.querySelector('[data-rba-results]');
    var emptyEl = root.querySelector('[data-rba-empty]');
    var countEl = root.querySelector('[data-rba-count]');
    var moreEl = root.querySelector('[data-rba-more]');
    var cardStyle = root.dataset.rbaCard || 'artwork';
    var viewLabel = root.dataset.rbaViewLabel || 'View Artwork';

    var items = null;
    var loading = false;
    var failed = false;

    var state = {
      q: '', artist: '', mediums: [], colours: [],
      price: '', avail: false, orientation: '', sort: '', show: 0
    };

    /* ── Load ── */
    function load(done) {
      if (loading) return;
      loading = true;
      var all = [];
      function page(n) {
        fetch(url.replace(/\/$/, '') + '/products.json?limit=250&page=' + n, {
          headers: { Accept: 'application/json' }
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            var list = (data && data.products) || [];
            all = all.concat(list);
            if (list.length === 250 && n < 8) return page(n + 1);
            items = all.map(function (p, i) {
              var v = (p.variants && p.variants[0]) || {};
              var img = (p.images && p.images[0]) || null;
              var tags = p.tags || [];
              return {
                id: p.id,
                title: p.title,
                handle: p.handle,
                url: '/products/' + p.handle,
                vendor: p.vendor || '',
                price: Math.round(parseFloat(v.price || 0) * 100),
                available: !!(p.variants || []).some(function (x) { return x.available; }),
                image: img,
                landscape: img ? img.width >= img.height : true,
                created: new Date(p.created_at).getTime() || 0,
                position: i,
                mediums: fromTags(tags, 'medium-'),
                colours: fromTags(tags, 'colour-'),
                haystack: [p.title, p.vendor, p.product_type, tags.join(' ')]
                  .join(' ').toLowerCase()
              };
            });
            loading = false;
            done();
          })
          .catch(function () {
            loading = false;
            failed = true;
            done();
          });
      }
      page(1);
    }

    /* ── Match / sort ── */
    function matches(it) {
      if (state.artist && it.vendor !== state.artist) return false;
      if (state.avail && !it.available) return false;
      if (state.orientation === 'landscape' && !it.landscape) return false;
      if (state.orientation === 'portrait' && it.landscape) return false;
      if (state.mediums.length && !state.mediums.some(function (m) { return it.mediums.indexOf(m) >= 0; })) return false;
      if (state.colours.length && !state.colours.some(function (c) { return it.colours.indexOf(c) >= 0; })) return false;
      if (state.price) {
        var p = state.price.split('-');
        var min = parseFloat(p[0]) || 0;
        var max = p[1] ? parseFloat(p[1]) : Infinity;
        if (it.price < min * 100 || it.price >= max * 100) return false;
      }
      if (state.q) {
        var terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
        for (var i = 0; i < terms.length; i++) {
          if (it.haystack.indexOf(terms[i]) < 0) return false;
        }
      }
      return true;
    }

    function sorted(list) {
      var out = list.slice();
      if (state.sort === 'newest') out.sort(function (a, b) { return b.created - a.created; });
      else if (state.sort === 'price-asc') out.sort(function (a, b) { return a.price - b.price; });
      else if (state.sort === 'price-desc') out.sort(function (a, b) { return b.price - a.price; });
      else if (state.sort === 'az') out.sort(function (a, b) { return a.title.localeCompare(b.title); });
      else out.sort(function (a, b) { return a.position - b.position; });
      return out;
    }

    /* ── Render — mirrors the Liquid tile markup exactly ── */
    function tile(it) {
      var media;
      if (it.image) {
        var src = it.image.src + (it.image.src.indexOf('?') >= 0 ? '&' : '?') + 'width=900';
        media = '<img src="' + esc(src) + '" alt="' + esc(it.title) + '" loading="lazy">';
      } else {
        media = '';
      }
      var head =
        '<a href="' + esc(it.url) + '" class="rb-media rb-aw__media">' + media +
        '<span class="rb-aw__hover"><span class="rb-btn rb-btn--serif rb-aw__hover-btn">' +
        esc(viewLabel) + '</span></span></a>';

      if (cardStyle === 'collection') {
        return '<article class="rb-aw__card">' + head +
          '<div class="rb-meta rb-aw__row"><span>' + esc(it.title) + '</span>' +
          '<span>' + esc(it.vendor) + '</span></div>' +
          '<div class="rb-aw__cta-row"><a href="' + esc(it.url) +
          '" class="rb-btn rb-btn--serif rb-btn--outline">Browse Collection</a></div></article>';
      }

      return '<article class="rb-aw__card">' + head +
        '<h3 class="rb-aw__title"><a href="' + esc(it.url) + '">' + esc(it.title) + '</a></h3>' +
        (it.vendor ? '<p class="rb-aw__artist">' + esc(it.vendor) + '</p>' : '') +
        '<p class="rb-aw__price">' + esc(formatZar(it.price)) +
        (it.available ? '' : ' <span class="rb-aw__sold">Sold</span>') + '</p></article>';
    }

    function active() {
      return !!(state.q || state.artist || state.price || state.avail || state.orientation ||
        state.mediums.length || state.colours.length || state.sort || state.show);
    }

    function apply() {
      writeParams();
      reflect();

      if (!active()) {
        if (serverEl) serverEl.hidden = false;
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
        if (emptyEl) emptyEl.hidden = true;
        if (countEl) countEl.textContent = '';
        if (moreEl) moreEl.hidden = false;
        return;
      }

      if (!items) {
        load(apply);
        if (failed && countEl) countEl.textContent = 'Search is unavailable right now — please refresh.';
        return;
      }

      var list = sorted(items.filter(matches));
      var shown = state.show ? list.slice(0, state.show) : list;

      if (serverEl) serverEl.hidden = true;
      resultsEl.hidden = shown.length === 0;
      resultsEl.innerHTML = shown.map(tile).join('');
      if (emptyEl) emptyEl.hidden = shown.length > 0;
      if (countEl) countEl.textContent = list.length === 1 ? '1 work' : list.length + ' works';
      if (moreEl) moreEl.hidden = true;
    }

    /* ── URL params, so a filtered view is shareable ── */
    function writeParams() {
      if (!window.history || !window.history.replaceState) return;
      var p = new URLSearchParams();
      if (state.q) p.set('q', state.q);
      if (state.artist) p.set('artist', state.artist);
      if (state.mediums.length) p.set('medium', state.mediums.join(','));
      if (state.colours.length) p.set('colour', state.colours.join(','));
      if (state.price) p.set('price', state.price);
      if (state.avail) p.set('avail', '1');
      if (state.orientation) p.set('orientation', state.orientation);
      if (state.sort) p.set('sort', state.sort);
      var qs = p.toString();
      history.replaceState(null, '', qs ? '?' + qs : location.pathname);
    }

    function readParams() {
      var p = new URLSearchParams(location.search);
      state.q = p.get('q') || '';
      state.artist = p.get('artist') || '';
      state.mediums = (p.get('medium') || '').split(',').filter(Boolean);
      state.colours = (p.get('colour') || '').split(',').filter(Boolean);
      state.price = p.get('price') || '';
      state.avail = p.get('avail') === '1';
      state.orientation = p.get('orientation') || '';
      state.sort = p.get('sort') || '';
    }

    /* ── Reflect state back into the controls ── */
    function reflect() {
      var q = root.querySelector('[data-rba-q]');
      if (q && q.value !== state.q) q.value = state.q;

      root.querySelectorAll('[data-rba-artist]').forEach(function (s) { s.value = state.artist; });
      root.querySelectorAll('[data-rba-price]').forEach(function (s) { s.value = state.price; });
      root.querySelectorAll('[data-rba-sort]').forEach(function (s) { s.value = state.sort; });
      root.querySelectorAll('[data-rba-orientation]').forEach(function (s) { s.value = state.orientation; });
      root.querySelectorAll('[data-rba-show]').forEach(function (s) { s.value = String(state.show || ''); });

      root.querySelectorAll('[data-rba-medium]').forEach(function (cb) {
        cb.checked = state.mediums.indexOf(cb.value) >= 0;
      });
      root.querySelectorAll('[data-rba-colour]').forEach(function (cb) {
        cb.checked = state.colours.indexOf(cb.value) >= 0;
        var sw = cb.closest('.rb-aw__swatch');
        if (sw) sw.classList.toggle('is-on', cb.checked);
      });
      root.querySelectorAll('[data-rba-avail]').forEach(function (cb) {
        cb.checked = state.avail;
        var pill = cb.closest('.rb-aw__toggle');
        if (pill) pill.classList.toggle('is-on', state.avail);
      });
    }

    function toggleIn(arr, v) {
      var i = arr.indexOf(v);
      if (i >= 0) arr.splice(i, 1);
      else arr.push(v);
    }

    /* ── Bind ── */
    var debounce;
    var q = root.querySelector('[data-rba-q]');
    if (q) {
      q.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () { state.q = q.value.trim(); apply(); }, 180);
      });
    }
    root.querySelectorAll('[data-rba-artist]').forEach(function (s) {
      s.addEventListener('change', function () { state.artist = s.value; apply(); });
    });
    root.querySelectorAll('[data-rba-price]').forEach(function (s) {
      s.addEventListener('change', function () { state.price = s.value; apply(); });
    });
    root.querySelectorAll('[data-rba-sort]').forEach(function (s) {
      s.addEventListener('change', function () { state.sort = s.value; apply(); });
    });
    root.querySelectorAll('[data-rba-orientation]').forEach(function (s) {
      s.addEventListener('change', function () { state.orientation = s.value; apply(); });
    });
    root.querySelectorAll('[data-rba-show]').forEach(function (s) {
      s.addEventListener('change', function () { state.show = parseInt(s.value, 10) || 0; apply(); });
    });
    root.querySelectorAll('[data-rba-medium]').forEach(function (cb) {
      cb.addEventListener('change', function () { toggleIn(state.mediums, cb.value); apply(); });
    });
    root.querySelectorAll('[data-rba-colour]').forEach(function (cb) {
      cb.addEventListener('change', function () { toggleIn(state.colours, cb.value); apply(); });
    });
    root.querySelectorAll('[data-rba-avail]').forEach(function (cb) {
      cb.addEventListener('change', function () { state.avail = cb.checked; apply(); });
    });
    root.querySelectorAll('[data-rba-clear]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.q = ''; state.artist = ''; state.mediums = []; state.colours = [];
        state.price = ''; state.avail = false; state.orientation = ''; state.sort = ''; state.show = 0;
        apply();
      });
    });

    /* dropdowns close on outside click, like the rest of the theme's filters */
    root.querySelectorAll('[data-rba-dd]').forEach(function (dd) {
      document.addEventListener('click', function (e) {
        if (!dd.contains(e.target)) dd.removeAttribute('open');
      });
    });

    readParams();
    apply();
  }

  function init(scope) {
    (scope || document).querySelectorAll('[data-rba-root]').forEach(initRoot);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); });
  } else {
    init();
  }

  document.addEventListener('shopify:section:load', function (e) { init(e.target); });
})();
