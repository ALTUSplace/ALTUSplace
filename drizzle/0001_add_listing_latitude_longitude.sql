ALTER TABLE "listings" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "longitude" double precision;--> statement-breakpoint
CREATE INDEX "listings_lat_lng_idx" ON "listings" USING btree ("latitude","longitude");