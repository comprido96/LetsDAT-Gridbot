import {
  BN,
  DriftClient,
  MarketType,
  Order,
  OrderType,
  PositionDirection,
  QUOTE_PRECISION,
} from "@drift-labs/sdk";
import { OrderBookEvent } from "./events/types";
import { OrderBookEmitter } from "./events/subscriber";
import { confirmTransaction, placePerpOrderWithRetry } from "./utils";
import { BotConfig, GridLevel } from "./types";


class DualGridBot {
  private driftClient: DriftClient;
  private userAccountPublicKey: string;

  private emitter: OrderBookEmitter;
  private perpMarketIndex: number;
  private spotMarketIndex: number;

  private config: BotConfig;
  private currentPrice: number;
  private gridSpace: number;
  private gridPositionSize: number;
  private downLevels: number;
  private upLevels: number;

  private gridLevels: GridLevel[] = [];

  private orderIdToGridIndex = new Map<number, number>();
  private orderIdToType = new Map<number, 'initial-long' | 'grid-long' | 'take-profit'>();


  constructor(
    driftClient: DriftClient,
    userAccountPublicKey: string,
    emitter: OrderBookEmitter,
    perpMarketIndex: number,
    spotMarketIndex: number,
    config: BotConfig,
  ) {
    this.driftClient = driftClient;
    this.userAccountPublicKey = userAccountPublicKey;

    this.userAccountPublicKey = userAccountPublicKey;
    this.emitter = emitter;
    this.perpMarketIndex = perpMarketIndex;
    this.spotMarketIndex = spotMarketIndex;
    this.config = config;
    this.currentPrice = this.driftClient.getOracleDataForPerpMarket(this.perpMarketIndex).price.div(QUOTE_PRECISION).toNumber();
    this.gridSpace = (this.config.priceUp - this.config.priceDown) / this.config.numGrids;
    this.gridPositionSize = this.config.B * this.config.L / this.config.numGrids;

    this.upLevels = (this.config.priceUp - this.config.P0) / this.gridSpace;
    this.downLevels = (this.config.P0 - this.config.priceDown) / this.gridSpace; 

    this.gridLevels = this.generateGridLevels();

    this.setupEventHandlers();

    console.log(`currentPrice:${this.currentPrice} gridSpace:${this.gridSpace} gridPositionSize:${this.gridPositionSize}`);
    console.log(`Generated ${this.gridLevels.length} grid levels`, this.gridLevels);
  }

  private setupEventHandlers() {
    this.emitter.on('order_record', this.handleOrderRecord.bind(this));
    this.emitter.on('order_fill', this.handleOrderFill.bind(this));
    this.emitter.on('order_cancel', this.handleOrderCancel.bind(this));
  }

  private async handleOrderRecord(event: any) {
    const user = event.user.toString();
    if (user !== this.userAccountPublicKey) return;

    const order: Order = event.order;
    const orderId = order.orderId;
    const price = order.price.toNumber() / QUOTE_PRECISION.toNumber();

    console.log(`📗 OrderRecord: orderId=${orderId}, price=${price}, direction=${order.direction}`);

    // ✅ Detect if this is the initial market order (price = 0 in Drift SDK)
    if (order.orderType === OrderType.MARKET) {
      this.orderIdToType.set(orderId, 'initial-long');
      console.log(`↳ ✅ Mapped as initial market long`);
      return;
    }

    // ✅ Find the grid level this order belongs to (closest match)
    const gridIndex = this.gridLevels.findIndex(l => Math.abs(l.price - price) < this.gridSpace / 2);
    if (gridIndex === -1) {
      console.warn(`⚠️ Could not map order ${orderId} to any grid level`);
      return;
    }

    // ✅ Save grid mapping
    this.orderIdToGridIndex.set(orderId, gridIndex);

    // ✅ Store by direction type
    if (order.direction === PositionDirection.LONG) {
      this.orderIdToType.set(orderId, 'grid-long');
      this.gridLevels[gridIndex].longOrderId = orderId;
      console.log(`↳ ✅ Linked LONG @ ${price} to grid[${gridIndex}]`);
    } else if (order.direction === PositionDirection.SHORT) {
      this.orderIdToType.set(orderId, 'take-profit');
      this.gridLevels[gridIndex].tpOrderId = orderId;
      console.log(`↳ ✅ Linked TAKE PROFIT @ ${price} to grid[${gridIndex}]`);
    }
  }

