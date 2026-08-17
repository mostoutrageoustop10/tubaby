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

export const FALLBACK_PRODUCTS = [
  { id: 1, name: "Infant-to-Toddler Rocker (Pink)", product_code: "68147", price: 5800, category: "Toys & Bouncers", image_path: "/images/BOUNCER__5800__4_.webp", in_stock: true, featured: false },
  { id: 2, name: "Infant-to-Toddler Rocker (Teal)", product_code: "68144", price: 5800, category: "Toys & Bouncers", image_path: "/images/BOUNCER__5800.webp", in_stock: true, featured: false },
  { id: 3, name: "Baby Turban Cap", product_code: "0021", price: 575, category: "Accessories", image_path: "/images/BABY_TURBAN_CAP__0021__230.webp", in_stock: true, featured: false },
  { id: 4, name: "Baby Carrier EN71", product_code: "EN71-2", price: 1764, category: "Baby Carriers", image_path: "/images/BABY_CARRIER_EN71-2___980.webp", in_stock: true, featured: true },
];
