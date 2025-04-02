/* Automatically generated file, do not update manually */
import type { Provider } from '@ethersproject/abstract-provider';
import { Contract, Signer } from 'ethers';

import abi from '../generated/abis/VBnb.json';
import { VBnb } from '../generated/infos/contractTypes';

interface GetVBnbContractInput {
  address: string;
  signerOrProvider: Signer | Provider;
}

export const getVBnbContract = ({ signerOrProvider, address }: GetVBnbContractInput) =>
  new Contract(address, abi, signerOrProvider) as VBnb;


