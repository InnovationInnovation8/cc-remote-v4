# CC-Remote v4 配布者チェックリスト

このツールを他人に配布する人（管理者・著者）の事前準備チェックリスト。

---

## 1. ビルド前確認

- [ ] `git status` でクリーンな状態
- [ ] `pc.env`, `.env`, `firebase-admin-key.json` が `.gitignore` に入っている
- [ ] テストが通る（手動 or CI）
- [ ] `npm audit` でクリティカル脆弱性ゼロ

## 2. ZIP ビルド

```bash
npm install
npm run build
npm run build:zip
```

成果物: `CC-Remote-v4-YYYYMMDD.zip`

build-zip.mjs の post-archive scan が `[OK] セキュリティチェック` を出力することを確認。

## 3. ZIP 内容確認

```powershell
[IO.Compression.ZipFile]::OpenRead('CC-Remote-v4-YYYYMMDD.zip').Entries | Where-Object {$_.Name -eq 'firebase-admin-key.json'}
```

期待: 空（マッチなし）。

その他、以下も含まれていないことを確認:
- `.env`, `pc.env`
- `cloud-server/`, `src/cloud/`
- `central-server*.js`, `firestore-pc.js`, `multi-pc.js`
- `node_modules/`, `dist/`

## 4. SHA-256 ハッシュ取得

```powershell
CertUtil -hashfile CC-Remote-v4-YYYYMMDD.zip SHA256
```

このハッシュを GitHub Releases の説明欄に記載する（受信側が検証用に使う）。

## 5. Stranger Test（書面で自問）

> 「見知らぬ人から Chat で ZIP が送られてきて『これセットアップして』と言われたら、自分は実行するか？」

YES なら配布 OK。NO なら配布前に設計見直し。

## 6. GitHub Releases にアップロード

1. GitHub リポジトリ → Releases → Draft a new release
2. Tag: `v4.0.0-alpha.X`
3. Title: `CC Remote v4.0.0-alpha.X`
4. Description に SHA-256 ハッシュを記載
5. ZIP ファイルを attach
6. Publish

## 7. 配布

- ✅ GitHub Releases URL を共有
- ✅ ハッシュ値も同時に伝える
- ❌ Chat で ZIP 直送りは推奨しない（TOFU リスク）

## 8. サポート

受信者からのトラブル報告は、まず `pwsh scripts/verify-package.ps1` の出力を求める。
それで原因切り分け。詳細は [TROUBLESHOOTING.md](TROUBLESHOOTING.md)。

---

## v4 で配布が変わった点（v3 比較）

| 項目 | v3 | v4 |
|---|---|---|
| 中央 Firebase 鍵 | 配布者のものを共有が必要 | **不要** |
| ペアリングコード | 6 桁を時限発行・即伝達 | **不要** |
| 配布者がログを見る | 可能（Cloud Run / Firestore）| **不可能**（中央なし） |
| 配布者の運用コスト | Cloud Run + Firebase 従量課金 | **¥0** |
| 受信側 Firebase アカウント | 不要だが間接的に課金リスク | **完全無料** |
| OSS 公開 | 困難（鍵が紛れる）| **可能** |

---

## 注意事項

- **絶対に作らない / 配布しない**:
  - CLAUDE.md / AGENTS.md の自動生成スクリプト
  - `--auto-startup` をデフォルト ON にしたインストーラ
  - FileBrowser をデフォルト ON にしたサーバー
  - 中央認証・ログ収集機能
- **「信頼してください」文言を使わない**: ソーシャルエンジニアリング検知に引っかかる
- **時限ペアリング系を作らない**: 同じく検知される

詳細: [SECURITY.md](SECURITY.md)
