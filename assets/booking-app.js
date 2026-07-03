(function () {
  'use strict';

  var cfg = window.SA_BOOKING;
  if (!cfg || !cfg.classes || !cfg.classes.length) return;

  var holdMin = cfg.holdMin || 15;

  /* ── DOM refs ── */
  var calGrid   = document.querySelector('.bk-app-cal-grid');
  var calMonth  = document.querySelector('.bk-app-cal-month');
  var prevBtn   = document.querySelector('.bk-app-cal-prev');
  var nextBtn   = document.querySelector('.bk-app-cal-next');
  var panelEmpty = document.querySelector('.bk-app-panel-empty');
  var panelSess  = document.querySelector('.bk-app-panel-sessions');

  if (!calGrid || !panelSess) return;

  /* ── State ── */
  var today = new Date(); today.setHours(0,0,0,0);
  var state = {
    month: new Date(today.getFullYear(), today.getMonth(), 1),
    date:  null
  };

  /* ── Constants ── */
  var MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
  var WDAYS  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var SMON   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  /* ── Helpers ── */
  function parseDate(str) {
    if (!str) return null;
    var p = str.split('-');
    if (p.length !== 3) return null;
    var d = new Date(+p[0], +p[1]-1, +p[2]);
    d.setHours(0,0,0,0);
    return isNaN(d) ? null : d;
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth()    === b.getMonth()
        && a.getDate()     === b.getDate();
  }

  function fmtLong(d) {
    return WDAYS[d.getDay()] + ', ' + d.getDate() + ' ' + SMON[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtShort(d) {
    return d.getDate() + ' ' + SMON[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtRands(cents) {
    return 'R ' + Math.round(cents/100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function esc(s) {
    return String(s||'')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Schedule matching ── */
  function classOnDate(cls, date) {
    var start = parseDate(cls.startDate);
    var end   = parseDate(cls.endDate);

    /* specific session dates (multi-pick mode) — overrides range/days logic */
    if (cls.sessionDates && cls.sessionDates.length) {
      var ds = cls.sessionDates.filter(Boolean);
      return ds.some(function(s) { var d = parseDate(s); return d && sameDay(date, d); });
    }

    if (cls.scheduleType === 'one-off') {
      return start && sameDay(date, start);
    }
    if (start && date < start) return false;
    if (end   && date > end)   return false;
    return cls.availDays.indexOf(date.getDay()) !== -1;
  }

  function sessionsOnDate(date) {
    return cfg.classes.filter(function(c){ return classOnDate(c, date); });
  }

  function availableInMonth(yr, mo) {
    var map = {}, days = new Date(yr, mo+1, 0).getDate();
    for (var d = 1; d <= days; d++) {
      var dt = new Date(yr, mo, d); dt.setHours(0,0,0,0);
      if (dt >= today && sessionsOnDate(dt).length) map[d] = true;
    }
    return map;
  }

  /* ── Variant type detection ── */
  function variantKind(v) {
    var t = v.title.toLowerCase();
    if (/\bterm\b/.test(t) || /full.?term/.test(t)) return 'term';
    if (/\btrial\b/.test(t)) return 'trial';
    return 'single';
  }

  function bookingTypes(cls, date) {
    var types = [];
    cls.variants.forEach(function(v) {
      if (v.available === false) return;
      var kind = variantKind(v);

      if (kind === 'term' && cls.allowTerm) {
        var start = parseDate(cls.startDate);
        var end   = parseDate(cls.endDate);
        types.push({
          kind:      'term',
          variantId: v.id,
          name:      'Full Term' + (cls.termName ? ' — ' + cls.termName : ''),
          desc:      (start && end) ? (fmtShort(start) + ' – ' + fmtShort(end)) : '',
          price:     v.price
        });
      } else if (kind === 'trial' && cls.allowTrial) {
        types.push({
          kind:      'trial',
          variantId: v.id,
          name:      'Trial Class',
          desc:      'Try one session at a reduced rate',
          price:     v.price
        });
      } else if (kind === 'single' && cls.allowSingle) {
        types.push({
          kind:      'single',
          variantId: v.id,
          name:      'Single Session',
          desc:      date ? fmtLong(date) : 'Just this one class',
          price:     v.price
        });
      }
    });

    /* Fallback: single default variant */
    if (!types.length && cls.variants.length && cls.allowSingle) {
      var v = cls.variants[0];
      types.push({
        kind:      'single',
        variantId: v.id,
        name:      'Single Session',
        desc:      date ? fmtLong(date) : '',
        price:     v.price
      });
    }

    return types;
  }

  /* ── Calendar ── */
  function renderCal() {
    var yr = state.month.getFullYear();
    var mo = state.month.getMonth();
    calMonth.textContent = MONTHS[mo] + ' ' + yr;
    calGrid.innerHTML = '';

    var avail    = availableInMonth(yr, mo);
    var firstDow = new Date(yr, mo, 1).getDay();
    var total    = new Date(yr, mo+1, 0).getDate();

    for (var i = 0; i < firstDow; i++) {
      var sp = document.createElement('button');
      sp.className = 'bk-app-day is-empty'; sp.disabled = true;
      calGrid.appendChild(sp);
    }

    for (var d = 1; d <= total; d++) {
      var date = new Date(yr, mo, d); date.setHours(0,0,0,0);
      var btn  = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bk-app-day';
      btn.setAttribute('aria-label', fmtLong(date));

      var numEl = document.createElement('span');
      numEl.className = 'bk-app-day-num';
      numEl.textContent = d;
      btn.appendChild(numEl);

      if (sameDay(date, today))  btn.classList.add('is-today');
      if (date < today)          { btn.classList.add('is-past'); btn.disabled = true; }
      else if (avail[d]) {
        btn.classList.add('has-sessions');
        var sessions = sessionsOnDate(date);
        var chips = document.createElement('div');
        chips.className = 'bk-app-day-chips';
        sessions.slice(0, 2).forEach(function(cls) {
          var chip = document.createElement('span');
          chip.className = 'bk-app-day-chip';
          chip.textContent = cls.title;
          chips.appendChild(chip);
        });
        if (sessions.length > 2) {
          var more = document.createElement('span');
          more.className = 'bk-app-day-chip bk-app-day-chip-more';
          more.textContent = '+' + (sessions.length - 2);
          chips.appendChild(more);
        }
        btn.appendChild(chips);
        btn.addEventListener('click', (function(dt){ return function(){ selectDate(dt); }; }(date)));
      }
      if (state.date && sameDay(date, state.date)) btn.classList.add('is-selected');

      calGrid.appendChild(btn);
    }
  }

  function selectDate(date) {
    state.date = date;
    renderCal();
    renderPanel();

    /* On mobile: scroll panel into view */
    if (window.innerWidth <= 900) {
      setTimeout(function(){
        panelSess.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }
  }

  /* ── Panel ── */
  function renderPanel() {
    panelSess.innerHTML = '';

    if (!state.date) {
      panelEmpty.hidden = false;
      panelSess.hidden  = true;
      return;
    }

    panelEmpty.hidden = true;
    panelSess.hidden  = false;

    var label = document.createElement('p');
    label.className = 'bk-app-panel-date';
    label.textContent = fmtLong(state.date).toUpperCase();
    panelSess.appendChild(label);

    var list = sessionsOnDate(state.date);
    if (!list.length) {
      var msg = document.createElement('p');
      msg.style.cssText = 'font-size:0.88rem;color:rgba(0,0,0,0.38);';
      msg.textContent = 'No sessions available on this date.';
      panelSess.appendChild(msg);
      return;
    }

    var wrap = document.createElement('div');
    wrap.className = 'bk-app-sessions';
    panelSess.appendChild(wrap);
    list.forEach(function(cls){ wrap.appendChild(buildCard(cls)); });
  }

  /* ── Session card ── */
  function buildCard(cls) {
    var types   = bookingTypes(cls, state.date);
    var minPrice = types.length ? types.reduce(function(m,t){ return t.price < m ? t.price : m; }, types[0].price) : 0;

    var card = document.createElement('div');
    card.className = 'bk-app-card';

    /* Header */
    var hdr = document.createElement('div');
    hdr.className = 'bk-app-card-hdr';

    if (cls.image) {
      var img = document.createElement('img');
      img.className = 'bk-app-card-img';
      img.src = cls.image; img.alt = cls.title; img.loading = 'lazy';
      hdr.appendChild(img);
    }

    var info = document.createElement('div');
    info.className = 'bk-app-card-info';
    info.innerHTML =
      '<p class="bk-app-card-title">' + esc(cls.title) + '</p>' +
      (cls.classTime ? '<p class="bk-app-card-time">' + esc(cls.classTime) + '</p>' : '');
    hdr.appendChild(info);

    var priceEl = document.createElement('span');
    priceEl.className = 'bk-app-card-price';
    priceEl.textContent = 'from ' + fmtRands(minPrice);
    hdr.appendChild(priceEl);

    var chevron = document.createElement('span');
    chevron.className = 'bk-app-card-chevron';
    chevron.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>';
    hdr.appendChild(chevron);

    card.appendChild(hdr);

    /* Body (booking form) */
    var body = buildForm(cls, types, priceEl);
    body.hidden = true;
    card.appendChild(body);

    /* Toggle */
    hdr.addEventListener('click', function() {
      var opening = body.hidden;
      /* Close all others */
      document.querySelectorAll('.bk-app-card').forEach(function(c) {
        c.classList.remove('is-open');
        var b = c.querySelector('.bk-app-card-body');
        if (b) b.hidden = true;
      });
      if (opening) { card.classList.add('is-open'); body.hidden = false; }
    });

    return card;
  }

  /* ── Booking form ── */
  function buildForm(cls, types, cardPriceEl) {
    var body = document.createElement('div');
    body.className = 'bk-app-card-body';

    var selType = types[0] || null;
    var seats   = 1;
    var uid     = 'bka-' + String(cls.id).replace(/\W/g,'').slice(0,12);

    /* Booking type picker (only when > 1 option) */
    if (types.length > 1) {
      var typesWrap = document.createElement('div');
      typesWrap.className = 'bk-app-types';

      types.forEach(function(type, idx) {
        var row = document.createElement('div');
        row.className = 'bk-app-type' + (idx === 0 ? ' is-sel' : '');
        row.innerHTML =
          '<div class="bk-app-type-radio"></div>' +
          '<div class="bk-app-type-info">' +
            '<p class="bk-app-type-name">' + esc(type.name) + '</p>' +
            (type.desc ? '<p class="bk-app-type-desc">' + esc(type.desc) + '</p>' : '') +
          '</div>' +
          '<span class="bk-app-type-price">' + fmtRands(type.price) + '</span>';

        row.addEventListener('click', function() {
          typesWrap.querySelectorAll('.bk-app-type').forEach(function(r){ r.classList.remove('is-sel'); });
          row.classList.add('is-sel');
          selType = type;
          update();
        });

        typesWrap.appendChild(row);
      });

      body.appendChild(typesWrap);
    } else if (types.length === 1) {
      /* Single type: show a read-only summary line */
      selType = types[0];
      var summary = document.createElement('p');
      summary.style.cssText = 'font-size:0.82rem;color:rgba(0,0,0,0.48);margin:0 0 1rem;';
      summary.textContent = selType.name + (selType.desc ? ' — ' + selType.desc : '');
      body.appendChild(summary);
    }

    /* Fields */
    var fields = document.createElement('div');
    fields.className = 'bk-app-fields';
    fields.innerHTML =
      '<div class="bk-app-field">' +
        '<label for="' + uid + '-n">Full name</label>' +
        '<input type="text" id="' + uid + '-n" placeholder="Your full name" autocomplete="name">' +
      '</div>' +
      '<div class="bk-app-field">' +
        '<label for="' + uid + '-e">Email</label>' +
        '<input type="email" id="' + uid + '-e" placeholder="your@email.com" autocomplete="email">' +
      '</div>' +
      '<div class="bk-app-field-row">' +
        '<div class="bk-app-field">' +
          '<label for="' + uid + '-p">Phone</label>' +
          '<input type="tel" id="' + uid + '-p" placeholder="+27 xx xxx xxxx" autocomplete="tel">' +
        '</div>' +
        '<div class="bk-app-field">' +
          '<label for="' + uid + '-s">Seats</label>' +
          '<input type="number" id="' + uid + '-s" value="1" min="1" max="10">' +
        '</div>' +
      '</div>';
    body.appendChild(fields);

    /* Total */
    var totalRow = document.createElement('div');
    totalRow.className = 'bk-app-total';
    totalRow.innerHTML =
      '<span class="bk-app-total-lbl">Total</span>' +
      '<span class="bk-app-total-amt">—</span>';
    body.appendChild(totalRow);
    var totalAmt = totalRow.querySelector('.bk-app-total-amt');

    /* Error */
    var errEl = document.createElement('p');
    errEl.className = 'bk-app-form-err';
    body.appendChild(errEl);

    /* Submit */
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bk-app-submit';
    btn.textContent = 'Book 1 seat';
    body.appendChild(btn);

    var sub = document.createElement('p');
    sub.className = 'bk-app-subtext';
    sub.textContent = 'Digital ticket emailed instantly · no shipping required';
    body.appendChild(sub);

    /* Seats listener */
    var seatsInput = fields.querySelector('#' + uid + '-s');
    seatsInput.addEventListener('input', function() {
      var v = parseInt(seatsInput.value, 10) || 1;
      seats = Math.max(1, Math.min(10, v));
      seatsInput.value = seats;
      update();
    });
    seatsInput.addEventListener('blur', function(){ seatsInput.value = seats; });

    function update() {
      if (!selType) { totalAmt.textContent = '—'; return; }
      totalAmt.textContent = fmtRands(selType.price * seats);
      btn.textContent = 'Book ' + seats + (seats === 1 ? ' seat' : ' seats');
      if (cardPriceEl) cardPriceEl.textContent = 'from ' + fmtRands(selType.price);
    }
    update();

    /* Submit handler */
    btn.addEventListener('click', function() {
      var name  = (fields.querySelector('#'+uid+'-n').value||'').trim();
      var email = (fields.querySelector('#'+uid+'-e').value||'').trim();
      var phone = (fields.querySelector('#'+uid+'-p').value||'').trim();

      if (!name || !email) { showErr(errEl, 'Please enter your full name and email.'); return; }
      if (!selType)        { showErr(errEl, 'Please select a booking option.');        return; }
      if (!state.date)     { showErr(errEl, 'Please select a date first.');            return; }

      btn.disabled = true;
      btn.textContent = 'Adding…';

      fetch('/cart/add.js', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:         selType.variantId,
          quantity:   seats,
          properties: {
            'Name':         name,
            'Email':        email,
            'Phone':        phone,
            'Booking Date': fmtLong(state.date),
            'Session':      selType.name,
            'Class Time':   cls.classTime || ''
          }
        })
      })
      .then(function(r){ return r.json(); })
      .then(function(res) {
        if (res.status) throw new Error(res.description || 'Could not add to cart.');
        localStorage.setItem('sa_bk_timer', JSON.stringify({
          start:   Date.now(),
          holdMin: holdMin,
          title:   cls.title,
          session: fmtLong(state.date) + (selType.name !== 'Single Session' ? ' — ' + selType.name : ''),
          seats:   seats
        }));
        window.location.href = '/cart';
      })
      .catch(function(err) {
        btn.disabled = false;
        update();
        showErr(errEl, err.message || 'Something went wrong. Please try again.');
      });
    });

    return body;
  }

  function showErr(el, msg) {
    el.textContent = msg; el.style.display = 'block';
    setTimeout(function(){ el.style.display = 'none'; }, 6000);
  }

  /* ── Navigation ── */
  prevBtn.addEventListener('click', function() {
    var m = state.month;
    state.month = new Date(m.getFullYear(), m.getMonth()-1, 1);
    renderCal();
  });
  nextBtn.addEventListener('click', function() {
    var m = state.month;
    state.month = new Date(m.getFullYear(), m.getMonth()+1, 1);
    renderCal();
  });

  /* ── Init ── */
  renderCal();
  renderPanel();

})();
