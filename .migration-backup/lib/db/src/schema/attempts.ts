import { createInsertSchema } from "drizzle-zod";
import { index, integer, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { papersTable } from "./papers";

export type AttemptAnswer = { questionId: string; answer: string };
export type AttemptQuestionResult = {
  questionId: string;
  questionNumber: string;
  questionText: string;
  userAnswer: string;
  correctAnswer: string;
  markingPoints: string[];
  marksAwarded: number;
  maxMarks: number;
  explanation: string;
};

export const attemptsTable = pgTable(
  "attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paperId: uuid("paper_id")
      .notNull()
      .references(() => papersTable.id, { onDelete: "cascade" }),
    answers: jsonb("answers").$type<AttemptAnswer[]>().notNull().default([]),
    results: jsonb("results")
      .$type<AttemptQuestionResult[]>()
      .notNull()
      .default([]),
    totalMarks: integer("total_marks").notNull().default(0),
    maxMarks: integer("max_marks").notNull().default(0),
    timeTakenSeconds: integer("time_taken_seconds").notNull().default(0),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("attempts_paper_idx").on(table.paperId, table.submittedAt)],
);

export const insertAttemptSchema = createInsertSchema(attemptsTable).omit({
  id: true,
  submittedAt: true,
});

export type InsertAttempt = z.infer<typeof insertAttemptSchema>;
export type Attempt = typeof attemptsTable.$inferSelect;
