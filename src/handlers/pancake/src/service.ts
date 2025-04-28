import { ChainId, Token, WETH9, Fetcher, Route, Trade, TradeType, Percent, Price } from '@pancakeswap/sdk';
import { Contract, JsonRpcProvider, BigNumberish, ethers } from 'ethers';
import { BigNumber } from '@ethersproject/bignumber';
import { 
  PoolInfo, 
  PositionInfo, 
  AddLiquidityParams, 
  RemoveLiquidityParams, 
  StakeParams,
  PoolSearchParams,
  FEE_TIERS,
  LPPosition,
  UserAssets,
  TokenPrice,
  DecreaseLiquidityParams,
  CollectParams
} from './types';
import { WalletService } from './wallet';
import NFT_POSITIONS_ABI from './abis/NFT_POSITIONS_ABI.json';
import ROUTER_ABI from './abis/ROUTER_ABI.json';
import FACTORY_ABI from './abis/FACTORY_ABI.json';
import QUOTER_ABI from './abis/QUOTER_ABI.json';
import STAKER_ABI from './abis/STAKER_ABI.json';
import { PancakeV3PoolABI } from './abis/PancakeV3Pool';
import { NIL } from 'uuid';

// V3 Contract Addresses
const PANCAKE_V3_FACTORY_ADDRESS = '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
const PANCAKE_V3_NFT_POSITIONS_ADDRESS = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364';
const PANCAKE_V3_ROUTER_ADDRESS = '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4';
const PANCAKE_V3_QUOTER_ADDRESS = '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997';
const PANCAKE_V3_STAKER_ADDRESS = '0x3E8B82326FfFf58Dbe7db6E9E6c8fC1C0E0AeA8B';
const CAKE_TOKEN_ADDRESS = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82';
const PANCAKE_V3_ZAP_ADDRESS = '0x03a520b32C04BF3aEe7bF72f4fC9e5a3B2a0a0a0'; // Replace with actual Zap contract address

interface TokenAddresses {
  [key: string]: `0x${string}`;
}

const TOKEN_ADDRESSES: TokenAddresses = {
  'BNB': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as `0x${string}`,
  'WBNB': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as `0x${string}`,
  'USDC': '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' as `0x${string}`,
  'USDT': '0x55d398326f99059fF775485246999027B3197955' as `0x${string}`,
  'BUSD': '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56' as `0x${string}`,
  'CAKE': '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82' as `0x${string}`
};

interface GetAmount1ForLiquidityParams {
  token0: string;
  token1: string;
  amount0: string;
  tickLower: number;
  tickUpper: number;
  fee: number;
}

const ZAP_ABI = [
  'function zapIn(address token0, address token1, uint256 amount0, uint256 amount1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Min, uint256 amount1Min, uint256 deadline) external returns (uint256 tokenId)',
  'function zapInWithSwap(address tokenIn, address token0, address token1, uint256 amountIn, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amountOutMin, uint256 deadline) external returns (uint256 tokenId)'
];

export class PancakeService {
  private provider: JsonRpcProvider;
  private router: Contract;
  private factory: Contract;
  private nftPositions: Contract;
  private quoter: Contract;
  private staker: Contract;
  private priceCache: Map<string, TokenPrice>;
  private readonly PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private walletService: WalletService;

  constructor(provider: JsonRpcProvider) {
    this.provider = provider;
    this.priceCache = new Map();
    
    // Initialize V3 Router contract
    this.router = new Contract(
      PANCAKE_V3_ROUTER_ADDRESS,
      ROUTER_ABI,
      provider
    );

    // Initialize V3 Factory contract
    this.factory = new Contract(
      PANCAKE_V3_FACTORY_ADDRESS,
      FACTORY_ABI,
      provider
    );

    // Initialize V3 NFT Positions contract
    this.nftPositions = new Contract(
      PANCAKE_V3_NFT_POSITIONS_ADDRESS,
      NFT_POSITIONS_ABI,
      provider
    );

    // Initialize V3 Quoter contract
    this.quoter = new Contract(
      PANCAKE_V3_QUOTER_ADDRESS,
      [
        'function quote(bytes memory path, uint256 amount) external returns (uint256[] memory amounts)',
        'function quoteExactInput(bytes memory path, uint256 amountIn) external returns (uint256 amountOut)',
        'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)',
        'function quoteExactOutput(bytes memory path, uint256 amountOut) external returns (uint256 amountIn)',
        'function quoteExactOutputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountOut, uint160 sqrtPriceLimitX96) external returns (uint256 amountIn)'
      ],
      provider
    );

    // Initialize V3 Staker contract
    this.staker = new Contract(
      PANCAKE_V3_STAKER_ADDRESS,
      STAKER_ABI,
      provider
    );

    this.walletService = new WalletService(provider, this.factory);
  }

  async createPool(token0: string, token1: string, fee: number): Promise<string> {
    // Get token symbols from the token addresses
    const token0Contract = new Contract(token0, ['function symbol() view returns (string)'], this.provider);
    const token1Contract = new Contract(token1, ['function symbol() view returns (string)'], this.provider);
    
    const [token0Symbol, token1Symbol] = await Promise.all([
      token0Contract.symbol(),
      token1Contract.symbol()
    ]);

    const tokenA = new Token(ChainId.BSC, token0 as `0x${string}`, 18, token0Symbol);
    const tokenB = new Token(ChainId.BSC, token1 as `0x${string}`, 18, token1Symbol);
    
    const [token0Addr, token1Addr] = tokenA.sortsBefore(tokenB) 
      ? [token0, token1] 
      : [token1, token0];

    const tx = await this.factory.createPool(token0Addr, token1Addr, fee);
    const receipt = await tx.wait();
    return receipt.events[0].args.pool;
  }

