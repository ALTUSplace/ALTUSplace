/**
 * InteractiveMap.tsx - Leaflet-based interactive map for ALTUSplace
 * Displays rental properties and cars on a map centered on Morocco
 */
import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Car, Home, Building2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css';

interface MapListing {
  id: string;
  title: string;
  type: 'car' | 'property' | 'office';
  category: string;
  city: string;
  pricePerUnit: number;
  unitLabel: string;
  image: string;
  lat: number;
  lng: number;
}

interface InteractiveMapProps {
  listings: MapListing[];
  className?: string;
  onSelectListing?: (listing: MapListing) => void;
  height?: string;
}

// Custom icons for different listing types
const createTypeIcon = (type: 'car' | 'property' | 'office', price: number) => {
  const colors = {
    car: { bg: '#1d6fa5', border: '#155a87' },
    property: { bg: '#087f5b', border: '#066648' },
    office: { bg: '#D98236', border: '#B96A28' },
  };
  const color = colors[type];

  return L.divIcon({
    className: 'custom-marker-icon',
    html: `<div style="
      background: linear-gradient(135deg, ${color.bg}, ${color.border});
      padding: 6px 10px;
      border-radius: 20px;
      border: 2px solid white;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
      font-family: 'Cairo', system-ui, sans-serif;
      font-size: 11px;
      font-weight: 700;
      color: white;
      cursor: pointer;
      transition: transform 0.2s;
    " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
      <span>${price}</span>
      <span>درهم</span>
    </div>`,
    iconSize: [80, 32],
    iconAnchor: [40, 32],
    popupAnchor: [0, -32],
  });
};

// Component to handle map view updates
function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  const initialRender = useRef(true);

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    map.setView(center, zoom);
  }, [map, center, zoom]);

  return null;
}

// Component to invalidate map size after mount
function MapInitializer() {
  const map = useMap();
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      setTimeout(() => {
        map.invalidateSize();
      }, 100);
    }
  }, [map]);

  return null;
}

export function InteractiveMap({
  listings,
  className,
  onSelectListing,
  height = '500px',
}: InteractiveMapProps) {
  const { theme } = useTheme();
  const [selectedListing, setSelectedListing] = useState<MapListing | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Default center: Casablanca, Morocco
  const defaultCenter: [number, number] = [33.5731, -7.5898];
  const defaultZoom = 11;

  // Calculate center from listings if available
  const center: [number, number] = listings.length > 0
    ? [
        listings.reduce((sum, l) => sum + l.lat, 0) / listings.length,
        listings.reduce((sum, l) => sum + l.lng, 0) / listings.length,
      ]
    : defaultCenter;

  const getIcon = (type: 'car' | 'property' | 'office', price: number) => {
    return createTypeIcon(type, price);
  };

  const getTypeIcon = (type: 'car' | 'property' | 'office') => {
    switch (type) {
      case 'car':
        return <Car className="w-3.5 h-3.5" />;
      case 'property':
        return <Home className="w-3.5 h-3.5" />;
      case 'office':
        return <Building2 className="w-3.5 h-3.5" />;
    }
  };

  const getTypeLabel = (type: 'car' | 'property' | 'office') => {
    switch (type) {
      case 'car':
        return 'سيارة';
      case 'property':
        return 'عقار';
      case 'office':
        return 'مكتب';
    }
  };

  const getTypeBadgeColor = (type: 'car' | 'property' | 'office') => {
    switch (type) {
      case 'car':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      case 'property':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'office':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    }
  };

  return (
    <div
      className={cn(
        'relative w-full rounded-3xl overflow-hidden shadow-2xl border border-border',
        className
      )}
      style={{ height }}
    >
      <MapContainer
        center={center}
        zoom={defaultZoom}
        className="w-full h-full z-0"
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        ref={mapRef}
      >
        <MapInitializer />
        <MapController center={center} zoom={defaultZoom} />

        {/* Tile Layer - Theme-aware */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={
            theme === 'dark'
              ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
              : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
          }
        />

        {/* Markers */}
        {listings.map((listing) => (
          <Marker
            key={listing.id}
            position={[listing.lat, listing.lng]}
            icon={getIcon(listing.type, listing.pricePerUnit)}
            eventHandlers={{
              click: () => {
                setSelectedListing(listing);
                if (onSelectListing) onSelectListing(listing);
              },
            }}
          >
            <Popup>
              <div className="min-w-[200px] p-1" dir="rtl">
                <div className="flex items-start gap-3">
                  <img
                    src={listing.image}
                    alt={listing.title}
                    className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border',
                          getTypeBadgeColor(listing.type)
                        )}
                      >
                        {getTypeIcon(listing.type)}
                        {getTypeLabel(listing.type)}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100 line-clamp-1">
                      {listing.title}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" />
                      {listing.city}
                    </p>
                    <div className="text-amber-600 dark:text-amber-400 font-extrabold text-sm mt-1">
                      {listing.pricePerUnit} <span className="text-xs font-normal">{listing.unitLabel}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Selected Listing Preview Card */}
      {selectedListing && (
        <div className="absolute bottom-6 left-6 right-6 sm:right-auto sm:w-80 z-[1000]">
          <div className="bg-background/95 backdrop-blur-md border border-border shadow-2xl rounded-2xl p-4 relative">
            <button
              onClick={() => setSelectedListing(null)}
              className="absolute top-2 left-2 text-muted-foreground hover:text-foreground text-sm font-bold bg-muted w-6 h-6 rounded-full flex items-center justify-center transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="flex gap-3">
              <img
                src={selectedListing.image}
                alt={selectedListing.title}
                className="w-20 h-20 object-cover rounded-xl flex-shrink-0"
              />
              <div className="space-y-1 flex-1 min-w-0">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border',
                    getTypeBadgeColor(selectedListing.type)
                  )}
                >
                  {getTypeIcon(selectedListing.type)}
                  {getTypeLabel(selectedListing.type)}
                </span>
                <h4 className="font-bold text-sm line-clamp-1">{selectedListing.title}</h4>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {selectedListing.city}
                </p>
                <div className="text-primary font-extrabold text-sm">
                  {selectedListing.pricePerUnit} {selectedListing.unitLabel}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map Legend */}
      <div className="absolute top-4 right-4 z-[1000] bg-background/90 backdrop-blur-md border border-border rounded-xl p-3 shadow-lg">
        <p className="text-[10px] font-bold text-muted-foreground mb-2">دليل الرموز</p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500 border border-white shadow" />
            <span className="text-[10px] font-medium">سيارة</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500 border border-white shadow" />
            <span className="text-[10px] font-medium">عقار</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500 border border-white shadow" />
            <span className="text-[10px] font-medium">مكتب</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InteractiveMap;