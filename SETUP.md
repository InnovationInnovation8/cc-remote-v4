# CC Remote を新しい PC で使う方法

スマホから Claude Code を操作できる「CC Remote」を新しい PC にセットアップする手順です。

---

## 前提条件

- **Claude Code** がインストール済みであること
- **Node.js 18 以上** がインストール済みであること
  - バージョン確認: `node --version`
  - ダウンロード: https://nodejs.org
- このプロジェクトのフォルダが手元にあること（OneDrive などで同期済みの場合はそのまま使えます）

---

## セットアップ方法

### 方法 A：Claude Code に頼む（おすすめ）

Claude Code を開いて以下のように話しかけるだけです:

```
CC Remote をセットアップして
```

Claude Code が自動でセットアップを進めてくれます。

---

### 方法 B：コマンドで手動実行

ターミナル（PowerShell やコマンドプロンプト）でプロジェクトフォルダに移動し、以下を実行します:

```
node scripts/setup.js
```

画面の指示に従って PC 名と PIN（4桁）を入力すれば完了です。

---

## セットアップの流れ

1. Node.js のバージョン確認
2. 依存パッケージのインストール（`npm install`）
3. フロントエンドのビルド（`npm run build`）
4. `.env` ファイルの確認・作成
5. cloudflared（トンネルツール）の確認
6. PC 名の入力（デフォルトはコンピュータ名）
7. PIN の設定（4桁）
8. サーバー起動 → トンネル URL が表示されます

トンネル URL（`https://xxxx.trycloudflare.com` のような URL）をスマホのブラウザで開くと CC Remote が使えます。

---

## 初回のみ必要な作業：Firebase 設定

`.env` ファイルに Firebase の情報を入力する必要があります。  
Firebase の情報は以下の場所で確認できます:

1. https://console.firebase.google.com を開く
2. プロジェクト「cc-remote」を選択
3. 「プロジェクトの設定」→「マイアプリ」→ ウェブアプリの設定を確認

設定後、再度 `node scripts/setup.js` を実行してください。

---

## トラブルシューティング

### `npm install` でエラーが出る

- ネットワーク接続を確認してください
- プロキシ環境の場合は `npm config set proxy http://your-proxy:port` を設定してください
- Node.js のバージョンが 18 未満の場合は https://nodejs.org からアップデートしてください

### `npm run build` でエラーが出る

- `.env` ファイルの `VITE_FIREBASE_API_KEY` など Firebase の設定が空になっていないか確認してください
- `.env` ファイルが存在しない場合は `scripts/setup-template.env` をコピーして `.env` にリネームしてから Firebase 情報を入力してください

### cloudflared が見つからない

外部（スマホなど）からアクセスするには cloudflared が必要です。  
以下のいずれかでインストールしてください:

**方法 1：winget（Windows ターミナル）**

```
winget install Cloudflare.cloudflared
```

**方法 2：手動ダウンロード**

https://github.com/cloudflare/cloudflared/releases/latest から  
`cloudflared-windows-amd64.exe` をダウンロードして  
プロジェクトフォルダに `cloudflared.exe` として保存してください。

インストール後、再度 `node scripts/setup.js` を実行してください。

### PIN を忘れた

プロジェクトフォルダで以下を実行してください:

```
node reset-pin.js
```

新しい PIN を設定できます。

### サーバーが起動しない（ポートが使用中）

別のサーバーが起動中の可能性があります。以下で再起動してください:

```
node scripts/restart.js
```

### スマホから接続できない

- トンネル URL（`https://xxxx.trycloudflare.com`）が表示されているか確認してください
- cloudflared が起動していない場合はローカルネットワーク内の IP アドレス（`http://192.168.x.x:3737`）でアクセスしてみてください
- スマホと PC が同じ Wi-Fi に接続されているか確認してください

---

## 2 回目以降の起動

セットアップが完了した後の起動はこちら:

```
node scripts/restart.js
```

または `scripts/start.bat` をダブルクリックしても起動できます。
