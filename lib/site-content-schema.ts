/**
 * Every piece of site content she can edit, described once.
 *
 * The admin's "Conținut site" screens are drawn from this file: which sections
 * exist, in what order, what each field is called, what it is for, and what a
 * visitor sees while it is empty. The public pages read the same file, so the
 * fallback a button uses and the hint the admin shows about it can never
 * disagree.
 *
 * Adding a field is one entry below, plus the line that reads it. The database
 * needs nothing: `site_content` stores one row per key, and the admin creates
 * the row the first time she saves the field.
 *
 * Plain data with no imports, so server pages and client components can both
 * read it.
 */

export type Bilingual = { ro: string; en: string };

export type FieldKind =
  /** One line of text. */
  | "text"
  /** A few lines, without formatting. */
  | "textarea"
  /** Formatted text (paragraphs, bold, italics, lists, links), stored as HTML. */
  | "richtext"
  /** A picture from the media library, stored as its address. */
  | "image"
  /** One option from `choices`. */
  | "choice"
  /** A social network address, or @name. */
  | "social";

export interface FieldDef {
  kind: FieldKind;
  label: Bilingual;
  help?: Bilingual;
  /**
   * Whether the field has an English version. Names, addresses, pictures and
   * choices are the same in both languages and have one value.
   */
  translatable: boolean;
  /**
   * What the site shows while the field is empty, when it has a plain,
   * factual label to fall back on ("Vezi toate evenimentele"). Fields without
   * one show a dashed placeholder named after the part (`placeholder`), or
   * nothing at all.
   */
  fallback?: Bilingual;
  /** The name of the dashed placeholder a visitor sees while it is empty. */
  placeholder?: Bilingual;
  choices?: ReadonlyArray<{ value: string; label: Bilingual }>;
  /** The first choice she would see selected before choosing anything. */
  defaultChoice?: string;
  /** For `social` fields: which network the address belongs to. */
  network?: "instagram" | "facebook" | "tiktok" | "linkedin";
  maxLength?: number;
}

const SOCIAL_HELP: Bilingual = {
  ro: "Adresa completă, adresa fără „https://” sau doar @nume. Gol înseamnă că iconița nu apare.",
  en: "The full address, the address without “https://”, or just @name. Empty means the icon is left out.",
};

/**
 * Every field, keyed by its row in `site_content`. The keys that existed before
 * this file keep their old names (`contact.instagram_url`, `home.intro`), so
 * nothing she has already written needs moving.
 */
