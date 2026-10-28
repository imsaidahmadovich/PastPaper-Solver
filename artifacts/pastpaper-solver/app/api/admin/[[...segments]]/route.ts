import { createHash, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  AdminLoginBody,
  CreatePaperBody,
  DeletePaperParams,
  GetAdminPaperParams,
  ProcessPaperParams,
  SaveAiSettingsBody,
  SavePaperAssetsBody,
  SavePaperQuestionsBody,
  SavePaperQuestionsParams,
  UpdatePaperBody,
  UpdatePaperParams,
} from "@workspace/api-zod";
import {
  appSettingsTable,
  db,
  loginRateLimitsTable,
  papersTable,
  questionsTable,
  attemptsTable,
} from "@workspace/db";
import { encryptApiKey } from "@/lib/server/crypto";
import { isAdminRequest, createAdminSession, jsonError, requireAdmin, setAdminCookie } from "@/lib/server/auth";
import {
  ALLOWED_FILE_TYPES,
  createSignedUpload,
  deleteObjects,
  getObject,
  isAllowedBlobPath,
  MAX_UPLOAD_BYTES,
  readPrivateBlob,
  storageConfigured,
} from "@/lib/server/blob";
import { requestAiJson } from "@/lib/server/ai-provider";
import { loadAiSettings, publicAiSettings } from "@/lib/server/ai-settings";

export const runtime = "nodejs";
export const maxDuration = 300;

const extractedQuestion = {
  questionNumber: (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0 && value.length <= 50,
};

function inputError(error: { message: string }): Response {
  return jsonError(error.message, 422);
}

async function findPaper(id: string) {
  const [paper] = await db.select().from(papersTable).where(eq(papersTable.id, id)).limit(1);
  return paper ?? null;
}

async function getAdminPaper(id: string) {
  const paper = await findPaper(id);
  if (!paper) return null;
  const questions = await db
    .select()
    .from(questionsTable)
    .where(eq(questionsTable.paperId, id))
    .orderBy(asc(questionsTable.position));
  const totalMarks = questions.reduce((sum, question) => sum + question.marks, 0);
  return {
    id: paper.id,
    title: paper.title,
    subject: paper.subject,
    examBoard: paper.examBoard,
    year: paper.year,
    session: paper.session,
    paperNumber: paper.paperNumber,
    timeLimitMinutes: paper.timeLimitMinutes,
    questionCount: questions.length,
    totalMarks,
    isPublished: paper.isPublished,
    hasQuestionPaper: Boolean(paper.questionPaperPath),
    hasMarkScheme: Boolean(paper.markSchemePath),
    questions,
  };
}

function sessionResponse(request: Request): Response {
  return Response.json({ authenticated: isAdminRequest(request) });
}

async function login(request: Request): Promise<Response> {
  const body = AdminLoginBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return inputError(body.error);

  const password = process.env.ADMIN_PASSWORD;
  if (!password) return jsonError("ADMIN_PASSWORD is not configured on the server.", 503);

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const remoteAddress = forwarded || request.headers.get("x-real-ip") || "unknown";
  const ipHash = createHash("sha256")
    .update(`${remoteAddress}:${process.env.SESSION_SECRET ?? "missing-session-secret"}`)
    .digest("hex");
  const now = new Date();
  const [rateRow] = await db
    .select()
    .from(loginRateLimitsTable)
    .where(eq(loginRateLimitsTable.ipHash, ipHash))
    .limit(1);

  if (rateRow?.lockedUntil && rateRow.lockedUntil > now) {
    return jsonError("Too many login attempts. Try again in a few minutes.", 429);
  }
  if (
    rateRow &&
    now.getTime() - rateRow.windowStartedAt.getTime() < 15 * 60 * 1000 &&
    rateRow.attempts >= 5
  ) {
    return jsonError("Too many login attempts. Try again in a few minutes.", 429);
  }

  const expected = Buffer.from(password);
  const supplied = Buffer.from(body.data.password);
  const passwordMatches =
    expected.length === supplied.length && timingSafeEqual(expected, supplied);

  if (!passwordMatches) {
    const resetWindow = !rateRow || now.getTime() - rateRow.windowStartedAt.getTime() >= 15 * 60 * 1000;
    const attempts = resetWindow ? 1 : rateRow.attempts + 1;
    await db
      .insert(loginRateLimitsTable)
      .values({
        ipHash,
        attempts,
        windowStartedAt: resetWindow ? now : rateRow.windowStartedAt,
        lockedUntil: attempts >= 5 ? new Date(now.getTime() + 15 * 60 * 1000) : null,
      })
      .onConflictDoUpdate({
        target: loginRateLimitsTable.ipHash,
        set: {
          attempts,
          windowStartedAt: resetWindow ? now : rateRow.windowStartedAt,
          lockedUntil: attempts >= 5 ? new Date(now.getTime() + 15 * 60 * 1000) : null,
        },
      });
    return jsonError("The password was not accepted.", 401);
  }

  await db.delete(loginRateLimitsTable).where(eq(loginRateLimitsTable.ipHash, ipHash));
  const response = NextResponse.json({ authenticated: true });
  const token = createAdminSession();
  setAdminCookie(response, token);
  return response;
}

async function uploadToken(request: Request): Promise<Response> {
  if (!isAdminRequest(request)) return jsonError("Administrator authentication required.", 401);
  if (!storageConfigured()) {
    return jsonError("File storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.", 503);
  }
  const body = (await request.json().catch(() => null)) as {
    paperId?: string; kind?: string; filename?: string; contentType?: string; size?: number;
  } | null;
  if (!body || typeof body !== "object") return jsonError("Invalid upload request.", 422);
  const { paperId, kind, filename, contentType, size } = body;
  if (!paperId || !/^[0-9a-f-]{36}$/i.test(paperId) || (kind !== "qp" && kind !== "ms")) {
    return jsonError("Invalid upload destination.", 422);
  }
  if (!contentType || !ALLOWED_FILE_TYPES.includes(contentType)) {
    return jsonError("Only PDF, JPEG, PNG or WebP files are allowed.", 422);
  }
  if (typeof size !== "number" || size <= 0 || size > MAX_UPLOAD_BYTES) {
    return jsonError("Each file must be under 8 MB.", 422);
  }
  const paper = await findPaper(paperId);
  if (!paper) return jsonError("Paper not found.", 404);
  const safeName = String(filename || "file").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100);
  const pathname = `pastpaper-solver/${paperId}/${kind}/${Date.now()}-${safeName}`;
  try {
    return Response.json({ url: await createSignedUpload(pathname), pathname });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Upload could not be authorized.", 502);
  }
}

