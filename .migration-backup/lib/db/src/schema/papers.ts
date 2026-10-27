import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const papersTable = pgTable(
  "papers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    subject: text("subject").notNull(),
    examBoard: text("exam_board").notNull(),
    year: integer("year").notNull(),
    session: text("session").notNull(),
    paperNumber: text("paper_number").notNull(),
    timeLimitMinutes: integer("time_limit_minutes"),
    isPublished: boolean("is_published").notNull().default(false),
    questionPaperPath: text("question_paper_path"),
    markSchemePath: text("mark_scheme_path"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("papers_published_idx").on(table.isPublished, table.year),
    index("papers_subject_idx").on(table.subject),
  ],
);

export const insertPaperSchema = createInsertSchema(papersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPaper = z.infer<typeof insertPaperSchema>;
export type Paper = typeof papersTable.$inferSelect;
