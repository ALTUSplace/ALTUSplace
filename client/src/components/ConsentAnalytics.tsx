import { useEffect } from "react";
import { hasLegalConsent } from "@/lib/legalDisclosure";
import { LEGAL_CONSENT_EVENT } from "@/config/brand";

const GA4_ID = import.meta.env.VITE_GA4_MEASUREMENT_ID as string | undefined;
const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined;
const CONSENT_EVENT = LEGAL_CONSENT_EVENT;

type MetaPixelFunction = ((...args: unknown[]) => void) & {
  queue: unknown[][];
  loaded?: boolean;
  version?: string;
};

function loadScript(src: string, id: string) {
  if (document.getElementById(id)) return;
  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

function enableAnalytics() {
  if (GA4_ID) {
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_ID)}`, "b2rent-ga4-script");
    window.dataLayer = window.dataLayer ?? [];
    const gtag = window.gtag ?? ((...args: unknown[]) => { window.dataLayer?.push(args); });
    window.gtag = gtag;
    gtag("js", new Date());
    gtag("config", GA4_ID, { anonymize_ip: true, transport_type: "beacon" });
  }

  if (META_PIXEL_ID) {
    const fbq = window.fbq ?? (Object.assign((...args: unknown[]) => { fbqImpl.queue.push(args); }, { queue: [] as unknown[][] }) as MetaPixelFunction);
    const fbqImpl = fbq;
    fbqImpl.loaded = true;
    fbqImpl.version = "2.0";
    window.fbq = fbqImpl;
    fbqImpl("init", META_PIXEL_ID);
    fbqImpl("track", "PageView");
    loadScript("https://connect.facebook.net/en_US/fbevents.js", "b2rent-meta-pixel-script");
  }
}

export default function ConsentAnalytics() {
  useEffect(() => {
    const start = () => { if (hasLegalConsent()) enableAnalytics(); };
    start();
    window.addEventListener(CONSENT_EVENT, start);
    return () => window.removeEventListener(CONSENT_EVENT, start);
  }, []);
  return null;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: MetaPixelFunction;
  }
}
