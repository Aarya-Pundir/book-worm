// Deterministic sample data for the Book Worm seed (Phase 2, T023-T025).
// All names, titles and ISBNs are fictional. No real credentials appear here.
// Brand/Publisher naming, single vs multiple categories, inventory values, roles and
// store rows are PROVISIONAL placeholders: PENDING ADMIN APPROVAL.

/** Spec FR-021: 20 options. "All" is UI-only, so 19 genres are stored, in this order. */
export const CATEGORY_NAMES = [
  "Romance",
  "Mystery",
  "Science Fiction",
  "Fantasy",
  "Historical",
  "Biography",
  "Self-help",
  "Memoir",
  "Travel",
  "Cooking",
  "Children's",
  "Young Adult",
  "Comics & Graphic Novels",
  "Poetry",
  "Drama",
  "Science",
  "Philosophy",
  "Religion",
  "Language Learning",
];

export const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const FIRST = [
  "Aarav", "Meera", "Rohan", "Ananya", "Kabir", "Isha", "Vikram", "Naina", "Arjun", "Diya",
  "Elena", "Marcus", "Sofia", "Daniel", "Chloe", "Henry", "Grace", "Lucas", "Amelia", "Oliver",
];
const LAST = [
  "Sharma", "Iyer", "Kapoor", "Nair", "Mehta", "Rao", "Banerjee", "Desai", "Chopra", "Bhatt",
  "Hartley", "Moreau", "Castillo", "Lindqvist", "Okafor", "Whitaker", "Novak", "Fontaine", "Bright", "Alvarez",
];

export const PUBLISHERS = [
  "Lantern Press",
  "Riverbend Books",
  "Saffron Tree Publishing",
  "Northlight House",
  "Paper Kite Books",
  "Monsoon Ink",
  "Cedar & Quill",
  "Blue Heron Press",
  "Marigold Editions",
  "Granite Lane Books",
  "Silver Fern Publishing",
  "Open Shutter Books",
];

