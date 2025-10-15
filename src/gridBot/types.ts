import { BN, MarketType, OrderType, PositionDirection, DriftClient, TxParams } from "@drift-labs/sdk";


export interface GridOrder {
  orderType: OrderType;
  marketType: MarketType;
  marketIndex: number;
  direction: PositionDirection;
  baseAssetAmount: BN;
  price: BN;
  reduceOnly: boolean;
}


export interface BotConfig {
  r: number; // Grid ratio (e.g., 0.95 for 5% downward intervals)
  B: number; // Initial capital in USD (e.g., 100000 for 1 BTC at P0)
  L: number; // Leverage (e.g., 50)
  numLevels: number; // grid levels per side (LONG/SHORT)
}


export interface Order {
  type: 'buy' | 'sell'; // Limit order type
  price: number; // Grid price level
  size: number; // Position size in BTC
  isOpen: boolean; // For tracking if it's an opening or closing order
}


export interface PlacePerpOrderWithRetryParams {
  driftClient: DriftClient;
  orderParams: any;
  maxRetries?: number;
  confirmationTimeout?: number;
  txParams?: TxParams;
  subAccountId?: number;
}
