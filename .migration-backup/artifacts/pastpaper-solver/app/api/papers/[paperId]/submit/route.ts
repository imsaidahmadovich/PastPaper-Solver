import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  SubmitAttemptBody,
  SubmitAttemptParams,
  SubmitAttemptResponse,
} from "@workspace/api-zod";
import { attemptsTable, db, papersTable, questionsTable } from "@workspace/db";
import { loadAiSettings } from "@/lib/server/ai-settings";
import { requestAiJson } from "@/lib/server/ai-provider";

export const runtime = "nodejs";
export const maxDuration = 120;

const WrittenGrades = z.object({
  results: z.array(
    z.object({
      questionId: z.string().uuid(),
      marksAwarded: z.number().int().min(0),
      explanation: z.string().max(2000),
    }),
  ),
});

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,;:!?]+$/g, "");
}

function isCorrectMcq(answer: string, correctAnswer: string, options: string[]): boolean {
  const given = normalize(answer);
  const expected = normalize(correctAnswer);
  if (!given || !expected) return false;
  if (given === expected) return true;

  const correctIndex = options.findIndex((option) => normalize(option) === expected);
  if (correctIndex < 0) return false;
  const letter = String.fromCharCode(65 + correctIndex).toLowerCase();
  const option = normalize(options[correctIndex] ?? "");
  return given === letter || given === `${letter})` || given === option;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ paperId: string }> },
): Promise<Response> {
  const params = SubmitAttemptParams.safeParse(await context.params);
  if (!params.success) return Response.json({ error: "Invalid paper ID." }, { status: 422 });

  const body = SubmitAttemptBody.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: body.error.message }, { status: 422 });
  }

  const [paper] = await db
    .select()
    .from(papersTable)
    .where(and(eq(papersTable.id, params.data.paperId), eq(papersTable.isPublished, true)))
    .limit(1);
  if (!paper) return Response.json({ error: "Paper not found." }, { status: 404 });

  const questions = await db
    .select()
    .from(questionsTable)
    .where(eq(questionsTable.paperId, paper.id))
    .orderBy(asc(questionsTable.position));
  const questionIds = new Set(questions.map((question) => question.id));
  const submittedIds = body.data.answers.map((answer) => answer.questionId);
  if (
    submittedIds.some((id) => !questionIds.has(id)) ||
    new Set(submittedIds).size !== submittedIds.length
  ) {
    return Response.json({ error: "Answers contain an unknown or duplicate question." }, { status: 422 });
  }

  const answers = new Map(body.data.answers.map((answer) => [answer.questionId, answer.answer]));
  const written = questions.filter(
    (question) => question.kind !== "mcq" && (answers.get(question.id) ?? "").trim().length > 0,
  );
  const gradeById = new Map<string, { marksAwarded: number; explanation: string }>();

  if (written.length > 0) {
    const settings = await loadAiSettings();
    if (!settings) {
      return Response.json(
        { error: "Written-answer grading is not configured. Ask the administrator to add an AI provider in settings." },
        { status: 422 },
      );
    }

    try {
      const gradingInput = written.map((question) => ({
        questionId: question.id,
        questionNumber: question.questionNumber,
        questionText: question.text,
        maximumMarks: question.marks,
        correctAnswer: question.correctAnswer,
        markingPoints: question.markingPoints,
        studentAnswer: answers.get(question.id) ?? "",
      }));
      const response = await requestAiJson<unknown>(
        settings.provider,
        settings.model,
        settings.apiKey,
        `Grade each student answer against the official answer and marking points. Award only whole marks from 0 to the question maximum. Be fair to equivalent wording and partial credit. Return JSON only as {"results":[{"questionId":"...","marksAwarded":0,"explanation":"brief reason"}]}. Do not award marks for unsupported claims.\n\n${JSON.stringify(gradingInput)}`,
      );
      const grades = WrittenGrades.parse(response);
      for (const grade of grades.results) {
        const question = written.find((item) => item.id === grade.questionId);
        if (!question) continue;
        gradeById.set(grade.questionId, {
          marksAwarded: Math.min(question.marks, Math.max(0, grade.marksAwarded)),
          explanation: grade.explanation,
        });
      }
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "AI grading failed. Please try again." },
        { status: 502 },
      );
    }
  }

  const questionResults = questions.map((question) => {
    const answer = answers.get(question.id) ?? "";
    let marksAwarded = 0;
    let explanation = "No answer was provided.";

    if (question.kind === "mcq") {
      const correct = isCorrectMcq(answer, question.correctAnswer, question.options);
      marksAwarded = correct ? question.marks : 0;
      explanation = correct ? "Correct answer." : answer.trim() ? "This answer did not match the correct option." : "No answer was provided.";
    } else if (answer.trim()) {
      const grade = gradeById.get(question.id);
      marksAwarded = grade?.marksAwarded ?? 0;
      explanation = grade?.explanation ?? "This answer could not be graded.";
    }

    return {
      questionId: question.id,
      questionNumber: question.questionNumber,
      questionText: question.text,
      userAnswer: answer,
      correctAnswer: question.correctAnswer,
      markingPoints: question.markingPoints,
      marksAwarded,
      maxMarks: question.marks,
      explanation,
    };
  });

  const totalMarks = questionResults.reduce((sum, question) => sum + question.marksAwarded, 0);
  const maxMarks = questionResults.reduce((sum, question) => sum + question.maxMarks, 0);
  const timeTakenSeconds = Math.max(0, Math.min(86_400, body.data.durationSeconds));
  const [attempt] = await db
    .insert(attemptsTable)
    .values({
      paperId: paper.id,
      answers: questions.map((question) => ({
        questionId: question.id,
        answer: answers.get(question.id) ?? "",
      })),
      results: questionResults,
      totalMarks,
      maxMarks,
      timeTakenSeconds,
    })
    .returning({ id: attemptsTable.id, submittedAt: attemptsTable.submittedAt });

  return Response.json(
    SubmitAttemptResponse.parse({
      attemptId: attempt.id,
      totalMarks,
      maxMarks,
      percentage: maxMarks === 0 ? 0 : Math.round((totalMarks / maxMarks) * 1000) / 10,
      timeTakenSeconds,
      submittedAt: attempt.submittedAt.toISOString(),
      questions: questionResults,
    }),
  );
}
