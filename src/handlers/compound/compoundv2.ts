import { ethers } from "ethers";
import { z } from "zod";
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { validateEvmAddress, validateEvmChain, EVM_CHAIN_IDS, getEvmProvider, getTokenDecimals } from "../../utils/evm";

const PayloadSchema = z.object({
  chain: z.string().nonempty("Missing required field: chain"), 
  asset: z.string().optional(), 
  action: z.enum(['supply', 'borrow', 'repayBorrow', 'redeem'], {
    errorMap: () => ({ message: "Action must be one of: supply, borrow, repayBorrow, redeem" })
  }),
  amount: z.union([
    z.string().nonempty("Missing required field: amount"),
    z.number().positive("Amount must be positive"), 
  ]),
});

const NativeAssetCTokenAddresses: { [chainId: number]: string } = {
  1: "0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5", // cEther
};

const ComptrollerAddresses: { [chainId: number]: string } = {
  1: "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B", // Ether
};

type Payload = z.infer<typeof PayloadSchema>;

export class CompoundV2Handler implements TransactionHandler {
  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);
    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", "));
    }

    payload = validation.data;

    payload.chain = payload.chain.toLowerCase();
    payload.asset = payload.asset?.toLowerCase();

    validateEvmChain(payload.chain);

    if(payload.asset) {
      validateEvmAddress(payload.asset);
    }

    if (isNaN(Number(payload.amount))) {
      throw new Error("Amount must be a valid number");
    }

    return {
      chain: payload.chain,
      data: payload,
    };
  }

  async build(data: Payload, address: string): Promise<BuildTransactionResponse> {
    validateEvmAddress(address);

    const chainId = EVM_CHAIN_IDS[data.chain];
    const transactions: Array<{ hex: string }> = [];

    const cTokenAddress = await this.getCTokenAddress(data.asset, data.chain, chainId);

    if (!cTokenAddress) {
      throw new Error("cToken not found for the given asset");
    }

    const provider = getEvmProvider(data.chain);
    const feeData = await provider.getFeeData();

    const decimals = await getTokenDecimals(data.chain, data.asset ? data.asset : '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    const amountInWei = ethers.parseUnits(data.amount.toString(), decimals);
    if (data.action === "supply") {
      if(data.asset) {
        const allowance = await this.checkAllowance(data.asset, address, cTokenAddress, provider);
   
        if(allowance < amountInWei) {
          const erc20Interface = new ethers.Interface([
           'function approve(address spender, uint256 amount)'
          ]);
   
          const callData = erc20Interface.encodeFunctionData('approve', [
            cTokenAddress,
            amountInWei
          ]);
   
          const approveTransaction = {
            chainId,
            to: data.asset,
            data: callData,
            maxFeePerGas: feeData.maxFeePerGas?.toString(),
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
          };
   
          transactions.push({ hex: ethers.Transaction.from(approveTransaction).unsignedSerialized });
         }
      } else {
        const transferTransaction = {
          chainId,
          to: cTokenAddress,
          value: amountInWei.toString(),
          maxFeePerGas: feeData.maxFeePerGas?.toString(),
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
        };
        transactions.push({ hex: ethers.Transaction.from(transferTransaction).unsignedSerialized });
      }

    }

    const actioncCallData = await this.actionTxCallDataBuild(data.action, amountInWei, data.asset?true:false);

    const actionTransaction = {
      chainId,
      to: cTokenAddress,
      data: actioncCallData,
      maxFeePerGas: feeData.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
    };
  
    transactions.push({ hex: ethers.Transaction.from(actionTransaction).unsignedSerialized });

    return {transactions};
  }

  private async actionTxCallDataBuild(action: string, amount: bigint, isErc20: boolean) : Promise<string>{
    let abi;
    let functionName = "";
    if(action === "supply") {
      abi = isErc20
            ? "function mint(uint256 mintAmount) returns (uint)" 
            : "function mint() payable"; 
      functionName = "mint";      
    } else if (action === 'redeem') {
      abi = 'function redeem(uint redeemTokens) returns (uint)'
      functionName = "redeem";
    } else if (action === 'borrow') {
      abi = 'function borrow(uint borrowAmount) returns (uint)'
      functionName = "borrow";
    } else if (action === 'repayBorrow') {
      abi = 'function repayBorrow(uint repayAmount) returns (uint)'
      functionName = "repayBorrow";
    } else {
      throw new Error(`Unsupported action: ${action}`);
    }

    const actionInterface = new ethers.Interface([abi]);

    const callData = actionInterface.encodeFunctionData(
      functionName, 
      functionName === "mint" && !isErc20 ? [] : [amount] 
    );

    return callData;
  }

  private async getCTokenAddress(assetAddress: string|undefined, chain: string, chainId:number): Promise<string | null> {
    if (!assetAddress || assetAddress === "") {
      return NativeAssetCTokenAddresses[chainId] || null;
    }
  
    const COMPTROLLER_ADDRESS = ComptrollerAddresses[chainId];

    const comptrollerAbi = [
      "function getAllMarkets() external view returns (address[])",
    ];
  
    const cTokenAbi = [
      "function underlying() external view returns (address)",
    ];
  
    const provider = getEvmProvider(chain);
  
    const comptrollerContract = new ethers.Contract(COMPTROLLER_ADDRESS, comptrollerAbi, provider);
  
    const markets: string[] = await comptrollerContract.getAllMarkets();
  
    for (const cTokenAddress of markets) {
      try {
        const cTokenContract = new ethers.Contract(cTokenAddress, cTokenAbi, provider);
        const underlyingAddress = await cTokenContract.underlying();
        if (underlyingAddress.toLowerCase() === assetAddress.toLowerCase()) {
          return cTokenAddress;
        }
      } catch (err) {
        continue;
      }
    }
  
    return null;
  }

  private async checkAllowance(
    assetAddress: string, 
    userAddress: string, 
    spenderAddress: string, 
    provider: ethers.JsonRpcProvider)
    : Promise<bigint> 
    {
    const erc20Contract = new ethers.Contract(assetAddress, ["function allowance(address owner, address spender) view returns (uint256)"], provider);
    const allowance = await erc20Contract.allowance(userAddress, spenderAddress);
    return BigInt(allowance);
  }
}
