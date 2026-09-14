/**
 * Nationwide Moroccan city catalogue, grouped by the 12 administrative regions.
 *
 * The regional structure drives the shared CitySelect dropdown (one <optgroup>
 * per region) and the SEO city landing pages (/locations/<slug>). The flat
 * MOROCCAN_CITIES list and its helpers are derived from MOROCCO_REGIONS so there
 * is a single source of truth.
 */

export const MOROCCO_REGIONS = [
  {
    name: 'طنجة تطوان الحسيمة',
    nameFr: 'Tanger-Tétouan-Al Hoceïma',
    cities: ['طنجة', 'تطوان', 'شفشاون', 'العرائش', 'وزان', 'الحسيمة', 'المضيق'],
  },
  {
    name: 'الشرق',
    nameFr: "L'Oriental",
    cities: ['وجدة', 'الناظور', 'بركان', 'تاوريرت', 'جرسيف', 'جرادة'],
  },
  {
    name: 'فاس مكناس',
    nameFr: 'Fès-Meknès',
    cities: ['فاس', 'مكناس', 'صفرو', 'إفران', 'تاونات', 'الحاجب'],
  },
  {
    name: 'الرباط سلا القنيطرة',
    nameFr: 'Rabat-Salé-Kénitra',
    cities: ['الرباط', 'سلا', 'تمارة', 'القنيطرة', 'الخميسات', 'سيدي سليمان', 'سيدي قاسم'],
  },
  {
    name: 'الدار البيضاء سطات',
    nameFr: 'Casablanca-Settat',
    cities: ['الدار البيضاء', 'المحمدية', 'الجديدة', 'برشيد', 'سطات', 'سيدي بنور', 'ابن سليمان'],
  },
  {
    name: 'مراكش آسفي',
    nameFr: 'Marrakech-Safi',
    cities: ['مراكش', 'آسفي', 'الصويرة', 'اليوسفية', 'شيشاوة'],
  },
  {
    name: 'بني ملال خنيفرة',
    nameFr: 'Béni Mellal-Khénifra',
    cities: ['بني ملال', 'خريبكة', 'خنيفرة', 'الفقيه بن صالح', 'أزيلال'],
  },
  {
    name: 'درعة تافيلالت',
    nameFr: 'Drâa-Tafilalet',
    cities: ['الرشيدية', 'ورزازات', 'تنغير', 'زاكورة', 'ميدلت'],
  },
  {
    name: 'سوس ماسة',
    nameFr: 'Souss-Massa',
    cities: ['أغادير', 'إنزكان', 'آيت ملول', 'تارودانت', 'تيزنيت'],
  },
  {
    name: 'كلميم واد نون',
    nameFr: 'Guelmim-Oued Noun',
    cities: ['كلميم', 'طانطان', 'سيدي إفني'],
  },
  {
    name: 'العيون الساقية الحمراء',
    nameFr: 'Laâyoune-Sakia El Hamra',
    cities: ['العيون', 'السمارة', 'بوجدور', 'طرفاية'],
  },
  {
    name: 'الداخلة وادي الذهب',
    nameFr: 'Dakhla-Oued Ed-Dahab',
    cities: ['الداخلة'],
  },
] as const;

export type MoroccoCity = (typeof MOROCCO_REGIONS)[number]['cities'][number];

/** Flat nationwide list derived from the 12 regions (61 cities). */
export const MOROCCAN_CITIES: readonly MoroccoCity[] = MOROCCO_REGIONS.flatMap((region) => region.cities);

