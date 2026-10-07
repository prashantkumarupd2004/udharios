# Ugaahi Tally ODBC Agent — Setup Guide

## Kya hai ye?

Ye **ODBC version** hai — Tally se direct SQL query karta hai.
XML API se jo phone number nahi milta, ODBC se mil sakta hai!

## Setup (10 minute)

### Step 1: Tally me ODBC enable karo

1. Tally Prime kholo
2. **F1** (Help) → **Settings** → **Connectivity**
3. Ye set karo:
   - **Tally prime act as**: `Both`
   - **Enable ODBC**: `Yes`
   - **Port**: `9000`
4. Save karo

### Step 2: Tally ODBC Driver install karo

1. Jao: https://help.tallysolutions.com
2. **Tally Prime** → **Downloads** → **ODBC Driver** (64-bit)
3. Install karo: `TallyODBC64_9000`

### Step 3: Node.js ODBC package install karo

```bat
cd tally-sync-agent-v2
npm install odbc
```

> Note: `odbc` package ko compile hone me 2-3 minute lag sakte hain.
> Agar error aaye to: `npm install --build-from-source odbc`

### Step 4: Test karo

```bat
node sync-agent-odbc.js --test
```

Ye dikhayega:
- Kaun se tables available hain
- Ledger sample data
- **Kaun sa phone field kaam karta hai!** (P1-P6 jaisa test)

### Step 5: Chalao

```bat
node sync-agent-odbc.js
```

## Troubleshooting

**"Data source name not found"**
→ ODBC driver install nahi hai. Step 2 karo.

**"Connection failed"**
→ Tally Prime chalu nahi hai, ya company nahi khuli.

**"Table not found"**
→ Tally me company khuli honi chahiye.

## XML vs ODBC

| Feature | XML Agent | ODBC Agent |
|---------|-----------|------------|
| Bills sync | ✅ | 🔄 (ban raha hai) |
| Customers sync | ✅ | ✅ |
| Phone numbers | ❌ | 🔍 (test kar rahe hain!) |
| Setup | Aasaan | Thoda complex |
