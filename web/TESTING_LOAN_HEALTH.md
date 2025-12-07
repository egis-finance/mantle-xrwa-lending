# Testing Loan Health Component - Complete Guide

This guide will help you verify that the Loan Health component is working correctly with real blockchain data.

---

## 🎯 Quick Start

1. **Server should already be running at:** `http://localhost:3000`
2. **Navigate to:** `http://localhost:3000/borrow`
3. **Look for the "Loan Health" card** on the right side of the page

---

## ✅ What to Check

### 1. **Loading State (Initial)**
When you first load the page, you should see:
- ⏳ A pulsing/animated skeleton loading UI
- 🔄 A spinning refresh icon with "Fetching blockchain data..." text
- Gray placeholder boxes where the metrics will appear

**This means:** The hooks are actively fetching data from the blockchain!

### 2. **Loaded State (After 2-5 seconds)**
Once data loads, you should see:
- 📊 A gauge with an actual percentage (e.g., "65%" or "0%")
- 📍 A colored needle that points to the current LTV position
- 💰 Real dollar amounts for "Collateral Value" and "Total Debt"
- 🏥 Health Factor displayed if there's active debt

### 3. **Data Should NOT Be Hardcoded**
The values should match the actual blockchain state:
- **NOT** exactly "$150,000" and "$97,500" (those were the old hardcoded values)
- **INSTEAD** real values from the configured borrower address

---

## 🔍 Detailed Testing Steps

### **Test 1: Verify Data is Loading from Blockchain**

1. Open browser DevTools (F12 or Right-click → Inspect)
2. Go to **Network** tab
3. Filter by "Fetch/XHR"
4. Reload the page
5. **Look for RPC calls to:**
   - `virtual.mainnet.eu.rpc.tenderly.co` (Ethereum VTE)
   - Calls to contract methods: `position`, `market`, `price`

**✅ Pass:** You see multiple RPC calls being made
**❌ Fail:** No network requests or errors in console

---

### **Test 2: Check Console for Data**

1. Open browser console (F12 → Console tab)
2. Add this to test the hooks directly:

```javascript
// This will show you what data the hooks are returning
localStorage.debug = '*'
```

3. Reload the page
4. **Look for:**
   - No red errors about contract calls
   - Successful contract reads
   - Data being returned (not null/undefined)

**✅ Pass:** No errors, data loads successfully
**❌ Fail:** Red errors like "Contract call reverted" or "Invalid address"

---

### **Test 3: Verify Real-Time Updates**

The hooks automatically refetch data every 10-30 seconds.

1. Keep the page open
2. Wait 15-20 seconds
3. Watch the Network tab - you should see new RPC calls
4. If data changes on-chain, the UI should update automatically

**✅ Pass:** You see periodic network requests
**❌ Fail:** No updates after initial load

---

### **Test 4: Check Contract Configuration**

Run this in the terminal to verify your environment:

```bash
cd /Users/athanasiostsavlis/projects/mantle-xrwa-lending/web
cat .env.local | grep -E "ETH_MORPHO|ETH_ORACLE|BORROWER_ADDRESS|ETHEREUM_RPC"
```

**Expected output:**
```
NEXT_PUBLIC_ETH_MORPHO=0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb
NEXT_PUBLIC_ETH_ORACLE=0xa11FC125e799220E51F662b9253806A2538C91E3
NEXT_PUBLIC_BORROWER_ADDRESS=0x91c5CA0B262fDefbb1468AfAE65c0229650B4fBC
NEXT_PUBLIC_ETHEREUM_RPC_VTE=https://virtual.mainnet.eu.rpc.tenderly.co/...
```

**✅ Pass:** All addresses are properly configured
**❌ Fail:** Missing or set to 0x0

---

### **Test 5: Inspect Component State**

Add temporary debug logging to see the actual data:

1. Open `app/borrow/page.tsx`
2. Add this after the `useLoanHealth` hook (around line 24):

```typescript
// Temporary debug logging
React.useEffect(() => {
    console.log('🏥 Loan Health Data:', {
        isLoading: loanHealth.isLoading,
        ltv: loanHealth.ltv,
        collateralValue: loanHealth.collateralValue,
        debtValue: loanHealth.debtValue,
        healthFactor: loanHealth.healthFactor,
        riskLevel: loanHealth.riskLevel,
    })
}, [loanHealth])
```

3. Save and check the console
4. **You should see:**
   - `isLoading: true` initially
   - Then `isLoading: false` with actual values

**✅ Pass:** Data transitions from loading to loaded with real values
**❌ Fail:** Stuck in loading or all values are null

---

## 🎨 Visual Indicators to Look For

### **Risk Levels**

The component color codes based on the LTV ratio:

| LTV Range | Risk Level | Color | Needle/Icon |
|-----------|-----------|-------|-------------|
| 0-67.4% | Safe | Dark/Black | 🟢 Green Shield |
| 67.5-74.9% | Warning | Yellow/Orange | 🟡 Yellow Shield |
| 75%+ | Danger | Red | 🔴 Red Shield |

### **Loading Animations**

- **Skeleton boxes:** Pulse effect on gray placeholders
- **Spinning icon:** RefreshCw icon rotates continuously
- **Text:** "Fetching blockchain data..."

### **Loaded Display**

- **Gauge needle:** Smoothly rotates to the correct angle
- **Percentage:** Shows 1 decimal place (e.g., "45.3%")
- **Currency:** Formatted with commas (e.g., "$1,234,567")

---

## 🧪 Test Different Scenarios

