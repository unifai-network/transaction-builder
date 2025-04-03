/* Automatically generated file, do not update manually */
import type { Provider } from '@ethersproject/abstract-provider';
import { Contract, Signer } from 'ethers';

import abi from '../generated/abis/VBep20.json';
import { VBep20 } from '../generated/infos/contractTypes';

interface GetVBep20ContractInput {
  address: string;
  signerOrProvider: Signer | Provider;
}

export const getVBep20Contract = ({ signerOrProvider, address }: GetVBep20ContractInput) =>
  new Contract(address, abi, signerOrProvider) as VBep20;
