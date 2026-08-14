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
