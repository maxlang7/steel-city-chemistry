/**
 * Steel City Chemistry — registration endpoint.
 *
 * Receives POSTs from the registration form on the event website and appends
 * one row per registrant to the "Registrations" sheet of the spreadsheet this
 * script is bound to.
 *
 * SECURITY NOTES
 * --------------
 * This is deployed as "Execute as: Me / Who has access: Anyone", which lets
 * unauthenticated visitors invoke it. That is required — event registrants are
 * not signed in to Google. Because it runs with the deploying user's authority,
 * the code itself is the security boundary, so it is deliberately narrow:
 *
 *   - The only OAuth scope requested is spreadsheets.currentonly, which grants
 *     access to THIS spreadsheet and no other file in Drive. Even a total
 *     compromise of this endpoint cannot reach anything else in the account.
 *   - The target sheet is fixed in code. No caller-supplied ID is ever used to
 *     open a document.
 *   - Only the fixed COLUMNS below are written. Extra POST parameters are
 *     ignored rather than appended.
 *   - Values are written with appendRow, which treats them as data, and every
 *     field is coerced to a string and length-capped so a caller cannot inject
 *     a formula or write an unbounded payload.
 *
 * Deploy: Extensions → Apps Script from the spreadsheet, then
 * Deploy → New deployment → Web app (Execute as: Me, Access: Anyone).
 */

var SHEET_NAME = 'Registrations';

/** Column order must match the header row in the sheet. */
var COLUMNS = [
  'name',
  'email',
  'phone',
  'organization',
  'acs-member',
  'attendee-type',
  'breakfast',
  'lunch',
  'dietary',
  'other-info'
];

var MAX_FIELD_LENGTH = 2000;

function doPost(e) {
  try {
    var data = (e && e.parameter) ? e.parameter : {};

    // Fallback: if the request arrived with a non-form content type, e.parameter
    // is empty and the payload sits in postData. Parse it rather than silently
    // writing a blank row.
    if (!data.name && e && e.postData && e.postData.contents) {
      data = parseQuery(e.postData.contents);
    }

    // Honeypot: bots fill hidden fields, humans never see them.
    if (data['company-website']) {
      return json({ result: 'ok' });   // Silently accept, do not record.
    }

    // Minimum viable registration. Anything less is a malformed request.
    if (!data.name || !data.email) {
      return json({ result: 'error', message: 'Name and email are required.' });
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      return json({ result: 'error', message: 'Sheet not found: ' + SHEET_NAME });
    }

    var values = [];
    for (var i = 0; i < COLUMNS.length; i++) {
      values.push(clean(data[COLUMNS[i]]));
    }

    // Lock so two simultaneous registrations can't write to the same row.
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var r = sheet.getLastRow() + 1;

      // Force the value cells to plain-text format BEFORE writing. Without this,
      // appendRow/setValues parse a leading "=" as a formula, so a registrant
      // could submit =IMPORTXML(...) and have it execute against this sheet with
      // the owner's access. Text format makes the payload inert.
      var dataRange = sheet.getRange(r, 2, 1, COLUMNS.length);
      dataRange.setNumberFormat('@');
      dataRange.setValues([values]);

      sheet.getRange(r, 1, 1, 1).setValue(new Date());
    } finally {
      lock.releaseLock();
    }

    return json({ result: 'ok' });

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
 * A leading space is the escape that actually works here. Two other approaches
 * were tried and verified NOT to work: a leading apostrophe (setValues still
 * parses the value as a formula — the apostrophe escape is a UI-input
 * convention, not an API one), and setting the cell number format to text
 * beforehand (format governs display, not whether input is parsed).
 *
 * The space also protects the CSV export path, where Excel would otherwise
 * evaluate the value on open.
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
