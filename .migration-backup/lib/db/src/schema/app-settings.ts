import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const appSettingsTable = pgTable("app_settings", {
  key: text("key").primaryKey(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  encryptedApiKey: text("encrypted_api_key").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
