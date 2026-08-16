/* Steel City Chemistry — confirmation page: reference code + PayPal handoff. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------------
   * PayPal client id (PUBLIC — this is meant to ship in client-side code; the
   * client SECRET must never appear here).
   *
   * Get it from developer.paypal.com > Apps & Credentials > Live > your app.
   *
   * While this is empty the page falls back to the no-code payment link below,
   * so payments keep working. Filling it in switches to the SDK, which is the
   * whole point: the SDK attaches the registration reference to the payment as
   * custom_id, so a payment made from a different PayPal address than the one
   * someone registered with can still be matched automatically. The no-code
   * link accepts no parameters and cannot do this.
   * --------------------------------------------------------------------- */
  var PAYPAL_CLIENT_ID = 'AYK3n1BJaPJpqUR9WhGp3izf9jWSla5TWX-wwTcnuHSJDG7x0W7Om2zAKHRwi1sPfLu4SJRP8S9NA6Mt';

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

  var head =
    '<h2 class="paybox__head">Complete your registration</h2>' +
    '<p class="paybox__amount">' +
      count + (count === 1 ? ' attendee' : ' attendees') +
      ' × $' + FEE + ' = <strong>$' + total + '</strong>' +
    '</p>';

  var refundNote =
    '<p class="paybox__note paybox__note--refund">' +
      'The $10 is a deposit and is refunded to you after you attend.' +
    '</p>';

  if (PAYPAL_CLIENT_ID) {
    renderSdk();
  } else {
    renderLinkFallback();
  }

  /* ---------------------------------------------------------------------
   * SDK path — the reference travels with the money.
   * ------------------------------------------------------------------- */
  function renderSdk() {
    payBox.innerHTML =
      head +
      '<div id="paypalButtons" class="paybox__buttons"></div>' +
      '<p class="paybox__note" id="payStatus" role="status" aria-live="polite">' +
        'Loading payment options…' +
      '</p>' +
      refundNote;

    var s = document.createElement('script');
    s.src = 'https://www.paypal.com/sdk/js?client-id=' +
            encodeURIComponent(PAYPAL_CLIENT_ID) +
            '&currency=USD&intent=capture&disable-funding=paylater,venmo';
    s.onerror = function () { renderLinkFallback('Could not load PayPal. Use the button below.'); };
    s.onload = function () {
      if (!window.paypal || !window.paypal.Buttons) {
        renderLinkFallback('Could not load PayPal. Use the button below.');
        return;
      }
      setStatus('You can pay by card without a PayPal account.');

      window.paypal.Buttons({
        style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },

        createOrder: function (data, actions) {
          return actions.order.create({
            purchase_units: [{
              /* custom_id is what makes reconciliation automatic: it comes back
                 in PayPal's CSV export, so the payer's own email no longer has
                 to match the one they registered with. */
              custom_id: group || 'SCC-UNKNOWN',
              description: 'Steel City Chemistry registration — ' +
                           count + (count === 1 ? ' attendee' : ' attendees'),
              amount: {
                value: total.toFixed(2),
                currency_code: 'USD'
              }
            }]
          });
        },

        onApprove: function (data, actions) {
          return actions.order.capture().then(function (details) {
            var id = (details && details.id) ? details.id : '';
            payBox.innerHTML =
              '<h2 class="paybox__head">Payment received</h2>' +
              '<p class="paybox__amount">Thank you — <strong>$' + total + '</strong> paid.</p>' +
              (id ? '<p class="paybox__note">PayPal transaction: <strong>' + esc(id) + '</strong></p>' : '') +
              (group ? '<p class="paybox__note">Registration reference: <strong>' + esc(group) + '</strong></p>' : '') +
              '<p class="paybox__note">A confirmation email is on its way. ' +
                'Keep this reference for any question about your registration or refund.</p>' +
              refundNote;
          });
        },

        onError: function (err) {
          /* Never leave someone stranded with no way to pay. */
          renderLinkFallback('Something went wrong with the payment form. Use the button below.');
          if (window.console) console.error('PayPal error', err);
        }
      }).render('#paypalButtons').catch(function () {
        renderLinkFallback('Could not display the payment form. Use the button below.');
      });
    };
    document.head.appendChild(s);
  }

  function setStatus(msg) {
    var el = document.getElementById('payStatus');
    if (el) el.innerHTML = msg;
  }

  /* ---------------------------------------------------------------------
   * Fallback — the no-code link. Works, but cannot carry the reference, so
   * the page has to ask the payer to do that job by hand.
   * ------------------------------------------------------------------- */
  function renderLinkFallback(warning) {
    var quantityLine = count === 1
      ? 'Leave the quantity set to <strong>1</strong>.'
      : 'On the PayPal page, set the quantity to <strong>' + count + '</strong> ' +
        '— one for each person you registered.';

    payBox.innerHTML =
      head +
      (warning ? '<p class="paybox__note paybox__note--warn">' + esc(warning) + '</p>' : '') +
      '<p class="paybox__qty">' + quantityLine + '</p>' +
      '<form action="' + esc(PAYPAL_LINK) + '" method="post" target="_blank" class="paybox__form">' +
        '<button type="submit" class="btn btn--gold">Pay $' + total + ' with PayPal</button>' +
      '</form>' +
      '<p class="paybox__note">' +
        'You can pay by card without a PayPal account. ' +
        (group
          ? 'Please put <strong>' + esc(group) + '</strong> in the PayPal note field, ' +
            'and pay using the same email address you registered with — that is how ' +
            'we match your payment to your registration.'
          : '<strong>Please pay using the same email address you registered with</strong> — ' +
            'that is how we match your payment to your registration.') +
      '</p>' +
      refundNote;
  }
})();
