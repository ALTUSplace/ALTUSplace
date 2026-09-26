/**
 * Search map with clustered listing pins and a fullscreen toggle.
 *
 * ── VERIFIED ────────────────────────────────────────────────────────────────
 * scripts/verify-map-interactions.mjs drives the production build in Chromium
 * with 56 injected listings (39 cars / 17 properties across Casablanca, Rabat,
 * Marrakech, Agadir and Tangier) and asserts, against the live Map instance:
 * all 56 features reach the GeoJSON source; clustering is active
 * (clusterMaxZoom 13, clusterRadius 56); country zoom collapses to 2 clusters
 * with 0 individual pins; clicking a cluster performs an expansion zoom
 * (z10 -> z11.3) and re-renders children; the largest cluster absorbs 22 points;
 * clicking an individual pin opens a popup preview carrying title, city, price
 * and a CTA; and the CTA routes by listing type in BOTH directions
 * (/car/1007 and /property/1017). 27 checks, all passing.
 *
 * ── NOT VERIFIED (environment) ───────────────────────────────────────────────
 * No database is reachable in the verification environment, so the fixtures
 * replace the `listings.search` tRPC response rather than coming from the real
 * query. Consequently these paths were never executed: the search SQL itself
 * (radius/price/type/pagination filters), the search-radius circle and the
 * onViewportChange -> radiusKm re-query loop, the fullscreen toggle, dark-mode
 * repaint, and clustering at real-world volumes (56 synthetic points is not a
 * city — Mapbox's clustering is trusted beyond that, not measured). Only
 * Chromium mouse events were used: no real touch, iOS, Safari or Firefox.
 *
 * Clustering is asserted through a build-flag-gated window handle rather than
 * the DOM, because Mapbox paints clusters to a <canvas> and cluster state is
 * otherwise unobservable. See the hook below and README "Feature verification
 * status".
 */
import { useEffect, useRef, useState, useCallback } from 'react';
// mapbox-gl (~800 kB) is type-only here and loaded lazily (module + CSS) inside
// the component, so the map keeps search fast and stays out of the initial bundle.
import type mapboxgl from 'mapbox-gl';
import type { ExpressionSpecification, GeoJSONSource } from 'mapbox-gl';
import { cn } from '@/lib/utils';
import { getMapboxToken, MOROCCO_CENTER, type LatLng } from '@/lib/mapbox';
import { useTheme } from '@/contexts/ThemeContext';
// Aliased: this module already has a local `token` holding the Mapbox access token.
import { token as designToken } from '@/lib/designTokens';
import { AlertTriangle, ArrowLeftRight, Loader2, MapPin, X } from 'lucide-react';

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
  /**
   * Renders the map as a full-viewport overlay instead of an inline panel.
   * The parent owns the toggle so it can also swap the surrounding results
   * grid; the map only owns the presentation.
   */
  fullscreen?: boolean;
  /** Called when the user dismisses the fullscreen map (Escape / close button). */
  onExitFullscreen?: () => void;
}

/**
 * Mapbox paints markers with concrete colour strings and never evaluate
 * `var()`, so each token has to be resolved to a hex before it reaches a layer.
 *
 * Resolution goes through `token()` from `@/lib/designTokens` — the single
 * resolver for the whole app — rather than a local copy of it. That module
 * memoises per theme, so the paints below are re-applied on a theme flip (see
 * the `setPaintProperty` effect) and a dark-mode toggle never leaves a light
 * palette baked into the layers. Its FALLBACKS table carries the light-theme
 * value of every token named below, which is what prerender (no DOM) and a
 * renamed token degrade to.
 *
 * The three categories must stay mutually distinguishable on the map, so they
 * take three different token families (brand blue / success green / warm gold)
 * rather than the two near-identical navies (#1d6fa5 + #2563EB) that used to sit
 * side by side.
 */
const TYPE_TOKEN: Record<MapboxMapListing['type'], string> = {
  car: '--accent-primary',
  property: '--accent-green',
  office: '--accent-warm',
};

/** Mapbox `step` expression colouring cluster circles by point count. */
function clusterColorExpression(): ExpressionSpecification {
  return [
    'step',
    ['get', 'point_count'],
    designToken(CLUSTER_COLOR_STOPS[0].token),
    ...CLUSTER_COLOR_STOPS.slice(1).flatMap((stop) => [stop.threshold, designToken(stop.token)]),
  ] as ExpressionSpecification;
}

/** Mapbox `match` expression colouring individual pins by listing type. */
function pointColorExpression(): ExpressionSpecification {
  return [
    'match',
    ['get', 'type'],
    'car',
    designToken(TYPE_TOKEN.car),
    'property',
    designToken(TYPE_TOKEN.property),
    designToken(TYPE_TOKEN.office),
  ] as ExpressionSpecification;
}

/** Narrows a rendered feature's geometry to the Point we know the source emits. */
function pointCoordinates(feature: { geometry: unknown }): [number, number] {
  return (feature.geometry as { coordinates: [number, number] }).coordinates;
}

