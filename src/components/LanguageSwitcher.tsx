import { useT, type Lang } from "@/lib/i18n";

const OPTIONS: Array<{ value: Lang; short: string; label: "header.langHu" | "header.langEn" }> = [
  { value: "hu", short: "HU", label: "header.langHu" },
  { value: "en", short: "EN", label: "header.langEn" },
];

/**
 * Nyelvváltó a fejlécben (HU / EN).
 *
 * Csak a felület nyelvét váltja — az AI által írt tartalom (riportok,
 * email-javaslatok) marad magyar. A választás a böngészőben megmarad.
 */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useT();

  return (
    <div
      role="group"
      aria-label={t("header.language")}
      className={`inline-flex items-center gap-0.5 rounded-full bg-white/10 p-0.5 ring-1 ring-white/15 ${className}`}
    >
      {OPTIONS.map((option) => {
        const active = lang === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setLang(option.value)}
            aria-pressed={active}
            title={t(option.label)}
            className={`flex min-h-9 min-w-9 items-center justify-center rounded-full px-2 text-[11px] font-semibold tracking-wider transition-colors ${
              active
                ? "bg-white/25 text-white shadow-[inset_0_0_0_1px_oklch(1_0_0/32%)]"
                : "text-white/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            {option.short}
            <span className="sr-only"> — {t(option.label)}</span>
          </button>
        );
      })}
    </div>
  );
}
