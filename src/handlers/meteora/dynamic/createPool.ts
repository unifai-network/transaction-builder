import { z } from "zod";
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../../TransactionHandler";
import { AmmImpl, PROGRAM_ID } from "@mercurial-finance/dynamic-amm-sdk";
import { connection } from "../../../utils/solana";
import { BN } from "bn.js";
import { PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { prepareTransactions, toRawAmount } from "../utils";
import { deriveCustomizablePermissionlessConstantProductPoolAddress } from "@mercurial-finance/dynamic-amm-sdk/dist/cjs/src/amm/utils";

const PayloadSchema = z.object({
  baseMint: z.string().nonempty(),
  quoteMint: z.string().nonempty(),
  baseAmount: z.number(),
  quoteAmount: z.number(),
  feeBps: z.number(),
  activationPoint: z.number().optional(),
});

type Payload = z.infer<typeof PayloadSchema>;

const CONFIGS: Record<number, { now: String, custom: String }> = {
  "25": {
    "now": "AdopETzHcuDbXR2YqtX8UFGesRJ53wumDyfvrbSrvGcV",
    "custom": "4Q1wpjoQqm9wiwUBinWD1QJjBAqBWXv9PRctRGV6SyMi"
  },
  "30": {
    "now": "DzE3A8Yjuqk61Z4gQ71f2Jx8MgcX7RpxwWzYU3mKCvyh",
    "custom": "7kXYNBXZ4wQH87Da4NLqneoEq4oCopLgSqGQZCy1s28w"
  },
  "100": {
    "now": "87umT3FP4ezojp6p1e5ALXGSJWmn3h7pusmuk6t3o3Jg",
    "custom": "BXBjS1um9TA5s2eYt7bsPmJsxpEEMjmudAUgkPnz5D2n"
  },
  "200": {
    "now": "85t6rsA3Dm8kTW1rSVjVPNJs4DQtZv7uCMjpaRTH9hQA",
    "custom": "5hB9XMUWdMwA3sDhW7msjPiu3UeFbHyEAurmJC2XrQ93"
  },
  "400": {
    "now": "ABfKwZb2jtM64MmATmuevT9xXV6AqshfGLumAjH2gikG",
    "custom": "3LyWzCpB29o4Gi5to4AE8jQEXqnm1av3QhKo5gbSHJWm"
  },
  "600": {
    "now": "3nwnr3PqGpU7XNaqbyHm7HfrEESkFZaoYu2if8z3kvGr",
    "custom": "2kw9BzuMa3S7ETeDUwQ4ihCi8z5EA1Y55kTQLK42UUs1"
  }
};

export class MeteoraDynamicCreatePoolHandler implements TransactionHandler {
  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    payload = validation.data;

    await createTransactions(payload, PublicKey.unique());

    return {
      chain: "solana",
      data: payload,
    };
  }

  async build(data: Payload, publicKey: string): Promise<BuildTransactionResponse> {
    const txs = await createTransactions(data, new PublicKey(publicKey));

    await prepareTransactions(txs, new PublicKey(publicKey));

    const poolAddress = deriveCustomizablePermissionlessConstantProductPoolAddress(
      new PublicKey(data.baseMint),
      new PublicKey(data.quoteMint),
      new PublicKey(PROGRAM_ID),
    );

    return {
      transactions: txs.map(tx => ({
        type: "legacy",
        base64: tx.serialize({
          requireAllSignatures: false,
        }).toString('base64'),
      })),
      poolAddress
    };
  }
}

async function createTransactions(data: Payload, publicKey: PublicKey) {
  const baseMint = new PublicKey(data.baseMint);
  const quoteMint = new PublicKey(data.quoteMint);

  const [baseDecimals, quoteDecimals] = await Promise.all([
    getMint(connection, baseMint).then(mint => mint.decimals),
    getMint(connection, quoteMint).then(mint => mint.decimals),
  ]);

  const baseAmount = toRawAmount(
    data.baseAmount,
    baseDecimals,
  );
  const quoteAmount = toRawAmount(
    data.quoteAmount,
    quoteDecimals,
  );

  const configKey = CONFIGS[data.feeBps];

  if (!configKey) {
    throw new Error("Invalid feeBps.");
  }

  return await AmmImpl.createPermissionlessConstantProductPoolWithConfig2(
    connection,
    new PublicKey(publicKey),
    baseMint,
    quoteMint,
    baseAmount,
    quoteAmount,
    data.activationPoint ? new PublicKey(configKey.custom) : new PublicKey(configKey.now),
    {
      cluster: 'mainnet-beta',
      activationPoint: data.activationPoint ? new BN(data.activationPoint) : undefined,
    }
  );
}
