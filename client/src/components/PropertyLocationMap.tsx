/**
 * Single-pin location map for the property detail page.
 *
 * Why this exists and why it is deliberately narrow: the search map
 * (`MapboxSearchMap`) is built around clustering, a search-radius circle and a
 * viewport→re-query loop, none of which make sense for one known address. This
 * component is the detail-page counterpart — a single centred pin.
 *
 * Precision contract: this component is only ever rendered with REAL listing
 * coordinates. `lib/mapbox`'s `resolveListingCoords` falls back to a city
 * centroid when `lat`/`lng` are null, and a centroid pin can sit kilometres
 * away from the actual address. The caller checks for genuine coordinates and
 * renders the city as text instead, so this file never has to decide whether a
 * coordinate is "close enough" to claim it is the property's location.
 *
 * mapbox-gl (~800 kB) is type-only here and loaded lazily (module + CSS) inside
 * the component, so it stays out of the initial bundle — same approach as
 * `MapboxSearchMap`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type mapboxgl from "mapbox-gl";
import { ExternalLink, Loader2, MapPin } from "lucide-react";
import { getMapboxToken, type LatLng } from "@/lib/mapbox";
import { useTheme } from "@/contexts/ThemeContext";
import { useToken } from "@/lib/designTokens";
import { cn } from "@/lib/utils";

/** Close enough to read the surrounding streets without losing the pin. */
const PIN_ZOOM = 14;

const SOURCE_ID = "property-pin";
const HALO_LAYER_ID = "property-pin-halo";
const DOT_LAYER_ID = "property-pin-dot";

function styleForTheme(theme: string): string {
  return theme === "dark" ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12";
}

/** Google Maps directions link for a known coordinate pair. */
export function buildPropertyDirectionsUrl(coords: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`;
}

export interface PropertyLocationMapProps {
  /** Verified listing coordinates. Never a city-centroid fallback. */
  coords: LatLng;
  /** Accessible name for the map region, e.g. "Location of the property". */
  label: string;
  /** Copy shown in place of the map when no Mapbox token is configured. */
  missingTokenNotice: string;
  /** Label for the link out to Google Maps. */
  openInMapsLabel: string;
  loadingLabel: string;
  className?: string;
}

export function PropertyLocationMap({
  coords,
  label,
  missingTokenNotice,
  openInMapsLabel,
  loadingLabel,
  className,
}: PropertyLocationMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const { theme } = useTheme();
  const accent = useToken("--accent-primary");
  const baseSurface = useToken("--bg-base");
  const token = getMapboxToken();

  // Paints live in a ref so `addPin` keeps a stable identity. If it depended on
  // the token values directly, a theme flip would change the callback identity
  // and the style-swap effect below would fire twice, adding the source twice.
  const paintRef = useRef({ accent, baseSurface });
  useEffect(() => {
    paintRef.current = { accent, baseSurface };
  }, [accent, baseSurface]);

  const addPin = useCallback((map: mapboxgl.Map) => {
    if (map.getLayer(DOT_LAYER_ID)) return;
    const { accent: dot, baseSurface: ring } = paintRef.current;
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: { type: "Point", coordinates: [coords.lng, coords.lat] },
        properties: {},
      },
    });
    map.addLayer({
      id: HALO_LAYER_ID,
      type: "circle",
      source: SOURCE_ID,
      paint: { "circle-radius": 18, "circle-color": dot, "circle-opacity": 0.18 },
    });
    map.addLayer({
      id: DOT_LAYER_ID,
      type: "circle",
      source: SOURCE_ID,
      paint: {
        "circle-radius": 7,
        "circle-color": dot,
        "circle-stroke-width": 2.5,
        "circle-stroke-color": ring,
      },
    });
    // The pin is the subject of the map — keep it above the basemap labels.
    map.moveLayer(HALO_LAYER_ID);
    map.moveLayer(DOT_LAYER_ID);
  }, [coords.lat, coords.lng]);

  // Create the map once. Theme changes are handled by the effect below rather
  // than by tearing the whole map down and rebuilding it.
  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;
    let disposed = false;

    (async () => {
      const [{ default: mapboxgl }] = await Promise.all([
        import("mapbox-gl"),
        import("mapbox-gl/dist/mapbox-gl.css"),
      ]);
      if (disposed || !containerRef.current || mapRef.current) return;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        accessToken: token,
        style: styleForTheme(theme),
        center: [coords.lng, coords.lat],
        zoom: PIN_ZOOM,
        attributionControl: true,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-left");
      map.on("load", () => {
        if (disposed) return;
        addPin(map);
        setReady(true);
      });
      mapRef.current = map;
    })();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // `theme` is intentionally absent: the style is re-pointed by the effect
    // below so a dark-mode toggle does not re-download the GL bundle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, addPin]);

  // Swap the basemap on a theme flip. setStyle drops every source and layer, so
  // the pin is re-added once the new style finishes loading.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setStyle(styleForTheme(theme));
    map.once("styledata", () => addPin(map));
  }, [theme, ready, addPin]);

  if (!token) {
    return (
      <div
        className={cn(
          "flex w-full flex-col items-center justify-center gap-3 rounded-3xl border border-border-subtle bg-bg-muted p-8 text-center",
          className,
        )}
      >
        <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-clay-soft text-accent-clay">
          <MapPin className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="text-sm text-ink-secondary">{missingTokenNotice}</p>
        <a
          href={buildPropertyDirectionsUrl(coords)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-accent-clay px-4 text-sm font-bold text-white transition-colors hover:bg-accent-clay-hover"
        >
          {openInMapsLabel}
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full", className)} role="application" aria-label={label}>
      <div ref={containerRef} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/80 backdrop-blur-sm">
          <Loader2 className="size-7 animate-spin text-accent-clay" aria-hidden="true" />
          <p className="text-xs text-ink-secondary">{loadingLabel}</p>
        </div>
      )}
    </div>
  );
}

export default PropertyLocationMap;
