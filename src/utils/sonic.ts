import { Connection } from "@solana/web3.js";

export const sonicConnection = new Connection(process.env.SONIC_RPC_URL!, 'confirmed');
