import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { cn } from '@/lib/utils';
import { getMapboxToken, MOROCCO_CENTER, type LatLng } from '@/lib/mapbox';
import { useTheme } from '@/contexts/ThemeContext';
import { AlertTriangle, ArrowLeftRight, Loader2, MapPin } from 'lucide-react';

export interface MapboxMapListing {
  id: string;
  title: string;
  type: 'car' | 'property' | 'office';
  city: string;
  pricePerUnit: number;
  unitLabel: string;
  image?: string;
  lat: number;
  lng: number;
}

export interface MapViewport {
  center: LatLng;
  zoom: number;
}

export interface MapboxSearchMapProps {
  listings: MapboxMapListing[];
  className?: string;
  height?: string;
  radiusKm?: number;
  center?: LatLng;
  onSelectListing?: (listing: MapboxMapListing) => void;
  onViewportChange?: (viewport: MapViewport) => void;
}

const TYPE_BG: Record<MapboxMapListing['type'], string> = {
  car: '#1d6fa5',
  property: '#087f5b',
  office: '#2563EB',
};

function radiusPixels(radiusKm: number, lat: number, zoom: number): number {
  const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  return Math.max(1, (radiusKm * 1000) / metersPerPixel);
}

export function MapboxSearchMap({
  listings,
  className,
  height = '560px',
  radiusKm = 25,
  center,
  onSelectListing,
  onViewportChange,
}: MapboxSearchMapProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const centerRef = useRef<LatLng>(center ?? MOROCCO_CENTER);
  const [mapReady, setMapReady] = useState(false);
  const token = getMapboxToken();

  const emitViewport = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const mapCenter = map.getCenter();
    centerRef.current = { lat: mapCenter.lat, lng: mapCenter.lng };
    if (onViewportChange) {
      onViewportChange({ center: centerRef.current, zoom: map.getZoom() });
    }
    updateRadiusCircle();
  }, [onViewportChange]);

  const updateRadiusCircle = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource('search-radius') as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    const { lat, lng } = centerRef.current;
    const zoom = map.getZoom();
    source.setData({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {},
    });
    if (map.getLayer('radius-fill')) {
      map.setPaintProperty('radius-fill', 'circle-radius', radiusPixels(radiusKm, lat, zoom));
    }
    if (map.getLayer('radius-center')) {
      map.setPaintProperty('radius-center', 'circle-radius', Math.max(4, 14 / zoom));
    }
  }, [radiusKm]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      accessToken: token,
      style: theme === 'dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12',
      center: [MOROCCO_CENTER.lng, MOROCCO_CENTER.lat],
      zoom: 7,
      attributionControl: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left');
    map.on('load', () => {
      map.addSource('search-radius', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'Point', coordinates: [MOROCCO_CENTER.lng, MOROCCO_CENTER.lat] }, properties: {} },
      });
      map.addLayer({
        id: 'radius-fill',
        type: 'circle',
        source: 'search-radius',
        paint: {
          'circle-radius': radiusPixels(radiusKm, MOROCCO_CENTER.lat, map.getZoom()),
          'circle-color': '#f59e0b',
          'circle-opacity': 0.18,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#f59e0b',
          'circle-stroke-opacity': 0.85,
        },
      });
      map.addLayer({
        id: 'radius-center',
        type: 'circle',
        source: 'search-radius',
        paint: {
          'circle-radius': 5,
          'circle-color': '#f59e0b',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      });
      updateRadiusCircle();
      setMapReady(true);
    });
    const onMoveEnd = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(emitViewport, 350);
    };
    const onMove = () => updateRadiusCircle();
    map.on('moveend', onMoveEnd);
    map.on('move', onMove);
    map.on('zoom', onMove);
    mapRef.current = map;
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, theme]);

  useEffect(() => {
    if (!center) return;
    centerRef.current = center;
    updateRadiusCircle();
  }, [center, updateRadiusCircle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    listings.forEach((listing) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'flex items-center gap-1 rounded-full border-2 border-white px-2.5 py-1 text-[11px] font-bold text-white shadow-lg hover:scale-110 transition-transform cursor-pointer';
      el.style.background = TYPE_BG[listing.type];
      el.style.fontFamily = "'Cairo', system-ui, sans-serif";
      el.textContent = `${listing.pricePerUnit} ${listing.unitLabel === 'درهم / يوم' ? 'درهم' : listing.unitLabel}`;
      el.addEventListener('click', () => onSelectListing?.(listing));
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([listing.lng, listing.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [listings, mapReady, onSelectListing]);

  if (!token) {
    return (
      <div
        className={cn('relative w-full rounded-3xl overflow-hidden border border-border bg-background flex items-center justify-center p-6', className)}
        style={{ height }}
      >
        <div className="max-w-md text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <MapPin className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-foreground">خريطة Mapbox غير مفعّلة</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            لتفعيل الخريطة التفاعلية، أضف رمز الدخول <code className="text-xs bg-muted rounded px-1.5 py-0.5" dir="ltr">VITE_MAPBOX_TOKEN</code> في ملف <code className="text-xs bg-muted rounded px-1.5 py-0.5" dir="ltr">client/.env.local</code>.
          </p>
          <a
            href="https://account.mapbox.com/access-tokens/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-500 hover:underline"
          >
            إنشاء رمز دخول على حساب Mapbox <ArrowLeftRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative w-full rounded-3xl overflow-hidden shadow-2xl border border-border', className)} style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />
      {!mapReady && (
        <div className="absolute inset-0 z-10 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          <p className="text-xs text-muted-foreground">جاري تحميل الخريطة…</p>
        </div>
      )}
      <div className="absolute top-4 left-4 z-[5] flex items-center gap-1.5 bg-background/90 backdrop-blur-md border border-border rounded-xl px-3 py-1.5 shadow-lg pointer-events-auto hidden sm:flex">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
        <span className="text-[11px] font-semibold text-foreground">ابحث وحرّك الخريطة — النتائج تتحدث تلقائياً</span>
      </div>
      {mapReady && (
        <div className="absolute bottom-4 right-4 z-[5] bg-background/90 backdrop-blur-md border border-border rounded-xl px-3 py-2 shadow-lg pointer-events-none">
          <span className="text-xs font-bold text-foreground">نصف قطر البحث: <span className="text-amber-500">{radiusKm} كم</span></span>
        </div>
      )}
    </div>
  );
}

export default MapboxSearchMap;