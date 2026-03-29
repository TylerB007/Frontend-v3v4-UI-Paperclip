import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_FEE_RECIPIENT: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a valid Ethereum address"),
  NEXT_PUBLIC_SUPPORTED_CHAINS: z
    .string()
    .regex(/^\d+(,\d+)*$/, "Must be comma-separated chain IDs"),
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z
    .string()
    .min(1, "WalletConnect project ID is required"),
});

function parseEnv() {
  const parsed = envSchema.safeParse({
    NEXT_PUBLIC_FEE_RECIPIENT: process.env.NEXT_PUBLIC_FEE_RECIPIENT,
    NEXT_PUBLIC_SUPPORTED_CHAINS: process.env.NEXT_PUBLIC_SUPPORTED_CHAINS,
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    const message = Object.entries(errors)
      .map(([key, msgs]) => `  ${key}: ${(msgs ?? []).join(", ")}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${message}`);
  }

  return parsed.data;
}

export const env = parseEnv();