export const MOROCCO_CITY_ALIASES: Record<string, string> = {
  '': 'all',
  all: 'all',
  'الكل': 'all',
  'جميع المدن': 'all',
  'tout le maroc': 'all',
  casablanca: 'الدار البيضاء',
  casa: 'الدار البيضاء',
  'casablanca-settat': 'الدار البيضاء',
  rabat: 'الرباط',
  sale: 'سلا',
  salé: 'سلا',
  marrakech: 'مراكش',
  marrakesh: 'مراكش',
  'marrakech-safi': 'مراكش',
  fez: 'فاس',
  fes: 'فاس',
  'fès': 'فاس',
  meknes: 'مكناس',
  'meknès': 'مكناس',
  tangier: 'طنجة',
  tanger: 'طنجة',
  tetouan: 'تطوان',
  'tétouan': 'تطوان',
  chefchaouen: 'شفشاون',
  larache: 'العرائش',
  ouarzazate: 'ورزازات',
  agadir: 'أغادير',
  akadir: 'أغادير',
  'أكادير': 'أغادير',
  essaouira: 'الصويرة',
  safi: 'آسفي',
  nador: 'الناظور',
  oujda: 'وجدة',
  kenitra: 'القنيطرة',
  mohammedia: 'المحمدية',
  eljadida: 'الجديدة',
  'el jadida': 'الجديدة',
  khemisset: 'الخميسات',
  berrechid: 'برشيد',
  benimellal: 'بني ملال',
  'beni mellal': 'بني ملال',
  khouribga: 'خريبكة',
  alhoceima: 'الحسيمة',
  'al hoceima': 'الحسيمة',
  azilal: 'أزيلال',
  taroudant: 'تارودانت',
  tiznit: 'تيزنيت',
  guelmim: 'كلميم',
  laayoune: 'العيون',
  'laâyoune': 'العيون',
  dakhla: 'الداخلة',
  errichidia: 'الرشيدية',
  'er-rachidia': 'الرشيدية',
};

export const MOROCCO_CITY_LABELS_FR: Record<string, string> = {
  'جميع المدن': 'Toutes les villes',
  'طنجة': 'Tanger',
  'تطوان': 'Tétouan',
  'شفشاون': 'Chefchaouen',
  'العرائش': 'Larache',
  'وزان': 'Ouazzane',
  'الحسيمة': 'Al Hoceïma',
  'المضيق': "M'Diq",
  'وجدة': 'Oujda',
  'الناظور': 'Nador',
  'بركان': 'Berkane',
  'تاوريرت': 'Taourirt',
  'جرسيف': 'Guercif',
  'جرادة': 'Jerada',
  'فاس': 'Fès',
  'مكناس': 'Meknès',
  'صفرو': 'Sefrou',
  'إفران': 'Ifrane',
  'تاونات': 'Taounate',
  'الحاجب': 'El Hajeb',
  'الرباط': 'Rabat',
  'سلا': 'Salé',
  'تمارة': 'Témara',
  'القنيطرة': 'Kénitra',
  'الخميسات': 'Khémisset',
  'سيدي سليمان': 'Sidi Slimane',
  'سيدي قاسم': 'Sidi Kacem',
  'الدار البيضاء': 'Casablanca',
  'المحمدية': 'Mohammédia',
  'الجديدة': 'El Jadida',
  'برشيد': 'Berrechid',
  'سطات': 'Settat',
  'سيدي بنور': 'Sidi Bennour',
  'ابن سليمان': 'Benslimane',
  'مراكش': 'Marrakech',
  'آسفي': 'Safi',
  'الصويرة': 'Essaouira',
  'اليوسفية': 'Youssoufia',
  'شيشاوة': 'Chichaoua',
  'بني ملال': 'Béni Mellal',
  'خريبكة': 'Khouribga',
  'خنيفرة': 'Khénifra',
  'الفقيه بن صالح': 'Fquih Ben Salah',
  'أزيلال': 'Azilal',
  'الرشيدية': 'Errachidia',
  'ورزازات': 'Ouarzazate',
  'تنغير': 'Tinghir',
  'زاكورة': 'Zagora',
  'ميدلت': 'Midelt',
  'أغادير': 'Agadir',
  'إنزكان': 'Inezgane',
  'آيت ملول': 'Aït Melloul',
  'تارودانت': 'Taroudant',
  'تيزنيت': 'Tiznit',
  'كلميم': 'Guelmim',
  'طانطان': 'Tan-Tan',
  'سيدي إفني': 'Sidi Ifni',
  'العيون': 'Laâyoune',
  'السمارة': 'Es-Semara',
  'بوجدور': 'Boujdour',
  'طرفاية': 'Tarfaya',
  'الداخلة': 'Dakhla',
};

