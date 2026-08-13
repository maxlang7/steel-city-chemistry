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
  var ENDPOINT = ''; // TODO: paste the Apps Script /exec URL here

  var regForm = document.getElementById('registrationForm');
  var status = document.getElementById('formStatus');

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
        body: new URLSearchParams(new FormData(regForm)).toString()
      })
        .then(function () {
          window.location.href = 'thanks.html';
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
