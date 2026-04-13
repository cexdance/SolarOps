// AddressLink — displays a validated address as a clickable Google Maps link
// Usage (parts):  <AddressLink address="123 Main St" city="Miami" state="FL" zip="33101" />
// Usage (string): <AddressLink fullAddress="123 Main St, Miami, FL 33101" />
import React from 'react';
import { MapPin, ExternalLink } from 'lucide-react';

interface Props {
  // Pass either individual parts OR a single string
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  fullAddress?: string;
  // Display options
  compact?: boolean;       // single line, smaller text
  className?: string;
  iconClassName?: string;
}

function buildAddress(props: Props): string {
  if (props.fullAddress) return props.fullAddress.trim();
  const parts = [
    props.address,
    props.city,
    props.state && props.zip ? `${props.state} ${props.zip}` : props.state || props.zip,
  ].filter(Boolean);
  return parts.join(', ');
}

export const AddressLink: React.FC<Props> = (props) => {
  const { compact = false, className = '', iconClassName = '' } = props;
  const full = buildAddress(props);

  if (!full) return null;

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full)}`;

  if (compact) {
    return (
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`Open in Google Maps: ${full}`}
        className={`inline-flex items-center gap-1 text-slate-600 hover:text-orange-600 transition-colors group ${className}`}
      >
        <MapPin className={`w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-orange-500 ${iconClassName}`} />
        <span className="text-xs truncate">{full}</span>
        <ExternalLink className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
      </a>
    );
  }

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open in Google Maps: ${full}`}
      className={`inline-flex items-start gap-2 text-slate-600 hover:text-orange-600 transition-colors group ${className}`}
    >
      <MapPin className={`w-4 h-4 mt-0.5 shrink-0 text-slate-400 group-hover:text-orange-500 ${iconClassName}`} />
      <span className="text-sm leading-snug">
        {props.fullAddress ? (
          <span>{props.fullAddress}</span>
        ) : (
          <>
            {props.address && <span className="block">{props.address}</span>}
            {(props.city || props.state || props.zip) && (
              <span className="block text-slate-500">
                {[props.city, props.state && props.zip
                  ? `${props.state} ${props.zip}`
                  : props.state || props.zip
                ].filter(Boolean).join(', ')}
              </span>
            )}
          </>
        )}
      </span>
      <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-0 group-hover:opacity-50 transition-opacity" />
    </a>
  );
};
