// solana
import { getMint } from "@solana/spl-token";
import { PublicKey } from '@solana/web3.js';
import { connection } from '../../utils/solana';
import { BN } from 'bn.js';
import { validateSolanaAddress } from '../../utils/solana';

// sui
import { z } from 'zod';
import { Transaction } from '@mysten/sui/transactions';
import { AggregatorClient, Env } from '@cetusprotocol/aggregator-sdk';
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { suiClient, validateSuiAddress, validateSuiCoinType } from '../../utils/sui';

// evm
import { ethers } from 'ethers';
import { EVM_CHAIN_IDS, validateEvmAddress, validateEvmChain, getEvmProvider, getTokenDecimals, parseUnits } from '../../utils/evm';

export async function handleTokenAmount(chain: string, amount: number, tokenAddress: string): Promise<bigint> {
  switch (chain.toLowerCase()) {
    case 'solana':
      validateSolanaAddress(tokenAddress);
      const inputMint = await getMint(connection, new PublicKey(tokenAddress));
      return BigInt(Math.floor(amount * (10 ** inputMint.decimals)));

    case Object.keys(EVM_CHAIN_IDS).find(key => key.toLowerCase() === chain.toLowerCase()):
      validateEvmAddress(tokenAddress);
      const decimals = await getTokenDecimals(chain, tokenAddress);
      return parseUnits(amount.toString(), decimals);
      
    case 'sui':
        validateSuiAddress(tokenAddress);
        const fromCoinMetadata = await suiClient.getCoinMetadata({
          coinType: tokenAddress,
        }); 
        if (!fromCoinMetadata) {
          throw new Error(`Coin metadata not found for ${tokenAddress}`);
        } 
        const suiAmount = new BN(amount).mul(new BN(10).pow(new BN(fromCoinMetadata.decimals)));
        return BigInt(suiAmount.toString());
      
    default:
      throw new Error(`Unsupported chain: ${chain}`);
  }
} 