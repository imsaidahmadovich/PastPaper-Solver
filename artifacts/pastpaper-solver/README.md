# PastPaper Solver

PastPaper Solver is a Next.js app for finding published exam papers, practising questions, and reviewing results. Administrators can manage papers, upload private source files, extract questions with an AI provider, and publish reviewed papers.

## Stack

- Next.js App Router with Node.js 22 or newer
- PostgreSQL via Drizzle ORM
- Private Vercel Blob storage for PDFs and images
- Server-side OpenAI, Anthropic, or Gemini requests

No SQLite database or local-disk file storage is used for deployed data.

## Vercel deployment

1. Import the repository into Vercel and use **Next.js** as the framework.
2. Set the project **Root Directory** to `artifacts/pastpaper-solver`.
3. Enable Vercel's option to include source files outside the Root Directory. This app imports the shared API and database packages from the workspace.
4. Use Node.js 22 or 24 and the repository's pnpm workspace/package manager.
5. Add these variables to Vercel's Production, Preview, and Development environments as needed:

   | Variable | Purpose |
   | --- | --- |
   | `DATABASE_URL` | PostgreSQL connection URL. Prefer a provider's pooled URL for serverless connections. |
   | `ADMIN_PASSWORD` | Password for the single administrator account. |
   | `SESSION_SECRET` | Random value of at least 32 characters. Keep it stable after launch. |
   | `BLOB_READ_WRITE_TOKEN` | Token for a **private** Vercel Blob store. Required for source-file uploads and processing. |
   | `AI_API_KEY` | Optional server-side provider key. It can instead be entered in the admin AI settings page. |
   | `AI_PROVIDER` | Optional `openai`, `anthropic`, or `gemini` provider for `AI_API_KEY`. |
   | `AI_MODEL` | Optional model identifier for `AI_API_KEY`. |

6. Before the first deployment, apply the database schema from the repository root with the production `DATABASE_URL` available in the shell:

   ```bash
   pnpm --filter @workspace/db run push
   ```

7. Deploy. Vercel builds the Next.js app with `next build`; it must not be configured as a static export.
8. Sign in at `/admin`, set the AI provider and model, and either enter a key there or use the optional AI environment variables.

Keep the production `SESSION_SECRET` unchanged. It is used both for signed admin sessions and to encrypt an AI key saved in the database. Rotating it invalidates active sessions and makes previously saved AI keys unreadable; re-enter the provider key after rotation.

The source papers and mark schemes are stored in a private Blob store and delivered through authenticated server routes. Uploads accept PDF, JPEG, PNG, or WebP files up to 8 MB each.

## Local development

Set the variables in `.env.example` through your local environment or Replit Secrets, provision a private Blob token for uploads, then run from the workspace root:

```bash
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/pastpaper-solver run dev
```

For local-only AI setup, enter a provider key in `/admin`; the key is encrypted before it is saved. The key is never returned to the browser.