// Per genre vocabulary used to build unique, readable (fictional) titles.
const VOCAB = {
  Romance: { adj: ["Midnight", "Tender", "Secret", "Golden", "Wild", "Quiet"], noun: ["Promise", "Letter", "Heart", "Summer", "Waltz", "Vow"], of: ["Monsoon Nights", "Second Chances", "Old Lanterns", "the Last Train"] },
  Mystery: { adj: ["Silent", "Vanishing", "Crooked", "Hollow", "Missing", "Shadowed"], noun: ["Witness", "Alibi", "Ledger", "Key", "Clue", "Locket"], of: ["Harbor Street", "the Third Floor", "Blackwater Lane", "Glass Manor"] },
  "Science Fiction": { adj: ["Orbital", "Quantum", "Silent", "Binary", "Distant", "Synthetic"], noun: ["Colony", "Signal", "Horizon", "Archive", "Engine", "Voyage"], of: ["Kepler Station", "a Thousand Suns", "the Last Relay", "Europa Deep"] },
  Fantasy: { adj: ["Ember", "Hidden", "Silver", "Forgotten", "Storm", "Crowned"], noun: ["Throne", "Dragon", "Oath", "Grimoire", "Forest", "Blade"], of: ["the Nine Realms", "Ashen Mountains", "the Moon Court", "Thornwood"] },
  Historical: { adj: ["Distant", "Fallen", "Gilded", "Burning", "Last", "Painted"], noun: ["Empire", "Courtyard", "Caravan", "Crown", "Frontier", "Harvest"], of: ["Old Delhi", "the Silk Road", "Seven Rivers", "the Long Winter"] },
  Biography: { adj: ["Unfinished", "Restless", "Public", "Quiet", "Remarkable", "Defiant"], noun: ["Life", "Journey", "Legacy", "Portrait", "Pioneer", "Mind"], of: ["a Reluctant Hero", "the Mapmaker", "a Gifted Teacher", "an Inventor"] },
  "Self-help": { adj: ["Small", "Daily", "Focused", "Calm", "Resilient", "Simple"], noun: ["Habits", "Mindset", "Reset", "Practice", "Routine", "Courage"], of: ["Everyday Focus", "Lasting Change", "Quiet Confidence", "Better Mornings"] },
  Memoir: { adj: ["Borrowed", "Scattered", "Unspoken", "Faded", "Open", "Long"], noun: ["Years", "Kitchen", "Photographs", "Home", "Letters", "Roads"], of: ["My Mother's House", "a Small Town", "Growing Up", "Leaving Home"] },
  Travel: { adj: ["Hidden", "Slow", "Coastal", "High", "Winding", "Wandering"], noun: ["Trails", "Passage", "Journal", "Atlas", "Route", "Detour"], of: ["the Western Ghats", "Patagonia", "Old Lisbon", "the Himalayan Foothills"] },
  Cooking: { adj: ["Rustic", "Everyday", "Spiced", "Simple", "Seasonal", "Fresh"], noun: ["Table", "Pantry", "Kitchen", "Feast", "Spice Box", "Bakery"], of: ["Home Cooking", "Street Food", "the Coastal Kitchen", "One-Pot Dinners"] },
  "Children's": { adj: ["Tiny", "Brave", "Sleepy", "Curious", "Cheerful", "Little"], noun: ["Fox", "Elephant", "Rocket", "Garden", "Owl", "Lantern"], of: ["the Rainy Day", "Bedtime Tales", "the Big Adventure", "Moon Hill"] },
  "Young Adult": { adj: ["Unbroken", "Electric", "Reckless", "Fading", "Bright", "Restless"], noun: ["Summer", "Rebels", "Signal", "Mixtape", "Orbit", "Spark"], of: ["Senior Year", "the Last Bell", "Midnight Radio", "a New City"] },
  "Comics & Graphic Novels": { adj: ["Neon", "Masked", "Rogue", "Pixel", "Iron", "Cosmic"], noun: ["Vigilante", "Panels", "Saga", "Origins", "Circuit", "Chronicle"], of: ["Dust City", "the Night Shift", "Skyline Heroes", "Steel Harbor"] },
  Poetry: { adj: ["Slow", "Salt", "Open", "Paper", "Evening", "Quiet"], noun: ["Verses", "Songs", "Sonnets", "Echoes", "Fragments", "Haiku"], of: ["Rain and Rivers", "Small Hours", "the Inner Weather", "Autumn Light"] },
  Drama: { adj: ["Final", "Broken", "Crowded", "Borrowed", "Empty", "Opening"], noun: ["Curtain", "Stage", "Rehearsal", "Monologue", "Act", "Verdict"], of: ["Three Acts", "a Family Dinner", "the Last Season", "Two Strangers"] },
  Science: { adj: ["Curious", "Hidden", "Living", "Deep", "Invisible", "Elegant"], noun: ["Universe", "Cell", "Equation", "Planet", "Atom", "Brain"], of: ["Everyday Physics", "the Natural World", "Time and Space", "Evolution"] },
  Philosophy: { adj: ["Examined", "Ordinary", "Moral", "Quiet", "Open", "Practical"], noun: ["Reason", "Question", "Ethics", "Meditations", "Paradox", "Dialogues"], of: ["the Good Life", "Freedom and Duty", "Meaning", "Modern Doubt"] },
  Religion: { adj: ["Sacred", "Living", "Ancient", "Inner", "Shared", "Timeless"], noun: ["Path", "Scripture", "Pilgrimage", "Prayer", "Wisdom", "Temple"], of: ["Faith and Doubt", "World Traditions", "the Silent Mind", "Festival Days"] },
  "Language Learning": { adj: ["Easy", "Everyday", "Practical", "Essential", "Quick", "Complete"], noun: ["Grammar", "Phrasebook", "Vocabulary", "Workbook", "Conversations", "Pronunciation"], of: ["Spoken English", "Beginner Hindi", "Conversational French", "Basic Spanish"] },
};

const SHORT = {
  Romance: "A warm story of love, loss and second chances.",
  Mystery: "A tightly plotted puzzle where every clue matters.",
  "Science Fiction": "A thoughtful look at people and technology at the edge of the possible.",
  Fantasy: "An imaginative adventure in a richly built world.",
  Historical: "A vivid story set against the sweep of history.",
  Biography: "An absorbing portrait of a life that shaped its time.",
  "Self-help": "Practical, easy-to-follow ideas for building better habits.",
  Memoir: "An honest and personal account of memory and belonging.",
  Travel: "Stories and tips from the road for curious travellers.",
  Cooking: "Approachable recipes and kitchen know-how for every day.",
  "Children's": "A gentle illustrated story for young readers.",
  "Young Adult": "A coming-of-age story full of heart and humour.",
  "Comics & Graphic Novels": "Bold artwork and a fast-moving story in panels.",
  Poetry: "A collection of short, memorable poems.",
  Drama: "A character-driven play with sharp, stage-ready dialogue.",
  Science: "A clear and engaging guide to how the world works.",
  Philosophy: "A readable introduction to big questions about life.",
  Religion: "A respectful exploration of belief, practice and tradition.",
  "Language Learning": "A friendly course with examples you can use straight away.",
};