export const FIELDS = {
  // Identity -------------------------------------------------------------
  "general.site_name": {
    kind: "text",
    translatable: false,
    label: { ro: "Numele site-ului", en: "Site name" },
    help: {
      ro: "Apare în bara de sus, în subsol, în titlul fiecărei pagini și pe cardurile care apar când cineva distribuie un link.",
      en: "Shown in the top bar, the footer, every page title and the card that appears when someone shares a link.",
    },
  },
  "identity.logo": {
    kind: "image",
    translatable: false,
    label: { ro: "Logo", en: "Logo" },
    help: {
      ro: "Arată cel mai bine un PNG sau WebP cu fundal transparent, mai lat decât înalt.",
      en: "A PNG or WebP with a transparent background, wider than it is tall, works best.",
    },
  },
  "identity.display": {
    kind: "choice",
    translatable: false,
    label: { ro: "În bara de sus apare", en: "The top bar shows" },
    choices: [
      { value: "name", label: { ro: "Numele", en: "The name" } },
      { value: "logo", label: { ro: "Logoul", en: "The logo" } },
      { value: "both", label: { ro: "Amândouă", en: "Both" } },
    ],
    defaultChoice: "name",
    help: {
      ro: "Fără logo încărcat, apare numele.",
      en: "Without a logo, the name is shown.",
    },
  },

  // Social networks -------------------------------------------------------
  "contact.instagram_url": {
    kind: "social",
    network: "instagram",
    translatable: false,
    label: { ro: "Instagram", en: "Instagram" },
    help: SOCIAL_HELP,
  },
  "contact.facebook_url": {
    kind: "social",
    network: "facebook",
    translatable: false,
    label: { ro: "Facebook", en: "Facebook" },
    help: SOCIAL_HELP,
  },
  "contact.tiktok_url": {
    kind: "social",
    network: "tiktok",
    translatable: false,
    label: { ro: "TikTok", en: "TikTok" },
    help: SOCIAL_HELP,
  },
  "contact.linkedin_url": {
    kind: "social",
    network: "linkedin",
    translatable: false,
    label: { ro: "LinkedIn", en: "LinkedIn" },
    help: {
      ro: "Adresa profilului sau a paginii, de exemplu linkedin.com/in/nume. Gol înseamnă că iconița nu apare.",
      en: "Your profile or page address, such as linkedin.com/in/name. Empty means the icon is left out.",
    },
  },

  // Menu ------------------------------------------------------------------
  "nav.home": {
    kind: "text",
    translatable: true,
    label: { ro: "Pagina de start", en: "Home page" },
    fallback: { ro: "Acasă", en: "Home" },
  },
  "nav.about": {
    kind: "text",
    translatable: true,
    label: { ro: "Despre mine", en: "About me" },
    fallback: { ro: "Despre mine", en: "About me" },
  },
  "nav.blog": {
    kind: "text",
    translatable: true,
    label: { ro: "Blog", en: "Blog" },
    fallback: { ro: "Blog", en: "Blog" },
  },
  "nav.events": {
    kind: "text",
    translatable: true,
    label: { ro: "Evenimente", en: "Events" },
    fallback: { ro: "Evenimente", en: "Events" },
  },
  "nav.testimonials": {
    kind: "text",
    translatable: true,
    label: { ro: "Testimoniale", en: "Testimonials" },
    fallback: { ro: "Testimoniale", en: "Testimonials" },
  },
  "nav.contact": {
    kind: "text",
    translatable: true,
    label: { ro: "Contact", en: "Contact" },
    fallback: { ro: "Contact", en: "Contact" },
  },

  // Home page -------------------------------------------------------------
  "home.hero_title": {
    kind: "text",
    translatable: true,
    label: { ro: "Titlu principal", en: "Main heading" },
    help: { ro: "Primul lucru citit pe site.", en: "The first thing anyone reads on the site." },
    placeholder: { ro: "Titlu principal", en: "Main heading" },
  },
  "home.hero_subtitle": {
    kind: "textarea",
    translatable: true,
    label: { ro: "Subtitlu", en: "Subheading" },
    placeholder: { ro: "Subtitlu", en: "Subheading" },
  },
  "home.hero_image": {
    kind: "image",
    translatable: false,
    label: { ro: "Fotografia principală", en: "Main photo" },
    placeholder: { ro: "Fotografia principală", en: "Main photo" },
  },
  "home.hero_image_alt": {
    kind: "text",
    translatable: true,
    label: { ro: "Descrierea fotografiei", en: "Photo description" },
    help: {
      ro: "Pentru cine nu vede imaginea: ce se vede în ea, într-o frază.",
      en: "For people who can’t see the picture: what it shows, in one sentence.",
    },
  },
  "home.hero_button_primary": {
    kind: "text",
    translatable: true,
    label: { ro: "Primul buton", en: "First button" },
    help: { ro: "Duce la evenimente.", en: "Leads to the events." },
    fallback: { ro: "Vezi evenimentele", en: "See the events" },
  },
  "home.hero_button_secondary": {
    kind: "text",
    translatable: true,
    label: { ro: "Al doilea buton", en: "Second button" },
    help: { ro: "Duce la pagina Despre mine.", en: "Leads to the About page." },
    fallback: { ro: "Despre mine", en: "About me" },
  },
  "home.events_title": {
    kind: "text",
    translatable: true,
    label: { ro: "Titlu, când sunt mai multe", en: "Heading, for several" },
    fallback: { ro: "Evenimente viitoare", en: "Upcoming events" },
  },
  "home.events_title_one": {
    kind: "text",
    translatable: true,
    label: { ro: "Titlu, când e unul singur", en: "Heading, for just one" },
    fallback: { ro: "Următorul eveniment", en: "Next event" },
  },
  "home.events_empty": {
    kind: "textarea",
    translatable: true,
    label: { ro: "Text când nu e niciun eveniment", en: "Text when there are no events" },
    fallback: {
      ro: "Momentan nu sunt evenimente programate. Revino curând.",
      en: "No events scheduled right now. Check back soon.",
    },
  },
  "home.event_card_link": {
    kind: "text",
    translatable: true,
    label: { ro: "Textul de pe cardul evenimentului", en: "Text on the event card" },
    fallback: { ro: "Vezi detalii și rezervă", en: "See details and book" },
  },
  "home.events_button": {
    kind: "text",
    translatable: true,
    label: { ro: "Butonul de sub evenimente", en: "Button under the events" },
    fallback: { ro: "Vezi toate evenimentele", en: "See all events" },
  },
  "home.intro_title": {
    kind: "text",
    translatable: true,
    label: { ro: "Titlu", en: "Heading" },
    fallback: { ro: "Cine sunt", en: "Who I am" },
  },
  "home.intro": {
    kind: "richtext",
    translatable: true,
    label: { ro: "Scurtă prezentare", en: "Short introduction" },
    help: { ro: "Două-trei fraze despre tine.", en: "Two or three sentences about you." },
    placeholder: { ro: "Scurtă prezentare", en: "Short introduction" },
  },
  "home.intro_button": {
    kind: "text",
    translatable: true,
    label: { ro: "Buton", en: "Button" },
    fallback: { ro: "Citește povestea mea", en: "Read my story" },
  },
  "home.testimonials_title": {
    kind: "text",
    translatable: true,
    label: { ro: "Titlu", en: "Heading" },
    fallback: { ro: "Ce spun participanții", en: "What participants say" },
  },
  "home.testimonials_button": {
    kind: "text",
    translatable: true,
    label: { ro: "Buton", en: "Button" },
    fallback: { ro: "Vezi toate testimonialele", en: "See all testimonials" },
  },
  "home.faq_title": {
    kind: "text",
    translatable: true,
    label: { ro: "Titlu", en: "Heading" },
    fallback: { ro: "Întrebări frecvente", en: "Frequently asked questions" },
  },
  "home.blog_title": {
    kind: "text",
    translatable: true,
    label: { ro: "Titlu", en: "Heading" },
    fallback: { ro: "Din blog", en: "From the blog" },
  },
  "home.blog_button": {
    kind: "text",
    translatable: true,
    label: { ro: "Buton", en: "Button" },
    fallback: { ro: "Vezi toate articolele", en: "See all posts" },
  },

  // About -----------------------------------------------------------------
  "about.title": {
    kind: "text",
    translatable: true,
    label: { ro: "Titlul paginii", en: "Page heading" },
    fallback: { ro: "Despre mine", en: "About me" },
  },
  "about.portrait": {
    kind: "image",
    translatable: false,
    label: { ro: "Portret", en: "Portrait" },
    placeholder: { ro: "Portret", en: "Portrait" },
  },
  "about.portrait_alt": {
    kind: "text",
    translatable: true,
    label: { ro: "Descrierea portretului", en: "Portrait description" },
    help: {
      ro: "Pentru cine nu vede imaginea: ce se vede în ea, într-o frază.",
      en: "For people who can’t see the picture: what it shows, in one sentence.",
    },
  },
  "about.body": {
    kind: "richtext",
    translatable: true,
    label: { ro: "Povestea ta", en: "Your story" },
    help: {
      ro: "Cum ai ajuns la yoga, ce te-a format, cum lucrezi.",
      en: "How you came to yoga, what shaped you, how you work.",
    },
    placeholder: { ro: "Povestea ta", en: "Your story" },
  },
  "about.credentials_title": {
    kind: "text",
    translatable: true,
    label: { ro: "Titlul pentru formare", en: "Heading for training" },
    fallback: { ro: "Formare și certificări", en: "Training and certifications" },
  },
  "about.credentials": {
    kind: "richtext",
    translatable: true,
    label: { ro: "Formare și certificări", en: "Training and certifications" },
    help: {
      ro: "Gol înseamnă că partea aceasta nu apare pe pagină.",
      en: "Empty means this part is left off the page.",
    },
  },
  "about.button_primary": {
    kind: "text",
    translatable: true,
    label: { ro: "Primul buton", en: "First button" },
    help: { ro: "Duce la evenimente.", en: "Leads to the events." },
    fallback: { ro: "Vezi evenimentele", en: "See the events" },
  },
  "about.button_secondary": {
    kind: "text",
    translatable: true,
    label: { ro: "Al doilea buton", en: "Second button" },
    help: { ro: "Duce la pagina de contact.", en: "Leads to the contact page." },
    fallback: { ro: "Scrie-mi", en: "Get in touch" },
  },

  // Blog ------------------------------------------------------------------
  "blog.default_author": {
    kind: "text",
    translatable: false,
    label: { ro: "Autorul implicit", en: "Default author" },
    help: {
      ro: "Numele pus automat la articolele noi. Îl poți schimba pe fiecare articol.",
      en: "The name new posts start with. You can change it on each post.",
    },
  },

  // Footer ----------------------------------------------------------------
  "footer.follow": {
    kind: "text",
    translatable: true,
    label: { ro: "Text lângă rețelele sociale", en: "Text beside the social icons" },
    fallback: { ro: "Urmărește-mă", en: "Follow me" },
  },
  "footer.rights": {
    kind: "text",
    translatable: true,
    label: { ro: "Text după numele site-ului", en: "Text after the site name" },
    fallback: { ro: "Toate drepturile rezervate.", en: "All rights reserved." },
  },

  // SEO and business ------------------------------------------------------
  "seo.tagline": {
    kind: "text",
    translatable: true,
    label: { ro: "Motto", en: "Tagline" },
    help: {
      ro: "O frază scurtă despre ce faci. Apare în titlul paginii de start în Google și pe cardul unui link distribuit. Gol înseamnă doar numele site-ului.",
      en: "A short phrase about what you do. Used in the home page’s Google title and on shared-link cards. Empty means just the site name.",
    },
    maxLength: 70,
  },
  "seo.description": {
    kind: "textarea",
    translatable: true,
    label: { ro: "Descriere pentru Google", en: "Description for Google" },
    help: {
      ro: "Una-două fraze sub titlu în rezultatele Google. Gol înseamnă că Google alege singur un fragment.",
      en: "One or two sentences under the title in Google results. Empty lets Google pick an excerpt.",
    },
    maxLength: 160,
  },
  "seo.person_name": {
    kind: "text",
    translatable: false,
    label: { ro: "Numele tău", en: "Your name" },
    help: {
      ro: "Cum vrei să apari în Google, ca persoana din spatele site-ului. Gol înseamnă că nu se publică.",
      en: "How you want to appear in Google, as the person behind the site. Empty means it isn’t published.",
    },
  },
  "seo.area_served": {
    kind: "text",
    translatable: true,
    label: { ro: "Zona în care organizezi evenimente", en: "Where you hold events" },
    help: {
      ro: "Opțional, de exemplu „România” sau „Transilvania”. Gol înseamnă că nu se publică.",
      en: "Optional, such as “Romania”. Empty means it isn’t published.",
    },
  },

  // Legal pages -----------------------------------------------------------
  "legal.business_name": {
    kind: "text",
    translatable: false,
    label: { ro: "Denumirea și forma juridică", en: "Legal name and form" },
    help: {
      ro: "Exact cum apare în acte, de exemplu „Nume Prenume PFA”.",
      en: "Exactly as registered, such as “Firstname Lastname PFA”.",
    },
  },
  "legal.registration": {
    kind: "text",
    translatable: false,
    label: { ro: "CUI", en: "Registration number (CUI)" },
  },
  "legal.address": {
    kind: "textarea",
    translatable: false,
    label: { ro: "Sediul", en: "Registered address" },
  },
  "legal.email": {
    kind: "text",
    translatable: false,
    label: { ro: "Email pentru date personale", en: "Email for personal data requests" },
    help: {
      ro: "Unde îți scriu oamenii ca să-și vadă sau să-și șteargă datele.",
      en: "Where people write to see or delete their data.",
    },
  },
  "legal.vat": {
    kind: "choice",
    translatable: false,
    label: { ro: "TVA", en: "VAT" },
    choices: [
      { value: "", label: { ro: "Nu am ales", en: "Not chosen" } },
      { value: "payer", label: { ro: "Plătitoare de TVA", en: "VAT registered" } },
      { value: "non_payer", label: { ro: "Neplătitoare de TVA", en: "Not VAT registered" } },
    ],
    defaultChoice: "",
  },
  "legal.sal_badge": {
    kind: "image",
    translatable: false,
    label: { ro: "Pictograma ANPC SAL", en: "ANPC SAL pictogram" },
    help: {
      ro: "Obligatorie în subsol, la 250×50 px, cu link la reclamatiisal.anpc.ro. Descarc-o de pe anpc.ro/comunicat-sal și încarc-o aici. Până atunci, subsolul are un link text în locul ei.",
      en: "Required in the footer, at 250×50 px, linking to reclamatiisal.anpc.ro. Download it from anpc.ro/comunicat-sal and upload it here. Until then, the footer shows a text link instead.",
    },
  },
  "legal.privacy": {
    kind: "richtext",
    translatable: true,
    label: { ro: "Politica de confidențialitate", en: "Privacy policy" },
  },
  "legal.terms": {
    kind: "richtext",
    translatable: true,
    label: { ro: "Termeni și condiții", en: "Terms and conditions" },
  },
  "legal.cookies": {
    kind: "richtext",
    translatable: true,
    label: { ro: "Politica de cookie-uri", en: "Cookie policy" },
  },
} as const satisfies Record<string, FieldDef>;

