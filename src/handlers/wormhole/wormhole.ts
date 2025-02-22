import { z } from 'zod';
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { wormhole, amount, signSendWait } from "@wormhole-foundation/sdk";
import algorand from "@wormhole-foundation/sdk/algorand";
import aptos from "@wormhole-foundation/sdk/aptos";
import cosmwasm from "@wormhole-foundation/sdk/cosmwasm";
import evm from "@wormhole-foundation/sdk/evm";
import solana from "@wormhole-foundation/sdk/solana";
import sui from "@wormhole-foundation/sdk/sui";


import {
  isTokenId,
  toNative,
} from "@wormhole-foundation/sdk-definitions";


export class WormholeHandler implements TransactionHandler {
  private transferData: any | null = null;
  async create(payload: any): Promise<CreateTransactionResponse> {
    this.transferData = payload;
    return {
      chain: payload.from.chain,
      data: payload,
    };
  }

  async build(data: any, senderAddress: string): Promise<BuildTransactionResponse> {
    if (!data) {
      throw new Error('No transfer data found. Please call create() first.');
    }
    const { transfer } = data;
    const wh = await wormhole("Mainnet", [evm, solana, sui]);
    const fromChain = await wh.getChain(data.transfer.from.chain);//transfer.from.chain
    const token = isTokenId(transfer.token) ? transfer.token.address : transfer.token; //transfer.token
    const tb = await fromChain.getAutomaticTokenBridge();
    const xfer = tb.transfer(senderAddress, transfer.to, token, transfer.amount, transfer.nativeGas);

    const transactions = [];
    for await (const tx of xfer) {
      console.log(tx);
      transactions.push({
        type: "versioned",
        base64: tx.toString(),
      });
    }

    return {
      transactions,
    };
  }
}

    // const senderAddress = toNative(signer.chain(), signer.address());//signer
    // const tx = await signSendWait(fromChain, xfer, signer);

// const transferDetails: TokenTransferDetails = {
//   token: { chain: "Ethereum", address: "0xTokenAddress" },
//   amount: 1000,
//   from: { chain: "Ethereum", address: "0xFromAddress" },
//   to: { chain: "BinanceSmartChain", address: "0xToAddress" },
//   nativeGas: 0.001,
// };
// const Token = Wormhole.tokenId(transfer.token.chain,transfer.token.address);

