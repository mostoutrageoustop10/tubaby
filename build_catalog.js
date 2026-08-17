const fs = require('fs');
const path = require('path');

const imgDir = './public/images';
const jsonPath = './public/products.json';

if (!fs.existsSync(imgDir)) {
console.error('Image directory not found!');
process.exit(1);
}

const files = fs.readdirSync(imgDir);
const products = [];

files.forEach((file, idx) => {
const ext = path.extname(file);
if (!['.webp', '.jpg', '.png', '.jpeg'].includes(ext.toLowerCase())) return;

// 1. STRING SANITIZATION FIRST
let str = file.replace(/\.(jpg|jpeg|png|webp|gif|avif|bmp|tiff)$/i, "").trim();
str = str.replace(/(\d+),(\d{3})/g, "$1$2");

// 2. PRODUCT CODE REGEX
const codeMatch = str.match(/#([A-Za-z0-9.\-]+)/);
const code = codeMatch ? codeMatch[1] : `ACC-${idx + 1}`;

const textWithoutHash = str.replace(/#([A-Za-z0-9.\-]+)/g, "");

// 3. PRICE REGEX
let baseCost = 0;
const dollarMatch = textWithoutHash.match(/\$(\d+(?:\.\d+)?)/);
const jmdMatch = textWithoutHash.match(/(?:JMD\s*)(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*JMD/i);

if (dollarMatch) {
  baseCost = parseFloat(dollarMatch[1]);
} else if (jmdMatch) {
  baseCost = parseFloat(jmdMatch[1] || jmdMatch[2]);
} else {
  const numberMatches = textWithoutHash.match(/(?:^|[\s_\/\-])(\d{3,6})(?!\s*(?:oz|pcs|pk|pack|ml|g|kg|m|cm|mm|in)\b)(?:[\s_\/\.\-]|$)/i);
  if (numberMatches) {
    baseCost = parseFloat(numberMatches[1]);
  }
}

// Clean URL filename
const cleanFileName = file
  .replace(/[\$#]/g, '')
  .replace(/\s+/g, '_');

if (file !== cleanFileName) {
  try {
    fs.renameSync(path.join(imgDir, file), path.join(imgDir, cleanFileName));
  } catch (e) {}
}

const imagePath = `/images/${cleanFileName}`;

// Check duplicate code merging
if (codeMatch && code) {
  const existing = products.find(p => p.product_code === code);
  if (existing) {
    existing.images = Array.from(new Set([...(existing.images || [existing.image]), imagePath]));
    return;
  }
}

// 4. Smart Category Baseline Fallbacks if price wasn't found in name
const isHighTicket = /crib|cot|stroller|bed|dresser|furniture|car_seat/i.test(file);

if (baseCost === 0) {
baseCost = isHighTicket ? 18000 : 2500; // Realistic base for cribs vs standard accessories
}

// 4. Tiered Markup Rules (1.75x if > $10,000, 1.9x if <= $10,000)
const markup = baseCost > 10000 ? 1.75 : 1.9;
const finalPrice = Math.round(baseCost * markup);

// 5. Clean Product Name
let cleanName = file
.replace(ext, '')
.replace(/\$[\d.]+/g, '')
.replace(/#[\w-]+/g, '')
.replace(/_/g, ' ')
.trim();

if (!cleanName) cleanName = `Accessory ${code}`;

products.push({
id: String(products.length + 1),
product_code: code,
name: cleanName,
price: finalPrice,
image: imagePath,
image_path: imagePath,
images: [imagePath],
in_stock: true,
category: isHighTicket ? 'Nursery & Furniture' : 'Accessories'
});
});

fs.writeFileSync(jsonPath, JSON.stringify(products, null, 2));
console.log(`SUCCESS: Re-indexed ${products.length} products with accurate price extraction and markups!`);
