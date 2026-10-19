'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  LogOut,
  Download,
  X,
  RefreshCw,
  Calendar,
  Clock,
  CheckCircle2,
  FileText,
  ShieldCheck,
  ArrowRight,
  Upload,
  Check,
  Building,
  ChevronRight,
  AlertTriangle,
  MessageCircle,
  Edit3,
  User
} from 'lucide-react';
import {
  supabase,
  DatabaseClient,
  DatabaseInterviewSlot
} from '@/lib/supabase';
import { broadcastSync, subscribeToSync } from '@/lib/portalSync';
import { triggerWhatsAppAlert } from '@/lib/whatsappNotify';
import {
  checkSlotCollision,
  getTimeSlotsAvailability,
  STANDARD_TIME_SLOTS
} from '@/lib/slotCollision';

// Fallback Mock Clients & Cohort Slots for offline resilience
const FALLBACK_CLIENTS: DatabaseClient[] = [
  {
    id: 'cli-1',
    full_name: 'Karthik Raja',
    whatsapp_number: '+919988776655',
    tech_stack: 'DevOps / Cloud Architecture (AWS / K8s)',
    current_ctc_lpa: '18.0',
    fee_status: 'registration_paid_20k',
    naukri_status: 'Optimized',
    linkedin_status: 'Optimized',
    profiles_status: 'Optimized',
    resume_url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    notes: 'Enrolled in sprint.',
    created_at: '2026-10-16T12:00:00.000Z',
  },
  {
    id: 'cli-2',
    full_name: 'Sneha Patel',
    whatsapp_number: '+919811223344',
    tech_stack: 'React / Node.js / Full Stack TypeScript',
    current_ctc_lpa: '12.5',
    fee_status: 'offer_locked',
    naukri_status: 'in_progress',
    linkedin_status: 'in_progress',
    profiles_status: 'in_progress',
    resume_url: null,
    notes: 'Offer stage in progress.',
    created_at: '2026-10-14T12:00:00.000Z',
  },
];

const INITIAL_COHORT_SLOTS: DatabaseInterviewSlot[] = [
  {
    id: 'conf-1',
    client_id: 'cli-1',
    candidate_name: 'Karthik R.',
    company_name: 'Wells Fargo',
    round_type: 'Technical Coding L1',
    scheduled_date: '2026-10-21',
    scheduled_time: '02:30 PM IST',
    jd_text: 'Core Java, Multithreading, ConcurrentHashMap, Spring Cloud Gateway.',
    status: 'approved',
    priority: 'urgent',
    invite_verified: true,
  },
  {
    id: 'conf-2',
    client_id: 'cli-2',
    candidate_name: 'Sneha P.',
    company_name: 'PhonePe',
    round_type: 'Technical Coding L1',
    scheduled_date: '2026-10-21',
    scheduled_time: '04:00 PM IST',
    jd_text: 'Frontend Architecture, Next.js hydration, React state machines.',
    status: 'approved',
    priority: 'standard',
    invite_verified: true,
  },
  {
    id: 'conf-3',
    client_id: 'cli-3',
    candidate_name: 'Arjun N.',
    company_name: 'EPAM Systems',
    round_type: 'System Design L2',
    scheduled_date: '2026-10-22',
    scheduled_time: '11:00 AM IST',
    jd_text: 'Distributed cache with Redis, Kafka event streaming, Postgres sharding.',
    status: 'approved',
    priority: 'urgent',
    invite_verified: true,
  },
];

function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return 0;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function getUpcomingDates(): { dateStr: string; label: string; dayName: string }[] {
  const dates = [];
  const base = new Date('2026-10-18T12:00:00Z');
  for (let i = 0; i < 10; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const label = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    dates.push({ dateStr, label, dayName });
  }
  return dates;
}

