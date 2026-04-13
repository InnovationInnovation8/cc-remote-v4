const SUGGEST_ITEMS = [
  'このフォルダの概要を教えて',
  'エラーを直して',
  '作業の続きをして',
  'コードをレビューして',
  'ファイル一覧を見せて',
  '今日のタスクをリストアップして',
];

export default function SuggestCards({ onSuggest }) {
  return (
    <div className="px-3 py-4 animate-fade-in">
      <div className="text-[10px] font-mono text-txt-muted tracking-widest mb-3">
        // QUICK START
      </div>
      <div className="grid grid-cols-2 gap-2">
        {SUGGEST_ITEMS.map((text) => (
          <button
            key={text}
            onClick={() => onSuggest && onSuggest(text)}
            className="pet-frame text-left px-3 py-2.5 text-xs font-mono text-txt-secondary
              hover:border-navi/60 hover:text-navi-glow hover:bg-navi/5
              active:scale-95 transition-all duration-150 leading-snug"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
