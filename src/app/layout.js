import "./globals.css";
import { CartProvider } from "@/lib/CartContext";

export const metadata = {
  title: {
    default: "TiiBaby Shop 🌸 — Premium Baby Products in Jamaica",
    template: "%s | TiiBaby Shop Jamaica",
  },
  description: "Jamaica's premier shop for baby carriers, bouncers, turbans, rockers & nursery accessories. Fast delivery across Jamaica 🇯🇲.",
  keywords: ["baby shop Jamaica", "baby carriers Kingston", "TiiBaby", "baby turbans", "infant bouncers", "nursery Jamaica"],
  metadataBase: new URL("https://tiibaby.com"),
  openGraph: {
    title: "TiiBaby Shop 🌸 — Premium Baby Products in Jamaica",
    description: "Premium baby carriers, accessories, strollers & bouncers — delivered with love across Jamaica 🇯🇲.",
    siteName: "TiiBaby Shop",
    type: "website",
    locale: "en_JM",
    images: [
      {
        url: "/images/BOUNCER__5800.webp",
        width: 1200,
        height: 630,
        alt: "TiiBaby Shop Jamaica",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TiiBaby Shop 🌸 — Premium Baby Products in Jamaica",
    description: "Premium baby carriers, accessories, strollers & bouncers — delivered with love across Jamaica 🇯🇲.",
    images: ["/images/BOUNCER__5800.webp"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
