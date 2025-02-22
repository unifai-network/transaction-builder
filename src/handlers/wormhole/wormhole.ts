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
    const transactions = [];
    const { transfer } = data;
    const wh = await wormhole("Mainnet", [evm, solana, sui]);
    const fromChain = await wh.getChain(transfer.from.chain);
    const token = isTokenId(transfer.token) ? transfer.token.address : transfer.token;
    const tb = await fromChain.getAutomaticTokenBridge();
    const xfer = tb.transfer(senderAddress, transfer.to, token, transfer.amount, transfer.nativeGas);

    for await (const tx of xfer) {
      console.log('Transaction object:', tx);
      console.log('Transaction type:', typeof tx);
      console.log('Transaction properties:', Object.keys(tx));
      console.log('Transaction stringified:', JSON.stringify(tx, null, 2));
      

      if (transfer.from.chain === 'solana') {
        transactions.push({
          type: "versioned",
          base64: tx.toString()
        });
      } else if (transfer.from.chain === 'evm') {
        transactions.push({
          hex: tx.toString()
        });
      } else if (transfer.from.chain === 'sui') {
        transactions.push({
          base64: tx.toString()
        });
      } else {
        throw new Error('Unsupported chain type');
      }
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


// async function testTransfer() {
//   const handler = new WormholeHandler();
//   const payload = {
//     from: { 
//       chain: 'solana',
//       address: 'E1jA5rhhJupk9dceS8i9j8TP8qNScb1XjAZ6KvQrEBv1'
//     },
//     token: { 
//       chain: 'solana',
//       address: 'So11111111111111111111111111111111111111112'
//     },
//     to: { 
//       chain: 'bnb',
//       address: '0xbddf02772a5f7f75be2db4e9bd180f59f8ebde91'
//     }, 
//     amount: 0.1,
//     nativeGas: 0.000005 
//   };

//   await handler.create(payload);
//   const senderAddress = 'E1jA5rhhJupk9dceS8i9j8TP8qNScb1XjAZ6KvQrEBv1'; 
//   const response = await handler.build(payload, senderAddress);
//   console.log('Build response:', JSON.stringify(response, null, 2));
// }


// testTransfer();

