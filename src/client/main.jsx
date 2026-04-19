import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import { installGlobalErrorHandlers, logClient } from './utils/clientLogger';
import { initAnalytics, isAnalyticsOptedOut } from './utils/analytics';

// Install global error reporting as early as possible so bootstrap errors are caught.
installGlobalErrorHandlers();
// Send a boot ping so we can confirm fresh bundles are loading.
logClient('boot', `boot ${new Date().toISOString()}`, { href: location.href });
// 分析（PostHog / Sentry）初期化。env に key がなければ何もしない。
// ユーザーがオプトアウトしていればスキップ。
if (!isAnalyticsOptedOut()) {
  initAnalytics();
}

// テーマ復元
if (localStorage.getItem('ccr-theme') === 'light') {
  document.documentElement.classList.add('light-mode');
}
// カスタムカラー復元
const savedAccent = localStorage.getItem('ccr-theme-accent');
const savedPrimary = localStorage.getItem('ccr-theme-primary');
if (savedAccent) document.documentElement.style.setProperty('--navi-glow', savedAccent);
if (savedPrimary) document.documentElement.style.setProperty('--navi-blue', savedPrimary);
// フォント復元
const savedFont = localStorage.getItem('ccr-font');
if (savedFont) document.body.style.fontFamily = savedFont;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
