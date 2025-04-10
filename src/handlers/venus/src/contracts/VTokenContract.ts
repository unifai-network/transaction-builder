import { Contract, Provider, Signer, BigNumberish, Overrides } from 'ethers';
import abi from './abi/VBep20.json'; // Import complete ABI from parent directory's abi folder

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
   * Mint vToken
   * @param value Amount of vToken to mint
   * @param overrides Optional parameters
   * @returns Transaction response
   */
  async mint(value: BigNumberish, overrides?: Overrides) {
    return this.contract.mint(value, overrides);
  }

  /**
   * Redeem vToken
   * @param redeemTokens Amount of vToken to redeem
   * @param overrides Optional parameters
   * @returns Transaction response
   */
  async redeem(redeemTokens: BigNumberish, overrides?: Overrides) {
    return this.contract.redeem(redeemTokens, overrides);
  }

  /**
   * Redeem underlying asset
   * @param redeemAmount Amount of underlying asset to redeem
   * @param overrides Optional parameters
   * @returns Transaction response
   */
  async redeemUnderlying(redeemAmount: BigNumberish, overrides?: Overrides) {
    return this.contract.redeemUnderlying(redeemAmount, overrides);
  }

  /**
   * Borrow
   * @param borrowAmount Amount to borrow
   * @param overrides Optional parameters
   * @returns Transaction response
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
   * Repay borrowed BNB
   * @param value Amount of BNB to repay (in wei)
   * @param overrides Transaction parameters
   */
  async repayBorrow(value: BigNumberish, overrides?: Overrides) {
    return this.contract.repayBorrow({
      ...overrides,
      value
    });
  }

  /**
   * Repay borrowed BNB on behalf of another account
   * @param borrower Borrower's address
   * @param value Amount of BNB to repay (in wei)
   * @param overrides Transaction parameters
   */
  async repayBorrowBehalf(borrower: string, value: BigNumberish, overrides?: Overrides) {
    return this.contract.repayBorrowBehalf(borrower, {
      ...overrides,
      value
    });
  }

  /**
   * Approve another address to spend tokens
   * @param spender Address to be approved
   * @param amount Amount to approve
   * @param overrides Transaction parameters
   */
  async approve(spender: string, amount: BigNumberish, overrides?: Overrides) {
    return this.contract.approve(spender, amount, overrides);
  }

  /**
   * Get contract instance (for direct contract access)
   */
  getContractInstance(): Contract {
    return this.contract;
  }
}