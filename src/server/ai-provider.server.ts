/**
 * Shared AI provider helper.
 *
 * Server-only module: other server functions / cron routes call
 * `resolveAiProvider` + `generateText` / `generateTextWithWebSearch`
 * instead of hardcoding a single provider.
 *
 * Adds, on top of the raw provider calls:
 *  - approximate cost estimation per call, accumulated into
 *    settings.ai_usage_estimated_usd for the organization
 *  - out-of-credit / quota / rate-limit detection: flips
 *    settings.ai_provider_out_of_credit and throws AiOutOfCreditError so
 *    callers can skip gracefully instead of crashing
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

export interface AiImageInput {
  base64: string;
  mimeType: string;
}

export interface GenerateTextInput {
  provider: AiProvider;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  /** Organization whose estimated AI spend should be increased. */
  organizationId?: string;
  /** Optional image for vision-capable prompts (project file summaries). */
  image?: AiImageInput;
  /** Optional override; sensible per-provider defaults are used otherwise. */
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateTextResult {
  text: string;
  provider: AiProvider;
  model: string;
  /** Approximate USD cost of this single call. */
  estimatedUsd: number;
}

export interface GenerateTextWithWebSearchResult extends GenerateTextResult {
  sources: string[];
}

const OPENAI_MODEL = "gpt-4o-mini";
const OPENAI_SEARCH_MODEL = "gpt-4o-mini";
const ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * APPROXIMATE prices in USD per 1 million tokens, plus a per-call web search
 * tool price. These are hardcoded estimates for soft budget tracking only —
 * re-check them periodically against the providers' official pricing pages
 * (platform.openai.com/pricing, anthropic.com/pricing), they WILL drift.
 */
const PRICES: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  "gpt-4o-mini": { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  "gpt-4o": { inputPerMTok: 2.5, outputPerMTok: 10 },
  "claude-sonnet-4-5-20250929": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-3-5-haiku-20241022": { inputPerMTok: 0.8, outputPerMTok: 4 },
};
const FALLBACK_PRICE = { inputPerMTok: 3, outputPerMTok: 15 };
/** Approximate price of one provider web-search tool call. */
const WEB_SEARCH_PER_CALL_USD = 0.01;

/** Thrown when the provider reports no credit / quota / rate limit. */
export class AiOutOfCreditError extends Error {
  readonly code = "ai_out_of_credit";
  readonly provider: AiProvider;

  constructor(provider: AiProvider, message: string) {
    super(message);
    this.name = "AiOutOfCreditError";
    this.provider = provider;
  }
}

export function isAiOutOfCreditError(error: unknown): error is AiOutOfCreditError {
  return (
    error instanceof AiOutOfCreditError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "ai_out_of_credit")
  );
}

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

function estimateCost(model: string, inputTokens: number, outputTokens: number, webSearchCalls = 0) {
  const price = PRICES[model] ?? FALLBACK_PRICE;
  return (
    (inputTokens / 1_000_000) * price.inputPerMTok +
    (outputTokens / 1_000_000) * price.outputPerMTok +
    webSearchCalls * WEB_SEARCH_PER_CALL_USD
  );
}

/** Adds the estimate to settings.ai_usage_estimated_usd and clears the out-of-credit flag. */
async function recordUsage(organizationId: string | undefined, estimatedUsd: number) {
  if (!organizationId) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("settings")
      .select("id, ai_usage_estimated_usd, ai_provider_out_of_credit")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error || !data) return;

    const patch: Record<string, unknown> = {
      ai_usage_estimated_usd: Number(data.ai_usage_estimated_usd ?? 0) + estimatedUsd,
    };
    if (data.ai_provider_out_of_credit) patch['ai_provider_out_of_credit'] = false;

    await supabaseAdmin.from("settings").update(patch as never).eq("id", data.id);
  } catch (err) {
    console.error("[ai-provider] Failed to record AI usage:", err);
  }
}

async function markOutOfCredit(organizationId: string | undefined) {
  if (!organizationId) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("settings")
      .update({ ai_provider_out_of_credit: true } as never)
      .eq("organization_id", organizationId);
  } catch (err) {
    console.error("[ai-provider] Failed to flag out-of-credit state:", err);
  }
}

function looksOutOfCredit(status: number, body: string) {
  if (status === 402 || status === 429) return true;
  const lower = body.toLowerCase();
  return (
    lower.includes("insufficient_quota") ||
    lower.includes("insufficient quota") ||
    lower.includes("exceeded your current quota") ||
    lower.includes("credit balance is too low") ||
    lower.includes("billing") ||
    lower.includes("rate_limit")
  );
}

