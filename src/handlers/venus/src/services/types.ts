import { ethers, Provider } from 'ethers';

export interface VenusServiceConfig {
  provider: Provider;
  signer: ethers.Signer;
  networkId: number;
}

export interface SupplyParams {
  amount: BigNumber;
}

export interface RedeemParams {
  amount: BigNumber;
}

export interface BorrowParams {
  amount: BigNumber;
}
