# PastPaper Solver

PastPaper Solver is a Next.js app for practicing published exam papers, reviewing results, and securely managing papers in an admin area.

## Deploy on Vercel

1. Import this repository into Vercel.
2. Set **Root Directory** to `artifacts/pastpaper-solver`.
3. Enable **Include source files outside of the Root Directory in the Build Step**. The app uses shared workspace packages from `lib/`.
4. Keep the framework preset as **Next.js** and use Node.js 22 or newer. Leave the build command and output directory at their defaults.
5. Create a PostgreSQL database and a **private** Vercel Blob store, then add these variables in Vercel's Project Settings for each environment you use:

   | Variable | Required | Purpose |
   | --- | --- | --- |
   | `DATABASE_URL` | Yes | PostgreSQL connection URL |
   | `ADMIN_PASSWORD` | Yes | Strong, unique admin password |
   | `SESSION_SECRET` | Yes | Random value of at least 32 characters; keep it stable |
   | `BLOB_READ_WRITE_TOKEN` | Yes for uploads | Token for the private Blob store |
   | `AI_API_KEY` | Optional | Server-side AI key; it can instead be added in Admin settings |
   | `AI_PROVIDER` | Optional | `openai`, `anthropic`, or `gemini` |
   | `AI_MODEL` | Optional | Model name for the selected provider |

6. Before the first deployment, apply the database schema from the repository root with the production `DATABASE_URL` available:

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @workspace/db run push
   ```

7. Deploy. After it is live, sign in at `/admin` and configure the AI provider if needed.

Do not put credentials in source files or `NEXT_PUBLIC_*` variables. Keep `SESSION_SECRET` unchanged after launch; rotating it invalidates admin sessions and makes any saved AI key unreadable.

See [`artifacts/pastpaper-solver/README.md`](artifacts/pastpaper-solver/README.md) for detailed configuration, local development, uploads, and troubleshooting notes.
