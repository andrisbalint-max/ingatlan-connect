/**
 * Hibák olvasható leírása a felület felé.
 *
 * Miért kell ez: a szerveroldali hibák eddig csak a puszta üzenetükkel jutottak
 * el a felhasználóhoz (pl. "object is not iterable"), ami nem mondja meg, MELYIK
 * fájl melyik sora dobta. Ez a segédfüggvény a hibatípust és a hívási lánc első
 * néhány elemét is beteszi az üzenetbe, így az admin gombok visszajelzése
 * önmagában elég a hiba behatárolásához — nem kell hozzá szerverlog.
 *
 * Csak admin műveletek visszajelzésében használjuk. Titkos érték nem kerül bele:
 * a verem csak fájlneveket, függvényneveket és sorszámokat tartalmaz.
 */

const MAX_FRAMES = 3;
// Rövid marad, hogy a felugró értesítésben is elolvasható legyen.
const MAX_LENGTH = 400;

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const frames = (error.stack ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("at "))
      .slice(0, MAX_FRAMES)
      .join(" | ");
    const base = `${error.name}: ${error.message}`;
    return (frames ? `${base} — ${frames}` : base).slice(0, MAX_LENGTH);
  }

  if (typeof error === "string") return error.slice(0, MAX_LENGTH);

  // Supabase/PostgREST hibaobjektum: nem Error példány, de van üzenete.
  if (typeof error === "object" && error !== null) {
    const record = error as { message?: unknown; code?: unknown; details?: unknown };
    const parts = [record.code, record.message, record.details]
      .filter((part) => typeof part === "string" && part.length > 0)
      .join(" — ");
    if (parts) return parts.slice(0, MAX_LENGTH);
    try {
      return JSON.stringify(error).slice(0, MAX_LENGTH);
    } catch {
      return "Ismeretlen hiba (nem sorosítható hibaobjektum).";
    }
  }

  return "Ismeretlen hiba.";
}
