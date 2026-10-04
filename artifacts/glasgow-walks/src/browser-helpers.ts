declare global {
  interface Window { L?: any; }
}

let leafletLoad: Promise<any> | null = null;

export function loadLeaflet(): Promise<any> {
  if (leafletLoad) return leafletLoad;
  if (window.L) return Promise.resolve(window.L);
  leafletLoad = new Promise<any>((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    css.crossOrigin = 'anonymous';
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    // Fail closed if the CDN returns different bytes. Never retry without SRI.
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.dataset.leaflet = 'true';
    let styled = false, loaded = false, settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      script.onload = script.onerror = css.onload = css.onerror = null;
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true; cleanup();
      script.remove(); css.remove();
      // A CSS failure may occur after the script has set window.L.
      delete window.L;
      reject(new Error(message));
    };
    const ready = () => {
      if (settled || !styled || !loaded) return;
      if (!window.L) { fail('Map library unavailable'); return; }
      settled = true; cleanup(); resolve(window.L);
    };
    const timeout = setTimeout(() => fail('Map library loading timed out'), 15000);
    css.onload = () => { styled = true; ready(); };
    css.onerror = () => fail('Could not load map styles');
    script.onload = () => { loaded = true; ready(); };
    script.onerror = () => fail('Could not load map library');
    document.head.appendChild(css);
    document.head.appendChild(script);
  }).catch(error => {
    leafletLoad = null; // Allow a later Retry map to start a fresh load.
    throw error;
  });
  return leafletLoad;
}

export function getPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Object.assign(new Error('Location is not available in this browser.'), { code: 0 }));
      return;
    }
    if (!window.isSecureContext) {
      reject(Object.assign(new Error('Location needs a secure HTTPS connection. Browse by starting point instead.'), { code: 0 }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (location) => resolve({ lat: location.coords.latitude, lon: location.coords.longitude }),
      (error) => reject(error),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  });
}
