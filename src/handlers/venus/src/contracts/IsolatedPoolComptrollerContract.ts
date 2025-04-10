import { Contract, Provider } from 'ethers';
import abi from './abi/IsolatedPoolComptroller.json';

export class IsolatedPoolComptrollerContract {
  private contract: Contract;
  target: string;

  constructor(address: string, provider: Provider) {
    this.contract = new Contract(address, abi, provider);
    this.target = address;
  }

  /**
   * Get account liquidity
   * @param account Account address
   * @returns [error, liquidity, shortfall]
   */
  async getAccountLiquidity(account: string): Promise<[bigint, bigint, bigint]> {
    return this.contract.getAccountLiquidity(account);
  }

  /**
   * Get list of assets for an account
   * @param account Account address
   * @returns List of asset addresses
   */
  async getAssetsIn(account: string): Promise<string[]> {
    return this.contract.getAssetsIn(account);
  }

  /**
   * Get market information
   * @param vToken vToken address
   * @returns Market information
   */
  async markets(vToken: string): Promise<{
    isListed: boolean;
    collateralFactorMantissa: bigint;
  }> {
    return this.contract.markets(vToken);
  }

  /**
   * Get contract instance
   */
  getContractInstance(): Contract {
    return this.contract;
  }

  /**
   * Get hypothetical account liquidity
   * @param account Account address
   * @param vTokenModify vToken address to modify
   * @param redeemTokens Amount of tokens to redeem
   * @param borrowAmount Amount to borrow
   * @returns [error, liquidity, shortfall]
   */
  async getHypotheticalAccountLiquidity(
    account: string,
    vTokenModify: string,
    redeemTokens: bigint,
    borrowAmount: bigint
  ): Promise<[bigint, bigint, bigint]> {
    return this.contract.getHypotheticalAccountLiquidity(
      account,
      vTokenModify,
      redeemTokens,
      borrowAmount
    );
  }
} 