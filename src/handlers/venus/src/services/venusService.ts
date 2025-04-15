import { Signer, Contract, ethers, parseEther, Provider, ZeroAddress, formatEther, MaxUint256 } from 'ethers';
import { addresses } from '../contracts';
import { ChainId } from '../types';
import { TokenSymbol, toVBep20Symbol } from '../types/tokens';
import { VBnbContract } from '../contracts/VBnbContract';
import { VTokenContract } from '../contracts/VTokenContract';
import { IsolatedPoolComptrollerContract } from '../contracts/IsolatedPoolComptrollerContract';
import VBep20Abi from '../contracts/abi/VBep20.json';

export class VenusService {
  private provider: Provider;
  private signer: Signer | null;
  private chainId: ChainId;

  constructor(signer: Signer | null, provider: Provider, chainId: ChainId) {
    this.provider = provider;
    this.signer = signer;
    this.chainId = chainId;
  }

  private getComptrollerContract(): IsolatedPoolComptrollerContract {
    const isolatedAddress = addresses.isolatedPoolComptroller[this.chainId];
    if (!isolatedAddress) {
      throw new Error('Isolated pool comptroller not found for this chain');
    }
    return new IsolatedPoolComptrollerContract(isolatedAddress, this.provider);
  }

  private getVBep20Contract(tokenSymbol: TokenSymbol): VTokenContract {
    const vTokenSymbol = toVBep20Symbol(tokenSymbol);
    const address = addresses.VBep20[this.chainId][vTokenSymbol];
    return new VTokenContract(address, this.provider);
  }

  private getVBnbContract(): VBnbContract {
    const vTokenSymbol = toVBep20Symbol('BNB');
    const address = addresses.VBep20[this.chainId][vTokenSymbol];
    return new VBnbContract(address, this.provider);
  }

  private getContractInstance(contract: VBnbContract | VTokenContract | IsolatedPoolComptrollerContract) {
    return contract.getContractInstance();
  }

