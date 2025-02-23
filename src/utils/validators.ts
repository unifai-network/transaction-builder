import { validateSolanaAddress } from './solana';
import { validateEvmAddress } from './evm';
import { validateSuiAddress } from './sui';

export function validateAddress(chain: string, address: string) {
    if (chain === 'solana') {
        validateSolanaAddress(address);
    } else if (chain === 'evm') {
        validateEvmAddress(address);
    } else if (chain === 'sui') {
        validateSuiAddress(address);
    } else {
        throw new Error(`Unsupported chain: ${chain}`);
    }
} 