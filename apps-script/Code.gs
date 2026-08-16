/**
 * Steel City Chemistry — form endpoint.
 *
 * Handles two forms, distinguished by the `form` parameter:
 *
 *   form=registration → one row per attendee on the "Registrations" sheet.
 *     A submission may cover several people; every row shares a Group ID and
 *     names the same payer, so a single PayPal payment reconciles against the
 *     group while catering detail stays per person.
 *
 *   form=poster → one row on the "Posters" sheet per abstract submitted.
 *
 * SECURITY NOTES
 * --------------
 * Deployed as "Execute as: Me / Who has access: Anyone", which is required —
 * registrants are not signed in to Google. Because it runs with the deploying
 * user's authority, the code is the security boundary:
 *
 *   - Only scope requested is spreadsheets.currentonly: this spreadsheet and
 *     nothing else in Drive. Sheet names are fixed in code; no caller-supplied
 *     ID is ever used to open a document.
 *   - Only the fixed columns below are written; extra POST params are ignored.
 *   - Every value is coerced to a bounded string and formula-escaped.
 *   - MAX_ATTENDEES caps how much one request can write.
 */

var REGISTRATION_SHEET = 'Registrations';
var POSTER_SHEET = 'Posters';

/** Flat registration fee per attendee, in USD. Refundable upon attendance. */
var REGISTRATION_FEE = 10;

/* ---------------------------------------------------------------------------
 * Confirmation email
 *
 * Sent by MailApp, which sends as whoever deployed the web app — the From
 * address cannot be changed. REPLY_TO and SENDER_NAME are what recipients
 * actually act on, so both point at the event, not at an individual.
 *
 * Quota is per day and shared with everything else that account sends:
 * 100/day on a consumer Gmail account, 1500/day on Workspace. A send that
 * would exceed it throws, which is why sendConfirmation is called after the
 * row is written and never allowed to fail the request.
 * ------------------------------------------------------------------------- */
var SEND_CONFIRMATIONS = true;
var SENDER_NAME   = 'Steel City Chemistry';
var REPLY_TO      = 'steelcitychemistryacs@gmail.com';
var EVENT_NAME    = 'Steel City Chemistry: Past, Present, and Future';
var EVENT_DATE    = 'Saturday, October 3, 2026';
var EVENT_TIME    = '8:00 AM - 5:00 PM';
var EVENT_VENUE   = 'William Pitt Union, 3959 Fifth Avenue, Pittsburgh, PA 15260';
var SITE_URL      = 'https://www.steelcitychemistry.com/';
var DEADLINE      = 'Wednesday, September 16, 2026 at 11:59 PM Eastern';
var GCAL_URL      = 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
                    '&text=Steel%20City%20Chemistry%3A%20Past%2C%20Present%2C%20and%20Future' +
                    '&dates=20261003T120000Z%2F20261003T210000Z' +
                    '&location=William%20Pitt%20Union%2C%203959%20Fifth%20Avenue%2C%20Pittsburgh%2C%20PA%2015260' +
                    '&ctz=America%2FNew_York';

/** Per-attendee registration fields, in sheet column order. */
var ATTENDEE_FIELDS = [
  'name',
  'email',
  'phone',
  'organization',
  'acs-member',
  'attendee-type',
  'grade',
  'recent-grad',
  'grad-year'
];

/** Poster fields, in sheet column order (after the submission id). */
var POSTER_FIELDS = [
  'name',
  'email',
  'acs-member',
  'member-id',
  'institution',
  'level',
  'grade',
  'advisor',
  'category',
  'abstract'
];

var MAX_FIELD_LENGTH = 5000;   // Abstracts need more room than a name.
var MAX_ATTENDEES = 25;

function doPost(e) {
  try {
    var data = (e && e.parameter) ? e.parameter : {};

    if (!data.form && e && e.postData && e.postData.contents) {
      data = parseQuery(e.postData.contents);
    }

    // Honeypot: bots fill hidden fields, humans never see them.
    if (data['company-website']) {
      return json({ result: 'ok' });   // Silently accept, do not record.
    }

    return (data.form === 'poster') ? handlePoster(data) : handleRegistration(data);

  } catch (err) {
    return json({ result: 'error', message: String(err) });
  }
}

