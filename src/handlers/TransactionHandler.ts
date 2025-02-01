export interface TransactionHandler {
  create(payload: any): Promise<{ chain: string, data: any }>;
  build(data: any, publicKey: string): Promise<{ base64: string }>;
}
