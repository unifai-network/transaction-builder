import { Signer, Contract, ethers } from 'ethers';
import type { Provider } from '@ethersproject/abstract-provider';
import { parseEther } from 'ethers/lib/utils';
import {
  addresses,
} from '../../contracts';
import { ChainId } from '../../types';
import { TokenSymbol, toVBep20Symbol } from '../../types/tokens';
import VBep20Abi from '../../contracts/generated/abis/VBep20.json';
import VBnbAbi from '../../contracts/generated/abis/VBnb.json';
import LegacyPoolComptrollerAbi from '../../contracts/generated/abis/LegacyPoolComptroller.json';

export class VenusService {
  private provider: Provider;
  private signer: Signer|null;
  private chainId: ChainId;

  constructor(signer: Signer|null, provider: Provider, chainId: ChainId) {
    this.provider = provider;
    this.signer = signer;
    this.chainId = chainId;
  }

  // 构建存入 BNB 交易
  async buildSupplyBNBTransaction(
    amount: string,
    userAddress: string
  ) {
    const contract = await this.getVBnbContract();
    const parsedAmount = ethers.utils.parseEther(amount);
    // 构建交易数据
    const data = contract.interface.encodeFunctionData('mint');
    
    // 获取当前 gas 价格
    const gasPrice = await this.provider.getGasPrice();
    
    // 估算 gas 限制
    const gasLimit = await contract.estimateGas.mint({
      from: userAddress,
      value: parsedAmount
    });
    
    // 获取当前 nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    return {
      to: contract.address,
      data,
      value: parsedAmount, // 对于 BNB，value 就是存入的数量
      gasLimit,
      gasPrice,
      nonce
    };
  }

  // 构建赎回 BNB 交易
  async buildRedeemBNBTransaction(
    amount: string,
    userAddress: string
  ) {
    const contract = await this.getVBnbContract();
    const parsedAmount = ethers.utils.parseEther(amount);
    
    // 构建交易数据
    const data = contract.interface.encodeFunctionData('redeem', [parsedAmount]);
    
    // 获取当前 gas 价格
    const gasPrice = await this.provider.getGasPrice();
    
    // 估算 gas 限制
    const gasLimit = await contract.estimateGas.redeem(parsedAmount, {
      from: userAddress
    });

    // 获取当前 nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    return {
      to: contract.address,
      data,
      value: ethers.constants.Zero, // 赎回不需要发送 BNB
      gasLimit,
      gasPrice,
      nonce
    };
  }

  // 构建存入交易
  async buildSupplyTransaction(
    tokenSymbol: TokenSymbol,
    amount: string,
    userAddress: string
  ) {
    const contract = await this.getVBep20Contract(tokenSymbol);
    const parsedAmount = ethers.utils.parseEther(amount);
    
    // 构建交易数据
    const data = contract.interface.encodeFunctionData('mint', [parsedAmount]);
    
    // 获取当前 gas 价格
    const gasPrice = await this.provider.getGasPrice();
    
    // 估算 gas 限制
    const gasLimit = await contract.estimateGas.mint(parsedAmount, {
      from: userAddress
    });

    // 获取当前 nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    return {
      to: contract.address,
      data,
      value: ethers.constants.Zero,
      gasLimit,
      gasPrice,
      nonce
    };
  }

  // 构建赎回交易
  async buildRedeemTransaction(
    tokenSymbol: TokenSymbol,
    amount: string,
    userAddress: string
  ) {
    const contract = await this.getVBep20Contract(tokenSymbol);
    const parsedAmount = ethers.utils.parseEther(amount);
    
    // 构建交易数据
    const data = contract.interface.encodeFunctionData('redeem', [parsedAmount]);
    
    // 获取当前 gas 价格
    const gasPrice = await this.provider.getGasPrice();
    
    // 估算 gas 限制
    const gasLimit = await contract.estimateGas.redeem(parsedAmount, {
      from: userAddress
    });

    // 获取当前 nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    return {
      to: contract.address,
      data,
      value: ethers.constants.Zero,
      gasLimit,
      gasPrice,
      nonce
    };
  }

  /**
   * 获取 vBep20 合约实例
   */
  private getVBep20Contract(tokenSymbol: TokenSymbol): Contract {
    const vTokenSymbol = toVBep20Symbol(tokenSymbol);
    const address = addresses.VBep20[this.chainId][vTokenSymbol];
    return new Contract(
      address,
      VBep20Abi,
      this.signer || this.provider
    );
  }

  /**
   * 获取 vBNB 合约实例
   */
  private getVBnbContract(): Contract {
    const address = addresses.VBnb[this.chainId];
    if (!address) {
      throw new Error(`vBNB not found for chain ${this.chainId}`);
    }
    return new Contract(address, VBnbAbi, this.provider);
  }

  /**
   * 获取 LegacyPoolComptroller 合约实例
   */
  // @ts-ignore
  private getLegacyPoolComptrollerContract(): Contract {
    const address = addresses.legacyPoolComptroller[this.chainId];
    return new Contract(
      address,
      LegacyPoolComptrollerAbi,
      this.signer || this.provider
    );
  }

  /**
   * 存入代币
   * @param tokenSymbol 代币符号
   * @param amount 存入数量
   */
  async supply(tokenSymbol: TokenSymbol, amount: string) {
    const contract = this.getVBep20Contract(tokenSymbol);
    const tx = await contract.mint(parseEther(amount));
    return tx;
  }

  /**
   * 存入 BNB
   * @param amount 存入数量
   */
  async supplyBNB(amount: string) {
    const contract = this.getVBnbContract();
    const tx = await contract.mint({
      value: parseEther(amount)
    });
    return await tx;
  }

  /**
   * 赎回代币
   * @param tokenSymbol 代币符号
   * @param amount 赎回数量
   */
  async redeem(tokenSymbol: TokenSymbol, amount: string) {
    const contract = this.getVBep20Contract(tokenSymbol);
    const tx = await contract.redeem(parseEther(amount));
    return tx;
  }

  /**
   * 赎回 BNB
   * @param amount 赎回数量
   */
  async redeemBNB(amount: string) {
    const contract = this.getVBnbContract();
    const tx = await contract.redeem(parseEther(amount));
    return await tx;
  }

  /**
   * 借入代币
   * @param tokenSymbol 代币符号
   * @param amount 借入数量
   */
  async borrow(tokenSymbol: TokenSymbol, amount: string) {
    const contract = this.getVBep20Contract(tokenSymbol);
    const tx = await contract.borrow(parseEther(amount));
    return tx;
  }

  /**
   * 借入 BNB
   * @param amount 借入数量
   */
  async borrowBNB(amount: string) {
    const contract = this.getVBnbContract();
    const tx = await contract.borrow(parseEther(amount));
    return await tx;
  }

  /**
   * 偿还代币
   * @param tokenSymbol 代币符号
   * @param amount 偿还数量
   */
  async repayBorrow(tokenSymbol: TokenSymbol, amount: string) {
    const contract = this.getVBep20Contract(tokenSymbol);
    const tx = await contract.repayBorrow(parseEther(amount));
    return tx;
  }

  /**
   * 偿还 BNB
   * @param amount 偿还数量
   */
  async repayBorrowBNB(amount: string) {
    const contract = this.getVBnbContract();
    const tx = await contract.repayBorrow({
      value: parseEther(amount)
    });
    return await tx;
  }

  /**
   * 获取代币余额
   * @param tokenSymbol 代币符号
   * @param account 账户地址
   */
  async getBalance(tokenSymbol: TokenSymbol, account: string) {
    const contract = this.getVBep20Contract(tokenSymbol);
    return await contract.balanceOf(account);
  }

  /**
   * 获取 BNB 余额
   * @param account 账户地址
   */
  async getBNBBalance(account: string) {
    const contract = this.getVBnbContract();
    return await contract.balanceOf(account);
  }

  /**
   * 获取借款余额
   * @param tokenSymbol 代币符号
   * @param account 账户地址
   */
  async getBorrowBalance(tokenSymbol: TokenSymbol, account: string) {
    const contract = this.getVBep20Contract(tokenSymbol);
    return await contract.borrowBalanceCurrent(account);
  }

  /**
   * 获取 BNB 借款余额
   * @param account 账户地址
   */
  async getBNBBorrowBalance(account: string) {
    const contract = this.getVBnbContract();
    return await contract.borrowBalanceCurrent(account);
  }

  // 构建借入 BNB 交易
  async buildBorrowBNBTransaction(
    amount: string,
    userAddress: string
  ) {
    // 检查借款条件
    const conditions = await this.checkBorrowConditions(userAddress);
    if (!conditions.canBorrow) {
      throw new Error(`不满足借款条件: 健康因子 ${conditions.details.healthFactor}, 可用借款额度 ${conditions.details.availableBorrow}`);
    }

    // 检查借款金额是否超过可用额度
    const borrowAmount = ethers.utils.parseEther(amount);
    const availableBorrow = ethers.utils.parseEther(conditions.details.availableBorrow);
    if (borrowAmount.gt(availableBorrow)) {
      throw new Error(`借款金额超过可用额度: 请求 ${amount}, 可用 ${conditions.details.availableBorrow}`);
    }

    const contract = await this.getVBnbContract();
    const parsedAmount = ethers.utils.parseEther(amount);
    
    // 构建交易数据
    const data = contract.interface.encodeFunctionData('borrow', [parsedAmount]);
    
    // 获取当前 gas 价格
    const gasPrice = await this.provider.getGasPrice();
    
    // 估算 gas 限制
    const gasLimit = await contract.estimateGas.borrow(parsedAmount, {
      from: userAddress
    });

    // 获取当前 nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    return {
      to: contract.address,
      data,
      value: ethers.constants.Zero, // 借入不需要发送 BNB
      gasLimit,
      gasPrice,
      nonce
    };
  }

  // 构建借入其他代币交易
  async buildBorrowTransaction(
    tokenSymbol: TokenSymbol,
    amount: string,
    userAddress: string
  ) {
    // 检查借款条件
    const conditions = await this.checkBorrowConditions(userAddress);
    if (!conditions.canBorrow) {
      throw new Error(`不满足借款条件: 健康因子 ${conditions.details.healthFactor}, 可用借款额度 ${conditions.details.availableBorrow}`);
    }

    // 检查借款金额是否超过可用额度
    const borrowAmount = ethers.utils.parseEther(amount);
    const availableBorrow = ethers.utils.parseEther(conditions.details.availableBorrow);
    if (borrowAmount.gt(availableBorrow)) {
      throw new Error(`借款金额超过可用额度: 请求 ${amount}, 可用 ${conditions.details.availableBorrow}`);
    }

    const contract = await this.getVBep20Contract(tokenSymbol);
    const parsedAmount = ethers.utils.parseEther(amount);
    
    // 构建交易数据
    const data = contract.interface.encodeFunctionData('borrow', [parsedAmount]);
    
    // 获取当前 gas 价格
    const gasPrice = await this.provider.getGasPrice();
    
    // 估算 gas 限制
    const gasLimit = await contract.estimateGas.borrow(parsedAmount, {
      from: userAddress
    });

    // 获取当前 nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    return {
      to: contract.address,
      data,
      value: ethers.constants.Zero,
      gasLimit,
      gasPrice,
      nonce
    };
  }

  // 构建偿还 BNB 借款交易
  async buildRepayBorrowBNBTransaction(
    amount: string,
    userAddress: string
  ) {
    const contract = await this.getVBnbContract();
    const parsedAmount = ethers.utils.parseEther(amount);
    
    // 构建交易数据
    const data = contract.interface.encodeFunctionData('repayBorrow');
    
    // 获取当前 gas 价格
    const gasPrice = await this.provider.getGasPrice();
    
    // 估算 gas 限制
    const gasLimit = await contract.estimateGas.repayBorrow({
      from: userAddress,
      value: parsedAmount // 偿还 BNB 需要发送 BNB
    });

    // 获取当前 nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    return {
      to: contract.address,
      data,
      value: parsedAmount, // 偿还 BNB 需要发送 BNB
      gasLimit,
      gasPrice,
      nonce
    };
  }

  // 构建偿还其他代币借款交易
  async buildRepayBorrowTransaction(
    tokenSymbol: TokenSymbol,
    amount: string,
    userAddress: string
  ) {
    const contract = await this.getVBep20Contract(tokenSymbol);
    const parsedAmount = ethers.utils.parseEther(amount);
    
    // 构建交易数据
    const data = contract.interface.encodeFunctionData('repayBorrow', [parsedAmount]);
    
    // 获取当前 gas 价格
    const gasPrice = await this.provider.getGasPrice();
    
    // 估算 gas 限制
    const gasLimit = await contract.estimateGas.repayBorrow(parsedAmount, {
      from: userAddress
    });

    // 获取当前 nonce
    const nonce = await this.provider.getTransactionCount(userAddress);

    return {
      to: contract.address,
      data,
      value: ethers.constants.Zero,
      gasLimit,
      gasPrice,
      nonce
    };
  }

  /**
   * 检查用户的借贷条件
   * @param userAddress 用户钱包地址
   * @returns 检查结果，包含是否满足条件和详细信息
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
    
    // 获取用户账户信息
    const accountInfo = await comptroller.getAccountLiquidity(userAddress);
    const [error, liquidity, shortfall] = accountInfo;
    
    // 获取用户所有抵押品和借款信息
    const assetsIn = await comptroller.getAssetsIn(userAddress);
    
    // 获取所有代币的抵押因子
    const collateralFactors = await Promise.all(
      assetsIn.map(async (tokenAddress: string) => {
        const market = await comptroller.markets(tokenAddress);
        return {
          address: tokenAddress,
          collateralFactor: market.collateralFactorMantissa.toString()
        };
      })
    );

    // 获取用户每个代币的余额和借款余额
    const tokenBalances = await Promise.all(
      assetsIn.map(async (tokenAddress: string) => {
        const contract = new Contract(tokenAddress, VBep20Abi, this.provider);
        const [balance, borrowBalance] = await Promise.all([
          contract.balanceOf(userAddress),
          contract.borrowBalanceCurrent(userAddress)
        ]);
        return {
          address: tokenAddress,
          balance: balance.toString(),
          borrowBalance: borrowBalance.toString()
        };
      })
    );

    // 计算总抵押品和总借款
    let totalCollateral = ethers.constants.Zero;
    let totalBorrow = ethers.constants.Zero;

    for (let i = 0; i < assetsIn.length; i++) {
      const tokenAddress = assetsIn[i];
      const collateralFactor = collateralFactors.find(f => f.address === tokenAddress)?.collateralFactor || '0';
      const balance = tokenBalances.find(b => b.address === tokenAddress)?.balance || '0';
      const borrowBalance = tokenBalances.find(b => b.address === tokenAddress)?.borrowBalance || '0';

      // 计算抵押品价值（需要获取代币价格，这里简化处理）
      const collateralValue = ethers.BigNumber.from(balance)
        .mul(ethers.BigNumber.from(collateralFactor))
        .div(ethers.constants.WeiPerEther);
      
      totalCollateral = totalCollateral.add(collateralValue);
      totalBorrow = totalBorrow.add(ethers.BigNumber.from(borrowBalance));
    }

    // 计算健康因子
    const healthFactor = totalBorrow.isZero() 
      ? ethers.constants.MaxUint256 
      : totalCollateral.mul(ethers.constants.WeiPerEther).div(totalBorrow);

    // 计算可借金额
    const availableBorrow = totalCollateral
      .mul(ethers.BigNumber.from('8000')) // 80% 的抵押率
      .div(ethers.constants.WeiPerEther)
      .sub(totalBorrow);

    // 整理返回数据
    const details = {
      totalCollateral: ethers.utils.formatEther(totalCollateral),
      totalBorrow: ethers.utils.formatEther(totalBorrow),
      healthFactor: ethers.utils.formatEther(healthFactor),
      availableBorrow: ethers.utils.formatEther(availableBorrow),
      collateralTokens: assetsIn.map((tokenAddress: string, index: number) => ({
        symbol: tokenAddress, // 这里应该转换为代币符号
        balance: ethers.utils.formatEther(tokenBalances[index].balance),
        collateralFactor: ethers.utils.formatEther(collateralFactors[index].collateralFactor)
      })),
      borrowedTokens: assetsIn.map((tokenAddress: string, index: number) => ({
        symbol: tokenAddress, // 这里应该转换为代币符号
        balance: ethers.utils.formatEther(tokenBalances[index].balance),
        borrowBalance: ethers.utils.formatEther(tokenBalances[index].borrowBalance)
      }))
    };

    // 判断条件
    const canBorrow = !error && 
      healthFactor.gt(ethers.BigNumber.from('1500000000000000000')) && // 健康因子 > 1.5
      availableBorrow.gt(ethers.constants.Zero); // 有可用借款额度

    return {
      canBorrow,
      details
    };
  }
}