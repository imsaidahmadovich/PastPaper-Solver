import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { ListPapersQueryParams, ListPapersResponse } from "@workspace/api-zod";
import { db, papersTable, questionsTable } from "@workspace/db";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = ListPapersQueryParams.safeParse({
    search: url.searchParams.get("search") ?? undefined,
    subject: url.searchParams.get("subject") ?? undefined,
    year: url.searchParams.get("year") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 422 });
  }

  const filters = [eq(papersTable.isPublished, true)];
  if (parsed.data.subject) filters.push(eq(papersTable.subject, parsed.data.subject));
  if (parsed.data.year) filters.push(eq(papersTable.year, parsed.data.year));
  if (parsed.data.search?.trim()) {
    const search = parsed.data.search.trim().replace(/[\\%_]/g, "\\$&");
    filters.push(ilike(papersTable.title, `%${search}%`));
  }

  const rows = await db
    .select({
      id: papersTable.id,
      title: papersTable.title,
      subject: papersTable.subject,
      examBoard: papersTable.examBoard,
      year: papersTable.year,
      session: papersTable.session,
      paperNumber: papersTable.paperNumber,
      timeLimitMinutes: papersTable.timeLimitMinutes,
      questionCount: sql<number>`count(${questionsTable.id})::int`,
      totalMarks: sql<number>`coalesce(sum(${questionsTable.marks}), 0)::int`,
    })
    .from(papersTable)
    .leftJoin(questionsTable, eq(questionsTable.paperId, papersTable.id))
    .where(and(...filters))
    .groupBy(papersTable.id)
    .orderBy(desc(papersTable.year), asc(papersTable.subject), asc(papersTable.title));

  return Response.json(ListPapersResponse.parse(rows));
}