  private async handleOrderCancel(event: any) {
    const orderId = event?.event?.orderId;
    if (!orderId) return;

    console.log(`⚠️ Order cancelled: ${orderId}`);

    const gridIndex = this.orderIdToGridIndex.get(orderId);
    if (gridIndex === undefined) return;

    const type = this.orderIdToType.get(orderId);

    if (type === 'grid-long') {
      console.log(`↳ Removing cancelled LONG from grid[${gridIndex}]`);
      this.gridLevels[gridIndex].longOrderId = undefined;
      this.gridLevels[gridIndex].status = 'idle';
    }

    if (type === 'take-profit') {
      console.log(`↳ Removing cancelled TP from grid[${gridIndex}]`);
      this.gridLevels[gridIndex].tpOrderId = undefined;
      if (!this.gridLevels[gridIndex].longOrderId) {
        this.gridLevels[gridIndex].status = 'idle';
      }
    }

    // Cleanup
    this.orderIdToGridIndex.delete(orderId);
    this.orderIdToType.delete(orderId);
  }

  private async handleOrderFill(event: OrderBookEvent) {
    console.log("✅ handleOrderFill triggered");

    const fillEvent = event.event;
    const orderId = fillEvent?.orderId;
    if (!orderId) return;

    const orderType = this.orderIdToType.get(orderId);
    const gridIndex = this.orderIdToGridIndex.get(orderId);

    console.log(`→ Filled orderId=${orderId}, type=${orderType}, gridIndex=${gridIndex}`);

    // ✅ A: Initial market order (ignore, already has TPs)
    if (orderType === 'initial-long') {
      console.log("ℹ️ Initial long filled, no action needed.");
      return;
    }

    // ✅ Case B: A GRID LONG got filled → place take profit above
    if (orderType === 'grid-long' && gridIndex !== undefined) {
      this.gridLevels[gridIndex].status = 'paired';
      this.gridLevels[gridIndex].longOrderId = undefined;

      const tpIndex = gridIndex + 1;
      if (tpIndex < this.gridLevels.length) {
        await this.placeTakeProfit(gridIndex, tpIndex);
      } else {
        console.log("⚠️ No higher grid for take profit.");
      }
      return;
    }

    // ✅ C: Take Profit filled → place a replacement grid long below
    if (orderType === 'take-profit' && gridIndex !== undefined) {
      this.gridLevels[gridIndex].tpOrderId = undefined;
      this.gridLevels[gridIndex].status = 'idle';

      const newLongIndex = gridIndex - 1;
      if (newLongIndex >= 0) {
        await this.placeGridLong(newLongIndex);
      } else {
        console.log("⚠️ No lower grid level to place replacement LONG.");
      }
      return;
    }

    console.log("📊 GRID STATE:", this.getStatus());
  }

  private async placeTakeProfit(fromIndex: number, toIndex: number) {
    const nextLevel = this.gridLevels[toIndex];

    console.log(`📈 Placing Take Profit at ${nextLevel.price}`);

    const orderParams = {
      orderType: OrderType.LIMIT,
      marketType: MarketType.PERP,
      marketIndex: this.perpMarketIndex,
      direction: PositionDirection.SHORT,
      baseAssetAmount: this.toPreciseSize(this.gridPositionSize),
      price: this.toPrecisePrice(nextLevel.price),
      reduceOnly: true,
      postOnly: true,
    };

    const tx = await placePerpOrderWithRetry({ driftClient: this.driftClient, orderParams });
    console.log(`✅ TP placed: ${tx}`);

    this.gridLevels[fromIndex].status = 'tp_open';
  }

