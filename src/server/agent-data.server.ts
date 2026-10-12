/**
 * Data helpers for the Agent API (/api/public/agent/*). Server-only.
 *
 * Every query is scoped to the API key's organization (ctx.organizationId) and
 * runs with the service-role client handed over by authenticateAgent.
 * Nothing in here sends email, deletes rows or changes settings / users / keys.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";
import type { AgentContext } from "@/server/agent-api.server";

export type Db = SupabaseClient<Database>;
export type ProspectRow = Database["public"]["Tables"]["opten_prospects"]["Row"];

export const db = (ctx: AgentContext) => ctx.db as Db;

/** Email statuses that still count as "in the queue" (not sent, not discarded). */
export const PENDING_STATUSES = ["varakozik", "szerkesztett", "jovahagyva"] as const;
/** Statuses the "Email sor" approval list shows. */
export const AWAITING_APPROVAL_STATUSES = ["varakozik", "szerkesztett"] as const;

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const DOMAIN_RE =
  /^(?=.{1,253}$)(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+[\p{L}]{2,63}$/u;

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Escapes LIKE wildcards so .ilike() works as a case-insensitive equality. */
export function likeExact(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

export function normalizeDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const domain = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")
    .replace(/\.$/, "");
  return DOMAIN_RE.test(domain) ? domain : null;
}

export function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

/** Maps an agent-supplied confidence to the app's decision_maker_match_confidence values. */
export function normalizeConfidence(value: unknown): "magas" | "kozepes" {
  if (typeof value === "number") return value >= 0.75 ? "magas" : "kozepes";
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  return ["magas", "high", "magas biztonság"].includes(text) ? "magas" : "kozepes";
}

export function parseSchedule(value: Json | null | undefined): number[] {
  const raw = Array.isArray(value) ? value : [4, 10, 21];
  return raw
    .map((v) => (typeof v === "number" ? v : parseInt(String(v), 10)))
    .filter((v) => Number.isFinite(v) && v > 0);
}

export function chunk<T>(items: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Start of the given day in Europe/Budapest, as a UTC Date. */
export function budapestDayStart(date: Date = new Date(), dayOffset = 0): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const [y, m, d] = parts.split("-").map(Number) as [number, number, number];
  const utcMidnight = new Date(Date.UTC(y, m - 1, d + dayOffset));
  const asBudapest = new Date(utcMidnight.toLocaleString("en-US", { timeZone: "Europe/Budapest" }));
  const asUtc = new Date(utcMidnight.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(utcMidnight.getTime() - (asBudapest.getTime() - asUtc.getTime()));
}

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/** Reads a query page by page (PostgREST caps a single response at 1000 rows). */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  max = 5000,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await page(from, Math.min(from + pageSize, max) - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export async function getSettings(ctx: AgentContext) {
  const { data, error } = await db(ctx)
    .from("settings")
    .select("daily_email_limit, follow_up_schedule")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Lower-cased blocklisted addresses of the organization. */
export async function loadBlocklist(ctx: AgentContext): Promise<Set<string>> {
  const rows = await fetchAll<{ email: string }>((from, to) =>
    db(ctx)
      .from("email_blocklist")
      .select("email")
      .eq("organization_id", ctx.organizationId)
      .range(from, to),
  );
  return new Set(rows.map((row) => row.email.trim().toLowerCase()));
}

export async function loadProspect(ctx: AgentContext, id: string) {
  const { data, error } = await db(ctx)
    .from("opten_prospects")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function cleanDomain(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

/**
 * Finds the CRM company a found company (prospect) belongs to, without creating
 * anything — same matching order as promoteProspectToCrm (src/lib/opten-promote.ts):
 * linked company_id, then domain, then exact (case-insensitive) name.
 */
export async function findCrmCompanyId(ctx: AgentContext, prospect: ProspectRow) {
  if (prospect.company_id) return prospect.company_id;
  const domain = cleanDomain(prospect.domain);
  if (domain) {
    const { data } = await db(ctx)
      .from("companies")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .ilike("domain", `%${domain}%`)
      .limit(1);
    if (data?.[0]) return data[0].id;
  }
  const { data } = await db(ctx)
    .from("companies")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .ilike("name", likeExact(prospect.company_name))
    .limit(1);
  return data?.[0]?.id ?? null;
}

/**
 * Server-side counterpart of promoteProspectToCrm: makes sure the found company
 * has a CRM companies row and marks the prospect as promoted. No project link is
 * created (the API request has no project context).
 */
export async function ensureCrmCompany(ctx: AgentContext, prospect: ProspectRow) {
  let companyId = await findCrmCompanyId(ctx, prospect);
  if (!companyId) {
    const domain = cleanDomain(prospect.domain);
    const { data, error } = await db(ctx)
      .from("companies")
      .insert({
        organization_id: ctx.organizationId,
        name: prospect.company_name,
        domain: domain || null,
        city: prospect.city,
        industry: prospect.activity_category ?? prospect.teaor_description,
        notes: prospect.teaor_code ? `TEÁOR: ${prospect.teaor_code}` : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    companyId = data.id;
  }
  if (!prospect.promoted_to_crm || prospect.company_id !== companyId) {
    const { error } = await db(ctx)
      .from("opten_prospects")
      .update({ promoted_to_crm: true, company_id: companyId })
      .eq("id", prospect.id);
    if (error) throw new Error(error.message);
  }
  return companyId;
}

/** Reuses the company's contact with this address or creates it. */
export async function ensureContact(
  ctx: AgentContext,
  companyId: string,
  email: string,
  name: string | null,
  position: string | null,
) {
  const { data: existing } = await db(ctx)
    .from("contacts")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("company_id", companyId)
    .ilike("email", likeExact(email))
    .limit(1);
  if (existing?.[0]) return existing[0].id;

  const { data, error } = await db(ctx)
    .from("contacts")
    .insert({
      organization_id: ctx.organizationId,
      company_id: companyId,
      name: name || email,
      email,
      position,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** Contact ids of the organization that use this address (any company). */
export async function contactIdsByEmail(ctx: AgentContext, email: string) {
  const { data, error } = await db(ctx)
    .from("contacts")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .ilike("email", likeExact(email));
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.id);
}
