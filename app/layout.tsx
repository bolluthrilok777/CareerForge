import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const fontSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CareerForge / Support Engine | 1-on-1 Technical Interview Clearance & Placement',
  description: 'Direct 1-on-1 technical interview clearance, ATS optimization, and transparent milestone placement support (Upfront onboarding + 12% LPA post-offer).',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${fontSans.variable} ${fontMono.variable}`}>
      <body className="min-h-screen bg-black text-white antialiased flex flex-col font-sans">
        <Navbar />
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