export type SiteContentKey = keyof typeof FIELDS;

export function fieldDef(key: SiteContentKey): FieldDef {
  return FIELDS[key];
}

export interface ContentGroup {
  title?: Bilingual;
  keys: readonly SiteContentKey[];
}

export interface ContentSection {
  /** The address: /admin/content/<id>. */
  id: string;
  title: Bilingual;
  description: Bilingual;
  /** "faq" draws the question list instead of fields. */
  kind: "fields" | "faq";
  groups: readonly ContentGroup[];
}

/** The words a legal document may use, filled in from the business fields. */
export const LEGAL_TOKENS = {
  business_name: "legal.business_name",
  registration: "legal.registration",
  address: "legal.address",
  email: "legal.email",
  site_name: "general.site_name",
} as const satisfies Record<string, SiteContentKey>;

const LEGAL_TOKEN_HELP: Bilingual = {
  ro: "Scrie {{business_name}}, {{registration}}, {{address}}, {{email}}, {{vat}}, {{site_name}} sau {{site_url}} și se completează singure din datele firmei. Ce lipsește apare pe site ca marcaj punctat.",
  en: "Write {{business_name}}, {{registration}}, {{address}}, {{email}}, {{vat}}, {{site_name}} or {{site_url}} and they fill in from the business details. Anything missing shows on the site as a dashed marker.",
};

