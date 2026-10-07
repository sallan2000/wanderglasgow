import { useEffect, useRef, useState } from 'react';
import { Download, Navigation, Printer } from 'lucide-react';
import type { ItinerarySnapshot } from './itinerary-snapshot';
import { itineraryDocument, itineraryFilename } from './itinerary-document';
import { fetchItineraryMapSnapshot } from './itinerary-map';
import { buildNavigationUrls } from './route-url';
import './itinerary-actions.css';

export default function ItineraryActions({ itinerary }: { itinerary: ItinerarySnapshot }) {
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const printBtn = useRef<HTMLButtonElement>(null);
  const downloadBtn = useRef<HTMLButtonElement>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const mapRequest = useRef<AbortController | null>(null);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const mounted = useRef(true);

  const removeFrame = () => { frame.current?.remove(); frame.current = null; };
  useEffect(() => {
    mounted.current = true;
    const t = timers.current;
    return () => {
      mounted.current = false;
      t.forEach(clearTimeout); t.clear();
      mapRequest.current?.abort();
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

  const prepareDocument = async () => {
    mapRequest.current?.abort();
    const controller = new AbortController();
    mapRequest.current = controller;
    setStatus('Loading the OpenStreetMap street background…');
    try {
      const map = await fetchItineraryMapSnapshot(itinerary, controller.signal);
      if (!mounted.current || controller.signal.aborted) return null;
      return itineraryDocument(itinerary, map);
    } finally {
      if (mapRequest.current === controller) mapRequest.current = null;
    }
  };

  const download = async () => {
    if (printing || downloading) return;
    setError(''); setStatus('');
    setDownloading(true);
    try {
      const html = await prepareDocument();
      if (!html || !mounted.current) return;
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = itineraryFilename(itinerary); a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      // Keep a handed-off URL alive through navigation/unmount while the browser
      // accepts the download. This cleanup never updates component state.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setStatus('Download requested. Your browser decides whether to save it; the embedded map works offline.');
    } catch (cause) {
      if (mounted.current && !(cause instanceof DOMException && cause.name === 'AbortError')) {
        setStatus('');
        setError(cause instanceof Error ? cause.message : 'The street map could not be loaded. Check your connection and try again.');
      }
    } finally {
      if (mounted.current) {
        setDownloading(false);
        requestAnimationFrame(() => downloadBtn.current?.focus());
      }
    }
  };

  const print = async () => {
    if (printing || downloading) return;
    setError(''); setStatus('');
    removeFrame();
    setPrinting(true);
    let html: string | null;
    try {
      html = await prepareDocument();
    } catch (cause) {
      if (mounted.current && !(cause instanceof DOMException && cause.name === 'AbortError')) {
        setPrinting(false);
        setStatus('');
        setError(cause instanceof Error ? cause.message : 'The street map could not be loaded. Check your connection and try again.');
        requestAnimationFrame(() => printBtn.current?.focus());
      }
      return;
    }
    if (!html || !mounted.current) { if (mounted.current) setPrinting(false); return; }
    const unavailable = 'Printing is unavailable or was blocked. Use Download, open the file, then use your browser Print command.';
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
  const busy = printing || downloading;
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
          ? 'This copy includes your chosen starting coordinates and calculated route, which may include your GPS location.'
          : 'This editorial copy shows the listed start and stop positions without a GPS connection or calculated route.'}
        {' '}To add the street map, OpenStreetMap receives the approximate walk area and standard request information; it does not receive the itinerary file or stop stories. The completed HTML embeds the map and stays on your device unless you share it. Your browser Print can save a PDF. There is no live navigation and no guarantee of access; check locally.
      </p>
      <div className="itinerary-buttons">
        <button ref={printBtn} type="button" className="button-secondary" onClick={print} disabled={busy} data-testid="button-print-itinerary"><Printer size={15} /> {printing ? 'Preparing map…' : 'Print itinerary'}</button>
        <button ref={downloadBtn} type="button" className="button-secondary" onClick={download} disabled={busy} data-testid="button-download-itinerary"><Download size={15} /> {downloading ? 'Preparing map…' : 'Download HTML'}</button>
        <button type="button" className="button-secondary navigation-button" onClick={openNavigation} disabled={!appleMapsUrl || !googleMapsUrl} data-testid="button-open-itinerary-navigation" aria-label="Open walk in Apple Maps and Google Maps"><Navigation size={15} /> Open in navigation</button>
      </div>
      <div role="status" aria-live="polite" className="itinerary-status" data-testid="status-itinerary">{status}</div>
      {error && <div role="alert" className="itinerary-error" data-testid="status-itinerary-error">{error}</div>}
    </div>
  );
}
