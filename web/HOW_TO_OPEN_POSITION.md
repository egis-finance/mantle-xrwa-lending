# How to Open a Position - Complete Guide

## 🎯 Overview

To open a position in Egis Finance, you need to follow a **cross-chain process**:

1. **Lock USDY on Mantle** → Creates collateral
2. **Attestation happens** → USDY is attested as AcUSDY on Ethereum
3. **Supply collateral on Morpho Blue** → Deposit AcUSDY as collateral
4. **Borrow USDC** → Take a loan against your collateral

---

## 📋 Prerequisites

Before you can open a position, you need:

### ✅ Required Assets
- **USDY tokens** on Mantle network
- **ETH** for gas fees on Ethereum
- **MNT** for gas fees on Mantle

### ✅ Setup Requirements
- **Gnosis Safe wallet** (for multi-sig security)
- **Connected wallet** (MetaMask, WalletConnect, etc.)
- **Access to both networks:**
  - Mantle VTE (Chain ID: 15000)
  - Ethereum VTE (Chain ID: 10001)

---

## 🔄 The Process (Step-by-Step)

### **Step 1: Get USDY Tokens on Mantle**

First, you need USDY tokens. If you don't have any:

**Option A: For Testing (Tenderly VTE)**
```bash
# You'll need to either:
# 1. Mint USDY tokens directly (if you have minter role)
# 2. Get them from a faucet (if available)
# 3. Transfer from another address that has USDY
```

**Option B: For Production (Real Mantle Network)**
- Buy USDY from Ondo Finance
- Bridge USDY to Mantle network

---

### **Step 2: Lock USDY on Mantle → Get AcUSDY on Ethereum**

This is the **first transaction** that creates your collateral.

#### Via the UI (Borrow Page):

1. **Go to:** `http://localhost:3000/borrow`

2. **In the "Mantle RWA" section:**
   - See your USDY balance
   - Enter amount to lock (or click 25%, 50%, MAX)
   - Click **"Lock and Deposit"**

3. **What happens behind the scenes:**
   ```
   Mantle Network:
   ├─ Lock USDY in CollateralLocker contract
   ├─ Emit event for attestation
   └─ Wait for cross-chain message

   Ethereum Network:
   └─ AcUSDY minted to your address (1:1 with locked USDY)
   ```

#### Via Smart Contract (Advanced):

```typescript
// Contract: CollateralLocker on Mantle
// Address: process.env.NEXT_PUBLIC_MANTLE_LOCKER

// Function to call:
function lock(uint256 amount) external

// Steps:
// 1. Approve USDY to CollateralLocker
// 2. Call lock(amount)
```

**Current UI Status:** The "Lock and Deposit" button exists but **is not yet connected** to the smart contract. You'll need to implement this!

---

### **Step 3: Verify AcUSDY Received on Ethereum**

After locking, check your AcUSDY balance:

```bash
# Run the debug script
node scripts/debug-contracts-viem.mjs
```

Look for:
```
🏦 Testing Borrower Collateral...
✅ Position Found:
   Collateral: X.XXXX AcUSDY  ← Should be > 0
```

Or check in the UI:
- **"Attested Collateral"** section should show your AcUSDY balance

---

### **Step 4: Create Gnosis Safe Transaction Batch**

To open a position on Morpho Blue, you need to execute **3 transactions in a batch**:

#### Transaction 1: **Approve AcUSDY**
```typescript
// Contract: AcUSDY (ERC20)
// Function: approve(address spender, uint256 amount)

approve(
  MORPHO_ADDRESS,  // 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb
  amount           // Amount of AcUSDY to approve
)
```

#### Transaction 2: **Supply Collateral**
```typescript
// Contract: Morpho Blue
// Function: supplyCollateral(MarketParams, uint256, address, bytes)

supplyCollateral(
  marketParams,    // Market parameters struct
  amount,          // Amount of AcUSDY to supply
  borrower,        // Your address
  []               // Empty bytes
)
```

#### Transaction 3: **Borrow USDC**
```typescript
// Contract: Morpho Blue
// Function: borrow(MarketParams, uint256, uint256, address, address)

borrow(
  marketParams,    // Market parameters struct
  assets,          // Amount of USDC to borrow
  0,               // shares (0 = use assets)
  borrower,        // Your address (onBehalf)
  receiver         // Where to send USDC
)
```

---

### **Step 5: Sign & Execute in Gnosis Safe**

1. **Propose the batch transaction** to your Safe
2. **Get required signatures** from Safe owners
3. **Execute the transaction** on Ethereum
4. **Wait for confirmation** (~15 seconds)

---

## 💻 Implementation Guide

Since the UI buttons aren't connected yet, here's what needs to be implemented:

### **For the "Lock and Deposit" Button:**

Create a new file: `hooks/useLockCollateral.ts`

```typescript
'use client'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits } from 'viem'
import { contracts } from '@/lib/contracts'
import { CollateralLockerAbi } from '@/lib/contracts/abis/CollateralLocker'

export function useLockCollateral() {
  const { data: hash, writeContract, isPending, isError } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const lockCollateral = async (amount: string) => {
    const amountWei = parseUnits(amount, 18) // USDY has 18 decimals

    writeContract({
      address: contracts.collateralLocker.address,
      abi: CollateralLockerAbi,
      functionName: 'lock',
      args: [amountWei],
      chainId: contracts.collateralLocker.chainId,
    })
  }

  return {
    lockCollateral,
    isPending,
    isConfirming,
    isSuccess,
    isError,
    hash,
  }
}
```