/** The menu of "Conținut site", in order. */
export const CONTENT_SECTIONS: readonly ContentSection[] = [
  {
    id: "identity",
    kind: "fields",
    title: { ro: "Identitate", en: "Identity" },
    description: {
      ro: "Numele site-ului, logoul și ce apare în bara de sus.",
      en: "The site’s name, the logo and what the top bar shows.",
    },
    groups: [{ keys: ["general.site_name", "identity.logo", "identity.display"] }],
  },
  {
    id: "social",
    kind: "fields",
    title: { ro: "Rețele sociale", en: "Social networks" },
    description: {
      ro: "Iconițele din subsol. Apar doar cele completate.",
      en: "The icons in the footer. Only the ones filled in appear.",
    },
    groups: [
      {
        keys: [
          "contact.instagram_url",
          "contact.facebook_url",
          "contact.tiktok_url",
          "contact.linkedin_url",
        ],
      },
    ],
  },
  {
    id: "menu",
    kind: "fields",
    title: { ro: "Meniu", en: "Menu" },
    description: {
      ro: "Numele secțiunilor din bara de sus, din meniul de pe telefon și din subsol. Gol înseamnă numele obișnuit.",
      en: "The section names in the top bar, the phone menu and the footer. Empty means the usual name.",
    },
    groups: [
      {
        keys: ["nav.home", "nav.about", "nav.blog", "nav.events", "nav.testimonials", "nav.contact"],
      },
    ],
  },
  {
    id: "home",
    kind: "fields",
    title: { ro: "Pagina de start", en: "Home page" },
    description: {
      ro: "Fiecare text de pe pagina de start, de sus în jos.",
      en: "Every text on the home page, top to bottom.",
    },
    groups: [
      {
        title: { ro: "Primul ecran", en: "First screen" },
        keys: [
          "home.hero_title",
          "home.hero_subtitle",
          "home.hero_image",
          "home.hero_image_alt",
          "home.hero_button_primary",
          "home.hero_button_secondary",
        ],
      },
      {
        title: { ro: "Evenimente", en: "Events" },
        keys: [
          "home.events_title",
          "home.events_title_one",
          "home.events_empty",
          "home.event_card_link",
          "home.events_button",
        ],
      },
      {
        title: { ro: "Cine sunt", en: "Who I am" },
        keys: ["home.intro_title", "home.intro", "home.intro_button"],
      },
      {
        title: { ro: "Testimoniale", en: "Testimonials" },
        keys: ["home.testimonials_title", "home.testimonials_button"],
      },
      {
        title: { ro: "Întrebări frecvente", en: "Frequently asked questions" },
        keys: ["home.faq_title"],
      },
      {
        title: { ro: "Blog", en: "Blog" },
        keys: ["home.blog_title", "home.blog_button"],
      },
    ],
  },
  {
    id: "about",
    kind: "fields",
    title: { ro: "Despre mine", en: "About me" },
    description: {
      ro: "Fiecare text și fotografie de pe pagina Despre mine.",
      en: "Every text and photo on the About page.",
    },
    groups: [
      {
        keys: [
          "about.title",
          "about.portrait",
          "about.portrait_alt",
          "about.body",
          "about.credentials_title",
          "about.credentials",
          "about.button_primary",
          "about.button_secondary",
        ],
      },
    ],
  },
  {
    id: "faq",
    kind: "faq",
    title: { ro: "Întrebări frecvente", en: "Frequently asked questions" },
    description: {
      ro: "Întrebările de pe pagina de start. O întrebare nouă e ascunsă până o publici.",
      en: "The questions on the home page. A new question stays hidden until you publish it.",
    },
    groups: [],
  },
  {
    id: "blog",
    kind: "fields",
    title: { ro: "Blog", en: "Blog" },
    description: {
      ro: "Setările folosite când începi un articol nou.",
      en: "Settings used when you start a new post.",
    },
    groups: [{ keys: ["blog.default_author"] }],
  },
  {
    id: "footer",
    kind: "fields",
    title: { ro: "Subsol", en: "Footer" },
    description: {
      ro: "Textele din partea de jos a fiecărei pagini.",
      en: "The texts at the bottom of every page.",
    },
    groups: [{ keys: ["footer.follow", "footer.rights"] }],
  },
  {
    id: "seo",
    kind: "fields",
    title: { ro: "SEO și firmă", en: "SEO and business" },
    description: {
      ro: "Cum apare site-ul în Google și când cineva distribuie un link.",
      en: "How the site appears in Google and when someone shares a link.",
    },
    groups: [{ keys: ["seo.tagline", "seo.description", "seo.person_name", "seo.area_served"] }],
  },
  {
    id: "legal",
    kind: "fields",
    title: { ro: "Pagini legale", en: "Legal pages" },
    description: {
      ro: "Datele firmei și cele trei documente legale. Un avocat ar trebui să le citească o dată înainte de lansare.",
      en: "Your business details and the three legal documents. A lawyer should read them once before launch.",
    },
    groups: [
      {
        title: { ro: "Datele firmei", en: "Business details" },
        keys: [
          "legal.business_name",
          "legal.registration",
          "legal.address",
          "legal.email",
          "legal.vat",
          "legal.sal_badge",
        ],
      },
      {
        title: { ro: "Documente", en: "Documents" },
        keys: ["legal.privacy", "legal.terms", "legal.cookies"],
      },
    ],
  },
];

/** Help shown above the three legal documents in the admin. */
export const LEGAL_DOCUMENT_HELP = LEGAL_TOKEN_HELP;

export function sectionById(id: string): ContentSection | undefined {
  return CONTENT_SECTIONS.find((section) => section.id === id);
}

/** Which section a key is edited in, and its position there (for the row's sort order). */
export function sectionOf(key: SiteContentKey): { id: string; order: number } {
  for (const section of CONTENT_SECTIONS) {
    const keys = section.groups.flatMap((g) => g.keys);
    const index = keys.indexOf(key);
    if (index >= 0) return { id: section.id, order: (index + 1) * 10 };
  }
  return { id: "general", order: 0 };
}

/** The database's `field_type`, which only knows three kinds. */
export function storedFieldType(kind: FieldKind): "text" | "richtext" | "image" {
  if (kind === "richtext" || kind === "image") return kind;
  return "text";
}
