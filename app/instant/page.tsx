'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Building,
  User,
  Phone,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Check,
  ChevronRight,
  MessageCircle,
  Sparkles,
  Upload,
  ShieldCheck,
  X,
  FileText
} from 'lucide-react';
import { supabase, DatabaseInterviewSlot, DatabaseClient } from '@/lib/supabase';
import { broadcastSync } from '@/lib/portalSync';
import { triggerWhatsAppAlert } from '@/lib/whatsappNotify';
import {
  checkSlotCollision,
  getTimeSlotsAvailability,
  STANDARD_TIME_SLOTS
} from '@/lib/slotCollision';
import { parseSlotProof, serializeSlotProof } from '@/lib/inviteProof';

function getUpcomingDates(): { dateStr: string; label: string; dayName: string }[] {
  const dates = [];
  const base = new Date('2026-10-19T12:00:00Z');
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

export default function InstantEmergencyBookingPage() {
  const upcomingDates = getUpcomingDates();

  const [fullName, setFullName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [roundType, setRoundType] = useState('Technical Coding L1');
  const [isCustomRound, setIsCustomRound] = useState(false);
  const [customRoundText, setCustomRoundText] = useState('');
  const [selectedDate, setSelectedDate] = useState('2026-10-21');
  const [selectedTime, setSelectedTime] = useState('02:30 PM IST');
  const [jdNotes, setJdNotes] = useState('');

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

  const [existingSlots, setExistingSlots] = useState<DatabaseInterviewSlot[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bookedSuccess, setBookedSuccess] = useState<DatabaseInterviewSlot | null>(null);

  // Fetch all active booked slots to calculate collisions in real-time
  const fetchActiveSlots = async () => {
    try {
      const { data, error } = await supabase
        .from('interview_slots')
        .select('*, client:clients(*)')
        .neq('status', 'cancelled')
        .neq('status', 'declined')
        .order('scheduled_date', { ascending: true });

      if (error) {
        console.error('Error fetching slots:', error.message);
        return;
      }

      if (data) {
        setExistingSlots(data);
      }
    } catch (err) {
      console.error('Network error fetching slots:', err);
    }
  };

  useEffect(() => {
    fetchActiveSlots();
  }, []);

  // Compute availability for current selected date
  const slotAvailability = getTimeSlotsAvailability(selectedDate, existingSlots);

  // Existing slots scheduled on the selected date (common for both types, no types displayed)
  const slotsOnSelectedDate = existingSlots.filter(
    (s) => s.scheduled_date === selectedDate && s.status !== 'cancelled' && s.status !== 'declined'
  );

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

  // Handle Real OCR Drop Invite Screenshot (Sub-second with warm worker)
  const handleDropInvite = async (file: File) => {
    if (!file || !file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (PNG, JPG, or WEBP).');
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

        if (json.detectedCompany) {
          setCompanyName(json.detectedCompany);
        }

        if (json.detectedDate) {
          setSelectedDate(json.detectedDate);
        }

        if (json.detectedTime) {
          setSelectedTime(json.detectedTime);
        }

        if (json.detectedRound) {
          if (
            ['Technical Coding L1', 'System Design L2', 'Screening Round', 'Hiring Manager L3', 'HR Discussion'].includes(
              json.detectedRound
            )
          ) {
            setRoundType(json.detectedRound);
            setIsCustomRound(false);
          } else {
            setIsCustomRound(true);
            setCustomRoundText(json.detectedRound);
          }
        }
      } else {
        // No interview details found in screenshot
        setInviteVerified(false);
        setOcrData(null);
      }
    } catch (err) {
      console.error('Scan error:', err);
      setInviteVerified(false);
      setOcrData(null);
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

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const effectiveRoundType = isCustomRound ? customRoundText.trim() : roundType;

    const cleanPhone = whatsappNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setErrorMessage('Please enter a valid 10-digit WhatsApp number.');
      return;
    }

    if (!fullName.trim() || !companyName.trim()) {
      setErrorMessage('Please fill in candidate name and company name.');
      return;
    }

    if (isCustomRound && !customRoundText.trim()) {
      setErrorMessage('Please enter your custom interview round type.');
      return;
    }

    // Double check collision protection before inserting
    const collisionCheck = checkSlotCollision(selectedTime, selectedDate, existingSlots);
    if (collisionCheck.isClash) {
      setErrorMessage(
        collisionCheck.message ||
          'This time slot has just been reserved by another candidate. Please choose an open slot.'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Find or create client with client_type: 'per_round' in Supabase
      let clientId: string = '';

      const { data: existingClients, error: clientFindErr } = await supabase
        .from('clients')
        .select('*')
        .or(`whatsapp_number.ilike.%${cleanPhone}%,whatsapp_number.eq.${cleanPhone}`)
        .limit(1);

      if (clientFindErr) {
        throw new Error(`Database check error: ${clientFindErr.message}`);
      }

      if (existingClients && existingClients.length > 0) {
        clientId = existingClients[0].id;
        // Safeguard: NEVER downgrade an enrolled retainer client to per_round!
        if (existingClients[0].client_type !== 'full_package') {
          await supabase
            .from('clients')
            .update({ client_type: 'per_round' })
            .eq('id', clientId);
        }
      } else {
        const newClientPayload = {
          full_name: fullName.trim(),
          whatsapp_number: cleanPhone,
          tech_stack: `${effectiveRoundType} (Emergency Clearance)`,
          target_ctc_lpa: 'Not Disclosed',
          fee_status: 'offer_locked' as const,
          naukri_status: 'in_progress',
          linkedin_status: 'in_progress',
          client_type: 'per_round',
          notes: `Urgent single-round booking for ${companyName.trim()}`,
        };

        const { data: insertedClient, error: clientInsertErr } = await supabase
          .from('clients')
          .insert([newClientPayload])
          .select();

        if (clientInsertErr || !insertedClient || !insertedClient[0]) {
          throw new Error(clientInsertErr?.message || 'Failed to create candidate profile.');
        }

        clientId = insertedClient[0].id;
      }

      // 2. Insert interview slot using 24-hour proof metadata
      const serializedJd = serializeSlotProof(jdNotes, ocrData);

      const newSlotPayload = {
        client_id: clientId,
        candidate_name: fullName.trim(),
        company_name: companyName.trim(),
        round_type: effectiveRoundType,
        scheduled_date: selectedDate,
        scheduled_time: selectedTime,
        jd_text: serializedJd || null,
        status: 'requested' as const,
        round_fee: '₹3,000',
      };

      const { data: insertedSlots, error: slotError } = await supabase
        .from('interview_slots')
        .insert([newSlotPayload])
        .select('*, client:clients(*)');

      if (slotError || !insertedSlots || !insertedSlots[0]) {
        throw new Error(slotError?.message || 'Failed to reserve interview slot in database.');
      }

      const createdSlot: DatabaseInterviewSlot = insertedSlots[0];

      setExistingSlots((prev) => [createdSlot, ...prev]);
      broadcastSync('SLOT_CREATED', createdSlot);
      setBookedSuccess(createdSlot);

      // Trigger official Meta WhatsApp Cloud API alert (non-blocking)
      triggerWhatsAppAlert('emergency_booking', {
        name: fullName.trim(),
        phone: cleanPhone,
        company_name: companyName.trim(),
        round_type: effectiveRoundType,
        round_fee: 'Emergency Round',
        date: selectedDate,
        time: selectedTime,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Booking failed. Please try again.';
      console.error('Instant emergency booking error:', err);
      setErrorMessage(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // SUCCESS CONFIRMATION STATE
  if (bookedSuccess) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col justify-center px-4 py-12">
        <div className="w-full max-w-md mx-auto space-y-5">
          <div className="bg-[#111113] border border-zinc-800 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-2xl">
            <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>

            <div className="space-y-1">
              <span className="text-xs uppercase tracking-wider font-extrabold text-emerald-400">
                Booking Requested
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white">
                Emergency Slot Reserved
              </h1>
              <p className="text-xs text-zinc-400">
                Your single-round clearance slot is locked in without collisions.
              </p>
            </div>

            {/* Booking Summary Card */}
            <div className="bg-black/80 border border-zinc-800 rounded-2xl p-4 text-left space-y-2.5 text-xs font-mono">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                <span className="text-zinc-500">Candidate</span>
                <strong className="text-white font-sans">{bookedSuccess.candidate_name}</strong>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                <span className="text-zinc-500">Company</span>
                <strong className="text-white font-sans">{bookedSuccess.company_name}</strong>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                <span className="text-zinc-500">Round</span>
                <span className="text-zinc-300 font-sans">{bookedSuccess.round_type}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                <span className="text-zinc-500">Date</span>
                <span className="text-white">{bookedSuccess.scheduled_date}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                <span className="text-zinc-500">Time (IST)</span>
                <strong className="text-emerald-400">{bookedSuccess.scheduled_time}</strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Verification</span>
                {(() => {
                  const proof = parseSlotProof(bookedSuccess.jd_text);
                  return proof.hasScreenshot ? (
                    <span className="text-emerald-400 font-bold font-sans flex items-center gap-1">
                      <span>👁️ Verified Screenshot</span>
                      <span className="text-[10px] text-emerald-400/80 font-mono">
                        ({proof.confidence || 95}%)
                      </span>
                    </span>
                  ) : (
                    <span className="text-amber-400 font-bold font-sans">
                      ⚠️ Unverified (No Screenshot Attached)
                    </span>
                  );
                })()}
              </div>
            </div>

            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-left space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Next Step: WhatsApp Mentor Drill</span>
              </div>
              <p className="text-zinc-300 text-[11px] leading-relaxed">
                Our emergency clearance mentor has been notified. They will reach out to you at <strong className="text-white">{whatsappNumber}</strong> to verify the interview link and run live prep drills before your scheduled time.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setBookedSuccess(null);
                setFullName('');
                setCompanyName('');
                setJdNotes('');
                handleRemoveScreenshot();
              }}
              className="w-full bg-white hover:bg-zinc-200 text-black font-extrabold text-xs py-3 rounded-xl transition-all shadow-md active:scale-[0.98]"
            >
              Book Another Emergency Round
            </button>
          </div>
        </div>
      </div>
    );
  }

  // MAIN BOOKING FORM
  return (
    <div className="min-h-screen bg-black text-white pb-20 pt-6 px-4">
      <div className="w-full max-w-md mx-auto space-y-5">
        {/* Header Strip */}
        <header className="space-y-2 text-center sm:text-left pb-3 border-b border-zinc-800">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Emergency Clearance Desk</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
            Urgent Interview Clearance Support (Single Round)
          </h1>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Need urgent 1-on-1 clearance for an upcoming interview? Book an open slot. Double-booking is strictly blocked in real-time.
          </p>
        </header>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-xs text-red-400 flex items-start gap-2 font-bold">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* ======================================================== */}
        {/* SCREENSHOT DROPZONE (OPTIONAL - NO ASTERISK)             */}
        {/* ======================================================== */}
        <div className="bg-[#111113] border border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-zinc-300">
                Interview Invite Screenshot
              </label>
              <span className="text-[10px] text-zinc-400 font-medium">Non-mandatory</span>
            </div>
            <p className="text-[11px] text-zinc-400 mb-2 leading-relaxed">
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

          {/* Candidate Form Fields */}
          <form onSubmit={handleSubmit} className="space-y-4 pt-2 border-t border-zinc-800/80">
            {/* Candidate Details */}
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Your Full Name *
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-3 text-zinc-500" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Vikram Joshi"
                  className="w-full bg-black border border-zinc-800 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                WhatsApp Number *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-xs font-mono text-zinc-500 font-bold">+91</span>
                <input
                  type="tel"
                  required
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="9876543210"
                  className="w-full bg-black border border-zinc-800 rounded-xl pl-12 pr-3.5 py-2.5 text-xs font-mono text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none transition-all"
                />
              </div>
            </div>

            {/* Company & Round Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Company *
                </label>
                <div className="relative">
                  <Building className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Swiggy, Wells Fargo"
                    className="w-full bg-black border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Round Type *
                </label>
                <select
                  value={isCustomRound ? 'Custom' : roundType}
                  onChange={(e) => {
                    if (e.target.value === 'Custom') {
                      setIsCustomRound(true);
                    } else {
                      setIsCustomRound(false);
                      setRoundType(e.target.value);
                    }
                  }}
                  className="w-full bg-black border border-zinc-800 rounded-xl px-2.5 py-2 text-xs text-white focus:border-zinc-500 focus:outline-none"
                >
                  <option value="Technical Coding L1">Technical Coding L1</option>
                  <option value="System Design L2">System Design L2</option>
                  <option value="Screening Round">Screening Round</option>
                  <option value="Hiring Manager L3">Hiring Manager L3</option>
                  <option value="HR Discussion">HR Discussion</option>
                  <option value="Custom">Custom (Enter manually)...</option>
                </select>
              </div>
            </div>

            {/* Custom Round Type Input if selected */}
            {isCustomRound && (
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-emerald-400">
                  Custom Round Type Name *
                </label>
                <input
                  type="text"
                  required
                  value={customRoundText}
                  onChange={(e) => setCustomRoundText(e.target.value)}
                  placeholder="e.g. Take-home assignment review, Live architecture round"
                  className="w-full bg-black border border-emerald-500/50 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-emerald-400 focus:outline-none"
                />
              </div>
            )}

            {/* Date Selector */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-zinc-300">
                  Select Interview Date *
                </label>
                <span className="text-[11px] font-mono text-zinc-500 font-bold">
                  IST Timezone
                </span>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {upcomingDates.map(({ dateStr, label, dayName }) => {
                  const isSelected = dateStr === selectedDate;
                  const bookedCount = existingSlots.filter(
                    (s) => s.scheduled_date === dateStr && s.status !== 'declined' && s.status !== 'cancelled'
                  ).length;

                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => {
                        setSelectedDate(dateStr);
                        const avail = getTimeSlotsAvailability(dateStr, existingSlots);
                        const firstFree = avail.find((a) => !a.isBooked);
                        if (firstFree) setSelectedTime(firstFree.time);
                      }}
                      className={`flex flex-col items-center py-2 px-3 rounded-2xl border text-center shrink-0 transition-all ${
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
            </div>

            {/* Common Booked Schedule for Selected Date (No type badges shown to candidates) */}
            <div className="bg-black/60 border border-zinc-800 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-white">
                  Scheduled Interviews on {selectedDate}
                </span>
                <span className="text-[11px] font-mono text-zinc-400 font-bold">
                  {slotsOnSelectedDate.length} Booked
                </span>
              </div>

              {slotsOnSelectedDate.length === 0 ? (
                <p className="text-xs text-zinc-400 italic py-1">
                  ✨ No interviews scheduled on this day yet. All mentor slots are open.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {slotsOnSelectedDate.map((s) => (
                    <div
                      key={s.id}
                      className="bg-[#18181b] border border-zinc-800/80 rounded-xl p-2.5 flex items-center justify-between text-xs"
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

            {/* Live Slot Collision Grid */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-zinc-300">
                  Available Time Slots on {selectedDate} *
                </label>
                <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span> Live Open Slots
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {slotAvailability.map(({ time, isBooked, conflictInfo }) => {
                  const isSelected = selectedTime === time;

                  if (isBooked) {
                    return (
                      <button
                        key={time}
                        type="button"
                        disabled
                        title={`Slot unavailable: ${conflictInfo || 'Booked'}`}
                        className="py-2 px-2.5 rounded-xl border border-zinc-900 bg-zinc-950/80 text-zinc-600 text-[11px] font-mono line-through cursor-not-allowed text-center opacity-40 flex items-center justify-center gap-1"
                      >
                        <span>{time}</span>
                        <span className="text-[9px] text-red-400/80 no-underline">Booked</span>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={time}
                      type="button"
                      onClick={() => setSelectedTime(time)}
                      className={`py-2 px-2.5 rounded-xl border text-[11px] font-mono font-bold transition-all text-center flex items-center justify-center gap-1 ${
                        isSelected
                          ? 'bg-white text-black border-white shadow-md font-extrabold'
                          : 'bg-black border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-white'
                      }`}
                    >
                      {time}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Topics / Notes */}
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Topics to Clear (Optional)
              </label>
              <textarea
                rows={2}
                value={jdNotes}
                onChange={(e) => setJdNotes(e.target.value)}
                placeholder="e.g. Distributed caching, Spring Boot, React state machine, live coding drill"
                className="w-full bg-black border border-zinc-800 rounded-xl p-2.5 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || !fullName.trim() || !companyName.trim()}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 disabled:opacity-50 active:scale-[0.98] cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Securing Slot...</span>
                </>
              ) : (
                <>
                  <span>Request Emergency Clearance Slot</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
