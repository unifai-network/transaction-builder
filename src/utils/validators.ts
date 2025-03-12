import { validateSolanaAddress } from './solana';
import { validateEvmAddress } from './evm';
import { validateSuiAddress } from './sui';
import { EVM_CHAIN_IDS } from './evm';
export function validateAddress(chain: string, address: string) {
    if (chain === 'solana') {
        validateSolanaAddress(address);
    } else if (Object.keys(EVM_CHAIN_IDS).find(key => key.toLowerCase() === chain.toLowerCase()) ) {
        validateEvmAddress(address);
    } else if (chain === 'sui') {
        validateSuiAddress(address);
    } else {
        throw new Error(`Unsupported chain: ${chain}`);
    }
} 