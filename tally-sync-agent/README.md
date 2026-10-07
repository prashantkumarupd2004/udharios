# Udhari OS — Tally Sync Agent 🤖

Windows par chalne wala chhota sa program jo **har 30 minute me Tally Prime se bill-wise outstanding nikal kar Udhari OS ko bhejta hai.** Uske baad reminders automatic — bill number ke saath!

## Kya chahiye

1. **Windows computer** jisme Tally Prime installed ho
2. **Tally Prime chalta hua** hona chahiye (company khuli ho)
3. **Node.js 18+** — https://nodejs.org se download karein (LTS version)
4. **API key** — Udhari OS dashboard → **Tally Sync** page → "Tally connect karein"
5. **TDL Addon** (phone numbers ke liye!) — `ugaahi.tdl` ko Tally me load karein:
   - Tally Prime kholein → **F12** (Configure)
   - **Product & Features** → **F4** (Manage Local TDLs)
   - **Load TDL** → `ugaahi.tdl` file select karein
   - Tally **restart** karein
   - Bina TDL ke bills to sync honge, lekin **phone numbers nahi aayenge!**

## Setup (5 minute)

```bat
REM 1. Is folder me right-click → "Open in Terminal", phir:
npm install

REM 2. Config banayein:
copy config.example.json config.json
REM    config.json kholo (Notepad me) aur bharo:
REM    - apiKey: dashboard se mili tally_... wali key
REM    - companyName: Tally me company ka EXACT naam (Gateway of Tally par jo dikhta hai)
REM    - serverUrl: https://udharios.vercel.app (aapka Udhari OS URL)

REM 3. Pehle test karo:
npm test
REM    ✅ "Tally jawab de raha hai" aana chahiye

REM 4. Agent chalao:
npm start
REM    Ya: start-agent.bat par double-click
```

## Roz kaam kaise karega

- Agent har 30 minute me Tally se **saare customers (Sundry Debtors)** nikalega — bill ho ya na ho, sab auto-add
- Phir naye/pending bills lega → customers match honge, udhaari records banenge
- **Receipts / Credit Notes / Debit Notes** (pichle 7 din) bhi lega:
  - 💰 **Receipt** (payment mila) → pending **auto-kam**, full pay pe **Paid ✓** + call band!
  - ↩️ **Credit Note** (maal wapas) → pending kam
  - ➕ **Debit Note** (extra charge) → pending badhega
- **Reminders apne aap** — WhatsApp aur voice call me bill number bolega:
  > "Bill number INV-1023 ka ₹5,400 ka payment 12 din se pending hai"
- Bill Tally me pay ho gaya → agli sync me Udhari OS me bhi **Paid ✓**

## Computer start hote hi chalana ho to

1. `start-agent.bat` par right-click → **Create shortcut**
2. `Win + R` → `shell:startup` → Enter
3. Shortcut ko us folder me paste kar do — bas!

## Problem aaye to

| Dikkat | Hal |
|---|---|
| `Tally se jawab nahi mila` | Tally Prime khula hai? Company select hai? |
| `0 bills parse hue` | `node sync-agent.js --dump` chalao → `tally-response.xml` banao → support ko bhejo |
| `Invalid API key` | Dashboard → Tally Sync se **nayi key** banao, config.json me update karo |
| `config.json nahi mila` | config.example.json ko copy karke config.json banao |

## Technical notes (developers)

- Tally XML interface: `http://localhost:9000` (Tally Prime default)
- Udhari OS endpoint: `POST /api/integrations/tally/sync` with `x-tally-api-key` header
- Max 5000 bills per sync; agent sirf stdlib use karta hai (koi npm dependency nahi)
