import { useEffect, useRef, useState } from 'react';
import { Download, Navigation, Printer } from 'lucide-react';
import type { ItinerarySnapshot } from './itinerary-snapshot';
import { itineraryDocument, itineraryFilename } from './itinerary-document';
import { buildNavigationUrls } from './route-url';
import './itinerary-actions.css';

export default function ItineraryActions({ itinerary }: { itinerary: ItinerarySnapshot }) {
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [printing, setPrinting] = useState(false);
  const printBtn = useRef<HTMLButtonElement>(null);
  const downloadBtn = useRef<HTMLButtonElement>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const mounted = useRef(true);

  const removeFrame = () => { frame.current?.remove(); frame.current = null; };
  useEffect(() => {
    mounted.current = true;
    const t = timers.current;
    return () => {
      mounted.current = false;
      t.forEach(clearTimeout); t.clear();
      removeFrame();
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => { timers.current.delete(id); fn(); }, ms);
    timers.current.add(id);
    return id;
  };
  const failPrint = (message: string) => {
    removeFrame();
    if (!mounted.current) return;
    setPrinting(false); setStatus(''); setError(message);
    requestAnimationFrame(() => printBtn.current?.focus());
  };

  const download = () => {
    setError(''); setStatus('');
    try {
      const html = itineraryDocument(itinerary);
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = itineraryFilename(itinerary); a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      // Keep a handed-off URL alive through navigation/unmount while the browser
      // accepts the download. This cleanup never updates component state.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setStatus('Download requested. Your browser decides whether to save it; check Downloads or Files, then open the HTML file offline.');
    } catch {
      setError('The itinerary file could not be created. Try the Print button, or use your browser Print command.');
    }
    downloadBtn.current?.focus();
  };

  const print = () => {
    if (printing) return;
    setError(''); setStatus('');
    removeFrame();
    let html: string;
    try { html = itineraryDocument(itinerary); } catch {
      setError('The itinerary could not be prepared for printing. Try Download, then use browser Print.'); return;
    }
    const unavailable = 'Printing is unavailable or was blocked. Use Download, open the file, then use your browser Print command.';
    setPrinting(true);
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1; f.title = 'Printable itinerary';
    f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0;visibility:hidden';
    const guard = later(() => failPrint(unavailable), 15000);
    f.onload = () => {
      clearTimeout(guard); timers.current.delete(guard);
      if (frame.current !== f) return;
      try {
        const w = f.contentWindow;
        if (!w || typeof w.print !== 'function' || !f.contentDocument?.querySelector('main.itinerary')) throw new Error('no printable document');
        w.addEventListener('afterprint', () => {
          if (frame.current !== f) return;
          removeFrame();
          if (mounted.current) {
            setPrinting(false);
            requestAnimationFrame(() => printBtn.current?.focus());
          }
        });
        // print() targets this window's document without moving focus to the
        // hidden frame (which can trigger the site's focus-driven refreshes).
        w.print();
        if (mounted.current) {
          // Some browsers return before afterprint, or suppress printing without
          // throwing. Keep the document alive, but permit a deliberate retry.
          setPrinting(false);
          setStatus('Print requested. Choose Save as PDF if supported. If no dialog appears, download the file and use your browser Print menu.');
        }
      } catch { failPrint(unavailable); }
    };
    frame.current = f;
    f.srcdoc = html;
    document.body.appendChild(f);
  };

  const planned = itinerary.kind === 'planned';
  const coordinates = [
    { lat: itinerary.start.lat, lon: itinerary.start.lon },
    ...itinerary.stops.map(stop => ({ lat: stop.lat, lon: stop.lon })),
  ];
  const { appleMapsUrl, googleMapsUrl } = buildNavigationUrls(coordinates);
  const openNavigation = () => {
    if (!appleMapsUrl || !googleMapsUrl) return;
    window.open(appleMapsUrl, '_blank', 'noopener,noreferrer');
    window.open(googleMapsUrl, '_blank', 'noopener,noreferrer');
  };
  return (
    <div className="itinerary-actions" data-testid="section-itinerary-actions">
      <h4>Print or keep this itinerary</h4>
      <p data-testid="text-itinerary-privacy">
        {planned
          ? 'This copy includes your chosen starting coordinates and calculated route, which may include your GPS location. The file stays on your device unless you share it. This print or download action does not upload or retain the file on the site.'
          : 'This copy is an editorial itinerary of the listed start and stops. It has no GPS connector and no calculated walking-route illustration.'}
        {' '}Downloaded HTML opens offline from Downloads or Files. Your browser Print can save a PDF. There is no live navigation and no guarantee of access; check locally.
      </p>
      <div className="itinerary-buttons">
        <button ref={printBtn} type="button" className="button-secondary" onClick={print} disabled={printing} data-testid="button-print-itinerary"><Printer size={15} /> {printing ? 'Preparing print…' : 'Print itinerary'}</button>
        <button ref={downloadBtn} type="button" className="button-secondary" onClick={download} data-testid="button-download-itinerary"><Download size={15} /> Download HTML</button>
        <button type="button" className="button-secondary navigation-button" onClick={openNavigation} disabled={!appleMapsUrl || !googleMapsUrl} data-testid="button-open-itinerary-navigation" aria-label="Open walk in Apple Maps and Google Maps"><Navigation size={15} /> Open in navigation</button>
      </div>
      <div role="status" aria-live="polite" className="itinerary-status" data-testid="status-itinerary">{status}</div>
      {error && <div role="alert" className="itinerary-error" data-testid="status-itinerary-error">{error}</div>}
    </div>
  );
}
