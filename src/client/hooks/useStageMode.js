import { useEffect, useState, useCallback, useRef } from 'react';
import { idbGet, idbSet } from '../utils/idbStore';

const IDB_KEY = 'ccr-stage-mode';
const VALID = ['normal', 'reduce', 'full'];

export function useStageMode() {
  const [stageMode, setStageModeState] = useState('reduce');
  const [isFirstReduceApplied, setIsFirstReduceApplied] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    idbGet(IDB_KEY, null).then((stored) => {
      if (cancelled) return;
      if (stored && VALID.includes(stored)) {
        setStageModeState(stored);
      } else {
        setIsFirstReduceApplied(true);
        idbSet(IDB_KEY, 'reduce');
      }
      hydrated.current = true;
    });
    return () => { cancelled = true; };
  }, []);

  const setStageMode = useCallback((next) => {
    if (!VALID.includes(next)) return;
    setStageModeState(next);
    idbSet(IDB_KEY, next);
  }, []);

  return { stageMode, setStageMode, isFirstReduceApplied };
}
