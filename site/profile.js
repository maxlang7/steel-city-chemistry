/* Steel City Chemistry — remembers what someone typed on one form so the other
   form can prefill it.

   Stored in localStorage, never sent anywhere: the registration and poster
   forms post independently to Apps Script, and this only saves the browser a
   second round of typing. Nothing here is authoritative — the sheets are.

   Deliberately NOT a cookie: cookies ride along with every request to the
   origin, and there is no reason for personal details to leave the device. */
(function () {
  'use strict';

  var KEY = 'scc-profile';
  var MAX_AGE_DAYS = 60;   // Comfortably past the event on 2026-10-03.

  window.SCC = window.SCC || {};

  window.SCC.profile = {
    save: function (patch) {
      try {
        var existing = this.load() || {};
        var merged = {};
        Object.keys(existing).forEach(function (k) { merged[k] = existing[k]; });
        Object.keys(patch).forEach(function (k) {
          if (patch[k]) merged[k] = patch[k];   // Never overwrite with blanks.
        });
        merged.savedAt = Date.now();
        localStorage.setItem(KEY, JSON.stringify(merged));
      } catch (e) { /* private mode, quota, or storage disabled — not fatal */ }
    },

    load: function () {
      try {
        var raw = localStorage.getItem(KEY);
        if (!raw) return null;
        var obj = JSON.parse(raw);
        var age = Date.now() - (obj.savedAt || 0);
        if (age > MAX_AGE_DAYS * 864e5) {
          localStorage.removeItem(KEY);
          return null;
        }
        return obj;
      } catch (e) { return null; }
    },

    clear: function () {
      try { localStorage.removeItem(KEY); } catch (e) { /* no-op */ }
    }
  };

  /* Shared "we filled this in for you" banner. Someone on a shared or lab
     machine must be able to see whose details these are and wipe them. */
  window.SCC.prefillBanner = function (form, name, onClear) {
    var bar = document.createElement('div');
    bar.className = 'prefill';
    bar.innerHTML =
      '<span class="prefill__text">Filled in from your earlier form' +
      (name ? ' — <strong></strong>' : '') + '.</span>' +
      '<button type="button" class="prefill__clear">Not you? Clear</button>';
    if (name) bar.querySelector('strong').textContent = name;

    bar.querySelector('.prefill__clear').addEventListener('click', function () {
      window.SCC.profile.clear();
      if (onClear) onClear();
      bar.remove();
    });

    form.insertBefore(bar, form.firstChild);
  };
})();
