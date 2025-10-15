import { EventSubscriber, EventSubscriptionOptions, isVariant } from "@drift-labs/sdk";
import EventEmitter from "events";
import { isPerpMarketFill } from "../utils";
import { OrderCancelEvent, OrderFillEvent } from "./types";
import { loadDriftContext } from "../../loadDriftContext";


export class OrderBookEmitter extends EventEmitter {
  private subscriber: EventSubscriber;
  private perpMarketIndex: number;
  private filters: any;

  constructor(subscriber: EventSubscriber, perpMarketIndex: number, filters: any) {
    super();
    this.subscriber = subscriber;
    this.perpMarketIndex = perpMarketIndex;
    this.filters = filters;
    this.setupListeners();
  }

  private setupListeners() {
    console.log("OrderBookEmitter ->> setupListeners");
    this.subscriber.eventEmitter.on('newEvent', (event: any) => {
      if (event.eventType === 'OrderActionRecord') {
        if (isPerpMarketFill(event, this.perpMarketIndex,)) {
          const fillEvent: OrderFillEvent = {
            type: 'order_fill',
            event: event,
          };

          let filler = fillEvent.event.filler;
          let taker = fillEvent.event.taker;
          let maker = fillEvent.event.maker;
          
          const address: string = this.filters.userAccountPublicKey.toString();
          if(!address) { return; }
          if(filler && address==filler.toString()) {
            this.emit('order_fill', fillEvent);
          }
          if(taker && address==taker.toString()) {
            this.emit('order_fill', fillEvent);
          }
          if(maker && address==maker.toString()) {
            this.emit('order_fill', fillEvent);
          }
          return;
        } else if (isVariant(event.action, 'cancel')) {
            const cancelEvent: OrderCancelEvent = {
              type: 'order_cancel',
              event: event,
            };

            this.emit('order_cancel', cancelEvent);
            return;
          }
      }

      if (event.eventType === 'OrderRecord') {
        this.emit("order_record", event);
        return;
      }
    });
  }

  async destroy() {
    await this.subscriber.unsubscribe();
  }
}

export async function createOrderBookEmitter(perpMarketIndex: number) {
  const { connection, driftClient } = loadDriftContext();
  const address = await driftClient.getUserAccountPublicKey();
  const options: EventSubscriptionOptions = {
    address: address,
    eventTypes: ['OrderRecord', 'OrderActionRecord'],
    maxTx: 4096,
    maxEventsPerType: 4096,
    orderBy: 'blockchain',
    orderDir: 'asc',
    commitment: 'confirmed',
    logProviderConfig: { type: 'websocket' },
  };
  const subscriber = new EventSubscriber(connection, driftClient.program, options);
  await subscriber.subscribe();

  return new OrderBookEmitter(subscriber, perpMarketIndex, { userAccountPublicKey: address });
}
