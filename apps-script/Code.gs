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
  return json({ result: 'ok', group: groupId, attendees: rows.length });
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
