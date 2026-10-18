'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';

export default function Footer() {
  const pathname = usePathname();

  // On Admin Command Center and Candidate Portal, do not render the marketing footer.
  if (pathname && (pathname.startsWith('/admin') || pathname.startsWith('/portal'))) {
    return null;
  }

  // Pure dark black footer for landing page
  return (
    <footer className="border-t border-zinc-800 bg-black py-8 text-center text-xs text-zinc-500">
      <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p>© 2026 CareerForge. 1-on-1 Interview Clearance & Placement Management.</p>
        <div className="flex items-center gap-4 text-zinc-400">
          <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            100% Mock Vetting
          </span>
          <span>•</span>
          <span>Confidential & Direct Recruiter Lines</span>
          <span>•</span>
          <Link
            href="/admin"
            className="text-zinc-500 hover:text-white text-[11px] inline-flex items-center gap-1 transition-colors"
            title="Administrator Access"
          >
            <Lock className="h-3 w-3" />
            <span>Admin</span>
          </Link>
        </div>
      </div>
    </footer>
  );
}
