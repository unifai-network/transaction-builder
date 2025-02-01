export interface TransactionHandler {
  create(payload: any): Promise<{ chain: string, data: any }>;
  build(data: any, address: string): Promise<{ base64?: string, json?: string }>; // base64 for solana, json for evm
}
