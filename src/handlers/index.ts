import { TransactionHandler } from "./TransactionHandler";
import * as evm from "./evm";
import * as oneinch from "./1inch";
import * as jupiter from "./jupiter";
import * as pumpfun from "./pumpfun";
import * as solana from "./solana";
import * as cetus from "./cetus";
import * as compound from "./compound";
import * as wormhole from "./wormhole";
import * as meteora from "./meteora";
import * as okx from './okx';
import * as sonic from './sonic';

export const handlerRegistry = new Map<string, TransactionHandler>();

handlerRegistry.set("evm/transfer", new evm.TransferHandler());
handlerRegistry.set("1inch/swap", new oneinch.SwapHandler());
handlerRegistry.set("jupiter/swap", new jupiter.SwapHandler());
handlerRegistry.set("pumpfun/launch", new pumpfun.PumpFunLaunchHandler());

handlerRegistry.set("solana/transfer", new solana.TransferHandler());
handlerRegistry.set("solana/spl-create", new solana.SplCreateHandler());

handlerRegistry.set("sonic/transfer", new sonic.TransferHandler());
handlerRegistry.set("sonic/spl-create", new sonic.SplCreateHandler());

handlerRegistry.set("cetus/swap", new cetus.SwapHandler());
handlerRegistry.set("compound/v2", new compound.CompoundV2Handler());
handlerRegistry.set("wormhole/bridge", new wormhole.WormholeHandler());

handlerRegistry.set("meteora/dlmm/add-liquidity", new meteora.MeteoraDlmmAddLiquidityHandler());
handlerRegistry.set("meteora/dlmm/create-customizable-pool", new meteora.MeteoraDlmmCreateCustomizablePoolHandler());
handlerRegistry.set("meteora/dlmm/create-pool", new meteora.MeteoraDlmmCreatePoolHandler());
handlerRegistry.set("meteora/dlmm/remove-liquidity", new meteora.MeteoraDlmmRemoveLiquidityHandler());
handlerRegistry.set("meteora/dynamic/add-liquidity", new meteora.MeteoraDynamicAddLiquidityHandler());
handlerRegistry.set("meteora/dynamic/create-customizable-pool", new meteora.MeteoraDynamicCreateCustomizablePoolHandler());
handlerRegistry.set("meteora/dynamic/create-pool", new meteora.MeteoraDynamicCreatePoolHandler());
handlerRegistry.set("meteora/dynamic/lock-liquidity", new meteora.MeteoraDynamicLockLiquidityHandler());
handlerRegistry.set("meteora/dynamic/remove-liquidity", new meteora.MeteoraDynamicRemoveLiquidityHandler());
handlerRegistry.set("okx/defi/subscribe", new okx.OkxDefiSubscribeHandler());
handlerRegistry.set("okx/defi/redeem", new okx.OkxDefiRedeemHandler());
handlerRegistry.set("okx/defi/claim-bonus", new okx.OkxDefiClaimBonusHandler());