### **For the "Propose Transaction" Button:**

This is more complex as it involves creating a Gnosis Safe batch transaction. You'll need:

1. **Safe SDK integration** (already in package.json)
2. **Encode the 3 transactions**
3. **Propose to Safe API**
4. **Monitor for signatures**

---

## 🧪 Testing Your Position

### **1. Quick Test (Using Scripts)**

```bash
# 1. Check current position
node scripts/debug-contracts-viem.mjs

# 2. Lock some USDY (you'll need to implement this)
# Then run debug script again

# 3. Verify AcUSDY balance increased
```

### **2. Test in UI**

```bash
# 1. Open borrow page
open http://localhost:3000/borrow

# 2. Check console for debug logs
# Open DevTools → Console

# 3. Look for:
🔍 useBorrowerCollateral: {
  collateralValue: "X.XX",  ← Should be > 0 after depositing
  ...
}
```

### **3. Test Loan Health Component**

After opening a position, your Loan Health component will show:

```
Collateral Value: $X,XXX
Total Debt: $Y,YYY
Current LTV: Z.Z%
Health Factor: H.HH
```

---

## 📊 Position Calculations

Once you have a position:

### **Safe Position (Recommended)**
- **Borrow up to:** 60% of collateral value
- **Example:** $100,000 collateral → Borrow max $60,000
- **Health Factor:** > 1.3 (safe)
- **Risk:** Low ✅

### **Warning Zone**
- **Borrow:** 67.5% - 75% of collateral value
- **Example:** $100,000 collateral → Borrow $67,500 - $75,000
- **Health Factor:** 1.0 - 1.1 (risky)
- **Risk:** High ⚠️

### **Liquidation**
- **At:** 75% LTV or higher
- **Example:** $100,000 collateral → Borrow $75,000+
- **Health Factor:** < 1.0 (danger!)
- **Risk:** Liquidation 🔴

---

## 🚨 Important Notes

### **Current Status**
The UI shows the **framework for opening positions**, but the actual transaction functionality is **not yet fully implemented**. Here's what exists:

✅ **Working:**
- Balance displays
- Input validation
- UI/UX for locking
- Loan health monitoring
- Transaction builder UI

❌ **Not Yet Connected:**
- Lock button transaction
- Safe batch creation
- Transaction signing
- Execution monitoring

### **What You Need to Do**

To actually open a position, you have **3 options**:

#### **Option 1: Implement UI Buttons (Recommended for Production)**
- Connect the "Lock and Deposit" button
- Implement Safe transaction batch creation
- Add transaction monitoring

#### **Option 2: Use Smart Contract Directly (Advanced)**
```bash
# Use cast (Foundry) or similar tool
cast send $LOCKER_ADDRESS \
  "lock(uint256)" $AMOUNT \
  --rpc-url $MANTLE_RPC \
  --private-key $PRIVATE_KEY
```

#### **Option 3: Use Tenderly Dashboard (For Testing)**
- Go to Tenderly dashboard
- Navigate to your VTE
- Call contract functions directly
- Monitor state changes

---

## 🔧 Quick Start Implementation

Want to quickly implement the lock functionality? Here's the minimal code:

### **1. Update borrow page button:**

```typescript
// In app/borrow/page.tsx, replace the Lock button with:

import { useLockCollateral } from '@/hooks/useLockCollateral'

// Inside component:
const { lockCollateral, isPending, isSuccess } = useLockCollateral()

const handleLockClick = async () => {
  if (!lockAmount || lockError) return
  await lockCollateral(lockAmount)
}

// Update button:
<Button 
  variant="mantle" 
  disabled={isLockDisabled || isPending}
  onClick={handleLockClick}
  className="w-full h-12 text-sm font-semibold shadow-lg shadow-mantle/20 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xl hover:scale-[1.01] transition-all"
>
  <Lock className="mr-2 h-4 w-4" /> 
  {isPending ? 'Locking...' : isSuccess ? 'Locked!' : 'Lock and Deposit'}
</Button>
```

### **2. Show success message:**

```typescript
{isSuccess && (
  <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
    <p className="text-green-700 font-medium">
      ✅ Collateral locked! Waiting for cross-chain attestation...
    </p>
  </div>
)}
```

---

## 📚 Resources

- **Morpho Blue Docs:** https://docs.morpho.org/
- **Gnosis Safe SDK:** https://docs.safe.global/sdk
- **Viem Docs:** https://viem.sh/
- **Wagmi Docs:** https://wagmi.sh/

---

## 🎯 Summary

**To open a position, you need to:**

1. ✅ Have USDY on Mantle
2. ✅ Lock USDY → Get AcUSDY on Ethereum
3. ✅ Create Safe batch transaction:
   - Approve AcUSDY
   - Supply collateral to Morpho
   - Borrow USDC
4. ✅ Execute transaction
5. ✅ Monitor your position in the UI

**Current UI Status:**
- 🟡 Framework exists
- 🔴 Buttons not connected
- 🟢 Can be implemented quickly

**Next Step:** Implement the `useLockCollateral` hook and connect the buttons!

---

Need help implementing? Let me know which part you want to tackle first! 🚀