  private async placeGridLong(gridIndex: number) {
    const level = this.gridLevels[gridIndex];

    console.log(`📉 Placing replacement LONG at ${level.price}`);

    const orderParams = {
      orderType: OrderType.LIMIT,
      marketType: MarketType.PERP,
      marketIndex: this.perpMarketIndex,
      direction: PositionDirection.LONG,
      baseAssetAmount: this.toPreciseSize(this.gridPositionSize),
      price: this.toPrecisePrice(level.price),
      reduceOnly: false,
      postOnly: true,
    };

    const tx = await placePerpOrderWithRetry({ driftClient: this.driftClient, orderParams });
    console.log(`✅ Replacement LONG placed: ${tx}`);

    this.gridLevels[gridIndex].status = 'long_open';
  }

  private generateGridLevels(): GridLevel[] {
    const levels: GridLevel[] = [];
    for (let i = 0; i < this.config.numGrids; i++) {
      const price = this.config.priceDown + i * this.gridSpace;
      levels.push({
        price,
        status: 'idle'
      });
    }
    return levels;
  }

  public async placeInitialOrders(): Promise<void> {
    console.log("DualGridBot ->> placeInitialOrders");

    // ✅ Track orders to send in a single tx
    const orders: any[] = [];

    // ✅ 1. Place initial market long (2 BTC)
    const initialLongSize = this.downLevels * this.gridPositionSize;
    orders.push({
      orderType: OrderType.MARKET,
      marketType: MarketType.PERP,
      marketIndex: this.perpMarketIndex,
      direction: PositionDirection.LONG,
      baseAssetAmount: this.toPreciseSize(initialLongSize),
      reduceOnly: false,
    });

    // ✅ 2. Take profit sells for initial long (10 levels above P0)
    let tpCount = 0;
    for (let i = 0; i < this.gridLevels.length; i++) {
      const level = this.gridLevels[i];
      if (level.price > this.config.P0 && tpCount < this.upLevels) {
        orders.push({
          orderType: OrderType.LIMIT,
          marketType: MarketType.PERP,
          marketIndex: this.perpMarketIndex,
          direction: PositionDirection.SHORT,
          baseAssetAmount: this.toPreciseSize(this.gridPositionSize),
          price: this.toPrecisePrice(level.price),
          postOnly: true,
          reduceOnly: true,
        });
        level.status = 'tp_open';
        tpCount++;
      }
    }

    // ✅ 3. Place buy grid below P0 (no take profits yet)
    for (let i = 0; i < this.gridLevels.length; i++) {
      const level = this.gridLevels[i];
      if (level.price < this.config.P0) {
        orders.push({
          orderType: OrderType.LIMIT,
          marketType: MarketType.PERP,
          marketIndex: this.perpMarketIndex,
          direction: PositionDirection.LONG,
          baseAssetAmount: this.toPreciseSize(this.gridPositionSize),
          price: this.toPrecisePrice(level.price),
          postOnly: true,
          reduceOnly: false,
        });
        level.status = 'long_open';
      }
    }

    console.log(`Placing ${orders.length} initial grid orders...`);
    const txSig = await this.driftClient.placeOrders(orders);
    console.log(`✅ Orders submitted: ${txSig}`);
    await confirmTransaction(this.driftClient, txSig);
    console.log(`✅ Initial grid setup on-chain`);
  }

  private toPrecisePrice(price: number): BN {
    return this.toPrecisePrice(
      Math.round(price * 100) / 100 // ✅ round to 2 decimals to prevent precision issues
    );
  }

  private toPreciseSize(size: number): BN {
    return this.toPreciseSize(Math.max(size, 0.0001)); // ✅ avoid too small size rejection
  }

  public getStatus() {
    return this.gridLevels.map((lvl, i) => ({
      grid: i,
      price: lvl.price,
      status: lvl.status,
      longOrderId: lvl.longOrderId,
      tpOrderId: lvl.tpOrderId,
    }));
  }
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