/** Turns a failed provider response into either AiOutOfCreditError or a plain Error. */
async function failure(
  response: Response,
  provider: AiProvider,
  organizationId: string | undefined,
): Promise<never> {
  const body = await response.text();
  if (looksOutOfCredit(response.status, body)) {
    await markOutOfCredit(organizationId);
    throw new AiOutOfCreditError(
      provider,
      `${provider} AI-kredit elfogyott vagy a limit betelt (${response.status}).`,
    );
  }
  throw new Error(`${provider} ${response.status}: ${body.slice(0, 300)}`);
}

function openaiUserContent(userPrompt: string, image?: AiImageInput) {
  if (!image) return userPrompt;
  return [
    { type: "text", text: userPrompt },
    { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
  ];
}

function anthropicUserContent(userPrompt: string, image?: AiImageInput) {
  if (!image) return userPrompt;
  return [
    { type: "text", text: userPrompt },
    {
      type: "image",
      source: { type: "base64", media_type: image.mimeType, data: image.base64 },
    },
  ];
}

/** Plain text generation, identical return shape across providers. */
export async function generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
  const { provider, apiKey, systemPrompt, userPrompt, organizationId, image } = input;
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
          { role: "user", content: openaiUserContent(userPrompt, image) },
        ],
      }),
    });
    if (!response.ok) await failure(response, provider, organizationId);
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const estimatedUsd = estimateCost(
      model,
      json.usage?.prompt_tokens ?? 0,
      json.usage?.completion_tokens ?? 0,
    );
    await recordUsage(organizationId, estimatedUsd);
    return {
      text: (json.choices?.[0]?.message?.content ?? "").trim(),
      provider,
      model,
      estimatedUsd,
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
      messages: [{ role: "user", content: anthropicUserContent(userPrompt, image) }],
    }),
  });
  if (!response.ok) await failure(response, provider, organizationId);
  const json = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (json.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n")
    .trim();
  const estimatedUsd = estimateCost(
    model,
    json.usage?.input_tokens ?? 0,
    json.usage?.output_tokens ?? 0,
  );
  await recordUsage(organizationId, estimatedUsd);
  return { text, provider, model, estimatedUsd };
}

/**
 * Same as `generateText`, but enables the provider's native web search tool
 * and also returns the source URLs the model used.
 *
 * COST NOTE: web search calls are billed per search on top of tokens; the
 * market-monitor cron runs this ~5-10 times per organization per day. Lower the
 * query count or the cron frequency if the bill runs higher than expected.
 */
export async function generateTextWithWebSearch(
  input: GenerateTextInput,
): Promise<GenerateTextWithWebSearchResult> {
  const { provider, apiKey, systemPrompt, userPrompt, organizationId } = input;
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
    if (!response.ok) await failure(response, provider, organizationId);
    const json = (await response.json()) as {
      output_text?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
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
    let searchCalls = 0;
    for (const item of json.output ?? []) {
      if (item.type === "web_search_call") searchCalls += 1;
      for (const block of item.content ?? []) {
        if (typeof block.text === "string") parts.push(block.text);
        for (const annotation of block.annotations ?? []) {
          if (annotation.url) sources.add(annotation.url);
        }
      }
    }
    const text = (json.output_text ?? parts.join("\n")).trim();
    const estimatedUsd = estimateCost(
      model,
      json.usage?.input_tokens ?? 0,
      json.usage?.output_tokens ?? 0,
      searchCalls,
    );
    await recordUsage(organizationId, estimatedUsd);
    return { text, provider, model, sources: [...sources], estimatedUsd };
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
  if (!response.ok) await failure(response, provider, organizationId);
  const json = (await response.json()) as {
    content?: Array<{
      type?: string;
      text?: string;
      citations?: Array<{ url?: string }>;
      content?: Array<{ type?: string; url?: string }>;
    }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      server_tool_use?: { web_search_requests?: number };
    };
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

  const estimatedUsd = estimateCost(
    model,
    json.usage?.input_tokens ?? 0,
    json.usage?.output_tokens ?? 0,
    json.usage?.server_tool_use?.web_search_requests ?? 0,
  );
  await recordUsage(organizationId, estimatedUsd);

  return {
    text: parts.join("\n").trim(),
    provider,
    model,
    sources: [...sources],
    estimatedUsd,
  };
}
