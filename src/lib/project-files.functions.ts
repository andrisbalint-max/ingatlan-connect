import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface SummarizeResult {
  status: "ok" | "no_provider" | "out_of_credit" | "unsupported" | "error";
  message?: string;
  summary?: string;
}

export interface SuggestionResult {
  status: "ok" | "no_provider" | "out_of_credit" | "unsupported" | "error";
  message?: string;
  description?: string;
  targetAudience?: string;
}

const SYSTEM_PROMPT =
  "Ipari ingatlan projektdokumentumokat összegző magyar asszisztens vagy. Írj rövid (3-5 mondat), tárgyilagos magyar összefoglalót, kiemelve a méreteket, helyszínt, bérleti/műszaki paramétereket, ha szerepelnek. Csak az összefoglalót add vissza.";

const SUGGEST_SYSTEM_PROMPT =
  "Ipari ingatlan bróker asszisztens vagy. A megadott dokumentumszöveg alapján adj vissza KIZÁRÓLAG JSON-t: {\"description\":\"2-3 mondatos magyar projektleírás\",\"target_audience\":\"1-2 mondat: milyen iparág, cégméret-jelek és felhasználási mód a legvalószínűbb érdeklődő\"}. Ne találj ki adatot, csak a szövegből dolgozz.";

/** Loads settings + resolves the AI provider for an organization. */
async function getProvider(organizationId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { resolveAiProvider } = await import("@/server/ai-provider.server");
  const { data: settings } = await supabaseAdmin
    .from("settings")
    .select("openai_api_key, anthropic_api_key, preferred_ai_provider")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return resolveAiProvider(settings);
}

async function extractPdfText(blob: Blob): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const buffer = new Uint8Array(await blob.arrayBuffer());
  const pdf = await getDocumentProxy(buffer);
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n") : text).trim();
}

function imageMime(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

/**
 * Generates a short Hungarian AI summary for an uploaded project file
 * (PDF text extraction or image vision) through the shared AI provider helper.
 */
export const summarizeProjectFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileId: string }) => {
    if (!input || typeof input.fileId !== "string" || input.fileId.length === 0) {
      throw new Error("fileId szükséges");
    }
    return { fileId: input.fileId };
  })
  .handler(async ({ data, context }): Promise<SummarizeResult> => {
    const { supabase } = context;

    const { data: file, error: fileError } = await supabase
      .from("project_files")
      .select("id, filename, storage_path, organization_id")
      .eq("id", data.fileId)
      .maybeSingle();
    if (fileError) throw fileError;
    if (!file || !file.storage_path) {
      return { status: "error", message: "A fájl nem található." };
    }

    const resolved = await getProvider(file.organization_id);
    if (!resolved) return { status: "no_provider", message: "AI-szolgáltató nincs beállítva" };

    const { data: blob, error: downloadError } = await supabase.storage
      .from("project-files")
      .download(file.storage_path);
    if (downloadError || !blob) {
      return { status: "error", message: downloadError?.message ?? "A fájl letöltése nem sikerült." };
    }

    const lower = file.filename.toLowerCase();
    const isPdf = lower.endsWith(".pdf");
    const isImage = /\.(png|jpe?g|webp|gif)$/.test(lower);

    let userPrompt: string;
    let image: { base64: string; mimeType: string } | undefined;

    try {
      if (isPdf) {
        const clean = await extractPdfText(blob);
        if (clean.length < 30) {
          return { status: "unsupported", message: "A PDF-ből nem sikerült szöveget kinyerni." };
        }
        userPrompt = `Fájl neve: ${file.filename}\n\nTartalom:\n${clean.slice(0, 12000)}`;
      } else if (isImage) {
        userPrompt = `Fájl neve: ${file.filename}. Foglald össze, mit ábrázol.`;
        image = {
          base64: Buffer.from(await blob.arrayBuffer()).toString("base64"),
          mimeType: imageMime(file.filename),
        };
      } else {
        return { status: "unsupported", message: "Csak PDF és kép fájlok összegzése támogatott." };
      }
    } catch (err) {
      return {
        status: "error",
        message: err instanceof Error ? err.message : "A fájl feldolgozása nem sikerült.",
      };
    }

    const { generateText, isAiOutOfCreditError } = await import("@/server/ai-provider.server");

    let summary: string;
    try {
      const result = await generateText({
        provider: resolved.provider,
        apiKey: resolved.apiKey,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        image,
        organizationId: file.organization_id,
        maxTokens: 700,
      });
      summary = result.text.trim();
    } catch (err) {
      if (isAiOutOfCreditError(err)) {
        return { status: "out_of_credit", message: "Elfogyott az AI-kredit, próbáld később" };
      }
      return {
        status: "error",
        message: err instanceof Error ? err.message : "Az AI hívás nem sikerült.",
      };
    }

    if (!summary) return { status: "error", message: "Az AI nem adott vissza összefoglalót." };

    const { error: updateError } = await supabase
      .from("project_files")
      .update({ ai_summary: summary })
      .eq("id", file.id);
    if (updateError) throw updateError;

    return { status: "ok", summary };
  });

