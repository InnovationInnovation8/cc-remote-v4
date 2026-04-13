import { useState, useCallback, useEffect } from 'react';

const QUEUE_KEY = 'ccr-offline-queue';

export function useOfflineQueue() {
  const [queue, setQueue] = useState(() => {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
  });
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // オンラインに戻ったらキューを送信
  useEffect(() => {
    if (!online || queue.length === 0) return;
    const flush = async () => {
      const items = [...queue];
      setQueue([]);
      localStorage.setItem(QUEUE_KEY, '[]');
      for (const item of items) {
        try {
          await fetch(item.url, {
            method: item.method,
            headers: item.headers,
            body: item.body,
          });
        } catch (e) {
          // 再度キューに戻す
          setQueue(prev => {
            const next = [...prev, item];
            localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
            return next;
          });
        }
      }
    };
    flush();
  }, [online, queue.length]);

  const enqueue = useCallback((url, method, headers, body) => {
    const item = { url, method, headers, body, timestamp: Date.now() };
    setQueue(prev => {
      const next = [...prev, item];
      localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { online, queue, enqueue };
}
