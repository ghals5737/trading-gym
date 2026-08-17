import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import KnowerBotOverlay from '../components/KnowerBotOverlay';
import ProductTour from '../components/ProductTour';

export const metadata: Metadata = {
  title: '트레이딩 짐 - KnowerBot',
  description: 'KnowerBot 모의투자 데모',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <div className="app-shell">{children}</div>
        <KnowerBotOverlay />
        <ProductTour />
        <Script src="/three_bundle.min.js" strategy="afterInteractive" />
        <Script src="/knowerbot-runtime.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
