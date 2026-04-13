// Client-side error/log reporter — sends unhandled errors to cloud-server/api/client-log
// so they can be tailed from the dev server logs for remote debugging.
//
// Hooks:
//   - window.onerror
//   - window.addEventListener('unhandledrejection')
//   - A manual logClient(level, message, extra) helper that anything can call
//
// Rate-limited client-side (max 30 reports per 60s) to avoid saturating the sink.

import { getCloudUrl, isCloudMode } from './api';

const REPORT_WINDOW_MS = 60 * 1000;
const REPORT_MAX = 30;
let reportTimestamps = [];

function canReport() {
  const now = Date.now();
  reportTimestamps = reportTimestamps.filter(t => now - t < REPORT_WINDOW_MS);
  if (reportTimestamps.length >= REPORT_MAX) return false;
  reportTimestamps.push(now);
  return true;
}

function resolveEndpoint() {
  // Prefer cloud-server URL; fall back to same-origin
  const cloud = isCloudMode() ? getCloudUrl() : '';
  return `${cloud}/api/client-log`;
}

export function logClient(level, message, extra) {
  try {
    if (!canReport()) return;
    const payload = {
      level: String(level || 'info').slice(0, 20),
      message: String(message || '').slice(0, 500),
      url: location.href,
      userAgent: navigator.userAgent,
      stack: (extra && extra.stack) || null,
      extra: extra ? (typeof extra === 'object' ? { ...extra, stack: undefined } : { value: String(extra) }) : null,
    };
    fetch(resolveEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export function installGlobalErrorHandlers() {
  if (typeof window === 'undefined') return;
  if (window.__clientLoggerInstalled) return;
  window.__clientLoggerInstalled = true;

  window.addEventListener('error', (event) => {
    const err = event?.error;
    logClient('error', event?.message || 'window.onerror', {
      stack: err?.stack || null,
      source: event?.filename || null,
      lineno: event?.lineno || null,
      colno: event?.colno || null,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const message = reason?.message || String(reason || 'unhandledrejection');
    const stack = reason?.stack || null;
    logClient('unhandledrejection', message, { stack });
  });

  // Wrap console.error to also ship to server (keep original behavior)
  const origErr = console.error.bind(console);
  console.error = (...args) => {
    origErr(...args);
    try {
      const firstStack = args.find(a => a && a.stack)?.stack || null;
      logClient('console.error', args.map(a => {
        if (a instanceof Error) return a.message;
        if (typeof a === 'object') { try { return JSON.stringify(a).slice(0, 200); } catch { return '[obj]'; } }
        return String(a).slice(0, 200);
      }).join(' '), firstStack ? { stack: firstStack } : null);
    } catch {}
  };
}
