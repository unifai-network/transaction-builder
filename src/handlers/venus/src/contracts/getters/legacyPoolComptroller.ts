/* Automatically generated file, do not update manually */
import type { Provider } from '@ethersproject/abstract-provider';
import { Contract, Signer } from 'ethers';

import abi from '../generated/abis/LegacyPoolComptroller.json';
import { LegacyPoolComptroller } from '../generated/infos/contractTypes';
import { getUniqueContractAddress } from '../utilities/uniqueContractAddressHelper';
import { ChainId } from '../../types';

interface GetLegacyPoolComptrollerContractAddressInput {
  chainId: ChainId;
}

export const getLegacyPoolComptrollerContractAddress = ({
  chainId,
}: GetLegacyPoolComptrollerContractAddressInput) =>
  getUniqueContractAddress({ name: 'LegacyPoolComptroller', chainId });


interface GetLegacyPoolComptrollerContractInput {
  chainId: ChainId;
  signerOrProvider: Signer | Provider;
}

export const getLegacyPoolComptrollerContract = ({
  chainId,
  signerOrProvider,
}: GetLegacyPoolComptrollerContractInput) => {
  const address = getLegacyPoolComptrollerContractAddress({ chainId });
  return address
    ? (new Contract(address, abi, signerOrProvider) as LegacyPoolComptroller)
    : undefined;
};

