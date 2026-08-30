const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Support loading .env.local fallback if not already provided via --env-file
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
  } catch (e) {
    // dotenv is optional if --env-file was used
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Error: Supabase credentials missing.');
  console.error('Please verify NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const IMAGE_EXTS = new Set(['webp', 'jpg', 'jpeg', 'png', 'gif', 'avif']);
function sanitizeImagePath(raw, productCode) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) {
    if (productCode) {
      const c = String(productCode).replace(/^#/, '').trim();
      return c ? `/images/${c}.webp` : '/placeholder.png';
    }
    return '/placeholder.png';
  }
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:') || s.startsWith('blob:')) return s;
  if (s.startsWith('/')) {
    const ext = s.split('.').pop().toLowerCase();
    return IMAGE_EXTS.has(ext) ? s : `${s}.webp`;
  }
  const sanitized = s.replace(/\s+/g, '_');
  const ext = sanitized.split('.').pop().toLowerCase();
  return `/images/${IMAGE_EXTS.has(ext) ? sanitized : sanitized + '.webp'}`;
}

function toUuid(seed) {
  const hash = crypto.createHash('md5').update(String(seed)).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16),
    'a' + hash.substring(17, 20),
    hash.substring(20, 32)
  ].join('-');
}

async function detectColumns() {
  const testCols = [
    'id',
    'name',
    'product_code',
    'code',
    'price',
    'category',
    'image_path',
    'image_url',
    'in_stock',
    'needs_review',
    'variants',
    'images',
    'base_price',
    'featured',
    'source',
    'description'
  ];

  const available = new Set();

  for (const col of testCols) {
    const { error } = await supabase.from('products').select(col).limit(1);
    if (!error) {
      available.add(col);
    }
  }

  return available;
}

async function seed() {
  const jsonPath = path.join(__dirname, '../public/products.json');

  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ Error: Could not find ${jsonPath}`);
    process.exit(1);
  }

  console.log(`📖 Reading products from ${jsonPath}...`);
  const rawData = fs.readFileSync(jsonPath, 'utf-8');
  const products = JSON.parse(rawData);

  if (!Array.isArray(products) || products.length === 0) {
    console.error('❌ Error: products.json is empty or invalid array.');
    process.exit(1);
  }

  console.log(`🔍 Found ${products.length} products to seed.`);
  console.log('🔍 Inspecting Supabase schema...');
  const columns = await detectColumns();
  console.log(`✅ Detected table columns: ${Array.from(columns).join(', ')}`);

  // Transform products based on available table columns
  const records = products.map((p, index) => {
    const record = {};

    // ID handling: deterministic UUID or numeric
    const rawId = p.id || p.product_code || String(index + 1);
    record.id = toUuid(rawId);

    if (columns.has('name')) {
      record.name = p.name || 'Unnamed Product';
    }

    if (columns.has('product_code')) {
      record.product_code = p.product_code || `ACC-${index + 1}`;
    }

    if (columns.has('code')) {
      record.code = p.product_code || p.code || `ACC-${index + 1}`;
    }

    if (columns.has('price')) {
      record.price = typeof p.price === 'number' ? p.price : (parseFloat(p.price) || 0);
    }

    if (columns.has('base_price') && p.base_price !== undefined) {
      record.base_price = typeof p.base_price === 'number' ? p.base_price : (parseFloat(p.base_price) || null);
    }

    if (columns.has('category')) {
      record.category = p.category || 'Accessories';
    }

    const rawImage = p.image_path || p.image || '';
    const imageCode = p.product_code || p.code;
    const image = sanitizeImagePath(rawImage, imageCode);
    if (columns.has('image_path')) {
      record.image_path = image;
    }
    if (columns.has('image_url')) {
      record.image_url = image;
    }

    if (columns.has('in_stock')) {
      record.in_stock = p.in_stock !== undefined ? Boolean(p.in_stock) : true;
    }

    if (columns.has('needs_review')) {
      record.needs_review = p.needs_review !== undefined ? Boolean(p.needs_review) : false;
    }

    if (columns.has('variants')) {
      record.variants = p.variants || [];
    }

    if (columns.has('images')) {
      record.images = Array.isArray(p.images) ? p.images : (image ? [image] : []);
    }

    if (columns.has('featured') && p.featured !== undefined) {
      record.featured = Boolean(p.featured);
    }

    if (columns.has('source') && p.source !== undefined) {
      record.source = p.source;
    }

    if (columns.has('description') && p.description !== undefined) {
      record.description = p.description;
    }

    return record;
  });

  // Batch upsert to Supabase
  const BATCH_SIZE = 50;
  let totalUpserted = 0;

  console.log(`🚀 Seeding ${records.length} products to Supabase in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from('products')
      .upsert(batch, { onConflict: 'id' })
      .select('id');

    if (error) {
      console.error(`❌ Upsert error in batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
      throw error;
    }

    totalUpserted += (data ? data.length : batch.length);
    console.log(`  ✓ Processed batch ${Math.floor(i / BATCH_SIZE) + 1} (${totalUpserted}/${records.length})`);
  }

  console.log(`🎉 SUCCESS: Successfully upserted ${totalUpserted} products into Supabase 'products' table!`);
}

seed().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
