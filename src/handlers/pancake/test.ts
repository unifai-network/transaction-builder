import { JsonRpcProvider, parseEther, Contract } from 'ethers';
import { PancakeService, PANCAKE_FACTORY_ADDRESS } from './src/service';
import { WalletService } from './src/wallet';

async function main() {
  try {
    // 1. 初始化 provider（使用 BSC 主网）
    const provider = new JsonRpcProvider('https://bsc-dataseed1.binance.org/');
    
    // 2. 创建服务实例
    const pancakeService = new PancakeService(provider);
    
    // 创建 factory 合约实例
    const factory = new Contract(
      PANCAKE_FACTORY_ADDRESS,
      [
        'function getPair(address tokenA, address tokenB) external view returns (address pair)',
        'function allPairs(uint) external view returns (address pair)',
        'function allPairsLength() external view returns (uint)',
      ],
      provider
    );
    
    const walletService = new WalletService(provider, factory);

    // 3. 测试获取钱包余额（使用一个示例地址）
    const walletAddress = '0xcc1ddb9673e3e435334205ca71154ab4af5b272b'; // 示例地址
    console.log('Getting wallet balances...');
    const balances = await walletService.getWalletBalances(walletAddress);
    console.log('Wallet balances:', balances);

    // 4. 测试获取高收益池子
    console.log('\nFinding high yield pools...');
    const highYieldPools = await pancakeService.findHighYieldPools(20); // 最小 APY 20%
    console.log('High yield pools:', highYieldPools);

    // 5. 测试获取流动性头寸
    console.log('\nGetting position token IDs...');
    const tokenIds = await walletService.getPositionTokenIds(walletAddress);
    console.log('Position token IDs:', tokenIds);

    // 6. 获取每个头寸的详细信息
    for (const tokenId of tokenIds) {
      console.log(`\nGetting position info for token ID ${tokenId}...`);
      const positionInfo = await pancakeService.getPositionInfo(tokenId);
      console.log('Position info:', positionInfo);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

main(); 