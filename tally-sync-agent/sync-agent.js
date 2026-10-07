/**
 * Udhari OS — Tally Sync Agent
 *
 * Windows par chalne wali chhoti si service jo har 30 minute me
 * Tally Prime (localhost:9000) se bill-wise outstanding nikal kar
 * Udhari OS cloud ko bhejti hai.
 *
 * Setup:
 *   1. Node.js 18+ install karein (https://nodejs.org)
 *   2. Is folder me `npm install` chalाएं
 *   3. config.json banayein (config.example.json dekhein):
 *      - apiKey: Udhari OS dashboard → Tally Sync → "Tally connect karein" se mili key
 *      - companyName: Tally me company ka exact naam
 *      - serverUrl: aapke Udhari OS ka URL (default https://udharios.vercel.app)
 *   4. `node sync-agent.js` — ya start-agent.bat par double-click
 *
 * Tally Prime chalta rehna chahiye (port 9000 par XML interface on hota hai).
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// ---------------------------------------------------------------- config
const CONFIG_PATH = path.join(__dirname, 'config.json');
if (!fs.existsSync(CONFIG_PATH)) {
  console.error('❌ config.json nahi mila! config.example.json ko copy karke config.json banayein.');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const {
  apiKey,
  companyName,
  serverUrl = 'https://udharios.vercel.app',
  tallyHost = 'localhost',
  tallyPort = 9000,
  intervalMinutes = 30,
} = config;

if (!apiKey || !companyName) {
  console.error('❌ config.json me apiKey aur companyName zaroori hain.');
  process.exit(1);
}

// ------------------------------------------------------------ tally query
/**
 * Tally se bill-wise outstanding receivables mangne ka XML request.
 * TDL Collection-based — Tally Prime ke XML API ke liye sahi format.
 */
