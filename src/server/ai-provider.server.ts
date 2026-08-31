/**
 * Shared AI provider helper.
 *
 * Server-only module: other server functions / cron routes call
 * `resolveAiProvider` + `generateText` / `generateTextWithWebSearch`
 * instead of hardcoding a single provider.
 */

export type AiProvider = "openai" | "anthropic";

export interface AiProviderSettings {
  openai_api_key?: string | null;
  anthropic_api_key?: string | null;
  preferred_ai_provider?: string | null;
}

export interface ResolvedAiProvider {
  provider: AiProvider;
  apiKey: string;
}

export interface GenerateTextInput {
  provider: AiProvider;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  /** Optional override; sensible per-provider defaults are used otherwise. */
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateTextResult {
  text: string;
  provider: AiProvider;
  model: string;
}

export interface GenerateTextWithWebSearchResult extends GenerateTextResult {
  sources: string[];
}

const OPENAI_MODEL = "gpt-4o-mini";
const OPENAI_SEARCH_MODEL = "gpt-4o-mini";
const ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Chooses the provider to use: the preferred one when its key is set,
 * otherwise the other provider if that key is set. Returns null if
 * neither key is available.
 */
export function resolveAiProvider(
  settings: AiProviderSettings | null | undefined,
): ResolvedAiProvider | null {
  const openaiKey = (settings?.openai_api_key ?? "").trim();
  const anthropicKey = (settings?.anthropic_api_key ?? "").trim();
  const preferred: AiProvider =
    settings?.preferred_ai_provider === "openai" ? "openai" : "anthropic";

  if (preferred === "anthropic") {
    if (anthropicKey) return { provider: "anthropic", apiKey: anthropicKey };
    if (openaiKey) return { provider: "openai", apiKey: openaiKey };
    return null;
  }

  if (openaiKey) return { provider: "openai", apiKey: openaiKey };
  if (anthropicKey) return { provider: "anthropic", apiKey: anthropicKey };
  return null;
}

async function failure(response: Response, label: string): Promise<never> {
  const body = await response.text();
  throw new Error(`${label} ${response.status}: ${body.slice(0, 300)}`);
}

/** Plain text generation, identical return shape across providers. */
export async function generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
  const { provider, apiKey, systemPrompt, userPrompt } = input;
  const temperature = input.temperature ?? 0.4;
  const maxTokens = input.maxTokens ?? 1024;

  if (provider === "openai") {
    const model = input.model ?? OPENAI_MODEL;
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!response.ok) await failure(response, "OpenAI");
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return {
      text: (json.choices?.[0]?.message?.content ?? "").trim(),
      provider,
      model,
    };
  }

  const model = input.model ?? ANTHROPIC_MODEL;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!response.ok) await failure(response, "Anthropic");
  const json = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = (json.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n")
    .trim();
  return { text, provider, model };
}

/**
 * Same as `generateText`, but enables the provider's native web search tool
 * and also returns the source URLs the model used.
 */
export async function generateTextWithWebSearch(
  input: GenerateTextInput,
): Promise<GenerateTextWithWebSearchResult> {
  const { provider, apiKey, systemPrompt, userPrompt } = input;
  const maxTokens = input.maxTokens ?? 2048;

  if (provider === "openai") {
    const model = input.model ?? OPENAI_SEARCH_MODEL;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: systemPrompt,
        input: userPrompt,
        max_output_tokens: maxTokens,
        tools: [{ type: "web_search" }],
      }),
    });
    if (!response.ok) await failure(response, "OpenAI");
    const json = (await response.json()) as {
      output_text?: string;
      output?: Array<{
        type?: string;
        content?: Array<{
          type?: string;
          text?: string;
          annotations?: Array<{ type?: string; url?: string }>;
        }>;
      }>;
    };

    const parts: string[] = [];
    const sources = new Set<string>();
    for (const item of json.output ?? []) {
      for (const block of item.content ?? []) {
        if (typeof block.text === "string") parts.push(block.text);
        for (const annotation of block.annotations ?? []) {
          if (annotation.url) sources.add(annotation.url);
        }
      }
    }
    const text = (json.output_text ?? parts.join("\n")).trim();
    return { text, provider, model, sources: [...sources] };
  }

  const model = input.model ?? ANTHROPIC_MODEL;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    }),
  });
  if (!response.ok) await failure(response, "Anthropic");
  const json = (await response.json()) as {
    content?: Array<{
      type?: string;
      text?: string;
      citations?: Array<{ url?: string }>;
      content?: Array<{ type?: string; url?: string }>;
    }>;
  };

  const parts: string[] = [];
  const sources = new Set<string>();
  for (const block of json.content ?? []) {
    if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
    for (const citation of block.citations ?? []) {
      if (citation.url) sources.add(citation.url);
    }
    if (block.type === "web_search_tool_result") {
      for (const result of block.content ?? []) {
        if (result.url) sources.add(result.url);
      }
    }
  }

  return { text: parts.join("\n").trim(), provider, model, sources: [...sources] };
}
