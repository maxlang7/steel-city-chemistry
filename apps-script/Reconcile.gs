/**
 * Steel City Chemistry — PayPal reconciliation.
 *
 * Refunds are issued by hand, so the job here is to get from "a pile of PayPal
 * transactions" to "a short list of things a human must look at".
 *
 * Usage: export transactions from PayPal (Activity > Download > CSV), paste the
 * whole file into the "PayPal Import" tab, then run
 * Steel City > Match PayPal payments.
 *
 * Matching runs in three passes, most reliable first, and stops at the first
 * hit. Every match records which pass found it, because a NAME match is a guess
 * and a REFERENCE match is a fact — that distinction matters when you are about
 * to send someone money.
 *
 *   1. REFERENCE — the SCC-XXXXX group id, carried by the PayPal SDK as
 *      custom_id. Exact, and the reason for moving off the no-code link.
 *   2. EMAIL — payer email equals the email of someone in the group.
 *   3. NAME+AMOUNT — payer name matches an attendee AND the gross equals that
 *      group's total. Both must agree; either alone is too weak.
 *
 * Nothing is ever marked unpaid or refunded by this script, and no row is
 * deleted. The worst it can do is mark a row Paid, which a second run over
 * corrected data will re-evaluate.
 */

var IMPORT_SHEET = 'PayPal Import';
var REPORT_SHEET = 'PayPal Unmatched';

/* Registrations columns, 1-based. See the header row. */
var C_GROUP   = 2;    // B
var C_NAME    = 4;    // D
var C_EMAIL   = 5;    // E
var C_AMOUNT  = 18;   // R  Amount Due
var C_STATUS  = 19;   // S  Payment Status
var C_TXN     = 20;   // T  added by this script
var C_PAYER   = 21;   // U  added by this script
var C_MATCH   = 22;   // V  added by this script

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Steel City')
    .addItem('Match PayPal payments', 'matchPayPalPayments')
    .addItem('Set up PayPal Import tab', 'setUpImportTab')
    .addToUi();
}

function setUpImportTab() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(IMPORT_SHEET);
  if (!sh) {
    sh = ss.insertSheet(IMPORT_SHEET);
    sh.getRange('A1').setValue(
      'Paste the PayPal CSV export here, including its header row, starting in A1. ' +
      'Then run Steel City > Match PayPal payments.');
    sh.getRange('A1').setFontStyle('italic').setFontColor('#5b6b7d');
  }
  ensureHeaders_();
  ss.setActiveSheet(sh);
  SpreadsheetApp.getUi().alert('Ready. Paste the PayPal CSV into "' + IMPORT_SHEET + '" starting at A1.');
}

/** Add the three tracking columns if they are not already there. */
function ensureHeaders_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REGISTRATION_SHEET);
  if (!sh) return;
  var wanted = [[ 'PayPal Txn ID', 'PayPal Email', 'Match Basis' ]];
  var have = sh.getRange(1, C_TXN, 1, 3).getValues()[0];
  if (have[0] !== wanted[0][0]) {
    sh.getRange(1, C_TXN, 1, 3).setValues(wanted).setFontWeight('bold');
  }
}