  async getTopPools(params: PoolSearchParams): Promise<PoolInfo[]> {
    // Implementation would depend on available APIs or subgraph queries
    // This is a placeholder implementation
    const pools: PoolInfo[] = [];
    // TODO: Implement actual pool fetching logic using PancakeSwap's subgraph
    return pools;
  }

  private getTokenAddress(token: string): `0x${string}` {
    if (token.startsWith('0x')) {
      return token as `0x${string}`;
    }
    const address = TOKEN_ADDRESSES[token.toUpperCase()];
    if (!address) {
      throw new Error(`Unknown token symbol: ${token}`);
    }
    return address;
  }

  async getPriceRatio(token0: string, token1: string): Promise<number> {
    try {
      // Convert token symbols to addresses if needed
      const token0Address = this.getTokenAddress(token0);
      const token1Address = this.getTokenAddress(token1);

      console.log("token0Address:", token0Address);
      console.log("token1Address:", token1Address);

      // 1. Create Token instances
      const token0Contract = new Contract(token0Address, [
        'function decimals() view returns (uint8)',
        'function symbol() view returns (string)'
      ], this.provider);

      const token1Contract = new Contract(token1Address, [
        'function decimals() view returns (uint8)',
        'function symbol() view returns (string)'
      ], this.provider);

      const [token0Decimals, token1Decimals, token0Symbol, token1Symbol] = await Promise.all([
        token0Contract.decimals(),
        token1Contract.decimals(),
        token0Contract.symbol(),
        token1Contract.symbol()
      ]);

      // Validate decimals
      if (token0Decimals === undefined || token1Decimals === undefined) {
        throw new Error('Failed to get token decimals');
      }

      // 2. Get pool address - always use token0 as token0 and token1 as token1
      const pool = await this.factory.getPool(token0Address, token1Address, 500);
      if (pool === ethers.ZeroAddress) {
        throw new Error('Pool does not exist');
      }

      console.log("Pool address:", pool);

      // 3. Get pool contract
      const poolContract = new Contract(pool, PancakeV3PoolABI, this.provider);

      // 4. Get slot0 data
      const { tick } = await poolContract.slot0();

      // 5. Calculate price from tick
      const tickNumber = Number(tick);
      const price = 1.0001 ** tickNumber;

      // 6. Get actual token order from pool
      const [actualToken0, actualToken1] = await Promise.all([
        poolContract.token0(),
        poolContract.token1()
      ]);

      // 7. Adjust price based on token order and decimals
      const baseTokenIsToken0 = token0Address.toLowerCase() === actualToken0.toLowerCase();
      const decimalAdjustment = baseTokenIsToken0 
        ? 10 ** (Number(token1Decimals) - Number(token0Decimals))
        : 10 ** (Number(token0Decimals) - Number(token1Decimals));

      const adjustedPrice = baseTokenIsToken0 ? price * decimalAdjustment : (1 / price) * decimalAdjustment;

      console.log('Raw price:', price);
      console.log('Adjusted price:', adjustedPrice);
      console.log('Token order:', {
        requestedBase: token0Symbol,
        requestedQuote: token1Symbol,
        actualToken0: await (new Contract(actualToken0, ['function symbol() view returns (string)'], this.provider)).symbol(),
        actualToken1: await (new Contract(actualToken1, ['function symbol() view returns (string)'], this.provider)).symbol(),
        baseTokenIsToken0
      });

      return adjustedPrice;
    } catch (error) {
      console.error('Error in getPriceRatio:', error);
      throw error;
    }
  }

  async addLiquidity(params: AddLiquidityParams): Promise<PositionInfo> {
    try {
      const { token0, token1, amount0Desired, amount1Desired, deadline } = params;
      
      // 1. Get pool address
      const pool = await this.factory.getPool(token0, token1, 500);
      if (pool === ethers.ZeroAddress) {
        throw new Error('Pool does not exist');
      }

      // 2. Calculate price range if not provided
      const tickLower = params.tickLower ?? Math.floor(Math.log(0.8) / Math.log(1.0001));
      const tickUpper = params.tickUpper ?? Math.ceil(Math.log(1.2) / Math.log(1.0001));

      // 3. Calculate correct amount1Desired using getAmount1ForLiquidity
      const calculatedAmount1Desired = await this.getAmount1ForLiquidity({
        token0,
        token1,
        amount0: amount0Desired.toString(),
        tickLower,
        tickUpper,
        fee: 500
      });

      // 4. Create mint parameters with calculated amount1Desired
      const mintParams = {
        token0,
        token1,
        fee: 500,
        tickLower,
        tickUpper,
        amount0Desired,
        amount1Desired: calculatedAmount1Desired,
        amount0Min: 0,
        amount1Min: 0,
        recipient: ethers.ZeroAddress,
        deadline
      };

      // 5. Mint new position
      const tx = await this.nftPositions.mint(mintParams);
      const receipt = await tx.wait();
      const mintEvent = receipt.events.find((e: ethers.EventLog) => e.fragment.name === 'Mint');
      if (!mintEvent) {
        throw new Error('Mint event not found');
      }
      const tokenId = mintEvent.args.tokenId;
      
      // 6. Return position info
      return this.getPositionInfo(tokenId);
    } catch (error) {
      console.error('Error adding liquidity:', error);
      throw error;
    }
  }

