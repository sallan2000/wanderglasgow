import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPublicStartingAreas, type StartingArea } from './starting-area-store';

export function useStartingAreas() {
  const [areas, setAreas] = useState<StartingArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const result = await loadPublicStartingAreas(controller.signal);
      if (controller.signal.aborted) return;
      setAreas(result.areas); setNotice(result.notice ?? ''); setError('');
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : 'Starting areas could not be loaded. Try again.');
        setNotice('');
      }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(onFocus, 60000);
    return () => { request.current?.abort(); window.removeEventListener('focus', onFocus); window.clearInterval(timer); };
  }, [refresh]);
  return { areas, loading, error, notice, refresh };
}