export default function DragonLogo({ width = 200, style = {} }) {
  return (
    <svg
      width={width}
      height={width * 0.5}
      viewBox="0 0 300 150"
      style={style}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer stroke for "Dragons" text */}
      <text
        x="20"
        y="95"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="82"
        fontWeight="bold"
        fontStyle="italic"
        fill="none"
        stroke="white"
        strokeWidth="8"
        strokeLinejoin="round"
        letterSpacing="-2"
      >
        Dragons
      </text>
      {/* Fill for "Dragons" text */}
      <text
        x="20"
        y="95"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="82"
        fontWeight="bold"
        fontStyle="italic"
        fill="white"
        letterSpacing="-2"
      >
        Dragons
      </text>
      {/* Dragon tail curl below */}
      <path
        d="M195 105 Q210 120 205 135 Q200 148 215 145 Q225 142 220 130"
        fill="none"
        stroke="white"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* Tail spikes */}
      <path
        d="M205 130 L215 125 M208 137 L220 133"
        fill="none"
        stroke="white"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