async function saveQuestionPaper(request: Request, id: string): Promise<Response> {
  const parsed = SavePaperQuestionsBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return inputError(parsed.error);
  if (parsed.data.length === 0) return jsonError("Add at least one question before saving.", 422);
  const paper = await findPaper(id);
  if (!paper) return jsonError("Paper not found.", 404);

  const questions = parsed.data.map((question, position) => ({
    paperId: id,
    position,
    questionNumber: question.questionNumber.trim(),
    text: question.text.trim(),
    marks: question.marks,
    kind: question.kind,
    options: question.kind === "mcq" ? question.options : [],
    correctAnswer: question.correctAnswer.trim(),
    markingPoints: question.markingPoints,
  }));
  const saved = await db.transaction(async (tx) => {
    await tx.delete(questionsTable).where(eq(questionsTable.paperId, id));
    return tx.insert(questionsTable).values(questions).returning();
  });
  return Response.json(saved);
}

async function processPaper(id: string): Promise<Response> {
  const paper = await findPaper(id);
  if (!paper) return jsonError("Paper not found.", 404);
  if (!paper.questionPaperPath || !paper.markSchemePath) {
    return jsonError("Upload both the question paper and mark scheme before processing.", 422);
  }

  const settings = await loadAiSettings();
  if (!settings) return jsonError("Add an AI provider and API key in settings before processing papers.", 422);

  try {
    const [questionPaper, markScheme] = await Promise.all([
      readPrivateBlob(paper.questionPaperPath),
      readPrivateBlob(paper.markSchemePath),
    ]);
    const extracted = await requestAiJson<unknown>(
      settings.provider,
      settings.model,
      settings.apiKey,
      `Extract a structured exam paper by matching the question paper with its mark scheme. Return JSON only: {"questions":[{"questionNumber":"1(a)","text":"...","marks":2,"kind":"written","options":[],"correctAnswer":"...","markingPoints":["..."]}]}. Use "mcq" only when answer options are present; otherwise use "written". Preserve the original question numbering and wording. Include every question and sub-question, its total available marks, the answer, and concise marking points. Do not invent content. The response must be valid JSON and contain no markdown.`,
      [questionPaper, markScheme],
    );
    const rawQuestions =
      Array.isArray(extracted) ? extracted : (extracted as { questions?: unknown }).questions;
    if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
      return jsonError("The AI did not find any questions. Try different files or another model.", 422);
    }
    const cleaned = rawQuestions.map((item) => {
      if (!item || typeof item !== "object") throw new Error("The AI returned an invalid question.");
      const question = item as Record<string, unknown>;
      if (
        !extractedQuestion.questionNumber(question.questionNumber) ||
        typeof question.text !== "string" ||
        !question.text.trim() ||
        !Number.isInteger(question.marks) ||
        (question.kind !== "written" && question.kind !== "mcq")
      ) {
        throw new Error("The AI returned an invalid question. Check the source files or retry processing.");
      }
      return {
        questionNumber: question.questionNumber.trim(),
        text: question.text.trim(),
        marks: Math.max(0, Math.min(100, Number(question.marks))),
        kind: question.kind,
        options: Array.isArray(question.options)
          ? question.options.filter((value): value is string => typeof value === "string")
          : [],
        correctAnswer: typeof question.correctAnswer === "string" ? question.correctAnswer : "",
        markingPoints: Array.isArray(question.markingPoints)
          ? question.markingPoints.filter((value): value is string => typeof value === "string")
          : [],
      };
    });
    return Response.json(cleaned);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Paper processing failed.", 502);
  }
}

