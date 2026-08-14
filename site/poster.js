/* Steel City Chemistry — poster abstract submission.
   Posts to the same Apps Script endpoint as registration, distinguished by the
   hidden `form=poster` field, and lands on the Posters sheet. */
(function () {
  'use strict';

  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbwrkFTDmgnfayN0bySO9RkM-AvvN9EK2xHB-PzK7mMKMaCpi2drPYNk3XuykGpb80gk6Q/exec';

  var form = document.getElementById('posterForm');
  if (!form) return;

  var status = document.getElementById('posterStatus');

  function setStatus(msg, kind) {
    status.textContent = msg;
    status.className = 'form__status form__status--' + kind;
    status.hidden = false;
  }

  /* ---------- conditional fields ---------- */
  var memberYes = document.getElementById('p-member-yes');
  var memberNo = document.getElementById('p-member-no');
  var memberIdField = document.getElementById('p-memberid-field');
  var level = document.getElementById('p-level');
  var gradeField = document.getElementById('p-grade-field');
  var grade = document.getElementById('p-grade');

  function syncMember() {
    memberIdField.hidden = !memberYes.checked;
  }
  [memberYes, memberNo].forEach(function (el) {
    el.addEventListener('change', syncMember);
  });

  function syncLevel() {
    var isK12 = level.value === 'K-12';
    gradeField.hidden = !isK12;
    // Only require the grade when it is actually visible, or the form can
    // never be submitted by anyone else.
    grade.required = isK12;
    if (!isK12) grade.value = '';
  }
  level.addEventListener('change', syncLevel);

  syncMember();
  syncLevel();

  /* ---------- prefill from a previous registration ---------- */
  /* Registration asks "attendee type" and posters ask "level"; these are the
     three that map across. Anything else is left for the submitter. */
  var TYPE_TO_LEVEL = {
    'Graduate Student': 'Graduate',
    'Undergraduate Student': 'Undergraduate',
    'K-12 Student': 'K-12'
  };

  var saved = window.SCC && window.SCC.profile ? window.SCC.profile.load() : null;
  if (saved && (saved.name || saved.email)) {
    var setVal = function (id, value) {
      if (!value) return false;
      var el = document.getElementById(id);
      if (!el || el.value) return false;
      el.value = value;
      return true;
    };

    var filled = false;
    filled = setVal('p-name', saved.name) || filled;
    filled = setVal('p-email', saved.email) || filled;
    filled = setVal('p-institution', saved.organization) || filled;

    if (saved.acsMember === 'Yes') { memberYes.checked = true; filled = true; }
    else if (saved.acsMember === 'No') { memberNo.checked = true; filled = true; }
    if (saved.memberId) { setVal('p-memberid', saved.memberId); }

    var mappedLevel = TYPE_TO_LEVEL[saved.attendeeType];
    if (mappedLevel) { level.value = mappedLevel; filled = true; }
    if (saved.grade) setVal('p-grade', saved.grade);

    syncMember();
    syncLevel();

    if (filled) {
      window.SCC.prefillBanner(form, saved.name, function () {
        form.reset();
        syncMember();
        syncLevel();
      });
    }
  }

  /* ---------- abstract character count ---------- */
  var abstract = document.getElementById('p-abstract');
  var counter = document.getElementById('p-count');
  abstract.addEventListener('input', function () {
    counter.textContent = String(abstract.value.length);
  });

  /* ---------- submit ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.reportValidity()) return;

    var btn = form.querySelector('.btn--submit');
    var original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    setStatus('Sending your abstract…', 'pending');

    var submissionId = 'SCP-' +
      Date.now().toString(36).toUpperCase().slice(-5) +
      Math.random().toString(36).toUpperCase().slice(2, 4);

    var payload = new URLSearchParams(new FormData(form));
    payload.set('submission-id', submissionId);

    // Remember these so the registration form can prefill in turn.
    if (window.SCC && window.SCC.profile) {
      window.SCC.profile.save({
        name: payload.get('name'),
        email: payload.get('email'),
        organization: payload.get('institution'),
        acsMember: payload.get('acs-member'),
        memberId: payload.get('member-id'),
        grade: payload.get('grade')
      });
    }

    /* no-cors: Apps Script redirects through a googleusercontent.com domain
       that sends no CORS headers, so the response is unreadable. The request
       still lands. Form-encoding keeps it preflight-free and populates
       e.parameter in doPost. */
    fetch(ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: payload.toString()
    })
      .then(function () {
        window.location.href = 'poster-received.html?s=' + encodeURIComponent(submissionId);
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = original;
        setStatus(
          'Something went wrong sending your abstract. Please try again, or email ' +
          'the organizers and we will add it manually.',
          'error'
        );
      });
  });
})();
