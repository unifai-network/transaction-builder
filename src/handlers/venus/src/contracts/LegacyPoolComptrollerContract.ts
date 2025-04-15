import { Contract, Provider, Overrides } from 'ethers';
import abi from './abi/LegacyPoolComptroller.json';

export class LegacyPoolComptrollerContract {
  private contract: Contract;

  constructor(address: string, provider: Provider) {
    this.contract = new Contract(address, abi, provider);
  }

  /**
   * Get account liquidity information
   * @param account The account address
   * @param overrides Optional transaction overrides
   */
  async getAccountLiquidity(account: string, overrides?: Overrides) {
    return this.contract.getAccountLiquidity(account, overrides);
  }

  /**
   * Get assets in for an account
   * @param account The account address
   * @param overrides Optional transaction overrides
   */
  async getAssetsIn(account: string, overrides?: Overrides) {
    return this.contract.getAssetsIn(account, overrides);
  }

  /**
   * Get market information for a vToken
   * @param vToken The vToken address
   * @param overrides Optional transaction overrides
   */
  async markets(vToken: string, overrides?: Overrides) {
    return this.contract.markets(vToken, overrides);
  }

  /**
   * Get the contract instance
   */
  getContractInstance(): Contract {
    return this.contract;
  }
} 