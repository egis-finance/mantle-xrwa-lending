# Egis Finance Web App

This is the frontend for Egis Finance, built with Next.js, Tailwind CSS, and Dynamic SDK.

## Getting Started

From the repo root:

```bash
cp .env.example .env
# edit .env with your values
./scripts/generate-web-env.sh

cd web
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Available Pages

- **Home:** [http://localhost:3000/](http://localhost:3000/)
- **Borrow:** [http://localhost:3000/borrow](http://localhost:3000/borrow)
- **Dashboard:** [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- **Lend:** [http://localhost:3000/lend](http://localhost:3000/lend)

## Tech Stack

*   **Framework:** Next.js 16 (App Router)
*   **Wallet:** Dynamic SDK ^4.47.0 (embedded wallets)
*   **Data Layer:** SWR, viem
*   **Styling:** Tailwind CSS 4 + Shadcn/ui
