/**
 * Steel City Chemistry — registration endpoint.
 *
 * Receives POSTs from the registration form on the event website and appends
 * one row per registrant to the "Registrations" sheet.
 *
 * Deploy: Extensions → Apps Script from the spreadsheet, paste this file,
 * then Deploy → New deployment → Web app:
 *     Execute as:       Me
 *     Who has access:   Anyone
 * Copy the resulting /exec URL into ENDPOINT in the website's main.js.
 *
 * "Anyone" is required because visitors are not signed in to Google. The script
 * only ever appends to this one sheet, so the exposure is limited to that.
 */

var SHEET_ID = '1-KcG_2VoCuXEYQeUdH0i1JEaJN1_G5AjczYGfwLeCMY';
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

    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) {
      return json({ result: 'error', message: 'Sheet not found: ' + SHEET_NAME });
    }

    var row = [new Date()];
    for (var i = 0; i < COLUMNS.length; i++) {
      row.push(data[COLUMNS[i]] || '');
    }

    // Lock so two simultaneous registrations can't write to the same row.
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      sheet.appendRow(row);
    } finally {
      lock.releaseLock();
    }

    return json({ result: 'ok' });

  } catch (err) {
    return json({ result: 'error', message: String(err) });
  }
}

/** Browsers preflight nothing here — the form posts as simple form-encoded data. */
function doGet() {
  return json({ result: 'ok', message: 'Steel City Chemistry registration endpoint.' });
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