function matchPayPalPayments() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var imp = ss.getSheetByName(IMPORT_SHEET);
  if (!imp) { ui.alert('No "' + IMPORT_SHEET + '" tab. Run "Set up PayPal Import tab" first.'); return; }

  var reg = ss.getSheetByName(REGISTRATION_SHEET);
  if (!reg) { ui.alert('No "' + REGISTRATION_SHEET + '" tab.'); return; }

  ensureHeaders_();

  var txns = readTransactions_(imp);
  if (!txns.length) { ui.alert('No transactions found in "' + IMPORT_SHEET + '".'); return; }

  var lastRow = reg.getLastRow();
  if (lastRow < 2) { ui.alert('No registrations yet.'); return; }
  var rows = reg.getRange(2, 1, lastRow - 1, C_MATCH).getValues();

  // Index the registration rows once, by every key we might match on.
  var byGroup = {}, byEmail = {}, byName = {};
  for (var i = 0; i < rows.length; i++) {
    var g = norm_(rows[i][C_GROUP - 1]);
    if (!g) continue;
    (byGroup[g] = byGroup[g] || []).push(i);

    var em = norm_(rows[i][C_EMAIL - 1]);
    if (em) (byEmail[em] = byEmail[em] || []).push(i);

    var nm = norm_(rows[i][C_NAME - 1]);
    if (nm) (byName[nm] = byName[nm] || []).push(i);
  }

  // Group totals, so a NAME match can be corroborated by the amount.
  var groupTotal = {};
  for (var g2 in byGroup) {
    var t = 0;
    for (var k = 0; k < byGroup[g2].length; k++) {
      t += Number(rows[byGroup[g2][k]][C_AMOUNT - 1]) || 0;
    }
    groupTotal[g2] = t;
  }

  var matched = 0, already = 0;
  var unmatched = [];
  var shortfalls = [];
  var touched = {};

  for (var t2 = 0; t2 < txns.length; t2++) {
    var tx = txns[t2];
    if (tx.gross <= 0) continue;               // refunds and fees, not payments

    var idx = null, basis = '';

    var ref = norm_(tx.reference);
    if (ref && byGroup[ref]) { idx = byGroup[ref]; basis = 'REFERENCE'; }

    if (!idx && tx.email && byEmail[norm_(tx.email)]) {
      idx = groupOf_(rows, byEmail[norm_(tx.email)][0]);
      basis = 'EMAIL';
    }

    if (!idx && tx.name && byName[norm_(tx.name)]) {
      var cand = groupOf_(rows, byName[norm_(tx.name)][0]);
      var cg = norm_(rows[cand[0]][C_GROUP - 1]);
      if (Math.abs(groupTotal[cg] - tx.gross) < 0.005) { idx = cand; basis = 'NAME+AMOUNT'; }
    }

    if (!idx) { unmatched.push([tx.date, tx.name, tx.email, tx.gross, tx.txn, tx.reference]); continue; }

    /* What they owe is decided here, not by the payment. Amount Due is written
       server-side, one row per attendee; the amount paid arrives from a page
       whose ?n= parameter is editable. So compare, and say so when they differ
       rather than quietly marking a short payment as settled. */
    var grp   = norm_(rows[idx[0]][C_GROUP - 1]);
    var owed  = groupTotal[grp] || 0;
    var delta = round2_(tx.gross - owed);
    var status = 'Paid';
    if (delta < -0.005) {
      status = 'SHORT $' + Math.abs(delta).toFixed(2) + ' (paid $' + tx.gross.toFixed(2) + ' of $' + owed.toFixed(2) + ')';
      shortfalls.push([tx.date, tx.name, tx.email, tx.gross, owed, delta, tx.txn, grp]);
    } else if (delta > 0.005) {
      status = 'Paid (over by $' + delta.toFixed(2) + ')';
      shortfalls.push([tx.date, tx.name, tx.email, tx.gross, owed, delta, tx.txn, grp]);
    }

    for (var m = 0; m < idx.length; m++) {
      var r = idx[m];
      if (norm_(rows[r][C_STATUS - 1]).indexOf('paid') === 0 && rows[r][C_TXN - 1]) { already++; continue; }
      rows[r][C_STATUS - 1] = status;
      rows[r][C_TXN - 1]    = tx.txn;
      rows[r][C_PAYER - 1]  = tx.email;
      rows[r][C_MATCH - 1]  = basis;
      touched[r] = true;
      matched++;
    }
  }

  // One write for the whole block rather than a call per row.
  reg.getRange(2, 1, rows.length, C_MATCH).setValues(rows);

  writeUnmatched_(ss, unmatched, shortfalls);

  ui.alert(
    'PayPal matching complete.\n\n' +
    'Transactions read: ' + txns.length + '\n' +
    'Registration rows marked Paid: ' + matched + '\n' +
    'Already paid, left alone: ' + already + '\n' +
    'Transactions not matched: ' + unmatched.length + '\n' +
    'Amount mismatches: ' + shortfalls.length +
    ((unmatched.length || shortfalls.length) ? '\n\nSee the "' + REPORT_SHEET + '" tab.' : '') +
    '\n\nCheck the Match Basis column: REFERENCE is exact, NAME+AMOUNT is a ' +
    'guess worth eyeballing before you refund.');
}

