import { useState } from 'react';
import { friendlyError } from '../utils/errorMessages';

export default function ErrorDisplay({ error, onRetry }) {
  const [showDetail, setShowDetail] = useState(false);

  if (!error) return null;

  const message = friendlyError(error);
  const detail = typeof error === 'object' ? JSON.stringify(error, null, 2) : null;

  return (
    <div className="pet-frame p-4 m-2 animate-fade-in">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-alert-red text-lg">!</span>
        <span className="text-alert-red font-mono text-sm font-bold">ERROR</span>
      </div>
      <p className="text-txt-secondary text-sm font-mono mb-3">{message}</p>

      {detail && (
        <div className="mb-3">
          <button
            onClick={() => setShowDetail(!showDetail)}
            className="text-txt-muted text-xs font-mono underline"
          >
            {showDetail ? '詳細を閉じる' : '技術的な詳細を見る'}
          </button>
          {showDetail && (
            <pre className="mt-2 bg-cyber-bg border border-cyber-600 rounded p-2 text-xs text-txt-muted overflow-x-auto max-h-[100px]">
              {detail}
            </pre>
          )}
        </div>
      )}

      {onRetry && (
        <button
          onClick={onRetry}
          className="neon-btn text-white rounded px-4 py-2 text-sm font-mono w-full"
        >
          RETRY
        </button>
      )}
    </div>
  );
}
