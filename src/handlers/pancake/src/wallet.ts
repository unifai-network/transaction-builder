import { ChainId, Token, WETH9 } from '@pancakeswap/sdk';
import { Contract, JsonRpcProvider } from 'ethers';
import { BigNumber } from '@ethersproject/bignumber';
import { TOKEN_ADDRESSES } from './types';
import { ethers } from 'ethers';

export class WalletService {
  private provider: JsonRpcProvider;
  private factory: Contract;
  private nftPositions: Contract;

  constructor(provider: JsonRpcProvider, factory: Contract) {
    this.provider = provider;
    this.factory = factory;
    this.nftPositions = new Contract(
      '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364', // PANCAKE_NFT_POSITIONS_ADDRESS
      [
        'function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
        'function balanceOf(address owner) external view returns (uint256)',
        'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
      ],
      provider
    );
  }

  async getWalletBalances(walletAddress: string): Promise<Map<string, BigNumber>> {
    try {
      const balances = new Map<string, BigNumber>();

      // 1. Get common tokens
      const commonTokens = [
        WETH9[ChainId.BSC], // WBNB
        new Token(ChainId.BSC, TOKEN_ADDRESSES.CAKE, 18, 'CAKE', 'PancakeSwap Token'),
        new Token(ChainId.BSC, TOKEN_ADDRESSES.BUSD, 18, 'BUSD', 'Binance USD'),
        new Token(ChainId.BSC, TOKEN_ADDRESSES.USDT, 18, 'USDT', 'Tether USD'),
        new Token(ChainId.BSC, TOKEN_ADDRESSES.USDC, 18, 'USDC', 'USD Coin'),
        new Token(ChainId.BSC, TOKEN_ADDRESSES.DAI, 18, 'DAI', 'Dai Stablecoin'),
        new Token(ChainId.BSC, TOKEN_ADDRESSES.ETH, 18, 'ETH', 'Ethereum'),
        new Token(ChainId.BSC, TOKEN_ADDRESSES.BTCB, 18, 'BTCB', 'Bitcoin BEP20'),
        new Token(ChainId.BSC, TOKEN_ADDRESSES.DOT, 18, 'DOT', 'Polkadot'),
        new Token(ChainId.BSC, TOKEN_ADDRESSES.LINK, 18, 'LINK', 'Chainlink'),
      ];

      // 2. Get token balances
      const balancePromises = commonTokens.map(async (token) => {
        const contract = new Contract(
          token.address,
          ['function balanceOf(address) view returns (uint256)'],
          this.provider
        );
        const balance = await contract.balanceOf(walletAddress);
        balances.set(token.symbol, BigNumber.from(balance));
      });

      // 3. Get BNB balance
      const bnbBalance = await this.provider.getBalance(walletAddress);
      balances.set('BNB', BigNumber.from(bnbBalance));

      // 4. Wait for all balance queries to complete
      await Promise.all(balancePromises);

      // 5. Get LP token balances
      const lpTokens = await this.getLPTokenBalances(walletAddress);
      lpTokens.forEach((balance, symbol) => {
        balances.set(symbol, balance);
      });

      return balances;
    } catch (error) {
      console.error('Error getting wallet balances:', error);
      throw error;
    }
  }

  private async getLPTokenBalances(walletAddress: string): Promise<Map<string, BigNumber>> {
    const lpBalances = new Map<string, BigNumber>();

    try {
      // 1. Get all pools
      const pools = await this.getTopPools({});
      
      // 2. Get LP token balance for each pool
      for (const pool of pools) {
        const lpTokenContract = new Contract(
          pool.address,
          ['function balanceOf(address) view returns (uint256)'],
          this.provider
        );
        
        const balance = await lpTokenContract.balanceOf(walletAddress);
        if (balance.gt(0)) {
          const symbol = `${pool.token0.symbol}-${pool.token1.symbol} LP`;
          lpBalances.set(symbol, balance);
        }
      }

      return lpBalances;
    } catch (error) {
      console.error('Error getting LP token balances:', error);
      return lpBalances;
    }
  }

  // Get formatted display of token balances
  async getFormattedBalances(walletAddress: string): Promise<Map<string, string>> {
    const balances = await this.getWalletBalances(walletAddress);
    const formattedBalances = new Map<string, string>();

    balances.forEach((balance, symbol) => {
      if (symbol === 'BNB') {
        formattedBalances.set(symbol, ethers.formatEther(balance.toString()));
      } else {
        formattedBalances.set(symbol, ethers.formatUnits(balance.toString(), 18));
      }
    });

    return formattedBalances;
  }

  private async getTopPools(params: any): Promise<any[]> {
    // Implementation would depend on available APIs or subgraph queries
    // This is a placeholder implementation
    return [];
  }

  // Get all liquidity position tokenIds under the wallet address
  async getPositionTokenIds(walletAddress: string): Promise<number[]> {
    try {
      // 1. Get the number of positions under the wallet address
      const balance = await this.nftPositions.balanceOf(walletAddress);
      const positionCount = Number(balance);

      // 2. Get tokenId for each position
      const tokenIds: number[] = [];
      for (let i = 0; i < positionCount; i++) {
        const tokenId = await this.nftPositions.tokenOfOwnerByIndex(walletAddress, i);
        tokenIds.push(Number(tokenId));
      }

      return tokenIds;
    } catch (error) {
      console.error('Error getting position tokenIds:', error);
      throw error;
    }
  }

  async sendTransaction(to: string, data: string): Promise<ethers.TransactionResponse> {
    const tx = {
      to,
      data,
      value: '0x0',
      gasLimit: '0x100000',
      gasPrice: await this.provider.getFeeData().then(feeData => feeData.gasPrice),
      nonce: await this.provider.getTransactionCount(ethers.ZeroAddress)
    };

    return this.provider.broadcastTransaction(ethers.Transaction.from(tx).unsignedSerialized);
  }
}