function handleRegistration(data) {
  var count = parseInt(data.count, 10);
  if (isNaN(count) || count < 1) count = 1;
  if (count > MAX_ATTENDEES) count = MAX_ATTENDEES;

  if (!data['a0_name'] || !data['a0_email']) {
    return json({ result: 'error', message: 'Name and email are required.' });
  }

  var sheet = sheetByName(REGISTRATION_SHEET);
  if (!sheet) return json({ result: 'error', message: 'Sheet not found.' });

  var groupId = clean(data['group-id']);
  var payer   = clean(data['a0_name']);
  var other   = clean(data['other-info']);

  var rows = [];
  for (var i = 0; i < count; i++) {
    if (!data['a' + i + '_name']) continue;   // Skip blank blocks.

    var row = [groupId, String(i + 1)];
    for (var f = 0; f < ATTENDEE_FIELDS.length; f++) {
      row.push(clean(data['a' + i + '_' + ATTENDEE_FIELDS[f]]));
    }
    row.push(clean(data['a' + i + '_breakfast']));
    row.push(clean(data['a' + i + '_lunch']));
    row.push(clean(data['a' + i + '_dietary']));
    row.push(i === 0 ? other : '');            // Other info: once per group.
    row.push(payer);
    row.push(String(REGISTRATION_FEE));
    row.push('Unpaid');
    rows.push(row);
  }

  if (!rows.length) {
    return json({ result: 'error', message: 'No valid attendees submitted.' });
  }

  appendRows(sheet, rows);

  // After the write, never before: a mail failure must not cost us the
  // registration. The client posts with no-cors and cannot read this response,
  // so a thrown error here would be invisible to the registrant.
  try {
    sendConfirmation(data, count, groupId);
  } catch (mailErr) {
    console.error('Confirmation email failed for ' + groupId + ': ' + mailErr);
  }

  return json({ result: 'ok', group: groupId, attendees: rows.length });
}

/**
 * Email the group's confirmation.
 *
 * Goes to attendee 1 — the person who filled the form and who pays — with the
 * other attendees copied, so everyone has the reference and the cancellation
 * deadline in their own inbox. Addresses that do not look like addresses are
 * dropped rather than handed to MailApp, which throws on the whole send if any
 * single recipient is malformed.
 */
function sendConfirmation(data, count, groupId) {
  if (!SEND_CONFIRMATIONS) return;

  var to = clean(data['a0_email']).trim();
  if (!isEmail(to)) return;

  var people = [];
  var cc = [];
  for (var i = 0; i < count; i++) {
    var nm = clean(data['a' + i + '_name']).trim();
    if (!nm) continue;
    var org = clean(data['a' + i + '_organization']).trim();
    people.push(org ? (nm + ' (' + org + ')') : nm);

    if (i > 0) {
      var em = clean(data['a' + i + '_email']).trim();
      if (isEmail(em) && em.toLowerCase() !== to.toLowerCase() && cc.indexOf(em) < 0) {
        cc.push(em);
      }
    }
  }
  if (!people.length) return;

  var total = people.length * REGISTRATION_FEE;
  var firstName = people[0].split(' ')[0];

  var lines = [];
  lines.push('Hi ' + firstName + ',');
  lines.push('');
  lines.push('Thank you for registering for ' + EVENT_NAME + ', an ACS150 anniversary');
  lines.push('celebration presented by the ACS Pittsburgh Local Section.');
  lines.push('');
  lines.push('YOUR REGISTRATION');
  lines.push('Reference: ' + groupId);
  lines.push(people.length === 1 ? 'Registered: 1 attendee' : 'Registered: ' + people.length + ' attendees');
  for (var p = 0; p < people.length; p++) lines.push('  ' + (p + 1) + '. ' + people[p]);
  lines.push('');
  lines.push('EVENT DETAILS');
  lines.push(EVENT_DATE);
  lines.push(EVENT_TIME);
  lines.push(EVENT_VENUE);
  lines.push('');
  lines.push('Add it to your calendar: ' + GCAL_URL);
  lines.push('');
  lines.push('REGISTRATION FEE');
  lines.push('$' + REGISTRATION_FEE + ' per person, $' + total + ' in total.');
  lines.push('The fee is refunded to you after you attend.');
  lines.push('');
  lines.push('CANCELLATION AND REFUNDS');
  lines.push('If your plans change, tell us before the registration deadline of');
  lines.push(DEADLINE + '.');
  lines.push('Cancellations received before that deadline are refunded in full.');
  lines.push('We cannot refund a cancellation received after it.');
  lines.push('To cancel, reply to this email or write to ' + REPLY_TO + ',');
  lines.push('quoting reference ' + groupId + '.');
  lines.push('');
  lines.push('Questions of any kind: ' + REPLY_TO);
  lines.push(SITE_URL);
  lines.push('');
  lines.push('We look forward to seeing you in Pittsburgh.');
  lines.push('ACS Pittsburgh Local Section');

  var body = lines.join('\n');

  var opts = {
    name: SENDER_NAME,
    replyTo: REPLY_TO,
    htmlBody: confirmationHtml(firstName, groupId, people, total),
    noReply: false
  };
  if (cc.length) opts.cc = cc.join(',');

  MailApp.sendEmail(to, 'Registration confirmed - ' + EVENT_NAME, body, opts);
}

