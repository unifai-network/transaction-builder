import { TransactionHandler } from "./TransactionHandler";
import * as jupiter from "./jupiter";

export const handlerRegistry = new Map<string, TransactionHandler>();

handlerRegistry.set("jupiter/swap", new jupiter.SwapHandler());
