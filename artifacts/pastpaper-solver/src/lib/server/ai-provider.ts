export type AiProvider = "openai" | "anthropic" | "gemini";
export type AiAttachment = {
  name: string;
  contentType: string;
  data: Buffer;
};

function dataUrl(file: AiAttachment): string {
  return `data:${file.contentType};base64,${file.data.toString("base64")}`;
}

async function providerRequest(
  provider: AiProvider,
  model: string,
  apiKey: string,
  prompt: string,
  attachments: AiAttachment[] = [],
): Promise<string> {
  const signal = AbortSignal.timeout(90_000);
  let response: Response;

  if (provider === "openai") {
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
      response = await fetch("https://api.openai.com/v1/responses", {
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
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
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
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model, max_tokens: 7000, temperature: 0.1, messages: [{ role: "user", content }] }),
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
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
        }),
        signal,
      },
    );
  }

  if (!response.ok) {
    throw new Error(`The AI provider returned an error (${response.status}). Check the provider, model, and API key in AI settings.`);
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

export async function requestAiJson<T>(
  provider: AiProvider,
  model: string,
  apiKey: string,
  prompt: string,
  attachments: AiAttachment[] = [],
): Promise<T> {
  const output = await providerRequest(provider, model, apiKey, prompt, attachments);
  const trimmed = output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const json = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  try {
    return JSON.parse(json) as T;
  } catch {
    throw new Error("The AI response could not be read as structured JSON. Try the process again or choose a different model.");
  }
}
