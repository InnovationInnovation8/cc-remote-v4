# CC-Remote サイドバー 2 状態化 — 実機 10 周 QA チェックリスト

作成: 2026-04-19 23:50
対象: autopilot 完走版（App.jsx / Sidebar.jsx / Header.jsx、backup `*_20260419_2110.jsx` 保持）
根拠: [handover_ccremote_sidebar_2state_20260419_2040.md](~/.claude/projects/C--Users-lkoro/memory/handover_ccremote_sidebar_2state_20260419_2040.md)

Claude Playwright 1 iter + architect/code-reviewer/security-reviewer APPROVE 済。ここから user が実機 10 周回して完了。

---

## 🚀 事前セットアップ（どのルートで実機確認するか選ぶ）

### ルート A: ローカル PC で PC 5 周のみ（モバイル後回し）

1. dev server が 5173 で既に生きているので、Chrome で `http://localhost:5173/?dev=1` を開く
2. F12 → Application → IndexedDB → `ccr-store` でシード確認:
   ```
   ccr-active-pc: dev-pc
   ccr-active-pclabel: dev-pc
   ccr-sidebar-state: open
   ```
   未セットなら Console で:
   ```js
   (async () => {
     const r = indexedDB.open('ccr-store');
     r.onsuccess = e => {
       const db = e.target.result, t = db.transaction('kv','readwrite'), s = t.objectStore('kv');
       s.put({k:'ccr-active-pc', v:'dev-pc'});
       s.put({k:'ccr-active-pclabel', v:'dev-pc'});
       s.put({k:'ccr-sidebar-state', v:'open'});
     };
   })();
   ```
3. リロードして画面表示確認

### ルート B: スマホ 5 周込みで LAN 経由 ✅ 2026-04-20 0:10 セットアップ完了

vite LAN bind 済 (`0.0.0.0:5173 PID 39584`、HTTP 200 確認済)。スマホ seed 用の `/dev_seed.html` も設置済。

**アクセス URL (スマホと PC 共通):**
- seed ページ: `http://192.168.1.45:5173/dev_seed.html`
- アプリ本体: `http://192.168.1.45:5173/?dev=1`

**スマホ実機手順 (iPhone / Android 共通):**
1. スマホと M会社PC が同じ WiFi であることを確認
2. スマホブラウザで `http://192.168.1.45:5173/dev_seed.html` を開く
3. ラジオで `open` 選択 → ① Seed ボタン → ログに `OK seeded:` 表示
4. ② 「/?dev=1 へ進む」ボタンでアプリへ
5. 以下 SP-1〜SP-5 を実施 (下の「スマホ用チェック」参照)
6. 次周は seed ページで状態を切替（open/closed/full/hidden）→ 旧値マイグレも 1 周でテスト可

**PC 手順:**
- Chrome で同じ `http://192.168.1.45:5173/dev_seed.html` → seed → `?dev=1`
- または F12 Console で直接 IDB 操作でも OK

### ルート C: production へ deploy してから実機（最も実環境に近い）

⚠ 本番操作。実行前に user 宣言が必要:
> 前提: firebase hosting cc-remote-v4（本番 PWA）, 期待結果: 2 状態サイドバー版が https://... で配信開始, 件数/影響範囲: dist/ 全差し替え

手順:
```bash
cd ~/OneDrive/Claude秘書/開発部/cc-remote-v3
npm run build        # dist/ 更新
firebase deploy --only hosting
# デプロイ後は agent を再起動（CC-Remote ルール）
```
本番 URL はユーザーの環境で把握（開発者向け `.firebaserc` または hosting console 参照）。

---

## ✅ 10 周 QA チェックリスト

**PC 5 周** = デスクトップ Chrome（ウィンドウ幅 > 768px）
**スマホ 5 周** = iPhone / Android 実機（ウィンドウ幅 ≤ 768px → overlay モード）

各周ごとに **page reload → ☰ 1 回クリック → 検証** を 1 セット。5 セット連続で全 PASS なら合格。

### PC 用チェック（各周）

| # | 項目 | 期待 | P/F |
|---|---|---|---|
| PC-1 | page reload 後の初期状態 | Sidebar 240px 表示 (open)、☰ aria-label `(open)` | |
| PC-2 | ☰ クリック | Sidebar 幅 0 に縮退 (closed)、トランジション滑らか (200ms) | |
| PC-3 | もう一度 ☰ | Sidebar 240px 復帰 (open) | |
| PC-4 | 連続 5 回連打 | 最終状態が見た目と IDB で一致、flash なし | |
| PC-5 | closed 時 overlay 非表示 | closed でも overlay は desktop で出ない | |

### スマホ用チェック（各周）

| # | 項目 | 期待 | P/F |
|---|---|---|---|
| SP-1 | page reload 後 | Sidebar 非表示 (closed) or 240px (open) — IDB の現在値に従う | |
| SP-2 | closed で ☰ タップ | overlay が開く（backdrop + sidebar slide-in） | |
| SP-3 | backdrop タップ | overlay 閉じる | |
| SP-4 | open 状態で ☰ タップ | closed へトグル（overlay でなく 2 状態側が変わる） | |
| SP-5 | iOS Safari: overlay タップ反応 | tap → close の遅延なし（Safari 300ms 非出現） | |

### 共通（10 周通し）

| # | 項目 | 期待 | P/F |
|---|---|---|---|
| ALL-1 | IDB 永続化 | リロード後も `ccr-sidebar-state` の値が維持される | |
| ALL-2 | コンソールエラー 0 | F12 Console に error 赤字が出ない | |
| ALL-3 | 旧値マイグレ（1 周目のみ） | 旧 PC で `full` → `open`、`icon`/`hidden` → `closed` に自動変換 | |

---

## ⛔ 落ちた場合の一次対応

1. PC 環境: F12 → Console のエラー文言を hancover に追記
2. スマホ: 同現象を PC Chrome DevTools → device mode (375x667) で再現試行
3. 再現すれば実装バグ → backup 復元 & 再調査:
   ```bash
   cd ~/OneDrive/Claude秘書/開発部/cc-remote-v3/src/client
   cp App_20260419_2110.jsx App.jsx
   cp components/Sidebar_20260419_2110.jsx components/Sidebar.jsx
   cp components/Header_20260419_2110.jsx components/Header.jsx
   ```
   その後 IDB の `ccr-sidebar-state` キーも削除してから再検証。

---

## 📝 完了後アクション

10 周全 PASS:
- handover (`handover_ccremote_sidebar_2state_20260419_2040.md`) を `.trash/` へ退避（7日ポリシー）
- backup (`*_20260419_2110.jsx` 3 本) もそのまま保持（ファイル削除禁止ルール準拠）
- 本 QA チェックリスト（このファイル）は `docs/qa/` 配下に移動で OK
