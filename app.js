(function () {
  'use strict';

  var CFG = window.APP_CONFIG || {};
  var APP_NAME = CFG.APP_NAME || 'DriveMate';
  var root = document.getElementById('app');
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var NOMINATIM = 'https://nominatim.openstreetmap.org';
  var ACTIVE = ['requested', 'accepted', 'arrived', 'started'];
  var DRIVER_ACTIVE = ['accepted', 'arrived', 'started'];

  var supa = null;
  if (
    window.supabase &&
    typeof CFG.SUPABASE_URL === 'string' && CFG.SUPABASE_URL.indexOf('https://') === 0 &&
    typeof CFG.SUPABASE_ANON_KEY === 'string' && CFG.SUPABASE_ANON_KEY.length > 20 &&
    CFG.SUPABASE_ANON_KEY.indexOf('PASTE_') !== 0
  ) {
    supa = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  }

  var currentUid = null;
  var afterLogin = null;

  /* ---------- helpers ---------- */
  function $(sel) { return root.querySelector(sel); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function rupees(n) { return '\u20B9' + Number(n || 0).toLocaleString('en-IN'); }

  function cleanError(err) {
    if (err && err.code === 'P0001' && err.message) return err.message;
    if (err && (err.code === 'PGRST202' || err.code === '42883')) {
      return 'The latest database setup has not been run yet. Run database-stage2.txt in Supabase.';
    }
    return 'Something went wrong. Please try again.';
  }

  function phoneText(p) {
    if (!p) return '';
    return '+' + String(p).replace(/\D/g, '');
  }

  function telHref(p) { return 'tel:+' + String(p || '').replace(/\D/g, ''); }

  function ago(iso) {
    var s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return 'just now';
    var m = Math.floor(s / 60);
    if (m < 60) return m + ' min ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' h ago';
    return Math.floor(h / 24) + ' d ago';
  }

  function short(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '\u2026' : s;
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
    currentUid = session && session.user ? session.user.id : null;

    function needLogin() { afterLogin = hash; go('#/login'); }

    if (hash.indexOf('#/trip/') === 0) {
      if (!session) { needLogin(); return; }
      renderTrip(hash.slice(7));
    } else if (hash === '#/book') {
      if (!session) { needLogin(); return; }
      renderBook();
    } else if (hash === '#/drive') {
      if (!session) { needLogin(); return; }
      renderDrive();
    } else if (hash === '#/admin') {
      if (!session) { renderAdminPinLogin(); return; }
      renderAdmin();
    } else if (hash === '#/login') {
      if (session) { go(afterLogin || '#/book'); afterLogin = null; return; }
      renderLogin();
    } else {
      renderHome(!!session);
    }
  }

  /* ---------- setup notice ---------- */
  function renderSetup() {
    root.innerHTML = shell(
      '<div class="stack"><h2>One more step</h2>' +
      '<p class="muted">Open the file <b>config.js</b> and paste your Supabase Project URL and publishable key. ' +
      'If you already did, check that both values are inside the quotes and reload this page.</p></div>'
    );
  }

  /* ---------- home ---------- */
  async function renderHome(signedIn) {
    var alive = true;
    cleanup = function () { alive = false; };
    var st = null;
    if (signedIn) {
      var r = await supa.rpc('my_status');
      if (!alive) return;
      if (!r.error) st = r.data;
    }

    var extra = '';
    if (!signedIn) {
      extra = '<a class="btn-quiet as-link" href="#/drive">Become a driver</a>';
    } else if (st) {
      extra += '<a class="btn-quiet as-link" href="#/drive">' +
        (st.driver_status ? 'Driver dashboard' : 'Become a driver') + '</a>';
      if (st.role === 'admin') extra += '<a class="btn-quiet as-link" href="#/admin">Admin panel</a>';
    }

    root.innerHTML = shell(
      '<div class="stack-lg">' +
        '<section class="hero-grid">' +
          '<div class="hero-copy">' +
            '<span class="eyebrow">A smarter way to get home</span>' +
            '<h1>Your car. Your keys. A driver you can book.</h1>' +
            '<p class="muted">Get a driver to drive your own car when you would rather not take the wheel. Simple booking, clear fare estimates, and trip updates in one place.</p>' +
            '<div class="stack"><a class="btn" href="' + '#/book' + '">Book a driver <span aria-hidden="true">↗</span></a>' + extra + '</div>' +
            '<p class="hint">Designed for mobile. Works in your browser—no app install required.</p>' +
          '</div>' +
          '<aside class="hero-panel">' +
            '<div><span class="eyebrow">DriveMate essentials</span><h2 style="margin-top:12px">A calmer ride starts here.</h2></div>' +
            '<div class="stack">' +
              '<div class="hero-stat"><span class="hero-icon" aria-hidden="true">₹</span><div><b>Fare upfront</b><p class="muted">Review the estimate before confirming your request.</p></div></div>' +
              '<div class="hero-stat"><span class="hero-icon" aria-hidden="true">✓</span><div><b>Driver approval</b><p class="muted">Only drivers approved by the DriveMate team can accept trips.</p></div></div>' +
              '<div class="hero-stat"><span class="hero-icon" aria-hidden="true">↗</span><div><b>Trip updates</b><p class="muted">Follow the trip status from request to completion.</p></div></div>' +
            '</div>' +
            '<p class="hint">Always confirm driver details before handing over your vehicle.</p>' +
          '</aside>' +
        '</section>' +
        '<section class="section-block"><div class="section-heading"><div><span class="eyebrow">How it works</span><h2 style="margin-top:10px">Three simple steps</h2></div><p class="muted">Keep the process clear from pickup to drop-off.</p></div>' +
          '<div class="steps">' +
            '<article class="step-card"><h3>Choose your route</h3><p class="muted">Enter your pickup and destination to review your trip estimate.</p></article>' +
            '<article class="step-card"><h3>Confirm your request</h3><p class="muted">Submit the booking and watch for a driver to accept.</p></article>' +
            '<article class="step-card"><h3>Track the trip</h3><p class="muted">See trip status updates and contact details when available.</p></article>' +
          '</div>' +
        '</section>' +
        '<section class="section-block"><div class="section-heading"><div><span class="eyebrow">Built around confidence</span><h2 style="margin-top:10px">The details that matter</h2></div></div>' +
          '<div class="feature-grid">' +
            '<article class="feature-card"><span class="hero-icon" aria-hidden="true">◎</span><h3 style="margin-top:14px">Location search</h3><p>Search for pickup and drop-off places or use your device location when available.</p></article>' +
            '<article class="feature-card"><span class="hero-icon" aria-hidden="true">↗</span><h3 style="margin-top:14px">Driver workflow</h3><p>Drivers can apply, go online after approval, and update trip progress.</p></article>' +
            '<article class="feature-card"><span class="hero-icon" aria-hidden="true">▦</span><h3 style="margin-top:14px">Operations dashboard</h3><p>Authorized admins can review driver applications, trips, and fare settings.</p></article>' +
          '</div>' +
        '</section>' +
        '<footer class="site-footer"><span>© ' + new Date().getFullYear() + ' DriveMate</span><span>Drive safely. Arrive comfortably.</span></footer>' +
      '</div>',
      signedIn ? '<button id="signout" type="button" class="link">Sign out</button>' : '<a class="link" href="#/login">Sign in</a>'
    );

    var so = $('#signout');
    if (so) {
      so.addEventListener('click', async function () {
        await supa.auth.signOut();
        go('#/');
      });
    }
  }

  /* ---------- login ---------- */
  function renderLogin() {
    var alive = true;
    var digits = '';
    var cooldown = 0;
    var timer = null;
    cleanup = function () { alive = false; clearInterval(timer); };

    function phone() { return '+91' + digits; }

    function showPhone() {
      root.innerHTML = shell(
        '<section class="card stack-lg" style="max-width:560px;margin:0 auto">' +
          '<div class="stack"><span class="eyebrow">Secure sign-in</span><h2>Sign in with your mobile</h2><p class="muted">We will request a one-time code for your Indian mobile number. Keep the SIM phone nearby to read the SMS.</p></div>' +
          (afterLogin === '#/book' || (afterLogin && afterLogin.indexOf('#/trip/') === 0) ? '<div class="stack"><button id="guest" type="button" class="btn">Continue as customer — no OTP</button><p class="hint">Temporary guest access. No phone verification is required.</p></div><div class="divider"></div>' : '') +
          '<form id="phoneForm" class="stack">' +
            '<div><label class="label" for="phone">Mobile number</label>' +
              '<div class="phone-row"><span class="phone-prefix">+91</span>' +
              '<input id="phone" class="input" type="tel" inputmode="numeric" autocomplete="tel-national" autocorrect="off" spellcheck="false" maxlength="10" placeholder="98765 43210" value="' + esc(digits) + '" required></div></div>' +
            '<p id="err" class="error" role="alert" aria-live="polite"></p>' +
            '<button id="send" class="btn" type="submit">Send verification code</button>' +
          '</form>' +
          '<details class="help-panel"><summary>Not receiving the code?</summary><ul><li>The SMS goes to the phone number entered above, not automatically to this computer.</li><li>Check that the number and +91 country code are correct and that the SIM can receive SMS.</li><li>Wait a minute, then use the resend option if it appears.</li><li>If no SMS arrives, the site owner must check the Supabase Phone provider and SMS delivery logs.</li></ul></details>' +
        '</section>'
      );
      var guest = $('#guest');
      if (guest) {
        guest.addEventListener('click', async function () {
          guest.disabled = true;
          guest.textContent = 'Starting guest session…';
          setMsg('#err', '');
          try {
            var res = await supa.auth.signInAnonymously();
            if (!alive) return;
            if (res.error) {
              guest.disabled = false;
              guest.textContent = 'Continue as customer — no OTP';
              setMsg('#err', 'Guest sign-in is not enabled yet. In Supabase, open Authentication → Sign In / Providers and enable Anonymous Sign-Ins. Details: ' + (res.error.message || 'Request failed.'));
              return;
            }
            var next = afterLogin || '#/book';
            afterLogin = null;
            go(next);
          } catch (err) {
            if (!alive) return;
            guest.disabled = false;
            guest.textContent = 'Continue as customer — no OTP';
            setMsg('#err', 'Could not start a guest session. Check the Supabase connection and enable Anonymous Sign-Ins. ' + (err && err.message ? err.message : ''));
          }
        });
      }
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
      root.innerHTML = shell(
        '<section class="card stack-lg" style="max-width:560px;margin:0 auto">' +
          '<div class="stack"><span class="eyebrow">One more step</span><h2>Enter your verification code</h2><p class="muted">The SMS will arrive on the phone using <b>+91 ' + esc(digits) + '</b>. On another computer, enter the code from that phone manually.</p></div>' +
          '<form id="otpForm" class="stack">' +
            '<div><label class="label" for="otp">6-digit code</label>' +
              '<input id="otp" class="input otp-input" type="text" inputmode="numeric" autocomplete="one-time-code" autocapitalize="off" maxlength="6" pattern="[0-9]{6}" placeholder="••••••" required></div>' +
            '<p id="err" class="error" role="alert" aria-live="polite"></p>' +
            '<button id="verify" class="btn" type="submit">Verify and continue</button>' +
            '<div class="row-between"><button id="change" type="button" class="link">Change number</button><button id="resend" type="button" class="link"></button></div>' +
          '</form>' +
          '<details class="help-panel"><summary>Still no SMS?</summary><ul><li>Check the SMS inbox on the SIM phone, not the computer where DriveMate is open.</li><li>Confirm that the same number entered on this screen is the one receiving SMS.</li><li>Wait for the resend countdown to finish before requesting another code.</li><li>If the provider returns a DLT, sender ID, or template error, the website owner must fix the SMS provider setup in Supabase.</li></ul></details>' +
        '</section>'
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

    function authErrorMessage(err, mode) {
      var raw = String((err && (err.message || err.msg || err.error_description)) || '');
      var low = raw.toLowerCase();
      if (/\bdlt\b|entity.?id|template.?id|sender.?id|senderid|telecom|sms provider|message template/.test(low)) {
        return 'SMS delivery is blocked by the SMS provider’s DLT sender/template registration. Register and approve the sender ID and OTP template with your SMS provider, then check the Phone provider settings in Supabase. This cannot be fixed from website code alone.';
      }
      if (/phone.*not.*enabled|phone.*provider.*disabled|unsupported phone/.test(low)) {
        return 'Phone sign-in is not enabled for this Supabase project. Enable Phone authentication in Supabase → Authentication → Sign In / Providers, then configure an SMS provider.';
      }
      if (/rate.?limit|too many requests|request rate/.test(low)) {
        return 'Too many OTP requests were made. Wait a few minutes before trying again.';
      }
      if (/invalid.*phone|phone.*invalid|unable to validate phone/.test(low)) {
        return 'The phone number was rejected. Enter your 10-digit Indian mobile number and confirm the +91 country code.';
      }
      if (/not registered|user not found|no user/.test(low)) {
        return 'The authentication service says this phone number is not registered. Check the Supabase Phone provider and whether new-user sign-up is allowed. Phone OTP sign-in normally creates a user unless sign-up has been disabled.';
      }
      if (/network|fetch|timeout|load failed/.test(low)) {
        return 'Could not reach the authentication service. Check your internet connection and try again.';
      }
      return (mode === 'verify'
        ? 'OTP verification failed. Check the latest 6-digit code or request a new one.'
        : 'We could not send the OTP. Check the number and the Supabase SMS provider settings.')
        + (raw ? ' Technical detail: ' + raw : '');
    }

    async function sendOtp(btnSel) {
      if (!/^[6-9]\d{9}$/.test(digits)) {
        setMsg('#err', 'Enter a valid 10-digit Indian mobile number.');
        return;
      }
      setMsg('#err', '');
      var btn = $(btnSel);
      var originalLabel = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Sending code…'; }
      setMsg('#err', 'Contacting the authentication service…');
      try {
        var res = await supa.auth.signInWithOtp({ phone: phone(), options: { shouldCreateUser: true } });
        if (!alive) return;
        if (res.error) {
          if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
          setMsg('#err', authErrorMessage(res.error, 'send'));
          return;
        }
        startCooldown();
        showOtp();
        setMsg('#err', '');
      } catch (err) {
        if (!alive) return;
        if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
        setMsg('#err', authErrorMessage(err, 'send'));
      }
    }

    async function verifyOtp() {
      var otpInput = $('#otp');
      var token = otpInput ? otpInput.value : '';
      if (!/^\d{6}$/.test(token)) {
        setMsg('#err', 'Enter the 6-digit code.');
        return;
      }
      setMsg('#err', '');
      var btn = $('#verify');
      if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }
      try {
        var res = await supa.auth.verifyOtp({ phone: phone(), token: token, type: 'sms' });
        if (!alive) return;
        if (res.error) {
          if (btn) { btn.disabled = false; btn.textContent = 'Verify and continue'; }
          setMsg('#err', authErrorMessage(res.error, 'verify'));
          return;
        }
        var next = afterLogin || '#/book';
        afterLogin = null;
        go(next);
      } catch (err) {
        if (!alive) return;
        if (btn) { btn.disabled = false; btn.textContent = 'Verify and continue'; }
        setMsg('#err', authErrorMessage(err, 'verify'));
      }
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
      .in('status', ACTIVE)
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

  /* ---------- customer trip ---------- */
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
    var people = null;
    var peopleFor = null;
    var errMsg = '';
    var cancelling = false;
    cleanup = function () {
      alive = false;
      clearInterval(poll);
      if (channel) supa.removeChannel(channel);
    };

    if (!UUID_RE.test(id)) { renderNotFound(); return; }
    root.innerHTML = shell('<p class="muted">Loading</p>');

    async function syncPeople() {
      if (!trip || !trip.driver_id) { people = null; peopleFor = null; return; }
      if (peopleFor === trip.driver_id) return;
      peopleFor = trip.driver_id;
      var r = await supa.rpc('trip_people', { p_trip_id: id });
      if (!alive) return;
      if (!r.error) { people = r.data; draw(); }
    }

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

      var driverLine = '';
      if (trip.driver_id && people && trip.status !== 'cancelled') {
        driverLine = '<dt>Your driver</dt><dd>' + esc(people.driver_name || 'Driver') +
          (people.driver_phone ? ' \u00B7 <a class="link" href="' + telHref(people.driver_phone) + '">Call ' + esc(phoneText(people.driver_phone)) + '</a>' : '') +
          '</dd>';
      }

      root.innerHTML = shell(
        '<div class="stack-lg">' +
          '<h1 class="status-title">' + esc(TITLES[trip.status] || 'Your trip') + '</h1>' +
          progress +
          '<dl class="detail" style="margin:0">' +
            driverLine +
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
      syncPeople();
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
          syncPeople();
          if (!cancelling) draw();
        })
      .subscribe();
    poll = setInterval(load, 8000);
  }

  /* ---------- driver dashboard ---------- */
  async function renderDrive() {
    var alive = true;
    var poll = null;
    var lastHtml = '';
    var st = null, active = null, open = [], people = null;
    var err = '', busy = false, fatal = '';
    cleanup = function () { alive = false; clearInterval(poll); };
    root.innerHTML = shell('<p class="muted">Loading</p>');

    async function fetchAll(quiet) {
      var s = await supa.rpc('my_status');
      if (!alive) return;
      if (s.error) {
        if (!quiet) fatal = cleanError(s.error);
        return;
      }
      fatal = '';
      st = s.data;
      var nextActive = null, nextOpen = [], nextPeople = null;
      if (st.driver_status === 'approved') {
        var a = await supa.from('trips').select('*').in('status', DRIVER_ACTIVE).eq('driver_id', currentUid).limit(1);
        if (!alive) return;
        if (!a.error && a.data && a.data.length) nextActive = a.data[0];
        if (nextActive) {
          var p = await supa.rpc('trip_people', { p_trip_id: nextActive.id });
          if (!alive) return;
          if (!p.error) nextPeople = p.data;
        } else if (st.online) {
          var o = await supa.rpc('list_open_trips');
          if (!alive) return;
          if (!o.error && Array.isArray(o.data)) nextOpen = o.data;
        }
      }
      active = nextActive;
      open = nextOpen;
      people = nextPeople;
    }

    function applyForm() {
      var top = st.driver_status === 'rejected'
        ? '<div class="banner"><p>Your last application was not approved. You can apply again with correct details.</p></div>'
        : '<div class="stack"><h2>Drive with us</h2><p class="muted">Tell us a little about you. We review every application before you can take trips.</p></div>';
      return '<form id="applyForm" class="stack-lg">' + top +
        '<div><label class="label" for="dName">Full name</label><input id="dName" class="input" autocomplete="name" maxlength="80"></div>' +
        '<div><label class="label" for="dLic">Driving licence number</label>' +
          '<input id="dLic" class="input" autocapitalize="characters" autocomplete="off" maxlength="30">' +
          '<p class="hint" style="margin-top:6px">Only our team can see this.</p></div>' +
        '<p id="err" class="error"></p>' +
        '<button id="applyBtn" class="btn" type="submit">Apply to drive</button>' +
        '</form>';
    }

    function pendingView() {
      return '<div class="card stack"><h3>Application received</h3>' +
        '<p class="muted">Thanks' + (st.driver_name ? ', ' + esc(st.driver_name) : '') +
        '. We are reviewing your details. This page updates by itself once you are approved.</p></div>';
    }

    function requestCard(t) {
      return '<div class="card stack">' +
        '<div class="row-between"><span class="fare-amount-sm">' + esc(rupees(t.fare)) + '</span><span class="muted">' + esc(t.distance_km) + ' km</span></div>' +
        '<div><p class="label">Pickup</p><p>' + esc(t.pickup_text) + '</p></div>' +
        '<div><p class="label">Drop</p><p>' + esc(t.drop_text) + '</p></div>' +
        (t.car_details ? '<p class="muted">Car: ' + esc(t.car_details) + '</p>' : '') +
        '<button class="btn" type="button" data-accept="' + esc(t.id) + '"' + (busy ? ' disabled' : '') + '>Accept trip</button>' +
        '<p class="hint">Requested ' + esc(ago(t.created_at)) + '</p>' +
        '</div>';
    }

    function activeView() {
      var t = active;
      var titles = { accepted: 'Go to the customer', arrived: 'Waiting for the customer', started: 'Driving to the drop' };
      var dest = t.status === 'started' ? [t.drop_lat, t.drop_lng] : [t.pickup_lat, t.pickup_lng];
      var maps = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest[0] + ',' + dest[1]);
      var dis = busy ? ' disabled' : '';
      var h = '<div class="card stack"><h3>' + esc(titles[t.status] || 'Trip') + '</h3>' +
        '<dl class="detail" style="margin:0">' +
          '<dt>Pickup</dt><dd>' + esc(t.pickup_text) + '</dd>' +
          '<dt>Drop</dt><dd>' + esc(t.drop_text) + '</dd>' +
          (t.car_details ? '<dt>Customer car</dt><dd>' + esc(t.car_details) + '</dd>' : '') +
          (people && people.customer_phone
            ? '<dt>Customer</dt><dd>' + esc(people.customer_name || 'Customer') + ' \u00B7 <a class="link" href="' + telHref(people.customer_phone) + '">Call ' + esc(phoneText(people.customer_phone)) + '</a></dd>'
            : '') +
          '<dt>Fare</dt><dd>' + esc(rupees(t.fare)) + (t.payment_method === 'cash' ? ', collect in cash' : '') + '</dd>' +
        '</dl>' +
        '<a class="btn-quiet as-link" target="_blank" rel="noopener" href="' + maps + '">Open in Maps</a>';
      if (t.status === 'accepted') {
        h += '<button class="btn" type="button" data-step="arrived"' + dis + '>I have arrived</button>' +
          '<button class="btn-quiet" type="button" data-release="1"' + dis + '>Release trip</button>';
      } else if (t.status === 'arrived') {
        h += '<button class="btn" type="button" data-step="started"' + dis + '>Start trip</button>';
      } else if (t.status === 'started') {
        h += '<p class="hint">Collect ' + esc(rupees(t.fare)) + ' in cash before you complete the trip.</p>' +
          '<button class="btn" type="button" data-step="completed"' + dis + '>Complete trip</button>';
      }
      return h + '</div>';
    }

    function approvedView() {
      var h = '<div class="row-between"><p>' + esc(st.driver_name || 'Driver') + '</p>' +
        '<span class="badge ' + (st.online ? 'ok' : '') + '">' + (st.online ? 'Online' : 'Offline') + '</span></div>';
      if (!active) {
        h += '<button id="toggle" class="' + (st.online ? 'btn-quiet' : 'btn') + '" type="button"' + (busy ? ' disabled' : '') + '>' +
          (st.online ? 'Go offline' : 'Go online') + '</button>';
      }
      if (err) h += '<p class="error">' + esc(err) + '</p>';
      if (active) h += activeView();
      else if (st.online) {
        if (open.length === 0) h += '<p class="muted">No trip requests right now. New ones appear here by themselves.</p>';
        else h += open.map(requestCard).join('');
      } else {
        h += '<p class="muted">You are offline. Go online to see trip requests.</p>';
      }
      return '<div class="stack">' + h + '</div>';
    }

    function draw() {
      var body;
      if (fatal) {
        body = '<p class="error">' + esc(fatal) + '</p><button id="retry" class="btn-quiet" type="button">Try again</button>';
      } else if (!st) {
        body = '<p class="muted">Loading</p>';
      } else if (!st.driver_status || st.driver_status === 'rejected') {
        body = applyForm();
      } else if (st.driver_status === 'pending') {
        body = pendingView();
      } else {
        body = approvedView();
      }
      var html = shell('<div class="stack-lg"><div id="body">' + body + '</div></div>');
      if (html === lastHtml) return;
      lastHtml = html;
      root.innerHTML = html;
      wire();
    }

    function wire() {
      var retry = $('#retry');
      if (retry) retry.addEventListener('click', function () { lastHtml = ''; refresh(); });
      var form = $('#applyForm');
      if (form) form.addEventListener('submit', onApply);
      var b = $('#body');
      if (b) b.addEventListener('click', onClick);
    }

    async function refresh() {
      await fetchAll(false);
      if (alive) draw();
    }

    async function onApply(e) {
      e.preventDefault();
      var name = $('#dName').value;
      var lic = $('#dLic').value;
      var btn = $('#applyBtn');
      setMsg('#err', '');
      btn.disabled = true;
      var r = await supa.rpc('apply_driver', { p_full_name: name, p_license: lic });
      if (!alive) return;
      if (r.error) {
        btn.disabled = false;
        setMsg('#err', cleanError(r.error));
        return;
      }
      lastHtml = '';
      await refresh();
    }

    async function act(fn) {
      if (busy) return;
      busy = true;
      err = '';
      draw();
      var res = await fn();
      if (!alive) return;
      busy = false;
      if (res && res.error) err = cleanError(res.error);
      await fetchAll(false);
      if (alive) draw();
    }

    function onClick(e) {
      var el = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!el || el.disabled) return;
      if (el.id === 'toggle') {
        act(function () { return supa.rpc('driver_set_online', { p_online: !st.online }); });
        return;
      }
      var acc = el.getAttribute('data-accept');
      if (acc) {
        act(function () { return supa.rpc('accept_trip', { p_trip_id: acc }); });
        return;
      }
      var step = el.getAttribute('data-step');
      if (step && active) {
        var tid = active.id;
        act(function () { return supa.rpc('advance_trip', { p_trip_id: tid, p_to: step }); });
        return;
      }
      if (el.getAttribute('data-release') && active) {
        if (!window.confirm('Release this trip? The customer will be matched with another driver.')) return;
        var rid = active.id;
        act(function () { return supa.rpc('driver_release_trip', { p_trip_id: rid }); });
      }
    }

    await fetchAll(false);
    if (!alive) return;
    draw();
    poll = setInterval(function () {
      if (busy || !st) return;
      if (st.driver_status !== 'approved' && st.driver_status !== 'pending') return;
      fetchAll(true).then(function () { if (alive && !busy) draw(); });
    }, 5000);
  }

  /* ---------- admin PIN login ---------- */
  function renderAdminPinLogin() {
    var alive = true;
    cleanup = function () { alive = false; };
    root.innerHTML = shell(
      '<section class="card stack-lg" style="max-width:560px;margin:0 auto">' +
        '<div class="stack"><span class="eyebrow">Admin access</span><h2>Enter admin PIN</h2>' +
        '<p class="muted">Use the private admin PIN to continue. No SMS OTP is required.</p></div>' +
        '<form id="adminPinForm" class="stack">' +
          '<div><label class="label" for="adminPin">Admin PIN</label>' +
          '<input id="adminPin" class="input" type="password" inputmode="numeric" autocomplete="current-password" maxlength="64" required></div>' +
          '<p id="adminPinErr" class="error" role="alert" aria-live="polite"></p>' +
          '<button id="adminPinSubmit" class="btn" type="submit">Unlock admin panel</button>' +
          '<a class="btn-quiet as-link" href="#/">Back home</a>' +
        '</form>' +
      '</section>'
    );
    var form = $('#adminPinForm');
    var pinInput = $('#adminPin');
    if (pinInput) pinInput.focus();
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!alive) return;
      var pin = pinInput.value;
      if (!pin) { setMsg('#adminPinErr', 'Enter your admin PIN.'); return; }
      var btn = $('#adminPinSubmit');
      btn.disabled = true;
      btn.textContent = 'Verifying…';
      setMsg('#adminPinErr', '');
      try {
        var response = await fetch(CFG.SUPABASE_URL + '/functions/v1/admin-pin-login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': CFG.SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + CFG.SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ pin: pin })
        });
        var result = await response.json().catch(function () { return {}; });
        if (!alive) return;
        if (!response.ok || !result.session || !result.session.access_token || !result.session.refresh_token) {
          btn.disabled = false;
          btn.textContent = 'Unlock admin panel';
          setMsg('#adminPinErr', result.error || 'PIN verification failed. Check the PIN or try again later.');
          return;
        }
        var sessionResult = await supa.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token
        });
        if (!alive) return;
        if (sessionResult.error) {
          btn.disabled = false;
          btn.textContent = 'Unlock admin panel';
          setMsg('#adminPinErr', 'The admin session could not be started. Please try again.');
          return;
        }
        go('#/admin');
      } catch (err) {
        if (!alive) return;
        btn.disabled = false;
        btn.textContent = 'Unlock admin panel';
        setMsg('#adminPinErr', 'Could not reach the secure PIN service. Confirm the Edge Function is deployed and try again.');
      }
    });
  }

  /* ---------- admin ---------- */
  async function renderAdmin() {
    var alive = true;
    cleanup = function () { alive = false; };
    root.innerHTML = shell('<p class="muted">Loading</p>');

    var me = await supa.rpc('my_status');
    if (!alive) return;
    if (me.error || !me.data || me.data.role !== 'admin') {
      root.innerHTML = shell(
        '<div class="stack"><h2>Admins only</h2><p class="muted">This page is for the ' + esc(APP_NAME) + ' team.</p>' +
        '<a class="btn" href="#/">Back home</a></div>'
      );
      return;
    }

    var drivers = [], trips = [], stats = {}, pricing = null, notice = '', errMsg = '';

    async function loadAll() {
      var r = await Promise.all([
        supa.rpc('admin_list_drivers'),
        supa.rpc('admin_list_trips', { p_limit: 30 }),
        supa.rpc('admin_stats'),
        supa.from('pricing').select('*').eq('id', 1).maybeSingle()
      ]);
      if (!alive) return;
      errMsg = '';
      for (var i = 0; i < 4; i++) {
        if (r[i].error) errMsg = cleanError(r[i].error);
      }
      drivers = Array.isArray(r[0].data) ? r[0].data : [];
      trips = Array.isArray(r[1].data) ? r[1].data : [];
      stats = r[2].data || {};
      pricing = r[3].data || null;
    }

    function stat(label, value) {
      return '<div class="stat"><b>' + esc(value) + '</b><span class="muted">' + esc(label) + '</span></div>';
    }

    function driverCard(d) {
      var cls = d.status === 'approved' ? 'ok' : d.status === 'pending' ? 'warn' : 'bad';
      var btns = '';
      if (d.status !== 'approved') {
        btns += '<button class="btn-small" type="button" data-driver="' + esc(d.user_id) + '" data-status="approved">Approve</button>';
      }
      if (d.status === 'pending') {
        btns += '<button class="btn-small" type="button" data-driver="' + esc(d.user_id) + '" data-status="rejected">Reject</button>';
      }
      if (d.status === 'approved') {
        btns += '<button class="btn-small" type="button" data-driver="' + esc(d.user_id) + '" data-status="rejected">Suspend</button>';
      }
      return '<div class="card stack">' +
        '<div class="row-between"><b>' + esc(d.full_name) + '</b><span class="badge ' + cls + '">' + esc(d.status) + (d.online ? ' \u00B7 online' : '') + '</span></div>' +
        '<p class="muted">' + esc(phoneText(d.phone) || 'No phone') + ' \u00B7 Licence ' + esc(d.license_number) + '</p>' +
        '<div class="btn-row">' + btns + '</div></div>';
    }

    function tripRow(t) {
      return '<div class="card stack">' +
        '<div class="row-between"><span class="badge">' + esc(t.status) + '</span><b>' + esc(rupees(t.fare)) + '</b></div>' +
        '<p>' + esc(short(t.pickup_text, 40)) + ' \u2192 ' + esc(short(t.drop_text, 40)) + '</p>' +
        '<p class="hint">' + esc(phoneText(t.customer_phone) || 'Customer') + ' \u00B7 ' + esc(t.driver_name || 'No driver yet') +
        ' \u00B7 ' + esc(t.payment_method) + (t.payment_status === 'paid' ? ' paid' : '') + ' \u00B7 ' + esc(ago(t.created_at)) + '</p>' +
        '</div>';
    }

    function pricingForm() {
      if (!pricing) return '<p class="muted">Pricing is not available.</p>';
      function field(id, label, val) {
        return '<div><label class="label" for="' + id + '">' + esc(label) + '</label>' +
          '<input id="' + id + '" class="input" type="number" inputmode="decimal" min="0" step="any" value="' + esc(val) + '"></div>';
      }
      return '<form id="pricingForm" class="stack">' +
        field('pf_base', 'Base fare (\u20B9)', pricing.base_fare) +
        field('pf_basekm', 'Distance covered by base fare (km)', pricing.base_km) +
        field('pf_perkm', 'Price per extra km (\u20B9)', pricing.per_km) +
        field('pf_night', 'Night extra, 10 pm to 6 am (%)', pricing.night_surcharge_pct) +
        '<p id="pErr" class="error"></p>' +
        '<button class="btn" type="submit">Save pricing</button></form>';
    }

    function draw() {
      var pending = drivers.filter(function (d) { return d.status === 'pending'; });
      var others = drivers.filter(function (d) { return d.status !== 'pending'; });
      root.innerHTML = shell(
        '<div class="stack-lg" id="adminBody">' +
          '<div class="row-between"><h2>Admin</h2><button id="reload" type="button" class="link">Refresh</button></div>' +
          (errMsg ? '<p class="error">' + esc(errMsg) + '</p>' : '') +
          (notice ? '<div class="banner"><p>' + esc(notice) + '</p></div>' : '') +
          '<div class="stats">' +
            stat('Trips in total', stats.trips_total || 0) +
            stat('Active now', stats.trips_active || 0) +
            stat('Completed', stats.trips_completed || 0) +
            stat('Cash collected', rupees(stats.cash_collected || 0)) +
            stat('Drivers approved', stats.drivers_approved || 0) +
            stat('Drivers online', stats.drivers_online || 0) +
          '</div>' +
          '<div class="stack"><h3>Driver applications (' + pending.length + ')</h3>' +
            (pending.length ? pending.map(driverCard).join('') : '<p class="muted">No applications waiting.</p>') + '</div>' +
          '<div class="stack"><h3>Drivers</h3>' +
            (others.length ? others.map(driverCard).join('') : '<p class="muted">No drivers yet.</p>') + '</div>' +
          '<div class="stack"><h3>Pricing</h3>' + pricingForm() + '</div>' +
          '<div class="stack"><h3>Recent trips</h3>' +
            (trips.length ? trips.map(tripRow).join('') : '<p class="muted">No trips yet.</p>') + '</div>' +
        '</div>'
      );

      var body = $('#adminBody');
      if (body) body.addEventListener('click', onClick);
      var rl = $('#reload');
      if (rl) rl.addEventListener('click', reload);
      var pf = $('#pricingForm');
      if (pf) pf.addEventListener('submit', onSavePricing);
    }

    async function reload() {
      await loadAll();
      if (alive) draw();
    }

    async function onClick(e) {
      var el = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!el || el.disabled) return;
      var uid = el.getAttribute('data-driver');
      var status = el.getAttribute('data-status');
      if (!uid || !status) return;
      el.disabled = true;
      var r = await supa.rpc('admin_set_driver_status', { p_user_id: uid, p_status: status });
      if (!alive) return;
      notice = r.error ? '' : 'Driver updated.';
      await loadAll();
      if (!alive) return;
      if (r.error) errMsg = cleanError(r.error);
      draw();
    }

    async function onSavePricing(e) {
      e.preventDefault();
      var vals = [$('#pf_base').value, $('#pf_basekm').value, $('#pf_perkm').value, $('#pf_night').value].map(parseFloat);
      if (vals.some(function (v) { return isNaN(v); })) {
        setMsg('#pErr', 'Enter a number in every box.');
        return;
      }
      setMsg('#pErr', '');
      var r = await supa.rpc('admin_update_pricing', {
        p_base_fare: vals[0], p_base_km: vals[1], p_per_km: vals[2], p_night_pct: vals[3]
      });
      if (!alive) return;
      if (r.error) {
        setMsg('#pErr', cleanError(r.error));
        return;
      }
      notice = 'Pricing saved. New bookings use it right away.';
      await loadAll();
      if (alive) draw();
    }

    await loadAll();
    if (!alive) return;
    draw();
  }

  /* ---------- start ---------- */
  window.addEventListener('hashchange', route);
  route();
})();
