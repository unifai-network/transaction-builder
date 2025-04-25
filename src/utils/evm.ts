import { ERC20Abi__factory } from '../contracts/types';
import { ethers } from 'ethers';

export const EVM_CHAIN_IDS: Record<string, number> = {
  'eth': 1,
  'ethereum': 1,
  'base': 8453,
  'bnb': 56,
  'bsc': 56,
  'polygon': 137,
};

export const USDC_CHAIN_ADDRESS: Record<string, string> = {
  'eth': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  'ethereum': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'bnb': '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
};

export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

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

export async function getTokenDecimals(chain: string, tokenAddress: string): Promise<number> {
  if (tokenAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' || tokenAddress === '0x0000000000000000000000000000000000000000') {
    return 18;
  }
  const provider = getEvmProvider(chain);
  const contract = ERC20Abi__factory.connect(tokenAddress, provider);
  return Number(await contract.decimals());
}

// ethers.parseUnits but also works for strings like '1e-18'
export function parseUnits(amount: string|number, decimals: number) {
  try {
    return ethers.parseUnits(amount.toString(), decimals);
  } catch (error) {
    return ethers.parseUnits(Number(amount).toFixed(decimals), decimals);
  }
}

export async function getAllowance(chain: string, tokenAddress: string, address: string) {
  const provider = getEvmProvider(chain);
  const contract = ERC20Abi__factory.connect(tokenAddress, provider);
  return await contract.allowance(address, address);
}

export async function checkERC20Balance(
  provider: ethers.Provider,
  chain: string,
  userAddress: string,
  requiredAmount: string
): Promise<{ isEnough: boolean; balance: BigInt }> {
  const tokenAddress = USDC_CHAIN_ADDRESS[chain];
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

  const decimals = await contract.decimals();

  const requiredAmountInWei = ethers.parseUnits(requiredAmount, decimals);

  const balance = await contract.balanceOf(userAddress);

  return {
    isEnough: balance >= requiredAmountInWei,
    balance,
  };
}