const LANGUAGES = ["English", "English", "English", "English", "English", "English", "Hindi", "Hindi", "Spanish", "French"];
const FORMATS = ["Paperback", "Paperback", "Paperback", "Hardcover", "Hardcover", "eBook"];
const BOOKS_PER_GENRE = 12;

// mulberry32: small deterministic PRNG so every run produces the same data.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isbn13(n) {
  const body = `978${String(n).padStart(9, "0")}`;
  const sum = [...body].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

function buildAuthors() {
  const names = [];
  for (const f of FIRST) {
    for (const l of LAST) {
      if ((FIRST.indexOf(f) + LAST.indexOf(l)) % 5 === 0) names.push(`${f} ${l}`);
    }
  }
  return names;
}

export const AUTHORS = buildAuthors();

function buildBooks() {
  const rand = rng(20261116);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const usedTitles = new Set();
  const books = [];
  let seq = 0;

  CATEGORY_NAMES.forEach((genre, genreIdx) => {
    const v = VOCAB[genre];
    for (let i = 0; i < BOOKS_PER_GENRE; i += 1) {
      let title;
      for (let tries = 0; tries < 200; tries += 1) {
        const a = pick(v.adj);
        const n = pick(v.noun);
        const o = pick(v.of);
        const patterns = [`The ${a} ${n}`, `${n} of ${o}`, `A ${a} ${n}`, `${a} ${n}: ${o}`];
        title = patterns[(i + tries) % 4];
        if (!usedTitles.has(title)) break;
        title = `${title} (Vol. ${tries + 2})`;
        if (!usedTitles.has(title)) break;
      }
      usedTitles.add(title);

      seq += 1;
      const format = pick(FORMATS);
      const base = { Paperback: [199, 599], Hardcover: [399, 999], eBook: [99, 399] }[format];
      const price = Math.round(base[0] + rand() * (base[1] - base[0]));
      const year = 1995 + Math.floor(rand() * 31);
      const month = 1 + Math.floor(rand() * 12);
      const day = 1 + Math.floor(rand() * 28);

      const categories = [genre];
      // Roughly one in seven books also belongs to a second genre (provisional: multi-category).
      if (seq % 7 === 0) {
        const other = CATEGORY_NAMES[(genreIdx + 1 + Math.floor(rand() * 17)) % CATEGORY_NAMES.length];
        if (other !== genre) categories.push(other);
      }

      const authors = [pick(AUTHORS)];
      if (rand() < 0.15) {
        const second = pick(AUTHORS);
        if (second !== authors[0]) authors.push(second);
      }

      books.push({
        isbn: isbn13(seq),
        title,
        shortDescription: SHORT[genre],
        description: `${SHORT[genre]} "${title}" is a fictional sample title written for the Book Worm demo catalogue. It is part of the ${genre} collection and is available in ${format.toLowerCase()} format.`,
        slug: `${slugify(title)}-${seq}`,
        price,
        format,
        language: pick(LANGUAGES),
        publicationDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        popularityScore: Math.floor(rand() * 1000),
        stockQuantity: seq % 23 === 0 ? 0 : 5 + Math.floor(rand() * 120),
        // Two inactive sample books so the "inactive books are never returned" rule can be tested.
        isActive: !(i === BOOKS_PER_GENRE - 1 && (genreIdx === 3 || genreIdx === 11)),
        publisher: pick(PUBLISHERS),
        categories,
        authors,
      });
    }
  });
  return books;
}

export const BOOKS = buildBooks();

/** Sample members. Passwords are generated by the seed at run time, never stored here. */
export const SAMPLE_MEMBERS = [
  { name: "Asha Verma", email: "asha.verma@example.com", mobile: "9000000001" },
  { name: "Rahul Menon", email: "rahul.menon@example.com", mobile: "9000000002" },
  { name: "Priya Nair", email: "priya.nair@example.com", mobile: "9000000003" },
  { name: "Karan Shah", email: "karan.shah@example.com", mobile: "9000000004" },
  { name: "Neha Gupta", email: "neha.gupta@example.com", mobile: "9000000005" },
  { name: "Sameer Khan", email: "sameer.khan@example.com", mobile: "9000000006" },
];

