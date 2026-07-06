/* SA Art Fair — wishlist. Guests: localStorage only. Logged-in customers:
   synced to a customer metafield via the booking-admin app API (best-effort;
   localStorage stays the source of truth if the API is unreachable). */
(function () {
  var STORAGE_KEY = 'saf_wishlist_v1';
  var SYNC_FLAG = 'saf_wl_synced';
  var MAX_ITEMS = 200;
  var config = window.SAF_CONFIG || {};
  var syncTimer;

  /* ── State ── */
  function load() {
    try {
      var data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (data && Array.isArray(data.items)) return data.items;
    } catch (e) { /* corrupted storage — start fresh */ }
    return [];
  }

  function save(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: items.slice(0, MAX_ITEMS) }));
    document.dispatchEvent(new CustomEvent('saf:wishlist:changed', { detail: { items: items } }));
  }

  function has(items, id) {
    return items.some(function (item) { return item.id === id; });
  }

  function toggle(id, handle) {
    var items = load();
    if (has(items, id)) {
      items = items.filter(function (item) { return item.id !== id; });
    } else {
      items.unshift({ id: id, handle: handle, t: Date.now() });
    }
    save(items);
    scheduleSync();
    return items;
  }

  /* Union by id; earliest timestamp wins; newest first */
  function mergeWishlists(local, remote) {
    var byId = {};
    (remote || []).concat(local || []).forEach(function (item) {
      if (!item || typeof item.id !== 'number') return;
      if (!byId[item.id] || item.t < byId[item.id].t) byId[item.id] = item;
    });
    return Object.keys(byId)
      .map(function (key) { return byId[key]; })
      .sort(function (a, b) { return b.t - a.t; });
  }

  /* ── Server sync (logged-in only, best-effort) ── */
  function scheduleSync() {
    if (!config.customerId || !config.wishlistApi) return;
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(pushToServer, 800);
  }

  function pushToServer() {
    fetch(config.wishlistApi, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: config.customerId, items: load() })
    }).catch(function () {
      /* retry on next page load */
      sessionStorage.removeItem(SYNC_FLAG);
    });
  }

  function syncOnLoad() {
    if (!config.customerId || !config.wishlistApi) return;
    if (sessionStorage.getItem(SYNC_FLAG) === String(config.customerId)) return;
    fetch(config.wishlistApi + '?customerId=' + encodeURIComponent(config.customerId))
      .then(function (r) { return r.json(); })
      .then(function (json) {
        var remote = (json && Array.isArray(json.items)) ? json.items : [];
        var local = load();
        var merged = mergeWishlists(local, remote);
        sessionStorage.setItem(SYNC_FLAG, String(config.customerId));
        save(merged);
        if (JSON.stringify(merged) !== JSON.stringify(remote)) pushToServer();
      })
      .catch(function () { /* offline / API down — localStorage only */ });
  }

  /* ── UI: header bubbles + heart states ── */
  function updateHeader(items) {
    var count = items.length;
    document.querySelectorAll('.wishlist-count-bubble').forEach(function (bubble) {
      if (count > 0) {
        var label = count > 9 ? '9+' : String(count);
        /* only write when changed — a MutationObserver watches the DOM */
        if (bubble.textContent !== label) bubble.textContent = label;
        bubble.hidden = false;
      } else {
        bubble.hidden = true;
      }
    });
    var summary = document.querySelector('[data-wishlist-summary]');
    if (summary) {
      var text = count === 0
        ? 'No saved items yet'
        : count + ' saved item' + (count === 1 ? '' : 's');
      if (summary.textContent !== text) summary.textContent = text;
    }
  }

  function markHearts(items) {
    document.querySelectorAll('.saf-wishlist-toggle').forEach(function (btn) {
      var active = has(items, parseInt(btn.dataset.productId, 10));
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      var label = btn.querySelector('.saf-wishlist-toggle__label');
      if (label) {
        var text = active ? 'Saved to wishlist' : 'Save to wishlist';
        /* guarded write — a MutationObserver watches the DOM */
        if (label.textContent !== text) label.textContent = text;
      }
    });
  }

  function refreshUi() {
    var items = load();
    updateHeader(items);
    markHearts(items);
  }

  /* ── Wishlist page hydration ── */
  function hydrateWishlistPage() {
    var grid = document.getElementById('saf-wishlist-grid');
    if (!grid) return;
    var items = load().slice(0, 50);
    var empty = document.querySelector('[data-wishlist-empty]');

    if (items.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    Promise.allSettled(
      items.map(function (item) {
        return fetch('/products/' + item.handle + '.js').then(function (r) {
          if (!r.ok) throw new Error('gone');
          return r.json();
        });
      })
    ).then(function (results) {
      var gone = [];
      var cards = [];
      results.forEach(function (result, i) {
        if (result.status !== 'fulfilled') {
          gone.push(items[i].id);
          return;
        }
        var p = result.value;
        var img = p.featured_image ? p.featured_image + '&width=533' : '';
        if (img && p.featured_image.indexOf('?') === -1) img = p.featured_image + '?width=533';
        var price = 'R ' + (p.price / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        cards.push(
          '<div class="saf-wl-card">' +
            (img ? '<a href="/products/' + p.handle + '"><img src="' + img + '" alt="" loading="lazy"></a>' : '') +
            '<a class="saf-wl-title" href="/products/' + p.handle + '">' + escapeHtml(p.title) + '</a>' +
            '<span class="price-item saf-wl-price">' + price + '</span>' +
            '<button type="button" class="saf-wl-remove" data-remove-id="' + p.id + '">Remove</button>' +
          '</div>'
        );
      });
      /* prune deleted products */
      if (gone.length) {
        save(load().filter(function (item) { return gone.indexOf(item.id) === -1; }));
        scheduleSync();
      }
      grid.innerHTML = cards.join('');
      if (!cards.length && empty) empty.hidden = false;
    });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  /* ── Events ── */
  function initEvents() {
    document.addEventListener('click', function (e) {
      var toggleBtn = e.target.closest('.saf-wishlist-toggle');
      if (toggleBtn) {
        e.preventDefault();
        e.stopPropagation();
        var id = parseInt(toggleBtn.dataset.productId, 10);
        if (!isNaN(id)) toggle(id, toggleBtn.dataset.productHandle || '');
        return;
      }
      var removeBtn = e.target.closest('.saf-wl-remove');
      if (removeBtn) {
        var removeId = parseInt(removeBtn.dataset.removeId, 10);
        if (!isNaN(removeId)) {
          save(load().filter(function (item) { return item.id !== removeId; }));
          scheduleSync();
          hydrateWishlistPage();
        }
      }
    });

    document.addEventListener('saf:wishlist:changed', refreshUi);
  }

  function init() {
    initEvents();
    refreshUi();
    hydrateWishlistPage();
    syncOnLoad();
    /* re-mark hearts on dynamically inserted cards (quick add, pagination, search) */
    if (window.safOnDomSettled) window.safOnDomSettled(refreshUi);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
