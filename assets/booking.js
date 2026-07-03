(function () {

  var wrap = document.querySelector('.bk-page[data-hold]');
  if (!wrap) return;

  var holdMin       = parseInt(wrap.dataset.hold, 10) || 15;
  var ctaPrefix     = wrap.dataset.cta || 'Book';
  var productTitle  = wrap.dataset.title || '';
  var classTime     = wrap.dataset.classTime || '';
  var isOneOff      = wrap.dataset.isOneOff === 'true';
  var sessionDatesRaw = wrap.dataset.sessionDates || '';
  var startDateRaw  = wrap.dataset.startDate || '';
  var endDateRaw    = wrap.dataset.endDate   || '';
  var dayMask       = parseInt(wrap.dataset.dayMask || '0', 10);
  var primaryVariantId    = wrap.dataset.primaryVariant || null;
  var primaryPriceCents   = Math.round(parseFloat(wrap.dataset.primaryPrice || '0') * 100);

  // Warn about fractional/suspicious prices (conversion errors) — do NOT fix automatically
  if (primaryPriceCents > 0) {
    var priceRands = primaryPriceCents / 100;
    var frac = priceRands % 1;
    if (frac > 0.01 && frac < 0.99) {
      console.warn('[SA Art Fair] Suspicious price detected: R' + priceRands.toFixed(2)
        + ' — this looks like a currency conversion error. Please correct the price manually in the Shopify admin for product: ' + productTitle);
    }
  }

  var MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ds(d) { return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
  function pd(s) { var p = s.split('-'); var d = new Date(+p[0], +p[1]-1, +p[2]); d.setHours(0,0,0,0); return d; }

  function fmtDateLabel(iso) {
    var d = pd(iso);
    return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtBookingDate(iso) {
    var d = pd(iso);
    return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONS[d.getMonth()] + ' ' + d.getFullYear();
  }

  /* Build date list from schedule metafields */
  function buildDateList() {
    // Explicit session dates take priority
    if (sessionDatesRaw) {
      return sessionDatesRaw.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    }
    // One-off event: single date
    if (isOneOff && startDateRaw) return [startDateRaw];
    // Day-of-week recurring: generate next sessions
    if (dayMask > 0) {
      var today = new Date(); today.setHours(0,0,0,0);
      var from = startDateRaw ? pd(startDateRaw) : today;
      if (from < today) from = today;
      var to   = endDateRaw ? pd(endDateRaw) : null;
      var dates = [];
      var cur = from;
      var limit = 0;
      while (dates.length < 12 && limit < 365) {
        limit++;
        if (to && cur > to) break;
        if (dayMask & (1 << cur.getDay())) dates.push(ds(cur));
        cur = new Date(cur.getTime() + 86400000);
      }
      return dates;
    }
    return [];
  }

  var scheduledDates = buildDateList();
  var useSchedule = scheduledDates.length > 0;

  /* ── Session list ──────────────────────────────────────────────────────── */

  var sessionsEl   = document.getElementById('bk-sessions');
  var priceDisplay = document.getElementById('bk-price-display');
  var totalEl      = document.getElementById('bk-total');
  var seatsInput   = document.getElementById('bk-seats');
  var submitBtn    = document.getElementById('bk-submit');
  var errorEl      = document.getElementById('bk-error');

  var selectedVariantId  = null;
  var selectedPriceCents = 0;
  var selectedDate       = null;
  var seats = 1;

  function fmtRands(cents) {
    var n = Math.round(cents / 100);
    return 'R ' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function updateUI() {
    if (priceDisplay) priceDisplay.textContent = selectedPriceCents > 0 ? fmtRands(selectedPriceCents) : '—';
    if (totalEl) totalEl.textContent = selectedPriceCents > 0 ? fmtRands(selectedPriceCents * seats) : '—';
    if (submitBtn) {
      var ready = useSchedule ? (!!selectedDate && !!selectedVariantId) : !!selectedVariantId;
      submitBtn.disabled = !ready;
      submitBtn.textContent = ctaPrefix + ' ' + seats + (seats === 1 ? ' seat' : ' seats');
    }
  }

  if (useSchedule && sessionsEl) {
    /* Replace variant list with date-based list */
    sessionsEl.innerHTML = scheduledDates.map(function(iso) {
      return '<button class="bk-session-item" type="button" data-date="' + iso + '">'
        + '<span class="bk-session-name">' + fmtDateLabel(iso) + '</span>'
        + (classTime ? '<span class="bk-session-spots">' + classTime + '</span>' : '')
        + '</button>';
    }).join('');

    /* Use primary variant for all date-based bookings */
    selectedVariantId  = primaryVariantId;
    selectedPriceCents = primaryPriceCents;

    /* Wire date selection */
    sessionsEl.querySelectorAll('.bk-session-item').forEach(function(btn) {
      btn.addEventListener('click', function() {
        sessionsEl.querySelectorAll('.bk-session-item').forEach(function(b) { b.classList.remove('is-selected'); });
        btn.classList.add('is-selected');
        selectedDate = btn.dataset.date;
        updateUI();
      });
    });

    /* Auto-select first date */
    var firstBtn = sessionsEl.querySelector('.bk-session-item');
    if (firstBtn) firstBtn.click();

  } else {
    /* Fallback: use variant buttons rendered by Liquid */
    var variantItems = wrap.querySelectorAll('.bk-session-item:not(.is-soldout)');

    function selectItem(item) {
      wrap.querySelectorAll('.bk-session-item').forEach(function(i) { i.classList.remove('is-selected'); });
      item.classList.add('is-selected');
      selectedVariantId  = item.dataset.variantId;
      selectedPriceCents = parseInt(item.dataset.price, 10) || 0;
      /* Use variant title as Booking Date if it looks like a date, else use title */
      var vtitle = item.querySelector('.bk-session-name');
      selectedDate = vtitle ? vtitle.textContent.trim() : null;
      updateUI();
    }

    if (variantItems.length > 0) selectItem(variantItems[0]);
    variantItems.forEach(function(item) {
      item.addEventListener('click', function() { selectItem(item); });
    });
  }

  /* ── Seats ──────────────────────────────────────────────────────────────── */

  if (seatsInput) {
    seatsInput.addEventListener('input', function() {
      var v = parseInt(seatsInput.value, 10) || 1;
      seats = Math.max(1, Math.min(10, v));
      seatsInput.value = seats;
      updateUI();
    });
    seatsInput.addEventListener('blur', function() { seatsInput.value = seats; });
  }

  updateUI();

  /* ── Submit ─────────────────────────────────────────────────────────────── */

  if (submitBtn) {
    submitBtn.addEventListener('click', function() {
      var name  = ((document.getElementById('bk-name')  || {}).value || '').trim();
      var email = ((document.getElementById('bk-email') || {}).value || '').trim();
      var phone = ((document.getElementById('bk-phone') || {}).value || '').trim();

      if (!name || !email) { showError('Please enter your full name and email.'); return; }
      if (!selectedVariantId) { showError('Please select a session.'); return; }
      if (useSchedule && !selectedDate) { showError('Please select a date.'); return; }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Adding…';

      /* Build cart properties — Booking Date is required for admin to see the booking */
      var props = {
        'Name':  name,
        'Email': email
      };
      if (phone) props['Phone'] = phone;

      var bookingDate = useSchedule
        ? fmtBookingDate(selectedDate)
        : (selectedDate && selectedDate !== 'Book a Session' ? selectedDate : null);

      if (bookingDate) props['Booking Date'] = bookingDate;
      if (classTime)   props['Class Time']   = classTime;

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:         parseInt(selectedVariantId, 10),
          quantity:   seats,
          properties: props
        })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.status) throw new Error(data.description || 'Could not add to cart.');

        localStorage.setItem('sa_bk_timer', JSON.stringify({
          start:   Date.now(),
          holdMin: holdMin,
          title:   productTitle,
          session: bookingDate || (useSchedule ? fmtDateLabel(selectedDate) : selectedDate),
          seats:   seats
        }));

        window.location.href = '/cart';
      })
      .catch(function(err) {
        submitBtn.disabled = false;
        updateUI();
        showError(err.message || 'Something went wrong. Please try again.');
      });
    });
  }

  function showError(msg) {
    if (!errorEl) return;
    errorEl.textContent   = msg;
    errorEl.style.display = 'block';
    setTimeout(function() { errorEl.style.display = 'none'; }, 6000);
  }

})();
