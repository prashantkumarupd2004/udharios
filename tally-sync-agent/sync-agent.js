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
 *      - serverUrl: aapke Udhari OS ka URL (default https://app.udharios.in)
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
  serverUrl = 'https://app.udharios.in',
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
 * NOTE: Tally version ke hisaab se report ka response structure alag ho sakta
 * hai — agent tolerant parser use karta hai, lekin pehli baar --test mode me
 * zaroor check karein.
 */
function buildOutstandingRequest() {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Report</TYPE>
    <ID>Outstanding Receivables</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

/**
 * Tally se saare ledgers (customer master) mangne ka request.
 * Agent client-side par sirf "Sundry Debtors" filter karta hai —
 * matlab aapke saare customers, bill ho ya na ho.
 */
function buildLedgerListRequest() {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>List of Accounts</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

function postTally(xml) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: tallyHost, port: tallyPort, path: '/', method: 'POST', headers: { 'Content-Length': Buffer.byteLength(xml) }, timeout: 20000 },
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

    const toNum = (s) => { const n = Number(String(s).replace(/[₹,\s]/g, '')); return isNaN(n) ? 0 : n; };
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
function pushToCloud(bills, customers) {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/integrations/tally/sync', serverUrl);
    const body = JSON.stringify({ companyName, bills, customers });
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'x-tally-api-key': apiKey },
        timeout: 30000,
      },
      (res) => {
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
    let customers = [];
    try {
      const ledgerXml = await postTally(buildLedgerListRequest());
      customers = extractCustomers(ledgerXml);
      console.log(`   👥 ${customers.length} customers mile (master)`);
    } catch (e) {
      console.log(`   ⚠️  Customer master nahi mila: ${e.message} — sirf bills sync honge`);
    }

    if (bills.length === 0 && customers.length === 0) {
      console.log('   ⚠️  Kuch parse nahi hua — --dump flag se raw XML dekhein');
      return;
    }
    const result = await pushToCloud(bills, customers);
    console.log(`   ✅ Sync complete: ${result.billsUpserted} bills, ${result.customersCreated} naye customers, ${result.outstandingsUpserted} udhaari records`);
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
