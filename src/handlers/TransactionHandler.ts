export interface TransactionHandler {
  create(payload: any): Promise<{ chain: string, data: any }>;
  build(data: any, address: string): Promise<{ base64?: string, hex?: string }>; // base64 for solana, hex for evm
}
