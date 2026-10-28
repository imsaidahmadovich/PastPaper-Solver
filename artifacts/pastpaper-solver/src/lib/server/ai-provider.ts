export type AiProvider = "openai" | "anthropic" | "gemini";
export type AiAttachment = {
  name: string;
  contentType: string;
  data: Buffer;
};

function dataUrl(file: AiAttachment): string {
  return `data:${file.contentType};base64,${file.data.toString("base64")}`;
}

// Retries short provider hiccups (overloaded / temporary server errors) a couple of times.
async function fetchRetry(url: string, init: RequestInit): Promise<Response> {
  let res = await fetch(url, init);
  for (const wait of [4000, 8000]) {
    if (![500, 502, 503].includes(res.status)) break;
    await new Promise((resolve) => setTimeout(resolve, wait));
    res = await fetch(url, init);
  }
  return res;
}

async function providerRequest(
  provider: AiProvider,
  model: string,
  apiKey: string,
  prompt: string,
  attachments: AiAttachment[] = [],
): Promise<string> {
  const signal = AbortSignal.timeout(270_000);
  let response: Response;

  if (provider === "openai" && apiKey.startsWith("sk-or-")) {
    // OpenRouter (OpenAI-compatible). PDFs are parsed by OpenRouter's free text engine,
    // so this works with any model, including free ones.
    const content = [
      { type: "text", text: prompt },
      ...attachments.map((file) =>
        file.contentType === "application/pdf"
          ? { type: "file", file: { filename: file.name, file_data: dataUrl(file) } }
          : { type: "image_url", image_url: { url: dataUrl(file) } },
      ),
    ];
    response = await fetchRetry("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "X-Title": "PastPaper Solver",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content }],
        plugins: [{ id: "file-parser", pdf: { engine: "pdf-text" } }],
        response_format: { type: "json_object" },
      }),
      signal,
    });
  } else if (provider === "openai") {
    const hasPdf = attachments.some((file) => file.contentType === "application/pdf");
    if (hasPdf) {
      const content = [
        { type: "input_text", text: prompt },
        ...attachments.map((file) =>
          file.contentType === "application/pdf"
            ? {
                type: "input_file",
                filename: file.name,
                file_data: dataUrl(file),
              }
            : {
                type: "input_image",
                image_url: dataUrl(file),
              },
        ),
      ];
      response = await fetchRetry("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model, input: [{ role: "user", content }] }),
        signal,
      });
    } else {
      const content = [
        { type: "text", text: prompt },
        ...attachments.map((file) => ({
          type: "image_url",
          image_url: { url: dataUrl(file), detail: "high" },
        })),
      ];
      response = await fetchRetry("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content }],
        }),
        signal,
      });
    }
  } else if (provider === "anthropic") {
    const content = [
      ...attachments.map((file) =>
        file.contentType === "application/pdf"
          ? {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: file.data.toString("base64"),
              },
            }
          : {
              type: "image",
              source: {
                type: "base64",
                media_type: file.contentType,
                data: file.data.toString("base64"),
              },
            },
      ),
      { type: "text", text: prompt },
    ];
    response = await fetchRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model, max_tokens: 7000, messages: [{ role: "user", content }] }),
      signal,
    });
  } else {
    const parts = [
      { text: prompt },
      ...attachments.map((file) => ({
        inlineData: {
          mimeType: file.contentType,
          data: file.data.toString("base64"),
        },
      })),
    ];
    response = await fetchRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            // Turn off slow "thinking" on 2.5 Flash / Flash-Lite so extraction finishes quickly.
            ...(/gemini-2\.5-flash/i.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        }),
        signal,
      },
    );
  }

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as Record<string, any> | null;
    const raw = detail?.error?.message ?? detail?.error ?? detail?.message ?? "";
    const reason = (typeof raw === "string" ? raw : JSON.stringify(raw)).slice(0, 300);
    throw new Error(
      `The AI provider returned an error (${response.status}). ${reason || "Check the provider, model, and API key in AI settings."}`,
    );
  }

  const result = (await response.json()) as Record<string, any>;
  if (provider === "openai") {
    const text =
      result.output_text ??
      result.choices?.[0]?.message?.content ??
      result.output?.flatMap((item: any) => item.content ?? []).find((item: any) => item.text)?.text;
    if (typeof text === "string") return text;
  } else if (provider === "anthropic") {
    const text = result.content?.find((item: any) => item.type === "text")?.text;
    if (typeof text === "string") return text;
  } else {
    const text = result.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? "").join("");
    if (typeof text === "string" && text.length > 0) return text;
  }
  throw new Error("The AI provider returned an empty response.");
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// Fixes common model mistakes inside JSON strings: raw newlines, invalid backslashes, trailing commas.
function sanitize(text: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!inString) {
      if (c === '"') inString = true;
      out += c;
      continue;
    }
    if (c === "\\") {
      const next = text[i + 1];
      if (next && '"\\/bfnrtu'.includes(next)) {
        out += c + next;
        i++;
      } else {
        out += "\\\\";
      }
    } else if (c === '"') {
      inString = false;
      out += c;
    } else if (c === "\n") out += "\\n";
    else if (c === "\t") out += "\\t";
    else if (c === "\r") continue;
    else out += c;
  }
  return out.replace(/,\s*([}\]])/g, "$1");
}

// If the reply was cut off, keep every complete question that arrived.
function salvage(text: string): unknown {
  const body = sanitize(text);
  let end = body.length;
  for (let attempt = 0; attempt < 400; attempt++) {
    end = body.lastIndexOf("}", end - 1);
    if (end < 0) break;
    const head = body.slice(0, end + 1);
    for (const tail of ["", "]}", "]"]) {
      const value = tryParse(head + tail);
      if (value && typeof value === "object") return value;
    }
  }
  return undefined;
}

export async function requestAiJson<T>(
  provider: AiProvider,
  model: string,
  apiKey: string,
  prompt: string,
  attachments: AiAttachment[] = [],
): Promise<T> {
  const output = await providerRequest(provider, model, apiKey, prompt, attachments);
  const cleaned = output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const start = cleaned.search(/[{[]/);
  const candidate = start >= 0 ? cleaned.slice(start) : cleaned;
  const closer = candidate.startsWith("[") ? "]" : "}";
  const trimmed = candidate.slice(0, candidate.lastIndexOf(closer) + 1);
  const attempts = [
    () => tryParse(trimmed),
    () => tryParse(sanitize(trimmed)),
    () => salvage(candidate),
  ];
  for (const attempt of attempts) {
    const value = attempt();
    if (value && typeof value === "object") return value as T;
  }
  const preview = output.trim().replace(/\s+/g, " ").slice(0, 160);
  throw new Error(
    `The AI response could not be read as structured JSON. Try again or choose a different model. The reply started with: "${preview}"`,
  );
}
