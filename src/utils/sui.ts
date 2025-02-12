import { SuiClient } from "@mysten/sui/client";

export const suiClient = new SuiClient({ url: process.env.SUI_RPC_URL || "https://fullnode.mainnet.sui.io:443" })

export function validateSuiAddress(address: string) {
  if (!address.startsWith("0x") || address.length !== 66) {
    throw new Error(`${address} is not a valid Sui address.`);
  }
}
