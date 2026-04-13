# CC-Remote v4 トラブルシューティング

セットアップ・運用で遭遇する主要エラーと対処法。

---

## サーバー起動エラー

### 症状: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...'`
原因: `npm install` 未実行、または依存関係不整合。

対処:
```bash
rm -rf node_modules package-lock.json  # Linux/macOS
# Windows: rmdir /s node_modules && del package-lock.json
npm install
```

### 症状: `Error: listen EADDRINUSE: address already in use :::3737`
原因: ポート 3737 が他のプロセスで使用中。

対処:
```powershell
netstat -ano | findstr :3737
# 出力の末尾 PID を確認
taskkill /F /PID <PID>
```

別ポートで起動する場合:
```powershell
$env:PORT=3738; node src/server/index.js
```

### 症状: `[Tunnel] cloudflared が見つかりません`
原因: cloudflared 未インストール。

対処:
```powershell
winget install Cloudflare.cloudflared
```

または https://github.com/cloudflare/cloudflared/releases から DL してパスを通す。

### 症状: `Tunnel URL 取得タイムアウト`
原因: ネットワーク到達不能、企業 Firewall で outbound HTTPS が制限されている。

対処:
- ネットワーク確認: `ping cloudflare.com`
- 企業 PC の場合: IT 部門に確認
- VPN 環境では VPN を一時 OFF して試す

---

## スマホ接続エラー

### 症状: ブラウザで「このサイトにアクセスできません」
原因: tunnel URL が無効化された（cloudflared 再起動で URL が変わる）。

対処:
- PC のターミナルで最新の tunnel URL / QR を確認
- スマホ localStorage の古い PC エントリを削除して再追加

### 症状: PIN 入力後 401「認証が必要です」
原因: PIN ハッシュ不一致 or トークン期限切れ（24 時間 TTL）。

対処:
- 8 桁以上で再入力
- 失敗が続く場合は PC 側で `cc-remote.db` を削除して PIN を再設定:
  ```powershell
  # cc-remote.db のパス
  %LOCALAPPDATA%\cc-remote\cc-remote.db
  ```

### 症状: PIN 設定で「PIN は 8 文字以上で入力してください」
原因: v4 は 8 桁以上強制（v3 は 4 桁だった）。

対処: 8 桁以上の数字で再設定。

---

## 検証スクリプトエラー

### 症状: `pwsh: command not found`
原因: PowerShell Core 未インストール（Windows 10 以前は組み込みで pwsh ない場合あり）。

対処:
```powershell
winget install Microsoft.PowerShell
```

または `powershell scripts/verify-package.ps1`（古い PowerShell でも動作）。

### 症状: Check 4 (npm ci) FAIL
原因: `package-lock.json` が壊れている / Node バージョン不一致。

対処:
- Node.js を v18+ に更新
- `package-lock.json` を再生成: `rm package-lock.json && npm install`

### 症状: Check 5 (port 3737) で他のプロセス検知
原因: 別のサービスがポート 3737 を使っている。

対処: `taskkill /F /PID <PID>` で停止、または `PORT=3738` で起動。

---

## ZIP / 配布検証エラー

### 症状: `CertUtil -hashfile` の値が GitHub Releases と一致しない
原因: ZIP が改竄された可能性 OR 古いバージョンの ZIP。

対処:
- GitHub Releases から再 DL
- DL 中にネットワークエラーがなかったか確認
- 一致しない場合は **絶対にインストールしない**

### 症状: build-zip.mjs が `[HARD BLOCK]` で停止
原因: 配布禁止ファイル（firebase-admin-key.json 等）が混入している。

対処:
- 表示されたファイルを削除 or .gitignore 追加
- `.trash/` に退避
- 再度 `npm run build:zip`

---

## ビルドエラー

### 症状: `vite build` が `Could not resolve "./XYZ"` で失敗
原因: import 元のファイルが存在しない（v3 → v4 移行で削除されたものを参照している）。

対処:
- エラーメッセージのファイルパスを確認
- `.trash/_20260413_v4_start/` に該当ファイルがあれば、それを参照しているコードを削除
- 詳細: `progress.txt` の Phase 2 学習を参照

---

## ネットワーク・企業環境

### 企業 PC で動かない
原因: IT 部門の制約。

可能性:
- Windows Defender / EDR が cloudflared.exe をブロック
- 企業 Firewall が outbound HTTPS を制限
- 利用規程上、外部公開ツールの使用が禁止

対処: IT 部門に確認。CC Remote の使用許可を取得してから進める。

---

## ログの場所

- サーバーログ: ターミナル出力（stdout/stderr）
- DB: `%LOCALAPPDATA%\cc-remote\cc-remote.db`
- PC identity: `%LOCALAPPDATA%\cc-remote\pc.env`
- 設定: `<プロジェクトルート>\.env`（v4 はオプション）

---

## それでも解決しない場合

GitHub Issues に以下を添えて報告:
- `node --version`
- `cloudflared --version`
- `pwsh scripts/verify-package.ps1` の出力
- エラーメッセージの全文（PIN・トークンは伏せる）
- 再現手順
