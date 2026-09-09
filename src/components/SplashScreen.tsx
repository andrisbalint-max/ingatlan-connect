import { useEffect, useState } from "react";

import { RecLogo } from "@/components/RecLogo";
import { useT } from "@/lib/i18n";

const TOTAL_MS = 2300;
const REDUCED_MS = 700;

/**
 * Bejelentkezés utáni animált nyitóképernyő.
 *
 * A rendszer saját világoskék színére épül, felírja a "Real Estate Connect"
 * nevet, majd elhalványul és átadja a helyet az Áttekintés oldalnak.
 * Munkamenetenként egyszer fut (a hívó oldal kezeli a sessionStorage-ot).
 *
 * Kattintással vagy bármelyik gombbal átugorható, és tiszteletben tartja a
 * rendszerszintű "csökkentett animáció" beállítást.
 */
export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const { t } = useT();

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    const timer = window.setTimeout(onDone, reduced ? REDUCED_MS : TOTAL_MS);

    // Átugrás: kattintás vagy bármely leütött gomb.
    const skip = () => {
      setLeaving(true);
      window.setTimeout(onDone, 180);
    };
    window.addEventListener("keydown", skip, { once: true });

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", skip);
    };
  }, [onDone]);

  return (
    <div
      role="status"
      aria-label={t("splash.loading")}
      onClick={() => {
        setLeaving(true);
        window.setTimeout(onDone, 180);
      }}
      className={`fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-primary ${
        leaving ? "opacity-0 transition-opacity duration-200" : "rec-splash-out"
      }`}
      style={{
        backgroundImage:
          "radial-gradient(circle at 30% 20%, oklch(0.72 0.1 195 / 85%), transparent 55%), radial-gradient(circle at 75% 80%, oklch(0.55 0.1 215 / 75%), transparent 60%)",
      }}
    >
      <div className="flex flex-col items-center px-6 text-center">
        <div className="relative mb-7 flex size-24 items-center justify-center">
          <span
            aria-hidden
            className="rec-pulse-ring absolute inset-0 rounded-full border border-white/60"
          />
          <span
            aria-hidden
            className="rec-pulse-ring absolute inset-0 rounded-full border border-white/40"
            style={{ animationDelay: "800ms" }}
          />
          {/* Beépített SVG embléma — nem képfájlból jön, ezért mindig megjelenik. */}
          <RecLogo size={96} className="rec-word-in size-24" title="" />
        </div>

        <h1 className="flex flex-wrap items-baseline justify-center gap-x-3 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
          <span className="rec-word-in" style={{ animationDelay: "120ms" }}>
            Real
          </span>
          <span className="rec-word-in" style={{ animationDelay: "260ms" }}>
            Estate
          </span>
          <span className="rec-word-in font-bold text-white" style={{ animationDelay: "400ms" }}>
            Connect
          </span>
        </h1>

        <p
          className="rec-word-in mt-3 text-sm text-white/85 sm:text-base"
          style={{ animationDelay: "560ms" }}
        >
          {t("splash.tagline")}
        </p>

        <div className="mt-8 h-0.5 w-48 overflow-hidden rounded-full bg-white/25">
          <div className="rec-sweep h-full w-full bg-white/90" />
        </div>
      </div>
    </div>
  );
}
