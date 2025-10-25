import { BotConfig } from "./types";
import { initializeDualGridBot } from "./grid";
import { loadDriftContext } from "../loadDriftContext";
import { createOrderBookEmitter } from "./events/subscriber";
import { BN, MarketType, Order, OrderTriggerCondition, OrderType, PositionDirection } from "@drift-labs/sdk";
import { confirmTransaction } from "./utils";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";


// Parse CLI arguments
const argv = yargs(hideBin(process.argv))
  .option("capital", {
    alias: "c",
    type: "number",
    required: true, // 0.004
    description: "Total capital in USDC"
  })
  .option("lower", {
    alias: "l",
    type: "number",
    required: true, // 94_000
    description: "Lower bound price"
  })
  .option("upper", {
    alias: "u",
    type: "number",
    required: true, // 115_000
    description: "Upper bound price"
  })
  .option("startPrice", {
    alias: "p0",
    type: "number",
    required: true, // 108_000
    description: "center price"
  })
  .option("levels", {
    alias: "n",
    type: "number",
    required: true, // 21
    description: "Number of grid levels"
  })
  .option("leverage", {
    alias: "lvg",
    type: "number",
    default: 1,
    description: "Leverage"
  })
  .parseSync();

const config: BotConfig = {
  priceDown: argv.lower,
  priceUp: argv.upper,
  P0: argv.startPrice,
  B: argv.capital, // Initial capital USD (1 BTC equivalent)
  L: argv.leverage, // Leverage
  numGrids: argv.levels,
};

const BTC = 2; // devnet
const wBTC = 3;  // mainnet

const perpMarketIndex = 1;
const spotMarketIndex = wBTC;

async function main() {
  const { driftClient } = loadDriftContext();
  await driftClient.subscribe();
  let userAccountPublicKey = (await driftClient.getUserAccountPublicKey()).toString();
  console.log(`main ->> userAccountPublicKey: ${userAccountPublicKey}`);

  console.log(`main ->> driftClient subscribed.`);
  const emitter = await createOrderBookEmitter(perpMarketIndex);
  console.log(`main ->> created emitter and manager.`);

  const bot = await initializeDualGridBot(
      driftClient,
      userAccountPublicKey,
      emitter,
      perpMarketIndex,
      spotMarketIndex,
      config,
  )
  console.log("main ->> initialized grid bot.");

  process.on('SIGINT', async () => {
    process.exit(0);
  });
}

main()
.catch(console.error)
