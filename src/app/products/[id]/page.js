import { notFound } from "next/navigation";
import { getProduct, getAllProducts, suggestBundles } from "@/lib/products.js";
import { resolveImagePath } from "@/lib/imageUtils.js";
import ProductDetailClient from "./ProductDetailClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }) {
  const { id: idOrSlug } = await params;
  if (!idOrSlug) return { title: "Product Not Found | TiiBaby Shop Jamaica" };

  let product = null;
  try {
    product = await getProduct(idOrSlug);
  } catch {
    // Supabase unreachable — return minimal metadata
    return { title: "TiiBaby Shop Jamaica" };
  }

  if (!product) {
    return { title: "Product Not Found | TiiBaby Shop Jamaica" };
  }

  const cleanCode = String(product.product_code || product.code || "").replace(/^#/, "");
  const title = product.meta_title?.trim()
    || `${product.name} | TiiBaby Shop Jamaica`;

  const description = product.description?.trim()
    || `Shop ${product.name}${cleanCode ? ` (#${cleanCode})` : ""} for $${Number(product.price || 0).toLocaleString()} JMD at TiiBaby Shop Jamaica.`;

  const imageUrl = resolveImagePath(product.image_url || product.image_path || product.image);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: imageUrl, width: 800, height: 800, alt: product.name }],
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
  const { id: idOrSlug } = await params;

  if (!idOrSlug) {
    notFound();
  }

  let product = null;
  let bundles = [];

  try {
    product = await getProduct(idOrSlug);
  } catch (err) {
    console.error(`[ProductPage] Supabase error for "${idOrSlug}":`, err?.message);
    // Don't fall back to a hardcoded product — let Next.js show 404
    notFound();
  }

  // No matching product in the database → proper 404
  if (!product) {
    notFound();
  }

  // Fetch bundles (non-fatal)
  try {
    const all = await getAllProducts();
    if (Array.isArray(all)) {
      bundles = suggestBundles(product, all);
    }
  } catch {
    // Bundles are optional — continue without them
  }

  // Schema.org JSON-LD
  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    image: product.image_url ? [product.image_url] : [],
    description: product.description || product.name,
    sku: product.code || product.product_code || "",
    offers: {
      "@type": "Offer",
      priceCurrency: "JMD",
      price: product.price || 0,
      availability: product.in_stock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: "TiiBaby Shop" },
    },
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
