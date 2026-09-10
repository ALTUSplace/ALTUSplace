import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("listing comment system audit", () => {
  it("declares the listing_comments table in the drizzle schema", () => {
    const schema = read("drizzle/schema.ts");
    expect(schema).toContain("listingComments");
    expect(schema).toMatch(/mysqlTable\(\"listing_comments\"/);
    expect(schema).toContain('parentId: int("parent_id")');
    expect(schema).toContain('listingId: int("listing_id").notNull()');
    expect(schema).toContain('authorId: int("author_id").notNull()');
    expect(schema).toContain('status: mysqlEnum("status", ["visible", "hidden"])');
    expect(schema).toContain("listingCreatedIdx");
  });

  it("wires a comments namespace into the tRPC app router with the required procedures", () => {
    const routers = read("server/routers.ts");
    expect(routers).toContain("comments: router({");
    expect(routers).toContain("listByListing: publicProcedure");
    expect(routers).toContain("create: protectedProcedure");
    expect(routers).toContain("remove: protectedProcedure");
    expect(routers).toContain("listingComments");
    // Only parameterized ORM queries — never raw string-concat SQL.
    expect(routers).not.toMatch(/db\.execute\s*\(\s*[`'"]/);
  });

  it("mounts the comment thread UI on the property and car detail pages", () => {
    const component = read("client/src/components/CommentSection.tsx");
    expect(component).toContain("useQuery");
    expect(component).toContain("trpc.comments.listByListing");
    expect(component).toContain("trpc.comments.create");
    // All requested edge-case states are handled.
    expect(component).toContain("isLoading");
    expect(component).toContain("isError");
    expect(component).toContain("noComments");
    expect(component).toContain("loadMoreComments");
    expect(component).toContain("isAuthenticated");

    const propertyPage = read("client/src/pages/PropertyDetailWithVideo.tsx");
    expect(propertyPage).toContain("import CommentSection");
    expect(propertyPage).toContain("<CommentSection listingId={listingId} />");

    const carPage = read("client/src/pages/CarDetails.tsx");
    expect(carPage).toContain("import CommentSection");
    expect(carPage).toContain("<CommentSection listingId={numericListingId} />");
  });
});

describe("dark mode toggle audit", () => {
  it("persists the theme, seeds from the OS preference and hardened via an anti-FOUC script", () => {
    const context = read("client/src/contexts/ThemeContext.tsx");
    expect(context).toContain('localStorage.setItem("theme"');
    expect(context).toContain("prefers-color-scheme: dark");
    expect(context).toContain("colorScheme");
    expect(context).toContain('root.classList.add("dark")');

    const html = read("client/index.html");
    expect(html).toContain("prefers-color-scheme");
    expect(html).toContain('localStorage.getItem("theme")');
  });

  it("provides a theme toggle in both the desktop navbar and mobile menu", () => {
    const navbar = read("client/src/components/Navbar.tsx");
    expect(navbar).toContain("const { theme, toggleTheme } = useTheme();");
    expect(navbar).toContain("toggleTheme()");
    expect(navbar).toContain("themeToDarkToast");
    expect(navbar).toContain("themeToLightToast");
    // Mobile menu toggle block.
    expect(navbar).toContain("mobileMenuOpen");
    expect(navbar).toContain("Sun");
    expect(navbar).toContain("Moon");
  });
});