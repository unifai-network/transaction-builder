import { API } from "unifai-sdk";
import * as querystring from 'querystring';
import * as crypto from 'crypto';

export class OkxAPIBase extends API {
  private okxApiKey: string;
  private okxSecretKey: string;
  private okxPassphrase: string;

  constructor(apiKey: string, secretKey: string, passphrase: string) {
    super({ endpoint: 'https://www.okx.com' });
    this.okxApiKey = apiKey;
    this.okxSecretKey = secretKey;
    this.okxPassphrase = passphrase;
  }

  private preHash(timestamp: string, method: string, request_path: string, params: Record<string, any>, body: any) {
    // Create a pre-signature based on strings and parameters
    let query_string = '';
    if (params && Object.keys(params).length > 0) {
      query_string += '?' + querystring.stringify(params);
    }
    if (body) {
      query_string += JSON.stringify(body);
    }
    return timestamp + method + request_path + query_string;
  }

  private sign(message: string, secret_key: string) {
    // Use HMAC-SHA256 to sign the pre-signed string
    const hmac = crypto.createHmac('sha256', secret_key);
    hmac.update(message);
    return hmac.digest('base64');
  }

  private createSignature(method: string, request_path: string, params: Record<string, any>, body: any, secretKey: string) {
    // Get the timestamp in ISO 8601 format
    const timestamp = new Date().toISOString().slice(0, -5) + 'Z';
    // Generate a signature
    const message = this.preHash(timestamp, method, request_path, params, body);
    const signature = this.sign(message, secretKey);
    return { signature, timestamp };
  }

  public async request(method: string, path: string, options: any) {
    const { signature, timestamp } = this.createSignature(method, path, options.params, options.json, this.okxSecretKey);
    const response = await super.request(method, path, {
      headers: {
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-KEY': this.okxApiKey,
        'OK-ACCESS-PASSPHRASE': this.okxPassphrase,
        'OK-ACCESS-PROJECT': '', // This applies only to WaaS APIs
        ...options.headers
      },
      ...options
    });
    if (response.code === 0) {
      return response.data;
    } else {
      throw new Error(`OKX API Error: ${response.detailMsg || response.error_message || response.msg || response}`)
    }
  }
}

export enum Chain {
  Ethereum = 1,
  Optimism = 10,
  BNB = 56,
  Polygon = 137,
  Solana = 501,
  Base = 8453,
  Avalanche_C = 43114,
}

export enum InvestType {
  Saving = 1,
  LiquidityPool = 2,
  Farming = 3,
  Vaults = 4,
  Staking = 5,
}

export enum InvestRateType {
  APY = 0,
  APR = 1,
}

export enum AuthorizationType {
  Subscription = 3,
  Redemption = 4,
  Claim = 5,
}

export type QueryProductDetailParams = {
  investmentId: string;
  investmentCategory?: string;
};

export type QueryProductDetailResult = {
  investmentId: string;
  investmentName: string;
  chainId: string;
  rate: string;
  investType: InvestType;
  platformName: string;
  platformId: string;
  analysisPlatformId: string;
  rateType: InvestRateType;
  tvl: string;
  underlyingToken: {
    isBaseToken: boolean;
    tokenAddress: string;
    tokenSymbol: string;
  }[];
  isInvestable: boolean;
  utilizationRate: string;
  earnedToken: {
    isBaseToken: boolean;
    tokenAddress: string;
    tokenSymbol: string;
  }[];
  lpToken: {
    isBaseToken: boolean;
    tokenAddress: string;
    tokenSymbol: string;
  }[];
};

export type GenerateAuthorizationTransactionParams = {
  address: string;
  investmentId: string;
  type: AuthorizationType,
  userInputList: {
    chainId?: string;
    coinAmount: string;
    tokenAddress?: string;
  }[];
  expectOutputList?: {
    chainId?: string;
    coinAmount: string;
    tokenAddress?: string;
  }[];
};

export type GenerateAuthorizationTransactionResult = {
  dataList: {
    from: string;
    to: string;
    value: string;
    serializedData: string;
    originalData: string;
    callDataType: string;
    signatureData: string;
  }[];
};

export type GenerateSubscriptionTransactionParams = {
  address: string;
  investmentId: string;
  userInputList: {
    chainId?: string;
    coinAmount: string;
    tokenAddress?: string;
  }[];
  expectOutputList: {
    chainId?: string;
    coinAmount: string;
    tokenAddress?: string;
  }[];
  extra?: string;
};

export type GenerateSubscriptionTransactionResult = {
  dataList: {
    from: string;
    to: string;
    value: string;
    serializedData: string;
    originalData: string;
    callDataType: string;
    signatureData: string;
  }[];
};

export type GenerateRedemptionTransactionParams = {
  address: string;
  investmentId: string;
  userInputList: {
    chainId?: string;
    coinAmount: string;
    tokenAddress?: string;
  }[];
  expectOutputList: {
    chainId?: string;
    coinAmount: string;
    tokenAddress?: string;
  }[];
  extra?: string;
};

export type GenerateRedemptionTransactionResult = {
  dataList: {
    from: string;
    to: string;
    value: string;
    serializedData: string;
    originalData: string;
    callDataType: string;
    signatureData: string;
  }[];
};

export type GenerateClaimingBonusTransactionParams = {
  address: string;
  investmentId: string;
  userInputList: {
    chainId?: string;
    coinAmount: string;
    tokenAddress?: string;
  }[];
  expectOutputList: {
    chainId?: string;
    coinAmount: string;
    tokenAddress?: string;
  }[];
  extra?: string;
};

export type GenerateClaimingBonusTransactionResult = {
  dataList: {
    from: string;
    to: string;
    value: string;
    serializedData: string;
    originalData: string;
    callDataType: string;
    signatureData: string;
  }[];
};

export class OkxDefiAPI extends OkxAPIBase {
  public async getProductDetail(params: QueryProductDetailParams): Promise<QueryProductDetailResult> {
    return await super.request('GET', `/api/v5/defi/explore/product/detail`, { params })
  }

  public async generateAuthorizationTransaction(params: GenerateAuthorizationTransactionParams): Promise<GenerateAuthorizationTransactionResult> {
    return await super.request('POST', `/api/v5/defi/transaction/authorization`, { json: params });
  }

  public async generateSubscriptionTransaction(params: GenerateSubscriptionTransactionParams): Promise<GenerateSubscriptionTransactionResult> {
    return await super.request('POST', `/api/v5/defi/transaction/subscription`, { json: params });
  }

  public async generateRedemptionTransaction(params: GenerateRedemptionTransactionParams): Promise<GenerateRedemptionTransactionResult> {
    return await super.request('POST', `/api/v5/defi/transaction/redemption`, { json: params });
  }

  public async generateClamingBonusTransaction(params: GenerateClaimingBonusTransactionParams): Promise<GenerateClaimingBonusTransactionResult> {
    return await super.request('POST', `/api/v5/defi/transaction/bonus`, { json: params });
  }
}
