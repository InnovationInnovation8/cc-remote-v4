import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession } from '../hooks/useSession';
import { useOfflineQueue } from '../hooks/useOfflineQueue';
import CommandPalette from './CommandPalette';
import ShortcutBar from './ShortcutBar';
import { soundClick } from '../utils/sounds';
import { getAuthHeaders } from '../utils/api';
import { idbGet, idbSet, idbDelete } from '../utils/idbStore';
import { track } from '../utils/analytics';

// Rev 6.4: 音声入力自動検出（手動キーボード入力は meta-prompt ラップしない）
//   - iOS dictation → inputType === 'insertReplacementText' で検出
//   - 一度に 10 文字以上挿入 → 音声 or ペーストと判定（ペーストは insertFromPaste で除外）
//   - 削除・単発文字入力は検出リセット（手動編集に入ったとみなす）

export default function InputArea({ sessionId, token, onShowTemplates, onShowSchedule, quotedText, onQuoteClear, suggestedText, onSuggestClear, claudeReady }) {
  const { sendInput, sendKey } = useSession(token);
  const { online, enqueue } = useOfflineQueue();
  const [text, setText] = useState('');
  // IndexedDB から非同期読み込み。初期値は空配列。
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showPalette, setShowPalette] = useState(false);
  const [guideShown, setGuideShown] = useState(false); // リリース時にtrueに戻す
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [previewImg, setPreviewImg] = useState(null);
  const [stopCooldown, setStopCooldown] = useState(false);
  const [voiceDetected, setVoiceDetected] = useState(false);
  // Rev 6: YES/NO chip の連打防止 (ゴーストタップで y が大量送信される事故の再発防止)
  const chipCooldownRef = useRef(0);
  const tryChipTap = useCallback((fn) => {
    const now = Date.now();
    if (now - chipCooldownRef.current < 400) return;
    chipCooldownRef.current = now;
    fn();
  }, []);

  useEffect(() => { idbSet('ccr-autosave', text); }, [text]);
  useEffect(() => { if (!text) setVoiceDetected(false); }, [text]);
  // 起動時: history と autosave を IndexedDB から復元
  useEffect(() => {
    idbGet('ccr-input-history', []).then((hist) => {
      try {
        const parsed = typeof hist === 'string' ? JSON.parse(hist) : hist;
        setHistory(Array.isArray(parsed) ? parsed : []);
      } catch { setHistory([]); }
    });
    idbGet('ccr-autosave', '').then((saved) => {
      if (saved) setText(saved);
    });
  }, []);

  // claudeReady になったらガイド消す
  useEffect(() => {
    if (claudeReady) setGuideShown(false);
  }, [claudeReady]);

  // 引用テキスト挿入
  useEffect(() => {
    if (quotedText) {
      setText(prev => prev + (prev ? '\n' : '') + `> ${quotedText}\n`);
      if (onQuoteClear) onQuoteClear();
      textareaRef.current?.focus();
    }
  }, [quotedText, onQuoteClear]);

  // おすすめカードからのテキスト挿入（引用プレフィックスなし）
  useEffect(() => {
    if (suggestedText) {
      setText(suggestedText);
      if (onSuggestClear) onSuggestClear();
      textareaRef.current?.focus();
    }
  }, [suggestedText, onSuggestClear]);

  // / で始まったらコマンドパレット表示
  useEffect(() => {
    setShowPalette(text.startsWith('/') && text.length > 0);
  }, [text]);

  // Rev 6: チュートリアル用の自動テキスト注入 (「hello」を事前入力するなど)
  useEffect(() => {
    const handler = (e) => {
      const t = e?.detail?.text ?? '';
      setText(t);
      textareaRef.current?.focus();
    };
    window.addEventListener('ccr:tutorial-set-input', handler);
    return () => window.removeEventListener('ccr:tutorial-set-input', handler);
  }, []);

  // 乱れた音声メモを整理 meta-prompt に包む
  const wrapVoiceMemo = (raw) => [
    '以下はスマホから音声入力で書かれた乱れたメモです。',
    '句読点・改行・誤変換を直し、意図を汲み取った上で、',
    'そのまま実行可能な指示として整理し、実行してください。',
    '',
    '--- 音声メモ ---',
    raw,
    '--- ここまで ---',
  ].join('\n');

  const handleSend = useCallback(async () => {
    if (!text.trim() || !sessionId) return;

    const wrapped = voiceDetected ? wrapVoiceMemo(text) : text;
    try {
      if (!online) {
        enqueue(`/api/sessions/${sessionId}/input`, 'POST',
          { 'Content-Type': 'application/json', ...getAuthHeaders() },
          JSON.stringify({ text: wrapped + '\r' }));
      } else {
        await sendInput(sessionId, wrapped + '\r');
      }
      track('command_sent', {
        length: wrapped.length,
        is_voice: voiceDetected,
        is_offline: !online,
        has_image: !!previewImg,
      });
    } catch (err) {
      console.error('[InputArea] send failed:', err);
      track('command_send_failed', { reason: err?.message || 'unknown' });
      return; // Keep text in input so user doesn't lose it
    }

    const newHistory = [text, ...history.filter(h => h !== text)].slice(0, 50);
    setHistory(newHistory);
    idbSet('ccr-input-history', newHistory);
    setHistoryIndex(-1);
    setText('');
    setVoiceDetected(false);
    setPreviewImg(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    idbDelete('ccr-autosave');
  }, [text, sessionId, sendInput, history, online, enqueue, token, voiceDetected]);

  const handlePaletteSelect = useCallback((cmd) => {
    setText(cmd);
    setShowPalette(false);
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape' && showPalette) { setShowPalette(false); return; }
    if (e.key === 'ArrowUp' && !text) {
      e.preventDefault();
      const idx = Math.min(historyIndex + 1, history.length - 1);
      if (history[idx]) { setHistoryIndex(idx); setText(history[idx]); }
    }
    if (e.key === 'ArrowDown' && historyIndex >= 0) {
      e.preventDefault();
      const idx = historyIndex - 1;
      if (idx < 0) { setHistoryIndex(-1); setText(''); }
      else { setHistoryIndex(idx); setText(history[idx]); }
    }
  };

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-filename': encodeURIComponent(file.name),
          ...getAuthHeaders(),
        },
        body: buf,
      });
      const data = await res.json();
      if (data.ok) {
        const tag = `[添付: ${file.name} → ${data.path}]`;
        setText(prev => prev + (prev && !prev.endsWith('\n') ? '\n' : '') + tag + '\n');
        // 画像ならプレビュー表示
        if (file.type.startsWith('image/')) {
          setPreviewImg(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
        }
        textareaRef.current?.focus();
      }
    } catch (_) {}
    setUploading(false);
  }, [token]);

  const disabled = !sessionId;

  return (
    <div className="bg-gradient-to-t from-cyber-900 to-cyber-800 border-t-2 border-navi px-2 pt-1.5 pb-[max(0.5rem,var(--sab))] flex-shrink-0">
      {/* Quick key row */}
      <div data-tutorial-id="battle-chip" className="flex gap-1 mb-1.5 overflow-x-auto relative" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* ENTER guide overlay */}
        {!claudeReady && sessionId && guideShown && (
          <div className="absolute -top-12 left-0 z-50 animate-fade-in">
            <div className="bg-cyber-900/95 border border-exe-green/40 rounded-lg px-3 py-1.5 text-xs font-mono text-exe-green shadow-neon-green whitespace-nowrap">
              ENTERを押して開始 ↓
            </div>
          </div>
        )}
        {/* Rev 6.2: ENTER を先頭に、STOP を 2 番目に入れ替え (ENTER が主動線、STOP は誤タップ防止で少し右へ) */}
        <ChipBtn label="ENTER" onClick={() => { sendKey(sessionId, 'enter'); setGuideShown(false); }} disabled={disabled} variant="green" data-tutorial-id="enter-btn" />
        <ChipBtn label="STOP" onClick={() => { if (stopCooldown) return; setStopCooldown(true); sendKey(sessionId, 'escape'); setTimeout(() => sendKey(sessionId, 'ctrl-c'), 300); setTimeout(() => setStopCooldown(false), 2000); }} disabled={disabled || stopCooldown} variant="red" />
        <ChipBtn label="↑" onClick={() => sendKey(sessionId, 'up')} disabled={disabled} />
        <ChipBtn label="↓" onClick={() => sendKey(sessionId, 'down')} disabled={disabled} />
        {onShowTemplates && <ChipBtn label="TEMPLATE" onClick={onShowTemplates} disabled={disabled} />}
        {onShowSchedule && <ChipBtn label="SCHEDULE" onClick={onShowSchedule} disabled={disabled} variant="green" />}
        <ChipBtn label="SUMMARY" onClick={() => sendInput(sessionId, 'このセッションの作業内容をまとめてください\r')} disabled={disabled} />
      </div>

      {/* Custom shortcuts from DB */}
      <ShortcutBar onSend={(cmd) => sendInput(sessionId, cmd)} token={token} />

      {/* Image preview */}
      {previewImg && (
        <div className="flex items-center gap-2 mb-1 px-1 animate-fade-in" onClick={() => setPreviewImg(null)}>
          <img src={previewImg} className="w-12 h-12 object-cover rounded border border-navi/30" />
          <span className="text-[10px] text-txt-muted font-mono">添付済み（タップで閉じる）</span>
        </div>
      )}

      {/* Offline indicator */}
      {!online && (
        <div className="text-[10px] text-exe-yellow font-mono mb-1 px-1 animate-pulse">
          OFFLINE — 入力はキューに保存されます
        </div>
      )}

      {/* Voice input indicator */}
      {voiceDetected && (
        <div className="text-[10px] text-navi-glow font-mono mb-1 px-1 flex items-center gap-1">
          <span>🎤</span>
          <span>音声入力 — 送信時に整形プロンプトでラップします</span>
          <button
            type="button"
            onClick={() => setVoiceDetected(false)}
            className="ml-auto text-txt-muted hover:text-txt-bright underline"
          >
            解除
          </button>
        </div>
      )}

      {/* Input area */}
      <div data-tutorial-id="input-area" className="flex gap-1.5 items-end relative">
        <CommandPalette
          isOpen={showPalette}
          onSelect={handlePaletteSelect}
          onClose={() => setShowPalette(false)}
          filter={text}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,.txt,.md,.csv"
          className="hidden"
          onChange={handleFileChange}
        />
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="// INPUT..."
          rows={1}
          disabled={disabled}
          aria-label="メッセージ入力"
          className="flex-1 bg-cyber-bg border border-cyber-500 rounded px-3 py-2 text-sm font-mono text-txt-secondary resize-none
            focus:outline-none focus:border-navi-glow focus:shadow-[0_0_8px_rgba(0,232,216,0.15)]
            placeholder:text-txt-muted/30
            disabled:opacity-30
            min-h-[40px] max-h-[120px] transition-all"
          style={{ height: 'auto', overflow: 'hidden' }}
          onInput={e => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            // Detect voice/dictation input (iOS: insertReplacementText, chunked: length > 10)
            const ne = e.nativeEvent || {};
            const type = ne.inputType;
            const chunkLen = (ne.data || '').length;
            if (type === 'insertReplacementText' || type === 'insertFromDictation') {
              setVoiceDetected(true);
            } else if (type === 'insertText' && chunkLen > 10) {
              setVoiceDetected(true);
            } else if (type === 'insertFromPaste' || (type && type.startsWith('delete')) || (type === 'insertText' && chunkLen <= 2)) {
              if (voiceDetected) setVoiceDetected(false);
            }
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          aria-label="ファイル添付"
          className="flex-shrink-0 bg-cyber-bg border border-cyber-500 rounded px-3 py-2 min-h-[40px] min-w-[40px] text-sm text-txt-muted
            hover:border-navi disabled:opacity-20"
        >
          {uploading ? '...' : '\uD83D\uDCF7'}
        </button>
        <button
          data-tutorial-id="send-btn"
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          aria-label="送信"
          className="neon-btn text-txt-bright rounded px-3 py-2 font-bold text-xs font-pixel tracking-wider flex-shrink-0 min-w-[60px]
            disabled:opacity-15 disabled:cursor-not-allowed"
        >
          SEND
        </button>
      </div>
    </div>
  );
}

function ChipBtn({ label, onClick, disabled, variant, 'data-tutorial-id': dataTutorialId }) {
  const variantClass = variant === 'green'
    ? 'border-exe-greenDim/50 hover:shadow-neon-green'
    : variant === 'red'
      ? 'border-alert-red/50 hover:shadow-neon-red'
      : '';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-tutorial-id={dataTutorialId}
      className={`chip-btn ${variantClass} whitespace-nowrap flex-shrink-0 text-xs px-3 py-2 min-h-[40px]
        disabled:opacity-20 disabled:cursor-not-allowed`}
    >
      {label}
    </button>
  );
}