/** Every row sharing a group id with the given row index. */
function groupOf_(rows, i) {
  var g = norm_(rows[i][C_GROUP - 1]);
  var out = [];
  for (var r = 0; r < rows.length; r++) {
    if (norm_(rows[r][C_GROUP - 1]) === g) out.push(r);
  }
  return out.length ? out : [i];
}

/**
 * Read the pasted CSV, locating columns by header text.
 *
 * PayPal's export headers differ by account type, region and export version,
 * so each field accepts several spellings rather than a fixed position.
 */
function readTransactions_(sh) {
  var values = sh.getDataRange().getValues();
  var head = -1;
  for (var r = 0; r < Math.min(values.length, 10); r++) {
    if (rowHas_(values[r], ['transaction id', 'transactionid', 'txn id'])) { head = r; break; }
  }
  if (head < 0) return [];

  var H = values[head].map(function (h) { return norm_(h); });
  var col = function (names) {
    for (var n = 0; n < names.length; n++) {
      var i = H.indexOf(names[n]);
      if (i >= 0) return i;
    }
    return -1;
  };

  var cTxn   = col(['transaction id', 'transactionid', 'txn id']);
  var cName  = col(['name', 'payer name', 'from name']);
  var cEmail = col(['from email address', 'payer email', 'sender email', 'email', 'from email']);
  var cGross = col(['gross', 'amount', 'gross amount', 'total']);
  var cRef   = col(['custom number', 'custom', 'custom id', 'custom_id', 'invoice number', 'invoice id']);
  var cDate  = col(['date']);
  var cStat  = col(['status']);

  var out = [];
  for (var i2 = head + 1; i2 < values.length; i2++) {
    var row = values[i2];
    if (!row[cTxn]) continue;
    var st = cStat >= 0 ? norm_(row[cStat]) : '';
    if (st && st.indexOf('complet') < 0 && st.indexOf('success') < 0) continue;

    // Refunds and fees come through the same export as negative gross. Drop
    // them here so the counts reported at the end mean "payments".
    if (cGross >= 0 && parseAmount_(row[cGross]) <= 0) continue;

    out.push({
      txn:       String(row[cTxn]).trim(),
      name:      cName  >= 0 ? String(row[cName]).trim()  : '',
      email:     cEmail >= 0 ? String(row[cEmail]).trim() : '',
      gross:     cGross >= 0 ? parseAmount_(row[cGross])  : 0,
      reference: cRef   >= 0 ? String(row[cRef]).trim()   : '',
      date:      cDate  >= 0 ? row[cDate]                 : ''
    });
  }
  return out;
}

function writeUnmatched_(ss, rows, shortfalls) {
  var sh = ss.getSheetByName(REPORT_SHEET) || ss.insertSheet(REPORT_SHEET);
  sh.clear();

  sh.getRange(1, 1).setValue('UNMATCHED PAYMENTS — no registration found')
    .setFontWeight('bold').setFontColor('#9a2b2b');
  sh.getRange(2, 1, 1, 6)
    .setValues([['Date', 'Payer Name', 'Payer Email', 'Gross', 'Transaction ID', 'Reference']])
    .setFontWeight('bold');
  if (rows.length) sh.getRange(3, 1, rows.length, 6).setValues(rows);

  var r = 3 + Math.max(rows.length, 1) + 2;
  sh.getRange(r, 1).setValue('AMOUNT MISMATCHES — matched, but paid \u2260 owed')
    .setFontWeight('bold').setFontColor('#8a4b0a');
  sh.getRange(r + 1, 1, 1, 8)
    .setValues([['Date', 'Payer Name', 'Payer Email', 'Paid', 'Owed', 'Difference', 'Transaction ID', 'Group']])
    .setFontWeight('bold');
  if (shortfalls && shortfalls.length) {
    sh.getRange(r + 2, 1, shortfalls.length, 8).setValues(shortfalls);
  }
}

function round2_(n) { return Math.round(n * 100) / 100; }

/** PayPal writes amounts as text with thousands separators in some locales. */
function parseAmount_(v) {
  if (typeof v === 'number') return v;
  var s = String(v || '').replace(/[^0-9.\-]/g, '');
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function rowHas_(row, names) {
  for (var i = 0; i < row.length; i++) {
    if (names.indexOf(norm_(row[i])) >= 0) return true;
  }
  return false;
}

function norm_(v) {
  return String(v === undefined || v === null ? '' : v).trim().toLowerCase();
}
