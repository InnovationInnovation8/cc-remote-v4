# CC-Remote v3 — 開発者向け CLAUDE.md

このファイルは **開発作業時** に読むプロジェクト固有ルール。配布セットアップ用の `build/CLAUDE.md` / `scripts/dist-assets/CLAUDE.md` とは目的が異なる。

## プロジェクト概要

スマホから PC の Claude Code セッションをリモート操作する PWA + Cloudflare Tunnel + Node dispatcher。

## 開発ルール（プロジェクト固有）

### SSE禁止（リアルタイム通信）
CC-Remote のリアルタイム通信は **SSE（Server-Sent Events）を使わない**。Cloudflare Tunnel と非互換で、実装しても本番で切断が頻発する。**ポーリング方式（500ms インターバル）固定**。

- 背景: 初期実装で SSE を採用したが、Cloudflare Tunnel 経由で接続維持に失敗 → 全面的にポーリングへ切り替え済
- 該当箇所: `src/server/index.js` の transport 層、`src/client/*` の subscribe ロジック
- 例外: なし（現時点でポーリング以外の選択肢は検討しない）

### 本番操作前の前提宣言
以下の操作前には1行で前提を宣言してから実行（グローバル ~/.claude/CLAUDE.md の「本番操作前の前提明示」ルールの CC-Remote 具体例）:
- `gcloud run deploy cc-remote-api` — Cloud Run 本番デプロイ
- `wrangler deploy` — Cloudflare Workers デプロイ
- ChatWork 通知送信（room 428249372 = 本番通知ルーム）

### デプロイ後の agent 再起動
Cloud Run / Cloudflare deploy 後は **必ず Agent を再起動** する（古い接続を掴んだまま動作し続けるバグあり）。

## 参照

- Global rules: `~/.claude/CLAUDE.md`
- 配布セットアップ: `build/CLAUDE.md`, `scripts/dist-assets/CLAUDE.md`
- 構成詳細: `README.md`, `SETUP.md`, `HANDOFF_*.md`
