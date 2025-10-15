import { Commitment } from '@solana/web3.js';
import { DriftClient, isVariant, Order } from "@drift-labs/sdk";
import { PlacePerpOrderWithRetryParams } from "./types";


export const isPerpMarketFill = (
  event: any,
  marketIndex: number,
): event is { order: Order; action: 'fill' } => {
  if (event.eventType !== 'OrderActionRecord') {
    return false;
  }

  if (event.marketIndex !== marketIndex) {
    return false;
  }

  if (!isVariant(event.marketType, 'perp')) {
    return false;
  }

  if (!isVariant(event.action, 'fill')) {
    return false;
  }

  return true;
};

export async function confirmTransaction(
  client: DriftClient,
  txSig: string,
  commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed',
) {
  const connection = client.connection;
  const latestBlockHash = await connection.getLatestBlockhash();

  await connection.confirmTransaction({
    signature: txSig,
    blockhash: latestBlockHash.blockhash,
    lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
  }, commitment?? "confirmed");
}

async function confirmTransactionWithTimeout(
  driftClient: DriftClient, 
  txSig: string, 
  timeoutMs: number, 
  commitment: Commitment = 'confirmed'
): Promise<void> {
  const connection = driftClient.connection;
  const latestBlockHash = await connection.getLatestBlockhash();

  await Promise.race([
    connection.confirmTransaction({
      signature: txSig,
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    }, commitment),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Transaction confirmation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

export async function placePerpOrderWithRetry({
  driftClient,
  orderParams,
  maxRetries = 3,
  confirmationTimeout = 30000,
  txParams,
  subAccountId,
}: PlacePerpOrderWithRetryParams): Promise<string> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Placing perp order (attempt ${attempt}/${maxRetries})`);

      const currentTimeout = confirmationTimeout * attempt;
      const txSig = await driftClient.placePerpOrder(orderParams, txParams, subAccountId);
      
      console.log(`Order placed, confirming transaction: ${txSig} (timeout: ${currentTimeout}ms)`);
      await confirmTransactionWithTimeout(driftClient, txSig, currentTimeout, 'confirmed');
      
      console.log(`Order successfully placed and confirmed on attempt ${attempt}`);
      return txSig;
      
    } catch (error) {
      let e: Error = error as Error;
      lastError = e;
      console.warn(`Attempt ${attempt} failed:`, lastError.message);
      
      if (lastError.message.includes('timed out') || lastError.message.includes('not confirmed')) {
        try {
          const potentialTxSig = extractTxSigFromError(lastError);
          if (potentialTxSig) {
            const status = await driftClient.connection.getSignatureStatus(potentialTxSig);
            if (status.value && status.value.confirmationStatus === 'confirmed') {
              console.log(`Transaction ${potentialTxSig} was actually successful despite timeout`);
              return potentialTxSig;
            }
          }
        } catch (statusError) {
          let e: Error = statusError as Error;
          console.warn('Could not verify transaction status:', e.message);
        }
      }
      
      if (attempt === maxRetries) {
        throw new Error(`Failed to place order after ${maxRetries} attempts. Last error: ${lastError.message}`);
      }
      
      const backoffTime = 2000 * Math.pow(2, attempt - 1);
      console.log(`Waiting ${backoffTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, backoffTime));
    }
  }
  
  throw lastError || new Error('Unknown error in placePerpOrderWithRetry');
}

function extractTxSigFromError(error: Error): string | null {
  // Look for transaction signature in error message
  const signatureRegex = /[1-9A-HJ-NP-Za-km-z]{32,88}/;
  const match = error.message.match(signatureRegex);
  return match ? match[0] : null;
}
