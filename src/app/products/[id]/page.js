import { getProduct, getAllProducts, FALLBACK_PRODUCTS, suggestBundles } from "@/lib/products.js";
import { resolveImagePath } from "@/lib/imageUtils.js";
import ProductDetailClient from "./ProductDetailClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }) {
  const idOrSlug = params?.id || params?.slug;
  let product = null;

  try {
    product = await getProduct(idOrSlug);
  } catch {}

  if (!product) {
    product = FALLBACK_PRODUCTS.find(
      fp => String(fp.id) === String(idOrSlug) ||
            String(fp.product_code) === String(idOrSlug) ||
            String(fp.code) === String(idOrSlug) ||
            String(fp.slug) === String(idOrSlug)
    ) || FALLBACK_PRODUCTS[0];
  }

  const cleanCode = String(product?.product_code || product?.code || "").replace(/^#/, "");
  const title = (product?.meta_title && product.meta_title.trim())
    ? product.meta_title.trim()
    : (product?.name ? `${product.name} | TiiBaby Shop Jamaica` : "TiiBaby Shop Jamaica");

  const description = (product?.description && product.description.trim())
    ? product.description.trim()
    : (product?.name
        ? `Shop ${product.name}${cleanCode ? ` (#${cleanCode})` : ""} for $${Number(product?.price || 0).toLocaleString()} JMD at TiiBaby Shop Jamaica.`
        : "Premium baby products in Jamaica. Fast island-wide delivery.");

  const imageUrl = resolveImagePath(product?.image_path || product?.image_url || product?.image || "/placeholder.png");

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
          alt: product?.name || "TiiBaby Shop",
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
  const idOrSlug = params?.id || params?.slug;
  let product = null;
  let bundles = [];

  try {
    product = await getProduct(idOrSlug);
    const all = await getAllProducts().catch(() => FALLBACK_PRODUCTS);
    if (product && Array.isArray(all)) {
      bundles = suggestBundles(product, all);
    }
  } catch {
    product = FALLBACK_PRODUCTS.find(
      fp => String(fp.id) === String(idOrSlug) ||
            String(fp.product_code) === String(idOrSlug) ||
            String(fp.code) === String(idOrSlug) ||
            String(fp.slug) === String(idOrSlug)
    ) || FALLBACK_PRODUCTS[0];
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
    "sku": product.product_code || product.code || "",
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
