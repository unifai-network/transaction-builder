export interface CreateTransactionResponse {
  chain: string;
  data: any;
  [key: string]: any; // additional data will be returned to the client as-is
}

export interface BuildTransactionResponse {
  transactions: {
    base64?: string;
    hex?: string;
    [key: string]: any; // additional data will be returned to the client as-is
  }[];
  [key: string]: any; // additional data will be returned to the client as-is
}

export interface TransactionHandler {
  create(payload: any): Promise<CreateTransactionResponse>;
  build(data: any, address: string): Promise<BuildTransactionResponse>;
}
