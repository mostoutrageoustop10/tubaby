import { getProduct, getAllProducts, FALLBACK_PRODUCTS, suggestBundles } from "@/lib/products";
import ProductDetailClient from "./ProductDetailClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const id = params?.id;
  let product = null;

  try {
    product = await getProduct(id);
  } catch {}

  if (!product) {
    product = FALLBACK_PRODUCTS.find(fp => String(fp.id) === String(id)) || FALLBACK_PRODUCTS[0];
  }

  const title = `${product.name} | TiiBaby Shop Jamaica`;
  const description = product.description || `Shop ${product.name} (#${product.product_code}) for $${Number(product.price).toLocaleString()} JMD at TiiBaby Shop Jamaica.`;
  const imageUrl = product.image_path || product.image || "/placeholder.png";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: imageUrl,
          width: 800,
          height: 800,
          alt: product.name,
        },
      ],
      type: "website",
      siteName: "TiiBaby Shop 🌸",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function ProductPage({ params }) {
  const id = params?.id;
  let product = null;
  let bundles = [];

  try {
    product = await getProduct(id);
    const all = await getAllProducts().catch(() => FALLBACK_PRODUCTS);
    if (product && Array.isArray(all)) {
      bundles = suggestBundles(product, all);
    }
  } catch {
    product = FALLBACK_PRODUCTS.find(fp => String(fp.id) === String(id)) || FALLBACK_PRODUCTS[0];
  }

  if (!product) {
    product = FALLBACK_PRODUCTS[0];
  }

  // Schema.org Product JSON-LD
  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": product.name,
    "image": product.image_path ? [product.image_path] : [],
    "description": product.description || product.name,
    "sku": product.product_code,
    "offers": {
      "@type": "Offer",
      "priceCurrency": "JMD",
      "price": product.price || 0,
      "availability": product.in_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      "seller": {
        "@type": "Organization",
        "name": "TiiBaby Shop"
      }
    }
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductDetailClient initialProduct={product} initialBundles={bundles} />
    </>
  );
}
