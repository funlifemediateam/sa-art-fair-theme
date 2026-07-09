/* SA Art Fair — display-only currency converter.
   Prices are rewritten in the DOM as estimates; checkout always charges ZAR.
   Store money format is "R {{amount}}" (e.g. "R 1,200.00"). */
(function () {
  var STORAGE_CURRENCY = 'saf_currency';
  var STORAGE_RATES = 'saf_fx';
  var RATES_TTL = 12 * 60 * 60 * 1000; /* 12h */
  var CURRENCIES = {
    ZAR: { symbol: 'R', flag: '\u{1F1FF}\u{1F1E6}', label: 'R (ZAR)' },
    USD: { symbol: '$', flag: '\u{1F1FA}\u{1F1F8}', label: '$ (USD)' },
    EUR: { symbol: '€', flag: '\u{1F1EA}\u{1F1FA}', label: '€ (EUR)' },
    GBP: { symbol: '£', flag: '\u{1F1EC}\u{1F1E7}', label: '£ (GBP)' }
  };
  var PRICE_SELECTORS = [
    '.price-item',
    '.price--end',
    '.totals__total-value',
    '.unit-price',
    '.predictive-search__item-price',
    '.saf-wl-price',
    '.hfa-card__price',
    '.hgp-item__price',
    '.hau-card__price'
  ].join(',');
  /* Never rewrite anything inside the booking widget or its timer banners */
  var EXCLUDE_CLOSEST = '#sa-bk-banner-container, [data-api], [data-saf-no-convert]';

  var current = localStorage.getItem(STORAGE_CURRENCY) || 'ZAR';
  if (!CURRENCIES[current]) current = 'ZAR';

  /* ── Shared "DOM settled" helper (also used by wishlist.js) ── */
  var settledCallbacks = [];
  var settleTimer;
  window.safOnDomSettled = function (cb) {
    settledCallbacks.push(cb);
  };
  function watchDom() {
    if (!window.MutationObserver) return;
    var observer = new MutationObserver(function () {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(function () {
        settledCallbacks.forEach(function (cb) {
          try { cb(); } catch (e) { /* one bad callback must not kill the rest */ }
        });
      }, 120);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /* ── Parsing / formatting (pure) ── */
  function parseZarText(text) {
    if (!text) return null;
    var m = text.trim().match(/^(?:From\s+)?R\s?([\d,]+(?:\.\d{1,2})?)(?:\s+ZAR)?$/i);
    if (!m) return null;
    var amount = parseFloat(m[1].replace(/,/g, ''));
    if (isNaN(amount)) return null;
    return Math.round(amount * 100); /* cents */
  }

  function formatConverted(cents, rate, symbol) {
    var value = Math.round((cents / 100) * rate);
    return '≈ ' + symbol + value.toLocaleString('en-US');
  }

  /* ── Rates ── */
  function getCachedRates() {
    try {
      var raw = localStorage.getItem(STORAGE_RATES);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.rates || Date.now() - data.ts > RATES_TTL) return null;
      return data.rates;
    } catch (e) {
      return null;
    }
  }

  function fetchRates() {
    return fetch('https://open.er-api.com/v6/latest/ZAR')
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (!json || !json.rates || !json.rates.USD) throw new Error('bad payload');
        return { USD: json.rates.USD, EUR: json.rates.EUR, GBP: json.rates.GBP };
      })
      .catch(function () {
        return fetch('https://api.frankfurter.app/latest?from=ZAR&to=USD,EUR,GBP')
          .then(function (r) { return r.json(); })
          .then(function (json) {
            if (!json || !json.rates || !json.rates.USD) throw new Error('bad payload');
            return { USD: json.rates.USD, EUR: json.rates.EUR, GBP: json.rates.GBP };
          });
      })
      .then(function (rates) {
        localStorage.setItem(STORAGE_RATES, JSON.stringify({ ts: Date.now(), rates: rates }));
        return rates;
      });
  }

  function ensureRates() {
    var cached = getCachedRates();
    if (cached) return Promise.resolve(cached);
    return fetchRates();
  }

  /* ── DOM conversion ── */
  function convertAll(rates) {
    var els = document.querySelectorAll(PRICE_SELECTORS);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.closest(EXCLUDE_CLOSEST)) continue;
      if (el.querySelector(PRICE_SELECTORS)) continue; /* only leaf-most price nodes */

      if (!el.dataset.safZar) {
        var cents = parseZarText(el.textContent);
        if (cents === null) continue;
        el.dataset.safZar = String(cents);
        el.dataset.safOrig = el.textContent;
      }

      var desired;
      if (current === 'ZAR') {
        desired = el.dataset.safOrig;
      } else {
        var rate = rates && rates[current];
        if (!rate) continue;
        desired = formatConverted(parseInt(el.dataset.safZar, 10), rate, CURRENCIES[current].symbol);
      }
      if (el.textContent !== desired) el.textContent = desired;
    }
  }

  function applyCurrency() {
    if (current === 'ZAR') {
      convertAll(null);
      return;
    }
    ensureRates()
      .then(function (rates) { convertAll(rates); })
      .catch(function () {
        /* Rates unavailable — fall back to ZAR */
        current = 'ZAR';
        localStorage.setItem(STORAGE_CURRENCY, 'ZAR');
        updateSelector(true);
        convertAll(null);
      });
  }

  /* ── Header selector ── */
  function updateSelector(ratesUnavailable) {
    var flag = document.querySelector('[data-currency-flag]');
    var label = document.querySelector('[data-currency-label]');
    if (flag) flag.textContent = CURRENCIES[current].flag;
    if (label) label.textContent = ratesUnavailable ? 'Rates unavailable' : CURRENCIES[current].label;
    document.querySelectorAll('.saf-currency [data-currency]').forEach(function (btn) {
      btn.setAttribute('aria-current', btn.dataset.currency === current ? 'true' : 'false');
    });
  }

  function initSelector() {
    var container = document.querySelector('.saf-currency');
    if (!container) return;
    container.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-currency]');
      if (!btn) return;
      current = btn.dataset.currency;
      if (!CURRENCIES[current]) current = 'ZAR';
      localStorage.setItem(STORAGE_CURRENCY, current);
      updateSelector();
      var details = container.querySelector('details');
      if (details) details.removeAttribute('open');
      document.dispatchEvent(new CustomEvent('saf:currency:changed', { detail: { currency: current } }));
      applyCurrency();
    });
    updateSelector();
  }

  function init() {
    initSelector();
    applyCurrency();
    window.safOnDomSettled(applyCurrency);
    watchDom();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
