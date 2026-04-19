import { useState, useEffect, useCallback, useRef } from 'react';
import tutorialSteps from './tutorialSteps';
import { idbSet } from '../utils/idbStore';
import { track } from '../utils/analytics';

const PAD = 8;
const MARGIN = 12;

function NaviMascot() {
  return (
    <div className="relative w-10 h-10 rounded-lg bg-[#0a0a0b] border border-exe-green/50 flex items-center justify-center flex-shrink-0 shadow-[0_0_8px_rgba(34,197,94,0.35)]">
      <span className="text-[#22c55e] text-[11px] font-mono font-bold">&gt;_C</span>
      <span
        className="absolute -bottom-1 left-4 w-2 h-2 rotate-45 bg-[#0a0a0b] border-r border-b border-exe-green/50"
        aria-hidden
      />
    </div>
  );
}

// 吹き出し位置を決める。対象 rect には絶対に重ねない。
// 要求 placement に十分な余白があればそれを使い、無ければ反対側を検討、
// どちらも狭ければ広い方を選び、maxHeight をその余白に合わせて縮める (スクロール可)。
function computeTooltipPosition(rect, placement, tooltipW, desiredH) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!rect || placement === 'center') {
    const h = Math.min(desiredH, vh - MARGIN * 2);
    return {
      left: Math.max(MARGIN, (vw - tooltipW) / 2),
      top: Math.max(MARGIN, (vh - h) / 2),
      maxHeight: vh - MARGIN * 2,
    };
  }

  const spaceAbove = Math.max(0, rect.top - PAD - MARGIN);
  const spaceBelow = Math.max(0, vh - rect.bottom - PAD - MARGIN);

  const preferBottom = placement !== 'top';
  const bottomFits = spaceBelow >= desiredH;
  const topFits = spaceAbove >= desiredH;

  let useBottom;
  if (preferBottom) {
    useBottom = bottomFits || spaceBelow >= spaceAbove;
  } else {
    useBottom = !(topFits || spaceAbove > spaceBelow);
  }

  let top;
  let maxHeight;
  if (useBottom) {
    top = rect.bottom + PAD + MARGIN;
    maxHeight = Math.max(120, spaceBelow);
  } else {
    maxHeight = Math.max(120, spaceAbove);
    const h = Math.min(desiredH, maxHeight);
    top = rect.top - h - PAD - MARGIN;
    if (top < MARGIN) top = MARGIN;
  }

  let left = rect.left + rect.width / 2 - tooltipW / 2;
  if (left < MARGIN) left = MARGIN;
  if (left + tooltipW > vw - MARGIN) left = vw - tooltipW - MARGIN;

  return { left, top, maxHeight };
}

