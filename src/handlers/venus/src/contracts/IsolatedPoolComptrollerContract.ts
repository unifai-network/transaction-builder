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
   * 获取账户流动性
   * @param account 账户地址
   * @returns [error, liquidity, shortfall]
   */
  async getAccountLiquidity(account: string): Promise<[bigint, bigint, bigint]> {
    return this.contract.getAccountLiquidity(account);
  }

  /**
   * 获取账户资产列表
   * @param account 账户地址
   * @returns 资产地址列表
   */
  async getAssetsIn(account: string): Promise<string[]> {
    return this.contract.getAssetsIn(account);
  }

  /**
   * 获取市场信息
   * @param vToken vToken地址
   * @returns 市场信息
   */
  async markets(vToken: string): Promise<{
    isListed: boolean;
    collateralFactorMantissa: bigint;
  }> {
    return this.contract.markets(vToken);
  }

  /**
   * 获取合约实例
   */
  getContractInstance(): Contract {
    return this.contract;
  }

  /**
   * 获取假设的账户流动性
   * @param account 账户地址
   * @param vTokenModify 要修改的vToken地址
   * @param redeemTokens 要赎回的代币数量
   * @param borrowAmount 要借贷的数量
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