function buildOutstandingRequest() {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>Ugaahi Bills</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="Ugaahi Bills" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
            <TYPE>Voucher</TYPE>
            <FETCH>DATE, PARTYNAME, VOUCHERNUMBER, VOUCHERTYPENAME, AMOUNT, BASICDUEDATEOFPYMT, LEDGERENTRIES.LIST, BILLALLOCATIONS.LIST</FETCH>
            <FILTERS>IsSalesBill</FILTERS>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="IsSalesBill">
            $VOUCHERTYPENAME CONTAINS "Sales"
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

/**
 * Tally se saare ledgers (customer master) mangne ka request.
 * TDL Collection-based — Sundry Debtors filter client-side hota hai.
 */
function buildLedgerListRequest() {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>Ugaahi Ledgers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="Ugaahi Ledgers" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
            <TYPE>Ledger</TYPE>
            <FETCH>NAME, PARENT, LEDGERPHONE, PHONE, ADDRESS, GSTIN, CLOSINGBALANCE</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

/**
 * Tally se Receipt vouchers mangne ka request (pichle 7 din ke).
 * Receipt = customer ne payment diya → pending auto-kam!
 */
function buildReceiptRequest() {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 3600 * 1000);
  const fmt = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>Ugaahi Receipts</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
        <SVFROMDATE>${fmt(weekAgo)}</SVFROMDATE>
        <SVTODATE>${fmt(today)}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="Ugaahi Receipts" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
            <TYPE>Voucher</TYPE>
            <FETCH>DATE, PARTYNAME, VOUCHERNUMBER, VOUCHERTYPENAME, AMOUNT, LEDGERENTRIES.LIST, BILLALLOCATIONS.LIST</FETCH>
            <FILTERS>IsReceipt</FILTERS>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="IsReceipt">
            $VOUCHERTYPENAME CONTAINS "Receipt" OR $VOUCHERTYPENAME CONTAINS "Credit Note" OR $VOUCHERTYPENAME CONTAINS "Debit Note"
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

/**
 * Receipt / Credit Note / Debit Note vouchers parse karna.
 * Ye bills ke pending amount ko adjust karte hain.
 */
function extractReceipts(xml) {
  const receipts = [];
  const rowRe = /<(?:VOUCHER)[^>]*>([\s\S]*?)<\/(?:VOUCHER)>/gi;
  let m;
  while ((m = rowRe.exec(xml)) !== null) {
    const block = m[1];
    const tag = (names) => {
      for (const n of names) {
        const r = new RegExp(`<${n}[^>]*>([^<]*)<\\/${n}>`, 'i');
        const f = block.match(r);
        if (f && f[1].trim()) return f[1].trim();
      }
      return '';
    };
    const vchType = tag(['VOUCHERTYPENAME', 'VCHTYPE']);
    const t = vchType.toLowerCase();
    let kind = null;
    if (t.includes('receipt')) kind = 'Receipt';
    else if (t.includes('credit') && t.includes('note')) kind = 'Credit Note';
    else if (t.includes('debit') && t.includes('note')) kind = 'Debit Note';
    if (!kind) continue;

    const receiptRef = tag(['VOUCHERNUMBER', 'VCHNO', 'REFNO']);
    const partyName = tag(['PARTYNAME', 'LEDGERNAME', 'PARTYLEDGERNAME']);
    if (!receiptRef || !partyName) continue;

    const toNum = (s) => { const n = Number(String(s).replace(/[₹,\s]/g, '')); return isNaN(n) ? 0 : Math.abs(n); };
    const amount = Math.abs(toNum(tag(['AMOUNT', 'DSPVCHAMT'])));
    if (amount <= 0) continue;

    const toDate = (s) => {
      s = String(s).trim();
      if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
      return s || undefined;
    };

    // Bill reference (agar receipt kisi bill ke against hai)
    const billRef = tag(['BILLREF', 'AGAINSTBILL', 'BILLNO']) || undefined;

    receipts.push({
      receiptRef,
      partyName,
      amount,
      receiptDate: toDate(tag(['DATE', 'DSPVCHDATE'])) || new Date().toISOString().slice(0, 10),
      billRef,
      voucherType: kind,
      tallyCompany: companyName,
    });
  }
  return receipts;
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

function postTally(xml, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: tallyHost, port: tallyPort, path: '/', method: 'POST', headers: { 'Content-Length': Buffer.byteLength(xml) }, timeout: timeoutMs },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Tally se jawab nahi mila (timeout)')); });
    req.write(xml);
    req.end();
  });
}

// ---------------------------------------------------------------- parsing
/** Tally XML me se bill rows nikalna — tag variants ke saath tolerant. */
function extractBills(xml) {
  const bills = [];
  // Har <VOUCHER> ya row-ish block dhoondo
  const rowRe = /<(?:VOUCHER|DSPVCH)[^>]*>([\s\S]*?)<\/(?:VOUCHER|DSPVCH)>/gi;
  let m;
  while ((m = rowRe.exec(xml)) !== null) {
    const block = m[1];
    const tag = (names) => {
      for (const n of names) {
        const r = new RegExp(`<${n}[^>]*>([^<]*)<\\/${n}>`, 'i');
        const f = block.match(r);
        if (f && f[1].trim()) return f[1].trim();
      }
      return '';
    };
    const billRef = tag(['BILLNAME', 'BILLREF', 'BILLNO', 'VOUCHERNUMBER', 'VCHNO']);
    const partyName = tag(['PARTYNAME', 'LEDGERNAME', 'DSPVCHLEDGER', 'PARTYLEDGERNAME']);
    if (!billRef || !partyName) continue;

    const toNum = (s) => { const n = Number(String(s).replace(/[₹,\s]/g, '')); return isNaN(n) ? 0 : Math.abs(n); };
    const toDate = (s) => {
      s = String(s).trim();
      if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
      return s || undefined;
    };

    const amount = toNum(tag(['BILLAMOUNT', 'AMOUNT', 'DSPVCHAMT']));
    const pendingRaw = tag(['BILLOSDUEAMT', 'BILLPENDING', 'PENDINGAMT', 'OSAMT', 'BALANCE']);
    bills.push({
      billRef,
      partyName,
      amount: amount || toNum(pendingRaw),
      pendingAmount: pendingRaw ? toNum(pendingRaw) : amount,
      billDate: toDate(tag(['BILLDATE', 'DATE', 'DSPVCHDATE'])) || new Date().toISOString().slice(0, 10),
      dueDate: toDate(tag(['BILLDUE', 'DUEDATE'])) || undefined,
      voucherType: tag(['VOUCHERTYPENAME', 'VCHTYPE']) || undefined,
      tallyCompany: companyName,
    });
  }
  return bills;
}

