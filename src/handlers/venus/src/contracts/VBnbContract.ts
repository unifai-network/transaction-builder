import { Contract, Provider, Signer, BigNumberish, Overrides } from 'ethers';
import abi from './abi/VBnb.json'; // Import complete ABI from parent directory's abi folder

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
   * Deposit BNB to get vBNB tokens
   * @param value Amount of BNB to deposit (in wei)
   * @param overrides Transaction parameters (such as gasLimit, gasPrice, etc.)
   */
  async mint(value: BigNumberish, overrides?: Overrides) {
    return this.contract.mint({
      ...overrides,
      value
    });
  }

  /**
   * Redeem vBNB tokens to get BNB
   * @param redeemTokens Amount of vBNB tokens to redeem
   * @param overrides Transaction parameters
   */
  async redeem(redeemTokens: BigNumberish, overrides?: Overrides) {
    return this.contract.redeem(redeemTokens, overrides);
  }

  /**
   * Redeem a specific amount of BNB (automatically calculates required vBNB tokens)
   * @param redeemAmount Amount of BNB to redeem (in wei)
   * @param overrides Transaction parameters
   */
  async redeemUnderlying(redeemAmount: BigNumberish, overrides?: Overrides) {
    return this.contract.redeemUnderlying(redeemAmount, overrides);
  }

  /**
   * Borrow BNB
   * @param borrowAmount Amount of BNB to borrow (in wei)
   * @param overrides Transaction parameters
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
   * Get contract instance (for direct contract access)
   */
  getContractInstance(): Contract {
    return this.contract;
  }
}