import BigNumber from 'bignumber.js';

export enum ChainId {
  'BSC_MAINNET' = 56,
}

export interface Token {
  symbol: string;
  decimals: number;
  asset: string;
  address: string;
  isNative?: boolean;
  wrapsNative?: boolean;
}

export interface VToken extends Omit<Token, 'isNative' | 'asset'> {
  decimals: 8; // VBep tokens all have 8 decimals
  underlyingToken: Token;
}
