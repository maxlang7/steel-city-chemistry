/* Steel City Chemistry — confirmation page: reference code + PayPal handoff.
   No dependencies, no external SDK. */
(function () {
  'use strict';

  /* PayPal no-code payment link for the ACS Pittsburgh Local Section.
     $10 per attendee, refundable upon attendance. The buyer sets the quantity
     on PayPal's own page — these links accept no pass-through parameters, so
     neither the quantity nor the registration reference can be prefilled. */
  var PAYPAL_LINK = 'https://www.paypal.com/ncp/payment/MP4EYJW6RC3LQ';
  var FEE = 10;

  var params = new URLSearchParams(window.location.search);
  var group = (params.get('g') || '').slice(0, 32);
  var count = parseInt(params.get('n'), 10);
  if (isNaN(count) || count < 1) count = 1;
  if (count > 25) count = 25;

  /* ---------- reference code ---------- */
  if (group) {
    document.getElementById('refCode').textContent = group;
    document.getElementById('refPeople').textContent =
      count === 1
        ? 'Covers 1 attendee.'
        : 'Covers ' + count + ' attendees registered together.';
    document.getElementById('refBox').hidden = false;
  }

  /* ---------- payment ---------- */
  var payBox = document.getElementById('payBox');
  if (!payBox) return;

  var total = count * FEE;
  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  /* The quantity instruction is the part people get wrong, so it leads. */
  var quantityLine = count === 1
    ? 'Leave the quantity set to <strong>1</strong>.'
    : 'On the PayPal page, set the quantity to <strong>' + count + '</strong> ' +
      '— one for each person you registered.';

  payBox.innerHTML =
    '<h2 class="paybox__head">Complete your registration</h2>' +
    '<p class="paybox__amount">' +
      count + (count === 1 ? ' attendee' : ' attendees') +
      ' × $' + FEE + ' = <strong>$' + total + '</strong>' +
    '</p>' +
    '<p class="paybox__qty">' + quantityLine + '</p>' +
    '<form action="' + esc(PAYPAL_LINK) + '" method="post" target="_blank" class="paybox__form">' +
      '<button type="submit" class="btn btn--gold">Pay $' + total + ' with PayPal</button>' +
    '</form>' +
    '<p class="paybox__note">' +
      'You can pay by card without a PayPal account. ' +
      '<strong>Please pay using the same email address you registered with</strong> — ' +
      'that is how we match your payment to your registration.' +
    '</p>' +
    '<p class="paybox__note paybox__note--refund">' +
      'The $10 is a deposit and is refunded to you after you attend.' +
    '</p>';
})();
