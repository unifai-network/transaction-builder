import { Contract, Provider, Signer, BigNumberish, Overrides } from 'ethers';
import abi from './abi/VBnb.json'; // 从父目录的abi文件夹导入完整ABI

export class VBnbContract {
  private contract: Contract;
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
   * 存入 BNB 获取 vBNB 代币
   * @param value 存入的 BNB 数量 (wei)
   * @param overrides 交易参数 (如 gasLimit, gasPrice 等)
   */
  async mint(value: BigNumberish, overrides?: Overrides) {
    return this.contract.mint({
      ...overrides,
      value
    });
  }

  /**
   * 赎回 vBNB 代币获取 BNB
   * @param redeemTokens 要赎回的 vBNB 代币数量
   * @param overrides 交易参数
   */
  async redeem(redeemTokens: BigNumberish, overrides?: Overrides) {
    return this.contract.redeem(redeemTokens, overrides);
  }

  /**
   * 赎回特定数量的 BNB (会自动计算需要的 vBNB 代币数量)
   * @param redeemAmount 要赎回的 BNB 数量 (wei)
   * @param overrides 交易参数
   */
  async redeemUnderlying(redeemAmount: BigNumberish, overrides?: Overrides) {
    return this.contract.redeemUnderlying(redeemAmount, overrides);
  }

  /**
   * 借出 BNB
   * @param borrowAmount 要借出的 BNB 数量 (wei)
   * @param overrides 交易参数
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
   * 获取合约实例 (用于需要直接访问合约的情况)
   */
  getContractInstance(): Contract {
    return this.contract;
  }
}