/** Canonical latin URL slug per Moroccan city, used by /locations/<slug> pages. */
export const MOROCCO_CITY_SLUGS: Record<string, string> = {
  'طنجة': 'tangier',
  'تطوان': 'tetouan',
  'شفشاون': 'chefchaouen',
  'العرائش': 'larache',
  'وزان': 'ouazzane',
  'الحسيمة': 'al-hoceima',
  'المضيق': 'mdiq',
  'وجدة': 'oujda',
  'الناظور': 'nador',
  'بركان': 'berkane',
  'تاوريرت': 'taourirt',
  'جرسيف': 'guercif',
  'جرادة': 'jerada',
  'فاس': 'fez',
  'مكناس': 'meknes',
  'صفرو': 'sefrou',
  'إفران': 'ifrane',
  'تاونات': 'taounate',
  'الحاجب': 'el-hajeb',
  'الرباط': 'rabat',
  'سلا': 'sale',
  'تمارة': 'temara',
  'القنيطرة': 'kenitra',
  'الخميسات': 'khemisset',
  'سيدي سليمان': 'sidi-slimane',
  'سيدي قاسم': 'sidi-kacem',
  'الدار البيضاء': 'casablanca',
  'المحمدية': 'mohammedia',
  'الجديدة': 'el-jadida',
  'برشيد': 'berrechid',
  'سطات': 'settat',
  'سيدي بنور': 'sidi-bennour',
  'ابن سليمان': 'benslimane',
  'مراكش': 'marrakech',
  'آسفي': 'safi',
  'الصويرة': 'essaouira',
  'اليوسفية': 'youssoufia',
  'شيشاوة': 'chichaoua',
  'بني ملال': 'beni-mellal',
  'خريبكة': 'khouribga',
  'خنيفرة': 'khenifra',
  'الفقيه بن صالح': 'fquih-ben-salah',
  'أزيلال': 'azilal',
  'الرشيدية': 'er-rachidia',
  'ورزازات': 'ouarzazate',
  'تنغير': 'tinghir',
  'زاكورة': 'zagora',
  'ميدلت': 'midelt',
  'أغادير': 'agadir',
  'إنزكان': 'inezgane',
  'آيت ملول': 'ait-melloul',
  'تارودانت': 'taroudant',
  'تيزنيت': 'tiznit',
  'كلميم': 'guelmim',
  'طانطان': 'tan-tan',
  'سيدي إفني': 'sidi-ifni',
  'العيون': 'laayoune',
  'السمارة': 'es-semara',
  'بوجدور': 'boujdour',
  'طرفاية': 'tarfaya',
  'الداخلة': 'dakhla',
};

const SLUG_TO_CITY: Record<string, string> = Object.fromEntries(
  Object.entries(MOROCCO_CITY_SLUGS).map(([city, slug]) => [slug, city])
);

export function resolveCitySlug(value: string): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return 'all';
  const lowercase = trimmed.toLowerCase();
  const alias = MOROCCO_CITY_ALIASES[lowercase];
  if (alias) return alias;
  for (const key of Object.keys(MOROCCO_CITY_ALIASES)) {
    if (key.trim().toLowerCase() === lowercase) return MOROCCO_CITY_ALIASES[key];
  }
  return trimmed;
}

export function cityLabelFr(city: string): string {
  return MOROCCO_CITY_LABELS_FR[city] ?? city;
}

/**
 * Resolves a /locations/<slug> or query-param slug back to its canonical Arabic
 * city name. Returns null when the slug does not map to a known city (callers
 * should fall back to the locations hub page).
 */
export function cityFromSlug(slug: string): string | null {
  const normalized = (slug ?? '').trim().toLowerCase();
  if (!normalized) return null;
  const direct = SLUG_TO_CITY[normalized];
  if (direct) return direct;
  const resolved = resolveCitySlug(normalized);
  if (resolved === 'all') return null;
  return Object.prototype.hasOwnProperty.call(MOROCCO_CITY_SLUGS, resolved) ? resolved : null;
}

/** Canonical latin slug for a city (accepts Arabic name or an alias). */
export function slugForCity(city: string): string {
  const canonical = resolveCitySlug(city);
  return MOROCCO_CITY_SLUGS[canonical] ?? '';
}

/**
 * Loose city matcher for dynamic landing pages: compares canonical names so
 * agency-provided variants (French names, latin aliases, alternate spellings)
 * still group under the right city page.
 */
export function matchListingCity(itemCity: string | null | undefined, city: string): boolean {
  if (!itemCity) return false;
  const a = resolveCitySlug(itemCity).trim();
  const b = resolveCitySlug(city).trim();
  if (!a || !b || a === 'all' || b === 'all') return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}