// ------------------------------------------------------------------ push
function pushToCloud(bills, customers, receipts, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/integrations/tally/sync', serverUrl);
    const body = JSON.stringify({ companyName, bills, customers, receipts });
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'x-tally-api-key': apiKey },
        timeout: 30000,
      },
      (res) => {
        // Redirect follow karo (307/308)
        if ((res.statusCode === 307 || res.statusCode === 308) && res.headers.location && redirectCount < 3) {
          const newUrl = new URL(res.headers.location, url);
          console.log(`   🔀 Redirect → ${newUrl.hostname}${newUrl.pathname}`);
          // serverUrl ko update karo taaki agli baar seedha jaye
          const origPath = '/api/integrations/tally/sync';
          const newServerUrl = newUrl.origin;
          // Temporarily override
          const oldServerUrl = serverUrl;
          try {
            // Recursively call with new base
            const newFull = newUrl.toString();
            pushToUrl(newFull, body, redirectCount + 1).then(resolve).catch(reject);
          } catch (e) { reject(e); }
          return;
        }
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(data));
          else reject(new Error(`Server error ${res.statusCode}: ${data.slice(0, 200)}`));
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Udhari OS server timeout')); });
    req.write(body);
    req.end();
  });
}

/** Kisi bhi full URL pe POST karo (redirect ke liye) */
function pushToUrl(fullUrl, body, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const url = new URL(fullUrl);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'x-tally-api-key': apiKey },
        timeout: 30000,
      },
      (res) => {
        if ((res.statusCode === 307 || res.statusCode === 308) && res.headers.location && redirectCount < 3) {
          const newUrl = new URL(res.headers.location, url);
          pushToUrl(newUrl.toString(), body, redirectCount + 1).then(resolve).catch(reject);
          return;
        }
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(data));
          else reject(new Error(`Server error ${res.statusCode}: ${data.slice(0, 200)}`));
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Udhari OS server timeout')); });
    req.write(body);
    req.end();
  });
}

/** Ledger list XML me se Sundry Debtors (customers) nikalna. */
function extractCustomers(xml) {
  const customers = [];
  const seen = new Set();
  const rowRe = /<LEDGER[^>]*>([\s\S]*?)<\/LEDGER>/gi;
  let m;
  while ((m = rowRe.exec(xml)) !== null) {
    const block = m[1];
    const tag = (names) => {
      for (const n of names) {
        const r = new RegExp(`<${n}[^>]*>([^<]*)<\\/${n}>`, 'i');
        const f = block.match(r);
        if (f && f[1].trim()) return f[1].trim();
      }
      return '';
    };
    // NAME attribute bhi check karo: <LEDGER NAME="...">
    let name = tag(['LEDGERNAME', 'NAME']);
    if (!name) {
      const attr = m[0].match(/<LEDGER[^>]*\bNAME="([^"]+)"/i);
      if (attr) name = attr[1].trim();
    }
    const parent = tag(['PARENT', 'GROUPNAME']);
    const isDebtor = /sundry debtor/i.test(parent) || /^debtors$/i.test(parent);
    if (!name || !isDebtor || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    customers.push({
      name,
      phone: tag(['LEDGERPHONE', 'PHONE', 'MOBILENO']) || undefined,
      address: tag(['ADDRESS', 'ADDRESS1']) || undefined,
      gstin: tag(['GSTIN', 'PARTYGSTIN']) || undefined,
    });
  }
  return customers;
}

