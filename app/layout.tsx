import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hi Drone — Self-Generating Ambient Soundscapes',
  description: 'A self-generating ambient soundscape machine built with the Web Audio API. Incommensurable timing, detuned oscillators, slow LFOs, and procedural reverb — every session sounds different.',
  metadataBase: new URL('https://hi-drone.georgoskar.chatgpt.site'),
  openGraph: { title: 'Hi Drone — Self-Generating Ambient Soundscapes', description: 'Generative ambient soundscapes in the browser. Every session sounds different.', type: 'website', images: ['https://hi-drone.georgoskar.chatgpt.site/og.png'] },
  twitter: { card: 'summary_large_image', title: 'Hi Drone — Self-Generating Ambient Soundscapes', description: 'Generative ambient soundscapes in the browser. Every session sounds different.', images: ['https://hi-drone.georgoskar.chatgpt.site/og.png'] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
