import { TransactionHandler } from "./TransactionHandler";
import * as jupiter from "./jupiter";
import * as pumpfun from "./pumpfun";

export const handlerRegistry = new Map<string, TransactionHandler>();

handlerRegistry.set("jupiter/swap", new jupiter.SwapHandler());
handlerRegistry.set("pumpfun/launch", new pumpfun.PumpFunLaunchHandler());
