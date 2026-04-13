const ERROR_MAP = {
  // Rev 4 Block B Q5: the wording is softened because B-2 retry may silently recover.
  // If the retry fails this message will still surface to the user.
  'Failed to fetch': '接続確認中... PCへ再接続できない場合はPCの起動を確認してください',
  'NetworkError': 'ネットワークエラーが発生しました。Wi-Fiを確認してください',
  '401': 'ログインが必要です。再度ログインしてください',
  '403': 'このPCへのアクセス権がありません',
  '404': '操作が見つかりません。アプリを再読み込みしてください',
  '500': 'PC側でエラーが発生しました。PCが起動中か確認してください',
  'ECONNREFUSED': 'PCの電源が入っているか確認してください',
  'timeout': '接続がタイムアウトしました。PCの電源とインターネットを確認してください',
  'tunnel_down': 'PCへの接続が切れました。PCが起動中か確認してください',
};

/**
 * errorオブジェクト・ステータスコード・文字列から日本語メッセージを返す。
 * 該当するマッピングがない場合はフォールバックメッセージを返す。
 *
 * @param {Error|string|number|{status?: number, message?: string}} error
 * @returns {string} 日本語エラーメッセージ
 */
export function friendlyError(error) {
  if (!error) return 'エラーが発生しました';

  // 数値のステータスコードとして渡された場合
  if (typeof error === 'number') {
    const key = String(error);
    if (ERROR_MAP[key]) return ERROR_MAP[key];
    if (error >= 500) return 'PC側でエラーが発生しました。PCが起動中か確認してください';
    if (error >= 400) return 'リクエストエラーが発生しました。アプリを再読み込みしてください';
    return 'エラーが発生しました';
  }

  // 文字列として渡された場合
  if (typeof error === 'string') {
    for (const [pattern, message] of Object.entries(ERROR_MAP)) {
      if (error.includes(pattern)) return message;
    }
    return error || 'エラーが発生しました';
  }

  // Errorオブジェクトまたは {status, message} 形式
  if (typeof error === 'object') {
    // ステータスコードで照合
    if (error.status) {
      const key = String(error.status);
      if (ERROR_MAP[key]) return ERROR_MAP[key];
      if (error.status >= 500) return 'PC側でエラーが発生しました。PCが起動中か確認してください';
      if (error.status >= 400) return 'リクエストエラーが発生しました。アプリを再読み込みしてください';
    }

    // メッセージ文字列で照合
    const msg = error.message || '';
    for (const [pattern, message] of Object.entries(ERROR_MAP)) {
      if (msg.includes(pattern)) return message;
    }

    if (msg) return msg;
  }

  return 'エラーが発生しました';
}