// ------------------------------------------------------------------- main
async function syncOnce() {
  const ts = new Date().toLocaleString('en-IN');
  console.log(`\n[${ts}] 🔄 Tally se sync shuru...`);
  try {
    // 1. Bills
    const xml = await postTally(buildOutstandingRequest());
    if (!xml || xml.length < 100) throw new Error('Tally se khaali jawab mila');
    const bills = extractBills(xml);
    console.log(`   📄 ${bills.length} bills mile`);

    // 2. Customer master (saare Sundry Debtors — bill ho ya na ho)
    // Ledger list badi ho sakti hai, isliye timeout 60 sec
    let customers = [];
    try {
      const ledgerXml = await postTally(buildLedgerListRequest(), 60000);
      customers = extractCustomers(ledgerXml);
      console.log(`   👥 ${customers.length} customers mile (master)`);
    } catch (e) {
      console.log(`   ⚠️  Customer master nahi mila: ${e.message} — sirf bills sync honge`);
    }

    // 3. Receipts / Credit Notes / Debit Notes (pichle 7 din) — payment auto-track!
    let receipts = [];
    try {
      const receiptXml = await postTally(buildReceiptRequest());
      if (receiptXml && receiptXml.length > 100) {
        receipts = extractReceipts(receiptXml);
        console.log(`   💰 ${receipts.length} receipts/notes mile`);
      }
    } catch (e) {
      console.log(`   ⚠️  Receipts nahi mile: ${e.message} — sirf bills sync honge`);
    }

    if (bills.length === 0 && customers.length === 0 && receipts.length === 0) {
      console.log('   ⚠️  Kuch parse nahi hua — --dump flag se raw XML dekhein');
      return;
    }
    const result = await pushToCloud(bills, customers, receipts);
    console.log(`   ✅ Sync complete: ${result.billsUpserted} bills, ${result.customersCreated} naye customers, ${result.outstandingsUpserted} udhaari records, ${result.receiptsApplied || 0} receipts applied`);
  } catch (err) {
    console.error(`   ❌ Error: ${err.message}`);
    console.error('   💡 Check karein: (1) Tally Prime chal raha hai? (2) Company khuli hai? (3) Internet on hai?');
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--test')) {
    console.log('🔍 Tally connection test...');
    try {
      const xml = await postTally(buildOutstandingRequest());
      console.log(`✅ Tally jawab de raha hai (${xml.length} chars)`);
      // Agar jawab bahut chhota hai to raw dikhao — debugging ke liye
      if (xml.length < 500) {
        console.log('📋 Raw response:');
        console.log(xml.slice(0, 1000));
      }
      const bills = extractBills(xml);
      console.log(`📄 ${bills.length} bills parse hue`);
      if (bills.length > 0) console.log('   Pehla bill:', JSON.stringify(bills[0]));
      else console.log('⚠️  Bills parse nahi hue — Tally version ke hisaab se request adjust karni pad sakti hai');
      try {
        const ledgerXml = await postTally(buildLedgerListRequest());
        const customers = extractCustomers(ledgerXml);
        console.log(`👥 ${customers.length} customers parse hue (Sundry Debtors)`);
        if (customers.length > 0) console.log('   Pehla customer:', JSON.stringify(customers[0]));
      } catch (e) {
        console.log(`⚠️  Ledger list nahi mili: ${e.message}`);
      }
    } catch (err) {
      console.error(`❌ ${err.message}`);
    }
    return;
  }
  if (args.includes('--dump')) {
    const xml = await postTally(buildOutstandingRequest());
    fs.writeFileSync(path.join(__dirname, 'tally-response.xml'), xml);
    console.log('💾 Raw Tally response tally-response.xml me save ho gaya');
    return;
  }

  console.log('🚀 Udhari OS Tally Sync Agent chalu');
  console.log(`   Company: ${companyName} | Har ${intervalMinutes} min me sync`);
  await syncOnce();
  setInterval(syncOnce, intervalMinutes * 60 * 1000);
}

main();
