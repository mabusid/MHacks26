// Decorative top-down base on a planet surface (docs/design.md → backdrop). Not a grid, not interactive.
// Colors come from the planet theme's CSS variables.

const SOLAR = [
  [430, 250], [500, 250], [570, 250],
  [430, 330], [500, 330],
  [1060, 560], [1130, 560],
];
const TANKS = [[1050, 300], [1110, 330], [1060, 380]];
const CRATERS = [[260, 640, 90], [1350, 180, 60], [1300, 720, 120], [180, 160, 50], [760, 820, 70], [1480, 470, 40]];

export default function BaseScene() {
  return (
    <svg className="base-scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id="ground" cx="50%" cy="45%" r="75%">
          <stop offset="0%" stopColor="var(--ground-1)" />
          <stop offset="100%" stopColor="var(--ground-2)" />
        </radialGradient>
        <radialGradient id="crater" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="var(--ground-2)" />
          <stop offset="85%" stopColor="var(--ground-1)" stopOpacity="0.6" />
          <stop offset="100%" stopColor="var(--ground-hi)" stopOpacity="0.5" />
        </radialGradient>
        <pattern id="cells" width="14" height="14" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" fill="#1b3a5c" />
          <path d="M0 0H14M0 0V14" stroke="#4d7ab0" strokeWidth="1.2" />
        </pattern>
      </defs>

      <rect width="1600" height="900" fill="url(#ground)" />
      {CRATERS.map(([x, y, r]) => (
        <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={r} ry={r * 0.82} fill="url(#crater)" />
      ))}

      {/* Rover tracks between modules */}
      <path d="M800 450 C 700 420, 620 330, 540 300 M800 450 C 920 430, 1000 360, 1060 340 M800 450 C 880 520, 1000 560, 1090 570"
        stroke="var(--ground-hi)" strokeWidth="10" strokeDasharray="2 14" strokeLinecap="round" fill="none" opacity="0.5" />

      {/* Berms hugging the habitat */}
      <path d="M700 360 Q 800 300 900 360" stroke="var(--ground-hi)" strokeWidth="26" strokeLinecap="round" fill="none" opacity="0.85" />
      <path d="M700 540 Q 800 600 900 540" stroke="var(--ground-hi)" strokeWidth="26" strokeLinecap="round" fill="none" opacity="0.85" />

      {/* Habitat */}
      <rect x="720" y="380" width="160" height="140" rx="22" fill="#c9d2de" />
      <rect x="720" y="380" width="160" height="140" rx="22" fill="none" stroke="#f1f5f9" strokeWidth="4" />
      <circle cx="800" cy="450" r="44" fill="#9fb0c4" />
      <circle cx="800" cy="450" r="16" fill="var(--accent)" opacity="0.9" />

      {/* Solar arrays */}
      {SOLAR.map(([x, y]) => (
        <g key={`s${x}-${y}`} transform={`translate(${x} ${y})`}>
          <rect width="58" height="64" rx="4" fill="url(#cells)" />
          <rect width="58" height="64" rx="4" fill="none" stroke="#8fb3dc" strokeWidth="2" />
        </g>
      ))}

      {/* Tanks */}
      {TANKS.map(([x, y]) => (
        <g key={`t${x}-${y}`}>
          <circle cx={x} cy={y} r="26" fill="#e7ecf2" />
          <circle cx={x} cy={y} r="10" fill="#9fb0c4" />
        </g>
      ))}

      {/* Reactor */}
      <polygon points="560,560 600,537 640,560 640,606 600,629 560,606" fill="#d9c27a" />
      <circle cx="600" cy="583" r="12" fill="#5c4a12" />

      {/* Ice drill */}
      <g transform="translate(980 650) rotate(45)">
        <rect x="-26" y="-26" width="52" height="52" rx="6" fill="#bcd7e6" />
      </g>
      <circle cx="980" cy="650" r="10" fill="#365f78" />
    </svg>
  );
}
