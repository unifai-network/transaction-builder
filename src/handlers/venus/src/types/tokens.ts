export const TOKEN_SYMBOLS = [
  'BNB',
  'USDT',
  'USDC',
  'BUSD',
  'BTC',
  'ETH',
  'XVS',
  'DAI',
  'LINK',
  'MATIC',
  'DOT',
  'LTC',
  'XRP',
  'CAKE',
  'BCH',
  'ADA',
  'DOGE',
  'FIL',
  'SXP',
  'TRX',
  'TUSD',
  'LUNA',
  'UST',
  'WBETH',
  'FDUSD'
] as const;

export const VBEP20_TOKEN_SYMBOLS = TOKEN_SYMBOLS.map(symbol => `v${symbol}`) as readonly string[];

export type TokenSymbol = typeof TOKEN_SYMBOLS[number];
export type VBep20TokenSymbol = typeof VBEP20_TOKEN_SYMBOLS[number];

export function isTokenSymbol(symbol: string): symbol is TokenSymbol {
  return TOKEN_SYMBOLS.includes(symbol as TokenSymbol);
}

export function isVBep20TokenSymbol(symbol: string): symbol is VBep20TokenSymbol {
  return VBEP20_TOKEN_SYMBOLS.includes(symbol as VBep20TokenSymbol);
}

export function toTokenSymbol(symbol: string): TokenSymbol {
  if (!isTokenSymbol(symbol)) {
    throw new Error(`Invalid token symbol: ${symbol}`);
  }
  return symbol;
}

export function toVBep20TokenSymbol(symbol: string): VBep20TokenSymbol {
  if (!isVBep20TokenSymbol(symbol)) {
    throw new Error(`Invalid VBep20 token symbol: ${symbol}`);
  }
  return symbol;
}

export function toVBep20Symbol(symbol: TokenSymbol): VBep20TokenSymbol {
  return `v${symbol}` as VBep20TokenSymbol;
}

export function fromVBep20Symbol(vSymbol: VBep20TokenSymbol): TokenSymbol {
  return vSymbol.slice(1) as TokenSymbol;
} 