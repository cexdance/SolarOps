// Single-pin site map. Geocodes a plain address string via Nominatim (same
// cache key as JobMapView so repeated lookups are free) and shows it on an
// OpenStreetMap base layer. Designed to embed inside a panel tab.
import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, AlertTriangle, MapPin, ExternalLink, Pencil } from 'lucide-react';
import { geocodeAddress } from '../../lib/addressValidator';

interface Props {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  label?: string;
  /** When provided, the no/invalid-address state offers a shortcut to edit the
   *  customer record (so dispatch can fix the address without leaving the flow). */
  onEditAddress?: () => void;
}

interface Coord { lat: number; lon: number }

const COORD_CACHE_KEY = 'solarops_geocode_cache';
function loadCache(): Record<string, Coord> {
  try { return JSON.parse(localStorage.getItem(COORD_CACHE_KEY) ?? '{}'); } catch { return {}; }
}
function saveCache(c: Record<string, Coord>) {
  try { localStorage.setItem(COORD_CACHE_KEY, JSON.stringify(c)); } catch { /* quota */ }
}

function cacheKey(address?: string, city?: string, state?: string, zip?: string): string {
  return [address, city, state, zip].filter(Boolean).join('|').toLowerCase();
}

function pinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'solarops-pin',
    html: `<div style="background:#f97316;width:20px;height:20px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 20],
    popupAnchor: [0, -18],
  });
}

const Center: React.FC<{ coord: Coord }> = ({ coord }) => {
  const map = useMap();
  useEffect(() => { map.setView([coord.lat, coord.lon], 14); }, [coord.lat, coord.lon, map]);
  return null;
};

const SiteMapView: React.FC<Props> = ({ address, city, state, zip, label, onEditAddress }) => {
  const [coord, setCoord] = useState<Coord | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const key = cacheKey(address, city, state, zip);

  useEffect(() => {
    if (!address && !city) { setStatus('error'); return; }
    const cached = loadCache()[key];
    if (cached) { setCoord(cached); setStatus('idle'); return; }
    setStatus('loading');
    geocodeAddress({ address, city, state, zip })
      .then(c => {
        if (c) {
          const cache = loadCache();
          cache[key] = c;
          saveCache(cache);
          setCoord(c);
          setStatus('idle');
        } else {
          setStatus('error');
        }
      })
      .catch(() => setStatus('error'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const fullAddr = [address, city, state, zip].filter(Boolean).join(', ');
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddr)}`;

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="text-sm">Locating address...</span>
      </div>
    );
  }

  if (status === 'error' || !coord) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
        <AlertTriangle className="w-6 h-6 text-amber-400" />
        <p className="text-sm text-center px-4">
          {fullAddr ? `Could not locate: ${fullAddr}` : 'No address on this Service Order.'}
        </p>
        <div className="flex flex-col items-center gap-2">
          {onEditAddress && (
            <button
              type="button"
              onClick={onEditAddress}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              {fullAddr ? 'Edit address in customer card' : 'Add address in customer card'}
            </button>
          )}
          {fullAddr && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-orange-500 hover:text-orange-600 font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Search in Google Maps
            </a>
          )}
        </div>
      </div>
    );
  }

  if (!coord) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Address bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-slate-50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="w-4 h-4 text-orange-500 shrink-0" />
          <span className="text-sm text-slate-700 truncate">{fullAddr || label || 'Site location'}</span>
        </div>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 font-medium shrink-0 ml-2"
        >
          <ExternalLink className="w-3 h-3" />
          Google Maps
        </a>
      </div>
      {/* Map */}
      <div className="flex-1 min-h-0" style={{ minHeight: 320 }}>
        <MapContainer
          center={[coord.lat, coord.lon]}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
          attributionControl={true}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <Marker position={[coord.lat, coord.lon]} icon={pinIcon()} />
          <Center coord={coord} />
        </MapContainer>
      </div>
    </div>
  );
};

export default SiteMapView;
