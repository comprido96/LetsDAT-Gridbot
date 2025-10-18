import { BotConfig } from "./types";
import { initializeDualGridBot } from "./grid";
import { loadDriftContext } from "../loadDriftContext";
import { createOrderBookEmitter } from "./events/subscriber";
import { BN, MarketType, Order, OrderTriggerCondition, OrderType, PositionDirection } from "@drift-labs/sdk";
import { confirmTransaction } from "./utils";


const config: BotConfig = {
  priceDown: 93_000,
  priceUp: 114_000,
  P0: 107_000,
  B: 0.004, // Initial capital USD (1 BTC equivalent)
  L: 1, // Leverage
  numGrids: 21,
  // numDown: 4, // For ~50 total active
  // numUp: 4,
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
