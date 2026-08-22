import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hi Drone — Organismic Composition Station",
  description: "A living browser instrument for drones, rhythm, behaviour and performance capture.",
  openGraph: {
    title: "Hi Drone — Organismic Composition Station",
    description: "A living browser instrument for drones, rhythm, behaviour and performance capture.",
    type: "website",
    url: "https://hi-drone.georgoskar.chatgpt.site",
    images: ["https://hi-drone.georgoskar.chatgpt.site/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hi Drone — Organismic Composition Station",
    description: "A living browser instrument for drones, rhythm, behaviour and performance capture.",
    images: ["https://hi-drone.georgoskar.chatgpt.site/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
