import { BN, PositionDirection } from "@drift-labs/sdk";

export interface TrackedOrder {
  userOrderId: number;
  marketIndex: number;
  direction: PositionDirection;
  price: BN;
  baseAssetAmount: BN;
  reduceOnly: boolean;
  orderType: any;
  placedAt: Date;
}

export type OrderFillEvent = {
  type: 'order_fill';
  event: any;
};

export type OrderCancelEvent = {
  type: 'order_cancel';
  event: any;
};

export type OrderBookEvent = OrderFillEvent | OrderCancelEvent;
