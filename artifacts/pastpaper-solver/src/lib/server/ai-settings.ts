import { eq } from "drizzle-orm";
import { appSettingsTable, db } from "@workspace/db";
import { decryptApiKey } from "./crypto";
import type { AiProvider } from "./ai-provider";

export type AiSettings = {
  provider: AiProvider;
  model: string;
  apiKey: string;
};

export async function loadAiSettings(): Promise<AiSettings | null> {
  const [stored] = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, "ai"))
    .limit(1);
  if (stored) {
    return {
      provider: stored.provider as AiProvider,
      model: stored.model,
      apiKey: decryptApiKey(stored.encryptedApiKey),
    };
  }

  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return null;
  const provider = process.env.AI_PROVIDER;
  return {
    provider: provider === "anthropic" || provider === "gemini" ? provider : "openai",
    model: process.env.AI_MODEL || "gpt-4o-mini",
    apiKey,
  };
}

export async function publicAiSettings() {
  const [stored] = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, "ai"))
    .limit(1);
  return {
    provider:
      stored?.provider ??
      (process.env.AI_PROVIDER === "anthropic" || process.env.AI_PROVIDER === "gemini"
        ? process.env.AI_PROVIDER
        : "openai"),
    model: stored?.model ?? process.env.AI_MODEL ?? "gpt-4o-mini",
    isConfigured: Boolean(stored?.encryptedApiKey || process.env.AI_API_KEY),
  };
}
