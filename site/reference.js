/* Steel City Chemistry — confirmation page: show the registration reference.
 *
 * This is what remains of payment.js after the $10 PayPal deposit was dropped.
 * The reference code still matters: the confirmation email quotes it, and it is
 * how a registrant and the organisers refer to the same booking. */
(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var group = (params.get('g') || '').slice(0, 32);
  if (!group) return;

  var count = parseInt(params.get('n'), 10);
  if (isNaN(count) || count < 1) count = 1;
  if (count > 25) count = 25;

  var box = document.getElementById('refBox');
  var code = document.getElementById('refCode');
  var people = document.getElementById('refPeople');
  if (!box || !code || !people) return;

  code.textContent = group;
  people.textContent = count === 1
    ? 'Covers 1 attendee.'
    : 'Covers ' + count + ' attendees registered together.';
  box.hidden = false;
}());
