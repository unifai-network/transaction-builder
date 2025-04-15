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

export interface IsolatedPoolComptrollerAddresses {
  [chainId: number]: string;
}

export interface Addresses {
  tokens: TokenAddresses;
  VBep20: VBep20Addresses;
  VBnb: VBnbAddresses;
  legacyPoolComptroller: LegacyPoolComptrollerAddresses;
  isolatedPoolComptroller: IsolatedPoolComptrollerAddresses;
}

export type UniqueContractName =
  | 'VenusLens'
  | 'PoolLens'
  | 'PoolRegistry'
  | 'LegacyPoolComptroller'
  | 'VaiController'
  | 'VaiVault'
  | 'XvsTokenMultichain'
  | 'XvsVault'
  | 'XvsStore'
  | 'GovernorBravoDelegate'
  | 'XvsVesting'
  | 'VrtConverter'
  | 'Maximillion'
  | 'XsequenceMulticall'
  | 'Multicall3'
  | 'ResilientOracle'
  | 'Prime'
  | 'VTreasury'
  | 'VTreasuryV8'
  | 'XVSProxyOFTDest'
  | 'XVSProxyOFTSrc';

export type GenericContractName =
  | 'IsolatedPoolComptroller'
  | 'JumpRateModel'
  | 'JumpRateModelV2'
  | 'RewardsDistributor'
  | 'VBep20'
  | 'VBnb'
  | 'Bep20'
  | 'Xvs'
  | 'Vai'
  | 'Vrt'
  | 'PancakePairV2';

export type SwapRouterContractName = 'SwapRouter';

export type ContractName = UniqueContractName | GenericContractName | SwapRouterContractName;