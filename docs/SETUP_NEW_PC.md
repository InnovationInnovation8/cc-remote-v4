# CC-Remote v4 セットアップガイド（受信側 PC 用）

## このツールについて

CC-Remote v4 は、スマートフォンから自分の PC の Claude Code をリモート操作するツール。**完全 P2P・中央サーバーなし・OSS**。

**重要な前提（v3 と異なる）:**
- ❌ 配布者の Firebase / Cloud Run には接続しない
- ❌ 配布者はあなたのコマンドログを閲覧できない（中央サーバーがないので技術的に不可能）
- ✅ あなたの PC のサーバーに、あなたのスマホから直接接続するだけ
- ✅ 信頼点は明示宣言された 6 件のみ（README.md 参照）

---

## 前提条件チェック

セットアップ前に以下を確認:

- [ ] Node.js 18+ がインストール済み (`node --version`)
- [ ] cloudflared がインストール済み（後述）
- [ ] cc-remote-v4 ZIP を信頼できる経路（GitHub Releases 推奨）から DL 済み
- [ ] **ZIP 展開先が OneDrive 同期フォルダの "外"**（推奨: `C:\work\` や `C:\dev\`）
- [ ] PIN: 8 桁以上の数字を 1 つ決めておく

---

## セットアップ手順

### Step 1: ZIP の改竄検知

```powershell
CertUtil -hashfile cc-remote-v4.zip SHA256
```

GitHub Releases に公開された SHA-256 と一致することを確認。

### Step 2: ZIP 展開

```powershell
Expand-Archive cc-remote-v4.zip -DestinationPath C:\work\cc-remote
cd C:\work\cc-remote
```

### Step 3: cloudflared インストール

```powershell
winget install Cloudflare.cloudflared
```

または https://github.com/cloudflare/cloudflared/releases から DL。

### Step 4: 検証スクリプト実行（5 項目チェック）

```powershell
pwsh scripts/verify-package.ps1
```

5 項目すべて [PASS] が表示されることを確認。

### Step 5: 依存インストール

```powershell
npm install
```

### Step 6: フロントエンドビルド

```powershell
npm run build
```

### Step 7: サーバー起動

```powershell
node src/server/index.js
```

起動後、ターミナルに **トンネル URL + QR コード** が表示される。

### Step 8: スマホで接続 + PIN 設定

1. スマホで QR コードを読み取り → ブラウザで開く
2. 「PIN を設定」画面で **8 桁以上** の PIN を 2 回入力
3. ログイン完了 → Claude Code をスマホから操作可能

### Step 9: PWA インストール（推奨）

ブラウザのメニューから「ホーム画面に追加」→ アプリとして起動可能。

---

## ⚠️ Windows SmartScreen 警告

cloudflared.exe 初回実行時に SmartScreen の警告が出る場合あり。

「PC を保護しました」→ 「詳細情報」→ 「実行」で進む。

これは未署名バイナリ全般に出る警告。cloudflared は Cloudflare 公式バイナリで安全。不安なら https://github.com/cloudflare/cloudflared から自分で再 DL してハッシュ照合。

---

## 方法 B: Claude Code に頼む

[CLAUDE_PROMPT_FOR_NEW_PC.md](CLAUDE_PROMPT_FOR_NEW_PC.md) を Claude Code に貼り付けると、自動で Step 1〜8 を実行してくれる（ただし PIN 入力は必ず人間が行う）。

---

## トラブルシューティング

詰まったら → [TROUBLESHOOTING.md](TROUBLESHOOTING.md) を参照。

---

## セットアップ完了後

- スマホでブックマーク / PWA インストール
- PIN を入力してログイン
- 複数 PC を登録する場合は スマホ UI の「PC 追加」からトンネル URL を追加

サーバーは起動しっぱなしにする。停止したい場合は別ターミナルで `Ctrl+C` か `taskkill /F /PID <node のPID>`。

---

## セキュリティ注意事項

- `pc.env` には PC 固有の秘密情報が含まれます。**他人と共有しないでください**
- このサーバーは Cloudflare Tunnel 経由でインターネットに公開されます（PIN で保護）
- 信頼できるネットワーク環境での使用を推奨します
- 詳細: [docs/SECURITY.md](SECURITY.md)
