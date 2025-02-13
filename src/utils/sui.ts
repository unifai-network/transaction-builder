import { SuiClient } from "@mysten/sui/client";
import { isValidSuiAddress } from "@mysten/sui/utils";

export const suiClient = new SuiClient({ url: process.env.SUI_RPC_URL || "https://fullnode.mainnet.sui.io:443" })

export function validateSuiAddress(address: string) {
  if (!isValidSuiAddress(address)) {
    throw new Error(`${address} is not a valid Sui address. If it's a ticker or symbol, please try to search for the corresponding token address first or ask user for it.`);
  }
}

export async function validateSuiCoinType(coinType: string) {
  let coinTypeObject;
  try {
    coinTypeObject = await suiClient.getCoinMetadata({ coinType });
  } catch (error) {
    throw new Error(`Error validating Sui coin type: ${error}`);
  }
  if (!coinTypeObject) {
    throw new Error(`${coinType} is not a valid Sui coin type.`);
  }
}

