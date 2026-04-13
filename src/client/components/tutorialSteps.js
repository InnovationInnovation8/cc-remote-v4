// Rev 6: CC Remote インタラクティブチュートリアル (end-to-end 実動作版)
//   - 各ステップが実際に画面を動かしながら進む
//   - 最終的に新規セッションで "hello" を Claude に送って反応を受け取るまで通す
//   - targetId が null のステップ (welcome/prereq/wait/complete) はガイドのみ、ボタンで進む

const tutorialSteps = [
  {
    id: 'welcome',
    targetId: null,
    title: 'ようこそ',
    lines: [
      'CC Remote へようこそ。',
      'スマホから PC の Claude Code を',
      'リモート操作できるシステムです。',
      '',
      'これから実際に新しいセッションを作って、',
      'Claude に hello と話しかけるところまで',
      'ご案内します。',
      '',
      '「はい」ボタンで次へ進んでください。',
    ],
    placement: 'center',
  },
  {
    id: 'prereq',
    targetId: null,
    title: '事前準備',
    lines: [
      'ご利用には PC 側に Claude Code が',
      'インストールされている必要があります。',
      '',
      '・ Claude Code を一度起動してログイン済みであること',
      '・ 初回プロジェクトで trust 設定を通していること',
      '',
      '準備ができていれば「はい」を押してください。',
    ],
    placement: 'center',
  },
  {
    id: 'pc',
    targetId: 'pc-list',
    title: 'PC を選択',
    lines: [
      'まず操作したい PC を選んでください。',
      '光っている PC リストをタップしてください。',
    ],
    placement: 'bottom',
  },
  {
    id: 'open-session-list',
    targetId: 'session-btn',
    title: 'セッション一覧を開く',
    lines: [
      'セッションを新しく作ります。',
      '光っているセッションボタンをタップして',
      'セッション一覧を開いてください。',
    ],
    placement: 'bottom',
  },
  {
    id: 'new-session',
    targetId: 'new-session-btn',
    title: '新規セッションを作成',
    lines: [
      '「+ NEW SESSION」ボタンをタップして、',
      '新しいセッションを作ってください。',
      '',
      'セッションが開いたら自動で次へ進みます。',
    ],
    placement: 'top',
  },
  {
    id: 'enter-trust',
    targetId: 'enter-btn',
    title: 'ENTER で起動 / trust 承認',
    lines: [
      '新規プロジェクトを初めて使う時は、',
      '「このフォルダを信頼しますか？」という',
      '確認プロンプトが出ます。',
      '',
      '光っているクイックキー列の「ENTER」を',
      'タップして承認してください。',
      '',
      '既に承認済みならそのまま Claude が起動します。',
    ],
    placement: 'top',
  },
  {
    id: 'type-hello',
    targetId: 'input-area',
    title: 'hello と送る',
    lines: [
      '光っている入力エリアをタップして',
      '「hello」と入力してください。',
    ],
    placement: 'top',
  },
  {
    id: 'send-hello',
    targetId: 'send-btn',
    title: '送信',
    lines: [
      'SEND ボタンをタップして hello を送信してください。',
      'Claude が応答すれば成功です。',
    ],
    placement: 'top',
  },
  {
    id: 'wait-response',
    targetId: 'terminal-area',
    title: 'Claude の応答を待つ',
    lines: [
      'Claude が応答するまで少し待ちましょう。',
      '',
      '応答が表示されたら、',
      'ターミナルをタップしてください。',
    ],
    placement: 'top',
  },
  {
    id: 'complete',
    targetId: null,
    title: '準備完了です',
    lines: [
      'おつかれさまでした！',
      'これで CC Remote の基本操作は',
      '一通りマスターです。',
      '',
      'お困りの際は画面右上の',
      '🔰 マークをタップすると、',
      'いつでもこのチュートリアルを',
      '再生できます。',
      '',
      '「完了」ボタンで閉じてください。',
    ],
    placement: 'center',
  },
];

export default tutorialSteps;
