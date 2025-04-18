

export const pendleGasToken = "0x0000000000000000000000000000000000000000";


export function isPendleGasToken(tokenAddress: string) {
  return tokenAddress.toLowerCase() === pendleGasToken.toLowerCase();
}
