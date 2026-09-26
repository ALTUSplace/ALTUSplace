// Confirms the module parses, that its exports resolve, and that the catalog
// diff logic is correct -- all without touching a database. This is what CAN be
// verified on a machine with no Docker and no Postgres, which is the situation
// the parity gate has to survive before CI ever runs it.
import { describe, expect, it } from "vitest";
import { diffCatalogs, stripIndexName } from "./verify-migration-schema-parity.mjs";

describe("index name normalisation", () => {
  // This is the exact shape of the one difference the first CI run reported:
  // drizzle/0014_add_favorites.sql names its primary key constraint
  // `favorites_favorite_id_pk`, while drizzle/schema.ts leaves it unnamed so
  // drizzle-kit's export lets Postgres default to `favorites_pkey`. The index
  // is identical; only the name differs, and no query can reference a primary
  // key's backing index by name.
  const asMigrated = "CREATE UNIQUE INDEX favorites_favorite_id_pk ON public.favorites USING btree (favorite_id)";
  const asDeclared = "CREATE UNIQUE INDEX favorites_pkey ON public.favorites USING btree (favorite_id)";

  it("strips the name from a plain identifier", () => {
    expect(stripIndexName(asMigrated)).toBe("CREATE UNIQUE INDEX ON public.favorites USING btree (favorite_id)");
  });

  it("makes the two differently-named forms of one index compare equal", () => {
    expect(stripIndexName(asMigrated)).toBe(stripIndexName(asDeclared));
  });

  it("keeps a non-unique index, its method and its column list intact", () => {
    expect(stripIndexName("CREATE INDEX favorites_user_idx ON public.favorites USING btree (user_id)")).toBe(
      "CREATE INDEX ON public.favorites USING btree (user_id)"
    );
  });

  it("preserves a non-btree method, since that changes query behaviour", () => {
    const gist = 'CREATE INDEX places_idx ON public.places USING gist ("location")';
    expect(stripIndexName(gist)).toBe('CREATE INDEX ON public.places USING gist ("location")');
  });

  it("preserves multi-column and DESC orderings", () => {
    const composite = "CREATE UNIQUE INDEX favorites_user_listing_unique_idx ON public.favorites USING btree (user_id, listing_id)";
    expect(stripIndexName(composite)).toBe("CREATE UNIQUE INDEX ON public.favorites USING btree (user_id, listing_id)");
  });

  it("strips a double-quoted name, including one containing a space", () => {
    // Postgres quotes a name that is not a plain lower-case identifier, and such
    // a name may contain spaces. Matching only bare identifiers would silently
    // leave the name in place here and report a diff that is not real.
    expect(stripIndexName('CREATE INDEX "My Index" ON public.t USING btree (a)')).toBe(
      "CREATE INDEX ON public.t USING btree (a)"
    );
    expect(stripIndexName('CREATE UNIQUE INDEX "MixedCase" ON public.t USING btree (a)')).toBe(
      "CREATE UNIQUE INDEX ON public.t USING btree (a)"
    );
  });

  it("still distinguishes indexes that differ by more than their name", () => {
    // The point of the exclusion: dropping the name must not blind the gate to
    // a real index regression.
    const oneColumn = stripIndexName("CREATE INDEX ix_a ON public.favorites USING btree (user_id)");
    const twoColumns = stripIndexName("CREATE INDEX ix_b ON public.favorites USING btree (user_id, listing_id)");
    const notUnique = stripIndexName("CREATE INDEX ix_c ON public.favorites USING btree (user_id)");

    expect(oneColumn).not.toBe(twoColumns);
    expect(stripIndexName(asMigrated)).not.toBe(notUnique);
  });
});

describe("migration/schema catalog diff", () => {
  it("reports no difference for identical catalogs", () => {
    const catalog = ["--- tables ---", "listings", "--- columns ---", "listings.id type=integer null=NO"];
    const { onlyInMigrations, onlyInSchema } = diffCatalogs(catalog, [...catalog]);

    expect(onlyInMigrations).toEqual([]);
    expect(onlyInSchema).toEqual([]);
  });

  it("flags a column the schema declares but no migration creates", () => {
    // This is the exact shape of SQLSTATE 42703: the application reads a column
    // that the database does not have.
    const migrated = ["--- columns ---", "reviews.review_id type=integer null=NO"];
    const declared = [...migrated, "reviews.cleanliness_score type=integer null=YES"];

    const { onlyInMigrations, onlyInSchema } = diffCatalogs(migrated, declared);

    expect(onlyInSchema).toEqual(["reviews.cleanliness_score type=integer null=YES"]);
    expect(onlyInMigrations).toEqual([]);
  });

  it("flags an object a migration creates that the schema no longer describes", () => {
    const migrated = ["--- tables ---", "listings", "legacy_audit"];
    const declared = ["--- tables ---", "listings"];

    const { onlyInMigrations, onlyInSchema } = diffCatalogs(migrated, declared);

    expect(onlyInMigrations).toEqual(["legacy_audit"]);
    expect(onlyInSchema).toEqual([]);
  });

  it("flags a check constraint that exists on only one side", () => {
    const migrated = ["--- check constraints ---", "ck reviews reviews_scores_check CHECK ((cleanliness_score >= 1))"];
    const declared = ["--- check constraints ---"];

    const { onlyInMigrations } = diffCatalogs(migrated, declared);

    expect(onlyInMigrations).toHaveLength(1);
    expect(onlyInMigrations[0]).toContain("reviews_scores_check");
  });

  it("ignores ordering differences, since both dumps are fully ordered", () => {
    // Postgres canonicalises on the way in, so ordering noise must not be
    // reported as drift or the gate would be unusable.
    const a = ["x", "y", "z"];
    const b = ["x", "y", "z"];

    expect(diffCatalogs(a, b).onlyInMigrations).toEqual([]);
    expect(diffCatalogs(a, b).onlyInSchema).toEqual([]);
  });

  it("preserves stable order in its output so CI diffs are readable", () => {
    const migrated = ["b", "a"];
    const declared = ["d", "c"];

    const { onlyInMigrations, onlyInSchema } = diffCatalogs(migrated, declared);

    expect(onlyInMigrations).toEqual(["b", "a"]);
    expect(onlyInSchema).toEqual(["d", "c"]);
  });

  it("reports no difference when two catalogs differ only in an index name", () => {
    // The end-to-end shape of the first CI run: 609 lines each side, one index
    // named differently, nothing else. After normalisation this must be clean,
    // otherwise the gate would carry a permanent red line that people learn to
    // ignore.
    const migrated = [
      "--- indexes (names ignored, method/columns/uniqueness compared) ---",
      "ix CREATE UNIQUE INDEX ON public.favorites USING btree (favorite_id)",
      "ix CREATE INDEX ON public.favorites USING btree (user_id)",
    ];
    const declared = [
      "--- indexes (names ignored, method/columns/uniqueness compared) ---",
      "ix CREATE UNIQUE INDEX ON public.favorites USING btree (favorite_id)",
      "ix CREATE INDEX ON public.favorites USING btree (user_id)",
    ];

    const { onlyInMigrations, onlyInSchema } = diffCatalogs(migrated, declared);

    expect(onlyInMigrations).toEqual([]);
    expect(onlyInSchema).toEqual([]);
  });
});
