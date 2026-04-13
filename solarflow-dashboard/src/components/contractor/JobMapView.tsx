// JobMapView — Leaflet map showing work orders as interactive pins
// Contractor can tap a pin to see details and add/remove from route
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  MapPin, Navigation, Phone, Clock, DollarSign,
  Plus, Minus, X, CheckCircle, Car, LayoutGrid,
} from 'lucide-react';
import { ContractorJob, JobPriority, JobStatusContractor } from '../../types/contractor';

// Fix Leaflet default icon path issue with Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom colored marker SVG
const markerSvg = (color: string, border: string) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="32" height="42">
  <path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26s16-16 16-26C32 7.163 24.837 0 16 0z"
    fill="${border}" />
  <path d="M16 2C8.268 2 2 8.268 2 16c0 9.2 14 24.2 14 24.2S30 25.2 30 16C30 8.268 23.732 2 16 2z"
    fill="${color}" />
  <circle cx="16" cy="16" r="6" fill="white" opacity="0.9"/>
</svg>`;

const markerByStatus = (status: JobStatusContractor, selected: boolean): L.DivIcon => {
  const configs: Record<string, { fill: string; border: string }> = {
    assigned:      { fill: selected ? '#f97316' : '#3b82f6', border: selected ? '#c2410c' : '#1d4ed8' },
    en_route:      { fill: '#f97316', border: '#c2410c' },
    in_progress:   { fill: '#f97316', border: '#c2410c' },
    documentation: { fill: '#f97316', border: '#c2410c' },
    completed:     { fill: '#22c55e', border: '#15803d' },
    on_hold:       { fill: '#94a3b8', border: '#64748b' },
    cancelled:     { fill: '#ef4444', border: '#b91c1c' },
  };
  const cfg = configs[status] ?? configs['assigned'];
  return L.divIcon({
    html: markerSvg(cfg.fill, cfg.border),
    iconSize:   [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -42],
    className: '',
  });
};

interface JobMapViewProps {
  jobs: ContractorJob[];
  onUpdateJob: (job: ContractorJob) => void;
  onOpenJob: (job: ContractorJob) => void;
}

export const JobMapView: React.FC<JobMapViewProps> = ({ jobs, onUpdateJob, onOpenJob }) => {
  const mapRef      = useRef<HTMLDivElement>(null);
  const leafletMap  = useRef<L.Map | null>(null);
  const markersRef  = useRef<Map<string, L.Marker>>(new Map());
  const [selectedJob, setSelectedJob] = useState<ContractorJob | null>(null);

  // Build or refresh markers whenever jobs change
  useEffect(() => {
    if (!mapRef.current) return;

    // Initialize map once
    if (!leafletMap.current) {
      // Default center: Florida (where all demo jobs are)
      const center = jobs.length > 0
        ? [
            jobs.reduce((s, j) => s + j.latitude, 0) / jobs.length,
            jobs.reduce((s, j) => s + j.longitude, 0) / jobs.length,
          ] as [number, number]
        : [26.5, -80.5] as [number, number];

      leafletMap.current = L.map(mapRef.current, {
        center,
        zoom: 8,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(leafletMap.current);
    }

    const map = leafletMap.current;

    // Remove old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current.clear();

    // Add markers for every job
    jobs.forEach(job => {
      if (!job.latitude || !job.longitude) return;

      const isSelected = selectedJob?.id === job.id;
      const marker = L.marker(
        [job.latitude, job.longitude],
        { icon: markerByStatus(job.status, isSelected) }
      ).addTo(map);

      marker.on('click', () => {
        setSelectedJob(prev => prev?.id === job.id ? null : job);
      });

      markersRef.current.set(job.id, marker);
    });

    // Fit bounds if multiple jobs
    if (jobs.length > 1) {
      const coords = jobs
        .filter(j => j.latitude && j.longitude)
        .map(j => [j.latitude, j.longitude] as [number, number]);
      if (coords.length > 0) {
        map.fitBounds(L.latLngBounds(coords), { padding: [40, 40] });
      }
    }
  }, [jobs, selectedJob]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
  }, []);

  const handleAddToRoute = (job: ContractorJob) => {
    onUpdateJob({ ...job, status: 'en_route' });
    setSelectedJob(null);
  };

  const handleRemoveFromRoute = (job: ContractorJob) => {
    onUpdateJob({ ...job, status: 'assigned' });
    setSelectedJob(null);
  };

  const routeJobs  = jobs.filter(j => j.status === 'en_route');
  const queueJobs  = jobs.filter(j => j.status === 'assigned');

  return (
    <div className="relative h-full flex flex-col">
      {/* Route counter banner */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-orange-600">
          <Car className="w-4 h-4" />
          {routeJobs.length} in route
        </div>
        <div className="text-xs text-slate-400">·</div>
        <div className="text-sm text-slate-500">{queueJobs.length} in queue</div>
        <div className="ml-auto flex gap-2 text-xs">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />Queue</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500 inline-block" />Route</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />Done</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-slate-400 inline-block" />Hold</span>
        </div>
      </div>

      {/* Map */}
      <div ref={mapRef} className="flex-1 z-0" />

      {/* Bottom sheet: selected job */}
      {selectedJob && (
        <div className="absolute bottom-0 left-0 right-0 z-[400] bg-white rounded-t-2xl shadow-2xl border-t border-slate-200 animate-slide-up">
          {/* Drag handle */}
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 bg-slate-300 rounded-full" />
          </div>

          <div className="px-4 pb-6 pt-1 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900 text-base">{selectedJob.customerName}</h3>
                <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  {selectedJob.address}, {selectedJob.city}, {selectedJob.state}
                </p>
              </div>
              <button onClick={() => setSelectedJob(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 ml-2 flex-shrink-0 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Details */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-50 rounded-xl px-3 py-2 text-center">
                <p className="text-xs text-slate-400">Service</p>
                <p className="text-xs font-semibold text-slate-700 mt-0.5 leading-tight">{selectedJob.serviceType}</p>
              </div>
              <div className="bg-slate-50 rounded-xl px-3 py-2 text-center">
                <p className="text-xs text-slate-400">Time</p>
                <p className="text-xs font-semibold text-slate-700 mt-0.5">{selectedJob.scheduledTime}</p>
              </div>
              <div className="bg-emerald-50 rounded-xl px-3 py-2 text-center">
                <p className="text-xs text-emerald-600">Your Pay</p>
                <p className="text-sm font-bold text-emerald-700 mt-0.5">${selectedJob.contractorTotalPay.toFixed(0)}</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <a
                href={`https://maps.google.com/?q=${selectedJob.latitude},${selectedJob.longitude}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium cursor-pointer"
              >
                <Navigation className="w-4 h-4" />
                Navigate
              </a>
              <a href={`tel:${selectedJob.customerPhone}`}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium cursor-pointer">
                <Phone className="w-4 h-4" />
                Call
              </a>

              {selectedJob.status === 'assigned' && (
                <button
                  onClick={() => handleAddToRoute(selectedJob)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add to Route
                </button>
              )}

              {selectedJob.status === 'en_route' && (
                <button
                  onClick={() => handleRemoveFromRoute(selectedJob)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-700 hover:bg-slate-800 text-white font-semibold rounded-xl text-sm transition-colors cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                  Remove from Route
                </button>
              )}

              {(selectedJob.status === 'in_progress' || selectedJob.status === 'documentation') && (
                <button
                  onClick={() => onOpenJob(selectedJob)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer"
                >
                  Open Active Call
                </button>
              )}

              {selectedJob.status === 'completed' && (
                <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-semibold">
                  <CheckCircle className="w-4 h-4" />
                  Completed
                </div>
              )}
            </div>

            {/* Open WO link */}
            {selectedJob.status !== 'completed' && (
              <button
                onClick={() => { setSelectedJob(null); onOpenJob(selectedJob); }}
                className="w-full text-center text-xs text-slate-400 hover:text-orange-500 transition-colors cursor-pointer py-1"
              >
                Open full work order →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
