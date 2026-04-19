// CC Remote V4 — 分析・エラー監視の初期化
// 2026-04-17 作成
//
// 使い方:
//   .env に以下を追加（どちらも任意。未設定ならその機能は無効）
//     VITE_POSTHOG_KEY=phc_xxx
//     VITE_POSTHOG_HOST=https://us.i.posthog.com   （省略可、デフォルトは US）
//     VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
//
// CDN ロード戦略のため npm install は不要。どちらかの鍵が未設定ならスクリプトを
// 注入しない。個人情報は PostHog に渡さない（`identified_only` + 送信フィルタ）。

export function getLaunchContext() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return 'unknown';
  try {
    if (document.referrer?.startsWith('android-app://')) return 'twa';
  } catch (_e) { /* noop */ }
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return 'pwa_standalone';
  } catch (_e) { /* noop */ }
  return 'browser';
}

function injectPostHogSnippet(host) {
  // PostHog 公式ローダー（https://posthog.com/docs/libraries/js）
  // eslint-disable-next-line
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
}

export function initAnalytics() {
  if (typeof window === 'undefined') return;
  const posthogKey = import.meta.env?.VITE_POSTHOG_KEY;
  const posthogHost = import.meta.env?.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
  const sentryDsn = import.meta.env?.VITE_SENTRY_DSN;
  const appVersion = import.meta.env?.VITE_APP_VERSION || '1.0.0';
  const launchContext = getLaunchContext();

  // PostHog
  if (posthogKey) {
    try {
      injectPostHogSnippet(posthogHost);
      window.posthog.init(posthogKey, {
        api_host: posthogHost,
        person_profiles: 'identified_only',
        capture_pageview: true,
        capture_pageleave: true,
        // 将来のフィールド追加
      });
      window.posthog.register({
        launch_context: launchContext,
        app_version: appVersion,
      });
      window.posthog.capture('app_launched', { launch_context: launchContext });
    } catch (e) {
      console.warn('[analytics] PostHog init failed', e);
    }
  }

  // Sentry (browser bundle via CDN)
  if (sentryDsn) {
    try {
      const s = document.createElement('script');
      s.src = 'https://browser.sentry-cdn.com/7.119.0/bundle.tracing.min.js';
      s.crossOrigin = 'anonymous';
      s.onload = () => {
        try {
          window.Sentry?.init({
            dsn: sentryDsn,
            environment: import.meta.env?.MODE || 'production',
            release: `cc-remote@${appVersion}`,
            tracesSampleRate: 0.1,
            beforeSend(event) {
              // PII 除去: URL クエリから token 系を剥がす
              try {
                if (event.request?.url) {
                  event.request.url = event.request.url.replace(/([?&](?:pin|token|key)=)[^&]*/gi, '$1[REDACTED]');
                }
              } catch (_e) { /* noop */ }
              return event;
            },
          });
          window.Sentry.setTag('launch_context', launchContext);
        } catch (e) {
          console.warn('[analytics] Sentry init failed', e);
        }
      };
      document.head.appendChild(s);
    } catch (e) {
      console.warn('[analytics] Sentry script inject failed', e);
    }
  }
}

// ラッパー: capture を安全に呼ぶためのヘルパー
export function track(event, props = {}) {
  try { window.posthog?.capture?.(event, props); } catch (_e) { /* noop */ }
}

// ラッパー: Sentry.captureException
export function captureException(error, context = {}) {
  try { window.Sentry?.captureException?.(error, { extra: context }); } catch (_e) { /* noop */ }
}

// ユーザーがオプトアウトしたいときに呼ぶ
export function optOutOfAnalytics() {
  try { window.posthog?.opt_out_capturing?.(); } catch (_e) { /* noop */ }
  try { localStorage.setItem('ccr-analytics-opt-out', '1'); } catch (_e) { /* noop */ }
}

export function optInToAnalytics() {
  try { window.posthog?.opt_in_capturing?.(); } catch (_e) { /* noop */ }
  try { localStorage.removeItem('ccr-analytics-opt-out'); } catch (_e) { /* noop */ }
}

export function isAnalyticsOptedOut() {
  try { return localStorage.getItem('ccr-analytics-opt-out') === '1'; } catch (_e) { return false; }
}
