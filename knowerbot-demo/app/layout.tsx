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
        {/* knowerbot-runtime.js(정적 파일)는 process.env를 못 읽어서, 빌드 시 주입되는
            NEXT_PUBLIC_API_BASE를 window 전역으로 전달함 — runtime.js 로드 전에 실행돼야 해서 인라인. */}
        {process.env.NEXT_PUBLIC_API_BASE && (
          <Script id="knowerbot-api-base" strategy="beforeInteractive">
            {`window.KNOWERBOT_API_BASE = ${JSON.stringify(process.env.NEXT_PUBLIC_API_BASE)};`}
          </Script>
        )}
        <div className="app-shell">{children}</div>
        <KnowerBotOverlay />
        <ProductTour />
        <Script src="/three_bundle.min.js" strategy="afterInteractive" />
        <Script src="/knowerbot-runtime.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
