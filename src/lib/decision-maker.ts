/**
 * Decision-maker selection heuristic shared by the bulk Hunter search on the
 * "Talált cégek" page and the safety-net search that runs when a project match
 * is approved.
 *
 * Keep DECISION_MAKER_KEYWORDS easy to edit — it is the only place the
 * Hungarian/English title keywords live.
 */

export interface FoundPerson {
  name?: string | null;
  email?: string | null;
  position?: string | null;
  seniority?: string | null;
  department?: string | null;
}

export const DECISION_MAKER_KEYWORDS = [
  // Hungarian
  "ügyvezető",
  "igazgató",
  "tulajdonos",
  "alapító",
  "elnök",
  // English
  "ceo",
  "founder",
  "owner",
  "president",
  "managing director",
];

export type DecisionMakerConfidence = "magas" | "kozepes" | "nincs_talalat";

export interface DecisionMakerPick {
  name: string | null;
  email: string | null;
  position: string | null;
  confidence: DecisionMakerConfidence;
}

function matchesKeyword(person: FoundPerson) {
  const haystack = `${person.position ?? ""} ${person.department ?? ""}`.toLowerCase();
  return DECISION_MAKER_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

/** Picks the most likely decision-maker from Hunter's (already ranked) result list. */
export function pickDecisionMaker(people: FoundPerson[]): DecisionMakerPick {
  const valid = (people ?? []).filter((person) => Boolean(person?.email));
  if (valid.length === 0) {
    return { name: null, email: null, position: null, confidence: "nincs_talalat" };
  }

  const executive = valid.find((person) => (person.seniority ?? "").toLowerCase() === "executive");
  const byKeyword = valid.find(matchesKeyword);
  const senior = valid.find((person) => (person.seniority ?? "").toLowerCase() === "senior");

  const chosen = executive ?? byKeyword ?? senior ?? valid[0]!;
  const highConfidence = Boolean(executive) || (!executive && Boolean(byKeyword));

  return {
    name: chosen.name?.trim() || chosen.email!,
    email: chosen.email!,
    position: chosen.position ?? null,
    confidence: highConfidence ? "magas" : "kozepes",
  };
}

export const CONFIDENCE_LABELS: Record<string, string> = {
  magas: "Magas biztonság",
  kozepes: "Közepes biztonság",
  nincs_talalat: "Nincs találat",
};

export const CONFIDENCE_STYLES: Record<string, string> = {
  magas: "bg-primary/10 text-primary",
  kozepes: "bg-amber-100 text-amber-700",
  nincs_talalat: "bg-muted text-muted-foreground",
};
