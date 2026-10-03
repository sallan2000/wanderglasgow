import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPublicWalks } from '../walk-store';
import type { Tour } from '../tours';

export function useCuratedWalks() {
  const [walks, setWalks] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    const seq = ++sequence.current;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    try {
      const result = await loadPublicWalks(request.signal);
      if (request.signal.aborted || seq !== sequence.current) return;
      setWalks(result.walks); setNotice(result.notice ?? ''); setError('');
    } catch (e) {
      if (request.signal.aborted || seq !== sequence.current) return;
      setError(e instanceof Error ? e.message : 'Curated walks could not be loaded. Please try again.');
    } finally {
      if (!request.signal.aborted && seq === sequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    const focus = () => { void reload(); };
    const timer = window.setInterval(() => { if (!document.hidden) void reload(); }, 60000);
    window.addEventListener('focus', focus);
    return () => { sequence.current++; controller.current?.abort(); window.clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [reload]);
  return { walks, loading, error, notice, reload };
}