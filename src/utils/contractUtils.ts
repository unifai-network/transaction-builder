import { ethers } from "ethers";
import { getEvmProvider } from "./evm";
import { ERC20Abi__factory } from "@/contracts/types";

/**
 * Returns an ethers contract instance for an ERC20 token
 * @param chainId - The chain ID of the token
 * @param address - The address of the token
 * @returns An ethers contract instance for the ERC20 token
 */
function getERC20Contract(chainId: string, address: string) {
  const provider = getEvmProvider(chainId);
  const erc20Token = ERC20Abi__factory.connect(address, provider);
  return erc20Token;
}

export { getERC20Contract };