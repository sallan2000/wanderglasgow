declare global {
  interface Window { L?: any; }
}

export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise<any>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('[data-leaflet]');
    if (existing) {
      existing.addEventListener('load', () => window.L ? resolve(window.L) : reject(new Error('Map library unavailable')));
      existing.addEventListener('error', () => reject(new Error('Could not load map library')));
      return;
    }
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.dataset.leaflet = 'true';
    script.onload = () => window.L ? resolve(window.L) : reject(new Error('Map library unavailable'));
    script.onerror = () => reject(new Error('Could not load map library'));
    script.addEventListener('error', () => script.remove(), { once: true });
    document.head.appendChild(script);
  });
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
