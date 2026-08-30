/* scripts/append_new_images.js */
const fs = require('fs');
const path = require('path');

// Paths relative to this script (project root/scripts)
const imagesDir = path.resolve(__dirname, '..', 'public', 'images');
const productsPath = path.resolve(__dirname, '..', 'public', 'products.json');
const backupPath = path.resolve(__dirname, '..', 'public', 'products_backup.json');

// Load and backup products.json (handle accidental leading "git " from previous edit)
let rawProducts = fs.readFileSync(productsPath, 'utf-8').trim();
if (rawProducts.startsWith('git ')) rawProducts = rawProducts.slice(4).trim();
let products;
try {
  products = JSON.parse(rawProducts);
} catch (e) {
  console.error('Failed to parse products.json:', e);
  process.exit(1);
}
fs.copyFileSync(productsPath, backupPath);

// Build set of referenced image paths (full /images/... strings)
const referenced = new Set();
products.forEach(p => {
  if (p.image) referenced.add(p.image);
  if (p.image_path) referenced.add(p.image_path);
  if (p.image_url) referenced.add(p.image_url);
  if (Array.isArray(p.images)) p.images.forEach(i => referenced.add(i));
});

// List all files in imagesDir (ignore desktop.ini)
const allFiles = fs.readdirSync(imagesDir).filter(f => f !== 'desktop.ini');
const unreferenced = allFiles.filter(f => !referenced.has(`/images/${f}`));

function extractTag(filename, prefix) {
  const regex = new RegExp(`${prefix}([^_.$]+)`);
  const m = filename.match(regex);
  return m ? m[1] : null;
}
function inferCategory(name) {
  const u = name.toUpperCase();
  if (u.includes('SHOES')) return 'Shoes';
  if (u.includes('DRESS')) return 'Dress';
  if (u.includes('ROMPER')) return 'Romper';
  if (u.includes('CLOTH') || u.includes('CLOTHING')) return 'Clothes';
  if (u.includes('SUIT')) return 'Suit';
  return 'Misc';
}

// Determine next numeric ID based on existing IDs
let maxId = 0;
products.forEach(p => {
  const n = parseInt(p.id, 10);
  if (!isNaN(n) && n > maxId) maxId = n;
});
let nextId = maxId + 1;

const newProducts = [];
unreferenced.forEach(file => {
  const ext = path.extname(file);
  const base = path.basename(file, ext);

  // Extract product_code after a leading '#'
  const productCode = extractTag(base, '#') || `AUTO-${nextId}`;
  // Extract price after a leading '$'
  const priceTag = extractTag(base, '\\$');
  const price = priceTag ? parseInt(priceTag, 10) : 0;
  const category = inferCategory(base);

  // Create a human readable name: remove tags, replace underscores with spaces, title‑case
  let name = base.replace(/#[^_.$]*/g, '').replace(/\\$[^_.$]*/g, '').replace(/_/g, ' ').trim();
  name = name.replace(/\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

  const imgPath = `/images/${file}`;
  newProducts.push({
    id: String(nextId),
    product_code: productCode,
    name: name || `Unnamed ${nextId}`,
    price,
    image: imgPath,
    image_path: imgPath,
    images: [imgPath],
    in_stock: true,
    category
  });
  nextId++;
});

if (newProducts.length === 0) {
  console.log('No new images detected.');
  process.exit(0);
}

const updated = products.concat(newProducts);
fs.writeFileSync(productsPath, JSON.stringify(updated, null, 2), 'utf-8');
console.log(`Added ${newProducts.length} new product(s). Backup saved at ${backupPath}`);