  async removeLiquidity(params: RemoveLiquidityParams): Promise<ethers.TransactionResponse> {
    try {
      const { tokenId, liquidity, amount0Min, amount1Min, deadline } = params;
      
      // 1. Get position info
      const position = await this.getPositionInfo(tokenId);
      
      // 2. Prepare multicall data
      const multicallData = [];

      // 3. Add decreaseLiquidity operation
      const decreaseLiquidityParams = {
        tokenId: tokenId,
        liquidity: liquidity,
        amount0Min: amount0Min || '0',
        amount1Min: amount1Min || '0',
        deadline: deadline
      };

      const decreaseLiquidityCalldata = this.nftPositions.interface.encodeFunctionData('decreaseLiquidity', [decreaseLiquidityParams]);
      multicallData.push(decreaseLiquidityCalldata);

      // 4. Add collect operation
      const collectParams = {
        tokenId: tokenId,
        recipient: ethers.ZeroAddress,
        amount0Max: position.token0Amount.toString(),
        amount1Max: position.token1Amount.toString()
      };

      const collectCalldata = this.nftPositions.interface.encodeFunctionData('collect', [collectParams]);
      multicallData.push(collectCalldata);

      // 5. Execute multicall on NFT Positions contract using wallet service
      const tx = await this.walletService.sendTransaction(
        PANCAKE_V3_NFT_POSITIONS_ADDRESS,
        this.nftPositions.interface.encodeFunctionData('multicall', [multicallData])
      );
      return tx;
    } catch (error) {
      console.error('Error removing liquidity:', error);
      throw error;
    }
  }

  async stake(params: StakeParams): Promise<void> {
    try {
      const tx = await this.staker.deposit(params.tokenId);
      await tx.wait();
    } catch (error) {
      console.error('Error staking position:', error);
      throw error;
    }
  }

  async getPositionInfo(tokenId: number): Promise<PositionInfo> {
    try {
      const position = await this.nftPositions.positions(tokenId);
      return {
        tokenId,
        liquidity: position.liquidity,
        token0Amount: position.tokensOwed0,
        token1Amount: position.tokensOwed1,
        feeGrowthInside0LastX128: position.feeGrowthInside0LastX128,
        feeGrowthInside1LastX128: position.feeGrowthInside1LastX128,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
        fee: position.fee
      };
    } catch (error) {
      console.error('Error getting position info:', error);
      throw error;
    }
  }

  async findHighYieldPools(minTVL: number = 100000, minVolume24h: number = 50000, minAPY: number = 20): Promise<PoolInfo[]> {
    // Implementation would depend on available APIs or subgraph queries
    // This is a placeholder implementation
    const pools: PoolInfo[] = [];
    // TODO: Implement actual pool fetching logic using PancakeSwap's V3 subgraph
    return pools;
  }

  private async getPoolTVL(poolAddress: string): Promise<number> {
    try {
      const poolContract = new Contract(poolAddress, [
        'function liquidity() external view returns (uint128)',
        'function token0() external view returns (address)',
        'function token1() external view returns (address)',
        'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
      ], this.provider);

      const [liquidity, token0, token1, [sqrtPriceX96]] = await Promise.all([
        poolContract.liquidity(),
        poolContract.token0(),
        poolContract.token1(),
        poolContract.slot0()
      ]);

      const price = (Number(sqrtPriceX96) / 2 ** 96) ** 2;
      const token0Contract = new Contract(token0, ['function decimals() view returns (uint8)'], this.provider);
      const token1Contract = new Contract(token1, ['function decimals() view returns (uint8)'], this.provider);
      
      const [decimals0, decimals1] = await Promise.all([
        token0Contract.decimals(),
        token1Contract.decimals()
      ]);

      const tvl = Number(liquidity) * price * (10 ** (decimals1 - decimals0));
      return tvl;
    } catch (error) {
      console.error('Error getting pool TVL:', error);
      return 0;
    }
  }

  private async getPoolVolume24h(poolAddress: string): Promise<number> {
    // Implementation to get pool's 24h trading volume
    // This would typically involve querying the V3 subgraph for swap events
    return 0; // Placeholder
  }

  private async calculatePoolAPY(poolAddress: string): Promise<number> {
    try {
      const poolContract = new Contract(poolAddress, [
        'function fee() external view returns (uint24)',
        'function liquidity() external view returns (uint128)',
        'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
      ], this.provider);

      const [fee, liquidity, [sqrtPriceX96]] = await Promise.all([
        poolContract.fee(),
        poolContract.liquidity(),
        poolContract.slot0()
      ]);

      const price = (Number(sqrtPriceX96) / 2 ** 96) ** 2;
      const feeRate = Number(fee) / 1000000;
      const volume24h = await this.getPoolVolume24h(poolAddress);
      const fees24h = volume24h * feeRate;
      const tvl = await this.getPoolTVL(poolAddress);
      const apy = (fees24h * 365) / tvl * 100;

      return apy;
    } catch (error) {
      console.error('Error calculating pool APY:', error);
      return 0;
    }
  }

  private async getTokenPrice(token: Token): Promise<number> {
    const cacheKey = token.address.toLowerCase();
    const cached = this.priceCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.PRICE_CACHE_TTL) {
      return cached.price;
    }