function confirmationHtml(firstName, groupId, people, total) {
  var list = '';
  for (var p = 0; p < people.length; p++) {
    list += '<li>' + esc(people[p]) + '</li>';
  }

  return '' +
  '<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1e2a38;max-width:600px">' +
    '<div style="background:#12305e;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">' +
      '<div style="font-size:20px;font-weight:700">Registration confirmed</div>' +
      '<div style="color:#d9a520;font-size:14px;margin-top:4px">' + esc(EVENT_NAME) + '</div>' +
    '</div>' +
    '<div style="border:1px solid #dbe6f0;border-top:0;padding:24px;border-radius:0 0 8px 8px">' +
      '<p>Hi ' + esc(firstName) + ',</p>' +
      '<p>Thank you for registering for this ACS150 anniversary celebration, ' +
        'presented by the ACS Pittsburgh Local Section.</p>' +

      '<p style="background:#eaf4fb;padding:12px 16px;border-radius:6px;margin:20px 0">' +
        '<strong>Reference:</strong> ' + esc(groupId) + '</p>' +

      '<p style="margin-bottom:4px"><strong>' +
        (people.length === 1 ? 'Attendee' : people.length + ' attendees') + '</strong></p>' +
      '<ul style="margin-top:4px">' + list + '</ul>' +

      '<p style="margin-bottom:4px"><strong>Event details</strong></p>' +
      '<p style="margin-top:4px">' +
        esc(EVENT_DATE) + '<br>' + esc(EVENT_TIME) + '<br>' + esc(EVENT_VENUE) +
      '</p>' +
      '<p><a href="' + GCAL_URL + '" style="color:#12305e;font-weight:700">Add to your Google Calendar</a></p>' +

      '<p style="margin-bottom:4px"><strong>Registration fee</strong></p>' +
      '<p style="margin-top:4px">$' + REGISTRATION_FEE + ' per person, $' + total + ' in total. ' +
        'The fee is refunded to you after you attend.</p>' +

      '<div style="background:#fdf6e3;border-left:4px solid #d9a520;padding:12px 16px;margin:20px 0">' +
        '<strong>Cancellation and refunds</strong><br>' +
        'If your plans change, tell us before the registration deadline of ' +
        '<strong>' + esc(DEADLINE) + '</strong>. Cancellations received before that ' +
        'deadline are refunded in full; we cannot refund a cancellation received after it. ' +
        'To cancel, reply to this email quoting reference ' + esc(groupId) + '.' +
      '</div>' +

      '<p style="color:#5b6b7d;font-size:14px">' +
        'Questions of any kind: <a href="mailto:' + REPLY_TO + '" style="color:#12305e">' + REPLY_TO + '</a><br>' +
        '<a href="' + SITE_URL + '" style="color:#12305e">' + SITE_URL + '</a>' +
      '</p>' +
      '<p style="color:#5b6b7d;font-size:14px">We look forward to seeing you in Pittsburgh.<br>' +
        'ACS Pittsburgh Local Section</p>' +
    '</div>' +
  '</div>';
}

