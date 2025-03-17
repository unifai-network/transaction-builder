import { OkxDefiAPI, Chain } from "./api";
export const api = new OkxDefiAPI('13b29a05-9c28-4f25-916a-0ec4f9288ef2', '16D54B707F7360528DB4DCF98758A06C', 'Jhunifai18!');
import { Transaction, VersionedMessage, VersionedTransaction } from "@solana/web3.js";
import { ethers } from "ethers";
import bs58 from 'bs58';


export const OKXBridge = async (params: any, senderAddress: string) => {
  const userWalletAddress = senderAddress
  const fromChain = params.from.chain;
  const receiveAddress = params.to.address; 
  const toChain = params.to.chain; 
  const fromTokenAddress = params.token.address;  //源链 USDC 合约地址  
  const fromTokenAmount = params.amount;
  const slippage = params.slippage;//滑点限制 最小值：0.002，最大值：0.5。
  const sort = params.sort; //跨链路径选择

  // const ownerAddress = params.from.address;// 发起用户地址
  // 连接到以太坊节点
  // const web3 = new Web3('https://mainnet.infura.io/v3/c31486db34414fd0bcc3f0f907233fc7');
  // const tokenABI = [
  //   {
  //     "constant": true,
  //     "inputs": [
  //       { "name": "_owner", "type": "address" },
  //       { "name": "_spender", "type": "address" }
  //     ],
  //     "name": "allowance",
  //     "outputs": [{ "name": "", "type": "uint256" }],
  //     "payable": false,
  //     "stateMutability": "view",
  //     "type": "function"
  //   }
  // ];
  // DEX 授权地址
  // const spenderAddress = '0x40aa958dd87fc8305b97f2ba922cddca374bcd7f';
  // 创建代币合约实例
  // const tokenContract = new web3.eth.Contract(tokenABI, tokenAddress);
  // 获取已授权额度
  // let allowanceAmount = await tokenContract.methods.allowance(ownerAddress, spenderAddress).call();
  const fromChainId = await getChainId(fromChain)
  const getApproveTransactionParams = {
    chainId: fromChainId,
    tokenContractAddress: fromTokenAddress,
    approveAmount: fromTokenAmount,
    userWalletAddress,
  };
  const approveTransaction = await api.approveTransaction(getApproveTransactionParams)  // 先授权(parseFloat(allowanceAmount) < parseFloat(fromTokenAmount)) 发起授权 在执行兑换交易前用户需要授权欧易 DEX router 对其钱包进行资产操作，此接口提供发起授权交易前所需要的交易信息
  console.log(`approveTransaction`, approveTransaction[0].data );
  const toChainId = await getChainId(toChain)
  //5. 通过 toChainId 拿到该链的币种列表，并且选择其中一个代币作为目标链币种
  const toChainTokenList = await api.getToChainTokenList({
    chainId: toChainId,
  });
  const selectToChainToken = toChainTokenList.find((item: any) => {
    return item.tokenSymbol === 'USDC';
  });
  // 目标链币种合约地址
  const toTokenAddress = selectToChainToken?.tokenContractAddress;

  const quoteParams = {
    fromChainId,
    toChainId,
    fromTokenAddress,
    toTokenAddress,
    amount: fromTokenAmount,
    slippage
  };

  // 6. 获取跨链桥 ID
  const quoteData = await api.getCrossChainBaseUrl(quoteParams);

  // 6.3 获取询价信息，并选择一条路径作为交易路径
  const bridgeId = quoteData[0]?.routerList[0]?.router?.bridgeId;

  // 7.获取跨链兑换的 tx 信息。
  const swapParams = {
    fromChainId: fromChainId,//源链 ID (如1: Ethereum，更多可查看链 ID 列表)
    toChainId: toChainId,//目标链 ID (如1: Ethereum，更多可查看链 ID 列表)
    fromTokenAddress,//询价币种合约地址 (如0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE)
    toTokenAddress,//目标币种合约地址 (如TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8)
    amount: fromTokenAmount,//币种询价数量 币种询价数量 (数量需包含精度，如授权 1.00 USDT 需输入 1000000，授权 1.00 DAI 需输入 1000000000000000000),币种精度可透过币种列表取得
    slippage,//滑点限制
    receiveAddress,//用于自定义设置目标币种的接收地址，如果未设置则返回用户发送交易的钱包地址。TRON, SUI 以及其他非 EVM 链，需要设置自定义接收地址。
    sort, //跨链路径选择
    userWalletAddress,
    bridgeId,
  };
  console.log("swapParams", swapParams);
  const swapData = await api.getSwapData(swapParams);
  const TxInfo = swapData[0].tx;
  const dataList: any[] = [];
  dataList.push(TxInfo);

  const transactions = dataList.map(data => formatTransaction(data, Number(fromChainId) as Chain));
  return {
    transactions
  };
};





function formatTransaction(data: {
  from: string;
  to: string;
  value: string;
  serializedData: string;
  originalData: string;
  callDataType: string;
  signatureData: string;
}, chain: Chain) {
  if (chain == Chain.Solana) {
    const serializedData = bs58.decode(data.serializedData);
    const version = VersionedMessage.deserializeMessageVersion(serializedData);
    if (version === 'legacy') {
      const tx = Transaction.from(serializedData);
      tx.signatures = [];
      return {
        type: 'legacy',
        base64: tx.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        }).toString('base64')
      }
    } else {
      const tx = VersionedTransaction.deserialize(serializedData);
      tx.signatures = [];
      return {
        type: 'versioned',
        base64: Buffer.from(tx.serialize()).toString('base64')
      }
    }
  } else if (chain == Chain.SUI) {
    return {
      base64: Buffer.from(bs58.decode(data.serializedData)).toString('base64')
    }
  } else {
    return {
      hex: ethers.Transaction.from({ to: data.to, value: data.value, data: data.serializedData }).unsignedSerialized
    }
  }
}

async function getChainId(Chain: string): Promise<string | undefined> {
  try {
    const supportedChainList = await api.getSupportedChain({});
    const selectChainItem = supportedChainList.find((item: any) => {
      return item.chainName === Chain;
    });
    return selectChainItem?.chainId;
  } catch (error) {
    console.log('getChainId error', error);
    return undefined;
  }
}

let test = {
  from: {
    chain: "Ethereum",
    address: "0xbddf02772a5f7f75be2db4e9bd180f59f8ebde91"
  },
  to: {
    chain: "Solana",
    address: "E1jA5rhhJupk9dceS8i9j8TP8qNScb1XjAZ6KvQrEBv1"
  },
  token: {
    chain: "Ethereum",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  },
  amount: "7000000",
  slippage: "0.002",//滑点限制 最小值：0.002，最大值：0.5。
  sort: 1,//跨链路径选择


}
OKXBridge(test, test.from.address)