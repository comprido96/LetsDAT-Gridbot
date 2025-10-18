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
  priceDown: number;
  priceUp: number;
  P0: number;
  B: number; // Initial capital in USD (e.g., 100000 for 1 BTC at P0)
  L: number; // Leverage (e.g., 50)
  numGrids: number; // Number of active grids/orders (e.g., 50)
  // numDown: number; // Approx downward levels for span (e.g., 25 for symmetry)
  // numUp: number; // Approx upward levels for span (e.g., 25)
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


export interface LongPosition {
  orderId: number;
  price: number;
  size: number;
  isInitial: boolean;
}


export interface TakeProfitPosition {
  orderId: number;
  price: number;
  size: number;
}


export interface TradePair {
  longPosition?: LongPosition,
  takeProfitPosition?: TakeProfitPosition,
}


export interface GridLevel {
  price: number; // Grid price level
  longOrderId?: number; // Order ID of LONG at this grid (if any)
  tpOrderId?: number; // Order ID of take profit SHORT at next grid
  status: 'idle' | 'long_open' | 'tp_open' | 'paired';
}