async function putAiSettings(request: Request): Promise<Response> {
  const parsed = SaveAiSettingsBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return inputError(parsed.error);
  const [existing] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "ai")).limit(1);
  const newApiKey = parsed.data.apiKey?.trim();
  if (!newApiKey && !existing?.encryptedApiKey && !process.env.AI_API_KEY) {
    return jsonError("Enter an API key to configure the selected provider.", 422);
  }
  const apiKeyToStore = newApiKey || existing?.encryptedApiKey
    ? newApiKey
      ? encryptApiKey(newApiKey)
      : existing!.encryptedApiKey
    : encryptApiKey(process.env.AI_API_KEY!);
  const [saved] = await db
    .insert(appSettingsTable)
    .values({
      key: "ai",
      provider: parsed.data.provider,
      model: parsed.data.model.trim(),
      encryptedApiKey: apiKeyToStore,
    })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: {
        provider: parsed.data.provider,
        model: parsed.data.model.trim(),
        encryptedApiKey: apiKeyToStore,
      },
    })
    .returning();
  return Response.json(await publicAiSettings());
}

async function getPrivateFile(request: Request): Promise<Response> {
  const pathname = new URL(request.url).searchParams.get("pathname");
  if (!pathname || pathname.length > 500 || pathname.includes("..")) {
    return jsonError("Invalid file path.", 422);
  }
  const [paper] = await db
    .select()
    .from(papersTable)
    .where(
      and(
        eq(papersTable.questionPaperPath, pathname),
      ),
    )
    .limit(1);
  const [markPaper] = paper
    ? []
    : await db.select().from(papersTable).where(eq(papersTable.markSchemePath, pathname)).limit(1);
  if (!paper && !markPaper) return jsonError("File not found.", 404);

  let result: Response;
  try {
    result = await getObject(pathname);
  } catch {
    return jsonError("File not found.", 404);
  }
  return new Response(result.body, {
    headers: {
      "Content-Type": result.headers.get("content-type") ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
    },
  });
}

