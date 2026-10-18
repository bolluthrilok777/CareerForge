'use client';

import React, { useState } from 'react';
import {
  Clock,
  Sparkles,
  Award,
  CheckCircle2,
  Send,
  TrendingUp,
  MessageSquare,
  FileCheck2,
  Check,
  AlertCircle,
  ArrowRight,
  FileText,
  FileLock,
  ChevronDown,
  Briefcase,
  Zap,
  Shield,
  BadgeCheck
} from 'lucide-react';
import { supabase, DatabaseLead } from '@/lib/supabase';

const TECH_STACKS = [
  'Java Full Stack (Spring Boot / Microservices / React / Angular)',
  'Python / Django / FastAPI / Distributed Systems',
  'React / Node.js / Full Stack TypeScript',
  'DevOps / Cloud Architecture (AWS / GCP / K8s / Terraform)',
  'Data Engineering (Spark / Kafka / Snowflake / Airflow)',
  'QA / SDET Automation (Selenium / Cypress / Playwright)',
  'C++ / Low-Latency Systems / Embedded',
  'Other Tech Stack',
];

const NOTICE_PERIODS = ['Immediate', '15 Days', '30 Days', '60+ Days'] as const;

const EXPERIENCE_LEVELS = [
  '1 - 3 Years (Mid-Level Engineer)',
  '3 - 5 Years (Senior Engineer)',
  '5 - 8 Years (Lead / Staff Engineer)',
  '8+ Years (Principal / Architect)',
];

// 15-minute slot generator from 10:00 AM to 9:30 PM IST
const generateTimeSlots = (): string[] => {
  const slots: string[] = [];
  const startMinutes = 10 * 60; // 10:00 AM
  const endMinutes = 21 * 60 + 30; // 9:30 PM

  for (let m = startMinutes; m <= endMinutes; m += 15) {
    const hours24 = Math.floor(m / 60);
    const minutes = m % 60;
    const period = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    const formattedHour = hours12 < 10 ? `0${hours12}` : `${hours12}`;
    const formattedMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;
    slots.push(`${formattedHour}:${formattedMinutes} ${period} IST`);
  }
  return slots;
};

const ALL_TIME_SLOTS = generateTimeSlots();

interface BusinessDate {
  dateString: string;
  displayLabel: string;
  dayName: string;
}

