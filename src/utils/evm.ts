import { ethers } from 'ethers';

export const EVM_CHAIN_IDS: Record<string, number> = {
  'eth': 1,
  'ethereum': 1,
  'base': 8453,
  'bnb': 56,
  'bsc': 56,
  'polygon': 137,
};

export const CHAIN_ID_TO_NAME: Record<number, string> = {
  1: 'eth',
  56: 'bnb',
  8453: 'base',
  137: 'polygon',
};

export function getEvmProvider(chain: string) {
  chain = chain.toLowerCase();
  if (chain === 'ethereum' || chain === 'eth') {
    return new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
  }
  if (chain === 'base') {
    return new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
  }
  if (chain === 'bnb' || chain === 'bsc') {
    return new ethers.JsonRpcProvider(process.env.BNB_RPC_URL);
  }
  if (chain === 'polygon') {
    return new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
  }
  throw new Error(`Unsupported EVM chain: ${chain}`);
}

export function validateEvmAddress(address: string) {
  if (!ethers.isAddress(address)) {
    throw new Error(`${address} is not a valid EVM address. If it's a ticker or symbol, please try to search for the corresponding token address first or ask user for it.`);
  }
}

export function validateEvmChain(chain: string) {
  if (!EVM_CHAIN_IDS[chain]) {
    throw new Error(`Unsupported EVM chain: ${chain}`);
  }
}

export function valiadateChainId(chainId: number) {
  if (!CHAIN_ID_TO_NAME[chainId]) {
    throw new Error(`Unsupported EVM chain id: ${chainId}`);
  }
}

export async function getTokenDecimals(chain: string, tokenAddress: string): Promise<number> {
  if (tokenAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
    return 18;
  }
  const provider = getEvmProvider(chain);
  const tokenContract = new ethers.Contract(
    tokenAddress,
    ['function decimals() view returns (uint8)'],
    provider
  );
  return await tokenContract.decimals();
}

// ethers.parseUnits but also works for strings like '1e-18'
export function parseUnits(amount: string|number, decimals: number) {
  try {
    return ethers.parseUnits(amount.toString(), decimals);
  } catch (error) {
    return ethers.parseUnits(Number(amount).toFixed(decimals), decimals);
  }
}
