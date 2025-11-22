# Egis Finance Web App

This is the frontend for Egis Finance, built with Next.js, Tailwind CSS, and Wagmi.

## Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install --legacy-peer-deps
    ```
    *(Note: `--legacy-peer-deps` is required due to a React version conflict with the Safe SDK)*

2.  **Run the Development Server:**
    ```bash
    npm run dev
    ```

3.  **Open the App:**
    Visit [http://localhost:3000](http://localhost:3000) in your browser.

## Available Pages

*   **Borrower Dashboard:** [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
    *   Manage cross-chain collateral and Gnosis Safe transactions.
*   **Lender Yield:** [http://localhost:3000/earn](http://localhost:3000/earn)
    *   Supply USDC and view risk metrics.
*   **Admin Mission Control:** [http://localhost:3000/admin](http://localhost:3000/admin)
    *   Monitor system health, TVL peg, and liquidations.

## Tech Stack

*   **Framework:** Next.js 15 (App Router)
*   **Styling:** Tailwind CSS + Shadcn/ui (Customized)
*   **Web3:** Wagmi, Viem, RainbowKit
*   **Safe:** @safe-global/safe-apps-sdk
