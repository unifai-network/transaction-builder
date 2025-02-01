import { z } from 'zod';
import { ethers } from 'ethers';
import { TransactionHandler } from "../TransactionHandler";
import { EVM_CHAIN_IDS, validateEvmAddress, validateEvmChain, getEvmProvider } from '../../utils/evm';

const PayloadSchema = z.object({
  chain: z.string().nonempty("Missing required field: chain"),
  recipient: z.string().nonempty("Missing required field: recipient"),
  amount: z.string().nonempty("Missing required field: amount"),
  token: z.string().optional(),
});

type Payload = z.infer<typeof PayloadSchema>;

export class TransferHandler implements TransactionHandler {
  async create(payload: Payload): Promise<{ chain: string, data: Payload }> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    validateEvmChain(payload.chain);

    validateEvmAddress(payload.recipient);

    if (payload.token && !ethers.isAddress(payload.token)) {
      throw new Error('Invalid token address');
    }

    if (isNaN(Number(payload.amount))) {
      throw new Error('Amount must be a valid number');
    }

    return {
      chain: payload.chain,
      data: payload,
    };
  }

  async build(data: Payload, address: string): Promise<{ json: string }> {
    validateEvmAddress(address);

    const provider = getEvmProvider(data.chain);
    
    const feeData = await provider.getFeeData();
    
    const amountInWei = ethers.parseEther(data.amount);
    
    let transaction: any;

    const chainId = EVM_CHAIN_IDS[data.chain];

    if (data.token) {
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
      transaction = {
        chainId,
        to: data.recipient,
        value: amountInWei.toString(),
        maxFeePerGas: feeData.maxFeePerGas?.toString(),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
      };
    }

    return {
      json: transaction,
    }
  }
}
