import { TransactionHandler } from "./TransactionHandler";
import * as evm from "./evm";
import * as oneinch from "./1inch";
import * as jupiter from "./jupiter";
import * as pumpfun from "./pumpfun";

export const handlerRegistry = new Map<string, TransactionHandler>();

handlerRegistry.set("evm/transfer", new evm.TransferHandler());
handlerRegistry.set("1inch/swap", new oneinch.SwapHandler());
handlerRegistry.set("jupiter/swap", new jupiter.SwapHandler());
handlerRegistry.set("pumpfun/launch", new pumpfun.PumpFunLaunchHandler());
