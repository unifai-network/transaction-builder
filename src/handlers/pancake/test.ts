import { JsonRpcProvider, parseEther, Contract } from 'ethers';
import { PancakeService, PANCAKE_FACTORY_ADDRESS } from './src/service';
import { WalletService } from './src/wallet';

async function main() {
  try {
    // 1. Initialize provider (using BSC mainnet)
    const provider = new JsonRpcProvider('https://bsc-dataseed1.binance.org/');
    
    // 2. Create service instances
    const pancakeService = new PancakeService(provider);
    
    // Create factory contract instance
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

    // 3. Test getting wallet balances (using an example address)
    const walletAddress = '0xcc1ddb9673e3e435334205ca71154ab4af5b272b'; // Example address
    console.log('Getting wallet balances...');
    const balances = await walletService.getWalletBalances(walletAddress);
    console.log('Wallet balances:', balances);

    // 4. Test finding high yield pools
    console.log('\nFinding high yield pools...');
    const highYieldPools = await pancakeService.findHighYieldPools(20); // Minimum APY 20%
    console.log('High yield pools:', highYieldPools);

    // 5. Test getting liquidity positions
    console.log('\nGetting position token IDs...');
    const tokenIds = await walletService.getPositionTokenIds(walletAddress);
    console.log('Position token IDs:', tokenIds);

    // 6. Get detailed information for each position
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