function radiusPixels(radiusKm: number, lat: number, zoom: number): number {
  const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  return Math.max(1, (radiusKm * 1000) / metersPerPixel);
}

/**
 * Builds the mini-preview card shown when an individual pin is clicked.
 *
 * Constructed with createElement/textContent rather than innerHTML: titles and
 * prices come from user-submitted listing data, so interpolating them into an
 * HTML string would be an injection vector.
 */
function buildListingPreview(listing: MapboxMapListing, onOpen: () => void): HTMLElement {
  const card = document.createElement('div');
  card.className = 'font-sans text-start';

  if (listing.image) {
    const img = document.createElement('img');
    img.src = listing.image;
    img.alt = '';
    img.loading = 'lazy';
    img.className = 'mb-2 h-24 w-full rounded-lg object-cover';
    card.appendChild(img);
  }

  const title = document.createElement('p');
  title.className = 'line-clamp-2 text-xs font-bold leading-snug text-neutral-900';
  title.textContent = listing.title;
  card.appendChild(title);

  const meta = document.createElement('p');
  meta.className = 'mt-1 text-[11px] text-neutral-500';
  meta.textContent = listing.city;
  card.appendChild(meta);

  const price = document.createElement('p');
  price.className = 'mt-1.5 text-xs font-extrabold text-neutral-900';
  price.textContent = `${listing.pricePerUnit} ${listing.unitLabel === 'درهم / يوم' ? 'درهم' : listing.unitLabel}`;
  card.appendChild(price);

  const open = document.createElement('button');
  open.type = 'button';
  open.className =
    'mt-2 w-full rounded-md bg-[var(--accent-clay)] px-2 py-1.5 text-[11px] font-bold text-white';
  open.textContent = 'عرض';
  open.addEventListener('click', onOpen);
  card.appendChild(open);

  return card;
}

// Cluster fills step up in density, so a glance at the map shows where the
// listings are thickest. Each stop is a token name resolved through
// `designToken`, and the whole expression is rebuilt on theme flip so a
// dark-mode toggle never leaves a light palette baked into the layer.
//
// The two dense stops use the navy ramp, which `index.css` defines in both
// themes. They take the navy rather than another accent so a dense cluster stays
// visually distinct from the three listing-type colours.
const CLUSTER_COLOR_STOPS: readonly { token: string; threshold: number }[] = [
  { token: '--accent-primary', threshold: 0 },
  { token: '--accent-primary', threshold: 10 },
  { token: '--brand-navy', threshold: 50 },
  { token: '--brand-navy-deep', threshold: 200 },
];

