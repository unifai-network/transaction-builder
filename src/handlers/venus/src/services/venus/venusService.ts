import { Signer, Contract, ethers } from 'ethers';
import type { Provider } from '@ethersproject/abstract-provider';
import { parseEther } from 'ethers/lib/utils';
import { addresses } from '../../contracts';
import { ChainId } from '../../types';
import { TokenSymbol, toVBep20Symbol } from '../../types/tokens';
import VBep20Abi from '../../contracts/generated/abis/VBep20.json';
import VBnbAbi from '../../contracts/generated/abis/VBnb.json';
import LegacyPoolComptrollerAbi from '../../contracts/generated/abis/LegacyPoolComptroller.json';

export class VenusService {
  private provider: Provider;
  private signer: Signer | null;
  private chainId: ChainId;

  constructor(signer: Signer | null, provider: Provider, chainId: ChainId) {
    this.provider = provider;
    this.signer = signer;
    this.chainId = chainId;
  }

  // Build supply BNB transaction
  async buildSupplyBNBTransaction(amount: string, userAddress: string) {
    const contract = await this.getVBnbContract();
    const parsedAmount = ethers.utils.parseEther(amount);
    // Build transaction data
    const data = contract.interface.encodeFunctionData('mint');

    // Get current gas price
    const gasPrice = await this.provider.getGasPrice();

    // Estimate gas limit
    const gasLimit = await contract.estimateGas.mint({
      from: userAddress,
      value: parsedAmount,
    });

    // Get current nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    return {
      to: contract.address,
      data,
      value: parsedAmount, // For BNB, value is the supply amount
      gasLimit,
      gasPrice,
      nonce,
    };
  }

  // Build redeem BNB transaction
  async buildRedeemBNBTransaction(amount: string, userAddress: string) {
    const contract = await this.getVBnbContract();
    const parsedAmount = ethers.utils.parseEther(amount);

    // Build transaction data
    const data = contract.interface.encodeFunctionData('redeem', [parsedAmount]);

    // Get current gas price
    const gasPrice = await this.provider.getGasPrice();

    // Estimate gas limit
    const gasLimit = await contract.estimateGas.redeem(parsedAmount, {
      from: userAddress,
    });

    // Get current nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    return {
      to: contract.address,
      data,
      value: ethers.constants.Zero, // Redeem does not require sending BNB
      gasLimit,
      gasPrice,
      nonce,
    };
  }

  // Build supply transaction
  async buildSupplyTransaction(tokenSymbol: TokenSymbol, amount: string, userAddress: string) {
    const contract = await this.getVBep20Contract(tokenSymbol);
    const parsedAmount = ethers.utils.parseEther(amount);

    // Build transaction data
    const data = contract.interface.encodeFunctionData('mint', [parsedAmount]);

    // Get current gas price
    const gasPrice = await this.provider.getGasPrice();

    // Estimate gas limit
    const gasLimit = await contract.estimateGas.mint(parsedAmount, {
      from: userAddress,
    });

    // Get current nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    return {
      to: contract.address,
      data,
      value: ethers.constants.Zero,
      gasLimit,
      gasPrice,
      nonce,
    };
  }

  // Build redeem transaction
  async buildRedeemTransaction(tokenSymbol: TokenSymbol, amount: string, userAddress: string) {
    const contract = await this.getVBep20Contract(tokenSymbol);
    const parsedAmount = ethers.utils.parseEther(amount);

    // Build transaction data
    const data = contract.interface.encodeFunctionData('redeem', [parsedAmount]);

    // Get current gas price
    const gasPrice = await this.provider.getGasPrice();

    // Estimate gas limit
    const gasLimit = await contract.estimateGas.redeem(parsedAmount, {
      from: userAddress,
    });

    // Get current nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    return {
      to: contract.address,
      data,
      value: ethers.constants.Zero,
      gasLimit,
      gasPrice,
      nonce,
    };
  }

  /**
   * Get vBep20 contract instance
   */
  private getVBep20Contract(tokenSymbol: TokenSymbol): Contract {
    const vTokenSymbol = toVBep20Symbol(tokenSymbol);
    const address = addresses.VBep20[this.chainId][vTokenSymbol];
    return new Contract(address, VBep20Abi, this.signer || this.provider);
  }

  /**
   * Get vBNB contract instance
   */
  private getVBnbContract(): Contract {
    const address = addresses.VBnb[this.chainId];
    if (!address) {
      throw new Error(`vBNB not found for chain ${this.chainId}`);
    }
    return new Contract(address, VBnbAbi, this.provider);
  }

  /**
   * Get LegacyPoolComptroller contract instance
   */
  // @ts-ignore
  private getLegacyPoolComptrollerContract(): Contract {
    const address = addresses.legacyPoolComptroller[this.chainId];
    return new Contract(address, LegacyPoolComptrollerAbi, this.signer || this.provider);
  }

  /**
   * Supply tokens
   * @param tokenSymbol Token symbol
   * @param amount Supply amount
   */
  async supply(tokenSymbol: TokenSymbol, amount: string) {
    const contract = this.getVBep20Contract(tokenSymbol);
    const tx = await contract.mint(parseEther(amount));
    return tx;
  }

  /**
   * Supply BNB
   * @param amount Supply amount
   */
  async supplyBNB(amount: string) {
    const contract = this.getVBnbContract();
    const tx = await contract.mint({
      value: parseEther(amount),
    });
    return await tx;
  }

  /**
   * Redeem tokens
   * @param tokenSymbol Token symbol
   * @param amount Redeem amount
   */
  async redeem(tokenSymbol: TokenSymbol, amount: string) {
    const contract = this.getVBep20Contract(tokenSymbol);
    const tx = await contract.redeem(parseEther(amount));
    return tx;
  }

  /**
   * Redeem BNB
   * @param amount Redeem amount
   */
  async redeemBNB(amount: string) {
    const contract = this.getVBnbContract();
    const tx = await contract.redeem(parseEther(amount));
    return await tx;
  }

  /**
   * Borrow tokens
   * @param tokenSymbol Token symbol
   * @param amount Borrow amount
   */
  async borrow(tokenSymbol: TokenSymbol, amount: string) {
    const contract = this.getVBep20Contract(tokenSymbol);
    const tx = await contract.borrow(parseEther(amount));
    return tx;
  }

  /**
   * Borrow BNB
   * @param amount Borrow amount
   */
  async borrowBNB(amount: string) {
    const contract = this.getVBnbContract();
    const tx = await contract.borrow(parseEther(amount));
    return await tx;
  }

  /**
   * Repay tokens
   * @param tokenSymbol Token symbol
   * @param amount Repay amount
   */
  async repayBorrow(tokenSymbol: TokenSymbol, amount: string) {
    const contract = this.getVBep20Contract(tokenSymbol);
    const tx = await contract.repayBorrow(parseEther(amount));
    return tx;
  }

  /**
   * Repay BNB
   * @param amount Repay amount
   */
  async repayBorrowBNB(amount: string) {
    const contract = this.getVBnbContract();
    const tx = await contract.repayBorrow({
      value: parseEther(amount),
    });
    return await tx;
  }

  /**
   * Get token balance
   * @param tokenSymbol Token symbol
   * @param account Account address
   */
  async getBalance(tokenSymbol: TokenSymbol, account: string) {
    const contract = this.getVBep20Contract(tokenSymbol);
    return await contract.balanceOf(account);
  }

  /**
   * Get BNB balance
   * @param account Account address
   */
  async getBNBBalance(account: string) {
    const contract = this.getVBnbContract();
    return await contract.balanceOf(account);
  }

  /**
   * Get borrow balance
   * @param tokenSymbol Token symbol
   * @param account Account address
   */
  async getBorrowBalance(tokenSymbol: TokenSymbol, account: string) {
    const contract = this.getVBep20Contract(tokenSymbol);
    return await contract.borrowBalanceCurrent(account);
  }

  /**
   * Get BNB borrow balance
   * @param account Account address
   */
  async getBNBBorrowBalance(account: string) {
    const contract = this.getVBnbContract();
    return await contract.borrowBalanceCurrent(account);
  }

  // Build borrow BNB transaction
  async buildBorrowBNBTransaction(amount: string, userAddress: string) {
    // Check borrow conditions
    const conditions = await this.checkBorrowConditions(userAddress);
    if (!conditions.canBorrow) {
      throw new Error(
        `Not satisfied borrow conditions: Health factor ${conditions.details.healthFactor}, Available borrow ${conditions.details.availableBorrow}`
      );
    }

    // Check if borrow amount exceeds available limit
    const borrowAmount = ethers.utils.parseEther(amount);
    const availableBorrow = ethers.utils.parseEther(conditions.details.availableBorrow);
    if (borrowAmount.gt(availableBorrow)) {
      throw new Error(
        `Borrow amount exceeds available limit: Request ${amount}, Available ${conditions.details.availableBorrow}`
      );
    }

    const contract = await this.getVBnbContract();
    const parsedAmount = ethers.utils.parseEther(amount);

    // Build transaction data
    const data = contract.interface.encodeFunctionData('borrow', [parsedAmount]);

    // Get current gas price
    const gasPrice = await this.provider.getGasPrice();

    // Estimate gas limit
    const gasLimit = await contract.estimateGas.borrow(parsedAmount, {
      from: userAddress,
    });

    // Get current nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    return {
      to: contract.address,
      data,
      value: ethers.constants.Zero, // Borrow does not require sending BNB
      gasLimit,
      gasPrice,
      nonce,
    };
  }

  // Build borrow other token transaction
  async buildBorrowTransaction(tokenSymbol: TokenSymbol, amount: string, userAddress: string) {
    // Check borrow conditions
    const conditions = await this.checkBorrowConditions(userAddress);
    if (!conditions.canBorrow) {
      throw new Error(
        `Not satisfied borrow conditions: Health factor ${conditions.details.healthFactor}, Available borrow ${conditions.details.availableBorrow}`
      );
    }

    // Check if borrow amount exceeds available limit
    const borrowAmount = ethers.utils.parseEther(amount);
    const availableBorrow = ethers.utils.parseEther(conditions.details.availableBorrow);
    if (borrowAmount.gt(availableBorrow)) {
      throw new Error(
        `Borrow amount exceeds available limit: Request ${amount}, Available ${conditions.details.availableBorrow}`
      );
    }

    const contract = await this.getVBep20Contract(tokenSymbol);
    const parsedAmount = ethers.utils.parseEther(amount);

    // Build transaction data
    const data = contract.interface.encodeFunctionData('borrow', [parsedAmount]);

    // Get current gas price
    const gasPrice = await this.provider.getGasPrice();

    // Estimate gas limit
    const gasLimit = await contract.estimateGas.borrow(parsedAmount, {
      from: userAddress,
    });

    // Get current nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    return {
      to: contract.address,
      data,
      value: ethers.constants.Zero,
      gasLimit,
      gasPrice,
      nonce,
    };
  }

  // Build repay BNB borrow transaction
  async buildRepayBorrowBNBTransaction(amount: string, userAddress: string) {
    const contract = await this.getVBnbContract();
    const parsedAmount = ethers.utils.parseEther(amount);

    // Build transaction data
    const data = contract.interface.encodeFunctionData('repayBorrow');

    // Get current gas price
    const gasPrice = await this.provider.getGasPrice();

    // Estimate gas limit
    const gasLimit = await contract.estimateGas.repayBorrow({
      from: userAddress,
      value: parsedAmount, // Repay BNB requires sending BNB
    });

    // Get current nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    return {
      to: contract.address,
      data,
      value: parsedAmount, // Repay BNB requires sending BNB
      gasLimit,
      gasPrice,
      nonce,
    };
  }

  // Build repay other token borrow transaction
  async buildRepayBorrowTransaction(tokenSymbol: TokenSymbol, amount: string, userAddress: string) {
    const contract = await this.getVBep20Contract(tokenSymbol);
    const parsedAmount = ethers.utils.parseEther(amount);

    // Build transaction data
    const data = contract.interface.encodeFunctionData('repayBorrow', [parsedAmount]);

    // Get current gas price
    const gasPrice = await this.provider.getGasPrice();

    // Estimate gas limit
    const gasLimit = await contract.estimateGas.repayBorrow(parsedAmount, {
      from: userAddress,
    });

    // Get current nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    return {
      to: contract.address,
      data,
      value: ethers.constants.Zero,
      gasLimit,
      gasPrice,
      nonce,
    };
  }

  /**
   * Check user borrow conditions
   * @param userAddress User wallet address
   * @returns Check result, including whether conditions are met and detailed information
   */
  async checkBorrowConditions(userAddress: string): Promise<{
    canBorrow: boolean;
    details: {
      totalCollateral: string;
      totalBorrow: string;
      healthFactor: string;
      availableBorrow: string;
      collateralTokens: Array<{
        symbol: string;
        balance: string;
        collateralFactor: string;
      }>;
      borrowedTokens: Array<{
        symbol: string;
        balance: string;
        borrowBalance: string;
      }>;
    };
  }> {
    const comptroller = this.getLegacyPoolComptrollerContract();

    // Get user account information
    const accountInfo = await comptroller.getAccountLiquidity(userAddress);
    const [error, liquidity, shortfall] = accountInfo;

    // Get all collateral and borrow information
    const assetsIn = await comptroller.getAssetsIn(userAddress);

    // Get all collateral factors
    const collateralFactors = await Promise.all(
      assetsIn.map(async (tokenAddress: string) => {
        const market = await comptroller.markets(tokenAddress);
        return {
          address: tokenAddress,
          collateralFactor: market.collateralFactorMantissa.toString(),
        };
      })
    );

    // Get user balance and borrow balance
    const tokenBalances = await Promise.all(
      assetsIn.map(async (tokenAddress: string) => {
        const contract = new Contract(tokenAddress, VBep20Abi, this.provider);
        const [balance, borrowBalance] = await Promise.all([
          contract.balanceOf(userAddress),
          contract.borrowBalanceCurrent(userAddress),
        ]);
        return {
          address: tokenAddress,
          balance: balance.toString(),
          borrowBalance: borrowBalance.toString(),
        };
      })
    );

    // Calculate total collateral and total borrow
    let totalCollateral = ethers.constants.Zero;
    let totalBorrow = ethers.constants.Zero;

    for (let i = 0; i < assetsIn.length; i++) {
      const tokenAddress = assetsIn[i];
      const collateralFactor =
        collateralFactors.find(f => f.address === tokenAddress)?.collateralFactor || '0';
      const balance = tokenBalances.find(b => b.address === tokenAddress)?.balance || '0';
      const borrowBalance =
        tokenBalances.find(b => b.address === tokenAddress)?.borrowBalance || '0';

      // Calculate collateral value (needs to get token price, simplified here)
      const collateralValue = ethers.BigNumber.from(balance)
        .mul(ethers.BigNumber.from(collateralFactor))
        .div(ethers.constants.WeiPerEther);

      totalCollateral = totalCollateral.add(collateralValue);
      totalBorrow = totalBorrow.add(ethers.BigNumber.from(borrowBalance));
    }

    // Calculate health factor
    const healthFactor = totalBorrow.isZero()
      ? ethers.constants.MaxUint256
      : totalCollateral.mul(ethers.constants.WeiPerEther).div(totalBorrow);

    // Calculate available borrow
    const availableBorrow = totalCollateral
      .mul(ethers.BigNumber.from('8000')) // 80% collateral rate
      .div(ethers.constants.WeiPerEther)
      .sub(totalBorrow);

    // Organize return data
    const details = {
      totalCollateral: ethers.utils.formatEther(totalCollateral),
      totalBorrow: ethers.utils.formatEther(totalBorrow),
      healthFactor: ethers.utils.formatEther(healthFactor),
      availableBorrow: ethers.utils.formatEther(availableBorrow),
      collateralTokens: assetsIn.map((tokenAddress: string, index: number) => ({
        symbol: tokenAddress, // Should convert to token symbol here
        balance: ethers.utils.formatEther(tokenBalances[index].balance),
        collateralFactor: ethers.utils.formatEther(collateralFactors[index].collateralFactor),
      })),
      borrowedTokens: assetsIn.map((tokenAddress: string, index: number) => ({
        symbol: tokenAddress, // Should convert to token symbol here
        balance: ethers.utils.formatEther(tokenBalances[index].balance),
        borrowBalance: ethers.utils.formatEther(tokenBalances[index].borrowBalance),
      })),
    };

    // Check conditions
    const canBorrow =
      !error &&
      healthFactor.gt(ethers.BigNumber.from('1500000000000000000')) && // Health factor > 1.5
      availableBorrow.gt(ethers.constants.Zero); // Available borrow

    return {
      canBorrow,
      details,
    };
  }
}
