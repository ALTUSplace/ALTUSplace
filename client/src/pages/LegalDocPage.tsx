import { useLanguage } from "@/contexts/LanguageContext";
import { useSEO } from "@/lib/seo";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";

type LegalDocPageProps = {
  /** Raw markdown source (the single source of truth for the page content). */
  source: string;
  /** SEO <title>. */
  title: string;
  /** SEO meta description. */
  description: string;
  /** Canonical path, e.g. "/conditions-utilisation". */
  path: string;
};

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  // Support **bold** only — content is first-party Arabic legal text.
  return text.split(/\*\*(.+?)\*\*/g).map((part, index) =>
    index % 2 === 1 ? (
      <strong key={`${keyPrefix}-b-${index}`}>{part}</strong>
    ) : (
      part
    ),
  );
}

/** Renders the small, controlled subset of markdown used by the legal docs. */
function renderMarkdown(source: string): ReactNode[] {
  const lines = (source || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let buffer: string[] = [];
  let listKind: "ul" | "ol" | null = null;
  let blockIndex = 0;

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    blocks.push(
      <p key={`p-${blockIndex++}`}>{renderInline(buffer.join(" "), `p-${blockIndex}`)}</p>,
    );
    buffer = [];
  };

  const flushList = () => {
    if (!listKind) return;
    const items = buffer.map((item, index) => (
      <li key={`li-${blockIndex}-${index}`}>{renderInline(item, `li-${blockIndex}-${index}`)}</li>
    ));
    blocks.push(
      listKind === "ul" ? (
        <ul key={`ul-${blockIndex++}`} className="list-disc space-y-2 ps-6">
          {items}
        </ul>
      ) : (
        <ol key={`ol-${blockIndex++}`} className="list-decimal space-y-2 ps-6">
          {items}
        </ol>
      ),
    );
    listKind = null;
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBuffer();
      flushList();
      continue;
    }

    if (trimmed === "---") {
      flushBuffer();
      flushList();
      blocks.push(<hr key={`hr-${blockIndex++}`} className="border-border" />);
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushBuffer();
      flushList();
      blocks.push(<h3 key={`h3-${blockIndex++}`} className="text-lg font-bold text-foreground">{renderInline(trimmed.slice(4), `h3-${blockIndex}`)}</h3>);
      continue;
    }

    if (trimmed.startsWith("## ")) {
      flushBuffer();
      flushList();
      blocks.push(<h2 key={`h2-${blockIndex++}`} className="text-xl font-bold text-foreground flex items-center gap-2 border-b pb-2">{renderInline(trimmed.slice(3), `h2-${blockIndex}`)}</h2>);
      continue;
    }

    if (trimmed.startsWith("# ")) {
      flushBuffer();
      flushList();
      blocks.push(<h1 key={`h1-${blockIndex++}`} className="text-3xl font-black sm:text-4xl">{renderInline(trimmed.slice(2), `h1-${blockIndex}`)}</h1>);
      continue;
    }

    if (trimmed.startsWith("> ")) {
      flushBuffer();
      flushList();
      blocks.push(<blockquote key={`q-${blockIndex++}`} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-950">{renderInline(trimmed.slice(2), `q-${blockIndex}`)}</blockquote>);
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      flushBuffer();
      if (listKind !== "ul") {
        flushList();
        listKind = "ul";
      }
      buffer.push(bullet[1]);
      continue;
    }

    const numbered = trimmed.match(/^\d+\.\s+(.*)$/);
    if (numbered) {
      flushBuffer();
      if (listKind !== "ol") {
        flushList();
        listKind = "ol";
      }
      buffer.push(numbered[1]);
      continue;
    }

    flushList();
    buffer.push(trimmed);
  }

  flushBuffer();
  flushList();
  return blocks;
}

/** Prerenderable Arabic legal page: renders one markdown doc as single source of truth. */
export default function LegalDocPage({ source, title, description, path }: LegalDocPageProps) {
  useSEO({ title, description, path, language: "ar" });
  const { direction } = useLanguage();
  return (
    <div className="b2-page-shell" dir={direction}>
      <section className="b2-container b2-section max-w-4xl">
        <Link href="/" className="mb-8 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-amber-700 hover:underline">
          <ArrowRight className="h-4 w-4" /> العودة إلى الرئيسية
        </Link>
        <article className="space-y-6 rounded-[1.75rem] border border-border bg-card p-6 text-foreground leading-relaxed sm:p-10">
          {renderMarkdown(source)}
        </article>
      </section>
    </div>
  );
}