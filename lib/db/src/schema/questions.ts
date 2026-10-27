import { createInsertSchema } from "drizzle-zod";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { papersTable } from "./papers";

export type QuestionKind = "written" | "mcq";

export const questionsTable = pgTable(
  "questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paperId: uuid("paper_id")
      .notNull()
      .references(() => papersTable.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    questionNumber: text("question_number").notNull(),
    text: text("text").notNull(),
    marks: integer("marks").notNull().default(0),
    kind: text("kind").$type<QuestionKind>().notNull().default("written"),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    correctAnswer: text("correct_answer").notNull().default(""),
    markingPoints: jsonb("marking_points")
      .$type<string[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("questions_paper_idx").on(table.paperId, table.position),
    uniqueIndex("questions_paper_position_unique").on(
      table.paperId,
      table.position,
    ),
  ],
);

export const insertQuestionSchema = createInsertSchema(questionsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Question = typeof questionsTable.$inferSelect;
