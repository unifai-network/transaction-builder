import { z } from 'zod';
import { ethers } from 'ethers';
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { EVM_CHAIN_IDS, validateEvmAddress, validateEvmChain, getEvmProvider, getTokenDecimals } from '../../utils/evm';

const PayloadSchema = z.object({
  chain: z.string().nonempty("Missing required field: chain"),
  recipient: z.string().nonempty("Missing required field: recipient"),
  amount: z.union([
    z.string().nonempty("Missing required field: amount"),
    z.number().positive("Amount must be positive")
  ]),
  token: z.string().optional(),
});

type Payload = z.infer<typeof PayloadSchema>;

export class TransferHandler implements TransactionHandler {
  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    payload = validation.data;

    payload.chain = payload.chain.toLowerCase();
    payload.recipient = payload.recipient.toLowerCase();

    validateEvmChain(payload.chain);
    validateEvmAddress(payload.recipient);

    if (payload.token) {
      validateEvmAddress(payload.token);
    }

    if (isNaN(Number(payload.amount))) {
      throw new Error('Amount must be a valid number');
    }

    return {
      chain: payload.chain,
      data: payload,
    };
  }

  async build(data: Payload, address: string): Promise<BuildTransactionResponse> {
    validateEvmAddress(address);

    const provider = getEvmProvider(data.chain);
    
    const feeData = await provider.getFeeData();
    
    let transaction: any;

    const chainId = EVM_CHAIN_IDS[data.chain];

    if (data.token) {
      const decimals = await getTokenDecimals(data.chain, data.token);
      const amountInWei = ethers.parseUnits(data.amount.toString(), decimals);

      const erc20Interface = new ethers.Interface([
        'function transfer(address to, uint256 amount)'
      ]);

      const callData = erc20Interface.encodeFunctionData('transfer', [
        data.recipient,
        amountInWei
      ]);

      transaction = {
        chainId,
        to: data.token,
        data: callData,
        maxFeePerGas: feeData.maxFeePerGas?.toString(),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
      };
    } else {
      const amountInWei = ethers.parseEther(data.amount.toString());
      transaction = {
        chainId,
        to: data.recipient,
        value: amountInWei.toString(),
        maxFeePerGas: feeData.maxFeePerGas?.toString(),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
      };
    }

    const serializedTx = ethers.Transaction.from(transaction).unsignedSerialized;

    return {
      transactions: [{
        hex: serializedTx,
      }],
    };
  }
}
