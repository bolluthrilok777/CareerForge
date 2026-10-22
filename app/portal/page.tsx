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
import { parseSlotProof, serializeSlotProof } from '@/lib/inviteProof';
import { getUpcomingDates, getTodayDateStr, DEFAULT_SLOT_TIME, useLiveUpcomingDates } from '@/lib/dates';

// Production Client & Cohort State
const FALLBACK_CLIENTS: DatabaseClient[] = [];
const INITIAL_COHORT_SLOTS: DatabaseInterviewSlot[] = [];

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

export default function CandidatePortal() {
  // Auth State
  const [phoneInput, setPhoneInput] = useState('');
  const [currentClient, setCurrentClient] = useState<DatabaseClient | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Slots State
  const [allSlots, setAllSlots] = useState<DatabaseInterviewSlot[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal State
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
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
    scheduled_date: '',
    scheduled_time: DEFAULT_SLOT_TIME,
    jd_text: '',
  });

  // Edit My Slot (Reschedule) Modal State
  const [editingMySlot, setEditingMySlot] = useState<DatabaseInterviewSlot | null>(null);
  const [editMySlotForm, setEditMySlotForm] = useState({
    company_name: '',
    round_type: 'Technical Coding L1',
    scheduled_date: '',
    scheduled_time: DEFAULT_SLOT_TIME,
    jd_text: '',
  });
  const [isEditMySlotCustomRound, setIsEditMySlotCustomRound] = useState(false);
  const [editMySlotCustomRoundText, setEditMySlotCustomRoundText] = useState('');
  const [isSavingMySlotEdit, setIsSavingMySlotEdit] = useState(false);
  const [editMySlotError, setEditMySlotError] = useState<string | null>(null);

  // Real OCR Recruiter Invite Scanner (24-Hour retention)
  const [inviteFile, setInviteFile] = useState<File | null>(null);
  const [invitePreviewUrl, setInvitePreviewUrl] = useState<string | null>(null);
  const [isScanningInvite, setIsScanningInvite] = useState(false);
  const [inviteVerified, setInviteVerified] = useState<boolean>(false);
  const [ocrData, setOcrData] = useState<{
    preview_data_url?: string;
    uploaded_at?: string;
    expires_at?: string;
    confidence?: number;
    isGenuine?: boolean;
    verificationSignals?: string[];
    meetingLink?: string | null;
  } | null>(null);
  const [scanStatusText, setScanStatusText] = useState<string | null>(null);
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
      const { data: slotsData, error: slotsErr } = await supabase
        .from('interview_slots')
        .select('*, client:clients(*)')
        .order('scheduled_date', { ascending: true });

      if (slotsErr) {
        console.error('Error loading slots:', slotsErr.message);
      } else if (slotsData) {
        setAllSlots(slotsData);
      }

      if (currentClient?.id) {
        const { data: clientData, error: clientErr } = await supabase
          .from('clients')
          .select('*')
          .eq('id', currentClient.id)
          .single();

        if (clientErr) {
          console.error('Error refreshing client:', clientErr.message);
        } else if (clientData) {
          setCurrentClient((prev) => ({
            ...prev,
            ...clientData,
            profiles_status: clientData.naukri_status || clientData.profiles_status || 'in_progress',
          }));
          localStorage.setItem('cf_current_client', JSON.stringify(clientData));
        }
      }
    } catch (err) {
      console.error('Network error loading portal data:', err);
    }
  };

  useEffect(() => {
    loadPortalData();

    // 1. Supabase Postgres Realtime Subscription for cross-device & instant sync
    const realtimeChannel = supabase
      .channel('portal_realtime_interview_slots')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'interview_slots' },
        () => {
          loadPortalData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clients' },
        () => {
          loadPortalData();
        }
      )
      .subscribe();

    // 2. Real-time synchronization with Admin Portal via BroadcastChannel
    const unsubscribe = subscribeToSync((msg) => {
      loadPortalData();
      if (msg.type === 'RESUME_UPDATED') {
        showToast('Your ATS Verified Resume has been updated!');
      } else if (msg.type === 'CLIENT_UPDATED') {
        showToast('Your Job Profiles status was updated.');
      } else if (msg.type === 'SLOT_UPDATED') {
        showToast('Your interview prep status was updated.');
      }
    });

    return () => {
      supabase.removeChannel(realtimeChannel);
      unsubscribe();
    };
  }, [currentClient?.id]);

  // Open Edit/Reschedule My Slot Modal
  const handleOpenEditMySlot = (slot: DatabaseInterviewSlot) => {
    const standardRounds = [
      'Technical Coding L1',
      'System Design L2',
      'Screening Round',
      'Hiring Manager L3',
      'HR Discussion',
    ];
    const isCustom = !standardRounds.includes(slot.round_type);
    setIsEditMySlotCustomRound(isCustom);
    setEditMySlotCustomRoundText(isCustom ? slot.round_type : '');
    setEditMySlotForm({
      company_name: slot.company_name || '',
      round_type: isCustom ? 'Custom' : slot.round_type,
      scheduled_date: slot.scheduled_date || getTodayDateStr(),
      scheduled_time: slot.scheduled_time || DEFAULT_SLOT_TIME,
      jd_text: slot.jd_text || '',
    });
    setEditMySlotError(null);
    setEditingMySlot(slot);
  };

  // Save Edit/Reschedule My Slot (Resets status to 'requested' for Admin Re-Approval)
  const handleSaveMySlotEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMySlot) return;
    setEditMySlotError(null);

    const effectiveRoundType = isEditMySlotCustomRound
      ? editMySlotCustomRoundText.trim()
      : editMySlotForm.round_type;

    if (isEditMySlotCustomRound && !editMySlotCustomRoundText.trim()) {
      setEditMySlotError('Please enter your custom round type name.');
      return;
    }

    // Clash detection against all other slots
    const collision = checkSlotCollision(
      editMySlotForm.scheduled_time,
      editMySlotForm.scheduled_date,
      allSlots,
      editingMySlot.id
    );
    if (collision.isClash) {
      setEditMySlotError(
        collision.message || 'This time slot is already booked. Please choose an open slot.'
      );
      return;
    }

    setIsSavingMySlotEdit(true);
    try {
      const updatePayload = {
        company_name: editMySlotForm.company_name.trim(),
        round_type: effectiveRoundType,
        scheduled_date: editMySlotForm.scheduled_date,
        scheduled_time: editMySlotForm.scheduled_time,
        jd_text: editMySlotForm.jd_text.trim() || null,
        status: 'requested' as const, // Automatically reset for admin approval!
      };

      const { data, error } = await supabase
        .from('interview_slots')
        .update(updatePayload)
        .eq('id', editingMySlot.id)
        .select('*, client:clients(*)');

      if (error) throw new Error(error.message);

      const updatedSlot = data && data[0] ? data[0] : { ...editingMySlot, ...updatePayload };

      setAllSlots((prev) =>
        prev.map((s) => (s.id === editingMySlot.id ? updatedSlot : s))
      );

      broadcastSync('SLOT_UPDATED', { slotId: editingMySlot.id, ...updatePayload });

      // Trigger WhatsApp Alert to Admin
      triggerWhatsAppAlert('client_slot_rescheduled', {
        client_name: currentClient?.full_name || 'Candidate',
        company_name: editMySlotForm.company_name.trim(),
        round_type: effectiveRoundType,
        date: editMySlotForm.scheduled_date,
        time: editMySlotForm.scheduled_time,
      });

      showToast('Interview slot updated! Requested admin re-approval.');
      setEditingMySlot(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not update slot. Please try again.';
      setEditMySlotError(msg);
    } finally {
      setIsSavingMySlotEdit(false);
    }
  };

  // Fast client-side image downscale (max 800px) so upload & OCR complete in ~1 second
  const resizeImageForOcr = async (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const maxDim = 800; // Optimal 800px: crisp text, 3x faster OCR
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              resolve(blob || file);
            },
            'image/jpeg',
            0.8
          );
        } else {
          resolve(file);
        }
      };
      img.onerror = () => resolve(file);
      img.src = objectUrl;
    });
  };

  // Real OCR Recruiter Invite Scanner (Sub-second with warm worker)
  const handleDropInvite = async (file: File) => {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Please select an image file (PNG, JPG, or WEBP).');
      return;
    }
    setInviteFile(file);
    const localUrl = URL.createObjectURL(file);
    setInvitePreviewUrl(localUrl);
    setIsScanningInvite(true);
    setInviteVerified(false);
    setScanStatusText('Scanning screenshot in seconds... ⚡');

    try {
      // Downscale image client-side to ensure instant sub-second OCR
      const optimizedBlob = await resizeImageForOcr(file);
      const formData = new FormData();
      formData.append('file', optimizedBlob, file.name);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch('/api/scan-invite', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const json = await res.json();

      if (json.success && json.isGenuine) {
        setInviteVerified(true);
        setOcrData({
          preview_data_url: json.screenshot_storage?.preview_data_url,
          uploaded_at: json.screenshot_storage?.uploaded_at,
          expires_at: json.screenshot_storage?.expires_at,
          confidence: json.confidence,
          isGenuine: json.isGenuine,
          verificationSignals: json.verificationSignals,
          meetingLink: json.meetingLink,
        });

        // Auto-populate form fields from OCR!
        setSlotForm((prev) => ({
          ...prev,
          company_name: json.detectedCompany || prev.company_name,
          round_type: json.detectedRound || prev.round_type,
          scheduled_date: json.detectedDate || prev.scheduled_date,
          scheduled_time: json.detectedTime || prev.scheduled_time,
        }));

        if (
          json.detectedRound &&
          !['Technical Coding L1', 'System Design L2', 'Screening Round', 'Hiring Manager L3', 'HR Discussion'].includes(json.detectedRound)
        ) {
          setIsCustomRound(true);
          setCustomRoundText(json.detectedRound);
        }

        showToast(json.statusMessage || 'Verified screenshot viewed by mentor');
      } else {
        // No interview details found in screenshot
        setInviteVerified(false);
        setOcrData(null);
        showToast(json.statusMessage || 'No interview details found in screenshot');
      }
    } catch (err) {
      console.error('Scan error:', err);
      setInviteVerified(false);
      showToast('Could not scan screenshot. Please check the image and try again.');
    } finally {
      setIsScanningInvite(false);
      setScanStatusText(null);
    }
  };

  const handleRemoveScreenshot = () => {
    if (invitePreviewUrl) URL.revokeObjectURL(invitePreviewUrl);
    setInviteFile(null);
    setInvitePreviewUrl(null);
    setInviteVerified(false);
    setOcrData(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Submit Slot Request with Strict Asterisk Field Validation
  const handleSubmitSlotRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Strict Asterisk Validation
    if (!slotForm.company_name.trim()) {
      showToast('Please enter the company name.');
      return;
    }

    const effectiveRoundType = isCustomRound ? customRoundText.trim() : slotForm.round_type;
    if (isCustomRound && !customRoundText.trim()) {
      showToast('Please enter your custom interview round type.');
      return;
    }

    if (!slotForm.scheduled_date) {
      showToast('Please select your interview date.');
      return;
    }

    if (!slotForm.scheduled_time) {
      showToast('Please select your interview time slot.');
      return;
    }

    // 2. Strict Unified Slot Collision Prevention
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

    if (!currentClient?.id) {
      showToast('Please sign in to request an interview slot.');
      setIsSubmittingSlot(false);
      return;
    }

    // 3. Serialize 24-hour proof payload into jd_text
    const serializedJd = serializeSlotProof(slotForm.jd_text, ocrData);

    const newSlotPayload = {
      client_id: currentClient.id,
      company_name: slotForm.company_name.trim(),
      round_type: effectiveRoundType,
      scheduled_date: slotForm.scheduled_date,
      scheduled_time: slotForm.scheduled_time,
      jd_text: serializedJd || null,
      status: 'requested' as const,
      round_fee: '0',
    };

    try {
      const { data, error } = await supabase
        .from('interview_slots')
        .insert([newSlotPayload])
        .select('*, client:clients(*)');

      if (error || !data || !data[0]) {
        throw new Error(error?.message || 'Failed to submit slot request.');
      }

      const createdSlot: DatabaseInterviewSlot = data[0];

      setAllSlots((prev) => [createdSlot, ...prev]);

      broadcastSync('SLOT_CREATED', createdSlot);

      // Trigger official Meta WhatsApp Cloud API alert (non-blocking)
      triggerWhatsAppAlert('client_slot_request', {
        client_name: currentClient.full_name || 'Enrolled Client',
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
        scheduled_date: getTodayDateStr(),
        scheduled_time: DEFAULT_SLOT_TIME,
        jd_text: '',
      });
      handleRemoveScreenshot();
    } catch (err: unknown) {
      console.error('Error submitting slot request:', err);
      showToast(err instanceof Error ? err.message : 'Could not submit slot. Please try again.');
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
        const { data, error } = await supabase
          .from('clients')
          .select('*')
          .or(`whatsapp_number.ilike.%${clean}%,whatsapp_number.eq.${clean},whatsapp_number.eq.${phoneInput.trim()}`)
          .limit(1);

        if (error) {
          throw new Error(error.message);
        }

        if (data && data.length > 0) {
          const client = data[0];
          client.profiles_status = client.naukri_status || client.profiles_status || 'in_progress';
          setCurrentClient(client);
          localStorage.setItem('cf_current_client', JSON.stringify(client));
          setIsAuthenticating(false);
          return;
        }

        // Real security check: No fake fallback
        setAuthError('No registered candidate found with this WhatsApp number. Please check the number or contact your onboarding mentor.');
      } catch (err: unknown) {
        setAuthError(err instanceof Error ? err.message : 'Login failed. Please verify your connection.');
      } finally {
        setIsAuthenticating(false);
      }
    }, 200);
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
      current_ctc_lpa: String(currentClient.target_ctc_lpa || currentClient.current_ctc_lpa || '14.0'),
    });
    setIsEditProfileOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentClient?.id || !editProfileForm.full_name.trim()) return;

    setIsSavingProfile(true);
    const cleanCtc = editProfileForm.current_ctc_lpa.trim();
    const updatedClient: DatabaseClient = {
      ...currentClient,
      full_name: editProfileForm.full_name.trim(),
      tech_stack: editProfileForm.tech_stack.trim() || currentClient.tech_stack,
      target_ctc_lpa: cleanCtc || currentClient.target_ctc_lpa,
      current_ctc_lpa: cleanCtc || currentClient.current_ctc_lpa,
    };

    try {
      const { error } = await supabase
        .from('clients')
        .update({
          full_name: updatedClient.full_name,
          tech_stack: updatedClient.tech_stack,
          target_ctc_lpa: updatedClient.target_ctc_lpa,
        })
        .eq('id', currentClient.id);

      if (error) {
        throw new Error(error.message);
      }

      setCurrentClient(updatedClient);
      localStorage.setItem('cf_current_client', JSON.stringify(updatedClient));
      broadcastSync('CLIENT_UPDATED', { clientId: currentClient.id });
      showToast('Profile updated successfully!');
      setIsEditProfileOpen(false);
    } catch (err: unknown) {
      console.error('Error updating profile:', err);
      showToast(err instanceof Error ? err.message : 'Could not save profile changes.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const mySlots = allSlots.filter((s) => s.client_id === currentClient?.id);
  const liveConfirmedSlots = allSlots.filter((s) => s.status === 'approved');
  const { upcomingDates, todayStr } = useLiveUpcomingDates();
  const confirmedSlotsOnDate = liveConfirmedSlots.filter((s) => s.scheduled_date === slotForm.scheduled_date);

  useEffect(() => {
    if (todayStr) {
      setSlotForm((prev) => (prev.scheduled_date ? prev : { ...prev, scheduled_date: todayStr }));
    }
  }, [todayStr]);

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
                  Registered WhatsApp Number
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-xs font-mono text-zinc-500 font-bold">+91</span>
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="9999999999"
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
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span>Enter Portal</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>

            <div className="pt-3 border-t border-zinc-800/80 text-center text-[11px] text-zinc-500 font-medium">
              Authorized candidate access only
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
                {mySlots.map((slot) => {
                  const proof = parseSlotProof(slot.jd_text);

                  return (
                    <div key={slot.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <strong className="text-sm font-extrabold text-white">
                              {slot.company_name}
                            </strong>
                            <span className="text-xs text-zinc-400 font-medium">
                              • {slot.round_type}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mt-1.5 text-xs text-zinc-300 font-mono flex-wrap">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                              <span>{slot.scheduled_date}</span>
                            </div>
                            <span className="text-zinc-600">•</span>
                            <strong className="text-white">{slot.scheduled_time}</strong>
                          </div>

                          {/* Verification Status */}
                          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                            {proof.hasScreenshot ? (
                              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-bold border border-emerald-500/30 flex items-center gap-1">
                                <span>👁️ Verified Screenshot</span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-400/90 bg-amber-500/10 px-2 py-0.5 rounded-full font-bold border border-amber-500/30 flex items-center gap-1">
                                <span>⚠️ Unverified (No Screenshot Attached)</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions & Status Badge - Responsive & never popping out */}
                        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleOpenEditMySlot(slot)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0"
                          >
                            <Edit3 className="w-3 h-3 text-zinc-400" />
                            <span>Reschedule</span>
                          </button>
                          {(() => {
                            const isSlotDeclined = slot.status === 'declined' || slot.status === 'cancelled';
                            return (
                              <span
                                className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-full border shrink-0 text-center ${
                                  slot.status === 'approved'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                    : isSlotDeclined
                                    ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                    : slot.status === 'rescheduled'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                    : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                                }`}
                              >
                                {slot.status === 'approved'
                                  ? 'Approved'
                                  : isSlotDeclined
                                  ? 'Declined'
                                  : slot.status === 'rescheduled'
                                  ? 'Rescheduled (Pending)'
                                  : 'Pending Approval'}
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      {slot.status === 'approved' && slot.meeting_link && (
                        <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>
                            Meeting link ready:{' '}
                            <a
                              href={slot.meeting_link}
                              target="_blank"
                              rel="noreferrer"
                              className="underline font-bold text-white hover:text-emerald-300"
                            >
                              Join Video Call
                            </a>
                          </span>
                        </div>
                      )}

                      {(slot.status === 'declined' || slot.status === 'cancelled') && (
                        <div className="flex items-center gap-2 text-xs text-red-300 bg-red-500/10 p-2.5 rounded-xl border border-red-500/20">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          <span>Slot was declined by mentor/admin. Click Reschedule to select an alternate time.</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-xs text-zinc-300 bg-black/60 p-2.5 rounded-xl border border-zinc-800">
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Mentor connects with you on WhatsApp before your slot for prep drills.</span>
                      </div>
                    </div>
                  );
                })}
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
              Confirmed Cohort Slots ({liveConfirmedSlots.length})
            </h2>
            <span className="text-xs text-zinc-400 font-medium">Live Bookings</span>
          </div>

          <div className="bg-[#111113] border border-zinc-800 rounded-2xl p-4">
            {liveConfirmedSlots.length === 0 ? (
              <div className="text-center py-4 text-xs text-zinc-500">
                No active confirmed cohort slots scheduled yet.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {liveConfirmedSlots.map((slot) => {
                  const isMine = slot.client_id === currentClient.id;
                  const candName =
                    slot.candidate_name ||
                    (slot.client?.full_name
                      ? `${slot.client.full_name.split(' ')[0]} ${slot.client.full_name.split(' ')[1]?.[0] || ''}.`
                      : 'Candidate');
                  const proof = parseSlotProof(slot.jd_text);

                  return (
                    <div key={slot.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between text-xs gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-white">{slot.company_name}</span>
                          <span className="text-zinc-400 font-mono text-[11px]">
                            ({candName})
                          </span>
                          {isMine && (
                            <span className="text-[9px] bg-white text-black font-extrabold px-1.5 py-0.2 rounded-full">
                              You
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[11px] text-zinc-400">{slot.round_type}</span>
                          {proof.hasScreenshot ? (
                            <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                              ✓ Verified
                            </span>
                          ) : (
                            <span className="text-[9px] text-amber-400/80 font-bold bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                              ⚠️ Unverified
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right font-mono text-[11px] text-zinc-300 shrink-0">
                        <div>{slot.scheduled_date}</div>
                        <strong className="text-white">{slot.scheduled_time}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Interview Invite Screenshot
              </label>
              <p className="text-[11px] text-zinc-400 mb-2">
                Upload your interview email or calendar screenshot to verify the round with mentors.
              </p>

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
                    or tap to choose · Gmail, Outlook, Teams, Zoom, HackerRank
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
                          Uploaded
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
                      <span>Scanning screenshot for interview details & meeting links...</span>
                    </div>
                  ) : inviteVerified ? (
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-xl">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Verified screenshot viewed by mentor</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-xl">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>No interview details found in screenshot</span>
                    </div>
                  )}
                </div>
              )}
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

              {/* Inline Date Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-300">
                    Interview Date (IST) *
                  </label>
                  <span className="text-[11px] font-mono text-zinc-400 font-bold">
                    {slotForm.scheduled_date}
                  </span>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {upcomingDates.map(({ dateStr, label, dayName }) => {
                    const isSelected = dateStr === slotForm.scheduled_date;
                    const bookedCount = allSlots.filter(
                      (s) =>
                        s.scheduled_date === dateStr &&
                        s.status !== 'declined' &&
                        s.status !== 'cancelled'
                    ).length;

                    return (
                      <button
                        key={dateStr}
                        type="button"
                        onClick={() => {
                          setSlotForm((prev) => ({ ...prev, scheduled_date: dateStr }));
                          const avail = getTimeSlotsAvailability(dateStr, allSlots);
                          const firstFree = avail.find((a) => !a.isBooked);
                          if (firstFree) {
                            setSlotForm((prev) => ({ ...prev, scheduled_time: firstFree.time }));
                          }
                        }}
                        className={`flex flex-col items-center py-2 px-3 rounded-2xl border text-center shrink-0 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-white text-black border-white shadow-md'
                            : 'bg-black border-zinc-800 text-zinc-400 hover:bg-zinc-900'
                        }`}
                      >
                        <span className="text-[10px] font-mono uppercase">{dayName}</span>
                        <strong className="text-xs font-extrabold mt-0.5">{label}</strong>
                        <span
                          className={`text-[9px] mt-1 px-1 rounded font-mono ${
                            isSelected
                              ? 'bg-zinc-800 text-white'
                              : bookedCount > 0
                              ? 'bg-zinc-900 text-zinc-500'
                              : 'bg-zinc-900 text-emerald-400'
                          }`}
                        >
                          {bookedCount > 0 ? `${bookedCount} booked` : 'Open'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Manual Date Input */}
                <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-zinc-800/80">
                  <span className="text-zinc-400 font-medium">Or enter date manually:</span>
                  <input
                    type="date"
                    min={todayStr || undefined}
                    value={slotForm.scheduled_date}
                    onChange={(e) => {
                      if (e.target.value) {
                        setSlotForm((prev) => ({ ...prev, scheduled_date: e.target.value }));
                      }
                    }}
                    className="bg-black border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-white font-mono focus:border-zinc-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Inline Time Slot Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-300">
                    Interview Time (IST) *
                  </label>
                  <span className="text-[11px] font-mono text-zinc-400 font-bold">
                    {slotForm.scheduled_time}
                  </span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-36 overflow-y-auto p-1.5 bg-black/60 border border-zinc-800 rounded-xl">
                  {getTimeSlotsAvailability(slotForm.scheduled_date, allSlots).map(
                    ({ time, isBooked, conflictInfo }) => {
                      const isSelected = slotForm.scheduled_time === time;
                      return (
                        <button
                          key={time}
                          type="button"
                          onClick={() =>
                            setSlotForm((prev) => ({ ...prev, scheduled_time: time }))
                          }
                          title={isBooked ? `Clash: ${conflictInfo}` : undefined}
                          className={`py-1.5 px-1 rounded-xl text-center border text-[11px] font-mono transition-all flex flex-col items-center justify-center cursor-pointer ${
                            isSelected
                              ? 'bg-white text-black font-extrabold border-white shadow-md'
                              : isBooked
                              ? 'bg-zinc-950 border-red-900/40 text-red-400/80 hover:border-red-700'
                              : 'bg-black border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-white'
                          }`}
                        >
                          <span>{time.replace(' IST', '')}</span>
                          <span
                            className={`text-[9px] mt-0.5 ${
                              isSelected
                                ? 'text-zinc-800 font-bold'
                                : isBooked
                                ? 'text-red-400 font-semibold'
                                : 'text-zinc-500'
                            }`}
                          >
                            {isBooked ? 'Clash' : 'Free'}
                          </span>
                        </button>
                      );
                    }
                  )}
                </div>

                {/* Manual Time Input */}
                <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-zinc-800/80 gap-2">
                  <span className="text-zinc-400 font-medium shrink-0">Or enter time manually:</span>
                  <input
                    type="text"
                    value={slotForm.scheduled_time}
                    onChange={(e) => setSlotForm((prev) => ({ ...prev, scheduled_time: e.target.value }))}
                    placeholder="e.g. 04:30 PM IST"
                    className="bg-black border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-white font-mono focus:border-zinc-500 focus:outline-none flex-1 max-w-[180px] text-right placeholder:text-zinc-600"
                  />
                </div>

                {/* Conflict warning if the chosen time has a clash */}
                {(() => {
                  const check = checkSlotCollision(
                    slotForm.scheduled_time,
                    slotForm.scheduled_date,
                    allSlots
                  );
                  if (check.isClash) {
                    return (
                      <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-300 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <strong>Mentor Slot Busy:</strong> {check.message}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
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
      {/* MODAL: RESCHEDULE / EDIT MY INTERVIEW SLOT               */}
      {/* ======================================================== */}
      {editingMySlot && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#121214] rounded-3xl max-w-md w-full p-6 border border-zinc-800 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto text-white">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div>
                <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                  <Edit3 className="w-4 h-4 text-emerald-400" />
                  <span>Reschedule Interview Slot</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Changes will be submitted for admin re-approval.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingMySlot(null)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editMySlotError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{editMySlotError}</span>
              </div>
            )}

            <form onSubmit={handleSaveMySlotEdit} className="space-y-3.5">
              {/* Company Name */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Company Name *
                </label>
                <div className="relative">
                  <Building className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                  <input
                    type="text"
                    required
                    value={editMySlotForm.company_name}
                    onChange={(e) =>
                      setEditMySlotForm({ ...editMySlotForm, company_name: e.target.value })
                    }
                    placeholder="e.g. Swiggy, Wells Fargo, PhonePe"
                    className="w-full bg-black border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Round Type */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Interview Round *
                </label>
                <select
                  value={isEditMySlotCustomRound ? 'Custom' : editMySlotForm.round_type}
                  onChange={(e) => {
                    if (e.target.value === 'Custom') {
                      setIsEditMySlotCustomRound(true);
                    } else {
                      setIsEditMySlotCustomRound(false);
                      setEditMySlotForm({ ...editMySlotForm, round_type: e.target.value });
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

              {isEditMySlotCustomRound && (
                <div>
                  <label className="block text-[11px] font-bold text-emerald-400 mb-1">
                    Custom Round Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editMySlotCustomRoundText}
                    onChange={(e) => setEditMySlotCustomRoundText(e.target.value)}
                    placeholder="e.g. Director Round, Live architecture"
                    className="w-full bg-black border border-emerald-500/50 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-emerald-400 focus:outline-none"
                  />
                </div>
              )}

              {/* Inline Date Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-300">
                    Interview Date (IST) *
                  </label>
                  <span className="text-[11px] font-mono text-zinc-400 font-bold">
                    {editMySlotForm.scheduled_date}
                  </span>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {upcomingDates.map(({ dateStr, label, dayName }) => {
                    const isSelected = dateStr === editMySlotForm.scheduled_date;
                    const bookedCount = allSlots.filter(
                      (s) =>
                        s.scheduled_date === dateStr &&
                        s.id !== editingMySlot.id &&
                        s.status !== 'declined' &&
                        s.status !== 'cancelled'
                    ).length;

                    return (
                      <button
                        key={dateStr}
                        type="button"
                        onClick={() => {
                          setEditMySlotForm((prev) => ({ ...prev, scheduled_date: dateStr }));
                          const avail = getTimeSlotsAvailability(dateStr, allSlots, editingMySlot.id);
                          const firstFree = avail.find((a) => !a.isBooked);
                          if (firstFree) {
                            setEditMySlotForm((prev) => ({ ...prev, scheduled_time: firstFree.time }));
                          }
                        }}
                        className={`flex flex-col items-center py-2 px-3 rounded-2xl border text-center shrink-0 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-white text-black border-white shadow-md'
                            : 'bg-black border-zinc-800 text-zinc-400 hover:bg-zinc-900'
                        }`}
                      >
                        <span className="text-[10px] font-mono uppercase">{dayName}</span>
                        <strong className="text-xs font-extrabold mt-0.5">{label}</strong>
                        <span
                          className={`text-[9px] mt-1 px-1 rounded font-mono ${
                            isSelected
                              ? 'bg-zinc-800 text-white'
                              : bookedCount > 0
                              ? 'bg-zinc-900 text-zinc-500'
                              : 'bg-zinc-900 text-emerald-400'
                          }`}
                        >
                          {bookedCount > 0 ? `${bookedCount} booked` : 'Open'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Manual Date Input */}
                <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-zinc-800/80">
                  <span className="text-zinc-400 font-medium">Or enter date manually:</span>
                  <input
                    type="date"
                    min={todayStr || undefined}
                    value={editMySlotForm.scheduled_date}
                    onChange={(e) => {
                      if (e.target.value) {
                        setEditMySlotForm((prev) => ({ ...prev, scheduled_date: e.target.value }));
                      }
                    }}
                    className="bg-black border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-white font-mono focus:border-zinc-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Inline Time Slot Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-300">
                    Interview Time (IST) *
                  </label>
                  <span className="text-[11px] font-mono text-zinc-400 font-bold">
                    {editMySlotForm.scheduled_time}
                  </span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-36 overflow-y-auto p-1.5 bg-black/60 border border-zinc-800 rounded-xl">
                  {getTimeSlotsAvailability(editMySlotForm.scheduled_date, allSlots, editingMySlot.id).map(
                    ({ time, isBooked, conflictInfo }) => {
                      const isSelected = editMySlotForm.scheduled_time === time;
                      return (
                        <button
                          key={time}
                          type="button"
                          onClick={() =>
                            setEditMySlotForm((prev) => ({ ...prev, scheduled_time: time }))
                          }
                          title={isBooked ? `Clash: ${conflictInfo}` : undefined}
                          className={`py-1.5 px-1 rounded-xl text-center border text-[11px] font-mono transition-all flex flex-col items-center justify-center cursor-pointer ${
                            isSelected
                              ? 'bg-white text-black font-extrabold border-white shadow-md'
                              : isBooked
                              ? 'bg-zinc-950 border-red-900/40 text-red-400/80 hover:border-red-700'
                              : 'bg-black border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-white'
                          }`}
                        >
                          <span>{time.replace(' IST', '')}</span>
                          <span
                            className={`text-[9px] mt-0.5 ${
                              isSelected
                                ? 'text-zinc-800 font-bold'
                                : isBooked
                                ? 'text-red-400 font-semibold'
                                : 'text-zinc-500'
                            }`}
                          >
                            {isBooked ? 'Clash' : 'Free'}
                          </span>
                        </button>
                      );
                    }
                  )}
                </div>

                {/* Manual Time Input */}
                <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-zinc-800/80 gap-2">
                  <span className="text-zinc-400 font-medium shrink-0">Or enter time manually:</span>
                  <input
                    type="text"
                    value={editMySlotForm.scheduled_time}
                    onChange={(e) => setEditMySlotForm((prev) => ({ ...prev, scheduled_time: e.target.value }))}
                    placeholder="e.g. 04:30 PM IST"
                    className="bg-black border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-white font-mono focus:border-zinc-500 focus:outline-none flex-1 max-w-[180px] text-right placeholder:text-zinc-600"
                  />
                </div>

                {/* Conflict warning if the chosen time has a clash */}
                {(() => {
                  const check = checkSlotCollision(
                    editMySlotForm.scheduled_time,
                    editMySlotForm.scheduled_date,
                    allSlots,
                    editingMySlot.id
                  );
                  if (check.isClash) {
                    return (
                      <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-300 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <strong>Mentor Slot Busy:</strong> {check.message}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* Notes / JD */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Key Topics / Notes
                </label>
                <textarea
                  rows={2}
                  value={editMySlotForm.jd_text}
                  onChange={(e) =>
                    setEditMySlotForm({ ...editMySlotForm, jd_text: e.target.value })
                  }
                  placeholder="e.g. Distributed caching, Redis, Spring Cloud, live coding"
                  className="w-full bg-black border border-zinc-800 rounded-xl p-2.5 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                />
              </div>

              {/* Re-approval notice */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Admin Re-Approval Required:</strong> Rescheduling will reset this slot's status to <em>Requested</em> and ping the operations team on WhatsApp to confirm the new mentor assignment.
                </span>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingMySlot(null)}
                  className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs py-2.5 rounded-xl transition-colors border border-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingMySlotEdit || !editMySlotForm.company_name.trim()}
                  className="flex-1 bg-white hover:bg-zinc-200 text-black font-extrabold text-xs py-2.5 rounded-xl transition-colors disabled:opacity-50"
                >
                  {isSavingMySlotEdit ? 'Rescheduling...' : 'Save & Request Approval'}
                </button>
              </div>
            </form>
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
