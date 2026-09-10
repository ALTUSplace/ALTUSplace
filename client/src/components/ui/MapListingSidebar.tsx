import { useState, useCallback } from "react";
import { MapPin, List, Map } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InteractiveMap } from "@/components/InteractiveMap";
import { ListingCard, ListingCardProps } from "@/components/ui/ListingCard";

interface MapListingSidebarProps {
  listings: (ListingCardProps & { lat?: number; lng?: number })[];
  selectedId?: string;
  onSelectListing?: (id: string) => void;
  className?: string;
}

export function MapListingSidebar({ listings, selectedId, onSelectListing, className }: MapListingSidebarProps) {
  const [view, setView] = useState<"split" | "map" | "list">("split");

  const handleMarkerSelect = useCallback((listing: any) => {
    if (onSelectListing && listing?.id) onSelectListing(String(listing.id));
  }, [onSelectListing]);

  return (
    <div className={cn("flex h-[calc(100vh-8rem)] flex-col gap-4 lg:h-[calc(100vh-6rem)]", className)}>
      {/* View toggle */}
      <div className="flex items-center gap-2">
        <Button variant={view === "split" ? "default" : "outline"} size="sm" onClick={() => setView("split")} className="gap-1.5 text-xs">
          <Map className="h-3.5 w-3.5" /> Split
        </Button>
        <Button variant={view === "map" ? "default" : "outline"} size="sm" onClick={() => setView("map")} className="gap-1.5 text-xs">
          <MapPin className="h-3.5 w-3.5" /> Map
        </Button>
        <Button variant={view === "list" ? "default" : "outline"} size="sm" onClick={() => setView("list")} className="gap-1.5 text-xs">
          <List className="h-3.5 w-3.5" /> List
        </Button>
      </div>

      {/* Content */}
      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-2">
        {/* Map */}
        {(view === "split" || view === "map") && (
          <div className="h-[50vh] overflow-hidden rounded-2xl border border-border-subtle lg:h-full">
            <InteractiveMap
              listings={listings.filter((l) => l.lat && l.lng).map((l) => ({
                id: l.id, title: l.title, type: l.type, category: l.type,
                city: l.city, pricePerUnit: l.pricePerDay, unitLabel: "/day",
                image: l.images?.[0] || "", lat: l.lat!, lng: l.lng!,
              }))}
              onSelectListing={handleMarkerSelect}
              height="100%"
            />
          </div>
        )}

        {/* List */}
        {(view === "split" || view === "list") && (
          <div className={cn("flex flex-col gap-3 overflow-y-auto pr-1", view === "list" ? "lg:col-span-2" : "")}>
            {listings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-sm text-ink-tertiary">
                <MapPin className="mb-2 h-8 w-8" />
                No listings found in this area
              </div>
            ) : (
              listings.map((listing) => (
                <div
                  key={listing.id}
                  onClick={() => onSelectListing?.(listing.id)}
                  className={cn(
                    "transition-all duration-200",
                    selectedId === listing.id && "scale-[0.98] rounded-2xl ring-2 ring-accent-indigo",
                  )}
                >
                  <ListingCard {...listing} />
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}