export function MapboxSearchMap({
  listings,
  className,
  height = '560px',
  radiusKm = 25,
  center,
  onSelectListing,
  onViewportChange,
  fullscreen = false,
  onExitFullscreen,
}: MapboxSearchMapProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const centerRef = useRef<LatLng>(center ?? MOROCCO_CENTER);
  // Latest listings + callback, read by the map's own click handlers. Held in refs
  // so the handlers are registered once with the map instead of being torn down
  // and re-bound on every listings change.
  const listingsRef = useRef<MapboxMapListing[]>(listings);
  const onSelectRef = useRef(onSelectListing);
  const [mapReady, setMapReady] = useState(false);
  const token = getMapboxToken();

  useEffect(() => {
    listingsRef.current = listings;
  }, [listings]);

  useEffect(() => {
    onSelectRef.current = onSelectListing;
  }, [onSelectListing]);

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
    let disposed = false;

    (async () => {
      const [{ default: mapboxgl },] = await Promise.all([
        import("mapbox-gl"),
        import("mapbox-gl/dist/mapbox-gl.css"),
      ]);
      if (disposed || !containerRef.current || mapRef.current) return;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        accessToken: token,
        style: theme === 'dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12',
        center: [MOROCCO_CENTER.lng, MOROCCO_CENTER.lat],
        zoom: 7,
        attributionControl: true,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left');

      // Test-only handle, compiled out unless explicitly enabled.
      //
      // Mapbox paints clusters and pins to a <canvas>, so nothing about
      // clustering is observable from the DOM: there are no marker elements to
      // count and cluster bubbles are painted, not rendered as text. Verifying
      // "a cluster exists, clicking it expanded the zoom, the children then
      // render individually" therefore requires reaching the live Map instance
      // to call queryRenderedFeatures(). Gated on a build-time flag so the
      // assignment cannot happen in a normal production build:
      //   VITE_MAP_TEST_HOOK=1 pnpm build
      if (import.meta.env.VITE_MAP_TEST_HOOK === '1') {
        (window as unknown as Record<string, unknown>).__altusMap = map;
      }

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

        // --- Clustered listing layer ---------------------------------------
        // Markers are rendered by the GPU from a single GeoJSON source with
        // Mapbox's built-in clustering rather than as one DOM node per listing.
        // That is what keeps the map responsive at high densities (the search
        // endpoint caps a page at 200 rows, but the map must not degrade if
        // that grows), and it avoids thousands of layout/paint nodes.
        map.addSource('listing-points', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          cluster: true,
          // Above this zoom the clusters dissolve into individual pins.
          clusterMaxZoom: 13,
          clusterRadius: 56,
        });

        map.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'listing-points',
          filter: ['has', 'point_count'],
          paint: {
            // Radius scales with the cluster size so a 2-pin and a 200-pin
            // cluster are visually distinguishable at a glance.
            'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 50, 32, 200, 42],
            'circle-color': clusterColorExpression(),
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.92,
          },
        });

        map.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'listing-points',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 12,
          },
          paint: { 'text-color': '#ffffff' },
        });

        map.addLayer({
          id: 'unclustered-point',
          type: 'circle',
          source: 'listing-points',
          filter: ['!', ['has', 'point_count']],
          paint: {
            // Colour still encodes the listing type, matching the previous
            // per-listing DOM markers.
            'circle-radius': 7,
            'circle-color': pointColorExpression(),
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        });

        // Cursor affordance: only interactive layers get the pointer.
        for (const layer of ['clusters', 'unclustered-point']) {
          map.on('mouseenter', layer, () => {
            map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', layer, () => {
            map.getCanvas().style.cursor = '';
          });
        }

        // Clicking a cluster zooms to the zoom level where it splits apart.
        map.on('click', 'clusters', (event) => {
          const feature = map.queryRenderedFeatures(event.point, { layers: ['clusters'] })[0];
          const clusterId = feature?.properties?.cluster_id;
          const source = map.getSource('listing-points') as GeoJSONSource | undefined;
          if (clusterId === undefined || !source) return;
          source.getClusterExpansionZoom(clusterId, (error, zoom) => {
            if (error || zoom === null || zoom === undefined) return;
            const [lng, lat] = pointCoordinates(feature);
            map.easeTo({ center: [lng, lat], zoom, duration: 500 });
          });
        });

        // Clicking an individual pin opens a mini-preview card.
        map.on('click', 'unclustered-point', (event) => {
          const feature = map.queryRenderedFeatures(event.point, { layers: ['unclustered-point'] })[0];
          if (!feature) return;
          const id = String(feature.properties?.id ?? '');
          const listing = listingsRef.current.find((item) => item.id === id);
          if (!listing) return;
          const [lng, lat] = pointCoordinates(feature);
          new mapboxgl.Popup({ closeButton: false, offset: 14, maxWidth: '260px' })
            .setLngLat([lng, lat])
            .setDOMContent(buildListingPreview(listing, () => onSelectRef.current?.(listing)))
            .addTo(map);
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
    })();

    return () => {
      disposed = true;
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
    const source = map.getSource('listing-points') as GeoJSONSource | undefined;
    if (!source) return;
    // A single setData call hands the points to Mapbox's own clustering
    // pipeline, which is dramatically cheaper than one DOM node per listing.
    source.setData({
      type: 'FeatureCollection',
      features: listings.map((listing) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [listing.lng, listing.lat] },
        properties: { id: listing.id, type: listing.type },
      })),
    });
  }, [listings, mapReady, theme]);

  // Re-resolve the marker paints when the theme flips. The map instance itself
  // is created once, so without this the layers would keep the colours that
  // were resolved at mount time.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getLayer('clusters')) {
      map.setPaintProperty('clusters', 'circle-color', clusterColorExpression());
    }
    if (map.getLayer('unclustered-point')) {
      map.setPaintProperty('unclustered-point', 'circle-color', pointColorExpression());
    }
  }, [theme, mapReady]);

  // Escape dismisses the fullscreen map.
  useEffect(() => {
    if (!fullscreen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onExitFullscreen?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [fullscreen, onExitFullscreen]);

  // Toggling fullscreen changes the container size, and Mapbox caches its
  // dimensions — without an explicit resize it renders into the old (or a
  // zero-sized) viewport and shows blank tiles.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const handle = window.setTimeout(() => map.resize(), 0);
    return () => window.clearTimeout(handle);
  }, [fullscreen, mapReady]);

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

  const containerClassName = fullscreen
    ? 'fixed inset-0 z-[100] h-[100dvh] w-screen rounded-none border-0'
    : cn('relative w-full rounded-3xl overflow-hidden shadow-2xl border border-border', className);

  return (
    <div
      className={containerClassName}
      style={fullscreen ? undefined : { height }}
      role="application"
      aria-label={fullscreen ? 'خريطة النتائج' : undefined}
    >
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
      {fullscreen && (
        <button
          type="button"
          onClick={() => onExitFullscreen?.()}
          aria-label="إغلاق الخريطة"
          className="absolute top-4 right-4 z-[6] flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background/90 text-foreground shadow-lg backdrop-blur-md transition-colors hover:bg-background"
        >
          <X className="h-5 w-5" />
        </button>
      )}
      {mapReady && (
        <div className="absolute bottom-4 right-4 z-[5] bg-background/90 backdrop-blur-md border border-border rounded-xl px-3 py-2 shadow-lg pointer-events-none">
          <span className="text-xs font-bold text-foreground">نصف قطر البحث: <span className="text-amber-500">{radiusKm} كم</span></span>
        </div>
      )}
    </div>
  );
}

export default MapboxSearchMap;