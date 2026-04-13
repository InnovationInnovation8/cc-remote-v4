# Google OAuth Client ID 取得手順

CC-Remote v4 の Google 認証に使う OAuth 2.0 Client ID を取得する。所要 10〜15 分。

## 事前準備

- Google アカウント：`lkoron4l@gmail.com` にログインした状態でブラウザを開く

---

## ステップ 1：Google Cloud プロジェクト作成

1. <https://console.cloud.google.com/projectcreate> を開く
2. **プロジェクト名**：`cc-remote-auth`
3. **組織**：「組織なし」でOK
4. **作成** ボタン → 画面上部に「作成中」のトーストが出る → 30秒待って右上のプロジェクトセレクタで `cc-remote-auth` を選択

---

## ステップ 2：OAuth 同意画面の設定

1. <https://console.cloud.google.com/apis/credentials/consent> を開く
2. **User Type**：`外部` を選択 → `作成`
3. アプリ情報入力：
   - アプリ名：`CC Remote`
   - ユーザーサポートメール：`lkoron4l@gmail.com`
   - デベロッパー連絡先メール：`lkoron4l@gmail.com`
4. `保存して次へ`
5. **スコープ**：何も追加せず `保存して次へ`（`email` と `profile` はデフォルトで含まれる）
6. **テストユーザー**：`+ADD USERS` → `lkoron4l@gmail.com` を追加 → `保存して次へ`
7. 概要確認 → `ダッシュボードに戻る`

---

## ステップ 3：OAuth Client ID 発行

1. <https://console.cloud.google.com/apis/credentials> を開く
2. `+ 認証情報を作成` → `OAuth クライアント ID`
3. **アプリケーションの種類**：`ウェブ アプリケーション`
4. **名前**：`CC Remote PWA`
5. **承認済みの JavaScript 生成元** に以下を追加（`+URIを追加` を繰り返し）：
   - `http://localhost:3737`
   - `http://localhost:5173`
   - `https://lkoron4l.github.io` ← GitHub Pages 用（GitHub ユーザー名が `lkoron4l` の場合。違う場合はあとで教えて）
6. **承認済みのリダイレクト URI**：**空欄のまま**（GIS はリダイレクト不要）
7. `作成`
8. 表示されたダイアログの **クライアント ID** をコピー
   - 形式：`xxxxxxxxxxxx-yyyyyyyyyyyy.apps.googleusercontent.com`

---

## ステップ 4：クライアント ID を教えて

コピーしたクライアント ID をチャットに貼って。

例：
```
クライアントID: 123456789-abcdefghijk.apps.googleusercontent.com
```

これを受け取ったら、俺が `.env` に書き込んで実装を完成させる。

---

## トラブル時

- 「承認済みJavaScript生成元の形式が不正」→ 末尾にスラッシュを付けないこと（`https://example.com` ◎、`https://example.com/` ×）
- プロジェクト作成が見つからない → <https://console.cloud.google.com/> 左上のプロジェクトセレクタから確認
- 同意画面「公開ステータス」が「本番環境」でなくても OK（テストユーザーに自分を入れてあるので動く）
