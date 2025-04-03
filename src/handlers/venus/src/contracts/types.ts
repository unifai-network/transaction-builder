import { TokenSymbol, VBep20TokenSymbol } from '../types/tokens';

export interface TokenAddresses {
  [chainId: number]: {
    [tokenSymbol in TokenSymbol]: string;
  };
}

export interface VBep20Addresses {
  [chainId: number]: {
    [tokenSymbol in VBep20TokenSymbol]: string;
  };
}

export interface VBnbAddresses {
  [chainId: number]: string;
}

export interface LegacyPoolComptrollerAddresses {
  [chainId: number]: string;
}

export interface Addresses {
  tokens: TokenAddresses;
  VBep20: VBep20Addresses;
  VBnb: VBnbAddresses;
  legacyPoolComptroller: LegacyPoolComptrollerAddresses;
}
