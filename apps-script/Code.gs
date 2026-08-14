/**
 * Steel City Chemistry — registration endpoint.
 *
 * Receives POSTs from the registration form on the event website and appends
 * ONE ROW PER ATTENDEE to the "Registrations" sheet. A single submission may
 * cover several people (someone registering colleagues or students), in which
 * case every row shares a Group ID and names the same payer. That is what makes
 * a payment reconcilable: the PayPal transaction carries the Group ID, and the
 * sheet holds full details for each individual it covers.
 *
 * SECURITY NOTES
 * --------------
 * Deployed as "Execute as: Me / Who has access: Anyone", which is required —
 * event registrants are not signed in to Google. Because it runs with the
 * deploying user's authority, the code is the security boundary:
 *
 *   - Only scope requested is spreadsheets.currentonly: this spreadsheet and
 *     nothing else in Drive. The target sheet is fixed in code; no
 *     caller-supplied ID is ever used to open a document.
 *   - Only the fixed columns below are written; extra POST params are ignored.
 *   - Every value is coerced to a bounded string and formula-escaped.
 *   - MAX_ATTENDEES caps how much one request can write.
 */

var SHEET_NAME = 'Registrations';

/** Flat registration fee per attendee, in USD. Refundable upon attendance. */
var REGISTRATION_FEE = 10;

/** Per-attendee fields, in sheet column order (after the group columns). */
var ATTENDEE_FIELDS = [
  'name',
  'email',
  'phone',
  'organization',
  'acs-member',
  'attendee-type',
  'breakfast',
  'lunch',
  'dietary'
];

var MAX_FIELD_LENGTH = 2000;
var MAX_ATTENDEES = 25;

function doPost(e) {
  try {
    var data = (e && e.parameter) ? e.parameter : {};

    if (!data['a0_name'] && e && e.postData && e.postData.contents) {
      data = parseQuery(e.postData.contents);
    }

    // Honeypot: bots fill hidden fields, humans never see them.
    if (data['company-website']) {
      return json({ result: 'ok' });   // Silently accept, do not record.
    }

    var count = parseInt(data.count, 10);
    if (isNaN(count) || count < 1) count = 1;
    if (count > MAX_ATTENDEES) count = MAX_ATTENDEES;

    if (!data['a0_name'] || !data['a0_email']) {
      return json({ result: 'error', message: 'Name and email are required.' });
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      return json({ result: 'error', message: 'Sheet not found: ' + SHEET_NAME });
    }

    var groupId  = clean(data['group-id']);
    var payer    = clean(data['a0_name']);
    var other    = clean(data['other-info']);
    var stamp    = new Date();

    var rows = [];
    for (var i = 0; i < count; i++) {
      // Skip blank attendee blocks left behind in the form.
      if (!data['a' + i + '_name']) continue;

      var row = [groupId, String(i + 1)];
      for (var f = 0; f < ATTENDEE_FIELDS.length; f++) {
        row.push(clean(data['a' + i + '_' + ATTENDEE_FIELDS[f]]));
      }
      row.push(i === 0 ? other : '');           // Other info: once per group.
      row.push(payer);                           // Paid by
      row.push(String(REGISTRATION_FEE));        // Amount due
      row.push('Unpaid');                        // Payment status
      rows.push(row);
    }

    if (!rows.length) {
      return json({ result: 'error', message: 'No valid attendees submitted.' });
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var r = sheet.getLastRow() + 1;

      // Force value cells to text BEFORE writing. Without this, setValues parses
      // a leading "=" as a formula, so a registrant could submit =IMPORTXML(...)
      // and have it execute against this sheet with the owner's access.
      var dataRange = sheet.getRange(r, 2, rows.length, rows[0].length);
      dataRange.setNumberFormat('@');
      dataRange.setValues(rows);

      // Timestamp column, same value for every row in the group.
      var stamps = [];
      for (var s = 0; s < rows.length; s++) stamps.push([stamp]);
      sheet.getRange(r, 1, rows.length, 1).setValues(stamps);
    } finally {
      lock.releaseLock();
    }

    return json({ result: 'ok', group: groupId, attendees: rows.length });

  } catch (err) {
    return json({ result: 'error', message: String(err) });
  }
}

function doGet() {
  return json({ result: 'ok', message: 'Steel City Chemistry registration endpoint.' });
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
