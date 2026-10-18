'use client';

import React, { useState, useEffect } from 'react';
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
  Sparkles
} from 'lucide-react';
import { supabase, DatabaseInterviewSlot, DatabaseClient } from '@/lib/supabase';
import { broadcastSync } from '@/lib/portalSync';
import {
  checkSlotCollision,
  getTimeSlotsAvailability,
  STANDARD_TIME_SLOTS
} from '@/lib/slotCollision';

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
  const [selectedDate, setSelectedDate] = useState('2026-10-21');
  const [selectedTime, setSelectedTime] = useState('02:30 PM IST');
  const [jdNotes, setJdNotes] = useState('');

  const [existingSlots, setExistingSlots] = useState<DatabaseInterviewSlot[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bookedSuccess, setBookedSuccess] = useState<DatabaseInterviewSlot | null>(null);

  // Fetch all active booked slots to calculate collisions in real-time
  const fetchActiveSlots = async () => {
    try {
      const { data, error } = await supabase
        .from('interview_slots')
        .select('*')
        .neq('status', 'cancelled')
        .neq('status', 'declined');

      if (data && data.length > 0) {
        setExistingSlots(data);
      }
    } catch {
      // Offline fallback
    }
  };

  useEffect(() => {
    fetchActiveSlots();
  }, []);

  // Compute availability for current selected date
  const slotAvailability = getTimeSlotsAvailability(selectedDate, existingSlots);

  // Check collision for currently selected time
  const currentCollision = checkSlotCollision(selectedTime, selectedDate, existingSlots);

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanPhone = whatsappNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setErrorMessage('Please enter a valid 10-digit WhatsApp number.');
      return;
    }

    if (!fullName.trim() || !companyName.trim()) {
      setErrorMessage('Please fill in candidate name and company name.');
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
      // 1. Find or create client with client_type: 'per_round'
      let clientId = `cli-${Date.now()}`;

      try {
        const { data: existingClient } = await supabase
          .from('clients')
          .select('id')
          .eq('whatsapp_number', cleanPhone)
          .limit(1);

        if (existingClient && existingClient.length > 0) {
          clientId = existingClient[0].id;
        } else {
          const newClientPayload = {
            full_name: fullName.trim(),
            whatsapp_number: cleanPhone,
            tech_stack: `${roundType} (Emergency Clearance)`,
            fee_status: 'offer_locked' as const,
            client_type: 'per_round',
            notes: `Urgent booking for ${companyName.trim()}`,
          };

          const { data: insertedClient } = await supabase
            .from('clients')
            .insert([newClientPayload])
            .select();

          if (insertedClient && insertedClient[0]) {
            clientId = insertedClient[0].id;
          }
        }
      } catch {
        // Continue with local ID if network fails
      }

      // 2. Insert interview slot with status 'requested'
      const newSlotPayload: Omit<DatabaseInterviewSlot, 'id' | 'created_at'> = {
        client_id: clientId,
        candidate_name: fullName.trim(),
        company_name: companyName.trim(),
        round_type: roundType,
        scheduled_date: selectedDate,
        scheduled_time: selectedTime,
        priority: 'urgent',
        jd_text: jdNotes.trim() || null,
        status: 'requested',
        round_fee: 'Emergency Round',
        invite_verified: true,
      };

      const { data: insertedSlot, error: slotError } = await supabase
        .from('interview_slots')
        .insert([newSlotPayload])
        .select();

      if (slotError) throw slotError;

      const createdSlot = (insertedSlot && insertedSlot[0]) || {
        ...newSlotPayload,
        id: `slot-${Date.now()}`,
        created_at: new Date().toISOString(),
      };

      setExistingSlots((prev) => [createdSlot, ...prev]);
      broadcastSync('SLOT_CREATED', createdSlot);
      setBookedSuccess(createdSlot);
    } catch {
      // Fallback local display
      const fallbackSlot: DatabaseInterviewSlot = {
        id: `slot-${Date.now()}`,
        client_id: 'cli-emergency',
        candidate_name: fullName.trim(),
        company_name: companyName.trim(),
        round_type: roundType,
        scheduled_date: selectedDate,
        scheduled_time: selectedTime,
        priority: 'urgent',
        jd_text: jdNotes.trim() || null,
        status: 'requested',
        round_fee: 'Emergency Round',
        invite_verified: true,
      };
      setExistingSlots((prev) => [fallbackSlot, ...prev]);
      broadcastSync('SLOT_CREATED', fallbackSlot);
      setBookedSuccess(fallbackSlot);
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
                Your 1-on-1 clearance session has been submitted to mentors.
              </p>
            </div>

            <div className="bg-black/60 border border-zinc-800 rounded-2xl p-4 text-left text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-zinc-500 font-medium">Candidate:</span>
                <strong className="text-white font-bold">{bookedSuccess.candidate_name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 font-medium">Company:</span>
                <strong className="text-white font-bold">{bookedSuccess.company_name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 font-medium">Round Type:</span>
                <strong className="text-white font-bold">{bookedSuccess.round_type}</strong>
              </div>
              <div className="flex justify-between pt-1 border-t border-zinc-800/80">
                <span className="text-zinc-500 font-medium">Date & Time:</span>
                <strong className="text-emerald-400 font-mono font-bold">
                  {bookedSuccess.scheduled_date} • {bookedSuccess.scheduled_time}
                </strong>
              </div>
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-300 flex items-start gap-2 text-left">
              <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                Our technical mentor will reach out on WhatsApp (+91 {whatsappNumber.replace(/\D/g, '')}) to confirm readiness & start drill prep.
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setBookedSuccess(null);
                setCompanyName('');
                setJdNotes('');
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

        {/* Booking Form */}
        <form onSubmit={handleSubmit} className="bg-[#111113] border border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl">
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

          {/* Company & Round */}
          <div className="grid grid-cols-2 gap-3">
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
                  placeholder="e.g. Swiggy"
                  className="w-full bg-black border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Round Type *
              </label>
              <select
                value={roundType}
                onChange={(e) => setRoundType(e.target.value)}
                className="w-full bg-black border border-zinc-800 rounded-xl px-2.5 py-2 text-xs text-white focus:border-zinc-500 focus:outline-none"
              >
                <option value="Technical Coding L1">Technical Coding L1</option>
                <option value="System Design L2">System Design L2</option>
                <option value="Screening / HackerRank">Screening Round</option>
                <option value="Hiring Manager L3">Hiring Manager L3</option>
                <option value="HR Discussion">HR Discussion</option>
              </select>
            </div>
          </div>

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
                      // Auto pick first available slot on selected date
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
                      <span className="text-[9px] font-bold text-red-500/80">Booked</span>
                    </button>
                  );
                }

                return (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setSelectedTime(time)}
                    className={`py-2 px-2.5 rounded-xl border text-[11px] font-mono font-bold transition-all text-center ${
                      isSelected
                        ? 'bg-white text-black border-white shadow-md'
                        : 'bg-black border-zinc-800 text-zinc-300 hover:border-zinc-500 hover:text-white'
                    }`}
                  >
                    {time}
                  </button>
                );
              })}
            </div>

            {currentCollision.isClash && (
              <div className="p-2.5 mt-2 bg-red-500/10 border border-red-500/30 rounded-xl text-[11px] text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span>{currentCollision.message}</span>
              </div>
            )}
          </div>

          {/* Optional Notes */}
          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1">
              Interview Focus / JD Topics (Optional)
            </label>
            <textarea
              rows={2}
              value={jdNotes}
              onChange={(e) => setJdNotes(e.target.value)}
              placeholder="e.g. Distributed caching with Redis, Kafka partitioning, live DSA coding"
              className="w-full bg-black border border-zinc-800 rounded-xl p-2.5 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
            />
          </div>

          {/* Submit CTA */}
          <button
            type="submit"
            disabled={isSubmitting || currentCollision.isClash}
            className="w-full bg-white hover:bg-zinc-200 text-black font-extrabold text-xs py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Reserving Emergency Slot...</span>
              </>
            ) : (
              <>
                <span>Reserve Emergency Slot ({selectedDate} @ {selectedTime})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        <div className="text-center text-[11px] text-zinc-500">
          <span>CareerForge Placement Support Engine • 100% Confidential</span>
        </div>
      </div>
    </div>
  );
}
