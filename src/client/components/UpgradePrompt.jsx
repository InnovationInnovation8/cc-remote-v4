export default function UpgradePrompt({ onClose }) {
  const proFeatures = [
    { key: 'unlimitedSessions', label: 'セッション無制限' },
    { key: 'multiPc', label: 'マルチPC接続' },
    { key: 'templates', label: 'プロンプトテンプレート' },
    { key: 'schedule', label: 'スケジュール実行' },
    { key: 'fileBrowser', label: 'ファイルブラウザ' },
    { key: 'dashboard', label: 'ダッシュボード' },
    { key: 'themes', label: 'カスタムテーマ' },
    { key: 'aiCharacter', label: 'AIキャラクター' },
    { key: 'voiceInput', label: '音声入力' },
  ];

  const handleUpgrade = () => {
    alert('RevenueCat統合後に利用可能になります');
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="pet-frame p-5 w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="text-center mb-4">
          <div className="text-navi-glow font-pixel text-[11px] tracking-widest mb-1">
            UPGRADE TO PRO
          </div>
          <div className="text-txt-muted text-xs font-mono">
            すべての機能をアンロック
          </div>
        </div>

        {/* Pro機能一覧 */}
        <div className="mb-5 space-y-1.5">
          {proFeatures.map(f => (
            <div key={f.key} className="flex items-center gap-2">
              <span className="text-exe-green text-xs font-mono">✓</span>
              <span className="text-txt-secondary text-xs font-mono">{f.label}</span>
            </div>
          ))}
        </div>

        {/* ボタン */}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 chip-btn py-2">
            後で
          </button>
          <button
            onClick={handleUpgrade}
            className="flex-1 neon-btn text-white py-2 rounded text-sm font-mono"
          >
            アップグレード
          </button>
        </div>
      </div>
    </div>
  );
}
