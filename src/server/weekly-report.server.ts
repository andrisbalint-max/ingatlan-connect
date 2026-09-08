/**
 * "weekly-report" core logic (server-only).
 *
 * Runs a weekly Hungarian industrial real estate market + partner-movement
 * report for one organization: two rounds of web search (general market /
 * government / regulation / development news, then a per-partner check for
 * companies already promoted to the CRM) -> one synthesized ~2 A4 page
 * Hungarian markdown report -> a single market_reports row
 * (report_type = 'heti_osszefoglalo').
 *
 * Intended to run every Monday, summarizing the previous Monday-Sunday week.
 *
 * COST NOTE: this makes 1 general web-search call, up to PARTNER_CHECK_CAP
 * per-partner web-search calls, and 1 non-search synthesis call per
 * organization per week. Keep this in mind when checking the AI bill —
 * lower PARTNER_CHECK_CAP if costs run higher than expected.
 */

import {
  generateText,
  generateTextWithWebSearch,
  isAiOutOfCreditError,
  resolveAiProvider,
} from "@/server/ai-provider.server";

/** Easily editable general-search query list. */
const WEEKLY_QUERIES = (year: number) => [
  `ipari ingatlan piac Magyarország hírek ${year}`,
  "ipari ingatlan Magyarország kormányzati szabályozás",
  "ipari park fejlesztés Magyarország bejelentés",
  "logisztikai csarnok bérlet Magyarország aláírás",
  "CBRE Magyarország ipari ingatlan piaci jelentés",
  "JLL Magyarország ipari ingatlan piaci elemzés",
  "Cushman & Wakefield Magyarország ipari ingatlan",
  "KSH ipari termelés statisztika",
  "HIPA befektetés ipari csarnok Magyarország",
];

/**
 * Legfeljebb ennyi, már CRM-be emelt ("valódi") partnert ellenőrzünk
 * hetente, egyenként külön web-kereséssel — ez a fő költségtényező, ezért
 * van felső korlátja. Ha többre van szükség, itt emeld meg.
 */
const PARTNER_CHECK_CAP = 15;

const SEARCH_SYSTEM_PROMPT = [
  "Magyar ipari ingatlanpiaci hírfigyelő asszisztens vagy.",
  "Web keresés segítségével keresd meg az ELMÚLT 7 NAPBAN megjelent, magyar",
  "ipari/logisztikai ingatlanpiachoz kapcsolódó nyilvános információkat:",
  "piaci híreket és jelentéseket, állami/kormányzati információkat és",
  "szabályozási változásokat, új fejlesztéseket (pl. új csarnok, park,",
  "beruházás bejelentése), érdekes szakmai cikkeket, és nyilvánosan",
  "bejelentett aláírásokat/megállapodásokat (pl. bérleti szerződés,",
  "befektetés).",
  'Válaszod KIZÁRÓLAG JSON tömb legyen: [{"category":"piac|szabalyozas|fejlesztes|cikk|alairas","title":"...","source_name":"...","source_url":"https://...","takeaway":"1-2 mondatos magyar összefoglaló"}].',
  "Csak valóban létező, a keresésben megtalált URL-eket adj vissza — soha ne",
  "találj ki forrást vagy adatot. Legfeljebb 15 tételt adj vissza, a",
  "legrelevánsabbakat. Ha nincs találat, adj vissza üres tömböt.",
].join(" ");

const PARTNER_SYSTEM_PROMPT = [
  "Magyar üzleti hírfigyelő asszisztens vagy. Web keresés segítségével",
  "ellenőrizd, van-e nyilvánosan elérhető, hiteles forrásból származó hír",
  "VAGY esemény az ELMÚLT 7 NAPBÓL a megadott magyarországi céggel",
  "kapcsolatban (pl. új szerződés, bővítés, beruházás, vezetőváltás, egyéb",
  "üzleti mozgás).",
  'Válaszod KIZÁRÓLAG JSON objektum legyen: {"found":true|false,"summary":"1-2 mondatos magyar összefoglaló, csak ha found=true, egyébként null","source_url":"https://... vagy null"}.',
  "Ha nincs releváns, friss, hiteles találat, adj vissza",
  '{"found":false,"summary":null,"source_url":null} — soha ne találj ki adatot.',
].join(" ");

const SYNTHESIS_SYSTEM_PROMPT = [
  "Magyar ipari ingatlanpiaci elemző vagy, aki anyanyelvi szinten,",
  "kifogástalan magyar nyelvtannal ír. A megadott, már összegyűjtött",
  "tényanyagból (JSON) írj egy kb. 2 A4 oldal terjedelmű (kb. 700-900 szavas)",
  "magyar nyelvű heti riportot egy ipari ingatlanos bróker csapat számára.",
  "",
  "NYELVI ELVÁRÁSOK (kötelező):",
  "- Helyes magyar nyelvtan, egyeztetés, szórend és toldalékolás.",
  "- NE fordíts szó szerint angolból; magyar szakmai terminológiát használj",
  "  (pl. 'bérbeadás', 'üresedési arány', 'bérleti díj', 'raktárkapacitás',",
  "  'hozamszint'). Angol kifejezést csak akkor hagyj benne, ha nincs bevett",
  "  magyar megfelelője, és akkor is magyarázd meg zárójelben.",
  "- Teljes, gördülékeny mondatok, bekezdésekbe szervezve; kerüld a darabos,",
  "  tőmondatos, gépi fordítás hatását keltő szöveget.",
  "- Tárgyilagos, tényközlő hangnem, marketingszöveg és felsőfok nélkül.",
  "",
  "TARTALMI ELVÁRÁSOK:",
  "- NE keress új információt, NE találj ki semmit — kizárólag a megadott",
  "  tényeket dolgozd fel.",
  "- Számot vagy adatot csak akkor írj, ha a tényanyagban explicit szerepel.",
  "- Ahol van forrás URL, tedd ki markdown linkként: [forrás](URL).",
  "- Ha a bemeneti tényanyag üres vagy nagyon kevés, írj erről egy rövid,",
  "  őszinte megjegyzést ahelyett, hogy kitalálnál tartalmat.",
  "",
  "FORMÁTUM: markdown, '## ' alcímekkel. Az alábbi szekciókból CSAK azokat",
  "használd, amikhez ténylegesen van tartalom: 'Piaci áttekintés',",
  "'Szabályozás és állami hírek', 'Fejlesztések', 'Partnerek mozgása',",
  "'Egyéb érdekességek'.",
].join("\n");

export interface WeeklyReportOrgResult {
  organizationId: string;
  status: "ok" | "no_provider" | "out_of_credit" | "error";
  itemsFound: number;
  partnersChecked: number;
  partnerMovementsFound: number;
  message?: string;
}

interface FoundItem {
  category?: string;
  title?: string;
  source_name?: string;
  source_url?: string;
  takeaway?: string;
}

interface PartnerFinding {
  companyName: string;
  domain: string | null;
  summary: string;
  sourceUrl: string | null;
}

interface PartnerRow {
  company_name: string;
  domain: string | null;
  city: string | null;
}

type SettingsRow = {
  organization_id: string;
  openai_api_key: string | null;
  anthropic_api_key: string | null;
  preferred_ai_provider: string | null;
};

function parseJson<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const arrStart = cleaned.indexOf("[");
  const objStart = cleaned.indexOf("{");
  const useArray = arrStart !== -1 && (objStart === -1 || arrStart < objStart);
  const start = useArray ? arrStart : objStart;
  const end = useArray ? cleaned.lastIndexOf("]") : cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return
