import { ethers } from 'ethers';

export interface VenusServiceConfig {
  provider: ethers.providers.Provider;
  signer: ethers.Signer;
  networkId: number;
}

export interface SupplyParams {
  amount: ethers.BigNumber;
}

export interface RedeemParams {
  amount: ethers.BigNumber;
}

export interface BorrowParams {
  amount: ethers.BigNumber;
}