/**
 * Suggests a project description + target audience from an uploaded PDF.
 * Returns suggestions only — never writes into the project, so a manually
 * typed description or target audience can never be overwritten silently.
 */
export const suggestProjectFieldsFromFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileId: string }) => {
    if (!input?.fileId) throw new Error("fileId szükséges");
    return { fileId: input.fileId };
  })
  .handler(async ({ data, context }): Promise<SuggestionResult> => {
    const { supabase } = context;

    const { data: file, error: fileError } = await supabase
      .from("project_files")
      .select("id, filename, storage_path, organization_id")
      .eq("id", data.fileId)
      .maybeSingle();
    if (fileError) throw fileError;
    if (!file || !file.storage_path) return { status: "error", message: "A fájl nem található." };
    if (!file.filename.toLowerCase().endsWith(".pdf")) {
      return { status: "unsupported", message: "Csak PDF alapján javaslunk mezőket." };
    }

    const resolved = await getProvider(file.organization_id);
    if (!resolved) return { status: "no_provider", message: "AI-szolgáltató nincs beállítva" };

    const { data: blob, error: downloadError } = await supabase.storage
      .from("project-files")
      .download(file.storage_path);
    if (downloadError || !blob) {
      return { status: "error", message: "A fájl letöltése nem sikerült." };
    }

    let text: string;
    try {
      text = await extractPdfText(blob);
    } catch {
      return { status: "unsupported", message: "A PDF-ből nem sikerült szöveget kinyerni." };
    }
    if (text.length < 30) {
      return { status: "unsupported", message: "A PDF-ből nem sikerült szöveget kinyerni." };
    }

    const { generateText, isAiOutOfCreditError } = await import("@/server/ai-provider.server");

    try {
      const result = await generateText({
        provider: resolved.provider,
        apiKey: resolved.apiKey,
        systemPrompt: SUGGEST_SYSTEM_PROMPT,
        userPrompt: `Fájl neve: ${file.filename}\n\nTartalom:\n${text.slice(0, 12000)}`,
        organizationId: file.organization_id,
        maxTokens: 700,
      });
      const cleaned = result.text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start === -1 || end === -1) return { status: "error", message: "Az AI válasza nem értelmezhető." };
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
        description?: string;
        target_audience?: string;
      };
      return {
        status: "ok",
        description: parsed.description?.trim() || undefined,
        targetAudience: parsed.target_audience?.trim() || undefined,
      };
    } catch (err) {
      if (isAiOutOfCreditError(err)) {
        return { status: "out_of_credit", message: "Elfogyott az AI-kredit, próbáld később" };
      }
      return {
        status: "error",
        message: err instanceof Error ? err.message : "Az AI hívás nem sikerült.",
      };
    }
  });
