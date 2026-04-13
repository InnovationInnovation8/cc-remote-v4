# CC Remote v4

スマホから自分の PC の Claude Code をリモート操作するツール。**完全 P2P・中央サーバーなし・OSS**。

> **v4 の North Star**: 「受信側摩擦ゼロ・信頼点完全開示」
> 配布者を信頼する必要はない。依存する信頼点は全部下に書いてある。

---

## 🧭 信頼点（全 6 件、これだけ）

このツールが依存している外部サービス・コード源は以下のみ。それ以外への依存はゼロ。

| # | 信頼点 | 役割 | 受信側の検証手段 |
|---|---|---|---|
| 1 | Cloudflare | tunnel relay（無料 Quick Tunnel）| 著名第三者 |
| 2 | Node.js 公式 | ランタイム | https://nodejs.org/ から DL、SHA-256 照合可 |
| 3 | cloudflared 公式 GitHub Releases | バイナリ | https://github.com/cloudflare/cloudflared から DL、署名・ハッシュ照合可 |
| 4 | npm registry | 依存解決 | `package-lock.json` の integrity フィールド |
| 5 | Microsoft SmartScreen | バイナリ評判 | 警告表示あり、受信側判断 |
| 6 | 配布 ZIP SHA-256 | 改竄検知 | `pwsh scripts/verify-package.ps1 -ZipPath ... -ExpectedHash ...` |

**配布者（あなた）への技術的信頼はゼロ。** 配布者が悪意を持っていても、設計上被害は発生しない。

---

## 🚫 v4 が作らないもの（明示）

| 項目 | 理由 |
|---|---|
| 中央サーバー（Firebase / Cloud Run）| 配布者がログを集中閲覧できない |
| 自動更新機能 | 受信側が知らない更新を防ぐ |
| Windows 自動起動（auto-startup デフォルト有効）| 永続化バックドアパターン回避 |
| FileBrowser デフォルト有効 | 暗黙のファイル閲覧権限付与回避 |
| CLAUDE.md / AGENTS.md 自動生成 | 将来の AI セッション制御回避 |
| 時限ペアリングコード | ソーシャルエンジニアリング回避 |
| 「信頼してください」文言 | ソーシャルエンジニアリング回避 |
| コード難読化・minify | 受信側が実行前に全コードを読める |

詳細: [docs/SECURITY.md](docs/SECURITY.md)

---

## 📋 受信側の検証コマンド（5 項目）

ZIP DL 後、`pwsh scripts/verify-package.ps1` で 5 項目すべて pass を確認:

```powershell
pwsh scripts/verify-package.ps1 -ZipPath cc-remote.zip -ExpectedHash <公開ハッシュ値>
```

| # | チェック | 期待値 |
|---|---|---|
| 1 | `CertUtil -hashfile <ZIP> SHA256` | GitHub Releases に公開された値と一致 |
| 2 | `schtasks /query \| findstr cc-remote` | 空出力（タスクスケジューラ未登録）|
| 3 | `reg query HKCU\...\Run \| findstr cc-remote` | 空出力（Run キー未登録）|
| 4 | `npm ci --ignore-scripts` | exit 0（依存 integrity OK）|
| 5 | `netstat -ano \| findstr :3737` | node プロセスのみ LISTENING |

---

## ⚠️ Windows SmartScreen 警告について

cloudflared.exe を初回実行時に SmartScreen の警告が出ることがある。

- 「PC を保護しました」→「詳細情報」→「実行」で進める
- これは未署名バイナリ全般に出る警告で、cloudflared は Cloudflare 公式バイナリ
- 不安なら https://github.com/cloudflare/cloudflared から自分で DL してハッシュ照合

---

## 🚀 セットアップ手順

### 受信側（このツールを使う人）

1. **Node.js 18+ をインストール**（公式: https://nodejs.org/）
2. **cloudflared をインストール** — `winget install Cloudflare.cloudflared` か https://github.com/cloudflare/cloudflared/releases から DL
3. **ZIP を展開**（OneDrive 同期外推奨、例: `C:\work\cc-remote\`）
4. **検証**: `pwsh scripts/verify-package.ps1`（5 項目 pass を確認）
5. **依存インストール**: `npm install`
6. **ビルド**: `npm run build`
7. **起動**: `node src/server/index.js`
8. **QR コードが表示される** → スマホで読み取って初回アクセス、PIN（8 桁以上）を設定

詳細: [docs/SETUP_NEW_PC.md](docs/SETUP_NEW_PC.md)

### 配布者（このツールを配る人）

1. このリポジトリを clone
2. `npm install`
3. `npm run build`
4. `npm run build:zip` → `CC-Remote-v4-YYYYMMDD.zip` が生成される
5. `CertUtil -hashfile CC-Remote-v4-YYYYMMDD.zip SHA256` でハッシュ取得
6. GitHub Releases にアップロード（ハッシュも公開）
7. 配布: GitHub Releases URL を共有（Chat ZIP は推奨しない）

詳細: [docs/ADMIN_CHECKLIST.md](docs/ADMIN_CHECKLIST.md)

---

## 🔧 技術構成

- **Server**: Node.js + Express + node-pty + sql.js + cloudflared
- **Client**: React + Vite (PWA)
- **Auth**: PIN（scrypt、8 桁以上）
- **Tunnel**: Cloudflare Quick Tunnel（無料・登録不要・ランダム URL）
- **PC 管理**: スマホ側 localStorage（複数 PC 登録可、URL ペースト or QR 読取）
- **通知**: 各 PC ローカルログのみ（v4 では Web Push 廃止、v4.1 で opt-in）

---

## 📂 ディレクトリ構成

```
cc-remote/
├── src/
│   ├── server/        Node.js サーバー（PTY、認証、tunnel 管理）
│   └── client/        React PWA（スマホ UI）
├── scripts/
│   ├── setup.js       初回セットアップ
│   ├── build-zip.mjs  配布 ZIP ビルド
│   ├── qr.js          tunnel URL → QR
│   └── verify-package.ps1  受信者検証スクリプト
├── docs/
│   ├── SECURITY.md           設計理由・第三者監査手順
│   ├── SETUP_NEW_PC.md       受信側セットアップ手順
│   ├── CLAUDE_PROMPT_FOR_NEW_PC.md  Claude Code 向け指示書
│   ├── ADMIN_CHECKLIST.md    配布者チェックリスト
│   └── TROUBLESHOOTING.md    エラー対処
└── package.json
```

---

## 🤝 ライセンス・コントリビューション

OSS。コードは全部公開。難読化・minify なし。Issue / PR 歓迎。

---

## ❓ よくある質問

**Q: 配布者は私のコマンドログを見れる？**
A: 見れない。中央サーバーがないので、技術的に不可能。

**Q: 課金される？**
A: ¥0。Cloudflare Tunnel 無料、Node.js / cloudflared 無料、GitHub Releases 無料。

**Q: アカウント登録必要？**
A: 不要。GitHub アカウントすら不要（公開リリースから匿名 DL 可）。

**Q: Mac で動く？**
A: v4 MVP は Windows のみ検証。Mac サポートは v4.1+ で。

**Q: 自動起動する？**
A: しない。明示的な opt-in（`--auto-startup` フラグ）が必要。デフォルト OFF。