export default function InteractiveTutorial({ onClose }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const tooltipRef = useRef(null);
  const [tooltipPos, setTooltipPos] = useState({ left: 0, top: 0, maxHeight: 500 });

  useEffect(() => {
    track('tutorial_started');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = tutorialSteps[stepIdx];
  const isLast = stepIdx === tutorialSteps.length - 1;

  const measureTarget = useCallback(() => {
    if (!step.targetId) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(`[data-tutorial-id="${step.targetId}"]`);
    if (!el) {
      // 見つからない場合は古い rect を残さず null にする (スポットライトが古い位置で残らないように)。
      setTargetRect((prev) => (prev ? null : prev));
      return;
    }
    try {
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    } catch (_) {
      /* ignore */
    }
    const r = el.getBoundingClientRect();
    setTargetRect((prev) => {
      if (
        prev &&
        prev.x === r.x &&
        prev.y === r.y &&
        prev.width === r.width &&
        prev.height === r.height
      ) {
        return prev;
      }
      return r;
    });
  }, [step.targetId]);

  useEffect(() => {
    measureTarget();
    // 状態遷移 (例: PC 選択で SessionBar が出現) 後に target が遅れて
    // DOM に現れるケースに対応するため、短い間隔で繰り返し測定を試みる。
    const timers = [];
    for (let i = 1; i <= 15; i += 1) {
      timers.push(setTimeout(measureTarget, i * 200));
    }
    const onResize = () => measureTarget();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      timers.forEach((t) => clearTimeout(t));
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [measureTarget]);

  useEffect(() => {
    const node = tooltipRef.current;
    if (!node) return;
    const w = node.offsetWidth || 320;
    const h = node.offsetHeight || 280;
    setTooltipPos(computeTooltipPosition(targetRect, step.placement, w, h));
  }, [targetRect, stepIdx, step.placement]);

  const finish = useCallback((outcome = 'completed') => {
    try {
      idbSet('ccr-tutorial-seen', '1');
    } catch (_) {
      /* ignore */
    }
    track(outcome === 'skipped' ? 'tutorial_skipped' : 'tutorial_completed', {
      at_step: step?.id,
      step_index: stepIdx,
    });
    onClose && onClose();
  }, [onClose, step?.id, stepIdx]);

  const advance = useCallback(() => {
    // Rev 6: モーダル/画面を開くステップから次に進む時は自動で閉じる
    //   new-session → SessionList は新規作成で既に閉じる想定だが念のため
    if (step.id === 'new-session') {
      window.dispatchEvent(new CustomEvent('ccr:close-session-list'));
    }
    if (isLast) {
      finish();
    } else {
      setStepIdx((i) => i + 1);
    }
  }, [isLast, finish, step.id]);

  // Rev 6: end-to-end 実動作フロー — 1 動作ずつ完了を確認してから次へ進む
  //   タップ → 実行 → 完了条件の poll 待ち → advance
  //   各ステップは最大 5 秒待つ (timeout しても次へ)
  const [processing, setProcessing] = useState(false);

  const waitFor = (check, timeoutMs = 5000, intervalMs = 150) => new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      try {
        if (check()) { resolve(true); return; }
      } catch (_) { /* ignore */ }
      if (Date.now() - start >= timeoutMs) { resolve(false); return; }
      setTimeout(tick, intervalMs);
    };
    tick();
  });

  const handleHitZoneClick = async (e) => {
    e.stopPropagation();
    if (processing) return;
    const id = step.id;
    setProcessing(true);
    try {
      if (id === 'pc') {
        const pcBtn = document.querySelector('[data-tutorial-id="pc-list"] button');
        pcBtn && pcBtn.click();
        // SessionBar の AllSession ボタン出現を待つ
        await waitFor(() => !!document.querySelector('[data-tutorial-id="session-btn"]'), 5000);
      } else if (id === 'open-session-list') {
        const sessBtn = document.querySelector('[data-tutorial-id="session-btn"]');
        sessBtn && sessBtn.click();
        // SessionList モーダル内の NEW SESSION ボタン出現を待つ
        await waitFor(() => !!document.querySelector('[data-tutorial-id="new-session-btn"]'), 3000);
      } else if (id === 'new-session') {
        const newBtn = document.querySelector('[data-tutorial-id="new-session-btn"]');
        newBtn && newBtn.click();
        // NEW SESSION ボタンが消える (モーダル閉じる) のを待つ
        await waitFor(() => !document.querySelector('[data-tutorial-id="new-session-btn"]'), 3000);
        // 新規セッションが input-area として表示されるのを待つ
        await waitFor(() => !!document.querySelector('[data-tutorial-id="input-area"] textarea'), 3000);
      } else if (id === 'enter-trust') {
        const enterBtn = document.querySelector('[data-tutorial-id="enter-btn"]');
        enterBtn && enterBtn.click();
        // Claude 起動待機 (UI レベルでは確実な検知が難しいので固定時間)
        await new Promise((r) => setTimeout(r, 1500));
      } else if (id === 'type-hello') {
        const inputBox = document.querySelector('[data-tutorial-id="input-area"] textarea');
        inputBox && inputBox.focus();
      } else if (id === 'send-hello') {
        const sendBtn = document.querySelector('[data-tutorial-id="send-btn"]');
        sendBtn && sendBtn.click();
        // textarea が空になるのを待つ (送信成功)
        await waitFor(() => {
          const t = document.querySelector('[data-tutorial-id="input-area"] textarea');
          return t && t.value === '';
        }, 3000);
      }
    } catch (_) { /* ignore */ }
    setProcessing(false);
    advance();
  };

  // 「はい/完了」ボタンは対象要素を持たないステップ (welcome/complete) のみ表示。
  // targetId を持つステップは光っている対象をタップして進める設計。
  const showAdvanceButton = !step.targetId;
  const advanceLabel = isLast ? '完了' : 'はい';

  const spotlightStyle = targetRect
    ? (() => {
        const x = Math.max(0, targetRect.x - PAD);
        const y = Math.max(0, targetRect.y - PAD);
        const w = targetRect.width + PAD * 2;
        const h = targetRect.height + PAD * 2;
        return {
          clipPath: `polygon(0% 0%, 0% 100%, ${x}px 100%, ${x}px ${y}px, ${x + w}px ${y}px, ${x + w}px ${y + h}px, ${x}px ${y + h}px, ${x}px 100%, 100% 100%, 100% 0%)`,
        };
      })()
    : {};

  return (
    <div className="fixed inset-0 z-[80] pointer-events-none">
      {/* Dim overlay with spotlight hole (背景タップでは進めない) */}
      <div
        className="absolute inset-0 bg-black/55 pointer-events-auto transition-[clip-path] duration-300"
        style={spotlightStyle}
      />

      {/* Hit zone: transparent clickable area over target */}
      {targetRect && (
        <button
          type="button"
          aria-label="次のステップへ進む"
          onClick={handleHitZoneClick}
          className="absolute pointer-events-auto cursor-pointer bg-transparent border-0 p-0 m-0"
          style={{
            left: targetRect.x - PAD,
            top: targetRect.y - PAD,
            width: targetRect.width + PAD * 2,
            height: targetRect.height + PAD * 2,
          }}
        />
      )}

      {/* Spotlight ring (visual only) */}
      {targetRect && (
        <div
          className="absolute border-2 border-navi-glow rounded pointer-events-none shadow-[0_0_16px_rgba(0,232,216,0.6)] animate-pulse"
          style={{
            left: targetRect.x - PAD,
            top: targetRect.y - PAD,
            width: targetRect.width + PAD * 2,
            height: targetRect.height + PAD * 2,
          }}
        />
      )}

      {/* Tooltip bubble (only Skip button) */}
      <div
        ref={tooltipRef}
        className="absolute pointer-events-auto max-w-[calc(100vw-24px)] w-80"
        style={{
          left: tooltipPos.left,
          top: tooltipPos.top,
          maxHeight: tooltipPos.maxHeight,
          overflowY: 'auto',
        }}
      >
        <div className="relative bg-cyber-900 border border-navi-glow/70 rounded-lg shadow-[0_0_20px_rgba(0,232,216,0.35)] p-4 animate-fade-in">
          {/* Header: mascot + title + step counter */}
          <div className="flex items-start gap-3 mb-3">
            <NaviMascot />
            <div className="flex-1 min-w-0">
              <div className="text-navi-glow font-pixel text-[10px] tracking-widest mb-0.5">
                {`STEP ${stepIdx + 1}/${tutorialSteps.length}`}
              </div>
              <div className="text-txt-bright font-body text-sm font-bold truncate">
                {step.title}
              </div>
            </div>
          </div>

          {/* Speech body */}
          <div className="text-txt-secondary text-[13px] font-body leading-relaxed mb-4 whitespace-pre-line">
            {step.lines.join('\n')}
          </div>

          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 mb-3">
            {tutorialSteps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-sm transition-all duration-300 ${
                  i === stepIdx
                    ? 'bg-navi-glow shadow-neon-cyan w-4'
                    : i < stepIdx
                      ? 'bg-navi w-2'
                      : 'bg-cyber-600 w-2'
                }`}
              />
            ))}
          </div>

          {/* 進行ボタン (対象無しの時のみ) + スキップ */}
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => setShowSkipConfirm(true)}
              className="flex-1 py-2 rounded border border-cyber-600 text-txt-muted text-[11px] font-mono hover:border-alert-red/60 hover:text-alert-red transition-all"
            >
              スキップ
            </button>
            {showAdvanceButton && (
              <button
                onClick={advance}
                className="flex-1 py-2 rounded border border-navi-glow/70 bg-navi/15 text-navi-glow text-[11px] font-mono font-bold hover:bg-navi/25 hover:shadow-neon-cyan transition-all"
              >
                {advanceLabel}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Skip confirmation dialog */}
      {showSkipConfirm && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[90] pointer-events-auto px-4"
          onClick={() => setShowSkipConfirm(false)}
        >
          <div
            className="bg-cyber-900 border border-alert-red/60 rounded-lg shadow-[0_0_20px_rgba(239,68,68,0.4)] p-5 w-full max-w-xs text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-alert-red font-pixel text-[11px] tracking-widest mb-3">
              CONFIRM
            </div>
            <div className="text-txt-bright font-body text-sm mb-1">
              本当にスキップしますか？
            </div>
            <div className="text-txt-muted text-[11px] mb-5">
              チュートリアルは右上の 🔰 マークから
              <br />
              いつでも再生できます。
            </div>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => setShowSkipConfirm(false)}
                className="flex-1 py-2 rounded border border-navi/50 text-navi-glow text-[11px] font-mono hover:bg-navi/10 transition-all"
              >
                いいえ
              </button>
              <button
                onClick={() => finish('skipped')}
                className="flex-1 py-2 rounded border border-alert-red/60 text-alert-red text-[11px] font-mono hover:bg-alert-red/15 transition-all"
              >
                はい
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
