export default function DragonLogo({ width = 140, style = {} }) {
  return (
    <svg
      width={width}
      height={width}
      viewBox="0 0 200 200"
      style={style}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer oval swoosh */}
      <ellipse cx="105" cy="115" rx="88" ry="52" fill="none" stroke="white" strokeWidth="10" />

      {/* Big D shape */}
      <path
        d="M55 40 L55 165 Q55 175 65 175 L105 175 Q155 175 175 130 Q190 105 175 75 Q158 40 105 40 Z
           M80 65 L100 65 Q140 65 152 95 Q162 118 148 142 Q136 162 100 162 L80 162 Z"
        fill="white"
      />

      {/* Lightning bolt slash */}
      <path
        d="M70 48 L58 98 L78 92 L62 158 L90 100 L70 108 Z"
        fill="white"
        opacity="0.9"
      />
    </svg>
  );
}
