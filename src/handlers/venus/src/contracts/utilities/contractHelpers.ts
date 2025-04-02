import { Signer } from 'ethers';
import type { Provider } from '@ethersproject/abstract-provider';
import { getVBep20Contract } from '../getters/vBep20';
import { getVBnbContract } from '../getters/vBnb';
import { getLegacyPoolComptrollerContract } from '../getters/legacyPoolComptroller';
import { ChainId } from '../../types';

import { VToken } from '../../types';

export interface GetVTokenContractInput {
    vToken: VToken;
    signerOrProvider: Signer | Provider;
}

export const getVTokenContract = ({ vToken, signerOrProvider }: GetVTokenContractInput) => {
    const input = {
      address: vToken.address,
      signerOrProvider,
    };
  
    if (vToken.symbol === 'vBNB') {
      return getVBnbContract(input);
    }
  
    return getVBep20Contract(input);
  };

/**
 * 获取 LegacyPoolComptroller 合约实例
 */

export interface GetComptrollerContractInput {
    chainId: ChainId;
    signerOrProvider: Signer | Provider;
}
export const getPoolComptrollerContract = ({ chainId, signerOrProvider }: GetComptrollerContractInput) => {
  return getLegacyPoolComptrollerContract({
    chainId: chainId,
    signerOrProvider,
  });
};