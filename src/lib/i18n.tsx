import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Kétnyelvű felület (magyar / angol).
 *
 * Csak a FELÜLET szövegeit fordítja: menük, gombok, címkék, üres állapotok,
 * dátumformátum. Az AI által írt tartalom (riportok, email-javaslatok) marad
 * magyar — azt szándékosan nem érinti ez a modul.
 *
 * A választott nyelv a böngészőben (localStorage) marad meg. Szerveroldali
 * rendereléskor mindig magyarral indulunk, hogy a hidratálás ne törjön el;
 * az angol beállítás az első effektben áll be.
 */

export type Lang = "hu" | "en";

const STORAGE_KEY = "rec-lang";

/** Dátum-/szám-formázáshoz használt locale kódok. */
export const LOCALES: Record<Lang, string> = { hu: "hu-HU", en: "en-GB" };

/** Minden felületi szöveg egy helyen: kulcs -> { hu, en }. */
export const messages = {
  // --- Navigáció ---
  "nav.attekintes": { hu: "Áttekintés", en: "Overview" },
  "nav.emailSor": { hu: "Email sor", en: "Email queue" },
  "nav.crm": { hu: "CRM", en: "CRM" },
  "nav.projektek": { hu: "Projektek", en: "Projects" },
  "nav.talaltCegek": { hu: "Talált cégek", en: "Found companies" },
  "nav.riportok": { hu: "Riportok", en: "Reports" },
  "nav.beallitasok": { hu: "Beállítások", en: "Settings" },
  "nav.felhasznalok": { hu: "Felhasználók", en: "Users" },

  // --- Fejléc ---
  "header.signOut": { hu: "Kijelentkezés", en: "Sign out" },
  "header.openMenu": { hu: "Menü megnyitása", en: "Open menu" },
  "header.closeMenu": { hu: "Menü bezárása", en: "Close menu" },
  "header.language": { hu: "Nyelv", en: "Language" },
  "header.langHu": { hu: "Magyar", en: "Hungarian" },
  "header.langEn": { hu: "Angol", en: "English" },

  // --- Nyitóképernyő ---
  "splash.loading": {
    hu: "Real Estate Connect betöltése",
    en: "Loading Real Estate Connect",
  },
  "splash.tagline": {
    hu: "Ipari ingatlan platform",
    en: "Industrial real estate platform",
  },

  // --- Általános ---
  "common.close": { hu: "Bezárás", en: "Close" },
  "common.dash": { hu: "—", en: "—" },

  // --- Áttekintés: hero ---
  "overview.greetingMorning": { hu: "Jó reggelt", en: "Good morning" },
  "overview.greetingDay": { hu: "Jó napot", en: "Good afternoon" },
  "overview.greetingEvening": { hu: "Jó estét", en: "Good evening" },
  "overview.display": { hu: "Napi áttekintés", en: "Daily overview" },
  "overview.intro": {
    hu: "A mai nap legfontosabb mutatói, a beérkezett válaszok és a futó projektek — egy helyen, egy pillantásra.",
    en: "Today's key numbers, incoming replies and live projects — in one place, at a glance.",
  },

  // --- Áttekintés: KPI ---
  "overview.kpi.pending": { hu: "Email vár jóváhagyásra", en: "Emails awaiting approval" },
  "overview.kpi.sentToday": { hu: "Ma elküldve", en: "Sent today" },
  "overview.kpi.responsesYesterday": { hu: "Válaszok tegnap", en: "Replies yesterday" },
  "overview.kpi.activeProjects": { hu: "Aktív projektek", en: "Active projects" },

  // --- Áttekintés: aktivitás panel ---
  "overview.activity.kicker": { hu: "Aktivitás", en: "Activity" },
  "overview.activity.title": { hu: "Legutóbbi események", en: "Recent activity" },
  "overview.activity.empty": {
    hu: "Még nincs megjeleníthető aktivitás.",
    en: "No activity to show yet.",
  },

  // --- Áttekintés: gyors elérés ---
  "overview.quick.kicker": { hu: "Gyors elérés", en: "Quick access" },
  "overview.quick.title": { hu: "Műveletek", en: "Actions" },
  "overview.quick.foundDesc": {
    hu: "Opten adatbázis és domain-keresés",
    en: "Opten database and domain lookup",
  },
  "overview.quick.reportsDesc": {
    hu: "Napi összegzés és heti riport",
    en: "Daily summary and weekly report",
  },
  "overview.quick.emailQueueDesc": {
    hu: "Jóváhagyásra váró megkeresések",
    en: "Outreach awaiting approval",
  },

  // --- Áttekintés: új válaszok ---
  "overview.responses.title": { hu: "Új válaszok", en: "New replies" },
  "overview.responses.markAll": {
    hu: "Mindet olvasottnak jelölöm",
    en: "Mark all as read",
  },
  "overview.responses.unknownCompany": { hu: "Ismeretlen cég", en: "Unknown company" },
  "overview.responses.processing": { hu: "Feldolgozás alatt", en: "Processing" },

  // --- Válasz-kategóriák ---
  "category.erdeklodes": { hu: "Érdeklődés", en: "Interest" },
  "category.talalkozo": { hu: "Találkozó", en: "Meeting" },
  "category.elutasitas": { hu: "Elutasítás", en: "Rejection" },
  "category.kerdes": { hu: "Kérdés", en: "Question" },
  "category.autovalasz": { hu: "Automatikus válasz", en: "Auto-reply" },

  // --- AI keret / kredit sávok ---
  "ai.outOfCredit": {
    hu: "Elfogyott a(z) {provider} AI-kredit — az automatikus follow-up/riport/projekt-funkciók szünetelnek, amíg fel nem töltöd.",
    en: "The {provider} AI credit has run out — automatic follow-up, report and project features are paused until you top it up.",
  },
  "ai.budgetWarning": {
    hu: "Az AI-használat becsült költsége elérte a havi keret 80%-át — töltsd fel időben az OpenAI/Anthropic egyenleget, hogy ne álljon meg az automatizmus.",
    en: "Estimated AI spend has reached 80% of the monthly budget — top up the OpenAI/Anthropic balance in time so automation keeps running.",
  },
} as const;

export type MessageKey = keyof typeof messages;

type Vars = Record<string, string | number>;

function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  const entry = messages[key];
  let text: string = entry ? (entry[lang] ?? entry.hu) : key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

type LanguageContextValue = {
  lang: Lang;
  locale: string;
  setLang: (next: Lang) => void;
  t: (key: MessageKey, vars?: Vars) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLang(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "hu" || stored === "en") return stored;
  } catch {
    // Privát mód / letiltott tároló: marad az alapértelmezett magyar.
  }
  return "hu";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // SSR-en és az első kliens-renderen mindig magyar, hogy a hidratálás egyezzen.
  const [lang, setLangState] = useState<Lang>("hu");

  useEffect(() => {
    const stored = readStoredLang();
    setLangState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Nem kritikus: csak nem emlékszik rá újratöltés után.
    }
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      locale: LOCALES[lang],
      setLang,
      t: (key, vars) => translate(lang, key, vars),
    }),
    [lang, setLang],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/**
 * Felületi szövegek és a locale elérése.
 *
 * Szándékosan nem dob hibát, ha nincs provider (pl. hibaoldal a fán kívül) —
 * ilyenkor magyarul jelenik meg a szöveg.
 */
export function useT(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (ctx) return ctx;
  return {
    lang: "hu",
    locale: LOCALES.hu,
    setLang: () => {},
    t: (key, vars) => translate("hu", key, vars),
  };
}
