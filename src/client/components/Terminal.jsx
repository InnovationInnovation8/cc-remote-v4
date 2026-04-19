import { useRef, useEffect, useState, useCallback } from 'react';
import { useSSE } from '../hooks/useSSE';
import SuggestCards from './SuggestCards';
import { idbGet } from '../utils/idbStore';
import { useOutputFilter } from '../hooks/useOutputFilter';

// 簡易マークダウン変換（``` 検出は useOutputFilter に移管済み）
function renderMd(text) {
  if (!text) return '\u00A0';
  // ヘッダー
  if (/^#{1,3}\s/.test(text)) {
    const level = text.match(/^(#{1,3})/)[1].length;
    const content = text.replace(/^#{1,3}\s+/, '');
    const size = level === 1 ? 'text-base font-bold text-navi-glow' : level === 2 ? 'text-sm font-bold text-navi' : 'text-xs font-bold text-txt-secondary';
    return <span className={size}>{content}</span>;
  }
  // リスト
  if (/^[-*]\s/.test(text.trim())) {
    return <span>  {'>'} {text.trim().slice(2)}</span>;
  }
  // インラインコード `code`
  const parts = text.split(/(`[^`]+`)/g);
  if (parts.length > 1) {
    return parts.map((p, i) =>
      p.startsWith('`') && p.endsWith('`')
        ? <span key={i} className="bg-navi/10 text-navi-glow rounded px-0.5">{p.slice(1, -1)}</span>
        : <span key={i}>{renderBold(p)}</span>
    );
  }
  return renderBold(text);
}

function renderBold(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length > 1) {
    return parts.map((p, i) =>
      p.startsWith('**') && p.endsWith('**')
        ? <span key={i} className="font-bold text-txt-bright">{p.slice(2, -2)}</span>
        : p
    );
  }
  return text;
}

// ステータス文字列を絵文字付きラベルに変換
function statusLabel(status) {
  if (!status) return '';
  if (/思考中/.test(status)) return '⚡ 考え中...';
  if (/検索中/.test(status)) return '🔍 検索中...';
  if (/読込中/.test(status)) return '📖 ファイル読み込み中...';
  if (/編集中/.test(status)) return '✏️ ファイル編集中...';
  if (/コマンド実行中/.test(status)) return '▶️ コマンド実行中...';
  if (/エージェント実行中/.test(status)) return '🤖 エージェント実行中...';
  return status;
}

export default function Terminal({ sessionId, token, onSseState, onAuthError, onQuote, onSuggest, stageMode = 'reduce', isFirstReduceApplied = false }) {
  const { output, status, connected, ready, contextUsage } = useSSE(sessionId, token, onAuthError);
  const filteredOutput = useOutputFilter(output, stageMode);

  useEffect(() => {
    if (onSseState) onSseState(connected, status, ready);
  }, [connected, status, ready, onSseState]);
  const containerRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedLines, setExpandedLines] = useState(() => new Set());
  const [showReduceToast, setShowReduceToast] = useState(false);
  // IndexedDB から非同期読み込み。初期値 13px でチラつきを最小化。
  const [fontSize, setFontSize] = useState(13);
  useEffect(() => {
    idbGet('ccr-fontsize', '13').then(v => setFontSize(parseInt(v) || 13));
  }, []);

  useEffect(() => {
    if (!isFirstReduceApplied) return;
    setShowReduceToast(true);
    const t = setTimeout(() => setShowReduceToast(false), 3000);
    return () => clearTimeout(t);
  }, [isFirstReduceApplied]);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filteredOutput, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 50);
  }, []);

  const [tappedLine, setTappedLine] = useState(null);

  const handleLineTap = useCallback((text, idx) => {
    if (tappedLine === idx) {
      setTappedLine(null); // 同じ行再タップで閉じる
    } else {
      setTappedLine(idx);
    }
  }, [tappedLine]);

  const handleCopy = useCallback((text) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setTappedLine(null);
  }, []);

  const handleQuote = useCallback((text) => {
    if (onQuote && text.trim()) onQuote(text.trim());
    setTappedLine(null);
  }, [onQuote]);

  if (!sessionId) {
    return (
      <div
        data-tutorial-id="terminal-area"
        className="flex-1 flex items-center justify-center cyber-floor relative"
      >
        <div className="text-center relative z-10 animate-fade-in">
          <div className="navi-mark mx-auto mb-4 animate-glow-pulse w-16 h-16">
            <span className="text-exe-yellow text-2xl font-pixel font-bold">C</span>
          </div>
          <div className="text-txt-muted font-mono text-[11px] tracking-[0.12em]">
            // SELECT OR CREATE SESSION
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Status bar + context usage */}
      {contextUsage > 0 && (
        <div className="bg-navi/10 border-b border-navi/20 px-3 py-1 text-[11px] flex-shrink-0 font-mono tracking-wider flex items-center gap-3">
          <span className="ml-auto flex items-center gap-1.5 shrink-0">
            <span className={`text-[10px] font-mono tabular-nums ${contextUsage >= 95 ? 'text-alert-red' : contextUsage >= 80 ? 'text-exe-yellow' : 'text-txt-muted'}`}>
              CTX {contextUsage}%
            </span>
            <span className="w-16 h-1.5 bg-cyber-700 rounded-full overflow-hidden">
              <span
                className={`block h-full rounded-full transition-all duration-500 ${contextUsage >= 95 ? 'bg-alert-red' : contextUsage >= 80 ? 'bg-exe-yellow' : 'bg-navi'}`}
                style={{ width: `${contextUsage}%` }}
              />
            </span>
          </span>
        </div>
      )}

      {/* Output area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-label="ターミナル出力"
        data-tutorial-id="terminal-area"
        className="flex-1 overflow-y-auto px-3 py-2 font-mono circuit-dots"
        style={{ fontSize: `${fontSize}px`, lineHeight: '1.6' }}
      >
        {filteredOutput.length === 0 && ready && !status && (
          <SuggestCards onSuggest={onSuggest} />
        )}
        {filteredOutput.length === 0 && status && (
          <div className="flex items-center justify-center h-32 animate-fade-in">
            <div className="text-center">
              <div className="text-navi-glow/60 text-sm font-mono animate-pulse">{statusLabel(status)}</div>
              <div className="mt-2 mx-auto w-20 h-0.5 bg-cyber-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-navi to-navi-glow rounded-full animate-data-stream" style={{width:'60%'}} />
              </div>
            </div>
          </div>
        )}
        {filteredOutput.map((line, i) => {
          const textValue = line.text ?? '';
          const isExpanded = expandedLines.has(i);
          // _collapsed: コードブロック折畳行（展開可能）
          if (line._collapsed) {
            return (
              <div key={i} className="relative">
                <div
                  onClick={() => {
                    setExpandedLines((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i); else next.add(i);
                      return next;
                    });
                  }}
                  className="cursor-pointer rounded px-1 -mx-1 text-navi/70 hover:bg-navi/8 transition-colors duration-100 font-mono"
                >
                  {isExpanded ? '🔼' : '🔽'} {textValue.replace(/^🔽\s*/, '')}
                </div>
                {isExpanded && (
                  <div className="pl-4 border-l border-navi/20 ml-1 text-txt-muted whitespace-pre-wrap break-all">
                    {line._lines.map((raw, j) => (
                      <div key={j}>{raw || '\u00A0'}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          // _filtered: useOutputFilter が加工済み（ツールアイコン等）→ そのまま表示
          if (line._filtered) {
            return (
              <div key={i} className="relative">
                <div className="whitespace-pre-wrap break-all px-1 -mx-1 text-txt-muted font-mono">
                  {textValue}
                </div>
              </div>
            );
          }

          const isInput = /^[\u276F>$]/.test(textValue.trim());
          const isError = /error|エラー|失敗/i.test(textValue);
          const isSuccess = /success|完了|done/i.test(textValue);

          return (
            <div key={i} className="relative">
              <div
                onClick={() => handleLineTap(textValue, i)}
                className={`whitespace-pre-wrap break-all cursor-pointer rounded px-1 -mx-1 transition-colors duration-100
                  hover:bg-navi/8
                  ${isInput ? 'text-exe-green font-bold' : 'text-txt-secondary'}
                  ${isError ? 'text-alert-red' : ''}
                  ${isSuccess ? 'text-exe-greenDim' : ''}
                  ${tappedLine === i ? 'bg-navi/12' : ''}
                `}
              >
                {isInput ? (textValue || '\u00A0') : renderMd(textValue)}
              </div>
              {tappedLine === i && textValue.trim() && (
                <div className="absolute right-1 -top-1 z-40 flex gap-1 animate-fade-in">
                  <button onClick={() => handleCopy(textValue)} className="bg-cyber-800 border border-navi/40 rounded px-2 py-1 text-[9px] font-mono text-navi-glow">COPY</button>
                  <button onClick={() => handleQuote(textValue)} className="bg-cyber-800 border border-exe-yellow/40 rounded px-2 py-1 text-[9px] font-mono text-exe-yellow">引用</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showReduceToast && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-cyber-800 border border-navi/50 rounded-md px-3 py-2 text-[11px] font-mono text-navi-glow shadow-neon-blue animate-fade-in pointer-events-none">
          ノイズ削減モードが有効です
        </div>
      )}

      {/* Scroll to bottom */}
      {!autoScroll && (
        <button
          onClick={() => {
            containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
            setAutoScroll(true);
          }}
          aria-label="最新まで戻る"
          className="absolute bottom-3 right-3 neon-btn text-txt-bright rounded-full w-11 h-11 flex items-center justify-center shadow-neon-blue min-h-0 min-w-0"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}

      {/* Connection lost (only show after explicit failure, not on initial load) */}
      {connected === false && (
        <div className="absolute inset-0 bg-cyber-bg/85 flex items-center justify-center animate-fade-in">
          <div className="pet-frame p-6 text-center animate-slide-up">
            <div className="text-alert-red font-pixel text-[10px] animate-neon-flicker mb-3">CONNECTION LOST</div>
            <div className="text-txt-muted text-xs font-mono">RECONNECTING...</div>
            <div className="mt-3 mx-auto w-24 h-1 bg-cyber-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-navi to-navi-glow rounded-full animate-data-stream" style={{width:'60%'}} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
