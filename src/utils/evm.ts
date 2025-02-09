import { ethers } from 'ethers';

export const EVM_CHAIN_IDS: Record<string, number> = {
  'ethereum': 1,
  'base': 8453,
};

export function getEvmProvider(chain: string) {
  if (chain === 'ethereum') {
    return new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
  }
  if (chain === 'base') {
    return new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
  }
  throw new Error(`Unsupported EVM chain: ${chain}`);
}

export function validateEvmAddress(address: string) {
  if (!ethers.isAddress(address)) {
    throw new Error('Invalid EVM address');
  }
}

export function validateEvmChain(chain: string) {
  if (!EVM_CHAIN_IDS[chain.toLowerCase()]) {
    throw new Error(`Unsupported EVM chain: ${chain}`);
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
