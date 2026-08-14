/* Steel City Chemistry — confirmation page: reference code + PayPal handoff.
   No dependencies. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     CONFIGURE THESE TWO, then payment switches on automatically.

     PAYPAL_BUSINESS — the ACS Pittsburgh Local Section's PayPal account
       (its email address, or its secure merchant ID). This should be the
       SECTION's account, not a personal one: event income landing in a
       personal account creates tax and bookkeeping problems.

     FEE — flat registration fee per attendee, in USD. Must match FEE in
       main.js and REGISTRATION_FEE in apps-script/Code.gs.
     ------------------------------------------------------------------ */
  var PAYPAL_BUSINESS = '';   // TODO: section PayPal account
  var FEE = 0;                // TODO: confirm fee

  var CURRENCY = 'USD';

  var params = new URLSearchParams(window.location.search);
  var group = (params.get('g') || '').slice(0, 32);
  var count = parseInt(params.get('n'), 10);
  if (isNaN(count) || count < 1) count = 1;
  if (count > 25) count = 25;

  /* ---------- reference code ---------- */
  if (group) {
    var box = document.getElementById('refBox');
    document.getElementById('refCode').textContent = group;
    document.getElementById('refPeople').textContent =
      count === 1
        ? 'Covers 1 attendee.'
        : 'Covers ' + count + ' attendees registered together.';
    box.hidden = false;
  }

  /* ---------- payment ---------- */
  var payBox = document.getElementById('payBox');
  if (!payBox) return;

  if (!PAYPAL_BUSINESS || !FEE) {
    payBox.innerHTML =
      '<p class="paybox__pending">' +
      'Payment details will be emailed to you shortly. Your place is recorded ' +
      'and we will confirm once payment is received.' +
      '</p>';
    return;
  }

  var total = (count * FEE).toFixed(2);

  /* PayPal's hosted-button POST. Quantity multiplies the flat per-person fee,
     and the group reference travels in both item_number and custom so it shows
     up in the transaction record and in PayPal's CSV export — that is what
     makes a later refund findable. */
  var form = document.createElement('form');
  form.action = 'https://www.paypal.com/cgi-bin/webscr';
  form.method = 'post';
  form.target = '_top';
  form.className = 'paybox__form';

  var fields = {
    cmd: '_xclick',
    business: PAYPAL_BUSINESS,
    item_name: 'Steel City Chemistry registration — ' + group,
    item_number: group,
    custom: group,
    amount: FEE.toFixed(2),
    quantity: String(count),
    currency_code: CURRENCY,
    no_shipping: '1',
    rm: '1',
    return: window.location.origin + window.location.pathname.replace(/thanks\.html$/, 'paid.html'),
    cancel_return: window.location.href
  };

  Object.keys(fields).forEach(function (k) {
    var input = document.createElement('input');
    input.type = 'hidden';
    input.name = k;
    input.value = fields[k];
    form.appendChild(input);
  });

  var btn = document.createElement('button');
  btn.type = 'submit';
  btn.className = 'btn btn--gold';
  btn.textContent = 'Pay $' + total + ' with PayPal';
  form.appendChild(btn);

  payBox.innerHTML =
    '<p class="paybox__amount">' +
    count + (count === 1 ? ' attendee' : ' attendees') +
    ' × $' + FEE.toFixed(2) + ' = <strong>$' + total + '</strong>' +
    '</p>';
  payBox.appendChild(form);

  var note = document.createElement('p');
  note.className = 'paybox__note';
  note.textContent =
    'You can pay by card without a PayPal account. If your institution requires ' +
    'an invoice or purchase order, ignore this and we will be in touch.';
  payBox.appendChild(note);
})();
