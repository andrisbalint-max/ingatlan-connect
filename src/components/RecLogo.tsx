import { useId } from "react";

/**
 * A Real Estate Connect embléma — fényes, kör alakú "érme" a REC monogrammal.
 *
 * Szándékosan beépített (inline) SVG, nem a `public/` mappából betöltött fájl:
 * így nem kell képfájlt feltölteni, a logó a kóddal együtt érkezik, és
 * azonnal megjelenik. Tiszta vektor — minden méretben éles, ~11 KB.
 *
 * A gradiensek azonosítói `useId()`-vel névtérbe kerülnek, ezért a komponens
 * több példányban is használható egy oldalon (fejléc + hero + nyitóképernyő).
 */
export function RecLogo({
  size = 40,
  className,
  title = "Real Estate Connect",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  // Üres cím = pusztán díszítő példány (pl. amikor a név ott van mellette),
  // ilyenkor a képernyőolvasó átlépi.
  const decorative = title.length === 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : title}
      className={className}
    >
      <g transform="translate(128 128) scale(1.28)">
      <defs>
      <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor="#0B3A47"/>
      <stop offset="52%"  stopColor="#1D6072"/>
      <stop offset="78%"  stopColor="#8FA9A6"/>
      <stop offset="100%" stopColor="#E8C489"/>
      </linearGradient>
      <linearGradient id={`faceL-${uid}`} x1="0" y1="0" x2="1" y2="0.25">
      <stop offset="0%"   stopColor="#123946"/>
      <stop offset="60%"  stopColor="#1B4E5D"/>
      <stop offset="100%" stopColor="#26697C"/>
      </linearGradient>
      <linearGradient id={`faceR-${uid}`} x1="0" y1="0" x2="1" y2="0.2">
      <stop offset="0%"   stopColor="#7FA7B2"/>
      <stop offset="22%"  stopColor="#C9DCE1"/>
      <stop offset="46%"  stopColor="#8FB3BD"/>
      <stop offset="72%"  stopColor="#B9D2D9"/>
      <stop offset="100%" stopColor="#6E96A2"/>
      </linearGradient>
      <linearGradient id={`cap-${uid}`} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stopColor="#E8F2F4"/>
      <stop offset="55%"  stopColor="#9DBCC4"/>
      <stop offset="100%" stopColor="#D9E8EB"/>
      </linearGradient>
      <linearGradient id={`glass-${uid}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor="#FFE9B8"/>
      <stop offset="38%"  stopColor="#F5A83C"/>
      <stop offset="72%"  stopColor="#E07A1E"/>
      <stop offset="100%" stopColor="#FFD98F"/>
      </linearGradient>
      <linearGradient id={`ground-${uid}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor="#2B4650"/>
      <stop offset="45%"  stopColor="#15303A"/>
      <stop offset="100%" stopColor="#0A2028"/>
      </linearGradient>
      <linearGradient id={`refl-${uid}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor="#F5A83C" stopOpacity="0.55"/>
      <stop offset="100%" stopColor="#F5A83C" stopOpacity="0"/>
      </linearGradient>
      <linearGradient id={`ring-${uid}`} x1="0.05" y1="0" x2="0.95" y2="1">
      <stop offset="0%"   stopColor="#F7E9BC"/>
      <stop offset="26%"  stopColor="#C99F45"/>
      <stop offset="48%"  stopColor="#8E6B24"/>
      <stop offset="70%"  stopColor="#E3CE92"/>
      <stop offset="100%" stopColor="#A87F2C"/>
      </linearGradient>
      <linearGradient id={`gloss-${uid}`} x1="0.1" y1="0" x2="0.75" y2="1">
      <stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.55"/>
      <stop offset="42%"  stopColor="#FFFFFF" stopOpacity="0.10"/>
      <stop offset="60%"  stopColor="#FFFFFF" stopOpacity="0"/>
      </linearGradient>
      <radialGradient id={`vig-${uid}`} cx="0.5" cy="0.42" r="0.62">
      <stop offset="55%"  stopColor="#000000" stopOpacity="0"/>
      <stop offset="100%" stopColor="#000814" stopOpacity="0.55"/>
      </radialGradient>
      <clipPath id={`disc-${uid}`}>
      <circle cx="0" cy="0" r="86"/>
      </clipPath>
      <linearGradient id={`plate-${uid}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor="#062028" stopOpacity="0.72"/>
      <stop offset="55%"  stopColor="#04161D" stopOpacity="0.94"/>
      <stop offset="100%" stopColor="#031015" stopOpacity="0.99"/>
      </linearGradient>
      <linearGradient id={`rec-${uid}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor="#FBEFC6"/>
      <stop offset="45%"  stopColor="#D9B45C"/>
      <stop offset="100%" stopColor="#A57F2E"/>
      </linearGradient>
      </defs>
      <g clipPath={`url(#disc-${uid})`}>
      <rect x="-86" y="-86" width="172" height="172" fill={`url(#sky-${uid})`}/>
      <rect x="-86" y="30" width="172" height="56" fill={`url(#ground-${uid})`}/>
      <path d="M -86 30 L -54 12 L -30 24 L -8 8 L 16 22 L 44 10 L 70 24 L 86 16 L 86 30 Z"
      fill="#0E3341" opacity="0.5"/>
      <path d="M 44 -6 L 88 4 L 88 30 L 44 30 Z" fill="#5C8290"/>
      <path d="M 44 -6 L 88 4 L 88 8 L 44 -1 Z" fill={`url(#cap-${uid})`}/>
      <g fill="#16333D" opacity="0.85">
      <path d="M 52 14 L 64 17 L 64 30 L 52 30 Z"/>
      <path d="M 70 19 L 82 22 L 82 30 L 70 30 Z"/>
      </g>
      <path d="M 0 -46 L -62 -24 L -62 24 L 0 42 Z" fill={`url(#faceL-${uid})`}/>
      <g stroke="#0C2C36" strokeWidth="1.1" opacity="0.42">
      <line x1="-10" y1="-42" x2="-10" y2="39"/>
      <line x1="-22" y1="-38" x2="-22" y2="36"/>
      <line x1="-33" y1="-34" x2="-33" y2="33"/>
      <line x1="-43" y1="-30" x2="-43" y2="30"/>
      <line x1="-52" y1="-27" x2="-52" y2="27"/>
      </g>
      <path d="M 0 -46 L 56 -22 L 56 26 L 0 42 Z" fill={`url(#faceR-${uid})`}/>
      <g stroke="#5C8B97" strokeWidth="1.1" opacity="0.5">
      <line x1="12" y1="-41" x2="12" y2="38"/>
      <line x1="24" y1="-36" x2="24" y2="34"/>
      <line x1="35" y1="-31" x2="35" y2="31"/>
      <line x1="46" y1="-27" x2="46" y2="28"/>
      </g>
      <path d="M 0 -40 L -26 -31 L -26 30 L 0 38 Z" fill={`url(#glass-${uid})`} opacity="0.96"/>
      <path d="M 0 -40 L 24 -30 L 24 30 L 0 38 Z" fill={`url(#glass-${uid})`}/>
      <g stroke="#0D2A33" strokeWidth="1.3" opacity="0.7">
      <line x1="0" y1="-40" x2="0" y2="38"/>
      <line x1="-13" y1="-35" x2="-13" y2="34"/>
      <line x1="12" y1="-35" x2="12" y2="34"/>
      <line x1="-26" y1="-14" x2="24" y2="-12"/>
      <line x1="-26" y1="6" x2="24" y2="8"/>
      </g>
      <path d="M -24 26 L -6 -33 L 2 -33 L -16 28 Z" fill="#FFFFFF" opacity="0.22"/>
      <path d="M 6 28 L 18 -30 L 21 -30 L 10 29 Z" fill="#FFFFFF" opacity="0.16"/>
      <path d="M 0 -46 L -62 -24 L -62 -18 L 0 -40 Z" fill={`url(#cap-${uid})`}/>
      <path d="M 0 -46 L 56 -22 L 56 -16 L 0 -40 Z" fill={`url(#cap-${uid})`}/>
      <path d="M 0 -46 L -62 -24 L -62 -25.6 L 0 -47.6 Z" fill="#FFFFFF" opacity="0.85"/>
      <path d="M 0 -46 L 56 -22 L 56 -23.6 L 0 -47.6 Z" fill="#FFFFFF" opacity="0.7"/>
      <path d="M -26 30 L 24 30 L 20 62 L -22 62 Z" fill={`url(#refl-${uid})`}/>
      <rect x="-86" y="29" width="172" height="1.4" fill="#9FC3CB" opacity="0.45"/>
      <rect x="-86" y="-86" width="172" height="172" fill={`url(#vig-${uid})`}/>
      <rect x="-86" y="-86" width="172" height="172" fill={`url(#gloss-${uid})`}/>
      </g>
      <g clipPath={`url(#disc-${uid})`}>
      <rect x="-86" y="46" width="172" height="40" fill={`url(#plate-${uid})`}/>
      <rect x="-86" y="46" width="172" height="1.5" fill="#D8B45A" opacity="0.85"/>
      <g transform="translate(-32.18 75)">
      <path d="M6.345 -8.802 12.015 0.0H16.578L10.422 -8.802ZM2.052 -18.9V0.0H5.913V-18.9ZM4.401 -15.606H8.154Q9.18 -15.606 9.9225 -15.2685Q10.665 -14.931 11.07 -14.296499999999998Q11.475 -13.661999999999999 11.475 -12.770999999999999Q11.475 -11.879999999999999 11.07 -11.2455Q10.665 -10.611 9.9225 -10.2735Q9.18 -9.936 8.154 -9.936H4.401V-6.858H8.397Q10.638 -6.858 12.204 -7.613999999999999Q13.77 -8.37 14.607 -9.7335Q15.443999999999999 -11.097 15.443999999999999 -12.879Q15.443999999999999 -14.688 14.607 -16.038Q13.77 -17.387999999999998 12.204 -18.144Q10.638 -18.9 8.397 -18.9H4.401ZM27.775999999999996 0.0H37.307V-3.267H27.775999999999996ZM27.775999999999996 -15.633H37.307V-18.9H27.775999999999996ZM27.775999999999996 -8.424H36.766999999999996V-11.637H27.775999999999996ZM25.291999999999998 -18.9V0.0H29.017999999999997V-18.9ZM50.718999999999994 -9.45Q50.718999999999994 -11.34 51.56949999999999 -12.716999999999999Q52.419999999999995 -14.094 53.797 -14.836500000000001Q55.174 -15.579 56.794 -15.579Q58.144 -15.579 59.197 -15.228000000000002Q60.25 -14.877 61.1005 -14.283000000000001Q61.95099999999999 -13.689 62.572 -12.987V-17.334Q61.411 -18.252 60.0475 -18.765Q58.684 -19.278 56.605 -19.278Q54.44499999999999 -19.278 52.595499999999994 -18.576Q50.745999999999995 -17.874 49.38249999999999 -16.551Q48.019 -15.228 47.2765 -13.432500000000001Q46.534 -11.637 46.534 -9.45Q46.534 -7.263 47.2765 -5.4675Q48.019 -3.672 49.38249999999999 -2.349Q50.745999999999995 -1.026 52.595499999999994 -0.324Q54.44499999999999 0.378 56.605 0.378Q58.684 0.378 60.0475 -0.135Q61.411 -0.648 62.572 -1.566V-5.913Q61.95099999999999 -5.211 61.1005 -4.617Q60.25 -4.023 59.197 -3.6719999999999997Q58.144 -3.321 56.794 -3.321Q55.174 -3.321 53.797 -4.0635Q52.419999999999995 -4.806 51.56949999999999 -6.1965Q50.718999999999994 -7.587 50.718999999999994 -9.45Z" fill="#03121A" opacity="0.6" transform="translate(0 1.5)"/>
      <path d="M6.345 -8.802 12.015 0.0H16.578L10.422 -8.802ZM2.052 -18.9V0.0H5.913V-18.9ZM4.401 -15.606H8.154Q9.18 -15.606 9.9225 -15.2685Q10.665 -14.931 11.07 -14.296499999999998Q11.475 -13.661999999999999 11.475 -12.770999999999999Q11.475 -11.879999999999999 11.07 -11.2455Q10.665 -10.611 9.9225 -10.2735Q9.18 -9.936 8.154 -9.936H4.401V-6.858H8.397Q10.638 -6.858 12.204 -7.613999999999999Q13.77 -8.37 14.607 -9.7335Q15.443999999999999 -11.097 15.443999999999999 -12.879Q15.443999999999999 -14.688 14.607 -16.038Q13.77 -17.387999999999998 12.204 -18.144Q10.638 -18.9 8.397 -18.9H4.401ZM27.775999999999996 0.0H37.307V-3.267H27.775999999999996ZM27.775999999999996 -15.633H37.307V-18.9H27.775999999999996ZM27.775999999999996 -8.424H36.766999999999996V-11.637H27.775999999999996ZM25.291999999999998 -18.9V0.0H29.017999999999997V-18.9ZM50.718999999999994 -9.45Q50.718999999999994 -11.34 51.56949999999999 -12.716999999999999Q52.419999999999995 -14.094 53.797 -14.836500000000001Q55.174 -15.579 56.794 -15.579Q58.144 -15.579 59.197 -15.228000000000002Q60.25 -14.877 61.1005 -14.283000000000001Q61.95099999999999 -13.689 62.572 -12.987V-17.334Q61.411 -18.252 60.0475 -18.765Q58.684 -19.278 56.605 -19.278Q54.44499999999999 -19.278 52.595499999999994 -18.576Q50.745999999999995 -17.874 49.38249999999999 -16.551Q48.019 -15.228 47.2765 -13.432500000000001Q46.534 -11.637 46.534 -9.45Q46.534 -7.263 47.2765 -5.4675Q48.019 -3.672 49.38249999999999 -2.349Q50.745999999999995 -1.026 52.595499999999994 -0.324Q54.44499999999999 0.378 56.605 0.378Q58.684 0.378 60.0475 -0.135Q61.411 -0.648 62.572 -1.566V-5.913Q61.95099999999999 -5.211 61.1005 -4.617Q60.25 -4.023 59.197 -3.6719999999999997Q58.144 -3.321 56.794 -3.321Q55.174 -3.321 53.797 -4.0635Q52.419999999999995 -4.806 51.56949999999999 -6.1965Q50.718999999999994 -7.587 50.718999999999994 -9.45Z" fill={`url(#rec-${uid})`}/>
      </g>
      </g>
      <circle cx="0" cy="0" r="90" fill="none" stroke={`url(#ring-${uid})`} strokeWidth="7.5"/>
      <circle cx="0" cy="0" r="94.4" fill="none" stroke="#FFF6DC" strokeWidth="0.9" opacity="0.75"/>
      <circle cx="0" cy="0" r="85.9" fill="none" stroke="#6B5118" strokeWidth="1.1" opacity="0.6"/>
      <path d="M -63.6 -63.6 A 90 90 0 0 1 26 -86.2" fill="none" stroke="#FFFFFF"
      strokeWidth="2.6" strokeLinecap="round" opacity="0.8"/>
      <path d="M 63.6 63.6 A 90 90 0 0 1 -18 88.2" fill="none" stroke="#FFFFFF"
      strokeWidth="1.6" strokeLinecap="round" opacity="0.35"/>
      </g>
    </svg>
  );
}
