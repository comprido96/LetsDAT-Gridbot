# Dual Grid Bot for Drift Protocol (BTC-PERP)

A fully automated dual-grid trading bot built for the Drift Protocol perpetual futures market (BTC-PERP).  
This bot implements a long-biased grid trading strategy designed to profit from volatility within a defined price range while maintaining continuous market exposure.

The bot automatically places grid-aligned long and take-profit orders based on the live oracle price, reacts to fills by rebalancing the grid, and operates safely using post-only orders.

## Features

✅ Dynamic grid setup with configurable range, leverage, and spacing  
✅ Automated reaction logic:
   
   • Opens new longs as price dips  
   
   • Takes profit and replaces longs as price rises  

✅ Supports Drift Protocol perpetual futures markets  
✅ Safe order placement using `postOnly` and size precision control  
✅ In-memory grid state tracking (orderId → grid level mapping)  
✅ Automatic re-entry and recovery after cancellations  
✅ Single order per grid level (no duplication)  
✅ Clean, modular TypeScript architecture

## Prerequisites

- Node.js v18+  
- Yarn or npm  
- Solana CLI configured with a funded wallet  
- Access to the Drift Protocol SDK (v2 or later)
- Environment variables for:
  • RPC endpoint (e.g., HELIUS or Drift RPC)
  • Private key or keypair file for trading wallet

## Setup

1. Clone the repository:

   git [clone https://github.com/yourname/drift-gridbot.git](https://github.com/comprido96/LetsDAT-Gridbot)
   cd LetsDAT-Gridbot

2. Install dependencies:

   yarn install
   # or
   npm install

4. Configure your environment:

   export ENDPOINT=your-rpc-url

   export ENV=devnet|mainnet-beta

   export ANCHOR_WALLET=path-to-your-wallet-json-keypair

5. Build the project:

   yarn build

## Usage

1. Launch the bot:

   npx esrun src/gridBot/deploy.ts --capital <btc-amount> --lower <lower-bound-price> --upper <upper-bound-price> --startPrice <center-price> /
     --levels <number-of-grid-levels> --leverage <trading-leverage>

3. Expected initial actions:

   • Open X BTC long at P0 (market)

   • Place Y take-profit limit sells above P0

   • Place 2Y buy limit longs below P0

   For example, X=0.004, Y=7 (take-profit limits are exactly half the buy limit longs)

5. Runtime behavior:

   • When a long limit fills → place TP one grid above

   • When a TP fills → place replacement long one grid below

7. Stop the bot:

   Ctrl + C

## Disclaimer

⚠️ This software executes real trades on Drift Protocol.  
Use at your own risk. The authors are not responsible for financial losses.  
Always test with a devnet or small size before using mainnet capital.
