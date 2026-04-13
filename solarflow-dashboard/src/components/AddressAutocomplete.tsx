// AddressAutocomplete — Google Places-backed address input
// Reads API key from localStorage (solarops_gmaps_key).
// Falls back to a plain input if no key is set or if the API fails.
import React, { useRef, useEffect, useCallback } from 'react';
import { MapPin, CheckCircle2, AlertCircle, Loader } from 'lucide-react';

export const GMAPS_KEY_STORAGE = 'solarops_gmaps_key';
const SCRIPT_ID = 'google-maps-places-script';

export interface AddressResult {
  address: string;
  city: string;
  state: string;
  zip: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onAddressSelect: (result: AddressResult) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

// ── Global script loader (singleton) ─────────────────────────────────────────

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
let globalState: LoadState = 'idle';
const pendingResolvers: Array<() => void> = [];
const pendingRejectors: Array<(e: Error) => void> = [];

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (globalState === 'ready') return Promise.resolve();
  if (globalState === 'error') return Promise.reject(new Error('Google Maps failed to load'));

  return new Promise((resolve, reject) => {
    pendingResolvers.push(resolve);
    pendingRejectors.push(reject);

    if (globalState === 'loading') return; // already loading, just queued
    globalState = 'loading';

    // Inject PAC (Place Autocomplete) styles so the dropdown always floats on top
    if (!document.getElementById('pac-override-style')) {
      const s = document.createElement('style');
      s.id = 'pac-override-style';
      s.textContent = `
        .pac-container {
          z-index: 99999 !important;
          border-radius: 10px !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.18) !important;
          border: 1px solid #e2e8f0 !important;
          font-family: inherit !important;
          margin-top: 4px !important;
          overflow: hidden !important;
        }
        .pac-item {
          padding: 8px 12px !important;
          font-size: 13px !important;
          cursor: pointer !important;
          border-top: 1px solid #f1f5f9 !important;
          line-height: 1.4 !important;
        }
        .pac-item:first-child { border-top: none !important; }
        .pac-item:hover, .pac-item-selected { background: #fff7ed !important; }
        .pac-item-query { font-weight: 600 !important; color: #0f172a !important; }
        .pac-matched { color: #f97316 !important; }
        .pac-icon { display: none !important; }
      `;
      document.head.appendChild(s);
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      globalState = 'ready';
      pendingResolvers.forEach(r => r());
      pendingResolvers.length = 0;
      pendingRejectors.length = 0;
    };
    script.onerror = () => {
      globalState = 'error';
      const err = new Error('Google Maps failed to load — check your API key');
      pendingRejectors.forEach(r => r(err));
      pendingResolvers.length = 0;
      pendingRejectors.length = 0;
    };
    document.head.appendChild(script);
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export const AddressAutocomplete: React.FC<Props> = ({
  value,
  onChange,
  onAddressSelect,
  placeholder = 'Street address',
  className = '',
  required,
}) => {
  const inputRef     = useRef<HTMLInputElement>(null);
  const acRef        = useRef<any>(null);
  const [status, setStatus]       = React.useState<LoadState>(globalState);
  const [validated, setValidated] = React.useState(false);

  const initAC = useCallback(() => {
    const g = (window as any).google;
    if (!inputRef.current || !g?.maps?.places || acRef.current) return;

    acRef.current = new g.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
      fields: ['address_components', 'formatted_address'],
    });

    acRef.current.addListener('place_changed', () => {
      const place = acRef.current.getPlace();
      if (!place?.address_components) return;

      const get  = (type: string): string =>
        place.address_components.find((c: any) => c.types.includes(type))?.long_name  ?? '';
      const getS = (type: string): string =>
        place.address_components.find((c: any) => c.types.includes(type))?.short_name ?? '';

      const streetNumber = get('street_number');
      const route        = get('route');
      const address      = [streetNumber, route].filter(Boolean).join(' ')
                          || place.formatted_address || '';
      const city         = get('locality')
                          || get('sublocality_level_1')
                          || get('administrative_area_level_2');
      const state        = getS('administrative_area_level_1');
      const zip          = get('postal_code');

      setValidated(true);
      onChange(address);
      onAddressSelect({ address, city, state, zip });
    });

    setStatus('ready');
  }, [onChange, onAddressSelect]);

  useEffect(() => {
    const apiKey = sessionStorage.getItem(GMAPS_KEY_STORAGE)
      || (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string)
      || '';
    if (!apiKey) return; // no key — plain input mode

    if (globalState === 'ready') {
      initAC();
      setStatus('ready');
      return;
    }

    setStatus('loading');
    loadGoogleMaps(apiKey)
      .then(() => { setStatus('ready'); initAC(); })
      .catch(() => setStatus('error'));
  }, [initAC]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValidated(false);
    onChange(e.target.value);
  };

  const hasKey = !!(sessionStorage.getItem(GMAPS_KEY_STORAGE) || (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string));

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        required={required}
        autoComplete="new-password" /* prevents browser autocomplete from blocking PAC */
        className={`${className} ${status === 'ready' || status === 'loading' ? 'pr-8' : ''}`}
      />
      {/* Status icon */}
      {hasKey && status === 'loading' && (
        <Loader className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
      )}
      {hasKey && status === 'ready' && !validated && (
        <MapPin className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-400" />
      )}
      {hasKey && status === 'ready' && validated && (
        <CheckCircle2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
      )}
      {hasKey && status === 'error' && (
        <AlertCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400" title="Maps unavailable — check API key in Settings" />
      )}
    </div>
  );
};
