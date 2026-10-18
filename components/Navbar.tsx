'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, CalendarCheck } from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();

  // On Admin Command Center and Candidate Portal, do not render the public marketing navbar.
  if (pathname && (pathname.startsWith('/admin') || pathname.startsWith('/portal') || pathname.startsWith('/instant'))) {
    return null;
  }

  // Pure dark black navbar for public landing page
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-black/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="h-9 w-9 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-lg tracking-tight text-white">
              CareerForge
            </span>
            <span className="text-[10px] text-emerald-400 font-semibold tracking-wider uppercase -mt-1 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Placement Engine
            </span>
          </div>
        </Link>

        <div>
          <a
            href="#book-slot"
            className="px-4 py-2 rounded-xl bg-white hover:bg-zinc-200 text-black font-extrabold text-xs sm:text-sm shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <CalendarCheck className="h-4 w-4" />
            <span>Book Free Strategy Call</span>
          </a>
        </div>
      </div>
    </header>
  );
}