  // Build supply BNB transaction
  async buildSupplyBNBTransaction(amount: string, userAddress: string) {
    const vTokenSymbol = toVBep20Symbol('BNB');
    const address = addresses.VBep20[this.chainId][vTokenSymbol];
    const contract = new VBnbContract(address, this.provider);
    const contractInstance = this.getContractInstance(contract);

    const parsedAmount = parseEther(amount);
    // Build transaction data
    const data = contractInstance.interface.encodeFunctionData('mint');

    // Get current gas price
    const feeData = await this.provider.getFeeData();
    const gasPrice = feeData.gasPrice;

    // Estimate gas limit
    const gasLimit = await contractInstance.mint.estimateGas({
      from: userAddress,
      value: parsedAmount,
    });

    // Get current nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    return {
      to: contractInstance.target,
      data,
      value: parsedAmount, // For BNB, value is the supply amount
      gasLimit,
      gasPrice,
      nonce,
    };
  }

  // Build redeem BNB transaction
  async buildRedeemBNBTransaction(amount: string, userAddress: string) {
    const vTokenSymbol = toVBep20Symbol('BNB');
    const address = addresses.VBep20[this.chainId][vTokenSymbol];
    const contract = new VBnbContract(address, this.provider);
    const contractInstance = this.getContractInstance(contract);

    const parsedAmount = parseEther(amount);

    // Build transaction data using redeemUnderlying instead of redeem
    const data = contractInstance.interface.encodeFunctionData('redeemUnderlying', [parsedAmount]);

    // Get current gas price
    const feeData = await this.provider.getFeeData();
    const gasPrice = feeData.gasPrice;

    // Estimate gas limit
    const gasLimit = await contractInstance.redeemUnderlying.estimateGas(parsedAmount, {
      from: userAddress,
    });

    // Get current nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    return {
      to: contractInstance.target,
      data,
      value: ZeroAddress, // Redeem does not require sending BNB
      gasLimit,
      gasPrice,
      nonce,
    };
  }

  // Build borrow BNB transaction
  async buildBorrowBNBTransaction(amount: string, userAddress: string) {
    const vTokenSymbol = toVBep20Symbol('BNB');
    const address = addresses.VBep20[this.chainId][vTokenSymbol];
    const contract = new VBnbContract(address, this.provider);
    const contractInstance = this.getContractInstance(contract);
    const parsedAmount = parseEther(amount);

    // Build transaction data
    const data = contractInstance.interface.encodeFunctionData('borrow', [parsedAmount]);

    // Get current gas price
    const feeData = await this.provider.getFeeData();
    const gasPrice = feeData.gasPrice;

    // Estimate gas limit
    const gasLimit = await contractInstance.borrow.estimateGas(parsedAmount, {
      from: userAddress,
    });

    // Get current nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    return {
      to: contractInstance.target,
      data,
      value: ZeroAddress, // Borrow does not require sending BNB
      gasLimit,
      gasPrice,
      nonce,
    };
  }

  // Build repay BNB borrow transaction
  async buildRepayBorrowBNBTransaction(
    amount: string,
    userAddress: string,
  ): Promise<{
    to: string;
    data: string;
    value: bigint;
    gasLimit: bigint;
    gasPrice: bigint;
    nonce: bigint;
  }> {
    const vTokenSymbol = toVBep20Symbol('BNB');
    const address = addresses.VBep20[this.chainId][vTokenSymbol];
    const contract = new VBnbContract(address, this.provider);
    const parsedAmount = parseEther(amount);
    console.log("buildRepayBorrowBNBTransaction++++++");
    // Get current gas price
    const gasPrice = await this.provider.getFeeData();
    if (!gasPrice.gasPrice) {
      throw new Error('Failed to get gas price');
    }

    // Get current nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    // Check borrow balance
    const borrowBalance = await contract.borrowBalanceCurrent(userAddress);
    console.log('Current borrow balance:', formatEther(borrowBalance));
    console.log('Repay amount:', amount);

    if (borrowBalance === 0n) {
      throw new Error('No borrow balance to repay');
    }

    if (parsedAmount > borrowBalance) {
      throw new Error('Repay amount exceeds borrow balance');
    }

    // Build transaction data
    const data = contract.getContractInstance().interface.encodeFunctionData('repayBorrow', []);

    // Use a fixed gas limit since we can't estimate gas with provider
    const gasLimit = 300000n; // This is a reasonable default for BNB transactions

    return {
      to: contract.target.toString(),
      data,
      value: parsedAmount,
      gasLimit,
      gasPrice: gasPrice.gasPrice,
      nonce: BigInt(nonce),
    };
  }

  // Build supply transaction
  async buildSupplyTransaction(tokenSymbol: TokenSymbol, amount: string, userAddress: string) {
    const contract = this.getVBep20Contract(tokenSymbol);
    const contractInstance = this.getContractInstance(contract);
    const parsedAmount = parseEther(amount);

    // Get the underlying token contract
    const underlyingTokenAddress = await contractInstance.underlying();
    const underlyingTokenContract = new Contract(underlyingTokenAddress, VBep20Abi, this.provider);

    // Check current allowance - use vToken address as the spender
    const currentAllowance = await underlyingTokenContract.allowance(userAddress, contractInstance.target);

    // If allowance is not max, we need to approve first
    if (currentAllowance < parsedAmount || currentAllowance == 0) {
      // Build approve transaction data
      const approveData = underlyingTokenContract.interface.encodeFunctionData('approve', [
        contractInstance.target, // vToken address as the spender
        MaxUint256
      ]);

      // Get current gas price for approve
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice;

      // Estimate gas limit for approve
      const approveGasLimit = await underlyingTokenContract.approve.estimateGas(
        contractInstance.target, // vToken address as the spender
        MaxUint256,
        { from: userAddress }
      );

      // Get current nonce
      const nonce = await this.provider.getTransactionCount(userAddress);

      // Return approve transaction first
      return {
        to: underlyingTokenAddress,
        data: approveData,
        value: ZeroAddress,
        gasLimit: approveGasLimit,
        gasPrice,
        nonce,
      };
    }

    // Build supply transaction data
    const data = contractInstance.interface.encodeFunctionData('mint', [parsedAmount]);

    // Get current gas price
    const feeData = await this.provider.getFeeData();
    const gasPrice = feeData.gasPrice;

    // Estimate gas limit
    const gasLimit = await contractInstance.mint.estimateGas(parsedAmount, {
      from: userAddress,
    });

    // Get current nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    return {
      to: contractInstance.target,
      data,
      value: ZeroAddress,
      gasLimit,
      gasPrice,
      nonce,
    };
  }

  // Build redeem transaction
  async buildRedeemTransaction(tokenSymbol: TokenSymbol, amount: string, userAddress: string) {
    const contract = this.getVBep20Contract(tokenSymbol);
    const contractInstance = this.getContractInstance(contract);
    const parsedAmount = parseEther(amount);

    // Build transaction data using redeemUnderlying instead of redeem
    const data = contractInstance.interface.encodeFunctionData('redeemUnderlying', [parsedAmount]);

    // Get current gas price
    const feeData = await this.provider.getFeeData();
    const gasPrice = feeData.gasPrice;

    // Estimate gas limit
    const gasLimit = await contractInstance.redeemUnderlying.estimateGas(parsedAmount, {
      from: userAddress,
    });

    // Get current nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    return {
      to: contractInstance.target,
      data,
      value: ZeroAddress,
      gasLimit,
      gasPrice,
      nonce,
    };
  }

  // Build borrow transaction
  async buildBorrowTransaction(
    tokenSymbol: TokenSymbol,
    amount: string,
    userAddress: string,
  ): Promise<{
    to: string;
    data: string;
    value: bigint;
    gasLimit: bigint;
    gasPrice: bigint;
    nonce: bigint;
  }> {
    const contractInstance = this.getVBep20Contract(tokenSymbol);
    const parsedAmount = parseEther(amount);

    // Get current gas price
    const gasPrice = await this.provider.getFeeData();
    if (!gasPrice.gasPrice) {
      throw new Error('Failed to get gas price');
    }

    // Get current nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    // Get account liquidity from contract
    const comptroller = this.getComptrollerContract();
    const comptrollerInstance = this.getContractInstance(comptroller);

    // Get hypothetical account liquidity
    // const [error, liquidity, shortfall] = await comptrollerInstance.getHypotheticalAccountLiquidity(
    //   userAddress,
    //   contractInstance.target,
    //   0n, // redeemTokens
    //   parsedAmount // borrowAmount
    // );

    // if (error !== 0n) {
    //   throw new Error('Account has error');
    // }

    // if (shortfall > 0n) {
    //   throw new Error('Account has shortfall, cannot borrow');
    // }

    // if (liquidity < parsedAmount) {
    //   throw new Error('Insufficient liquidity');
    // }

    // Get contract instance and interface
    const contract = this.getContractInstance(contractInstance);
    const contractInterface = contract.interface;

    // Build transaction data
    const data = contractInterface.encodeFunctionData('borrow', [parsedAmount]);

    // Estimate gas limit
    const gasLimit = await this.provider.estimateGas({
      from: userAddress,
      to: contract.target,
      data,
    });

    return {
      to: contract.target.toString(),
      data,
      value: 0n,
      gasLimit,
      gasPrice: gasPrice.gasPrice,
      nonce: BigInt(nonce),
    };
  }

  // Build repay borrow transaction
  async buildRepayBorrowTransaction(
    tokenSymbol: TokenSymbol,
    amount: string,
    userAddress: string,
  ): Promise<{
    to: string;
    data: string;
    value: bigint;
    gasLimit: bigint;
    gasPrice: bigint;
    nonce: bigint;
  }> {
    const contract = this.getVBep20Contract(tokenSymbol);
    const parsedAmount = parseEther(amount);
    console.log("buildRepayBorrowTransaction====");
    // Get current gas price
    const gasPrice = await this.provider.getFeeData();
    if (!gasPrice.gasPrice) {
      throw new Error('Failed to get gas price');
    }

    // Get current nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    // Check borrow balance
    const borrowBalance = await contract.borrowBalanceCurrent(userAddress);
    console.log('Current borrow balance:', formatEther(borrowBalance));
    console.log('Repay amount:', amount);

    if (borrowBalance === 0n) {
      throw new Error('No borrow balance to repay');
    }

    if (parsedAmount > borrowBalance) {
      throw new Error('Repay amount exceeds borrow balance');
    }

    // Build transaction data
    const data = contract.getContractInstance().interface.encodeFunctionData('repayBorrow', [parsedAmount]);

    // Use a fixed gas limit since we can't estimate gas with provider
    const gasLimit = 300000n; // This is a reasonable default for token transactions

    return {
      to: contract.target.toString(),
      data,
      value: 0n, // No BNB value needed for token repayments
      gasLimit,
      gasPrice: gasPrice.gasPrice,
      nonce: BigInt(nonce),
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
    const comptroller = this.getComptrollerContract();
    const contractInstance = this.getContractInstance(comptroller);

    // Get user account information
    const accountInfo = await contractInstance.getAccountLiquidity(userAddress);
    const [error, liquidity, shortfall] = accountInfo;

    // Get all collateral and borrow information
    const assetsIn = await contractInstance.getAssetsIn(userAddress);

    // Get all collateral factors
    const collateralFactors = await Promise.all(
      assetsIn.map(async (tokenAddress: string) => {
        const market = await contractInstance.markets(tokenAddress);
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
    let totalCollateral = 0n;
    let totalBorrow = 0n;

    for (let i = 0; i < assetsIn.length; i++) {
      const tokenAddress = assetsIn[i];
      const collateralFactor =
        collateralFactors.find((f: { address: string }) => f.address === tokenAddress)?.collateralFactor || '0';
      const balance = tokenBalances.find((b: { address: string }) => b.address === tokenAddress)?.balance || '0';
      const borrowBalance =
        tokenBalances.find((b: { address: string }) => b.address === tokenAddress)?.borrowBalance || '0';

      // Calculate collateral value
      const collateralValue = (BigInt(balance) * BigInt(collateralFactor)) / BigInt(1e18);
      totalCollateral += collateralValue;
      totalBorrow += BigInt(borrowBalance);
    }

    // Calculate health factor
    const healthFactor = totalBorrow === 0n
      ? BigInt(1e18) // When no borrow, health factor is 1.0
      : (totalCollateral * BigInt(1e18)) / totalBorrow;

    // Calculate available borrow
    const availableBorrow = (totalCollateral * BigInt(8000)) / BigInt(1e18) - totalBorrow;

    // Organize return data
    const details = {
      totalCollateral: formatEther(totalCollateral),
      totalBorrow: formatEther(totalBorrow),
      healthFactor: formatEther(healthFactor),
      availableBorrow: formatEther(availableBorrow),
      collateralTokens: assetsIn.map((tokenAddress: string, index: number) => ({
        symbol: tokenAddress, // Should convert to token symbol here
        balance: formatEther(tokenBalances[index].balance),
        collateralFactor: formatEther(collateralFactors[index].collateralFactor),
      })),
      borrowedTokens: assetsIn.map((tokenAddress: string, index: number) => ({
        symbol: tokenAddress, // Should convert to token symbol here
        balance: formatEther(tokenBalances[index].balance),
        borrowBalance: formatEther(tokenBalances[index].borrowBalance),
      })),
    };

    // Check conditions
    const canBorrow =
      !error &&
      healthFactor > BigInt('1500000000000000000') && // Health factor > 1.5
      availableBorrow > 0n; // Available borrow

    return {
      canBorrow,
      details,
    };
  }
}
