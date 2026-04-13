import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import PinLogin from './components/PinLogin';
import Header from './components/Header';
import SessionBar from './components/SessionBar';
import Terminal from './components/Terminal';
import InputArea from './components/InputArea';
import ErrorBoundary from './components/ErrorBoundary';
import ErrorDisplay from './components/ErrorDisplay';
import { useAuth } from './hooks/useAuth';
import { soundBoot, soundComplete } from './utils/sounds';
import { setRemoteBase, getApiBase, getAuthHeaders } from './utils/api';
import { findPc } from './utils/pcStore';
import PCTabs from './components/PCTabs';
import AddPCLocal from './components/AddPCLocal';

const Settings = lazy(() => import('./components/Settings'));
const SessionList = lazy(() => import('./components/SessionList'));
const Templates = lazy(() => import('./components/Templates'));
const StatusPage = lazy(() => import('./components/StatusPage'));
const FileBrowser = lazy(() => import('./components/FileBrowser'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const InteractiveTutorial = lazy(() => import('./components/InteractiveTutorial'));
const SchedulePanel = lazy(() => import('./components/SchedulePanel'));

const LazyFallback = (
  <div className="flex-1 flex items-center justify-center">
    <div className="text-txt-muted font-mono text-xs animate-pulse">LOADING...</div>
  </div>
);

function App() {
  const { isAuthenticated, token, login, logout } = useAuth();
  // v4: useNotification と useFirebasePCs は廃止（中央サーバーなし、各PCはlocalStorage管理）
  const [booting, setBooting] = useState(true);
  const [activeSession, setActiveSession] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showAddPC, setShowAddPC] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [sseState, setSseState] = useState({ connected: false, status: '' });
  const [appError, setAppError] = useState(null);
  const [pcName, setPcName] = useState('');

  const [quotedText, setQuotedText] = useState('');
  const [suggestedText, setSuggestedText] = useState('');
  const [activePC, setActivePC] = useState(() => localStorage.getItem('ccr-active-pc') || '');
  const autoCreated = useRef(false);

  const [claudeReady, setClaudeReady] = useState(false);
  const handleSseState = useCallback((connected, status, ready) => {
    setSseState({ connected, status });
    if (ready !== undefined) setClaudeReady(ready);
  }, []);

  // 隠しコマンド: コナミコマンド（上上下下左右左右BA）
  const konamiRef = useRef([]);
  const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  useEffect(() => {
    const handler = (e) => {
      konamiRef.current.push(e.key);
      konamiRef.current = konamiRef.current.slice(-10);
      if (konamiRef.current.join(',') === KONAMI.join(',')) {
        document.documentElement.style.setProperty('--navi-glow', '#ff00ff');
        document.documentElement.style.setProperty('--navi-blue', '#9b30ff');
        document.title = 'CC Remote // SECRET MODE';
        alert('SECRET MODE ACTIVATED!');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ディープリンク: URLパラメータ or SW通知からセッション切替
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session');
    if (sid) { setActiveSession(sid); window.history.replaceState({}, '', '/'); }

    const handler = (event) => {
      if (event.data?.type === 'navigate-session' && event.data.sessionId) {
        setActiveSession(event.data.sessionId);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, []);

  // PC名取得 — v4: localStorage の label を使う（中央レジストリなし）
  const fetchPcName = useCallback(async () => {
    if (!activePC) { setPcName(''); return; }
    const pc = findPc(activePC);
    if (pc) setPcName(pc.label || '');
  }, [activePC]);

  // PC切り替え — v4: 選択された PC の tunnel URL を remoteBase にセット
  const handleSelectPC = useCallback((pcId, pcUrl) => {
    setActivePC(pcId);
    localStorage.setItem('ccr-active-pc', pcId);
    const isLocal = !pcUrl || pcUrl === window.location.origin;
    setRemoteBase(isLocal ? null : pcUrl);
    setActiveSession(null);
    autoCreated.current = false;
    fetchPcName();
  }, [fetchPcName]);

  useEffect(() => {
    if (isAuthenticated && token) fetchPcName();
  }, [isAuthenticated, token, fetchPcName]);

  // セッション0個 or 全部exited なら自動作成
  useEffect(() => {
    if (!isAuthenticated || !token || autoCreated.current) return;
    (async () => {
      try {
        const base = getApiBase();
        const headers = getAuthHeaders();
        const res = await fetch(`${base}/sessions`, { headers, mode: 'cors' });
        if (!res.ok) return;
        const sessions = await res.json();
        const running = sessions.find(s => s.status !== 'exited');
        if (running) {
          setActiveSession(running.id);
        } else {
          autoCreated.current = true;
          const createHeaders = { 'Content-Type': 'application/json', ...getAuthHeaders() };
          const createRes = await fetch(`${base}/sessions`, {
            method: 'POST',
            headers: createHeaders,
            mode: 'cors',
            body: JSON.stringify({ name: 'Session 1' }),
          });
          if (createRes.ok) {
            const session = await createRes.json();
            setActiveSession(session.id);
          }
        }
      } catch (e) {
        setAppError(e);
      }
    })();
  }, [isAuthenticated, token, activePC]);

  // 初回自動起動: ログイン済み かつ チュートリアル未視聴 → インタラクティブチュートリアル表示。
  useEffect(() => {
    const seen = localStorage.getItem('ccr-tutorial-seen');
    if (!seen && isAuthenticated) setShowTutorial(true);
  }, [isAuthenticated]);

  // Settings などからの再生要求を受けてチュートリアルを再起動する。
  useEffect(() => {
    const handler = () => setShowTutorial(true);
    window.addEventListener('ccr:show-tutorial', handler);
    return () => window.removeEventListener('ccr:show-tutorial', handler);
  }, []);

  // Rev 5: チュートリアルがモーダルを閉じる要求を発行する
  useEffect(() => {
    const closeSessions = () => setShowSessions(false);
    const closeSettings = () => setShowSettings(false);
    window.addEventListener('ccr:close-session-list', closeSessions);
    window.addEventListener('ccr:close-settings', closeSettings);
    return () => {
      window.removeEventListener('ccr:close-session-list', closeSessions);
      window.removeEventListener('ccr:close-settings', closeSettings);
    };
  }, []);

  // ブート演出（2.5秒）
  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 2500);
    return () => clearTimeout(t);
  }, []);


  if (booting) {
    return (
      <div className="flex flex-col items-center justify-center h-full cyber-floor relative">
        <div className="relative z-10 text-center">
          <div className="mx-auto mb-5 w-20 h-20 rounded-2xl bg-[#0a0a0b] flex items-center justify-center border border-cyber-600/30" style={{animation: 'glow-pulse 1s ease-in-out infinite'}}>
            <span className="text-[#22c55e] text-2xl font-mono font-bold">&gt;_C</span>
          </div>
          <div className="text-navi-glow font-pixel text-sm tracking-[0.25em] mb-3" style={{animation: 'fade-in 0.5s ease-out'}}>
            CC REMOTE
          </div>
          <div className="text-txt-muted font-mono text-[10px] mb-1" style={{animation: 'fade-in 0.8s ease-out'}}>
            v3.0 // NAVI SYSTEM
          </div>
          <div className="text-exe-green/60 font-mono text-[9px] animate-pulse mt-2">
            JACK IN...
          </div>
          <div className="mt-5 mx-auto w-40 h-1.5 bg-cyber-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-navi to-exe-green rounded-full" style={{animation: 'boot-bar 2.5s ease-in-out forwards'}} />
          </div>
        </div>
        <style>{`
          @keyframes boot-bar {
            0% { width: 0%; }
            30% { width: 40%; }
            60% { width: 70%; }
            90% { width: 95%; }
            100% { width: 100%; }
          }
        `}</style>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <PinLogin onLogin={login} />;
  }

  // Rev 5: tutorial を早期 return でも維持するためのオーバーレイ
  const tutorialOverlay = showTutorial ? (
    <Suspense fallback={null}>
      <InteractiveTutorial onClose={() => setShowTutorial(false)} />
    </Suspense>
  ) : null;

  if (showSettings) {
    return (
      <>
        <Suspense fallback={LazyFallback}>
          <Settings onClose={() => setShowSettings(false)} onLogout={logout} token={token} onPcChange={fetchPcName}
            onShowStatus={() => { setShowSettings(false); setShowStatus(true); }}
            onShowFiles={() => { setShowSettings(false); setShowFiles(true); }}
            onShowDashboard={() => { setShowSettings(false); setShowDashboard(true); }}
          />
        </Suspense>
        {tutorialOverlay}
      </>
    );
  }

  if (showStatus) {
    return (
      <>
        <Suspense fallback={LazyFallback}>
          <StatusPage token={token} onClose={() => setShowStatus(false)} />
        </Suspense>
        {tutorialOverlay}
      </>
    );
  }

  if (showFiles) {
    return (
      <>
        <Suspense fallback={LazyFallback}>
          <FileBrowser token={token} onClose={() => setShowFiles(false)} />
        </Suspense>
        {tutorialOverlay}
      </>
    );
  }

  if (showDashboard) {
    return (
      <>
        <Suspense fallback={LazyFallback}>
          <Dashboard token={token} onClose={() => setShowDashboard(false)} />
        </Suspense>
        {tutorialOverlay}
      </>
    );
  }

  return (
    <div className="flex flex-col h-full scanlines">
      {appError && (
        <ErrorDisplay
          error={appError}
          onRetry={() => { setAppError(null); window.location.reload(); }}
        />
      )}
      <Header
        onSettingsClick={() => setShowSettings(true)}
        connected={sseState.connected}
        status={sseState.status}
        pcName={pcName}

      />
      <PCTabs activePC={activePC} onSelectPC={handleSelectPC} onAddPC={() => setShowAddPC(true)} />
      {showAddPC && (
        <AddPCLocal
          onClose={() => setShowAddPC(false)}
          onAdded={(pc) => {
            setShowAddPC(false);
            window.dispatchEvent(new Event('cc-remote:pcs-changed'));
            if (pc) {
              handleSelectPC(pc.id, pc.url);
            }
          }}
        />
      )}
      <>
          <SessionBar
            activeSession={activeSession}
            onSelect={setActiveSession}
            token={token}
            onShowList={() => setShowSessions(true)}
          />
          {showSessions && (
            <Suspense fallback={LazyFallback}>
              <SessionList
                activeSession={activeSession}
                onSelect={setActiveSession}
                token={token}
                onClose={() => setShowSessions(false)}
              />
            </Suspense>
          )}
          {showTemplates && (
            <Suspense fallback={LazyFallback}>
              <Templates
                token={token}
                activeSessionId={activeSession}
                onClose={() => setShowTemplates(false)}
                onExecute={async (prompt) => {
                  if (activeSession) {
                    const hdrs = { 'Content-Type': 'application/json', ...getAuthHeaders() };
                    await fetch(`${getApiBase()}/sessions/${activeSession}/input`, {
                      method: 'POST',
                      headers: hdrs,
                      mode: 'cors',
                      body: JSON.stringify({ text: prompt + '\r' }),
                    });
                    setShowTemplates(false);
                  }
                }}
              />
            </Suspense>
          )}
          <Terminal
            sessionId={activeSession}
            token={token}
            onSseState={handleSseState}
            onAuthError={logout}
            onQuote={setQuotedText}
            onSuggest={setSuggestedText}
          />
          <InputArea sessionId={activeSession} token={token} onShowTemplates={() => setShowTemplates(true)} onShowSchedule={() => setShowSchedule(true)} quotedText={quotedText} onQuoteClear={() => setQuotedText('')} suggestedText={suggestedText} onSuggestClear={() => setSuggestedText('')} claudeReady={claudeReady} />
        </>

      {/* インタラクティブチュートリアル (初回自動 + Header 若葉マーク起動) */}
      {showTutorial && (
        <Suspense fallback={null}>
          <InteractiveTutorial onClose={() => setShowTutorial(false)} />
        </Suspense>
      )}

      {/* Rev 6: スケジュールパネル (旧タスクキュー置換) */}
      {showSchedule && (
        <Suspense fallback={null}>
          <SchedulePanel
            token={token}
            activeSessionId={activeSession}
            onClose={() => setShowSchedule(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

export default function AppWithBoundary() {
  return <ErrorBoundary><App /></ErrorBoundary>;
}
