export const MARKUP = {
  "Baby Carriers": 1.8,
  "Accessories": 2.5,
  "Toys & Bouncers": 1.6,
  default: 1.5,
};

export function applyMarkup(basePrice, category) {
  if (!basePrice || isNaN(Number(basePrice))) return null;
  return Math.round(Number(basePrice) * (MARKUP[category] ?? MARKUP.default));
}

export function detectCategory(text = "") {
  const t = text.toLowerCase();
  if (/carrier|wrap|sling/.test(t)) return "Baby Carriers";
  if (/bouncer|rocker|swing|seat|jumper|walker|bassinet/.test(t)) return "Toys & Bouncers";
  if (/cap|turban|hat|beanie|headband|bow|spoon|fork|soap|pin|sheet|mirror/.test(t)) return "Accessories";
  return "Accessories";
}

export function suggestBundles(product, allProducts) {
  const MAP = {
    "Baby Carriers": ["Accessories", "Toys & Bouncers"],
    "Accessories": ["Baby Carriers", "Toys & Bouncers"],
    "Toys & Bouncers": ["Baby Carriers", "Accessories"],
  };
  return (MAP[product.category] || [])
    .map(cat => allProducts.find(p => p.category === cat && p.id !== product.id && p.in_stock))
    .filter(Boolean).slice(0, 2);
}

export function parseResilientInput(data = {}) {
  let rawName = String(data.name || "").trim();
  let rawCode = String(data.product_code || "").trim();
  let rawPrice = data.price;
  let rawBasePrice = data.base_price;

  // 1. SKU PARSING - Preserve # prefix and hyphens
  let code = null;
  if (rawCode && rawCode !== "null" && rawCode !== "undefined" && rawCode !== "") {
    code = rawCode.startsWith("#") ? rawCode : `#${rawCode}`;
  } else {
    const hashMatch = rawName.match(/#([A-Za-z0-9.\-]+)/);
    if (hashMatch) {
      code = `#${hashMatch[1]}`;
    }
  }

  // 2. PRICE PARSING - Strip $, J$, #, ~, extra text, remove commas, normalize decimals
  const cleanPriceStr = (val) => {
    if (typeof val === "number") return isNaN(val) ? null : val;
    if (!val) return null;
    let s = String(val)
      .replace(/(?:JMD|J\$|\$|~|#)/gi, "")
      .replace(/,/g, "")
      .trim();
    const m = s.match(/\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  };

  let numPrice = cleanPriceStr(rawPrice);
  if (numPrice === null && rawBasePrice) {
    numPrice = cleanPriceStr(rawBasePrice);
  }

  if (numPrice === null) {
    const textWithoutHash = rawName.replace(/#([A-Za-z0-9.\-]+)/g, "");
    const dollarMatch = textWithoutHash.match(/\$\s*(\d+(?:,\d+)*(?:\.\d+)?)/);
    const jmdMatch = textWithoutHash.match(/(?:JMD|J\$)\s*(\d+(?:,\d+)*(?:\.\d+)?)/i);
    const tildeMatch = textWithoutHash.match(/~\s*\$?\s*(\d+(?:,\d+)*(?:\.\d+)?)/);
    const standaloneMatch = textWithoutHash.match(/(?:^|[\s_\/\-])(\d{3,6})(?!\s*(?:oz|pcs|pk|pack|ml|g|kg|m|cm|mm|in)\b)(?:[\s_\/\.\-]|$)/i);

    if (dollarMatch) {
      numPrice = parseFloat(dollarMatch[1].replace(/,/g, ""));
    } else if (jmdMatch) {
      numPrice = parseFloat(jmdMatch[1].replace(/,/g, ""));
    } else if (tildeMatch) {
      numPrice = parseFloat(tildeMatch[1].replace(/,/g, ""));
    } else if (standaloneMatch) {
      numPrice = parseFloat(standaloneMatch[1]);
    }
  }

  let parsedPrice = 0;
  let needsReview = false;

  if (numPrice !== null && !isNaN(numPrice) && numPrice > 0) {
    parsedPrice = numPrice;
    needsReview = Boolean(data.needs_review);
  } else {
    parsedPrice = 0;
    needsReview = true;
  }

  // 3. CLEAN NAME
  let cleanName = rawName
    .replace(/#([A-Za-z0-9.\-]+)/gi, "")
    .replace(/(?:JMD|J\$|\$|~)\s*\d+(?:,\d+)*(?:\.\d+)?/gi, "")
    .replace(/__+/g, " ")
    .replace(/[-_]+/g, " ")
    .trim();

  cleanName = cleanName
    .replace(/\s+/g, " ")
    .replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .trim();

  return {
    ...data,
    name: cleanName || "Product",
    product_code: code || `#PROD-${Date.now().toString().slice(-6)}`,
    price: parsedPrice,
    base_price: rawBasePrice ? cleanPriceStr(rawBasePrice) : null,
    needs_review: needsReview,
  };
}

export const FALLBACK_PRODUCTS = [
  { id: 1, name: "Infant-to-Toddler Rocker (Pink)", product_code: "#68147", price: 5800, category: "Toys & Bouncers", image_path: "/images/BOUNCER__5800__4_.webp", in_stock: true, featured: false, needs_review: false },
  { id: 2, name: "Infant-to-Toddler Rocker (Teal)", product_code: "#68144", price: 5800, category: "Toys & Bouncers", image_path: "/images/BOUNCER__5800.webp", in_stock: true, featured: false, needs_review: false },
  { id: 3, name: "Baby Turban Cap", product_code: "#0021", price: 575, category: "Accessories", image_path: "/images/BABY_TURBAN_CAP__0021__230.webp", in_stock: true, featured: false, needs_review: false },
  { id: 4, name: "Baby Carrier EN71", product_code: "#EN71-2", price: 1764, category: "Baby Carriers", image_path: "/images/BABY_CARRIER_EN71-2___980.webp", in_stock: true, featured: true, needs_review: false },
];

