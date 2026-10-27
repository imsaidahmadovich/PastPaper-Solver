import { asc, and, eq } from "drizzle-orm";
import { GetPaperParams, GetPaperResponse } from "@workspace/api-zod";
import { db, papersTable, questionsTable } from "@workspace/db";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ paperId: string }> },
): Promise<Response> {
  const params = GetPaperParams.safeParse(await context.params);
  if (!params.success) {
    return Response.json({ error: "Invalid paper ID." }, { status: 422 });
  }

  const [paper] = await db
    .select()
    .from(papersTable)
    .where(and(eq(papersTable.id, params.data.paperId), eq(papersTable.isPublished, true)))
    .limit(1);
  if (!paper) return Response.json({ error: "Paper not found." }, { status: 404 });

  const questions = await db
    .select({
      id: questionsTable.id,
      questionNumber: questionsTable.questionNumber,
      text: questionsTable.text,
      kind: questionsTable.kind,
      options: questionsTable.options,
      position: questionsTable.position,
    })
    .from(questionsTable)
    .where(eq(questionsTable.paperId, paper.id))
    .orderBy(asc(questionsTable.position));

  const publicPaper = {
    id: paper.id,
    title: paper.title,
    subject: paper.subject,
    examBoard: paper.examBoard,
    year: paper.year,
    session: paper.session,
    paperNumber: paper.paperNumber,
    timeLimitMinutes: paper.timeLimitMinutes,
    questions: questions.map(({ position: _position, ...question }) => question),
  };

  return Response.json(GetPaperResponse.parse(publicPaper));
}
