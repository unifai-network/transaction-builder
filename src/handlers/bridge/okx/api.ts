import { API } from "unifai-sdk";
import * as querystring from 'querystring';
import * as crypto from 'crypto';
// const { Web3 } = require('web3');
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
        'OK-ACCESS-PROJECT': '66dbabf45a596aaa733f749570972c8d', 
        'OK-ACCESS-KEY': this.okxApiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': this.okxPassphrase,
        ...options.headers
      },
      ...options
    });
 
    
    if (response.code == 0) {
      return response.data;
    } else {
      console.log(`err ${JSON.stringify(response)}`);
    }
  }
}


export enum Chain {
  BTC = 0,
  Ethereum = 1,
  Optimism = 10,
  BNB = 56,
  Polygon = 137,
  TRON = 195,
  Solana = 501,
  SUI = 784,
  Base = 8453,
  Avalanche_C = 43114,
}


export class OkxDefiAPI extends OkxAPIBase {
  // 获取支持的链
  public async getSupportedChain(params: any): Promise<any> {
    return await super.request('GET', `/api/v5/dex/cross-chain/supported/chain`, { params })
  }
  // 获取币种列表#
  public async getToChainTokenList(params: any): Promise<any> {
    return await super.request('GET', `/api/v5/dex/aggregator/all-tokens`, { params })
  }
  // 获取路径信息
  public async getCrossChainBaseUrl(params: any): Promise<any> {
    return await super.request('GET', `/api/v5/dex/cross-chain/quote`, { params })
  }

  // 跨链兑换 获取跨链兑换所需的交易数据。
  public async getSwapData(params: any): Promise<any> {
    return await super.request('GET', `/api/v5/dex/cross-chain/build-tx`, { params })
  }

  // 交易授权
  public async approveTransaction(params: any): Promise<any> {
    return await super.request('GET', `/api/v5/dex/aggregator/approve-transaction`, { params })
  }
  








  // public async generateAuthorizationTransaction(params: any): Promise<any> {
  //   return await super.request('POST', `/api/v5/defi/transaction/authorization`, { json: params });
  // }

}
