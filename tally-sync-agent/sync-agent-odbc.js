/**
 * Ugaahi Tally Sync Agent — ODBC Version
 *
 * Tally Prime ke ODBC driver se direct SQL query karta hai.
 * XML API se jo phone nahi milta, ODBC se mil sakta hai!
 *
 * SETUP:
 * 1. Tally Prime me ODBC enabled hona chahiye (F1 → Settings → Connectivity)
 *    - Tally prime act as: Both
 *    - Enable ODBC: Yes
 *    - Port: 9000
 * 2. Tally ODBC driver installed hona chahiye (TallyODBC64_9000)
 *    Download: https://help.tallysolutions.com (Tally Prime → Downloads)
 * 3. Node.js me: npm install odbc
 * 4. Tally Prime CHALU hona chahiye (company khuli ho)
 *
 * RUN:
 *   node sync-agent-odbc.js --test    (pehle test karo)
 *   node sync-agent-odbc.js           (phir chalao)
 */

const odbc = require('odbc');
const fs = require('fs');
const path = require('path');

// Config
const CONFIG_PATH = path.join(__dirname, 'config.json');
let config = { serverUrl: 'https://udharios.vercel.app', apiKey: '', companyName: 'Infotronics Media' };
try {
  if (fs.existsSync(CONFIG_PATH)) {
    config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
  }
} catch (e) { /* ignore */ }

const DSN = 'TallyODBC_9000';

/**
 * Tally ODBC se connect karo
 */
async function connectTally() {
  console.log(`🔌 Tally ODBC se connect ho raha hu (DSN: ${DSN})...`);
  console.log(`   Tally Prime chalu hai? Company khuli hai?`);
  const connection = await odbc.connect(`DSN=${DSN};`);
  console.log('✅ Tally ODBC connected!');
  return connection;
}

/**
 * Test: Ledger fields discover karo
 */
async function testLedgerFields(connection) {
  console.log('\n🔍 Ledger fields discover kar raha hu...\n');

  // Pehle saare available tables dekho
  try {
    const tables = await connection.query(`SELECT $Name FROM ODBCTables`);
    console.log('📋 Available tables (pehle 10):');
    tables.slice(0, 10).forEach(t => console.log('   -', JSON.stringify(t)));
  } catch (e) {
    console.log('   ⚠️  ODBCTables nahi mila:', e.message);
  }

  // Ledger se sample data nikalo
  console.log('\n📄 Ledger sample (pehle 3):');
  try {
    const ledgers = await connection.query(`SELECT TOP 3 $Name, $Parent FROM Ledger`);
    ledgers.forEach(l => console.log('   -', JSON.stringify(l)));
  } catch (e) {
    console.log('   ❌ Error:', e.message);
  }

  // Phone fields try karo — ek-ek karke
  console.log('\n📞 Phone fields try kar raha hu...\n');
  const phoneFields = [
    '$LedgerPhone',
    '$Phone',
    '$Mobile',
    '$PrimaryMobileNo',
    '$ContactNumber',
    '$PhoneNumber',
  ];

  for (const field of phoneFields) {
    try {
      const result = await connection.query(
        `SELECT TOP 1 $Name, ${field} FROM Ledger WHERE $Name = 'Arpit Pandey'`
      );
      const val = result[0] ? JSON.stringify(result[0]) : '(no rows)';
      console.log(`   ${field}: ${val}`);
    } catch (e) {
      console.log(`   ${field}: ❌ (${e.message.slice(0, 80)})`);
    }
  }
}

/**
 * Saare customers nikalo (Debtors + Creditors)
 */
async function getCustomers(connection) {
  console.log('\n👥 Customers nikal raha hu...');
  // Jo phone field kaam karega, wo yahan use hoga
  // Pehle test se pata chalega kaun sa field sahi hai
  const query = `
    SELECT $Name, $Parent, $ClosingBalance
    FROM Ledger
    WHERE $Parent LIKE '%Sundry Debtors%' OR $Parent LIKE '%Sundry Creditors%'
  `;
  const rows = await connection.query(query);
  console.log(`   ${rows.length} customers mile`);
  return rows;
}

// Main
async function main() {
  const args = process.argv.slice(2);
  let connection;
  try {
    connection = await connectTally();
    if (args.includes('--test')) {
      await testLedgerFields(connection);
    } else {
      const customers = await getCustomers(connection);
      console.log('\n✅ Test complete! --test se phone fields check karo');
    }
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.log('\n💡 Checklist:');
    console.log('   1. Tally Prime chalu hai?');
    console.log('   2. Company khuli hai?');
    console.log('   3. ODBC enabled hai? (F1 → Settings → Connectivity)');
    console.log('   4. Tally ODBC driver installed hai?');
    console.log('   5. npm install odbc kiya?');
  } finally {
    if (connection) await connection.close();
  }
}

main();
