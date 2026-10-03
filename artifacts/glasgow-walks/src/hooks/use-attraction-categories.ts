import { useCallback, useEffect, useRef, useState } from 'react';
import { CatalogueError, loadPublicCategories } from '../attraction-store';
import { DEFAULT_CATEGORIES } from '../tours';

export function useAttractionCategories() {
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sequence = useRef(0);
  const request = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    const id = ++sequence.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const result = await loadPublicCategories(controller.signal);
      if (id !== sequence.current) return;
      setCategories(result.categories);
      setNotice(result.notice ?? '');
    } catch (e) {
      if (id !== sequence.current || controller.signal.aborted) return;
      setCategories([]);
      setNotice('');
      setError(e instanceof CatalogueError ? e.message : 'Attraction categories could not be loaded. Please try again.');
    } finally {
      if (id === sequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const onFocus = () => void reload();
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      sequence.current++;
      request.current?.abort();
    };
  }, [reload]);

  return { categories, loading, error, notice, reload };
}