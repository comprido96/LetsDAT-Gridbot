import {
  BN,
  convertToNumber,
  DriftClient,
  MarketType,
  Order,
  OrderTriggerCondition,
  OrderType,
  PositionDirection,
  QUOTE_PRECISION,
  User,
  UserAccount,
} from "@drift-labs/sdk";
import { OrderBookEvent } from "./events/types";
import { OrderBookEmitter } from "./events/subscriber";
import { confirmTransaction, placePerpOrderWithRetry } from "./utils";
import { BotConfig } from "./types";


class DualGridBot {
  private driftClient: DriftClient;
  private user: User;
  private userAccount: UserAccount;
  private userAccountPublicKey: string;

  private emitter: OrderBookEmitter;
  private perpMarketIndex: number;
  private spotMarketIndex: number;

  private config: BotConfig;
  private P0: number;
  private currentPrice: number;
  private gridPrices: number[];

  private orders = new Map<number, { order: Order, status: any }>();

  constructor(
    driftClient: DriftClient,
    userAccountPublicKey: string,
    emitter: OrderBookEmitter,
    perpMarketIndex: number,
    spotMarketIndex: number,
    config: BotConfig,
  ) {
    this.driftClient = driftClient;
    this.user = this.driftClient.getUser();
    this.userAccount = this.user.getUserAccount();
    this.userAccountPublicKey = userAccountPublicKey;

    this.userAccountPublicKey = userAccountPublicKey;
    this.emitter = emitter;
    this.perpMarketIndex = perpMarketIndex;
    this.spotMarketIndex = spotMarketIndex;
    this.config = config;
    this.P0 = this.driftClient.getOracleDataForPerpMarket(this.perpMarketIndex).price.toNumber() / QUOTE_PRECISION;
    this.currentPrice = this.P0;

    this.gridPrices = this.generateGridPrices();
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.emitter.on('order_record', this.handleOrderRecord.bind(this));
    this.emitter.on('order_fill', this.handleOrderFill.bind(this));
    this.emitter.on('order_cancel', this.handleOrderCancel.bind(this));
  }

  private async handleOrderRecord(event: any) {
    console.log("handleOrderRecord ->> order_record received.");

    let user: string = event.user.toString();
    if(user!=this.userAccountPublicKey) {
      return;
    }

    let order: Order = event.order;
    const orderId = order.orderId;

    this.orders.set(orderId, { order: order, status: 'new' });
    console.log(`handleOrderRecord ->> user: ${user} | orders: (${orderId} -> ${this.orders.get(orderId)?.status})`);
  }

  private async handleOrderCancel(event: any) {
    console.log("handleOrderCancel ->> order_cancel received.");
  }

  private async handleOrderFill() {
    console.log("handleOrderFill ->> order_fill received.");
  }

  private generateGridPrices(): number[] {
    const { r, numLevels, } = this.config;
    const gridSpacing = this.P0 * r;
    console.log(`P0: ${this.P0} | r: ${r} | numLevels: ${numLevels} | gridSpacing: ${gridSpacing}`);

    console.log("downPrices:");
    const downPrices: number[] = [];
    for (let k = 1; k <= numLevels; k++) {
      const price = this.P0 - (k * gridSpacing);
      downPrices.push(price);
      console.log(`Price: ${price}`);
    }
    console.log("upPrices:");
    const upPrices: number[] = [];
    for (let k = 1; k <= numLevels; k++) {
      const price = this.P0 + (k * gridSpacing);
      upPrices.push(price);
      console.log(`Price: ${price}`);
    }

    return [...downPrices, this.P0, ...upPrices].sort((a, b) => a - b);
  }

  public async placeInitialOrders(): Promise<void> {
    console.log("DualGridBot ->> placeInitialOrders");

    let orderParamsList: any[] = [];

    // Long Grid: Buy limits below current price (open long), will place sell to close above later
    const belowPrices = this.gridPrices.filter(p => p < this.currentPrice);
    for (const p of belowPrices) {
      const size = this.calculatePositionSize(p);
      console.log(`size: ${size} | p: ${p}`);

      const orderParams = {
        orderType: OrderType.LIMIT,
        marketType: MarketType.PERP,
        marketIndex: this.perpMarketIndex,
        direction: PositionDirection.LONG,
        baseAssetAmount: this.driftClient.convertToPerpPrecision(size),
        price: this.driftClient.convertToPricePrecision(p),
        reduceOnly: false,
      };
      orderParamsList.push(orderParams);

      console.log(`amount: ${orderParams.baseAssetAmount} | price: ${orderParams.price}`);
    }

    const abovePrices = this.gridPrices.filter(p => p > this.currentPrice);
    for (const p of abovePrices) {
      const size = this.calculatePositionSize(p);
      console.log(`size: ${size} | p: ${p}`);

      const orderParams = {
        orderType: OrderType.LIMIT,
        marketType: MarketType.PERP,
        marketIndex: this.perpMarketIndex,
        direction: PositionDirection.SHORT,
        baseAssetAmount: this.driftClient.convertToPerpPrecision(size),
        price: this.driftClient.convertToPricePrecision(p),
        reduceOnly: false,
      };
      orderParamsList.push(orderParams);

      console.log(`amount: ${orderParams.baseAssetAmount} | price: ${orderParams.price}`);
    }

    console.log("placing orders...");
    const txSig = await this.driftClient.placeOrders(orderParamsList);
    console.log("done.\nAwaiting tx confirmation...");
    await confirmTransaction(this.driftClient, txSig);
    console.log(`Tx confirmed: tx:${txSig}`);

    return;
  }

  private calculatePositionSize(p: number): number {
    const { B, L, numLevels} = this.config;
    const fixedUsd = (B * L) / (numLevels * 2);
    console.log(`fixedUsd: ${fixedUsd} | p: ${p}`);
    return fixedUsd / p;
  }

  public getStatus() {}
}


export async function initializeDualGridBot(
  driftClient: DriftClient,
  userAccountPublicKey: string,
  emitter: OrderBookEmitter,
  perpMarketIndex: number,
  spotMarketIndex: number,
  config: BotConfig,
): Promise<DualGridBot> {
  const bot = new DualGridBot(
    driftClient,
    userAccountPublicKey,
    emitter,
    perpMarketIndex,
    spotMarketIndex,
    config,
  );
  await bot.placeInitialOrders();
  console.log('Dual Grid Bot initialized and launched.');
  console.log('Bot Status:', bot.getStatus());
  return bot;
}