async function getDashboard(): Promise<Response> {
  const [paperCounts] = await db
    .select({
      totalPapers: sql<number>`count(*)::int`,
      publishedPapers: sql<number>`count(*) filter (where ${papersTable.isPublished})::int`,
    })
    .from(papersTable);
  const [attemptStats] = await db
    .select({
      totalAttempts: sql<number>`count(*)::int`,
      averageScore: sql<number>`coalesce(avg(case when ${attemptsTable.maxMarks} > 0 then (${attemptsTable.totalMarks}::float / ${attemptsTable.maxMarks}) * 100 end), 0)::float`,
    })
    .from(attemptsTable);
  return Response.json({
    totalPapers: paperCounts.totalPapers,
    publishedPapers: paperCounts.publishedPapers,
    totalAttempts: attemptStats.totalAttempts,
    averageScore: Math.round(attemptStats.averageScore * 10) / 10,
  });
}

async function listAdminPapers(): Promise<Response> {
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
      isPublished: papersTable.isPublished,
      hasQuestionPaper: sql<boolean>`${papersTable.questionPaperPath} is not null`,
      hasMarkScheme: sql<boolean>`${papersTable.markSchemePath} is not null`,
      questionCount: sql<number>`count(${questionsTable.id})::int`,
      totalMarks: sql<number>`coalesce(sum(${questionsTable.marks}), 0)::int`,
    })
    .from(papersTable)
    .leftJoin(questionsTable, eq(questionsTable.paperId, papersTable.id))
    .groupBy(papersTable.id)
    .orderBy(desc(papersTable.year), asc(papersTable.subject), asc(papersTable.title));
  return Response.json(rows);
}

async function createPaper(request: Request): Promise<Response> {
  const parsed = CreatePaperBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return inputError(parsed.error);
  const [paper] = await db
    .insert(papersTable)
    .values({
      ...parsed.data,
      title: parsed.data.title.trim(),
      subject: parsed.data.subject.trim(),
      examBoard: parsed.data.examBoard.trim(),
      session: parsed.data.session.trim(),
      paperNumber: parsed.data.paperNumber.trim(),
      timeLimitMinutes: parsed.data.timeLimitMinutes ?? null,
    })
    .returning();
  return Response.json(
    {
      ...paper,
      questionCount: 0,
      totalMarks: 0,
      hasQuestionPaper: false,
      hasMarkScheme: false,
      questions: [],
    },
    { status: 201 },
  );
}