/**
 * Run this once from the Apps Script editor before updating the deployment.
 *
 * It does two jobs: it triggers the consent screen for the newly added
 * script.send_mail scope (without which the live endpoint would fail on every
 * request), and it sends a sample confirmation to whoever runs it so the
 * wording can be checked before a real registrant sees it. Writes nothing.
 */
function sendTestConfirmation() {
  var me = Session.getActiveUser().getEmail();
  sendConfirmation({
    'a0_name': 'Test Registrant',
    'a0_email': me,
    'a0_organization': 'University of Pittsburgh',
    'a1_name': 'Second Attendee',
    'a1_email': '',
    'a1_organization': 'Carnegie Mellon University'
  }, 2, 'SCC-SAMPLE');

  Logger.log('Sample confirmation sent to ' + me);
  Logger.log('Remaining mail quota today: ' + MailApp.getRemainingDailyQuota());
}

/** Deliberately permissive: reject the obviously broken, not the unusual. */
function isEmail(s) {
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(String(s || ''));
}

function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function handlePoster(data) {
  if (!data.name || !data.email || !data.abstract) {
    return json({ result: 'error', message: 'Name, email and abstract are required.' });
  }

  var sheet = sheetByName(POSTER_SHEET);
  if (!sheet) return json({ result: 'error', message: 'Sheet not found.' });

  var row = [clean(data['submission-id'])];
  for (var f = 0; f < POSTER_FIELDS.length; f++) {
    row.push(clean(data[POSTER_FIELDS[f]]));
  }
  row.push('Received');

  appendRows(sheet, [row]);
  return json({ result: 'ok', submission: clean(data['submission-id']) });
}

/**
 * Append rows with a timestamp in column A.
 *
 * Value cells are forced to text format BEFORE writing. Without this,
 * setValues parses a leading "=" as a formula, so a submitter could send
 * =IMPORTXML(...) and have it execute against this sheet with the owner's
 * access. The lock stops two simultaneous submissions writing the same row.
 */
function appendRows(sheet, rows) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var r = sheet.getLastRow() + 1;
    var stamp = new Date();

    var dataRange = sheet.getRange(r, 2, rows.length, rows[0].length);
    dataRange.setNumberFormat('@');
    dataRange.setValues(rows);

    var stamps = [];
    for (var s = 0; s < rows.length; s++) stamps.push([stamp]);
    sheet.getRange(r, 1, rows.length, 1).setValues(stamps);
  } finally {
    lock.releaseLock();
  }
}

function sheetByName(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function doGet() {
  return json({ result: 'ok', message: 'Steel City Chemistry form endpoint.' });
}

/**
 * Coerce to a bounded string and neutralise spreadsheet formulas.
 *
 * A leading space is the escape that actually works. Two other approaches were
 * tried and verified NOT to work: a leading apostrophe (setValues still parses
 * the value as a formula — the apostrophe escape is a UI-input convention, not
 * an API one), and setting the cell number format to text beforehand (format
 * governs display, not whether input is parsed). The space also protects the
 * CSV export path, where Excel would otherwise evaluate the value on open.
 */
function clean(value) {
  var s = (value === undefined || value === null) ? '' : String(value);
  if (s.length > MAX_FIELD_LENGTH) s = s.slice(0, MAX_FIELD_LENGTH);
  if (/^[=+\-@]/.test(s)) s = ' ' + s;
  return s;
}

/** Minimal application/x-www-form-urlencoded parser. */
function parseQuery(str) {
  var out = {};
  var pairs = String(str).split('&');
  for (var i = 0; i < pairs.length; i++) {
    if (!pairs[i]) continue;
    var idx = pairs[i].indexOf('=');
    var k = idx < 0 ? pairs[i] : pairs[i].slice(0, idx);
    var v = idx < 0 ? '' : pairs[i].slice(idx + 1);
    out[decodeURIComponent(k.replace(/\+/g, ' '))] =
      decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return out;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
