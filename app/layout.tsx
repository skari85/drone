import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hi Drone — Synth Soul',
  description: 'A living browser instrument where soft bodies, sharp machines and human gestures feed one another.',
  metadataBase: new URL('https://hi-drone.georgoskar.chatgpt.site'),
  openGraph: { title: 'Hi Drone — Synth Soul', description: 'Soft bodies, sharp machines and human gestures feeding one living instrument.', type: 'website', images: ['https://hi-drone.georgoskar.chatgpt.site/og.png'] },
  twitter: { card: 'summary_large_image', title: 'Hi Drone — Synth Soul', description: 'Soft bodies, sharp machines and human gestures feeding one living instrument.', images: ['https://hi-drone.georgoskar.chatgpt.site/og.png'] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
