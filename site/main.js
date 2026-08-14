/* Steel City Chemistry — ACS Pittsburgh Local Section
   No dependencies. Everything degrades gracefully without JS. */
(function () {
  'use strict';

  /* ---------- mobile nav ---------- */
  var toggle = document.getElementById('navToggle');
  var nav = document.getElementById('primaryNav');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    // Close after choosing a destination on mobile.
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a') && nav.classList.contains('is-open')) {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  /* ---------- header shadow once scrolled ---------- */
  var header = document.getElementById('siteHeader');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-stuck', window.scrollY > 8);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- nav active-section highlighting ---------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav__list a[href^="#"]'));
  var sections = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    var setCurrent = function (id) {
      navLinks.forEach(function (a) {
        a.classList.toggle('is-current', a.getAttribute('href') === '#' + id);
      });
    };
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setCurrent(entry.target.id);
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ---------- speaker category filter ---------- */
  var filters = Array.prototype.slice.call(document.querySelectorAll('.filter'));
  var grid = document.getElementById('speakerGrid');
  var empty = document.getElementById('filterEmpty');

  if (filters.length && grid) {
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.person'));

    filters.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var want = btn.dataset.filter;
        var shown = 0;

        filters.forEach(function (b) {
          var active = b === btn;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-pressed', String(active));
        });

        cards.forEach(function (card) {
          var match = want === 'all' || card.dataset.cat === want;
          card.hidden = !match;
          if (match) shown++;
        });

        if (empty) empty.hidden = shown > 0;
      });
    });
  }

  /* ---------- registration form → Google Sheet ----------
     Posts to an Apps Script web app which appends a row to
     "Steel City Chemistry — Registrations". Paste the /exec URL below.
     While ENDPOINT is empty the form refuses to submit and says so, rather
     than pretending to succeed and dropping someone's registration. */
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbwrkFTDmgnfayN0bySO9RkM-AvvN9EK2xHB-PzK7mMKMaCpi2drPYNk3XuykGpb80gk6Q/exec';

  /* Flat fee per attendee, in USD. Keep in step with REGISTRATION_FEE in
     apps-script/Code.gs — the sheet records what the site quoted. */
  var FEE = 0; // TODO: confirm the registration fee with Ronghong

  var regForm = document.getElementById('registrationForm');
  var status = document.getElementById('formStatus');

  /* ---------- attendee blocks ---------- */
  var attendeeBox = document.getElementById('attendees');
  var template = document.getElementById('attendeeTemplate');
  var addBtn = document.getElementById('addAttendee');
  var totalEl = document.getElementById('formTotal');
  var MAX_ATTENDEES = 25;   // Mirrors the cap in the Apps Script.

  function attendeeCount() {
    return attendeeBox ? attendeeBox.querySelectorAll('.attendee').length : 0;
  }

  function relabel() {
    var blocks = attendeeBox.querySelectorAll('.attendee');
    for (var i = 0; i < blocks.length; i++) {
      var title = blocks[i].querySelector('.attendee__title');
      title.textContent = i === 0
        ? 'Your details'
        : 'Additional attendee ' + i;
      // Only additional attendees can be removed; the first is the registrant.
      blocks[i].querySelector('.attendee__remove').hidden = (i === 0);
    }
    if (addBtn) addBtn.disabled = blocks.length >= MAX_ATTENDEES;
    updateTotal();
  }

  function updateTotal() {
    if (!totalEl) return;
    var n = attendeeCount();
    var people = n + (n === 1 ? ' person' : ' people');
    if (FEE > 0) {
      totalEl.textContent = 'Total: ' + people + ' × $' + FEE + ' = $' + (n * FEE);
    } else {
      // No fee configured yet — still tell people how many they're registering.
      totalEl.textContent = 'Registering ' + people + '.';
    }
  }

  function addAttendee() {
    if (!template || attendeeCount() >= MAX_ATTENDEES) return;
    // Index by a counter that never reuses numbers, so field names stay unique
    // even after removals.
    var idx = attendeeBox.dataset.next ? parseInt(attendeeBox.dataset.next, 10) : 0;
    attendeeBox.dataset.next = idx + 1;

    var markup = template.innerHTML.replace(/\{\{i\}\}/g, String(idx));
    var wrap = document.createElement('div');
    wrap.innerHTML = markup;
    var block = wrap.firstElementChild;

    block.querySelector('.attendee__remove').addEventListener('click', function () {
      block.remove();
      renumber();
    });

    attendeeBox.appendChild(block);
    relabel();
    return block;
  }

  /* Field names must be a0_, a1_, a2_… with no gaps, because the Apps Script
     walks the indices in order. Rewrite them after any removal. */
  function renumber() {
    var blocks = attendeeBox.querySelectorAll('.attendee');
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      block.dataset.index = i;
      var named = block.querySelectorAll('[name]');
      for (var n = 0; n < named.length; n++) {
        named[n].name = named[n].name.replace(/^a\d+_/, 'a' + i + '_');
      }
      var ids = block.querySelectorAll('[id]');
      for (var d = 0; d < ids.length; d++) {
        var oldId = ids[d].id;
        var newId = oldId.replace(/^a\d+-/, 'a' + i + '-');
        ids[d].id = newId;
        var label = block.querySelector('label[for="' + oldId + '"]');
        if (label) label.setAttribute('for', newId);
      }
    }
    attendeeBox.dataset.next = blocks.length;
    relabel();
  }

  if (attendeeBox && template) {
    addAttendee();                       // The registrant's own block.
    if (addBtn) addBtn.addEventListener('click', function () {
      var block = addAttendee();
      if (block) block.querySelector('input[type="text"]').focus();
    });
  }

  if (regForm) {
    var setStatus = function (msg, kind) {
      status.textContent = msg;
      status.className = 'form__status form__status--' + kind;
      status.hidden = false;
    };

    regForm.addEventListener('submit', function (e) {
      e.preventDefault();

      if (!regForm.reportValidity()) return;

      if (!ENDPOINT) {
        setStatus('Registration is not connected yet — please check back shortly.', 'error');
        return;
      }

      var submitBtn = regForm.querySelector('.btn--submit');
      var original = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
      setStatus('Sending your registration…', 'pending');

      /* The group id is generated here, not server-side: the request is sent
         no-cors so the response body is unreadable, and the confirmation page
         needs the id to show the registrant and to tag the PayPal payment. */
      var count = attendeeCount();
      var groupId = 'SCC-' +
        Date.now().toString(36).toUpperCase().slice(-5) +
        Math.random().toString(36).toUpperCase().slice(2, 4);

      var payload = new URLSearchParams(new FormData(regForm));
      payload.set('group-id', groupId);
      payload.set('count', String(count));

      /* Apps Script redirects through a googleusercontent.com domain that does
         not send CORS headers, so the response is unreadable from here — hence
         no-cors. The request itself still lands. Form-encoding matters twice
         over: it is a "simple" content type so no preflight is sent (Apps
         Script would reject one), and it is what populates e.parameter in
         doPost. Sending text/plain would deliver an empty parameter object. */
      fetch(ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: payload.toString()
      })
        .then(function () {
          window.location.href =
            'thanks.html?g=' + encodeURIComponent(groupId) + '&n=' + count;
        })
        .catch(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = original;
          setStatus(
            'Something went wrong sending your registration. Please try again, ' +
            'or email us and we will register you manually.',
            'error'
          );
        });
    });
  }

  /* ---------- guard the not-yet-live CTAs ---------- */
  /* Registration and poster URLs are still pending. Until they are filled in,
     these buttons must not look like they lead somewhere. Once a real href is
     set, drop the is-pending class in index.html and this becomes inert. */
  document.querySelectorAll('.btn.is-pending').forEach(function (btn) {
    btn.addEventListener('click', function (e) { e.preventDefault(); });
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
  });
})();
