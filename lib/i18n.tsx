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

  // --- Általános (több oldalon) ---
  "common.close": { hu: "Bezárás", en: "Close" },
  "common.dash": { hu: "—", en: "—" },
  "common.cancel": { hu: "Mégse", en: "Cancel" },
  "common.save": { hu: "Mentés", en: "Save" },
  "common.search": { hu: "Keresés", en: "Search" },
  "common.all": { hu: "Mind", en: "All" },
  "common.notSet": { hu: "Nincs megadva", en: "Not set" },

  // --- CRM ---
  "crm.kicker": { hu: "Ügyfélkapcsolatok", en: "Client relationships" },
  "crm.description": {
    hu: "Cégek, kapcsolattartók és kontaktkeresés.",
    en: "Companies, contacts and contact lookup.",
  },
  "crm.newCompany": { hu: "Új cég", en: "New company" },
  "crm.searchPlaceholder": {
    hu: "Keresés cégnév vagy domain szerint…",
    en: "Search by company name or domain…",
  },
  "crm.filter.status": { hu: "Státusz", en: "Status" },
  "crm.filter.allStatus": { hu: "Minden státusz", en: "All statuses" },
  "crm.filter.industry": { hu: "Iparág", en: "Industry" },
  "crm.filter.allIndustry": { hu: "Minden iparág", en: "All industries" },
  "crm.status.reagalt": { hu: "Reagált", en: "Responded" },
  "crm.status.varakozik": { hu: "Várakozik", en: "Pending" },
  "crm.status.nincsValasz": { hu: "Nincs válasz", en: "No reply" },
  "crm.status.valaszolt": { hu: "Válaszolt", en: "Replied" },
  "crm.status.erdeklodik": { hu: "Érdeklődik", en: "Interested" },
  "crm.status.lezarva": { hu: "Lezárva", en: "Closed" },
  "crm.empty.filtered": {
    hu: "Nincs a szűrésnek megfelelő cég.",
    en: "No company matches the filter.",
  },
  "crm.empty.none": { hu: "Még egy cég sincs felvéve.", en: "No companies added yet." },
  "crm.empty.hint": {
    hu: "Vedd fel az első céget az „Új cég” gombbal.",
    en: "Add the first company with the “New company” button.",
  },
  "crm.noIndustryCity": {
    hu: "Nincs megadva iparág vagy város",
    en: "No industry or city set",
  },
  "crm.noContact": { hu: "Nincs kapcsolattartó", en: "No contact person" },
  "crm.lastActivity": { hu: "Utolsó aktivitás: {date}", en: "Last activity: {date}" },
  "crm.noActivity": { hu: "Nincs aktivitás", en: "No activity" },
  "crm.optedOut": { hu: "Leiratkozott", en: "Unsubscribed" },
  "crm.dialog.description": {
    hu: "Vedd fel kézzel a cég alapadatait.",
    en: "Add the company's basic details manually.",
  },
  "crm.field.name": { hu: "Cégnév", en: "Company name" },
  "crm.field.city": { hu: "Város", en: "City" },
  "crm.field.notes": { hu: "Megjegyzések", en: "Notes" },
  "crm.saveCompany": { hu: "Cég mentése", en: "Save company" },
  "crm.toast.created": { hu: "Cég létrehozva.", en: "Company created." },
  "crm.error.noProfile": { hu: "Nincs betöltve a profil.", en: "Profile is not loaded." },

  // --- Email sor ---
  "emailQueue.description": {
    hu: "Jóváhagyásra váró megkereső emailek és a kiküldési napló.",
    en: "Outreach emails awaiting approval, and the send log.",
  },
  "emailQueue.status.varakozik": { hu: "Várakozik", en: "Pending" },
  "emailQueue.status.szerkesztett": { hu: "Szerkesztett", en: "Edited" },
  "emailQueue.status.jovahagyva": { hu: "Jóváhagyva", en: "Approved" },
  "emailQueue.status.elkuldot": { hu: "Elküldve", en: "Sent" },
  "emailQueue.status.elvetve": { hu: "Elvetve", en: "Discarded" },
  "emailQueue.toast.approved": { hu: "Email jóváhagyva.", en: "Email approved." },
  "emailQueue.toast.discarded": { hu: "Email elvetve.", en: "Email discarded." },
  "emailQueue.toast.statusUpdated": { hu: "Állapot frissítve.", en: "Status updated." },
  "emailQueue.toast.saved": { hu: "Módosítások mentve.", en: "Changes saved." },
  "emailQueue.banner.outlook": {
    hu: "Outlook nincs bekötve — a jóváhagyott emailek egyelőre nem lesznek automatikusan kiküldve.",
    en: "Outlook is not connected — approved emails will not be sent automatically yet.",
  },
  "emailQueue.banner.close": { hu: "Banner bezárása", en: "Close banner" },
  "emailQueue.waitingCount": {
    hu: "{count} email vár jóváhagyásra",
    en: "{count} emails awaiting approval",
  },
  "emailQueue.approveAll": { hu: "Mindet jóváhagyom", en: "Approve all" },
  "emailQueue.empty": {
    hu: "Nincs jóváhagyásra váró email a sorban.",
    en: "No emails are awaiting approval.",
  },
  "emailQueue.field.why": { hu: "Miért ő", en: "Why them" },
  "emailQueue.field.whyPlaceholder": {
    hu: "Pl. Tavaly 5.000 m²-t béreltek",
    en: "e.g. They leased 5,000 sqm last year",
  },
  "emailQueue.field.subject": { hu: "Tárgy", en: "Subject" },
  "emailQueue.field.body": { hu: "Szöveg", en: "Body" },
  "emailQueue.accept": { hu: "Elfogadás", en: "Accept" },
  "emailQueue.approve": { hu: "Jóváhagyás", en: "Approve" },
  "emailQueue.edit": { hu: "Szerkesztés", en: "Edit" },
  "emailQueue.sentTitle": { hu: "Kiküldött emailek", en: "Sent emails" },
  "emailQueue.table.recipient": { hu: "Címzett", en: "Recipient" },
  "emailQueue.table.status": { hu: "Állapot", en: "Status" },
  "emailQueue.table.date": { hu: "Dátum", en: "Date" },
  "emailQueue.table.empty": {
    hu: "Még nincs feldolgozott email.",
    en: "No processed emails yet.",
  },

  // --- Cég részletek panel ---
  "company.description": {
    hu: "Cégadatok, kapcsolattartók és kontaktkeresés.",
    en: "Company details, contacts and contact lookup.",
  },
  "company.section.data": { hu: "Cégadatok", en: "Company details" },
  "company.section.contacts": { hu: "Kapcsolattartók", en: "Contacts" },
  "company.section.hunter": { hu: "Kontakt keresés Hunterrel", en: "Contact lookup with Hunter" },
  "company.section.emails": { hu: "Email előzmények", en: "Email history" },
  "company.section.responses": { hu: "Válaszok", en: "Replies" },
  "company.optOutHint": { hu: "Ne írjunk neki többé.", en: "Do not contact again." },
  "company.newContact": { hu: "Új kontakt", en: "New contact" },
  "company.saveContact": { hu: "Kontakt mentése", en: "Save contact" },
  "company.saveSelected": { hu: "Kiválasztottak mentése", en: "Save selected" },
  "company.contactsEmpty": {
    hu: "Még nincs kapcsolattartó — add hozzá kézzel vagy keress Hunterrel.",
    en: "No contacts yet — add one manually or look them up with Hunter.",
  },
  "company.emailsPlaceholder": {
    hu: "Az email előzmények az Email sor modul elkészülte után jelennek meg itt.",
    en: "Email history will appear here once the Email queue module is complete.",
  },
  "company.responsesEmpty": {
    hu: "Ehhez a céghez még nem érkezett válasz.",
    en: "No replies from this company yet.",
  },
  "company.field.position": { hu: "Pozíció", en: "Position" },
  "company.field.contactName": { hu: "Név", en: "Name" },
  "company.toast.saved": { hu: "Cégadatok mentve.", en: "Company details saved." },
  "company.toast.optOut": {
    hu: "Leiratkozási állapot frissítve.",
    en: "Unsubscribe status updated.",
  },
  "company.toast.contactAdded": { hu: "Kapcsolattartó hozzáadva.", en: "Contact added." },
  "company.toast.contactUpdated": { hu: "Kapcsolattartó frissítve.", en: "Contact updated." },
  "company.toast.contactDeleted": { hu: "Kapcsolattartó törölve.", en: "Contact deleted." },
  "company.toast.selectedSaved": {
    hu: "Kiválasztott kontaktok mentve.",
    en: "Selected contacts saved.",
  },
  "company.hunter.noResult": {
    hu: "A keresés nem hozott eredményt.",
    en: "The search returned no results.",
  },
  "company.hunter.noContact": {
    hu: "A Hunter nem talált kontaktot ehhez a domainhez.",
    en: "Hunter found no contact for this domain.",
  },
  "company.error.noneSelected": {
    hu: "Nincs kiválasztott kontakt.",
    en: "No contact is selected.",
  },
  "common.loading": { hu: "Betöltés…", en: "Loading…" },
  "common.delete": { hu: "Törlés", en: "Delete" },

  // --- Nyitóképernyő ---
  "splash.loading": {
    hu: "Real Estate Connect betöltése",
    en: "Loading Real Estate Connect",
  },
  "splash.tagline": {
    hu: "Ipari ingatlan platform",
    en: "Industrial real estate platform",
  },

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
