import { Token } from '@pancakeswap/sdk';
import { BigNumberish } from 'ethers';
import { BigNumber } from '@ethersproject/bignumber';

export const FEE_TIERS = {
  LOWEST: 100, // 0.01%
  MEDIUM: 500, // 0.05%
  HIGHEST: 2500, // 0.25%
} as const;

export const TOKEN_ADDRESSES = {
  CAKE: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
  WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
  USDT: '0x55d398326f99059fF775485246999027B3197955',
  USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
  DAI: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
  ETH: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
  BTCB: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
  DOT: '0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402',
  LINK: '0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD',
} as const;

export interface TokenPrice {
  token: Token;
  price: number;
  timestamp: number;
}

export interface LPPosition {
  pair: string;
  token0: Token;
  token1: Token;
  balance: BigNumberish;
  staked: BigNumberish;
  tvl: BigNumberish;
  apy: number;
  price0: number;
  price1: number;
  value: BigNumberish;
}

export interface UserAssets {
  cake: {
    balance: BigNumberish;
    staked: BigNumberish;
    price: number;
    value: BigNumberish;
  };
  lpPositions: LPPosition[];
  totalValue: BigNumberish;
}

export interface PoolInfo {
  address: string;
  token0: Token;
  token1: Token;
  tvl: BigNumberish;
  apy: number;
  fee: number;
  volume24h: number;
}

export interface PositionInfo {
  tokenId: number;
  liquidity: BigNumberish;
  token0Amount: BigNumberish;
  token1Amount: BigNumberish;
  feeGrowthInside0LastX128: BigNumberish;
  feeGrowthInside1LastX128: BigNumberish;
  tickLower?: number;
  tickUpper?: number;
  fee?: number;
}

export interface AddLiquidityParams {
  token0: string;
  token1: string;
  amount0Desired: BigNumberish;
  amount1Desired: BigNumberish;
  deadline: number;
  tickLower?: number;
  tickUpper?: number;
}

export interface RemoveLiquidityParams {
  tokenId: number;
  liquidity: string;
  amount0Min?: string;
  amount1Min?: string;
  deadline: number;
}

export interface StakeParams {
  tokenId: number;
}

export interface PoolSearchParams {
  minTVL?: BigNumberish;
  minAPY?: number;
  limit?: number;
}

export interface DecreaseLiquidityParams {
  tokenId: BigNumberish | BigNumber;
  liquidity: BigNumberish | BigNumber;
  amount0Min: BigNumberish | BigNumber;
  amount1Min: BigNumberish | BigNumber;
  deadline: BigNumberish | BigNumber;
}

export interface CollectParams {
  tokenId: BigNumberish | BigNumber;
  recipient: string;
  amount0Max: BigNumberish | BigNumber;
  amount1Max: BigNumberish | BigNumber;
} 