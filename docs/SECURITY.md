# CC Remote v4 — Security Design

このドキュメントは v4 の設計判断と信頼モデルを完全開示する。

---

## 1. North Star

> **「受信側摩擦ゼロ・信頼点完全開示」**
>
> 「ゼロ」= インストール作業のゼロではなく、**隠れた依存・隠れたコストのゼロ**。
> 配布者への技術的信頼ゼロ。依存する信頼点は全列挙・明示宣言し、受信側が各信頼点の根拠を検証可能にする。

---

## 2. v3 → v4 の経緯（何があったか）

### v3 の失敗（2026-04-13）

v3 を初めて第三者の PC に配布した際、受信側の Claude Code（同一 AI ツール）が**セットアップ実行を拒否**した。

拒否理由（受信側 Claude Code の判定）:

1. **CLAUDE.md 注入の可能性** — セットアップが将来の AI セッションを制御する指示ファイルを書く設計だった
2. **`--auto-startup` バックドアパターン** — Windows 起動時に自動で常駐
3. **FileBrowser** — スマホからファイルシステム閲覧
4. **常時 WebSocket 接続** — 中央サーバーへの persistent C2 チャネル
5. **単一管理者 Firebase** — 配布者が全ユーザーのコマンドログを集中閲覧可能

これは「便利機能の積み上げ」が「監視ツール構成要件」と一致してしまった結果。**実装側（私）は便利と思っていたが、第三者から見るとマルウェア配布パターンに合致**。

### v4 の方針

v3 の失敗を受け、ralplan（Planner→Architect→Critic 合議）で再設計:

- **中央 Firebase / Cloud Run 完全廃止**（P2P 直通）
- **CLAUDE.md / AGENTS.md 自動生成は絶対作らない**
- **`--auto-startup` / FileBrowser はデフォルト OFF**（明示 opt-in 必須）
- **配布者がログを見る経路を構造的に排除**

詳細経緯: 配布失敗の3ラウンド評価記録は `~/OneDrive/ナレッジ/プロダクト配布_セキュリティ設計原則.md` 参照（プロジェクト外、配布者管理）。

---

## 3. 信頼点リスト（全 6 件、これ以上もこれ以下もない）

| # | 信頼点 | なぜ必要か | 検証手段 |
|---|---|---|---|
| 1 | **Cloudflare** | tunnel relay (Quick Tunnel) | 著名第三者・公開された会社 |
| 2 | **Node.js 公式** | ランタイム | https://nodejs.org/ 公式 SHA-256 照合 |
| 3 | **cloudflared 公式** | tunnel バイナリ | https://github.com/cloudflare/cloudflared 公式署名 |
| 4 | **npm registry** | 依存解決 | `package-lock.json` の integrity フィールド (`npm ci --ignore-scripts`) |
| 5 | **Microsoft SmartScreen** | バイナリ評判 | 初回警告表示、受信側が判断 |
| 6 | **配布 ZIP SHA-256** | 改竄検知 | `CertUtil -hashfile ... SHA256` を公開ハッシュと突合 |

**この 6 件以外への信頼は要求しない。**

特に: **配布者（このツールを送ってきた人）への信頼は不要。**

---

## 4. 受信側で実行可能な検証コマンド（合格基準 5 項目）

```powershell
pwsh scripts/verify-package.ps1 -ZipPath cc-remote.zip -ExpectedHash <公開ハッシュ値>
```

各項目の詳細:

### Check 1: ZIP integrity
```
CertUtil -hashfile cc-remote.zip SHA256
```
期待値: GitHub Releases に公開された SHA-256 と一致。

### Check 2: タスクスケジューラ未登録
```
schtasks /query | findstr cc-remote
```
期待値: 空出力。CC Remote はタスクスケジューラに何も書き込まない。

### Check 3: Run キー未登録
```
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" | findstr cc-remote
```
期待値: 空出力。CC Remote はレジストリの自動起動キーに何も書き込まない（`--auto-startup` フラグなしの場合）。

### Check 4: npm 依存 integrity
```
npm ci --ignore-scripts --dry-run
```
期待値: exit 0。`package-lock.json` の integrity ハッシュが node_modules と一致。

### Check 5: ポート listener 限定
```
netstat -ano | findstr :3737
```
期待値: node.exe プロセスのみが LISTENING。他のプロセスがポートを使っていない。

