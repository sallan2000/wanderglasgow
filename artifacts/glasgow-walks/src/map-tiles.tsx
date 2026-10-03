import { useCallback, useRef, useState } from 'react';

// Retry only the background layer, never the map or its route/pin overlays.
export function useMapTiles() {
  const layer = useRef<any>(null);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const attach = useCallback((L: any, map: any) => {
    setFailed(false);
    setRetrying(false);
    let batchFailed = false;
    let loaded = 0;
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
    });
    layer.current = tiles;
    const handlers = {
      loading: () => { batchFailed = false; loaded = 0; },
      tileerror: () => { batchFailed = true; setFailed(true); },
      tileload: () => { loaded++; },
      load: () => {
        // One successful tile must not hide a partial provider failure.
        if (!batchFailed && loaded > 0) setFailed(false);
        setRetrying(false);
      },
    };
    tiles.on(handlers);
    try {
      tiles.addTo(map);
    } catch (error) {
      tiles.off(handlers);
      layer.current = null;
      throw error;
    }
    return () => {
      tiles.off(handlers);
      if (layer.current === tiles) layer.current = null;
    };
  }, []);
  const retry = useCallback(() => {
    if (!layer.current) return;
    setRetrying(true);
    layer.current.redraw();
  }, []);
  return { attach, failed, retrying, retry };
}

export function MapTileNotice({
  tiles,
  preserved,
  testId,
  noticeTestId = `status-${testId}-tiles-error`,
  className = 'planner-msg',
  retryClassName = 'chip',
  retryLabel,
}: {
  tiles: ReturnType<typeof useMapTiles>;
  preserved: string;
  testId: string;
  noticeTestId?: string;
  className?: string;
  retryClassName?: string;
  retryLabel?: string;
}) {
  if (!tiles.failed) return null;
  return (
    <div className={className} role="alert" data-testid={noticeTestId}>
      OpenStreetMap background tiles could not load. Check your connection or try again later. {preserved}
      <div style={{ marginTop: 10 }}>
        <button type="button" className={retryClassName} onClick={tiles.retry} disabled={tiles.retrying} data-testid={`button-${testId}-tiles-retry`}>
          {retryLabel ?? (tiles.retrying ? 'Retrying background…' : 'Retry map background')}
        </button>
      </div>
    </div>
  );
}