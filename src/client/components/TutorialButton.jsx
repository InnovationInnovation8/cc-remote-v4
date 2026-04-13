// 若葉マーク (初心者マーク) 風の常設ボタン
// タップでインタラクティブチュートリアルを再生する。
export default function TutorialButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      title="チュートリアルを再生"
      aria-label="チュートリアルを再生"
      className="fixed bottom-24 right-3 z-40 w-12 h-12 rounded-full bg-cyber-900/90 border border-navi-glow/40 backdrop-blur flex items-center justify-center shadow-[0_0_12px_rgba(0,232,216,0.25)] hover:shadow-[0_0_16px_rgba(0,232,216,0.5)] hover:border-navi-glow transition-all active:scale-95"
    >
      {/* Shoshinsha mark: two-tone inverted teardrop (green + yellow) */}
      <svg width="26" height="30" viewBox="0 0 40 48" aria-hidden>
        <defs>
          <clipPath id="shoshinshaClip">
            <path d="M20 2 L36 38 L4 38 Z" />
          </clipPath>
        </defs>
        <g clipPath="url(#shoshinshaClip)">
          <rect x="0" y="0" width="40" height="48" fill="#facc15" />
          <rect x="20" y="0" width="20" height="48" fill="#22c55e" />
        </g>
        <path
          d="M20 2 L36 38 L4 38 Z"
          fill="none"
          stroke="#0a0a0b"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