### **Scenario A: No Debt (Fresh Position)**
**Expected:**
- LTV: 0%
- Collateral Value: > $0
- Total Debt: $0
- Health Factor: Not shown (infinity)
- Risk Level: Safe (green)

### **Scenario B: Active Loan (Safe)**
**Expected:**
- LTV: 20-60%
- Collateral Value: Shows amount
- Total Debt: Shows amount
- Health Factor: > 1.3
- Risk Level: Safe (green)

### **Scenario C: High Risk Position**
**Expected:**
- LTV: 67.5-75%
- Warning banner: "⚠️ Warning: Approaching liquidation threshold"
- Liquidation price displayed
- Risk Level: Warning (yellow)

### **Scenario D: Critical Position**
**Expected:**
- LTV: ≥ 75%
- Critical banner: "⚠️ Critical: Position at risk of liquidation!"
- Red coloring throughout
- Risk Level: Danger (red)

---

## 🔧 Troubleshooting

### **Problem: Stuck in Loading State**

**Possible Causes:**
1. RPC endpoint is down
2. Contract addresses are wrong
3. Network connectivity issues

**Solutions:**
```bash
# Test RPC connectivity
curl -X POST https://virtual.mainnet.eu.rpc.tenderly.co/099a70af-6185-4e28-b190-7e65e144ec95 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Should return: {"jsonrpc":"2.0","id":1,"result":"0x..."}
```

### **Problem: All Values Show $0**

**Possible Causes:**
1. Borrower address has no position
2. Oracle price is returning 0
3. Market has no liquidity

**Solutions:**
- Check if borrower address actually has collateral on Morpho
- Verify oracle contract is deployed and working
- Try a different borrower address with known positions

### **Problem: Console Errors**

**Common Errors:**

```
❌ "Contract call reverted"
→ Contract address is wrong or contract not deployed on VTE

❌ "Invalid address"
→ Check NEXT_PUBLIC_BORROWER_ADDRESS format (must be 0x... hex)

❌ "Network request failed"
→ RPC endpoint URL is incorrect or unreachable

❌ "Cannot read property of undefined"
→ Data structure doesn't match expected format
```

### **Problem: Incorrect Calculations**

**Verify Math:**
```typescript
// In browser console:
const collateral = 100000; // from blockchain
const price = 1.05; // from oracle
const debt = 50000; // from shares calculation

const collateralValue = collateral * price; // Should be 105000
const ltv = (debt / collateralValue) * 100; // Should be ~47.6%
const healthFactor = (collateralValue * 0.75) / debt; // Should be 1.575

console.log({ collateralValue, ltv, healthFactor });
```

---

## 📊 Using Browser Extensions

### **Recommended Tools:**

1. **React DevTools**
   - View hook states in real-time
   - Inspect component props
   - See re-render patterns

2. **Redux DevTools** (if using)
   - Track state changes
   - Time-travel debugging

3. **Network Monitor**
   - Filter by "tenderly.co"
   - Check response payloads
   - Monitor request timing

---

## 🎯 Success Criteria Checklist

- [ ] Loading skeleton appears on first load
- [ ] Skeleton disappears after 2-5 seconds
- [ ] Real dollar amounts appear (not hardcoded $150k/$97.5k)
- [ ] LTV percentage matches calculated value
- [ ] Gauge needle position corresponds to LTV
- [ ] Colors change based on risk level
- [ ] Health Factor displays correctly
- [ ] Warning banners appear when appropriate
- [ ] No console errors
- [ ] Network tab shows RPC calls to Tenderly
- [ ] Data auto-refreshes every 10-30 seconds

---

## 🚀 Advanced Testing

### **Manual Data Injection Test**

Temporarily override data to test UI states:

```typescript
// Add to app/borrow/page.tsx for testing
const loanHealth = useLoanHealth(borrowerAddress);

// Override for testing
const testHealth = {
    ...loanHealth,
    isLoading: false,
    ltv: 72.5, // High risk
    collateralValue: 150000,
    debtValue: 108750,
    healthFactor: 1.03,
    riskLevel: 'warning' as const,
    liquidationPrice: 0.9675,
};

// Use testHealth instead of loanHealth in JSX
```

### **Performance Testing**

```javascript
// In browser console
performance.mark('loan-health-start');
// Wait for data to load
performance.mark('loan-health-end');
performance.measure('loan-health-load', 'loan-health-start', 'loan-health-end');
console.table(performance.getEntriesByType('measure'));
```

---

## 📝 Reporting Issues

If something isn't working, provide:

1. **Browser console screenshot** (any errors)
2. **Network tab screenshot** (filtered by tenderly.co)
3. **Component screenshot** (what you see)
4. **Environment check output** (from Test 4)
5. **Behavior description** (what you expected vs what happened)

---

## ✅ Final Verification

Run this complete test:

```bash
# 1. Check server is running
curl http://localhost:3000/borrow

# 2. Check env variables
grep -E "MORPHO|ORACLE|BORROWER" .env.local

# 3. Open in browser
open http://localhost:3000/borrow

# 4. Check browser console for errors
# 5. Verify loading → loaded transition
# 6. Confirm real data displays
# 7. Wait 15 seconds and verify auto-refresh
```

**All tests passing?** 🎉 Your Loan Health component is working perfectly!

---

## 📞 Need Help?

- Check the browser console first
- Verify .env.local configuration
- Test RPC connectivity
- Ensure contracts are deployed on VTE
- Verify borrower address has an actual position

Happy Testing! 🧪