    try {
      // Try to get price from WBNB pair first
      const wbnbToken = WETH9[ChainId.BSC];
      const pair = await Fetcher.fetchPairData(token, wbnbToken, this.provider as any);
      const route = new Route([pair], token, wbnbToken);
      const price = parseFloat(route.midPrice.toSignificant(6));

      this.priceCache.set(cacheKey, {
        token,
        price,
        timestamp: Date.now()
      });

      return price;
    } catch (error) {
      console.error(`Failed to get price for ${token.symbol}:`, error);
      return 0;
    }
  }

  private async getTokenPrices(tokens: Token[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    const pricePromises = tokens.map(async token => {
      const price = await this.getTokenPrice(token);
      prices.set(token.address.toLowerCase(), price);
    });
    await Promise.all(pricePromises);
    return prices;
  }

  private async calculateLPTVL(pair: any, totalSupply: BigNumberish, prices: Map<string, number>): Promise<BigNumberish> {
    const [reserve0, reserve1] = await Promise.all([
      pair.reserve0,
      pair.reserve1
    ]);

    const price0 = prices.get(pair.token0.address.toLowerCase()) || 0;
    const price1 = prices.get(pair.token1.address.toLowerCase()) || 0;

    const tvl = (parseFloat(reserve0.toString()) * price0) + (parseFloat(reserve1.toString()) * price1);
    return tvl.toString();
  }

  private async calculateLPAPY(pair: any, tvl: BigNumberish): Promise<number> {
    try {
      const volume24h = await pair.volume24h();
      const feeRate = pair.fee / 1000000;
      const fees24h = parseFloat(volume24h.toString()) * feeRate;
      const apy = (fees24h * 365) / parseFloat(tvl.toString()) * 100;
      return apy;
    } catch (error) {
      console.error(`Failed to calculate APY for pair ${pair.token0.symbol}/${pair.token1.symbol}:`, error);
      return 0;
    }
  }

  async getUserAssets(walletAddress: string): Promise<UserAssets> {
    try {
      // Get common tokens
      const tokens = await Promise.all([
        Fetcher.fetchTokenData(ChainId.BSC, TOKEN_ADDRESSES.CAKE, this.provider as any, 'CAKE', 'PancakeSwap Token'),
        WETH9[ChainId.BSC],
        Fetcher.fetchTokenData(ChainId.BSC, TOKEN_ADDRESSES.BUSD, this.provider as any, 'BUSD', 'Binance USD'),
        Fetcher.fetchTokenData(ChainId.BSC, TOKEN_ADDRESSES.USDT, this.provider as any, 'USDT', 'Tether USD'),
        Fetcher.fetchTokenData(ChainId.BSC, TOKEN_ADDRESSES.USDC, this.provider as any, 'USDC', 'USD Coin'),
        Fetcher.fetchTokenData(ChainId.BSC, TOKEN_ADDRESSES.DAI, this.provider as any, 'DAI', 'Dai Stablecoin'),
        Fetcher.fetchTokenData(ChainId.BSC, TOKEN_ADDRESSES.ETH, this.provider as any, 'ETH', 'Ethereum'),
        Fetcher.fetchTokenData(ChainId.BSC, TOKEN_ADDRESSES.BTCB, this.provider as any, 'BTCB', 'Bitcoin BEP20'),
        Fetcher.fetchTokenData(ChainId.BSC, TOKEN_ADDRESSES.DOT, this.provider as any, 'DOT', 'Polkadot'),
        Fetcher.fetchTokenData(ChainId.BSC, TOKEN_ADDRESSES.LINK, this.provider as any, 'LINK', 'Chainlink'),
      ]);

      // Get token prices
      const prices = await this.getTokenPrices(tokens);

      // Get pairs
      const pairs = await Promise.all([
        Fetcher.fetchPairData(tokens[0], tokens[1], this.provider as any), // CAKE/WBNB
        Fetcher.fetchPairData(tokens[0], tokens[2], this.provider as any), // CAKE/BUSD
        Fetcher.fetchPairData(tokens[0], tokens[3], this.provider as any), // CAKE/USDT
        Fetcher.fetchPairData(tokens[1], tokens[2], this.provider as any), // WBNB/BUSD
        Fetcher.fetchPairData(tokens[1], tokens[3], this.provider as any), // WBNB/USDT
        Fetcher.fetchPairData(tokens[2], tokens[3], this.provider as any), // BUSD/USDT
        Fetcher.fetchPairData(tokens[1], tokens[6], this.provider as any), // WBNB/ETH
        Fetcher.fetchPairData(tokens[1], tokens[7], this.provider as any), // WBNB/BTCB
      ]);

      // Get CAKE token contract
      const cakeContract = new Contract(
        TOKEN_ADDRESSES.CAKE,
        ['function balanceOf(address owner) external view returns (uint256)'],
        this.provider
      );

      const [cakeBalance, cakeStaked] = await Promise.all([
        cakeContract.balanceOf(walletAddress),
        this.staker.userInfo(0, walletAddress).then(info => info.amount)
      ]);

      const cakePrice = prices.get(TOKEN_ADDRESSES.CAKE.toLowerCase()) || 0;
      const cakeValue = BigNumber.from(cakeBalance)
        .add(BigNumber.from(cakeStaked))
        .mul(Math.floor(cakePrice * 1e18))
        .div(1e18);

      const assets: UserAssets = {
        cake: {
          balance: cakeBalance.toString(),
          staked: cakeStaked.toString(),
          price: cakePrice,
          value: cakeValue.toString()
        },
        lpPositions: [],
        totalValue: cakeValue.toString()
      };

      // Get LP positions
      for (const pair of pairs) {
        const lpTokenContract = new Contract(
          pair.liquidityToken.address,
          [
            'function balanceOf(address owner) external view returns (uint256)',
            'function totalSupply() external view returns (uint256)',
          ],
          this.provider
        );

        const [balance, totalSupply] = await Promise.all([
          lpTokenContract.balanceOf(walletAddress),
          lpTokenContract.totalSupply()
        ]);

        const staked = await this.staker.userInfo(0, walletAddress).then(info => info.amount);

        if (BigNumber.from(balance).gt(0) || BigNumber.from(staked).gt(0)) {
          const tvl = await this.calculateLPTVL(pair, totalSupply, prices);
          const apy = await this.calculateLPAPY(pair, tvl);
          const price0 = prices.get(pair.token0.address.toLowerCase()) || 0;
          const price1 = prices.get(pair.token1.address.toLowerCase()) || 0;
          
          const lpValue = BigNumber.from(balance)
            .add(BigNumber.from(staked))
            .mul(Math.floor(parseFloat(tvl.toString()) / parseFloat(totalSupply.toString()) * 1e18))
            .div(1e18);

          assets.lpPositions.push({
            pair: `${pair.token0.symbol}/${pair.token1.symbol}`,
            token0: pair.token0,
            token1: pair.token1,
            balance: balance.toString(),
            staked: staked.toString(),
            tvl: tvl.toString(),
            apy,
            price0,
            price1,
            value: lpValue.toString()
          });

          assets.totalValue = BigNumber.from(assets.totalValue).add(lpValue).toString();
        }
      }

      return assets;
    } catch (error) {
      console.error('Failed to get user assets:', error);
      throw error;
    }
  }

  async addLiquidityWithSwap(params: AddLiquidityParams & { swapPath?: string[] }, address: string): Promise<PositionInfo> {
    try {
      const { token0, token1, amount0Desired, amount1Desired, deadline, swapPath } = params;
      
      // 1. Get pool address
      const pool = await this.factory.getPool(token0, token1, 500);
      if (pool === ethers.ZeroAddress) {
        throw new Error('Pool does not exist');
      }

      // 2. Check if user already has a position in this pool
      const allPositions = await this.getAllPositions(address);
      const existingPosition = allPositions.find(pos => {
        const positionPool = this.factory.getPool(token0, token1, pos.fee);
        return positionPool === pool;
      });

      if (existingPosition) {
        console.log('Found existing position:', existingPosition);
        // If position exists, use increaseLiquidity instead
        return this.increaseLiquidity({
          tokenId: existingPosition.tokenId,
          amount0Desired,
          amount1Desired,
          amount0Min: '0',
          amount1Min: '0',
          deadline: deadline || Math.floor(Date.now() / 1000) + 60 * 20
        });
      }

      // 3. Calculate price range if not provided
      const tickLower = params.tickLower ?? Math.floor(Math.log(0.8) / Math.log(1.0001));
      const tickUpper = params.tickUpper ?? Math.ceil(Math.log(1.2) / Math.log(1.0001));

      // 4. Calculate correct amount1Desired using getAmount1ForLiquidity
      const calculatedAmount1Desired = await this.getAmount1ForLiquidity({
        token0,
        token1,
        amount0: amount0Desired.toString(),
        tickLower,
        tickUpper,
        fee: 500
      });

      // 5. Get wallet balances
      const balances = await this.getWalletBalances(address);
      const token0Balance = balances.get(token0.toLowerCase()) || BigNumber.from(0);
      const token1Balance = balances.get(token1.toLowerCase()) || BigNumber.from(0);

      console.log('Wallet balances:', {
        token0: token0Balance.toString(),
        token1: token1Balance.toString()
      });

      // 6. Check if wallet has any of the tokens
      if (token0Balance.eq(0) && token1Balance.eq(0)) {
        throw new Error('Wallet does not have any of the required tokens');
      }

      // 7. Prepare multicall data
      const multicallData = [];

      // 8. Add token approvals
      const token0Contract = new Contract(token0, [
        'function approve(address spender, uint256 amount) external returns (bool)',
        'function allowance(address owner, address spender) external view returns (uint256)'
      ], this.provider);

      const token1Contract = new Contract(token1, [
        'function approve(address spender, uint256 amount) external returns (bool)',
        'function allowance(address owner, address spender) external view returns (uint256)'
      ], this.provider);

      // Check and approve for Router
      const [routerAllowance0, routerAllowance1] = await Promise.all([
        token0Contract.allowance(address, PANCAKE_V3_ROUTER_ADDRESS),
        token1Contract.allowance(address, PANCAKE_V3_ROUTER_ADDRESS)
      ]);

      if (BigNumber.from(routerAllowance0).lt(amount0Desired)) {
        const approveRouter0Calldata = token0Contract.interface.encodeFunctionData('approve', [
          PANCAKE_V3_ROUTER_ADDRESS,
          ethers.MaxUint256
        ]);
        multicallData.push(approveRouter0Calldata);
      }

      if (BigNumber.from(routerAllowance1).lt(calculatedAmount1Desired)) {
        const approveRouter1Calldata = token1Contract.interface.encodeFunctionData('approve', [
          PANCAKE_V3_ROUTER_ADDRESS,
          ethers.MaxUint256
        ]);
        multicallData.push(approveRouter1Calldata);
      }

      // Check and approve for NFT Positions
      const [nftAllowance0, nftAllowance1] = await Promise.all([
        token0Contract.allowance(address, PANCAKE_V3_NFT_POSITIONS_ADDRESS),
        token1Contract.allowance(address, PANCAKE_V3_NFT_POSITIONS_ADDRESS)
      ]);

      if (BigNumber.from(nftAllowance0).lt(amount0Desired)) {
        const approveNFT0Calldata = token0Contract.interface.encodeFunctionData('approve', [
          PANCAKE_V3_NFT_POSITIONS_ADDRESS,
          ethers.MaxUint256
        ]);
        multicallData.push(approveNFT0Calldata);
      }

      if (BigNumber.from(nftAllowance1).lt(calculatedAmount1Desired)) {
        const approveNFT1Calldata = token1Contract.interface.encodeFunctionData('approve', [
          PANCAKE_V3_NFT_POSITIONS_ADDRESS,
          ethers.MaxUint256
        ]);
        multicallData.push(approveNFT1Calldata);
      }

      // 9. Add swap operation if needed
      if (token0Balance.gt(0) && token1Balance.eq(0)) {
        // Swap token0 to token1
        const swapAmount = BigNumber.from(amount0Desired).gt(token0Balance) ? token0Balance : amount0Desired;
        const swapCalldata = this.router.interface.encodeFunctionData('exactInputSingle', [
          token0,
          token1,
          500,
          address,
          deadline,
          swapAmount,
          0 // amountOutMinimum
        ]);
        multicallData.push(swapCalldata);
      } else if (token1Balance.gt(0) && token0Balance.eq(0)) {
        // Swap token1 to token0
        const swapAmount = BigNumber.from(calculatedAmount1Desired).gt(token1Balance) ? token1Balance : calculatedAmount1Desired;
        const swapCalldata = this.router.interface.encodeFunctionData('exactInputSingle', [
          token1,
          token0,
          500,
          address,
          deadline,
          swapAmount,
          0 // amountOutMinimum
        ]);
        multicallData.push(swapCalldata);
      }

      // 10. Add mint operation with calculated amount1Desired
      const mintParams = {
        token0,
        token1,
        fee: 500,
        tickLower,
        tickUpper,
        amount0Desired,
        amount1Desired: calculatedAmount1Desired,
        amount0Min: 0,
        amount1Min: 0,
        recipient: address,
        deadline
      };

      const mintCalldata = this.nftPositions.interface.encodeFunctionData('mint', [mintParams]);
      multicallData.push(mintCalldata);

      // 11. Execute multicall
      const tx = await this.router.multicall(multicallData);
      const receipt = await tx.wait();
      
      // 12. Get tokenId from the mint event
      const mintEvent = receipt.events.find((e: ethers.EventLog) => e.fragment.name === 'Mint');
      if (!mintEvent) {
        throw new Error('Mint event not found');
      }
      const tokenId = mintEvent.args.tokenId;
      
      // 13. Return position info
      return this.getPositionInfo(tokenId);
    } catch (error) {
      console.error('Error adding liquidity with swap:', error);
      throw error;
    }
  }

  async addLiquidityWithZap(params: AddLiquidityParams & { swapPath?: string[] }, address: string): Promise<PositionInfo> {
    try {
      const { token0, token1, amount0Desired, amount1Desired, deadline, swapPath } = params;
      
      // 1. Get pool address
      const pool = await this.factory.getPool(token0, token1, 500);
      if (pool === ethers.ZeroAddress) {
        throw new Error('Pool does not exist');
      }

      // 2. Check if user already has a position in this pool
      const allPositions = await this.getAllPositions(address);
      const existingPosition = allPositions.find(pos => {
        const positionPool = this.factory.getPool(token0, token1, pos.fee);
        return positionPool === pool;
      });

      if (existingPosition) {
        console.log('Found existing position:', existingPosition);
        // If position exists, use increaseLiquidity instead
        return this.increaseLiquidity({
          tokenId: existingPosition.tokenId,
          amount0Desired,
          amount1Desired,
          amount0Min: '0',
          amount1Min: '0',
          deadline: deadline || Math.floor(Date.now() / 1000) + 60 * 20
        });
      }

      // 3. Calculate price range if not provided
      const tickLower = params.tickLower ?? Math.floor(Math.log(0.8) / Math.log(1.0001));
      const tickUpper = params.tickUpper ?? Math.ceil(Math.log(1.2) / Math.log(1.0001));

      // 4. Calculate correct amount1Desired using getAmount1ForLiquidity
      const calculatedAmount1Desired = await this.getAmount1ForLiquidity({
        token0,
        token1,
        amount0: amount0Desired.toString(),
        tickLower,
        tickUpper,
        fee: 500
      });

      // 5. Get wallet balances
      const balances = await this.getWalletBalances(address);
      const token0Balance = balances.get(token0.toLowerCase()) || BigNumber.from(0);
      const token1Balance = balances.get(token1.toLowerCase()) || BigNumber.from(0);

      console.log('Wallet balances:', {
        token0: token0Balance.toString(),
        token1: token1Balance.toString()
      });

      // 6. Check if wallet has any of the tokens
      if (token0Balance.eq(0) && token1Balance.eq(0)) {
        throw new Error('Wallet does not have any of the required tokens');
      }

      // 7. Initialize Zap contract
      const zapContract = new Contract(PANCAKE_V3_ZAP_ADDRESS, ZAP_ABI, this.provider);

      // 8. Prepare transaction data based on token balances
      let tx;
      if (token0Balance.gt(0) && token1Balance.gt(0)) {
        // If user has both tokens, use zapIn
        tx = await zapContract.zapIn(
          token0,
          token1,
          amount0Desired,
          calculatedAmount1Desired,
          500, // fee
          tickLower,
          tickUpper,
          0, // amount0Min
          0, // amount1Min
          deadline || Math.floor(Date.now() / 1000) + 60 * 20
        );
      } else if (token0Balance.gt(0)) {
        // If user only has token0, use zapInWithSwap
        tx = await zapContract.zapInWithSwap(
          token0,
          token0,
          token1,
          amount0Desired,
          500, // fee
          tickLower,
          tickUpper,
          0, // amountOutMin
          deadline || Math.floor(Date.now() / 1000) + 60 * 20
        );
      } else if (token1Balance.gt(0)) {
        // If user only has token1, use zapInWithSwap
        tx = await zapContract.zapInWithSwap(
          token1,
          token1,
          token0,
          calculatedAmount1Desired,
          500, // fee
          tickLower,
          tickUpper,
          0, // amountOutMin
          deadline || Math.floor(Date.now() / 1000) + 60 * 20
        );
      }

      // 9. Wait for transaction and get tokenId
      const receipt = await tx.wait();
      const zapEvent = receipt.events.find((e: ethers.EventLog) => e.fragment.name === 'ZapIn' || e.fragment.name === 'ZapInWithSwap');
      if (!zapEvent) {
        throw new Error('Zap event not found');
      }
      const tokenId = zapEvent.args.tokenId;
      
      // 10. Return position info
      return this.getPositionInfo(tokenId);
    } catch (error) {
      console.error('Error adding liquidity with zap:', error);
      throw error;
    }
  }

  // 添加 ETH 流动性的特殊方法
  async addLiquidityETH(params: {
    token: string;
    amountTokenDesired: BigNumberish;
    amountETHDesired: BigNumberish;
    amountTokenMin: BigNumberish;
    amountETHMin: BigNumberish;
    deadline: number;
  }): Promise<PositionInfo> {
    try {
      const { token, amountTokenDesired, amountETHDesired, amountTokenMin, amountETHMin, deadline } = params;

      // 执行添加流动性操作
      const tx = await this.router.exactInputSingle(
        token,
        ethers.ZeroAddress,
        500,
        ethers.ZeroAddress,
        deadline,
        amountTokenDesired,
        amountTokenMin
      );

      const receipt = await tx.wait();
      const tokenId = receipt.events[0].args.amountOut;
      
      return this.getPositionInfo(tokenId);
    } catch (error) {
      console.error('Error adding liquidity with ETH:', error);
      throw error;
    }
  }

  // 添加新的方法来获取钱包余额
  async getWalletBalances(walletAddress: string): Promise<Map<string, BigNumber>> {
    return this.walletService.getWalletBalances(walletAddress);
  }

  async getFormattedBalances(walletAddress: string): Promise<Map<string, string>> {
    return this.walletService.getFormattedBalances(walletAddress);
  }

  // 获取钱包地址下的所有流动性头寸信息
  async getAllPositions(walletAddress: string): Promise<PositionInfo[]> {
    try {
      // 1. 获取所有 tokenId
      const tokenIds = await this.walletService.getPositionTokenIds(walletAddress);

      // 2. 获取每个头寸的详细信息
      const positions = await Promise.all(
        tokenIds.map(tokenId => this.getPositionInfo(tokenId))
      );

      return positions;
    } catch (error) {
      console.error('Error getting all positions:', error);
      throw error;
    }
  }

  // 收集流动性头寸的手续费奖励
  async collectFees(tokenId: number, recipient?: string): Promise<string> {
    try {
      // 1. Get position info to check available fees and owner
      const position = await this.getPositionInfo(tokenId);
      console.log('Position info for collect fees:', position);

      // 2. Get position owner if recipient is not provided
      const positionInfo = await this.nftPositions.positions(tokenId);
      const positionOwner = positionInfo.operator;
      console.log('Position owner:', positionOwner);

      // 3. Prepare collect params
      const collectParams = {
        tokenId,
        recipient: recipient || positionOwner,  // Use position owner as default recipient
        amount0Max: '0xffffffffffffffffffffffffffffffff', // uint128 max value as string
        amount1Max: '0xffffffffffffffffffffffffffffffff'  // uint128 max value as string
      };

      console.log('Collect fees params:', collectParams);

      // 4. Encode collect transaction data
      const collectData = this.nftPositions.interface.encodeFunctionData('collect', [collectParams]);
      console.log('Collect data:', collectData);

      return collectData;
    } catch (error) {
      console.error('Error preparing collect fees transaction:', error);
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          stack: error.stack
        });
      }
      throw error;
    }
  }

  async getRemoveLiquidityTransactionData(params: RemoveLiquidityParams, recipient: string): Promise<{ decreaseLiquidityData: string; collectData: string }> {
    try {
      const { tokenId, liquidity, amount0Min, amount1Min, deadline } = params;
      
      // 1. Get position info
      const position = await this.getPositionInfo(tokenId);
      console.log('Position info:', position);
      
      // 2. Prepare decreaseLiquidity params
      const decreaseLiquidityParams = {
        tokenId: tokenId,
        liquidity: liquidity || position.liquidity.toString(),
        amount0Min: amount0Min || '0',
        amount1Min: amount1Min || '0',
        deadline: deadline || Math.floor(Date.now() / 1000) + 60 * 20
      };

      console.log('Decrease liquidity params:', decreaseLiquidityParams);
      
      // 3. Encode decreaseLiquidity transaction data
      const decreaseLiquidityData = this.nftPositions.interface.encodeFunctionData('decreaseLiquidity', [decreaseLiquidityParams]);
      console.log('Decrease liquidity data:', decreaseLiquidityData);

      // 4. Prepare collect params
      const collectParams = {
        tokenId: tokenId,
        recipient: recipient,
        amount0Max: BigNumber.from('0xffffffffffffffffffffffffffffffff'), // uint128 max value
        amount1Max: BigNumber.from('0xffffffffffffffffffffffffffffffff')  // uint128 max value
      };

      console.log('Collect params:', collectParams);
      
      // 5. Encode collect transaction data
      const collectData = this.nftPositions.interface.encodeFunctionData('collect', [collectParams]);
      console.log('Collect data:', collectData);
      
      return { decreaseLiquidityData, collectData };
    } catch (error) {
      console.error('Error getting remove liquidity transaction data:', error);
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          stack: error.stack
        });
      }
      throw error;
    }
  }

  // 为现有 NFT 头寸增加流动性
  async increaseLiquidity(params: {
    tokenId: number;
    amount0Desired: BigNumberish;
    amount1Desired: BigNumberish;
    amount0Min: BigNumberish;
    amount1Min: BigNumberish;
    deadline: number;
  }): Promise<PositionInfo> {
    try {
      const { tokenId, amount0Desired, amount1Desired, amount0Min, amount1Min, deadline } = params;
      
      // 1. 获取当前头寸信息
      const position = await this.getPositionInfo(tokenId);
      console.log('Current position info:', position);

      // 2. 准备增加流动性的参数
      const increaseLiquidityParams = {
        tokenId,
        amount0Desired,
        amount1Desired,
        amount0Min: amount0Min || '0',
        amount1Min: amount1Min || '0',
        deadline: deadline || Math.floor(Date.now() / 1000) + 60 * 20
      };

      console.log('Increase liquidity params:', increaseLiquidityParams);

      // 3. 编码增加流动性交易数据
      const increaseLiquidityData = this.nftPositions.interface.encodeFunctionData('increaseLiquidity', [increaseLiquidityParams]);
      console.log('Increase liquidity data:', increaseLiquidityData);

      // 4. 创建交易
      const transaction = ethers.Transaction.from({
        to: PANCAKE_V3_NFT_POSITIONS_ADDRESS,
        data: increaseLiquidityData
      });

      // 5. 返回交易数据
      return {
        tokenId,
        liquidity: position.liquidity, // 当前流动性
        token0Amount: position.token0Amount,
        token1Amount: position.token1Amount,
        feeGrowthInside0LastX128: position.feeGrowthInside0LastX128,
        feeGrowthInside1LastX128: position.feeGrowthInside1LastX128,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
        fee: position.fee,
        transactionData: transaction.serialized
      };
    } catch (error) {
      console.error('Error preparing increase liquidity transaction:', error);
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          stack: error.stack
        });
      }
      throw error;
    }
  }

  async getAmount1ForLiquidity(params: GetAmount1ForLiquidityParams): Promise<string> {
    const { token0, token1, amount0, tickLower, tickUpper, fee } = params;

    // Convert token symbols to addresses if needed
    const token0Address = this.getTokenAddress(token0);
    const token1Address = this.getTokenAddress(token1);

    // Get token decimals
    const token0Contract = new Contract(token0Address, ['function decimals() view returns (uint8)', 'function symbol() view returns (string)'], this.provider);
    const token1Contract = new Contract(token1Address, ['function decimals() view returns (uint8)', 'function symbol() view returns (string)'], this.provider);
    const [token0Decimals, token1Decimals, token0Symbol, token1Symbol] = await Promise.all([
      token0Contract.decimals(),
      token1Contract.decimals(),
      token0Contract.symbol(),
      token1Contract.symbol()
    ]);

    console.log('Token decimals:', {
      [token0Symbol]: token0Decimals,
      [token1Symbol]: token1Decimals
    });

    // Get pool contract and current price
    const poolAddress = await this.getPoolAddress(token0Address, token1Address, fee);
    const poolContract = new Contract(poolAddress, PancakeV3PoolABI, this.provider);
    const { tick } = await poolContract.slot0();

    // Calculate current price
    const tickNumber = Number(tick);
    const price = 1.0001 ** tickNumber;

    // Get actual token order from pool
    const [actualToken0, actualToken1] = await Promise.all([
      poolContract.token0(),
      poolContract.token1()
    ]);

    // Check if the price needs to be inverted based on token order
    const isInverted = token0.toLowerCase() !== actualToken0.toLowerCase();
    const currentPrice = isInverted ? 1 / price : price;

    console.log('Price information:', {
      currentPrice,
      priceLower: 1.0001 ** tickLower,
      priceUpper: 1.0001 ** tickUpper
    });

    // Convert amount0 to decimal number
    const amount0Decimal = Number(amount0) / (10 ** Number(token0Decimals));

    // Calculate amount1 based on current price
    console.log('Current price is within range, calculating based on current price');
    const amount1Decimal = amount0Decimal * currentPrice;
    
    // Convert amount1 back to wei
    const amount1Wei = BigInt(Math.floor(amount1Decimal * (10 ** Number(token1Decimals))));

    console.log(`Amount1 for ${amount0Decimal} ${await token0Contract.symbol()}: ${amount1Decimal} ${await token1Contract.symbol()}`);
    
    return amount1Wei.toString();
  }

  private async getPoolAddress(token0: string, token1: string, fee: number): Promise<string> {
    const pool = await this.factory.getPool(token0, token1, fee);
    if (pool === ethers.ZeroAddress) {
      throw new Error('Pool does not exist');
    }
    return pool;
  }
} 