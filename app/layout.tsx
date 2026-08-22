import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hi Drone — Organismic Composition Station',
  description: 'A living browser instrument for drones, rhythm, behaviour and performance capture.',
  metadataBase: new URL('https://hi-drone.georgoskar.chatgpt.site'),
  openGraph: { title: 'Hi Drone — Organismic Composition Station', description: 'Generate, disturb and capture evolving music before it disappears.', type: 'website', images: ['https://hi-drone.georgoskar.chatgpt.site/og.png'] },
  twitter: { card: 'summary_large_image', title: 'Hi Drone — Organismic Composition Station', description: 'Generate, disturb and capture evolving music before it disappears.', images: ['https://hi-drone.georgoskar.chatgpt.site/og.png'] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
