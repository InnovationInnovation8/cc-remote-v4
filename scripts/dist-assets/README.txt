CC Remote — Windows セットアップ手順
=====================================

CC Remote を使うと、スマホのブラウザからこの PC の
Claude Code をリモート操作できます。


【このフォルダに含まれるもの】

  CC Remote.exe   ... メインアプリ（常駐サーバー）
  cloudflared.exe ... トンネル接続ツール（自動で使用されます）
  CLAUDE.md       ... Claude Code 向けセットアップガイド
  README.txt      ... このファイル


【必要なもの】

  - Windows 10 または 11 の PC
  - スマホ（iPhone / Android）のブラウザ
  - Claude Code（下記でインストール）


【Claude Code のインストール（まだの場合）】

  1. https://claude.ai/download にアクセス
  2. 「Claude Code」をダウンロードしてインストール
  3. インストール後、ターミナル（PowerShell）を開いて
       claude --version
     と入力して動作確認


【セットアップ手順（Claude Code を使う方法 — おすすめ）】

  1. スマホのブラウザで以下のURLにアクセス:
       https://cc-remote-api-701345803309.asia-northeast1.run.app
     Googleアカウントでログインしてください。

  2. ログインしたら「PC追加」ボタンを押す
     → 6桁のペアリングコードが表示されます

  3. PC で Claude Code を開いて、このフォルダに移動してから
     以下を入力して実行:
       CLAUDE.md を読んでセットアップして

  4. Claude Code の指示に従ってペアリングコードを入力

  5. 完了！スマホの CC Remote をリロードすると、
     この PC が一覧に表示されます


【セットアップ手順（手動の場合）】

  1. スマホで上記URLにアクセスしてログイン
  2. 「PC追加」→ 6桁のペアリングコードを確認
  3. CC Remote.exe をダブルクリックして起動
  4. 画面の質問に答えてセットアップ
     - PC名: 好きな名前を入力
     - ペアリングコード: スマホに表示された6桁を入力
       ※ 必ず半角数字で入力してください（全角だと失敗します）
  5. 「登録完了」と出たら成功


【よくある質問】

  Q: EXE が起動しない / 警告が出る
  A: Windows Defender の警告が出た場合
     「詳細情報」→「実行」を選んでください

  Q: スマホから PC が見えない
  A: CC Remote.exe が起動中かタスクバーで確認してください。
     黒い窓（コンソール）が開いていれば起動中です。

  Q: PC を再起動したらどうなる？
  A: セットアップ時に自動起動を選んだ場合、
     PC 起動時に自動で CC Remote が立ち上がります。
     手動で起動する場合は CC Remote.exe をダブルクリック。

  Q: もう一度セットアップしたい
  A: PowerShell で以下を実行:
       & ".\CC Remote.exe" --pc-name "PC名" --pairing-code "6桁" --force

  Q: ペアリングコードを入れても失敗する
  A: コードの有効期限は5分です。
     スマホで新しいコードを発行して再試行してください。
     入力は必ず半角数字で（半角/全角キーでIMEをOFFに）。
