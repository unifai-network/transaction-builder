import { ChainId } from '../types';
import venusProtocolBscMainnetDeployments from '@venusprotocol/venus-protocol/deployments/bscmainnet_addresses.json';
import { Addresses } from './types';

// Export contract getter functions and hooks
export * from './getters';
export * from './utilities/contractHelpers';
export * from './utilities/uniqueContractAddressHelper';

// Export types
export * from './generated/infos/contractTypes';
export * from './generated/infos/types';
export * from './types';

// Export contract interfaces
export type { VBep20Interface } from './generated/infos/contractTypes/VBep20';
export type { LegacyPoolComptrollerInterface } from './generated/infos/contractTypes/LegacyPoolComptroller';

// Export addresses
export const addresses: Addresses = {
  tokens: {
    [ChainId.BSC_MAINNET]: {
      BNB: venusProtocolBscMainnetDeployments.addresses.WBNB,
      USDT: venusProtocolBscMainnetDeployments.addresses.USDT,
      USDC: venusProtocolBscMainnetDeployments.addresses.USDC,
      BUSD: venusProtocolBscMainnetDeployments.addresses.BUSD,
      BTC: venusProtocolBscMainnetDeployments.addresses.BTCB,
      ETH: venusProtocolBscMainnetDeployments.addresses.ETH,
      XVS: venusProtocolBscMainnetDeployments.addresses.XVS,
      DAI: venusProtocolBscMainnetDeployments.addresses.DAI,
      LINK: venusProtocolBscMainnetDeployments.addresses.LINK,
      MATIC: venusProtocolBscMainnetDeployments.addresses.MATIC,
      DOT: venusProtocolBscMainnetDeployments.addresses.DOT,
      LTC: venusProtocolBscMainnetDeployments.addresses.LTC,
      XRP: venusProtocolBscMainnetDeployments.addresses.XRP,
      CAKE: venusProtocolBscMainnetDeployments.addresses.CAKE,
      BCH: venusProtocolBscMainnetDeployments.addresses.BCH,
      ADA: venusProtocolBscMainnetDeployments.addresses.ADA,
      DOGE: venusProtocolBscMainnetDeployments.addresses.DOGE,
      FIL: venusProtocolBscMainnetDeployments.addresses.FIL,
      SXP: venusProtocolBscMainnetDeployments.addresses.SXP,
      TRX: venusProtocolBscMainnetDeployments.addresses.TRX,
      TUSD: venusProtocolBscMainnetDeployments.addresses.TUSD,
      LUNA: venusProtocolBscMainnetDeployments.addresses.LUNA,
      UST: venusProtocolBscMainnetDeployments.addresses.UST,
      WBETH: venusProtocolBscMainnetDeployments.addresses.WBETH,
      FDUSD: venusProtocolBscMainnetDeployments.addresses.vFDUSD,
    },
  },
  VBep20: {
    [ChainId.BSC_MAINNET]: {
      vBNB: venusProtocolBscMainnetDeployments.addresses.vBNB,
      vUSDT: venusProtocolBscMainnetDeployments.addresses.vUSDT,
      vUSDC: venusProtocolBscMainnetDeployments.addresses.vUSDC,
      vBUSD: venusProtocolBscMainnetDeployments.addresses.vBUSD,
      vBTC: venusProtocolBscMainnetDeployments.addresses.vBTC,
      vETH: venusProtocolBscMainnetDeployments.addresses.vETH,
      vXVS: venusProtocolBscMainnetDeployments.addresses.vXVS,
      vDAI: venusProtocolBscMainnetDeployments.addresses.vDAI,
      vLINK: venusProtocolBscMainnetDeployments.addresses.vLINK,
      vMATIC: venusProtocolBscMainnetDeployments.addresses.vMATIC,
      vDOT: venusProtocolBscMainnetDeployments.addresses.vDOT,
      vLTC: venusProtocolBscMainnetDeployments.addresses.vLTC,
      vXRP: venusProtocolBscMainnetDeployments.addresses.vXRP,
      vCAKE: venusProtocolBscMainnetDeployments.addresses.vCAKE,
      vBCH: venusProtocolBscMainnetDeployments.addresses.vBCH,
      vADA: venusProtocolBscMainnetDeployments.addresses.vADA,
      vDOGE: venusProtocolBscMainnetDeployments.addresses.vDOGE,
      vFIL: venusProtocolBscMainnetDeployments.addresses.vFIL,
      vSXP: venusProtocolBscMainnetDeployments.addresses.vSXP,
      vTRX: venusProtocolBscMainnetDeployments.addresses.vTRX,
      vTUSD: venusProtocolBscMainnetDeployments.addresses.vTUSD,
      vLUNA: venusProtocolBscMainnetDeployments.addresses.vLUNA,
      vUST: venusProtocolBscMainnetDeployments.addresses.vUST,
      vWBETH: venusProtocolBscMainnetDeployments.addresses.vWBETH,
      vFDUSD: venusProtocolBscMainnetDeployments.addresses.vFDUSD,
    },
  },
  VBnb: {
    [ChainId.BSC_MAINNET]: venusProtocolBscMainnetDeployments.addresses.vBNB,
  },
  legacyPoolComptroller: {
    [ChainId.BSC_MAINNET]: venusProtocolBscMainnetDeployments.addresses.Unitroller,
  },
};