---

## 5. v4 が「絶対作らない」設計（明示）

これらは v3 で問題になった or 第三者拒否リスクのある機能。v4 では構造的に排除。

### ❌ AI 指示ファイルの自動生成
- `CLAUDE.md`, `AGENTS.md`, `.claude/`, `.cursor/rules` 等を自動書き込みしない
- 理由: 将来の AI セッションを制御するベクトル

### ❌ 永続化機構のデフォルト ON
- タスクスケジューラ登録なし
- HKCU\...\Run キー書き込みなし
- スタートアップフォルダへの .vbs / .lnk 設置なし
- `--auto-startup` フラグ明示時のみ Run キー登録（受信側が能動的に許可）

### ❌ ファイル閲覧機能のデフォルト ON
- v4 MVP では FileBrowser は無効化（環境変数で opt-in 予定 v4.1）
- v3 では `/api/files` がホームディレクトリ全体を返す設計だった → v4.1 で `Documents/Desktop/Downloads` 限定に絞る

### ❌ 中央認証・ログ収集
- Firebase Authentication 廃止
- Cloud Run 中継廃止
- すべての認証・ログは各 PC ローカルで完結

### ❌ 自動更新
- npm 自動更新なし
- セルフアップデート機構なし
- 受信側が明示的に新バージョン ZIP を DL する

### ❌ 時限ペアリングコード / 「信頼してください」文言
- ソーシャルエンジニアリングの典型パターン
- v4 は tunnel URL + PIN のみで完結

### ❌ コード難読化・minify
- 配布 ZIP 内のコードは全て読める
- vite ビルドは production minify されるが、ソースマップ付き or 元ソースが含まれる

---

## 6. v4 の認証モデル

```
スマホ PWA ──HTTPS──> Cloudflare Tunnel ──> PC ローカルサーバー (port 3737)
                                                  │
                                                  ├── PIN (scrypt 8桁以上)
                                                  └── PC 内 SQLite (cc-remote.db)
```

- **PIN**: 8 桁以上、scrypt ハッシュ（CPU-hard、ブルートフォース耐性）
- **トークン**: 24 時間 TTL の in-memory トークン、`x-pin` ヘッダーで送信
- **rate limit**: TODO v4.1 で /api/auth/login に追加予定
- **HTTPS**: Cloudflare Tunnel 経由なので強制 HTTPS

---

## 7. 第三者監査手順

このプロジェクトを第三者が監査する場合の推奨手順:

1. **コード読み取り**:
   ```
   src/server/auth.js    認証ロジック（184 行、Firebase なし）
   src/server/index.js   サーバーエントリ（CORS, CSP, ルート定義）
   src/server/tunnel.js  cloudflared 起動管理
   src/client/utils/api.js   クライアント API（外部依存ゼロ）
   ```

2. **依存監査**:
   ```
   npm audit
   cat package-lock.json | grep integrity | head -20
   ```

3. **ZIP 検証**:
   ```
   pwsh scripts/verify-package.ps1 -ZipPath cc-remote-v4.zip
   ```

4. **動的検証**（別ポートで起動）:
   ```
   PORT=3738 node src/server/index.js
   netstat -ano | findstr :3738
   curl http://localhost:3738/api/auth/status
   ```

5. **Issue 報告**: 脆弱性発見時は GitHub Issues か security 窓口に。

---

## 8. 既知の制約

- **Windows 専用**（v4 MVP）— Mac/Linux は v4.1+
- **Cloudflare 依存**（tunnel）— Cloudflare がダウンしたら使えない
- **PIN brute-force rate limiter なし**（v4.1 で追加予定、現状 scrypt + 8桁強制で実用上の耐性は確保）
- **WebAuthn 廃止**（v4 MVP、v4.1 で opt-in 復活予定）
- **会社 PC 利用規程衝突**: 配布対象が法人 PC の場合は IT 部門承認推奨

---

## 9. 設計原則の出典

- **Stranger Test**: 「見知らぬ人から受け取ったら実行するか？」
- **Adversarial Review**: 第三者 AI / security-reviewer による拒否シミュレーション
- **信頼点完全開示**: 全依存点を README / SECURITY.md に列挙

詳細原則は `~/OneDrive/ナレッジ/プロダクト配布_セキュリティ設計原則.md`（プロジェクト外、配布者管理）。
