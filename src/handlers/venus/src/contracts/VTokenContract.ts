import { Contract, Provider, Signer, BigNumberish, Overrides } from 'ethers';
import abi from './abi/VBep20.json'; // 从父目录的abi文件夹导入完整ABI

export class VTokenContract {
  protected contract: Contract;
  private provider: Provider;
  private signer: Signer | null;
  public target: string;

  constructor(address: string, provider: Provider, signer: Signer | null = null) {
    this.target = address;
    this.provider = provider;
    this.signer = signer;
    this.contract = new Contract(address, abi, signer || provider);
  }

  /**
   * 铸造vToken
   * @param value 要铸造的vToken数量
   * @param overrides 可选参数
   * @returns 交易响应
   */
  async mint(value: BigNumberish, overrides?: Overrides) {
    return this.contract.mint(value, overrides);
  }

  /**
   * 赎回vToken
   * @param redeemTokens 要赎回的vToken数量
   * @param overrides 可选参数
   * @returns 交易响应
   */
  async redeem(redeemTokens: BigNumberish, overrides?: Overrides) {
    return this.contract.redeem(redeemTokens, overrides);
  }

  /**
   * 赎回底层资产
   * @param redeemAmount 要赎回的底层资产数量
   * @param overrides 可选参数
   * @returns 交易响应
   */
  async redeemUnderlying(redeemAmount: BigNumberish, overrides?: Overrides) {
    return this.contract.redeemUnderlying(redeemAmount, overrides);
  }

  /**
   * 借贷
   * @param borrowAmount 要借贷的数量
   * @param overrides 可选参数
   * @returns 交易响应
   */
  async borrow(borrowAmount: BigNumberish, overrides?: Overrides) {
    return this.contract.borrow(borrowAmount, overrides);
  }

  /**
   * Get current borrow balance
   * @param account Account address
   */
  async borrowBalanceCurrent(account: string): Promise<bigint> {
    return this.contract.borrowBalanceStored(account);
  }

  /**
   * 偿还借出的 BNB
   * @param value 偿还的 BNB 数量 (wei)
   * @param overrides 交易参数
   */
  async repayBorrow(value: BigNumberish, overrides?: Overrides) {
    return this.contract.repayBorrow({
      ...overrides,
      value
    });
  }

  /**
   * 为其他账户偿还借出的 BNB
   * @param borrower 借款人的地址
   * @param value 偿还的 BNB 数量 (wei)
   * @param overrides 交易参数
   */
  async repayBorrowBehalf(borrower: string, value: BigNumberish, overrides?: Overrides) {
    return this.contract.repayBorrowBehalf(borrower, {
      ...overrides,
      value
    });
  }

  /**
   * 授权其他地址使用代币
   * @param spender 被授权的地址
   * @param amount 授权数量
   * @param overrides 交易参数
   */
  async approve(spender: string, amount: BigNumberish, overrides?: Overrides) {
    return this.contract.approve(spender, amount, overrides);
  }

  /**
   * 获取合约实例 (用于需要直接访问合约的情况)
   */
  getContractInstance(): Contract {
    return this.contract;
  }
}