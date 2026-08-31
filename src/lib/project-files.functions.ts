import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface SummarizeResult {
  status: "ok" | "no_api_key" | "unsupported" | "error";
  message?: string;
  summary?: string;
}

/**
 * Generates a short Hungarian AI summary for an uploaded project file
 * (PDF text extraction or image vision) using the organization's OpenAI key.
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

    const { data: settings, error: settingsError } = await supabase
      .from("settings")
      .select("openai_api_key")
      .eq("organization_id", file.organization_id)
      .maybeSingle();
    if (settingsError) throw settingsError;

    const apiKey = (settings?.openai_api_key ?? "").trim();
    if (!apiKey) {
      return { status: "no_api_key", message: "Nincs beállítva OpenAI API kulcs a Beállításokban." };
    }

    const { data: blob, error: downloadError } = await supabase.storage
      .from("project-files")
      .download(file.storage_path);
    if (downloadError || !blob) {
      return { status: "error", message: downloadError?.message ?? "A fájl letöltése nem sikerült." };
    }

    const lower = file.filename.toLowerCase();
    const isPdf = lower.endsWith(".pdf");
    const isImage = /\.(png|jpe?g|webp|gif)$/.test(lower);

    let messages: unknown[];

    try {
      if (isPdf) {
        const { extractText, getDocumentProxy } = await import("unpdf");
        const buffer = new Uint8Array(await blob.arrayBuffer());
        const pdf = await getDocumentProxy(buffer);
        const { text } = await extractText(pdf, { mergePages: true });
        const clean = (Array.isArray(text) ? text.join("\n") : text).trim();
        if (clean.length < 30) {
          return { status: "unsupported", message: "A PDF-ből nem sikerült szöveget kinyerni." };
        }
        messages = [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Fájl neve: ${file.filename}\n\nTartalom:\n${clean.slice(0, 12000)}`,
          },
        ];
      } else if (isImage) {
        const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
        const mime = lower.endsWith(".png")
          ? "image/png"
          : lower.endsWith(".webp")
            ? "image/webp"
            : lower.endsWith(".gif")
              ? "image/gif"
              : "image/jpeg";
        messages = [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `Fájl neve: ${file.filename}. Foglald össze, mit ábrázol.` },
              { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
            ],
          },
        ];
      } else {
        return { status: "unsupported", message: "Csak PDF és kép fájlok összegzése támogatott." };
      }
    } catch (err) {
      return {
        status: "error",
        message: err instanceof Error ? err.message : "A fájl feldolgozása nem sikerült.",
      };
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.3, messages }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { status: "error", message: `OpenAI ${response.status}: ${text.slice(0, 200)}` };
    }

    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const summary = (json.choices?.[0]?.message?.content ?? "").trim();
    if (!summary) {
      return { status: "error", message: "Az OpenAI nem adott vissza összefoglalót." };
    }

    const { error: updateError } = await supabase
      .from("project_files")
      .update({ ai_summary: summary })
      .eq("id", file.id);
    if (updateError) throw updateError;

    return { status: "ok", summary };
  });

const SYSTEM_PROMPT =
  "Ipari ingatlan projektdokumentumokat összegző magyar asszisztens vagy. Írj rövid (3-5 mondat), tárgyilagos magyar összefoglalót, kiemelve a méreteket, helyszínt, bérleti/műszaki paramétereket, ha szerepelnek. Csak az összefoglalót add vissza.";