async function updatePaper(request: Request, id: string): Promise<Response> {
  const params = UpdatePaperParams.safeParse({ paperId: id });
  if (!params.success) return inputError(params.error);
  const parsed = UpdatePaperBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return inputError(parsed.error);
  const existing = await findPaper(id);
  if (!existing) return jsonError("Paper not found.", 404);

  if (parsed.data.isPublished === true) {
    const [questionCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(questionsTable)
      .where(eq(questionsTable.paperId, id));
    if (questionCount.count < 1) {
      return jsonError("Save at least one question before publishing this paper.", 422);
    }
  }

  const update = {
    ...parsed.data,
    ...(parsed.data.title === undefined ? {} : { title: parsed.data.title.trim() }),
    ...(parsed.data.subject === undefined ? {} : { subject: parsed.data.subject.trim() }),
    ...(parsed.data.examBoard === undefined ? {} : { examBoard: parsed.data.examBoard.trim() }),
    ...(parsed.data.session === undefined ? {} : { session: parsed.data.session.trim() }),
    ...(parsed.data.paperNumber === undefined ? {} : { paperNumber: parsed.data.paperNumber.trim() }),
  };
  const [saved] = await db.update(papersTable).set(update).where(eq(papersTable.id, id)).returning();
  const adminPaper = await getAdminPaper(saved.id);
  return Response.json(adminPaper);
}

async function deletePaper(id: string): Promise<Response> {
  const params = DeletePaperParams.safeParse({ paperId: id });
  if (!params.success) return inputError(params.error);
  const paper = await findPaper(id);
  if (!paper) return jsonError("Paper not found.", 404);

  const files = [paper.questionPaperPath, paper.markSchemePath].filter((path): path is string => Boolean(path));
  if (files.length > 0) {
    try {
      await deleteObjects(files);
    } catch {
      return jsonError("Source files could not be removed. The paper was not deleted.", 502);
    }
  }
  await db.delete(papersTable).where(eq(papersTable.id, id));
  return new Response(null, { status: 204 });
}

async function saveAssets(request: Request, id: string): Promise<Response> {
  const parsed = SavePaperAssetsBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return inputError(parsed.error);
  if (
    !isAllowedBlobPath(parsed.data.questionPaperPath, id, "qp") ||
    !isAllowedBlobPath(parsed.data.markSchemePath, id, "ms")
  ) {
    return jsonError("Uploaded files must belong to this paper and asset type.", 422);
  }
  const [paper] = await db
    .update(papersTable)
    .set({
      questionPaperPath: parsed.data.questionPaperPath,
      markSchemePath: parsed.data.markSchemePath,
    })
    .where(eq(papersTable.id, id))
    .returning({ id: papersTable.id });
  if (!paper) return jsonError("Paper not found.", 404);
  return Response.json({ hasQuestionPaper: true, hasMarkScheme: true });
}

export async function GET(request: Request): Promise<Response> {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean).slice(2);
  if (segments[0] === "session") return sessionResponse(request);

  const authError = requireAdmin(request);
  if (authError) return authError;

  if (segments[0] === "dashboard") return getDashboard();
  if (segments[0] === "papers" && segments.length === 1) return listAdminPapers();
  if (segments[0] === "papers" && segments.length === 2) {
    const params = GetAdminPaperParams.safeParse({ paperId: segments[1] });
    if (!params.success) return inputError(params.error);
    const paper = await getAdminPaper(params.data.paperId);
    return paper ? Response.json(paper) : jsonError("Paper not found.", 404);
  }
  if (segments[0] === "ai-settings") {
    return Response.json(await publicAiSettings());
  }
  if (segments[0] === "files") return getPrivateFile(request);
  return jsonError("Admin endpoint not found.", 404);
}

export async function POST(request: Request): Promise<Response> {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean).slice(2);
  if (segments[0] === "login") return login(request);
  if (segments[0] === "logout") {
    const response = new Response(null, { status: 204 });
    response.headers.append(
      "set-cookie",
      "pps_admin_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0" +
        (process.env.NODE_ENV === "production" ? "; Secure" : ""),
    );
    return response;
  }

  const authError = requireAdmin(request);
  if (authError) return authError;

  if (segments[0] === "blob-upload") return uploadToken(request);
  if (segments[0] === "papers" && segments.length === 1) return createPaper(request);
  if (segments[0] === "papers" && segments[1] && segments[2] === "process") {
    const params = ProcessPaperParams.safeParse({ paperId: segments[1] });
    return params.success ? processPaper(params.data.paperId) : inputError(params.error);
  }
  return jsonError("Admin endpoint not found.", 404);
}

export async function PUT(request: Request): Promise<Response> {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean).slice(2);
  const authError = requireAdmin(request);
  if (authError) return authError;

  if (segments[0] === "ai-settings") return putAiSettings(request);
  if (segments[0] === "papers" && segments[1] && segments[2] === "questions") {
    const params = SavePaperQuestionsParams.safeParse({ paperId: segments[1] });
    return params.success
      ? saveQuestionPaper(request, params.data.paperId)
      : inputError(params.error);
  }
  if (segments[0] === "papers" && segments[1] && segments[2] === "assets") {
    return saveAssets(request, segments[1]);
  }
  return jsonError("Admin endpoint not found.", 404);
}

export async function PATCH(request: Request): Promise<Response> {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean).slice(2);
  const authError = requireAdmin(request);
  if (authError) return authError;
  if (segments[0] === "papers" && segments[1] && segments.length === 2) {
    return updatePaper(request, segments[1]);
  }
  return jsonError("Admin endpoint not found.", 404);
}

export async function DELETE(request: Request): Promise<Response> {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean).slice(2);
  const authError = requireAdmin(request);
  if (authError) return authError;
  if (segments[0] === "papers" && segments[1] && segments.length === 2) {
    return deletePaper(segments[1]);
  }
  return jsonError("Admin endpoint not found.", 404);
}
