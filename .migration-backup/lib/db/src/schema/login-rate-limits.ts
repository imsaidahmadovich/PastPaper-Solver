import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const loginRateLimitsTable = pgTable("login_rate_limits", {
  ipHash: text("ip_hash").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});
