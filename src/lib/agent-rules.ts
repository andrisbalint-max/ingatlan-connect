/** Pure business rules for the Claude-agent mode and Agent API (client + server safe). */

export const AGENT_PROVIDER = "claude_agents";

export function isAgentMode(preferredProvider: string | null | undefined) {
  return preferredProvider === AGENT_PROVIDER;
}

export const UNSUBSCRIBE_FOOTER =
  "Ha nem szeretne több levelet kapni tőlünk, kérjük, válaszoljon a „leiratkozás” szóval.";

/** Appends the unsubscribe footer once (HTML body). */
export function withUnsubscribeFooter(body: string) {
  if (body.includes(UNSUBSCRIBE_FOOTER)) return body;
  return `${body}<br><br><span style="font-size:12px;color:#777">${UNSUBSCRIBE_FOOTER}</span>`;
}

export const RATE_LIMIT_PER_MINUTE = 60;
export const MAX_COMPANIES_LIMIT = 50;

export function clampLimit(raw: string | null, fallback = 20, max = MAX_COMPANIES_LIMIT) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return Math.min(fallback, max);
  return Math.min(Math.floor(n), max);
}

/** API step (1 = first email) <-> stored follow_up_number (0 = first email). */
export const stepToFollowUpNumber = (step: number) => step - 1;
export const followUpNumberToStep = (n: number) => n + 1;

export const REPLY_CATEGORIES = [
  "érdeklődik",
  "később",
  "nem releváns",
  "leiratkozás",
  "visszapattant",
  "egyéb",
] as const;
export type ReplyCategory = (typeof REPLY_CATEGORIES)[number];

export const REPORT_TYPE_MAP: Record<string, string> = {
  napi: "napi_osszefoglalo",
  heti: "heti_osszefoglalo",
  piaci: "napi_piaci_hir",
};

/** Domain/decision-maker sources a non-forced agent write must not overwrite. */
export function isProtectedSource(source: string | null | undefined) {
  return source === "kezi" || source === "opten_excel";
}

/**
 * Which follow-up step is due for a sent email, or null.
 * schedule[i] = days after the previous sent email before step i+2 is due.
 */
export function dueFollowUpStep(
  lastSentStep: number,
  sentAt: Date,
  schedule: number[],
  now: Date,
): number | null {
  const nextStep = lastSentStep + 1;
  const days = schedule[nextStep - 2];
  if (days == null || nextStep > 3) return null;
  const elapsed = (now.getTime() - sentAt.getTime()) / 86_400_000;
  return elapsed >= days ? nextStep : null;
}
