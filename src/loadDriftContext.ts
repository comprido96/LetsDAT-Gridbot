import {Connection} from "@solana/web3.js";
import {Wallet, loadKeypair, DriftClient, DriftEnv} from "@drift-labs/sdk";


export type DriftContext = {
    connection: Connection,
    wallet: Wallet,
    driftClient: DriftClient,
}

console.log(`${process.env.ENDPOINT}`);
const connection = new Connection(`${process.env.ENDPOINT}`, 'confirmed');

const keyPairFile = `${process.env.ANCHOR_WALLET}`;
const wallet = new Wallet(loadKeypair(keyPairFile));

console.log(wallet.publicKey.toBase58());

const driftClient = new DriftClient({
  connection,
  wallet,
  env: `${process.env.ENV}` as DriftEnv,
});

export const loadDriftContext = () => {
    const driftContext: DriftContext = {
        connection,
        wallet,
        driftClient,
    };
    return driftContext;
}