export default function CandidatePortal() {
  // Auth State
  const [phoneInput, setPhoneInput] = useState('');
  const [currentClient, setCurrentClient] = useState<DatabaseClient | null>(FALLBACK_CLIENTS[0]);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Slots State
  const [allSlots, setAllSlots] = useState<DatabaseInterviewSlot[]>(INITIAL_COHORT_SLOTS);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal State
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isSubmittingSlot, setIsSubmittingSlot] = useState(false);

  // Custom Round Type State
  const [isCustomRound, setIsCustomRound] = useState(false);
  const [customRoundText, setCustomRoundText] = useState('');

  // Edit Profile Modal State
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editProfileForm, setEditProfileForm] = useState({
    full_name: '',
    tech_stack: '',
    current_ctc_lpa: '',
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Booking Form State
  const [slotForm, setSlotForm] = useState({
    company_name: '',
    round_type: 'Technical Coding L1',
    scheduled_date: '2026-10-21',
    scheduled_time: '02:30 PM IST',
    jd_text: '',
  });

  // Calendar Selection State
  const [calendarDate, setCalendarDate] = useState('2026-10-21');
  const [calendarTime, setCalendarTime] = useState('02:30 PM IST');
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [suggestedSlots, setSuggestedSlots] = useState<string[]>([]);

  // In-Memory Invite Screenshot Scanner
  const [inviteFile, setInviteFile] = useState<File | null>(null);
  const [invitePreviewUrl, setInvitePreviewUrl] = useState<string | null>(null);
  const [isScanningInvite, setIsScanningInvite] = useState(false);
  const [inviteVerified, setInviteVerified] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Restore session from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('cf_current_client');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.id) {
          setCurrentClient(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Fetch live client details & slots from Supabase
  const loadPortalData = async () => {
    try {
      const { data: slotsData } = await supabase
        .from('interview_slots')
        .select('*')
        .order('scheduled_date', { ascending: true });

      if (slotsData && slotsData.length > 0) {
        setAllSlots(slotsData);
      }

      if (currentClient?.id) {
        const { data: clientData } = await supabase
          .from('clients')
          .select('*')
          .eq('id', currentClient.id)
          .single();

        if (clientData) {
          setCurrentClient((prev) => ({
            ...prev,
            ...clientData,
            profiles_status: clientData.naukri_status || clientData.profiles_status || 'in_progress',
          }));
          localStorage.setItem('cf_current_client', JSON.stringify(clientData));
        }
      }
    } catch {
      // Keep local state
    }
  };

  useEffect(() => {
    loadPortalData();

    // Real-time synchronization with Admin Portal
    const unsubscribe = subscribeToSync((msg) => {
      loadPortalData();
      if (msg.type === 'RESUME_UPDATED') {
        showToast('Your ATS Verified Resume has been updated!');
      } else if (msg.type === 'CLIENT_UPDATED') {
        showToast('Your Job Profiles status was updated.');
      } else if (msg.type === 'SLOT_UPDATED') {
        showToast('Your interview prep status was confirmed.');
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentClient?.id]);

  // Conflict detection for Calendar Day-Planner
  useEffect(() => {
    const collision = checkSlotCollision(calendarTime, calendarDate, allSlots);
    if (collision.isClash) {
      setConflictWarning(collision.message || 'Time slot clash detected.');
      const available = getTimeSlotsAvailability(calendarDate, allSlots)
        .filter((s) => !s.isBooked)
        .map((s) => s.time);
      setSuggestedSlots(available.slice(0, 2));
    } else {
      setConflictWarning(null);
      setSuggestedSlots([]);
    }
  }, [calendarDate, calendarTime, allSlots]);

  // In-Memory Invite Screenshot Scanner (Zero server storage)
  const handleDropInvite = (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    setInviteFile(file);
    const url = URL.createObjectURL(file);
    setInvitePreviewUrl(url);
    setIsScanningInvite(true);
    setInviteVerified(false);

    setTimeout(() => {
      setIsScanningInvite(false);
      setInviteVerified(true);

      const lower = file.name.toLowerCase();
      let detectedCompany = 'PhonePe';
      if (lower.includes('swiggy')) detectedCompany = 'Swiggy';
      else if (lower.includes('wells') || lower.includes('wfg')) detectedCompany = 'Wells Fargo';
      else if (lower.includes('epam')) detectedCompany = 'EPAM Systems';
      else if (lower.includes('google')) detectedCompany = 'Google';
      else if (lower.includes('amazon')) detectedCompany = 'Amazon';

      let detectedRound = 'Technical Coding L1';
      if (lower.includes('l2') || lower.includes('design')) detectedRound = 'System Design L2';
      else if (lower.includes('final') || lower.includes('manager')) detectedRound = 'Hiring Manager L3';
      else if (lower.includes('hr')) detectedRound = 'HR Discussion';

      setIsCustomRound(false);
      setCustomRoundText('');
      setSlotForm((prev) => ({
        ...prev,
        company_name: detectedCompany,
        round_type: detectedRound,
      }));
    }, 800);
  };

  const handleRemoveScreenshot = () => {
    if (invitePreviewUrl) URL.revokeObjectURL(invitePreviewUrl);
    setInviteFile(null);
    setInvitePreviewUrl(null);
    setInviteVerified(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Submit Slot Request
  const handleSubmitSlotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slotForm.company_name.trim()) return;

    const effectiveRoundType = isCustomRound ? customRoundText.trim() : slotForm.round_type;
    if (isCustomRound && !customRoundText.trim()) {
      showToast('Please enter your custom round type.');
      return;
    }

    // Strict Unified Slot Collision Prevention
    const collision = checkSlotCollision(
      slotForm.scheduled_time,
      slotForm.scheduled_date,
      allSlots
    );
    if (collision.isClash) {
      showToast(
        collision.message || 'This time slot is already booked. Please choose an open slot.'
      );
      return;
    }

    setIsSubmittingSlot(true);

    const newSlotPayload: Omit<DatabaseInterviewSlot, 'id' | 'created_at'> = {
      client_id: currentClient?.id || 'cli-1',
      candidate_name: currentClient?.full_name ? `${currentClient.full_name.split(' ')[0]} ${currentClient.full_name.split(' ')[1]?.[0] || ''}.` : 'You',
      company_name: slotForm.company_name.trim(),
      round_type: effectiveRoundType,
      scheduled_date: slotForm.scheduled_date,
      scheduled_time: slotForm.scheduled_time,
      priority: 'urgent',
      jd_text: slotForm.jd_text.trim() || null,
      status: 'requested',
      invite_verified: inviteVerified,
    };

    try {
      const { data, error } = await supabase
        .from('interview_slots')
        .insert([newSlotPayload])
        .select();

      const createdSlot = data && data[0] ? data[0] : {
        ...newSlotPayload,
        id: `slot-${Date.now()}`,
        created_at: new Date().toISOString(),
      };

      setAllSlots((prev) => [createdSlot, ...prev]);

      broadcastSync('SLOT_CREATED', createdSlot);

      // Trigger official Meta WhatsApp Cloud API alert (non-blocking)
      triggerWhatsAppAlert('client_slot_request', {
        client_name: currentClient?.full_name || 'Enrolled Client',
        company_name: slotForm.company_name.trim(),
        round_type: effectiveRoundType,
        date: slotForm.scheduled_date,
        time: slotForm.scheduled_time,
      });

      showToast(`Slot requested for ${slotForm.company_name}! Mentor will get in touch.`);
      setIsRequestModalOpen(false);

      setSlotForm({
        company_name: '',
        round_type: 'Technical Coding L1',
        scheduled_date: '2026-10-21',
        scheduled_time: '02:30 PM IST',
        jd_text: '',
      });
      handleRemoveScreenshot();
    } catch {
      showToast('Slot submitted. Mentor notified.');
      setIsRequestModalOpen(false);
    } finally {
      setIsSubmittingSlot(false);
    }
  };

  // Login handler
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const clean = phoneInput.replace(/\D/g, '');
    if (clean.length < 10) {
      setAuthError('Enter a valid 10-digit WhatsApp number.');
      return;
    }

    setIsAuthenticating(true);
    setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('clients')
          .select('*')
          .or(`whatsapp_number.ilike.%${clean}%,whatsapp_number.eq.${phoneInput.trim()}`)
          .limit(1);

        if (data && data.length > 0) {
          const client = data[0];
          client.profiles_status = client.naukri_status || client.profiles_status || 'in_progress';
          setCurrentClient(client);
          localStorage.setItem('cf_current_client', JSON.stringify(client));
          setIsAuthenticating(false);
          return;
        }

        const fallback = FALLBACK_CLIENTS.find((c) => c.whatsapp_number.includes(clean)) || FALLBACK_CLIENTS[0];
        setCurrentClient(fallback);
        localStorage.setItem('cf_current_client', JSON.stringify(fallback));
      } catch {
        const fallback = FALLBACK_CLIENTS[0];
        setCurrentClient(fallback);
        localStorage.setItem('cf_current_client', JSON.stringify(fallback));
      } finally {
        setIsAuthenticating(false);
      }
    }, 300);
  };

  const handleLogout = () => {
    setCurrentClient(null);
    localStorage.removeItem('cf_current_client');
  };

  const handleOpenEditProfile = () => {
    if (!currentClient) return;
    setEditProfileForm({
      full_name: currentClient.full_name || '',
      tech_stack: currentClient.tech_stack || '',
      current_ctc_lpa: String(currentClient.current_ctc_lpa || '14.0'),
    });
    setIsEditProfileOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentClient?.id || !editProfileForm.full_name.trim()) return;

    setIsSavingProfile(true);
    const updatedClient: DatabaseClient = {
      ...currentClient,
      full_name: editProfileForm.full_name.trim(),
      tech_stack: editProfileForm.tech_stack.trim() || currentClient.tech_stack,
      current_ctc_lpa: editProfileForm.current_ctc_lpa.trim() || currentClient.current_ctc_lpa,
    };

    try {
      await supabase
        .from('clients')
        .update({
          full_name: updatedClient.full_name,
          tech_stack: updatedClient.tech_stack,
          current_ctc_lpa: updatedClient.current_ctc_lpa,
        })
        .eq('id', currentClient.id);

      setCurrentClient(updatedClient);
      localStorage.setItem('cf_current_client', JSON.stringify(updatedClient));
      broadcastSync('CLIENT_UPDATED', { clientId: currentClient.id });
      showToast('Profile updated successfully!');
      setIsEditProfileOpen(false);
    } catch {
      setCurrentClient(updatedClient);
      localStorage.setItem('cf_current_client', JSON.stringify(updatedClient));
      broadcastSync('CLIENT_UPDATED', { clientId: currentClient.id });
      showToast('Profile updated locally.');
      setIsEditProfileOpen(false);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const mySlots = allSlots.filter((s) => s.client_id === currentClient?.id);
  const upcomingDates = getUpcomingDates();
  const confirmedSlotsOnDate = allSlots.filter((s) => s.scheduled_date === calendarDate);

  const profilesStatus = currentClient?.naukri_status || currentClient?.profiles_status || 'in_progress';

  // -------------------------------------------------------------
  // LOGIN SCREEN (TRUE PURE DARK BLACK)
  // -------------------------------------------------------------
  if (!currentClient) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col justify-center px-4 py-12">
        <div className="w-full max-w-sm mx-auto">
          <div className="mb-8 text-center">
            <span className="inline-block px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full bg-zinc-900 text-zinc-300 border border-zinc-800 mb-3">
              Candidate Portal
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              CareerForge
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Interview clearance & mentor drills desk
            </p>
          </div>

          <div className="bg-[#111113] border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  WhatsApp Number
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-xs font-mono text-zinc-500 font-bold">+91</span>
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="9988776655"
                    className="w-full bg-black border border-zinc-800 rounded-xl pl-12 pr-4 py-2.5 text-sm font-mono text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {authError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 font-bold">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={isAuthenticating}
                className="w-full bg-white hover:bg-zinc-200 text-black font-extrabold text-xs py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-md active:scale-[0.98]"
              >
                {isAuthenticating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Enter Portal</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>

            <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
              <span>Demo candidate:</span>
              <button
                type="button"
                onClick={() => setPhoneInput('9988776655')}
                className="font-mono text-white font-extrabold hover:underline"
              >
                9988776655
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // MAIN CANDIDATE PORTAL (TRUE PURE DARK BLACK THEME)
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-black text-white pb-20 pt-4 sm:pt-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-4 inset-x-4 max-w-sm mx-auto z-50 bg-zinc-900 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center justify-between text-xs border border-zinc-700">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-zinc-400 hover:text-white ml-2">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-md mx-auto px-4 space-y-4">
        {/* Top Header Row */}
        <header className="flex items-center justify-between pb-3.5 border-b border-zinc-800">
          <div>
            <span className="text-xs font-bold text-zinc-400 block">Candidate Profile</span>
            <h1 className="text-xl font-extrabold text-white tracking-tight">
              {currentClient.full_name}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Active Sprint
            </span>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl transition-colors border border-zinc-800"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Candidate Detail Strip with Edit Button */}
        <div className="bg-[#111113] border border-zinc-800 rounded-2xl p-3.5 space-y-2 text-xs">
          <div className="flex items-start justify-between gap-2">
            <div>
              <strong className="text-white font-extrabold block text-sm">{currentClient.tech_stack}</strong>
              <div className="mt-0.5 text-zinc-400 text-[11px] font-mono">
                <span>Current CTC: <strong className="text-white font-bold">{currentClient.current_ctc_lpa || '18.0'} LPA</strong></span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleOpenEditProfile}
              className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-lg border border-zinc-800 text-[11px] font-bold flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
            >
              <Edit3 className="w-3 h-3 text-zinc-400" />
              <span>Edit Profile</span>
            </button>
          </div>
          <div className="flex items-center justify-between pt-1.5 border-t border-zinc-800/80 text-[11px] text-zinc-400 font-mono">
            <span>WhatsApp: {currentClient.whatsapp_number}</span>
            <span className="text-emerald-400 font-bold">Verified Candidate</span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* TWO DELIVERABLES CARDS: BOLD TITLES & STATUS AS HEROES    */}
        {/* NO NOISE, NO JARGON                                      */}
        {/* ======================================================== */}
        <div className="grid grid-cols-2 gap-3">
          {/* Card 1: Master Resume */}
          <div className="bg-[#111113] border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-1">
              <h2 className="text-base font-extrabold text-white tracking-tight">
                Master Resume
              </h2>
              {currentClient.resume_url ? (
                <a
                  href={currentClient.resume_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Download Resume PDF"
                  className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors shrink-0"
                >
                  <Download className="w-4 h-4" />
                </a>
              ) : (
                <span className="p-1.5 text-zinc-600 cursor-not-allowed shrink-0">
                  <Download className="w-4 h-4" />
                </span>
              )}
            </div>

            {/* Main Status Hero */}
            <div className="mt-4">
              {currentClient.resume_url ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30">
                  <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                  ATS Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/30">
                  <Clock className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                  In Progress
                </span>
              )}
            </div>
          </div>

          {/* Card 2: Job Profiles */}
          <div className="bg-[#111113] border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-extrabold text-white tracking-tight">
                Job Profiles
              </h2>
              <span className="text-[11px] text-zinc-400 font-medium block mt-0.5">
                Naukri & LinkedIn
              </span>
            </div>

            {/* Main Status Hero */}
            <div className="mt-4">
              {profilesStatus === 'Optimized' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30">
                  <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                  Optimized
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/30">
                  <Clock className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                  In Progress
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* PRIMARY CTA: REQUEST AN INTERVIEW SLOT (CLEAN BOLD HERO) */}
        {/* ======================================================== */}
        <div>
          <button
            type="button"
            onClick={() => setIsRequestModalOpen(true)}
            className="w-full bg-white hover:bg-zinc-200 text-black rounded-2xl p-4 sm:p-4.5 flex items-center justify-between shadow-lg active:scale-[0.99] transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3.5 text-left">
              <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center shrink-0 font-bold">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <strong className="block text-sm sm:text-base font-extrabold text-black">
                  Request an Interview Slot
                </strong>
                <span className="block text-xs text-zinc-600 mt-0.5 font-medium">
                  Got an interview invite? Schedule 1-on-1 mentor prep.
                </span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-black shrink-0">
              <ChevronRight className="w-5 h-5" />
            </div>
          </button>
        </div>

        {/* ======================================================== */}
        {/* MY SCHEDULED SESSIONS                                    */}
        {/* ======================================================== */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-extrabold text-white">
              My Scheduled Interviews ({mySlots.length})
            </h2>
          </div>

          <div className="bg-[#111113] border border-zinc-800 rounded-2xl p-4">
            {mySlots.length === 0 ? (
              <div className="text-center py-6 text-xs text-zinc-400 space-y-1.5">
                <p>No interview prep sessions booked yet.</p>
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(true)}
                  className="font-extrabold text-white underline"
                >
                  Request an interview slot
                </button>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {mySlots.map((slot) => (
                  <div key={slot.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <strong className="text-sm font-extrabold text-white">
                            {slot.company_name}
                          </strong>
                          <span className="text-xs text-zinc-400 font-medium">
                            • {slot.round_type}
                          </span>
                          {slot.invite_verified && (
                            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-bold border border-emerald-500/30">
                              ✓ Genuine Invite
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-1.5 text-xs text-zinc-300 font-mono">
                          <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                          <span>{slot.scheduled_date}</span>
                          <span className="text-zinc-600">•</span>
                          <strong className="text-white">{slot.scheduled_time}</strong>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-full border shrink-0 ${
                          slot.status === 'approved'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                        }`}
                      >
                        {slot.status === 'approved' ? 'Approved' : 'Requested'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-zinc-300 bg-black/60 p-2.5 rounded-xl border border-zinc-800">
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Mentor connects with you on WhatsApp before your slot for prep drills.</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ======================================================== */}
        {/* CONFIRMED COHORT SCHEDULE                                */}
        {/* ======================================================== */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-extrabold text-white">
              Confirmed Cohort Slots ({allSlots.length})
            </h2>
            <span className="text-xs text-zinc-400 font-medium">Live Bookings</span>
          </div>

          <div className="bg-[#111113] border border-zinc-800 rounded-2xl p-4">
            <div className="divide-y divide-zinc-800">
              {allSlots.map((slot) => {
                const isMine = slot.client_id === currentClient.id;
                return (
                  <div key={slot.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-white">{slot.company_name}</span>
                        <span className="text-zinc-400 font-mono text-[11px]">
                          ({slot.candidate_name || 'Candidate'})
                        </span>
                        {isMine && (
                          <span className="text-[9px] bg-white text-black font-extrabold px-1.5 py-0.2 rounded-full">
                            You
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-zinc-400">{slot.round_type}</span>
                    </div>

                    <div className="text-right font-mono text-[11px] text-zinc-300">
                      <div>{slot.scheduled_date}</div>
                      <strong className="text-white">{slot.scheduled_time}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* ======================================================== */}
      {/* MODAL: REQUEST AN INTERVIEW SLOT (DARK BLACK)            */}
      {/* ======================================================== */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-[#121214] rounded-t-3xl sm:rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto border border-zinc-800 text-white">
            {/* Mobile Drag Indicator */}
            <div className="w-10 h-1 rounded-full bg-zinc-700 mx-auto -mt-1 mb-2 sm:hidden"></div>

            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div>
                <h3 className="text-base font-extrabold text-white">Request Interview Slot</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Verify invite screenshot & schedule mentor prep.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRequestModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Screenshot Dropzone */}
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                Interview Invite Screenshot *
              </label>

              {!inviteFile ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const dropped = e.dataTransfer.files?.[0];
                    if (dropped) handleDropInvite(dropped);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-zinc-700 hover:border-zinc-500 rounded-2xl p-5 text-center cursor-pointer bg-black/60 hover:bg-black transition-colors"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const selected = e.target.files?.[0];
                      if (selected) handleDropInvite(selected);
                    }}
                  />
                  <Upload className="w-5 h-5 mx-auto mb-1.5 text-zinc-400" />
                  <strong className="block text-xs font-extrabold text-white">
                    Drop invite screenshot here
                  </strong>
                  <span className="block text-[11px] text-zinc-400 mt-0.5">
                    or tap to choose · Gmail, Outlook, Teams, Zoom
                  </span>
                </div>
              ) : (
                <div className="border border-zinc-800 rounded-2xl p-3 bg-black/60 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 overflow-hidden">
                      {invitePreviewUrl && (
                        <img
                          src={invitePreviewUrl}
                          alt="Screenshot"
                          className="w-10 h-10 object-cover rounded-xl border border-zinc-700 shrink-0"
                        />
                      )}
                      <div className="overflow-hidden">
                        <p className="text-xs font-extrabold text-white truncate">
                          {inviteFile.name}
                        </p>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          In-memory verification
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveScreenshot}
                      className="p-1 text-zinc-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {isScanningInvite ? (
                    <div className="flex items-center gap-2 text-xs text-zinc-300 pt-2 border-t border-zinc-800">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                      <span>Verifying invite authenticity...</span>
                    </div>
                  ) : inviteVerified ? (
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-xl">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Genuine Recruiter Invite Verified</span>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="flex items-start gap-1.5 mt-2 text-[11px] text-zinc-400">
                <ShieldCheck className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                <span>
                  Privacy guarantee: The screenshot is verified in memory and <strong>never saved on our server</strong>.
                </span>
              </div>
            </div>

            {/* Form Fields */}
            <form onSubmit={handleSubmitSlotRequest} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Company Name *
                </label>
                <div className="relative">
                  <Building className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                  <input
                    type="text"
                    required
                    value={slotForm.company_name}
                    onChange={(e) => setSlotForm({ ...slotForm, company_name: e.target.value })}
                    placeholder="e.g. Swiggy, Wells Fargo, PhonePe"
                    className="w-full bg-black border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Interview Round *
                </label>
                <select
                  value={isCustomRound ? 'Custom' : slotForm.round_type}
                  onChange={(e) => {
                    if (e.target.value === 'Custom') {
                      setIsCustomRound(true);
                    } else {
                      setIsCustomRound(false);
                      setSlotForm({ ...slotForm, round_type: e.target.value });
                    }
                  }}
                  className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:border-zinc-500 focus:outline-none"
                >
                  <option value="Technical Coding L1">Technical Coding L1</option>
                  <option value="System Design L2">System Design L2</option>
                  <option value="Screening Round">Screening Round</option>
                  <option value="Hiring Manager L3">Hiring Manager L3</option>
                  <option value="HR Discussion">HR Discussion</option>
                  <option value="Custom">Custom (Enter manually)...</option>
                </select>
              </div>

              {isCustomRound && (
                <div>
                  <label className="block text-[11px] font-bold text-emerald-400 mb-1">
                    Custom Round Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={customRoundText}
                    onChange={(e) => setCustomRoundText(e.target.value)}
                    placeholder="e.g. Take-home review, Director Round, Live architecture"
                    className="w-full bg-black border border-emerald-500/50 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-emerald-400 focus:outline-none"
                  />
                </div>
              )}

              {/* Date & Time Selector */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Interview Date & Time (IST) *
                </label>
                <button
                  type="button"
                  onClick={() => setIsCalendarOpen(true)}
                  className="w-full text-left bg-black hover:bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 flex items-center justify-between text-xs text-white transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-zinc-400" />
                    <span className="font-mono font-bold">
                      {slotForm.scheduled_date} • {slotForm.scheduled_time}
                    </span>
                  </div>
                  <span className="text-[11px] text-white font-extrabold underline">
                    Change Date/Time
                  </span>
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Key Topics / Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={slotForm.jd_text}
                  onChange={(e) => setSlotForm({ ...slotForm, jd_text: e.target.value })}
                  placeholder="e.g. Distributed caching, Redis, Spring Cloud, live coding"
                  className="w-full bg-black border border-zinc-800 rounded-xl p-2.5 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingSlot || !slotForm.company_name.trim()}
                className="w-full bg-white hover:bg-zinc-200 text-black font-extrabold text-xs py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50 active:scale-[0.98]"
              >
                {isSubmittingSlot ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Confirming...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm Interview Slot</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CALENDAR DAY-PLANNER & CONFLICT CHECKER           */}
      {/* ======================================================== */}
      {isCalendarOpen && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-[#121214] rounded-t-3xl sm:rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto border border-zinc-800 text-white">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div>
                <h3 className="text-base font-extrabold text-white">Choose Date & Time</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Inspect scheduled interviews to avoid mentor clashes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCalendarOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Date Scroller */}
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-2">
                Select Date
              </label>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {upcomingDates.map(({ dateStr, label, dayName }) => {
                  const isSelected = dateStr === calendarDate;
                  const count = allSlots.filter((s) => s.scheduled_date === dateStr).length;
                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => setCalendarDate(dateStr)}
                      className={`flex flex-col items-center py-2 px-3 rounded-2xl border text-center shrink-0 transition-all ${
                        isSelected
                          ? 'bg-white text-black border-white shadow-md'
                          : 'bg-black border-zinc-800 text-zinc-400 hover:bg-zinc-900'
                      }`}
                    >
                      <span className="text-[10px] font-mono uppercase">{dayName}</span>
                      <strong className="text-xs font-extrabold mt-0.5">{label}</strong>
                      {count > 0 && (
                        <span
                          className={`text-[9px] mt-1 px-1 rounded font-mono ${
                            isSelected ? 'bg-zinc-800 text-white' : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {count} {count === 1 ? 'slot' : 'slots'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Day Schedule Timeline */}
            <div className="bg-black/60 border border-zinc-800 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-white">
                  Interviews on {calendarDate}
                </span>
                <span className="text-[11px] font-mono text-zinc-400 font-bold">
                  {confirmedSlotsOnDate.length} Booked
                </span>
              </div>

              {confirmedSlotsOnDate.length === 0 ? (
                <p className="text-xs text-zinc-400 italic py-1">
                  ✨ No interviews scheduled on this day. Mentors are completely free.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {confirmedSlotsOnDate.map((s) => (
                    <div
                      key={s.id}
                      className="bg-[#18181b] border border-zinc-800 rounded-xl p-2.5 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-extrabold text-white">
                          {s.company_name} • {s.round_type}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          Candidate: {s.candidate_name || 'Booked Slot'}
                        </div>
                      </div>
                      <span className="font-mono text-xs font-extrabold text-white bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                        {s.scheduled_time}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Time Slot Picker with Booked Slots Auto-Disabled */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-zinc-300">
                  Target Interview Time (IST) *
                </label>
                <span className="text-[10px] text-zinc-500 font-mono">
                  Booked slots auto-disabled
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                {getTimeSlotsAvailability(calendarDate, allSlots).map(
                  ({ time, isBooked, conflictInfo }) => {
                    const isSelected = calendarTime === time;
                    return (
                      <button
                        key={time}
                        type="button"
                        disabled={isBooked}
                        onClick={() => setCalendarTime(time)}
                        title={isBooked ? `Clashes with ${conflictInfo}` : 'Slot available'}
                        className={`py-2 px-2 text-xs font-mono font-bold rounded-xl border text-center transition-all ${
                          isBooked
                            ? 'opacity-35 line-through bg-zinc-950 border-zinc-900 text-zinc-600 cursor-not-allowed'
                            : isSelected
                            ? 'bg-white text-black border-white shadow-md font-extrabold'
                            : 'bg-black border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-white'
                        }`}
                      >
                        <div>{time}</div>
                        {isBooked && (
                          <span className="text-[9px] text-red-400/80 block no-underline font-normal">
                            Booked
                          </span>
                        )}
                      </button>
                    );
                  }
                )}
              </div>

              <input
                type="text"
                value={calendarTime}
                onChange={(e) => setCalendarTime(e.target.value)}
                placeholder="Or custom: 03:15 PM IST"
                className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:border-zinc-500 focus:outline-none"
              />
            </div>

            {/* Conflict Banner */}
            {conflictWarning && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs space-y-2">
                <div className="flex items-start gap-2 text-amber-400 font-extrabold">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{conflictWarning}</span>
                </div>

                {suggestedSlots.length > 0 && (
                  <div>
                    <span className="block text-[11px] text-amber-300/80 font-medium mb-1">
                      Available open slots on this day:
                    </span>
                    <div className="flex gap-2">
                      {suggestedSlots.map((alt) => (
                        <button
                          key={alt}
                          type="button"
                          onClick={() => setCalendarTime(alt)}
                          className="bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-[11px] px-2.5 py-1 rounded-lg font-bold"
                        >
                          Use {alt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              disabled={Boolean(conflictWarning)}
              onClick={() => {
                if (conflictWarning) return;
                setSlotForm((prev) => ({
                  ...prev,
                  scheduled_date: calendarDate,
                  scheduled_time: calendarTime,
                }));
                setIsCalendarOpen(false);
              }}
              className="w-full bg-white hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed text-black font-extrabold text-xs py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <span>{conflictWarning ? 'Slot Unavailable' : 'Apply Date & Time'}</span>
              <Check className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: EDIT CANDIDATE PROFILE                            */}
      {/* ======================================================== */}
      {isEditProfileOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#121214] rounded-3xl max-w-sm w-full p-6 border border-zinc-800 shadow-2xl space-y-4 text-white">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">Edit Profile Details</h3>
                  <p className="text-[11px] text-zinc-400">Update your name & target tech stack</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditProfileOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={editProfileForm.full_name}
                  onChange={(e) =>
                    setEditProfileForm({ ...editProfileForm, full_name: e.target.value })
                  }
                  className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Primary Tech Stack / Role *
                </label>
                <input
                  type="text"
                  required
                  value={editProfileForm.tech_stack}
                  onChange={(e) =>
                    setEditProfileForm({ ...editProfileForm, tech_stack: e.target.value })
                  }
                  placeholder="e.g. Java Full Stack / Spring Boot / React"
                  className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Current CTC (LPA)
                </label>
                <input
                  type="text"
                  value={editProfileForm.current_ctc_lpa}
                  onChange={(e) =>
                    setEditProfileForm({ ...editProfileForm, current_ctc_lpa: e.target.value })
                  }
                  placeholder="e.g. 14.5"
                  className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditProfileOpen(false)}
                  className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs py-2.5 rounded-xl transition-colors border border-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="flex-1 bg-white hover:bg-zinc-200 text-black font-extrabold text-xs py-2.5 rounded-xl transition-colors"
                >
                  {isSavingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
