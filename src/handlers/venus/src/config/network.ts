import { ethers } from 'ethers';

export const getProvider = (rpcUrl: string): ethers.providers.JsonRpcProvider => {
  return new ethers.providers.JsonRpcProvider(rpcUrl);
};

export const getSigner = (
  provider: ethers.providers.Provider,
  privateKey: string
): ethers.Wallet => {
  return new ethers.Wallet(privateKey, provider);
};
