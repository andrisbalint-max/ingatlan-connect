import { createFileRoute } from "@tanstack/react-router";

import { clampLimit } from "@/lib/agent-rules";
import { agentHandler, fail, json, type AgentContext } from "@/server/agent-api.server";
import {
  PENDING_STATUSES,
  chunk,
  db,
  loadBlocklist,
  type ProspectRow,
} from "@/server/agent-data.server";

const NEEDS = ["domain", "contact", "outreach"] as const;
type Need = (typeof NEEDS)[number];

const PAGE_SIZE = 100;
const MAX_SCANNED = 5000;

interface QueueInfo {
  lastContactAt: string | null;
  inQueueOrSent: boolean;
  step1PendingOrSent: boolean;
}

/** Queue state per prospect: by CRM company and by recipient address. */
async function queueInfo(ctx: AgentContext, prospects: ProspectRow[]) {
  const org = ctx.organizationId;
  const companyIds = [...new Set(prospects.map((p) => p.company_id).filter(Boolean))] as string[];
  const emails = [
    ...new Set(
      prospects.map((p) => (p.decision_maker_email ?? "").trim().toLowerCase()).filter(Boolean),
    ),
  ];

  type Row = {
    company_id: string | null;
    contact_id: string | null;
    follow_up_number: number;
    status: string;
    sent_at: string | null;
  };
  const rows: Row[] = [];
  const companies = new Map<string, { opt_out: boolean; status: string }>();

  for (const ids of chunk(companyIds)) {
    const [queue, crm] = await Promise.all([
      db(ctx)
        .from("emails_queue")
        .select("company_id, contact_id, follow_up_number, status, sent_at")
        .eq("organization_id", org)
        .in("company_id", ids)
        .neq("status", "elvetve"),
      db(ctx)
        .from("companies")
        .select("id, opt_out, status")
        .eq("organization_id", org)
        .in("id", ids),
    ]);
    if (queue.error) throw new Error(queue.error.message);
    if (crm.error) throw new Error(crm.error.message);
    rows.push(...(queue.data ?? []));
    for (const c of crm.data ?? []) companies.set(c.id, { opt_out: c.opt_out, status: c.status });
  }

  // Step-1 emails that went (or are queued) to the same address under any company.
  const contactEmail = new Map<string, string>();
  for (const list of chunk(emails, 50)) {
    const { data, error } = await db(ctx)
      .from("contacts")
      .select("id, email")
      .eq("organization_id", org)
      .in("email", list);
    if (error) throw new Error(error.message);
    for (const c of data ?? []) if (c.email) contactEmail.set(c.id, c.email.toLowerCase());
  }
  const addressRows: Row[] = [];
  for (const ids of chunk([...contactEmail.keys()])) {
    const { data, error } = await db(ctx)
      .from("emails_queue")
      .select("company_id, contact_id, follow_up_number, status, sent_at")
      .eq("organization_id", org)
      .in("contact_id", ids)
      .neq("status", "elvetve");
    if (error) throw new Error(error.message);
    addressRows.push(...(data ?? []));
  }

  const info = new Map<string, QueueInfo>();
  for (const p of prospects) {
    const email = (p.decision_maker_email ?? "").trim().toLowerCase();
    const mine = [
      ...rows.filter((r) => p.company_id && r.company_id === p.company_id),
      ...addressRows.filter(
        (r) => email && r.contact_id && contactEmail.get(r.contact_id) === email,
      ),
    ];
    const sent = mine
      .map((r) => r.sent_at)
      .filter((v): v is string => Boolean(v))
      .sort();
    info.set(p.id, {
      lastContactAt: sent[sent.length - 1] ?? null,
      inQueueOrSent: mine.some(
        (r) =>
          r.status === "elkuldot" || (PENDING_STATUSES as readonly string[]).includes(r.status),
      ),
      step1PendingOrSent: mine.some((r) => r.follow_up_number === 0),
    });
  }
  return { info, companies };
}

export const Route = createFileRoute("/api/public/agent/companies/")({
  server: {
    handlers: {
      GET: agentHandler(
        (request) => `GET /api/public/agent/companies${new URL(request.url).search}`,
        async (ctx, request) => {
          const params = new URL(request.url).searchParams;
          const needRaw = params.get("need");
          if (needRaw && !(NEEDS as readonly string[]).includes(needRaw)) {
            return fail(400, "need must be one of: domain, contact, outreach");
          }
          const need = (needRaw as Need | null) ?? null;
          const category = params.get("category")?.trim() || null;
          const limit = clampLimit(params.get("limit"));
          const blocklist = await loadBlocklist(ctx);

          const items: unknown[] = [];
          for (let from = 0; from < MAX_SCANNED && items.length < limit; from += PAGE_SIZE) {
            let query = db(ctx)
              .from("opten_prospects")
              .select("*")
              .eq("organization_id", ctx.organizationId);
            if (category) query = query.eq("activity_category", category);
            if (need === "domain") query = query.or("domain.is.null,domain.eq.");
            if (need === "contact") {
              query = query
                .not("domain", "is", null)
                .neq("domain", "")
                .is("decision_maker_email", null);
            }
            if (need === "outreach") query = query.not("decision_maker_email", "is", null);

            const { data, error } = await query
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
              .range(from, from + PAGE_SIZE - 1);
            if (error) throw new Error(error.message);
            const page = data ?? [];
            if (page.length === 0) break;

            const { info, companies } = await queueInfo(ctx, page);
            for (const p of page) {
              const q = info.get(p.id);
              const crm = p.company_id ? companies.get(p.company_id) : undefined;
              const email = (p.decision_maker_email ?? "").trim().toLowerCase();
              const blocked = Boolean((email && blocklist.has(email)) || crm?.opt_out);
              if (need === "outreach" && (!email || blocked || q?.step1PendingOrSent)) continue;

              items.push({
                id: p.id,
                name: p.company_name,
                city: p.city,
                category: p.activity_category,
                teaor: p.teaor_code
                  ? { code: p.teaor_code, description: p.teaor_description }
                  : null,
                revenueBand: p.net_revenue_band,
                domain: p.domain || null,
                domainSource: p.domain_source,
                decisionMaker: p.decision_maker_email
                  ? {
                      name: p.decision_maker_name,
                      title: p.decision_maker_position,
                      email: p.decision_maker_email,
                      confidence: p.decision_maker_match_confidence,
                      source: p.decision_maker_source,
                      sourceUrl: p.decision_maker_source_url,
                    }
                  : null,
                agentNote: p.agent_note,
                crm: {
                  promoted: p.promoted_to_crm,
                  companyId: p.company_id,
                  status: crm?.status ?? null,
                  optOut: crm?.opt_out ?? false,
                },
                lastContactAt: q?.lastContactAt ?? null,
                inQueueOrSent: q?.inQueueOrSent ?? false,
                blocked,
              });
              if (items.length >= limit) break;
            }
            if (page.length < PAGE_SIZE) break;
          }

          return json({ need, category, count: items.length, companies: items });
        },
      ),
    },
  },
});
