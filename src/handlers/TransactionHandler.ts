export interface TransactionHandler {
  create(payload: any): Promise<{ data?: any, error?: string }>;
  build(data: any, publicKey: string): Promise<{ chain: string, base64: string }>;
}
