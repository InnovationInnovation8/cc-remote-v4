import { useState } from 'react';

const STEPS = [
  {
    title: 'JACK IN',
    desc: 'オペレーター、接続を確認。\nCC Remote — Claudeをリモート操作する\nナビゲーションシステムだ。',
    icon: 'C',
  },
  {
    title: 'SESSION',
    desc: '上のタブでセッションを切り替えられる。\n＋ボタンで新しいセッションを起動だ。',
    icon: 'S',
  },
  {
    title: 'INPUT',
    desc: '下のエリアに指示を入力してくれ。\nEnterで送信、Shift+Enterで改行だ。',
    icon: 'I',
  },
  {
    title: 'BATTLE CHIP',
    desc: 'ESC, CTRL+C, YES/NO...\nよく使うコマンドはワンタップで実行できるぞ。',
    icon: 'B',
  },
  {
    title: 'READY!',
    desc: '準備完了だ、オペレーター。\nセッションを起動してオペレーション開始！',
    icon: '\u2713',
  },
];

export default function Tutorial({ onClose }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];

  return (
    <div className="flex flex-col items-center justify-center h-full cyber-floor scanlines px-8">
      <div className="w-full max-w-sm text-center relative z-10 animate-fade-in">
        {/* ナビマーク */}
        <div className="navi-mark mx-auto mb-5 animate-glow-pulse w-16 h-16">
          <span className="text-exe-yellow text-xl font-pixel font-bold">{current.icon}</span>
        </div>

        <h2 className="text-lg font-pixel text-navi-glow mb-3 tracking-wider">{current.title}</h2>
        <p className="text-txt-secondary text-sm mb-8 leading-relaxed font-body whitespace-pre-line">{current.desc}</p>

        {/* Progress - chip style */}
        <div className="flex justify-center gap-1.5 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-sm transition-all duration-300 ${
                i === step
                  ? 'bg-navi-glow shadow-neon-cyan w-4'
                  : i < step
                    ? 'bg-navi'
                    : 'bg-cyber-500'
              }`}
            />
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded chip-btn font-mono text-sm">
            SKIP
          </button>
          <button
            onClick={() => step < STEPS.length - 1 ? setStep(step + 1) : onClose()}
            className="flex-1 py-3 rounded neon-btn text-txt-bright font-pixel text-xs tracking-wider shadow-neon-blue"
          >
            {step < STEPS.length - 1 ? 'NEXT' : 'JACK IN!'}
          </button>
        </div>
      </div>
    </div>
  );
}