// Generate business dates (today + next 5 business days)
const getInitialBusinessDates = (): BusinessDate[] => {
  const dates: BusinessDate[] = [];
  const now = new Date();
  const current = new Date(now);

  while (dates.length < 6) {
    const day = current.getDay();
    // Skip Sunday (0) for business slots
    if (day !== 0) {
      const dateString = current.toISOString().split('T')[0];
      const isToday = dates.length === 0 && current.toDateString() === now.toDateString();
      const dayName = current.toLocaleDateString('en-US', { weekday: 'short' });
      const displayLabel = isToday
        ? `Today (${current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
        : current.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

      dates.push({ dateString, displayLabel, dayName });
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

const INITIAL_BUSINESS_DATES = getInitialBusinessDates();

export default function SocialAdLandingPage() {
  const [businessDates] = useState<BusinessDate[]>(INITIAL_BUSINESS_DATES);
  const [selectedSlotPeriod, setSelectedSlotPeriod] = useState<'morning' | 'afternoon' | 'evening'>('afternoon');

  const [formData, setFormData] = useState({
    fullName: '',
    whatsappNumber: '',
    techStack: TECH_STACKS[0],
    currentCtcLpa: '',
    experienceLevel: EXPERIENCE_LEVELS[1],
    noticePeriod: '30 Days' as (typeof NOTICE_PERIODS)[number],
    willingToInvest: 'Yes' as 'Yes' | 'No',
    bookingDate: INITIAL_BUSINESS_DATES[0]?.dateString || '',
    bookingTime: '02:30 PM IST',
  });

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [confirmedBookingId, setConfirmedBookingId] = useState('');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // Filter slots for easier selection
  const filteredSlots = ALL_TIME_SLOTS.filter((slot) => {
    const isPM = slot.includes('PM');
    const hour = parseInt(slot.split(':')[0], 10);

    if (selectedSlotPeriod === 'morning') {
      return !isPM || hour === 12; // 10:00 AM - 11:45 AM
    } else if (selectedSlotPeriod === 'afternoon') {
      return isPM && (hour === 12 || (hour >= 1 && hour < 5)); // 12:00 PM - 4:45 PM
    } else {
      return isPM && hour >= 5 && hour <= 9; // 5:00 PM - 9:30 PM
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!formData.fullName.trim()) {
      setValidationError('Please enter your full name.');
      return;
    }

    const cleanPhone = formData.whatsappNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setValidationError('Please provide a valid 10-digit WhatsApp number so we can reach you.');
      return;
    }

    if (!formData.bookingDate) {
      setValidationError('Please select a valid date for your 15-minute strategy call.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Map form values into candidate_leads schema
      const payload: DatabaseLead = {
        full_name: formData.fullName.trim(),
        whatsapp_number: formData.whatsappNumber.trim(),
        tech_stack: formData.techStack,
        current_ctc_lpa: formData.currentCtcLpa ? `${formData.currentCtcLpa} LPA` : 'Not Disclosed',
        target_ctc_lpa: formData.experienceLevel,
        notice_period: formData.noticePeriod,
        willing_to_invest: formData.willingToInvest === 'Yes' ? 'Yes' : 'No',
        booking_date: formData.bookingDate,
        booking_time: formData.bookingTime,
        status: 'Pending Verification',
      };

      // Insert into candidate_leads table in Supabase
      const { data, error } = await supabase
        .from('candidate_leads')
        .insert([payload])
        .select();

      if (error) {
        throw new Error(error.message);
      }

      const generatedId =
        data && data[0]?.id
          ? `CF-${data[0].id.slice(0, 8).toUpperCase()}`
          : 'CF-' + Math.floor(100000 + Math.random() * 900000);

      setConfirmedBookingId(generatedId);
      setIsConfirmed(true);
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? err.message
          : 'Failed to submit booking. Please try again.';
      setValidationError(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const FAQS = [
    {
      q: 'Will my current employer find out I booked a strategy call?',
      a: 'Absolutely not. All communications occur on dedicated private WhatsApp channels. We enforce strict non-disclosure and never contact current employers or public references.'
    },
    {
      q: 'Do I have to switch to a different tech stack or learn new languages?',
      a: 'No. You continue doing the exact same work you already excel at. We focus on interview clearance, system design depth, and architecture defense within your existing domain so you earn significantly more for what you already do.'
    },
    {
      q: 'How does Document Managing work for smooth onboarding?',
      a: 'Many engineers face anxiety over Background Verification (BGV), PF/UAN record matching, experience certificate wording, or notice period buyouts. We provide complete document structuring and transition guidance so your enterprise onboarding is 100% compliant and seamless.'
    },
    {
      q: 'What happens during the 15-Minute Strategy Call?',
      a: 'A senior engineering mentor will call you directly on WhatsApp. We diagnose your current compensation gap, review your notice period strategy, and outline a tailored roadmap to clear tier-1 technical panels.'
    },
    {
      q: 'What is the pricing model?',
      a: 'We use a transparent milestone model: A one-time upfront onboarding fee to cover your 1-on-1 mentor drills, ATS resume re-engineering, and document structuring, followed by a 12% milestone fee payable strictly after you receive, negotiate, and accept your verified offer letter.'
    }
  ];

  return (
    <div className="flex-1 flex flex-col justify-start bg-slate-950 text-slate-100 overflow-x-hidden">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-16 lg:pt-20 lg:pb-24 border-b border-slate-800/80">
        {/* Glow ambient background accents */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-gradient-to-tr from-indigo-600/20 via-emerald-500/10 to-cyan-500/15 blur-[150px] pointer-events-none rounded-full" />
        <div className="absolute top-1/3 -right-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          
          {/* Main Hero Hook */}
          <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold mb-6 shadow-inner">
              <Sparkles className="h-4 w-4 text-emerald-400 animate-pulse" />
              <span>For Mid & Senior Software Engineers</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.15]">
              Feeling Stuck in Your Current Role?{' '}
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
                Level Up to Higher Packages & Senior Roles.
              </span>
            </h1>

            <p className="mt-5 text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
              If you feel stuck at a low salary or undervalued by slow annual appraisals, it&apos;s time for your next career step. Clear L1 to Bar-Raiser technical interviews for top-tier companies with direct 1-on-1 mentorship and complete document managing for smooth onboarding.
            </p>

            {/* Trust Pill Badges */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs">
              <div className="px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 flex items-center gap-1.5 text-slate-200 shadow-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>Career Growth & Better Package</span>
              </div>
              <div className="px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 flex items-center gap-1.5 text-slate-200 shadow-sm">
                <FileCheck2 className="h-4 w-4 text-indigo-400" />
                <span>Documents Managing & BGV Support</span>
              </div>
              <div className="px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 flex items-center gap-1.5 text-slate-200 shadow-sm">
                <Shield className="h-4 w-4 text-teal-400" />
                <span>100% Confidential Private Lines</span>
              </div>
            </div>
          </div>

          {/* Main Grid: Value Proposition & Booking Form */}
          <div id="book-slot" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start scroll-mt-24">
            
            {/* Left Column (5 Cols): Clean Value Prop Cards */}
            <div className="lg:col-span-5 space-y-5">
              
              {/* Pillar 1: Career Level Up */}
              <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-emerald-500/40 transition-all shadow-xl">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3.5">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-white">
                  Next-Level Seniority & Higher Compensation
                </h3>
                <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                  Break out of low-appraisal cycles and stagnant titles. We prepare you to step into senior, higher-impact engineering positions with compensation packages that truly reflect your experience and capabilities.
                </p>
              </div>

              {/* Pillar 2: Complete Document Managing (Requested by User) */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-950/40 via-slate-900/80 to-slate-900/80 border border-indigo-500/30 shadow-xl">
                <div className="flex items-center justify-between mb-3.5">
                  <div className="h-10 w-10 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
                    <FileLock className="h-5 w-5" />
                  </div>
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                    Smooth Onboarding
                  </span>
                </div>
                <h3 className="text-base font-bold text-white">
                  Documents Managing & BGV Assurance
                </h3>
                <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                  Zero stress over background checks or transition paperwork. We handle enterprise BGV verification standards, PF/UAN record matching, experience documentation, and smooth resignation exit strategies.
                </p>
                <div className="mt-3.5 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Check className="h-3 w-3 text-emerald-400" />
                    BGV Audit Cleared
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Check className="h-3 w-3 text-emerald-400" />
                    Frictionless Transition
                  </span>
                </div>
              </div>

              {/* Pillar 3: Milestone Transparent Model */}
              <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800/80">
                <div className="h-10 w-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center mb-3.5">
                  <Award className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-white">
                  Shared Risk: Post-Offer Milestone
                </h3>
                <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                  We invest our senior engineering bandwidth alongside you. Upfront onboarding registration, with our 12% milestone payable strictly after you accept your verified high-paying offer letter.
                </p>
              </div>

              {/* Instant Social Ad Hook */}
              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                  <Zap className="h-4 w-4" />
                </div>
                <div className="text-xs text-slate-300">
                  <strong className="text-white block">Direct 1-on-1 WhatsApp Call:</strong>
                  No generic sales reps. You speak directly with a senior engineering mentor.
                </div>
              </div>
            </div>

            {/* Right Column (7 Cols): Distraction-Free Booking Form */}
            <div className="lg:col-span-7">
              <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/95 border border-indigo-500/30 shadow-2xl relative backdrop-blur-xl">
                
                {isConfirmed ? (
                  /* Confirmation View (NO Candidate Portal or Admin links exposed) */
                  <div className="py-8 text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
                    <div className="h-16 w-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/40">
                      <CheckCircle2 className="h-9 w-9" />
                    </div>

                    <div>
                      <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        15-Min Strategy Slot Confirmed
                      </span>
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-3">
                        We&apos;ll Call You, {formData.fullName}!
                      </h2>
                      <p className="text-sm text-slate-300 max-w-md mx-auto mt-2 leading-relaxed">
                        Your direct 1-on-1 strategy call is reserved for{' '}
                        <span className="text-emerald-300 font-semibold">{formData.bookingDate}</span> at{' '}
                        <span className="text-indigo-300 font-semibold">{formData.bookingTime}</span>.
                      </p>
                    </div>

                    {/* Booking Reference Card */}
                    <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-left max-w-md mx-auto space-y-2.5 text-xs">
                      <div className="flex justify-between pb-2 border-b border-slate-800">
                        <span className="text-slate-400">Reference Token:</span>
                        <span className="font-mono font-bold text-indigo-400">{confirmedBookingId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">WhatsApp Dispatch:</span>
                        <span className="font-medium text-slate-200">{formData.whatsappNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Primary Domain:</span>
                        <span className="font-medium text-slate-200 text-right truncate max-w-[200px]">{formData.techStack}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Experience Level:</span>
                        <span className="font-bold text-slate-200">{formData.experienceLevel}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Notice Period:</span>
                        <span className="font-medium text-slate-200">{formData.noticePeriod}</span>
                      </div>
                    </div>

                    {/* Clear Next Steps Notice (As requested: we will call them, no candidate portal until converted) */}
                    <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-800/40 text-xs text-indigo-200 text-left max-w-md mx-auto space-y-1.5">
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <MessageSquare className="h-4 w-4 text-emerald-400" />
                        <span>What Happens Next:</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed">
                        1. Our senior technical mentor will reach out to you directly on WhatsApp at your selected slot.
                      </p>
                      <p className="text-slate-300 leading-relaxed">
                        2. We will analyze your career trajectory, target role expectations, and detail our end-to-end clearance & document managing roadmap.
                      </p>
                      <p className="text-slate-400 text-[11px] pt-1 border-t border-indigo-900/50">
                        🔒 Note: Candidate self-service portal credentials are shared directly after onboarding verification is approved.
                      </p>
                    </div>

                    <button
                      onClick={() => setIsConfirmed(false)}
                      className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors cursor-pointer"
                    >
                      Book Another Slot / Edit Details
                    </button>
                  </div>
                ) : (
                  /* High-Converting Form */
                  <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                    <div className="border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
                        <Clock className="h-4 w-4 text-emerald-400" />
                        <span>Free 15-Minute Technical Strategy Diagnostic</span>
                      </div>
                      <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">
                        Book Your 1-on-1 Call
                      </h2>
                      <p className="text-xs text-slate-400 mt-1">
                        Reserve 15 minutes with a lead engineer. We evaluate your interview readiness and map out your next career level-up.
                      </p>
                    </div>

                    {validationError && (
                      <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/60 text-red-300 text-xs flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{validationError}</span>
                      </div>
                    )}

                    {/* Basic Info: Name & WhatsApp */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Full Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.fullName}
                          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                          placeholder="e.g. Rahul Sharma"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-white placeholder-slate-500 outline-none transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          WhatsApp Number *
                        </label>
                        <input
                          type="tel"
                          required
                          value={formData.whatsappNumber}
                          onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
                          placeholder="+91 98765 43210"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-white placeholder-slate-500 outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* Tech Stack */}
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Current Tech Stack *
                      </label>
                      <select
                        value={formData.techStack}
                        onChange={(e) => setFormData({ ...formData, techStack: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-white outline-none cursor-pointer"
                      >
                        {TECH_STACKS.map((stack) => (
                          <option key={stack} value={stack}>
                            {stack}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Current CTC & Relative Hike Goal (NO fixed LPA) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Current CTC (Approx. in LPA)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={formData.currentCtcLpa}
                          onChange={(e) => setFormData({ ...formData, currentCtcLpa: e.target.value })}
                          placeholder="e.g. 10.5"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-white placeholder-slate-500 outline-none transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          Experience Level *
                        </label>
                        <select
                          value={formData.experienceLevel}
                          onChange={(e) => setFormData({ ...formData, experienceLevel: e.target.value })}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-slate-200 font-semibold outline-none cursor-pointer"
                        >
                          {EXPERIENCE_LEVELS.map((level) => (
                            <option key={level} value={level} className="text-white">
                              {level}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Notice Period Chips */}
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Notice Period Status *
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {NOTICE_PERIODS.map((period) => (
                          <button
                            type="button"
                            key={period}
                            onClick={() => setFormData({ ...formData, noticePeriod: period })}
                            className={`py-2 px-3 rounded-xl text-xs font-medium border text-center transition-all cursor-pointer ${
                              formData.noticePeriod === period
                                ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500 shadow-sm shadow-indigo-900/50'
                                : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                          >
                            {period}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Date Selector */}
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Select Call Date *
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {businessDates.map((item) => (
                          <button
                            type="button"
                            key={item.dateString}
                            onClick={() => setFormData({ ...formData, bookingDate: item.dateString })}
                            className={`py-2 px-2.5 rounded-xl text-xs border text-center transition-all cursor-pointer ${
                              formData.bookingDate === item.dateString
                                ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500 font-semibold'
                                : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                          >
                            <span className="block text-[10px] text-slate-500">{item.dayName}</span>
                            <span className="font-medium">{item.displayLabel}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Time Slot Selector */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-medium text-slate-300">
                          Select 15-Minute Slot (IST) *
                        </label>
                        <div className="flex items-center gap-1 text-[10px]">
                          {(['morning', 'afternoon', 'evening'] as const).map((period) => (
                            <button
                              type="button"
                              key={period}
                              onClick={() => setSelectedSlotPeriod(period)}
                              className={`px-2 py-0.5 rounded capitalize transition-colors cursor-pointer ${
                                selectedSlotPeriod === period
                                  ? 'bg-indigo-600 text-white font-semibold'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {period}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-40 overflow-y-auto p-1 bg-slate-950/60 rounded-xl border border-slate-800/80">
                        {filteredSlots.map((slot) => (
                          <button
                            type="button"
                            key={slot}
                            onClick={() => setFormData({ ...formData, bookingTime: slot })}
                            className={`py-2 px-1 text-center rounded-lg text-xs font-mono transition-all cursor-pointer ${
                              formData.bookingTime === slot
                                ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-900/60'
                                : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 border border-slate-800/80'
                            }`}
                          >
                            {slot.replace(' IST', '')}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Selected: <strong className="text-emerald-400">{formData.bookingTime}</strong> on {formData.bookingDate}
                      </p>
                    </div>

                    {/* Commitment Toggle */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                      <span className="block text-xs font-semibold text-white">
                        Are you willing to invest in end-to-end interview clearing support if an offer is guaranteed? *
                      </span>
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, willingToInvest: 'Yes' })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                            formData.willingToInvest === 'Yes'
                              ? 'bg-emerald-600/25 text-emerald-300 border-emerald-500/70'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                          }`}
                        >
                          <Check className="h-3 w-3" />
                          <span>Yes, I am serious</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, willingToInvest: 'No' })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                            formData.willingToInvest === 'No'
                              ? 'bg-amber-600/20 text-amber-300 border-amber-500/50'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                          }`}
                        >
                          <span>Exploring for now</span>
                        </button>
                      </div>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-emerald-500 hover:from-indigo-500 hover:to-emerald-400 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Securing Your Slot...</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          <span>Confirm Free 15-Minute Strategy Call &rarr;</span>
                        </>
                      )}
                    </button>

                    <p className="text-[11px] text-center text-slate-500">
                      🔒 100% Confidential • We call directly on WhatsApp • Zero spam
                    </p>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Dedicated Section: Documents Managing for Smooth Onboarding */}
      <section className="py-16 sm:py-20 bg-slate-950 border-b border-slate-800/80 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold mb-3">
              <FileCheck2 className="h-4 w-4 text-emerald-400" />
              <span>Zero-Anxiety Employment Transition</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Documents Managing for Smooth Onboarding
            </h2>
            <p className="mt-3 text-xs sm:text-sm text-slate-400 leading-relaxed">
              Clearing the technical panel is only half the battle. Switching companies requires rigorous Background Verification (BGV), relieving letters, and compliant paperwork. We assist you end-to-end for a smooth onboarding experience.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Feature 1 */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/30 transition-all">
              <div className="h-9 w-9 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center mb-3.5">
                <FileText className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1.5">BGV Compliance Preparation</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Pre-audit of past employment documentation, PF/UAN service history alignment, and reference structuring to breeze through enterprise background checks.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-emerald-500/30 transition-all">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center mb-3.5">
                <BadgeCheck className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1.5">Smooth Exit & Relieving</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Strategic advice on resignation communication, official notice period negotiations, buyout structuring, and clean relieving letter handovers.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-sky-500/30 transition-all">
              <div className="h-9 w-9 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center mb-3.5">
                <TrendingUp className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1.5">Offer Letter Analysis</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Comprehensive clause analysis of fixed base, variable components, joining bonuses, and non-compete agreements to ensure you maximize your package.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-purple-500/30 transition-all">
              <div className="h-9 w-9 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center mb-3.5">
                <Shield className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1.5">Day-1 Corporate Transition</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Post-joining transition mentorship covering your first 30 days, tech stack acclimatization, and sprint cadence to ensure you succeed in your new role.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison: The Old Way vs The CareerForge Engine */}
      <section className="py-16 bg-slate-950/70 border-b border-slate-800/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Why Engineers Stay Underpaid
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-2">
              The traditional job hunt is rigged with recruiter filters and arbitrary compensation caps. Here is how we change the equation:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* The Old Way */}
            <div className="p-6 rounded-2xl bg-red-950/15 border border-red-900/30 space-y-4">
              <div className="flex items-center gap-2 text-red-400 text-sm font-bold uppercase tracking-wider">
                <span>The Traditional Struggle</span>
              </div>
              <ul className="space-y-3 text-xs text-slate-300">
                <li className="flex items-start gap-2.5">
                  <span className="text-red-400 font-bold shrink-0">✕</span>
                  <span>Applying blindly to hundreds of job boards with low callback rates.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-red-400 font-bold shrink-0">✕</span>
                  <span>Getting screened out by automated ATS parsers due to formatting nuances.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-red-400 font-bold shrink-0">✕</span>
                  <span>Accepting standard 20%-30% lowball hikes anchored to past payslips.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-red-400 font-bold shrink-0">✕</span>
                  <span>Navigating complex notice periods and stressful BGV paperwork alone.</span>
                </li>
              </ul>
            </div>

            {/* The CareerForge Way */}
            <div className="p-6 rounded-2xl bg-emerald-950/20 border border-emerald-500/40 space-y-4 shadow-lg shadow-emerald-950/20">
              <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold uppercase tracking-wider">
                <CheckCircle2 className="h-4 w-4" />
                <span>The CareerForge Clearance Engine</span>
              </div>
              <ul className="space-y-3 text-xs text-slate-200">
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Direct 1-on-1 interview drills with senior mentors clearing L1 to Bar-Raiser rounds.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>ATS resume re-engineered by developers with high-density project metrics.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Higher salary package and senior role unlocked by negotiating multiple competing bids.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Full documents managing & BGV transition support for a zero-stress onboarding.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section className="py-16 sm:py-20 bg-slate-950 border-b border-slate-800/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Frequently Asked Questions
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-2">
              Everything you need to know before locking your 15-minute diagnostic call.
            </p>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={faq.q}
                  className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/40"
                  >
                    <span className="text-sm font-bold text-white">{faq.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 text-indigo-400 shrink-0 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-5 sm:px-5 sm:pb-5 text-xs text-slate-300 leading-relaxed border-t border-slate-800/60 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final Call to Action */}
      <section className="py-16 bg-gradient-to-b from-slate-950 to-slate-900 text-center relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 p-0.5 shadow-xl shadow-indigo-600/30 mb-4">
            <div className="h-full w-full bg-slate-950 rounded-2xl flex items-center justify-center">
              <Briefcase className="h-6 w-6 text-emerald-400" />
            </div>
          </div>

          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            Ready to Level Up Your Engineering Career?
          </h2>
          <p className="mt-3 text-xs sm:text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
            Reserve your free 15-minute strategy call today. We&apos;ll evaluate your current skills, outline your next level-up path, and walk you through our clearance & document managing roadmap.
          </p>

          <div className="mt-7">
            <a
              href="#book-slot"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-emerald-500 hover:from-indigo-500 hover:to-emerald-400 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 transition-all cursor-pointer"
            >
              <span>Book Your Free 15-Minute Strategy Call</span>
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <p className="text-[11px] text-slate-500 mt-4">
            Direct 1-on-1 WhatsApp Call • No sales pitches • 100% Confidential
          </p>
        </div>
      </section>
    </div>
  );
}
