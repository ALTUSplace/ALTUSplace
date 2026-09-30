import { useLanguage } from "@/contexts/LanguageContext";
import { MAIN_CONTENT_ID } from "@/hooks/useRouteAnnouncer";

/**
 * "تخطّي إلى المحتوى الرئيسي" — the first focusable element in the document.
 *
 * App.tsx renders this before <Navbar>, so a keyboard user reaches it on the
 * very first Tab press and can jump past the navigation, city switcher, auth
 * buttons and search field that would otherwise be ~40 stops on every page.
 *
 * Geometry lives in `.skip-link` (client/src/index.css) rather than in utility
 * classes because the reveal is a transform driven off the inline axis, and
 * `dir="rtl"` is flipped at runtime by LanguageContext — logical properties are
 * what keep the link on the correct side in both directions.
 *
 * A plain `href="#main-content"` is intentional: the browser's native fragment
 * navigation is what moves focus to the target, and it keeps working with
 * Enter, middle-click and "copy link". `<main tabIndex={-1}>` in App.tsx is what
 * makes the target focusable without adding it to the tab order.
 */
export function SkipLink() {
  const { t } = useLanguage();
  return (
    <a href={`#${MAIN_CONTENT_ID}`} className="skip-link">
      {t("skipToMainContent")}
    </a>
  );
}