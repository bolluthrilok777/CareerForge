'use client';

import { useState, useEffect } from 'react';

// Centralized Date & Schedule Helpers
// Always computes relative to the current live date (never static/hardcoded)

export function getTodayDateStr(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getUpcomingDates(daysCount = 14): { dateStr: string; label: string; dayName: string }[] {
  const dates = [];
  const now = new Date();
  
  for (let i = 0; i < daysCount; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12, 0, 0);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayName = i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.toLocaleDateString('en-US', { weekday: 'short' });
    const label = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    dates.push({ dateStr, label, dayName });
  }
  return dates;
}

export const DEFAULT_SLOT_TIME = '02:30 PM IST';

// Client Hook that avoids Next.js prerender error by populating on mount
export function useLiveUpcomingDates(daysCount = 14) {
  const [upcomingDates, setUpcomingDates] = useState<{ dateStr: string; label: string; dayName: string }[]>([]);
  const [todayStr, setTodayStr] = useState<string>('');

  useEffect(() => {
    const today = getTodayDateStr();
    setTodayStr(today);
    setUpcomingDates(getUpcomingDates(daysCount));
  }, [daysCount]);

  return { upcomingDates, todayStr };
}
