import { any } from "zod";
import { OkxDefiAPI } from "./api";
export const api = new OkxDefiAPI('13b29a05-9c28-4f25-916a-0ec4f9288ef2', '16D54B707F7360528DB4DCF98758A06C', 'Jhunifai18!');
import Web3 from 'web3';
import { ethers } from 'ethers';
export const OKXBridge = async (params: any, senderAddress: string) => {
  let userWalletAddress = senderAddress
  let toChain = 'Solana'
  // 连接到以太坊节点
  const web3 = new Web3('https://mainnet.infura.io/v3/c31486db34414fd0bcc3f0f907233fc7');
  // 发起用户地址
  const ownerAddress = '0xb791047C8300a8065A474fd8773Bd20f9054eaE7';
  // 目标接收地址
  const receiveAddress = 'E1jA5rhhJupk9dceS8i9j8TP8qNScb1XjAZ6KvQrEBv1';
  const fromTokenAmount = `7000000`
  const slippage = `0.002`;//滑点限制 最小值：0.002，最大值：0.5。
  //源链 USDC 合约地址和 ABI
  const tokenAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  let fromTokenAddress = tokenAddress
  const tokenABI = [
    {
      "constant": true,
      "inputs": [
        { "name": "_owner", "type": "address" },
        { "name": "_spender", "type": "address" }
      ],
      "name": "allowance",
      "outputs": [{ "name": "", "type": "uint256" }],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    }
  ];
  // DEX 授权地址
  const spenderAddress = '0x40aa958dd87fc8305b97f2ba922cddca374bcd7f';
  // 创建代币合约实例
  const tokenContract = new web3.eth.Contract(tokenABI, tokenAddress);
  // 获取已授权额度
  let allowanceAmount = await tokenContract.methods.allowance(ownerAddress, spenderAddress).call();

  //2 获取授权数量
  // allowanceAmount授权额度 < fromTokenAmount交易金额  对该币种进行授权。请查看步骤 3  我们需要对该币种进行授权。
  // 如果 allowanceAmount >= fromTokenAmount，你可以选择使用步骤 3 增加授权数量，或者直接进行步骤 4。

  // fromChainname 得到 Id
  // let fromChainId = api.supportedChain({chainId:''})
  // console.log(fromChainId);//得到chain id
  let fromChainId = '1'
  const getApproveTransactionParams = {
    chainId: fromChainId,
    tokenContractAddress: fromTokenAddress,
    approveAmount: fromTokenAmount,
    userWalletAddress,
  };
  // 不足需要先授权
  // if (parseFloat(allowanceAmount) < parseFloat(fromTokenAmount)) {
  // // 3 发起授权 在执行兑换交易前用户需要授权欧易 DEX router 对其钱包进行资产操作，此接口提供发起授权交易前所需要的交易信息
  let approveTransaction = await api.approveTransaction(getApproveTransactionParams)
  // 4.通过 fromChainId 选择目标链                             通过 fromChainId 拿到可以交易的 toChainId 列表，并选择其中一条链作为目标链
  const supportedChainList = await api.getSupportedChain({});
  const selectChainItem = supportedChainList.find((item: any) => {
    return item.chainName === toChain;
  });
  let toChainId = selectChainItem?.chainId;//sol
  console.log(toChain, toChainId);

  //5. 通过 toChainId 拿到该链的币种列表，并且选择其中一个代币作为目标链币种
  const toChainTokenList = await api.getToChainTokenList({
    chainId: toChainId,
  });
  const selectToChainToken = toChainTokenList.find((item: any) => {
    return item.tokenSymbol === 'USDC';
  });
  // 目标链币种合约地址
  const toTokenAddress = selectToChainToken?.tokenContractAddress;
  console.log('toTokenAddress', toTokenAddress);

  const quoteParams = {
    fromChainId,
    toChainId,
    fromTokenAddress,
    toTokenAddress,
    amount: fromTokenAmount,
    slippage
  };
  console.log('开始获取跨链桥 ID', quoteParams);
  // 6. 请求询价接口，拿到询价数据，主要目的是为了获取跨链桥 ID
  const quoteData = await api.getCrossChainBaseUrl(quoteParams);
  console.log('quoteData', quoteData);
  // 6.3 获取询价信息，并选择一条路径作为交易路径#
  const bridgeId = quoteData[0]?.routerList[0]?.router?.bridgeId;
  console.log('获取跨链桥 ID', bridgeId);
  // 7. 请求跨链兑换接口，发起交易#
  // 7.1 定义跨链兑换参数# 
  // 获取跨链兑换的 tx 信息。
  const swapParams = {
    fromChainId: fromChainId,//源链 ID (如1: Ethereum，更多可查看链 ID 列表)
    toChainId: toChainId,//目标链 ID (如1: Ethereum，更多可查看链 ID 列表)
    fromTokenAddress,//询价币种合约地址 (如0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE)
    toTokenAddress,//目标币种合约地址 (如TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8)
    amount: fromTokenAmount,//币种询价数量 币种询价数量 (数量需包含精度，如授权 1.00 USDT 需输入 1000000，授权 1.00 DAI 需输入 1000000000000000000),币种精度可透过币种列表取得
    slippage,//滑点限制
    receiveAddress,//用于自定义设置目标币种的接收地址，如果未设置则返回用户发送交易的钱包地址。TRON, SUI 以及其他非 EVM 链，需要设置自定义接收地址。
    // sort:'1', //跨链路径选择
    userWalletAddress,
    bridgeId,
  };
  console.log("swapParams",swapParams);
  const swapData = await api.getSwapData(swapParams);
  const swapDataTxInfo = swapData[0].tx;
  console.log('swapDataTxInfo', swapDataTxInfo);
  const transaction = {
    chainId: Number(fromChainId),
    to: swapDataTxInfo.to,
    data: swapDataTxInfo.data,
    value: swapDataTxInfo.value?.toString(),
    maxFeePerGas: swapDataTxInfo.gasPrice?.toString(),
    maxPriorityFeePerGas: swapDataTxInfo.maxPriorityFeePerGas?.toString(),
  };
  const serializedTx = ethers.Transaction.from(transaction).unsignedSerialized;
  console.log("未签名交易 Hex:", serializedTx);
  return {
    transactions: [{
      hex: serializedTx
    }]
  };
};