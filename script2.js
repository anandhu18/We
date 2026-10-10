(function () {
  'use strict';

  var CFG = window.APP_CONFIG || {};
  var APP_NAME = CFG.APP_NAME || 'DriveMate';
  var root = document.getElementById('app');
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var NOMINATIM = 'https://nominatim.openstreetmap.org';

  var supa = null;
  if (
    window.supabase &&
    typeof CFG.SUPABASE_URL === 'string' && CFG.SUPABASE_URL.indexOf('https://') === 0 &&
    typeof CFG.SUPABASE_ANON_KEY === 'string' && CFG.SUPABASE_ANON_KEY.length > 20 &&
    CFG.SUPABASE_ANON_KEY.indexOf('PASTE_') !== 0
  ) {
    supa = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  }

  /* ---------- helpers ---------- */
  function $(sel) { return root.querySelector(sel); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function rupees(n) { return '\u20B9' + Number(n).toLocaleString('en-IN'); }

  function cleanError(err) {
    if (err && err.code === 'P0001' && err.message) return err.message;
    return 'Something went wrong. Please try again.';
  }

  function shell(inner, right) {
    return '<main class="shell"><div class="topbar"><a class="brand" href="#/">' + esc(APP_NAME) +
      '</a>' + (right || '') + '</div>' + inner + '</main>';
  }

  function setMsg(sel, msg) {
    var el = $(sel);
    if (el) el.textContent = msg || '';
  }

  /* ---------- router ---------- */
  var cleanup = null;
  var routeSeq = 0;

  function go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  async function route() {
    var my = ++routeSeq;
    if (cleanup) { cleanup(); cleanup = null; }

    if (!supa) { renderSetup(); return; }

    var hash = location.hash || '#/';
    var res = await supa.auth.getSession();
    if (my !== routeSeq) return;
    var session = res && res.data ? res.data.session : null;

    if (hash.indexOf('#/trip/') === 0) {
      if (!session) { go('#/login'); return; }
      renderTrip(hash.slice(7));
    } else if (hash === '#/book') {
      if (!session) { go('#/login'); return; }
      renderBook();
    } else if (hash === '#/login') {
      if (session) { go('#/book'); return; }
      renderLogin();
    } else {
      renderHome(!!session);
    }
  }

  /* ---------- setup notice ---------- */
  function renderSetup() {
    root.innerHTML = shell(
      '<div class="stack"><h2>One more step</h2>' +
      '<p class="muted">Open the file <b>config.js</b> and paste your Supabase Project URL and anon key. ' +
      'If you already did, check that both values are inside the quotes and reload this page.</p></div>'
    );
  }

  /* ---------- home ---------- */
  function renderHome(signedIn) {
    root.innerHTML = shell(
      '<div class="stack-lg" style="padding-top:24px">' +
        '<div class="stack"><h1>Your car, your keys, our driver.</h1>' +
        '<p class="muted">Had a drink or too tired to drive? A trained driver comes to you and drives you and your car home.</p></div>' +
        '<a class="btn" href="' + (signedIn ? '#/book' : '#/login') + '">Book a driver</a>' +
        '<ul class="stack muted" style="padding-left:20px;margin:0">' +
          '<li>You see the fare before you confirm.</li>' +
          '<li>Every driver is approved by us before taking trips.</li>' +
          '<li>Pay the driver in cash.</li>' +
        '</ul>' +
      '</div>',
      signedIn ? '' : '<a class="link" href="#/login">Sign in</a>'
    );
  }

  /* ---------- login ---------- */
  function renderLogin() {
    var alive = true;
    var step = 'phone';
    var digits = '';
    var cooldown = 0;
    var timer = null;
    cleanup = function () { alive = false; clearInterval(timer); };

    function phone() { return '+91' + digits; }

    function showPhone() {
      step = 'phone';
      root.innerHTML = shell(
        '<form id="phoneForm" class="stack-lg">' +
          '<div class="stack"><h2>Enter your mobile number</h2><p class="muted">We will text you a 6-digit code.</p></div>' +
          '<div><label class="label" for="phone">Mobile number</label>' +
            '<div class="phone-row"><span class="phone-prefix">+91</span>' +
            '<input id="phone" class="input" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="98765 43210" value="' + esc(digits) + '"></div></div>' +
          '<p id="err" class="error"></p>' +
          '<button id="send" class="btn" type="submit">Send code</button>' +
        '</form>'
      );
      var input = $('#phone');
      input.addEventListener('input', function () {
        digits = input.value.replace(/\D/g, '').slice(0, 10);
        input.value = digits;
      });
      $('#phoneForm').addEventListener('submit', function (e) {
        e.preventDefault();
        sendOtp('#send');
      });
    }

    function showOtp() {
      step = 'otp';
      root.innerHTML = shell(
        '<form id="otpForm" class="stack-lg">' +
          '<div class="stack"><h2>Enter the code</h2><p class="muted">Sent to +91 ' + esc(digits) + '.</p></div>' +
          '<div><label class="label" for="otp">6-digit code</label>' +
            '<input id="otp" class="input otp-input" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="\u00B7\u00B7\u00B7\u00B7\u00B7\u00B7"></div>' +
          '<p id="err" class="error"></p>' +
          '<div class="stack">' +
            '<button id="verify" class="btn" type="submit">Verify and continue</button>' +
            '<div style="display:flex;justify-content:space-between">' +
              '<button id="change" type="button" class="link">Change number</button>' +
              '<button id="resend" type="button" class="link"></button>' +
            '</div>' +
          '</div>' +
        '</form>'
      );
      var otp = $('#otp');
      otp.addEventListener('input', function () {
        otp.value = otp.value.replace(/\D/g, '').slice(0, 6);
      });
      $('#otpForm').addEventListener('submit', function (e) {
        e.preventDefault();
        verifyOtp();
      });
      $('#change').addEventListener('click', showPhone);
      $('#resend').addEventListener('click', function () { sendOtp('#resend'); });
      drawResend();
      otp.focus();
    }

    function drawResend() {
      var b = $('#resend');
      if (!b) return;
      b.disabled = cooldown > 0;
      b.textContent = cooldown > 0 ? 'Resend code in ' + cooldown + 's' : 'Resend code';
    }

    function startCooldown() {
      cooldown = 30;
      clearInterval(timer);
      timer = setInterval(function () {
        cooldown -= 1;
        drawResend();
        if (cooldown <= 0) clearInterval(timer);
      }, 1000);
    }

    async function sendOtp(btnSel) {
      if (!/^[6-9]\d{9}$/.test(digits)) {
        setMsg('#err', 'Enter a valid 10-digit mobile number.');
        return;
      }
      setMsg('#err', '');
      var btn = $(btnSel);
      if (btn) btn.disabled = true;
      var res = await supa.auth.signInWithOtp({ phone: phone() });
      if (!alive) return;
      if (res.error) {
        if (btn) btn.disabled = false;
        setMsg('#err', 'We could not send the code. Check the number and try again.');
        return;
      }
      startCooldown();
      showOtp();
    }

    async function verifyOtp() {
      var token = $('#otp').value;
      if (!/^\d{6}$/.test(token)) {
        setMsg('#err', 'Enter the 6-digit code.');
        return;
      }
      setMsg('#err', '');
      var btn = $('#verify');
      btn.disabled = true;
      var res = await supa.auth.verifyOtp({ phone: phone(), token: token, type: 'sms' });
      if (!alive) return;
      if (res.error) {
        btn.disabled = false;
        setMsg('#err', 'That code did not work. Check it or request a new one.');
        return;
      }
      go('#/book');
    }

    showPhone();
  }

  /* ---------- places ---------- */
  async function searchPlaces(query) {
    var q = query.trim();
    if (q.length < 3) return [];
    var res = await fetch(
      NOMINATIM + '/search?format=jsonv2&limit=5&countrycodes=in&q=' + encodeURIComponent(q),
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) throw new Error('Place search failed. Please try again.');
    var data = await res.json();
    return data.map(function (d) {
      return { text: d.display_name, lat: parseFloat(d.lat), lng: parseFloat(d.lon) };
    });
  }

  async function reversePlace(lat, lng) {
    var fallback = { text: lat.toFixed(5) + ', ' + lng.toFixed(5), lat: lat, lng: lng };
    try {
      var res = await fetch(NOMINATIM + '/reverse?format=jsonv2&lat=' + lat + '&lon=' + lng, {
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) return fallback;
      var d = await res.json();
      return { text: d.display_name || fallback.text, lat: lat, lng: lng };
    } catch (e) {
      return fallback;
    }
  }

  function getPosition() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error('Location is not available on this device.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (p) { resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
        function () { reject(new Error('Could not get your location. Allow location access or search for the address.')); },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  // Draws one pickup/drop field into `el`. Returns a function that redraws it.
  function mountPlaceField(el, cfg) {
    function draw() {
      var value = cfg.get();
      if (value) {
        el.innerHTML =
          '<div class="chosen"><div><span class="label">' + esc(cfg.label) + '</span><p>' + esc(value.text) + '</p></div>' +
          '<button type="button" class="link" data-change>Change</button></div>';
        el.querySelector('[data-change]').addEventListener('click', function () { cfg.set(null); });
        return;
      }

      el.innerHTML =
        '<label class="label" for="' + cfg.id + '">' + esc(cfg.label) + '</label>' +
        '<form class="field-row" data-form>' +
          '<input id="' + cfg.id + '" class="input" placeholder="' + esc(cfg.placeholder) + '" autocomplete="off">' +
          '<button type="submit" class="btn-small" disabled>Search</button>' +
        '</form>' +
        (cfg.locate ? '<div class="field-actions"><button type="button" class="link" data-locate>Use my current location</button></div>' : '') +
        '<p class="error" data-msg style="margin-top:8px"></p>' +
        '<ul class="results" data-results></ul>';

      var form = el.querySelector('[data-form]');
      var input = form.querySelector('input');
      var btn = form.querySelector('button');
      var msg = el.querySelector('[data-msg]');
      var list = el.querySelector('[data-results]');

      input.addEventListener('input', function () {
        btn.disabled = input.value.trim().length < 3;
      });

      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (input.value.trim().length < 3) return;
        msg.textContent = '';
        msg.className = 'error';
        list.innerHTML = '';
        btn.disabled = true;
        btn.textContent = 'Searching';
        try {
          var places = await searchPlaces(input.value);
          if (!btn.isConnected) return;
          if (places.length === 0) {
            msg.className = 'hint';
            msg.textContent = 'No places found. Try adding the area or city.';
          }
          places.forEach(function (p) {
            var li = document.createElement('li');
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = p.text;
            b.addEventListener('click', function () { cfg.set(p); });
            li.appendChild(b);
            list.appendChild(li);
          });
        } catch (err) {
          if (btn.isConnected) msg.textContent = err.message;
        }
        if (btn.isConnected) {
          btn.textContent = 'Search';
          btn.disabled = input.value.trim().length < 3;
        }
      });

      var loc = el.querySelector('[data-locate]');
      if (loc) {
        loc.addEventListener('click', async function () {
          loc.disabled = true;
          loc.textContent = 'Finding you';
          try {
            await cfg.locate();
          } catch (err) {
            if (loc.isConnected) {
              msg.textContent = err.message;
              loc.disabled = false;
              loc.textContent = 'Use my current location';
            }
          }
        });
      }
    }
    draw();
    return draw;
  }

  /* ---------- book ---------- */
  async function renderBook() {
    var alive = true;
    cleanup = function () { alive = false; };
    root.innerHTML = shell('<p class="muted">Loading</p>');

    var tripsRes = await supa
      .from('trips')
      .select('id,status')
      .in('status', ['requested', 'accepted', 'arrived', 'started'])
      .order('created_at', { ascending: false })
      .limit(1);
    if (!alive) return;
    var active = tripsRes.data && tripsRes.data.length ? tripsRes.data[0] : null;

    var pickup = null, drop = null, quote = null, quoteErr = '', busy = false, quoteSeq = 0;
    var drawPickup, drawDrop;

    root.innerHTML = shell(
      '<div class="stack-lg">' +
        '<h2>Where should we take you?</h2>' +
        (active ? '<div class="banner"><p>You have a trip in progress.</p><a class="link" href="#/trip/' + esc(active.id) + '">View your trip</a></div>' : '') +
        '<div class="route">' +
          '<div class="stop stop-pickup" id="pickupBox"></div>' +
          '<div class="stop stop-drop" id="dropBox"></div>' +
        '</div>' +
        '<div id="fare" class="stack"></div>' +
        '<div><label class="label" for="car">Your car (optional)</label>' +
          '<input id="car" class="input" maxlength="100" placeholder="Model and number, like Swift KA01 AB 1234"></div>' +
        '<div><span class="label">Payment</span><div class="choice">' +
          '<div class="choice-option on">Cash to driver</div>' +
          '<div class="choice-option off">Online<small>Coming soon</small></div>' +
        '</div></div>' +
        '<p id="err" class="error"></p>' +
        '<button id="request" class="btn" type="button" disabled>Request a driver</button>' +
      '</div>',
      '<button id="signout" type="button" class="link">Sign out</button>'
    );

    $('#signout').addEventListener('click', async function () {
      await supa.auth.signOut();
      go('#/');
    });

    function drawFare() {
      var el = $('#fare');
      if (!el) return;
      if (!pickup || !drop) {
        el.innerHTML = '';
      } else if (quote) {
        el.innerHTML =
          '<div class="fare"><div><p class="muted">Estimated fare</p><p class="fare-amount">' + esc(rupees(quote.fare)) +
          '</p></div><p class="muted">About ' + esc(quote.distance_km) + ' km</p></div>';
      } else if (quoteErr) {
        el.innerHTML = '<p class="error">' + esc(quoteErr) + '</p>';
      } else {
        el.innerHTML = '<p class="muted">Calculating your fare</p>';
      }
      var btn = $('#request');
      if (btn) {
        btn.disabled = busy || !quote || !!active;
        btn.textContent = busy ? 'Requesting' : 'Request a driver';
      }
    }

    async function refreshQuote() {
      var my = ++quoteSeq;
      quote = null;
      quoteErr = '';
      drawFare();
      if (!pickup || !drop) return;
      var res = await supa.rpc('estimate_fare', {
        p_pickup_lat: pickup.lat, p_pickup_lng: pickup.lng,
        p_drop_lat: drop.lat, p_drop_lng: drop.lng
      });
      if (!alive || my !== quoteSeq) return;
      if (res.error) quoteErr = cleanError(res.error);
      else quote = res.data;
      drawFare();
    }

    function setPickup(v) { pickup = v; drawPickup(); refreshQuote(); }
    function setDrop(v) { drop = v; drawDrop(); refreshQuote(); }

    drawPickup = mountPlaceField($('#pickupBox'), {
      id: 'pickupInput', label: 'Pickup', placeholder: 'Search an address or landmark',
      get: function () { return pickup; },
      set: setPickup,
      locate: async function () {
        var pos = await getPosition();
        var place = await reversePlace(pos.lat, pos.lng);
        if (alive) setPickup(place);
      }
    });
    drawDrop = mountPlaceField($('#dropBox'), {
      id: 'dropInput', label: 'Drop', placeholder: 'Where is home?',
      get: function () { return drop; },
      set: setDrop
    });

    $('#request').addEventListener('click', async function () {
      if (!pickup || !drop || !quote || busy) return;
      busy = true;
      drawFare();
      setMsg('#err', '');
      var car = $('#car').value.trim();
      var res = await supa.rpc('request_trip', {
        p_pickup_text: pickup.text, p_pickup_lat: pickup.lat, p_pickup_lng: pickup.lng,
        p_drop_text: drop.text, p_drop_lat: drop.lat, p_drop_lng: drop.lng,
        p_payment_method: 'cash',
        p_car_details: car || null
      });
      if (!alive) return;
      if (res.error) {
        busy = false;
        drawFare();
        setMsg('#err', cleanError(res.error));
        return;
      }
      var trip = Array.isArray(res.data) ? res.data[0] : res.data;
      go('#/trip/' + trip.id);
    });

    drawFare();
  }

  /* ---------- trip ---------- */
  var STEPS = [
    ['requested', 'Finding a driver'],
    ['accepted', 'Driver on the way'],
    ['arrived', 'Driver has arrived'],
    ['started', 'On the way to your drop'],
    ['completed', 'Trip complete']
  ];
  var TITLES = {
    requested: 'Finding a driver',
    accepted: 'Your driver is on the way',
    arrived: 'Your driver has arrived',
    started: 'You are on your way',
    completed: 'You have arrived',
    cancelled: 'Trip cancelled'
  };

  function renderNotFound(message) {
    root.innerHTML = shell(
      '<div class="stack"><h2>We could not find this trip</h2>' +
      (message ? '<p class="error">' + esc(message) + '</p>' : '') +
      '<a class="btn" href="#/book">Book a driver</a></div>'
    );
  }

  function renderTrip(id) {
    var alive = true;
    var channel = null;
    var poll = null;
    var trip = null;
    var errMsg = '';
    var cancelling = false;
    cleanup = function () {
      alive = false;
      clearInterval(poll);
      if (channel) supa.removeChannel(channel);
    };

    if (!UUID_RE.test(id)) { renderNotFound(); return; }
    root.innerHTML = shell('<p class="muted">Loading</p>');

    function draw() {
      var idx = -1;
      STEPS.forEach(function (s, i) { if (s[0] === trip.status) idx = i; });
      var canCancel = trip.status === 'requested' || trip.status === 'accepted';
      var finished = trip.status === 'completed' || trip.status === 'cancelled';

      var progress = '';
      if (trip.status !== 'cancelled') {
        progress = '<ol class="progress">' + STEPS.map(function (s, i) {
          var cls = i < idx ? 'done' : i === idx ? 'now' : '';
          return '<li class="' + cls + '">' + esc(s[1]) + '</li>';
        }).join('') + '</ol>';
      }

      root.innerHTML = shell(
        '<div class="stack-lg">' +
          '<h1 class="status-title">' + esc(TITLES[trip.status] || 'Your trip') + '</h1>' +
          progress +
          '<dl class="detail" style="margin:0">' +
            '<dt>Pickup</dt><dd>' + esc(trip.pickup_text) + '</dd>' +
            '<dt>Drop</dt><dd>' + esc(trip.drop_text) + '</dd>' +
            (trip.car_details ? '<dt>Your car</dt><dd>' + esc(trip.car_details) + '</dd>' : '') +
            '<dt>Fare</dt><dd>' + esc(rupees(trip.fare)) + (trip.payment_method === 'cash' ? ', pay the driver in cash' : '') + '</dd>' +
          '</dl>' +
          (errMsg ? '<p class="error">' + esc(errMsg) + '</p>' : '') +
          (canCancel ? '<button id="cancel" type="button" class="btn-quiet"' + (cancelling ? ' disabled' : '') + '>' + (cancelling ? 'Cancelling' : 'Cancel trip') + '</button>' : '') +
          (finished ? '<a class="btn" href="#/book">Book another trip</a>' : '') +
        '</div>'
      );

      var cancelBtn = $('#cancel');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', async function () {
          errMsg = '';
          cancelling = true;
          draw();
          var res = await supa.rpc('cancel_trip', { p_trip_id: id });
          if (!alive) return;
          cancelling = false;
          if (res.error) errMsg = cleanError(res.error);
          else trip = Array.isArray(res.data) ? res.data[0] : res.data;
          draw();
        });
      }
    }

    async function load() {
      var res = await supa.from('trips').select('*').eq('id', id).maybeSingle();
      if (!alive) return;
      if (res.error) {
        if (!trip) renderNotFound('Could not load your trip. Check your connection.');
        return;
      }
      if (!res.data) { renderNotFound(); return; }
      var changed = !trip || trip.status !== res.data.status || trip.driver_id !== res.data.driver_id;
      trip = res.data;
      if (changed && !cancelling) draw();
    }

    load();

    // Live updates, with a slow refresh as a backup if the connection drops.
    channel = supa
      .channel('trip-' + id)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'trips', filter: 'id=eq.' + id },
        function (payload) {
          if (!alive) return;
          trip = payload.new;
          if (!cancelling) draw();
        })
      .subscribe();
    poll = setInterval(load, 10000);
  }

  /* ---------- start ---------- */
  window.addEventListener('hashchange', route);
  route();
})();