/** PROVISIONAL placeholder: PENDING ADMIN APPROVAL (admin roles and permissions). */
export const SAMPLE_ADMIN = { name: "Book Worm Admin", email: "admin@example.com", mobile: "9000000099" };

/** PROVISIONAL placeholder: PENDING ADMIN APPROVAL (store responsibilities). */
export const STORE_NAME = "Book Worm Store";

/** PROVISIONAL defaults from the spec assumptions. All configurable; PENDING where they touch admin decisions. */
export const APP_CONFIG = {
  "cancel_window_hours": "48",
  "return_window_days": "7",
  "free_shipping_threshold": "499",
  "default_shipping_charge": "49",
  "shipment_timer_dispatch_minutes": "2",
  "shipment_timer_in_transit_minutes": "5",
  "shipment_timer_delivered_minutes": "10",
  "return_timer_pickup_minutes": "2",
  "return_timer_received_minutes": "5",
  "gift_point_earn_rate_percent": "5",
  "gift_point_rupee_value": "1",
  "gift_point_max_redeem_percent": "20",
  "cod_max_order_value": "5000",
  "estimated_delivery_days": "5",
  // Phase 7.5 (My Wishlist): the largest number of books one member can keep on a wishlist (FR-082).
  "wishlist_max_items": "200",
};

export const SAMPLE_ORDER_COUNT = 12;

/**
 * PROVISIONAL, configurable delivery zones (spec assumption: simple zone-based rates). The longest matching
 * PIN prefix wins. PINs starting with 9 (army postal) and any prefix not listed are unserviceable.
 */
export const SHIPPING_ZONES = [
  { pinPrefix: "11", zone: "Metro", deliveryDays: 2, charge: 40 },
  { pinPrefix: "40", zone: "Metro", deliveryDays: 2, charge: 40 },
  { pinPrefix: "56", zone: "Metro", deliveryDays: 2, charge: 40 },
  { pinPrefix: "60", zone: "Metro", deliveryDays: 3, charge: 40 },
  { pinPrefix: "70", zone: "Metro", deliveryDays: 3, charge: 40 },
  { pinPrefix: "50", zone: "Metro", deliveryDays: 3, charge: 40 },
  { pinPrefix: "1", zone: "North", deliveryDays: 4, charge: 59 },
  { pinPrefix: "2", zone: "North", deliveryDays: 4, charge: 59 },
  { pinPrefix: "3", zone: "West", deliveryDays: 4, charge: 59 },
  { pinPrefix: "4", zone: "West", deliveryDays: 4, charge: 59 },
  { pinPrefix: "5", zone: "South", deliveryDays: 4, charge: 59 },
  { pinPrefix: "6", zone: "South", deliveryDays: 5, charge: 59 },
  { pinPrefix: "7", zone: "East", deliveryDays: 5, charge: 79 },
  { pinPrefix: "8", zone: "East", deliveryDays: 6, charge: 99 },
];

/** Sample coupons only (coupon management is out of scope). Validity dates are fixed so the seed stays idempotent. */
export const COUPONS = [
  { code: "WELCOME10", type: "PERCENT", value: 10, validFrom: "2026-01-01T00:00:00Z", validTo: "2036-12-31T23:59:59Z", minOrder: 299, usageLimit: null },
  { code: "FLAT100", type: "FLAT", value: 100, validFrom: "2026-01-01T00:00:00Z", validTo: "2036-12-31T23:59:59Z", minOrder: 999, usageLimit: null },
  { code: "OLDSALE", type: "PERCENT", value: 15, validFrom: "2024-01-01T00:00:00Z", validTo: "2024-12-31T23:59:59Z", minOrder: 0, usageLimit: null },
  { code: "ONCEONLY", type: "FLAT", value: 50, validFrom: "2026-01-01T00:00:00Z", validTo: "2036-12-31T23:59:59Z", minOrder: 0, usageLimit: 1, usedCount: 1 },
];

/** Welcome gift points for the first sample member so redemption can be tried. Seeded once. */
export const WELCOME_POINTS = 200;
