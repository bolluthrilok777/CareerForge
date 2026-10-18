'use client';

import React, { useState, useEffect } from 'react';
import {
  Lock,
  MessageCircle,
  X,
  RefreshCw,
  LogOut,
  Trash2,
  Check,
  Clock,
  UserPlus,
  FileText,
  Calendar,
  AlertTriangle,
  UserMinus,
  Edit3,
  StickyNote,
  Users,
  Award,
  ShieldCheck,
  ArrowRight,
  Zap,
  Plus
} from 'lucide-react';
import {
  supabase,
  DatabaseLead,
  DatabaseClient,
  DatabaseInterviewSlot
} from '@/lib/supabase';
import { broadcastSync, subscribeToSync } from '@/lib/portalSync';
import {
  checkSlotCollision,
  getTimeSlotsAvailability,
  STANDARD_TIME_SLOTS
} from '@/lib/slotCollision';

function getUpcomingAdminDates(): { dateStr: string; label: string; dayName: string }[] {
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

// Initial Mock Fallbacks
const INITIAL_MOCK_LEADS: DatabaseLead[] = [
  {
    id: 'lead-1',
    full_name: 'Rahul Sharma',
    whatsapp_number: '+919876543210',
    tech_stack: 'Java Full Stack (Spring Boot / React)',
    current_ctc_lpa: '14.5',
    notice_period: '30 Days',
    willing_to_invest: 'Yes',
    booking_date: '2026-10-19',
    booking_time: '03:15 PM IST',
    status: 'Pending Verification',
    notes: 'Interested in fintech transition.',
    created_at: '2026-10-17T06:30:00.000Z',
  },
  {
    id: 'lead-2',
    full_name: 'Ananya Verma',
    whatsapp_number: '+919123456789',
    tech_stack: 'Python / Django / Distributed Systems',
    current_ctc_lpa: '12.0',
    notice_period: '15 Days',
    willing_to_invest: 'Yes',
    booking_date: '2026-10-20',
    booking_time: '11:30 AM IST',
    status: 'Called',
    notes: 'Available for call tomorrow morning.',
    created_at: '2026-10-17T03:30:00.000Z',
  },
];

const INITIAL_MOCK_CLIENTS: DatabaseClient[] = [
  {
    id: 'cli-1',
    full_name: 'Karthik Raja',
    whatsapp_number: '+919988776655',
    tech_stack: 'DevOps / Cloud Architecture (AWS / K8s)',
    current_ctc_lpa: '18.0',
    fee_status: 'registration_paid_20k',
    naukri_status: 'Optimized',
    linkedin_status: 'Optimized',
    resume_url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    notes: 'Preparing for Wells Fargo coding round.',
    created_at: '2026-10-16T08:00:00.000Z',
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
    resume_url: null,
    notes: 'Offer stage in progress. Next: HR clearance.',
    created_at: '2026-10-14T08:00:00.000Z',
  },
];

const INITIAL_MOCK_SLOTS: DatabaseInterviewSlot[] = [
  {
    id: 'slot-1',
    client_id: 'cli-1',
    candidate_name: 'Karthik Raja',
    company_name: 'Wells Fargo',
    round_type: 'Technical Coding L1',
    scheduled_date: '2026-10-21',
    scheduled_time: '02:30 PM IST',
    priority: 'urgent',
    jd_text: 'Core Java, Multithreading, ConcurrentHashMap, Spring Cloud Gateway.',
    status: 'approved',
    invite_verified: true,
  },
  {
    id: 'slot-2',
    client_id: 'cli-2',
    candidate_name: 'Sneha Patel',
    company_name: 'PhonePe',
    round_type: 'Technical Coding L1',
    scheduled_date: '2026-10-21',
    scheduled_time: '04:00 PM IST',
    priority: 'standard',
    jd_text: 'Senior Frontend Engineer. Custom hooks, state machines.',
    status: 'approved',
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

export default function MobileAdminCommandCenter() {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  // Tab: 'slots' | 'clients' | 'leads'
  const [activeTab, setActiveTab] = useState<'slots' | 'clients' | 'leads'>('slots');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Data States
  const [leads, setLeads] = useState<DatabaseLead[]>(INITIAL_MOCK_LEADS);
  const [clients, setClients] = useState<DatabaseClient[]>(INITIAL_MOCK_CLIENTS);
  const [slots, setSlots] = useState<DatabaseInterviewSlot[]>(INITIAL_MOCK_SLOTS);

  // Note Modal State
  const [noteModalTarget, setNoteModalTarget] = useState<{
    type: 'lead' | 'client';
    id: string;
    name: string;
    currentNote: string;
  } | null>(null);
  const [noteInputText, setNoteInputText] = useState('');

  // Resume Upload / Edit Modal
  const [editingResumeClient, setEditingResumeClient] = useState<DatabaseClient | null>(null);
  const [resumeUrlInput, setResumeUrlInput] = useState('');
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  // Emergency / Per-Round Booking Modal State
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [isEmergencyCustomRound, setIsEmergencyCustomRound] = useState(false);
  const [emergencyCustomRoundText, setEmergencyCustomRoundText] = useState('');
  const [emergencyForm, setEmergencyForm] = useState({
    candidate_name: '',
    whatsapp_number: '',
    company_name: '',
    round_type: 'Technical Coding L1',
    round_fee: '₹3,000',
    scheduled_date: '2026-10-21',
    scheduled_time: '02:30 PM IST',
  });
  const [isSubmittingEmergency, setIsSubmittingEmergency] = useState(false);
  const [emergencyError, setEmergencyError] = useState<string | null>(null);

  // Edit Candidate Details (Admin Master Power) Modal State
  const [editingClientModal, setEditingClientModal] = useState<DatabaseClient | null>(null);
  const [editClientForm, setEditClientForm] = useState({
    full_name: '',
    whatsapp_number: '',
    tech_stack: '',
    current_ctc_lpa: '',
    client_type: 'full_package',
    fee_status: 'registration_paid_20k',
    naukri_status: 'in_progress',
    notes: '',
  });
  const [isSavingClientEdit, setIsSavingClientEdit] = useState(false);

  // Restore auth
  useEffect(() => {
    try {
      if (sessionStorage.getItem('cf_admin_auth') === 'true') {
        setIsAdminAuthenticated(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Fetch fresh data from Supabase
  const fetchAllData = async () => {
    try {
      const [leadsRes, clientsRes, slotsRes] = await Promise.all([
        supabase.from('candidate_leads').select('*').order('created_at', { ascending: false }),
        supabase.from('clients').select('*').order('created_at', { ascending: false }),
        supabase.from('interview_slots').select('*').order('scheduled_date', { ascending: true }),
      ]);

      if (leadsRes.data && leadsRes.data.length > 0) {
        setLeads(leadsRes.data);
      }
      if (clientsRes.data && clientsRes.data.length > 0) {
        setClients(clientsRes.data);
      }
      if (slotsRes.data && slotsRes.data.length > 0) {
        setSlots(slotsRes.data);
      }
    } catch {
      // Offline fallback
    }
  };

  useEffect(() => {
    fetchAllData();

    // Listen to real-time sync
    const unsubscribe = subscribeToSync((msg) => {
      fetchAllData();
      if (msg.type === 'SLOT_CREATED') {
        showToast('New Interview Slot booked by candidate!');
      } else if (msg.type === 'RESUME_UPDATED') {
        showToast('Resume sync acknowledged.');
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Admin Login
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPinInput.trim() === '8899') {
      setIsAdminAuthenticated(true);
      sessionStorage.setItem('cf_admin_auth', 'true');
      setPinError('');
    } else {
      setPinError('Invalid PIN code. Authorized team members only.');
    }
  };

  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
    sessionStorage.removeItem('cf_admin_auth');
    setAdminPinInput('');
  };

  // Convert Lead -> Client
  const handleConvertLead = async (lead: DatabaseLead) => {
    try {
      const cleanPhone = lead.whatsapp_number.trim();
      const existingClient = clients.find((c) => c.whatsapp_number === cleanPhone);

      let createdClient: DatabaseClient;

      if (existingClient) {
        createdClient = existingClient;
      } else {
        const clientPayload = {
          full_name: lead.full_name,
          whatsapp_number: cleanPhone,
          tech_stack: lead.tech_stack,
          current_ctc_lpa: lead.current_ctc_lpa || '12.0',
          fee_status: 'registration_paid_20k' as const,
          naukri_status: 'in_progress',
          linkedin_status: 'in_progress',
          resume_url: null,
          lead_id: lead.id,
          notes: lead.notes || 'Converted from Lead.',
        };

        const { data: insertedClient, error: clientError } = await supabase
          .from('clients')
          .insert([clientPayload])
          .select();

        if (clientError) throw clientError;

        createdClient = (insertedClient && insertedClient[0]) || {
          ...clientPayload,
          id: `cli-${Date.now()}`,
          created_at: new Date().toISOString(),
        };
      }

      if (lead.id) {
        await supabase
          .from('candidate_leads')
          .update({ status: 'Converted' })
          .eq('id', lead.id);
      }

      setLeads((prev) => prev.filter((l) => l.id !== lead.id));
      setClients((prev) => [createdClient, ...prev.filter((c) => c.id !== createdClient.id)]);

      broadcastSync('LEAD_CONVERTED', { leadId: lead.id, client: createdClient });

      showToast(`🎉 ${lead.full_name} converted to Enrolled Candidate!`);
      setActiveTab('clients');
    } catch {
      setLeads((prev) => prev.filter((l) => l.id !== lead.id));
      const localClient: DatabaseClient = {
        id: `cli-${Date.now()}`,
        full_name: lead.full_name,
        whatsapp_number: lead.whatsapp_number,
        tech_stack: lead.tech_stack,
        current_ctc_lpa: lead.current_ctc_lpa || '12.0',
        fee_status: 'registration_paid_20k',
        naukri_status: 'in_progress',
        linkedin_status: 'in_progress',
        resume_url: null,
        lead_id: lead.id,
        notes: lead.notes,
        created_at: new Date().toISOString(),
      };
      setClients((prev) => [localClient, ...prev]);
      showToast(`${lead.full_name} converted.`);
      setActiveTab('clients');
    }
  };

  const handleUpdateLeadStatus = async (leadId: string, newStatus: string) => {
    try {
      await supabase
        .from('candidate_leads')
        .update({ status: newStatus })
        .eq('id', leadId);

      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
      );
      showToast(`Lead status updated to: ${newStatus}`);
    } catch {
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
      );
      showToast(`Lead status updated.`);
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!confirm('Permanently delete this lead?')) return;

    try {
      await supabase.from('candidate_leads').delete().eq('id', leadId);
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      showToast('Lead deleted.');
    } catch {
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      showToast('Lead removed.');
    }
  };

  // Revert / Remove Client -> Reappears in Leads
  const handleRemoveClientToLeads = async (client: DatabaseClient) => {
    if (!confirm(`Remove ${client.full_name} from active candidates? They will reappear in Leads.`)) return;

    try {
      await supabase.from('clients').delete().eq('id', client.id);

      const matchingLead = leads.find((l) => l.whatsapp_number === client.whatsapp_number);
      if (matchingLead && matchingLead.id) {
        await supabase
          .from('candidate_leads')
          .update({ status: 'Pending Verification' })
          .eq('id', matchingLead.id);
      } else {
        await supabase.from('candidate_leads').insert([
          {
            full_name: client.full_name,
            whatsapp_number: client.whatsapp_number,
            tech_stack: client.tech_stack,
            current_ctc_lpa: client.current_ctc_lpa || '12.0',
            notice_period: '30 Days',
            willing_to_invest: 'Yes',
            booking_date: new Date().toISOString().split('T')[0],
            booking_time: '12:00 PM IST',
            status: 'Pending Verification',
            notes: client.notes,
          },
        ]);
      }

      setClients((prev) => prev.filter((c) => c.id !== client.id));
      setLeads((prev) => {
        const existing = prev.find((l) => l.whatsapp_number === client.whatsapp_number);
        if (existing) {
          return prev.map((l) => (l.whatsapp_number === client.whatsapp_number ? { ...l, status: 'Pending Verification' } : l));
        }
        const newLead: DatabaseLead = {
          id: client.lead_id || `lead-${Date.now()}`,
          full_name: client.full_name,
          whatsapp_number: client.whatsapp_number,
          tech_stack: client.tech_stack,
          current_ctc_lpa: client.current_ctc_lpa || '12.0',
          notice_period: '30 Days',
          willing_to_invest: 'Yes',
          booking_date: new Date().toISOString().split('T')[0],
          booking_time: '12:00 PM IST',
          status: 'Pending Verification',
          notes: client.notes,
        };
        return [newLead, ...prev];
      });

      broadcastSync('CLIENT_UPDATED');
      showToast(`${client.full_name} moved back to Leads list.`);
      setActiveTab('leads');
    } catch {
      setClients((prev) => prev.filter((c) => c.id !== client.id));
      setLeads((prev) =>
        prev.map((l) => (l.whatsapp_number === client.whatsapp_number ? { ...l, status: 'Pending Verification' } : l))
      );
      showToast(`${client.full_name} moved to Leads.`);
      setActiveTab('leads');
    }
  };

  // Toggle Job Profiles (Naukri & LinkedIn)
  const handleToggleProfilesStatus = async (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;

    const currentStatus = client.naukri_status || client.profiles_status || 'in_progress';
    const nextStatus = currentStatus === 'Optimized' ? 'in_progress' : 'Optimized';

    try {
      const { error } = await supabase
        .from('clients')
        .update({
          naukri_status: nextStatus,
          linkedin_status: nextStatus,
        })
        .eq('id', clientId);

      if (error) throw error;

      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId
            ? { ...c, naukri_status: nextStatus, linkedin_status: nextStatus, profiles_status: nextStatus }
            : c
        )
      );

      broadcastSync('CLIENT_UPDATED', { clientId, profiles_status: nextStatus });
      showToast(`Profiles updated to ${nextStatus === 'Optimized' ? 'Optimized' : 'In Progress'}`);
    } catch {
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId
            ? { ...c, naukri_status: nextStatus, linkedin_status: nextStatus, profiles_status: nextStatus }
            : c
        )
      );
      broadcastSync('CLIENT_UPDATED');
      showToast(`Profiles updated to ${nextStatus}`);
    }
  };

  // Save Resume Link
  const handleSaveResumeUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingResumeClient) return;

    const cleanUrl = resumeUrlInput.trim();

    try {
      await supabase
        .from('clients')
        .update({ resume_url: cleanUrl || null })
        .eq('id', editingResumeClient.id);

      setClients((prev) =>
        prev.map((c) => (c.id === editingResumeClient.id ? { ...c, resume_url: cleanUrl || null } : c))
      );

      broadcastSync('RESUME_UPDATED', {
        clientId: editingResumeClient.id,
        resume_url: cleanUrl || null,
      });

      setEditingResumeClient(null);
      showToast('ATS Verified Resume saved and synced to Candidate Portal!');
    } catch {
      setClients((prev) =>
        prev.map((c) => (c.id === editingResumeClient.id ? { ...c, resume_url: cleanUrl || null } : c))
      );
      broadcastSync('RESUME_UPDATED', {
        clientId: editingResumeClient.id,
        resume_url: cleanUrl || null,
      });
      setEditingResumeClient(null);
      showToast('Resume link saved locally.');
    }
  };

  const handleUploadResumeFile = (file: File) => {
    if (!file) return;
    setIsProcessingFile(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setIsProcessingFile(false);
      const dataUrl = ev.target?.result as string;
      if (dataUrl) {
        setResumeUrlInput(dataUrl);
        showToast('PDF loaded! Click Save to apply.');
      }
    };
    reader.onerror = () => {
      setIsProcessingFile(false);
      showToast('Could not read PDF file.');
    };
    reader.readAsDataURL(file);
  };

  // Cycle Fee Milestone
  const handleCycleFeeStatus = async (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;

    const cycle: DatabaseClient['fee_status'][] = [
      'registration_paid_20k',
      'offer_locked',
      'final_12_percent_paid',
    ];
    const idx = cycle.indexOf(client.fee_status);
    const next = cycle[(idx + 1) % cycle.length];

    try {
      await supabase
        .from('clients')
        .update({ fee_status: next })
        .eq('id', clientId);

      setClients((prev) =>
        prev.map((c) => (c.id === clientId ? { ...c, fee_status: next } : c))
      );
      broadcastSync('CLIENT_UPDATED', { clientId, fee_status: next });
      showToast('Milestone status updated');
    } catch {
      setClients((prev) =>
        prev.map((c) => (c.id === clientId ? { ...c, fee_status: next } : c))
      );
      showToast('Milestone status updated');
    }
  };

  // Notes Modal
  const handleOpenNoteModal = (type: 'lead' | 'client', id: string, name: string, currentNote: string = '') => {
    setNoteModalTarget({ type, id, name, currentNote });
    setNoteInputText(currentNote || '');
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteModalTarget) return;

    const { type, id } = noteModalTarget;
    const cleanNote = noteInputText.trim();

    try {
      if (type === 'lead') {
        await supabase
          .from('candidate_leads')
          .update({ notes: cleanNote || null })
          .eq('id', id);

        setLeads((prev) =>
          prev.map((l) => (l.id === id ? { ...l, notes: cleanNote || null } : l))
        );
      } else {
        await supabase
          .from('clients')
          .update({ notes: cleanNote || null })
          .eq('id', id);

        setClients((prev) =>
          prev.map((c) => (c.id === id ? { ...c, notes: cleanNote || null } : c))
        );
      }

      showToast('Note saved successfully!');
      setNoteModalTarget(null);
    } catch {
      if (type === 'lead') {
        setLeads((prev) =>
          prev.map((l) => (l.id === id ? { ...l, notes: cleanNote || null } : l))
        );
      } else {
        setClients((prev) =>
          prev.map((c) => (c.id === id ? { ...c, notes: cleanNote || null } : c))
        );
      }
      showToast('Note updated locally.');
      setNoteModalTarget(null);
    }
  };

  // Slots Management
  const handleCycleSlotStatus = async (slotId: string) => {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;

    const statuses: DatabaseInterviewSlot['status'][] = ['requested', 'approved', 'rescheduled', 'declined'];
    const idx = statuses.indexOf(slot.status);
    const nextStatus = statuses[(idx + 1) % statuses.length];

    try {
      await supabase
        .from('interview_slots')
        .update({ status: nextStatus })
        .eq('id', slotId);

      setSlots((prev) =>
        prev.map((s) => (s.id === slotId ? { ...s, status: nextStatus } : s))
      );
      broadcastSync('SLOT_UPDATED', { slotId, status: nextStatus });
      showToast(`Slot status: ${nextStatus}`);
    } catch {
      setSlots((prev) =>
        prev.map((s) => (s.id === slotId ? { ...s, status: nextStatus } : s))
      );
      showToast(`Slot status: ${nextStatus}`);
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    if (!confirm('Delete this interview slot?')) return;
    try {
      await supabase.from('interview_slots').delete().eq('id', slotId);
      setSlots((prev) => prev.filter((s) => s.id !== slotId));
      broadcastSync('SLOT_UPDATED');
      showToast('Interview slot removed.');
    } catch {
      setSlots((prev) => prev.filter((s) => s.id !== slotId));
      showToast('Slot removed.');
    }
  };

  // Emergency / Per-Round Booking Submission
  const handleEmergencySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmergencyError(null);

    const effectiveRoundType = isEmergencyCustomRound
      ? emergencyCustomRoundText.trim()
      : emergencyForm.round_type;

    const cleanPhone = emergencyForm.whatsapp_number.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setEmergencyError('Please enter a valid 10-digit WhatsApp number.');
      return;
    }
    if (!emergencyForm.candidate_name.trim() || !emergencyForm.company_name.trim()) {
      setEmergencyError('Candidate name and company name are required.');
      return;
    }
    if (isEmergencyCustomRound && !emergencyCustomRoundText.trim()) {
      setEmergencyError('Please enter the custom round type name.');
      return;
    }

    // Check collision prevention
    const collision = checkSlotCollision(
      emergencyForm.scheduled_time,
      emergencyForm.scheduled_date,
      slots
    );
    if (collision.isClash) {
      setEmergencyError(collision.message || 'Time slot already booked. Please choose an open slot.');
      return;
    }

    setIsSubmittingEmergency(true);

    try {
      let clientId = `cli-${Date.now()}`;
      let createdClient: DatabaseClient;

      const existingClient = clients.find(
        (c) => c.whatsapp_number.replace(/\D/g, '') === cleanPhone
      );

      if (existingClient) {
        clientId = existingClient.id;
        createdClient = { ...existingClient, client_type: 'per_round' };
        await supabase
          .from('clients')
          .update({ client_type: 'per_round' })
          .eq('id', clientId);
      } else {
        const clientPayload = {
          full_name: emergencyForm.candidate_name.trim(),
          whatsapp_number: cleanPhone,
          tech_stack: `${effectiveRoundType} (Emergency Support)`,
          current_ctc_lpa: '14.0',
          fee_status: 'offer_locked' as const,
          naukri_status: 'in_progress',
          linkedin_status: 'in_progress',
          client_type: 'per_round',
          notes: `Agreed Round Fee: ${emergencyForm.round_fee} for ${emergencyForm.company_name.trim()}`,
        };

        const { data: insertedClient, error: clientErr } = await supabase
          .from('clients')
          .insert([clientPayload])
          .select();

        if (clientErr) throw clientErr;

        createdClient = (insertedClient && insertedClient[0]) || {
          ...clientPayload,
          id: clientId,
          created_at: new Date().toISOString(),
        };
      }

      const slotPayload: Omit<DatabaseInterviewSlot, 'id' | 'created_at'> = {
        client_id: clientId,
        candidate_name: emergencyForm.candidate_name.trim(),
        company_name: emergencyForm.company_name.trim(),
        round_type: effectiveRoundType,
        scheduled_date: emergencyForm.scheduled_date,
        scheduled_time: emergencyForm.scheduled_time,
        priority: 'urgent',
        status: 'approved',
        round_fee: emergencyForm.round_fee,
        invite_verified: true,
      };

      const { data: insertedSlot, error: slotErr } = await supabase
        .from('interview_slots')
        .insert([slotPayload])
        .select();

      if (slotErr) throw slotErr;

      const createdSlot = (insertedSlot && insertedSlot[0]) || {
        ...slotPayload,
        id: `slot-${Date.now()}`,
        created_at: new Date().toISOString(),
      };

      setClients((prev) => [createdClient, ...prev.filter((c) => c.id !== createdClient.id)]);
      setSlots((prev) => [createdSlot, ...prev]);

      broadcastSync('SLOT_CREATED', createdSlot);
      showToast(`⚡ Emergency slot approved for ${emergencyForm.candidate_name}!`);
      setIsEmergencyModalOpen(false);

      setEmergencyForm({
        candidate_name: '',
        whatsapp_number: '',
        company_name: '',
        round_type: 'Technical Coding L1',
        round_fee: '₹3,000',
        scheduled_date: '2026-10-21',
        scheduled_time: '02:30 PM IST',
      });
      setIsEmergencyCustomRound(false);
      setEmergencyCustomRoundText('');
    } catch {
      // Offline fallback
      const fallbackClient: DatabaseClient = {
        id: `cli-${Date.now()}`,
        full_name: emergencyForm.candidate_name.trim(),
        whatsapp_number: cleanPhone,
        tech_stack: `${effectiveRoundType} (Emergency Support)`,
        current_ctc_lpa: '14.0',
        fee_status: 'offer_locked',
        naukri_status: 'in_progress',
        linkedin_status: 'in_progress',
        client_type: 'per_round',
        notes: `Agreed Round Fee: ${emergencyForm.round_fee}`,
        created_at: new Date().toISOString(),
      };

      const fallbackSlot: DatabaseInterviewSlot = {
        id: `slot-${Date.now()}`,
        client_id: fallbackClient.id,
        candidate_name: emergencyForm.candidate_name.trim(),
        company_name: emergencyForm.company_name.trim(),
        round_type: effectiveRoundType,
        scheduled_date: emergencyForm.scheduled_date,
        scheduled_time: emergencyForm.scheduled_time,
        priority: 'urgent',
        status: 'approved',
        round_fee: emergencyForm.round_fee,
        invite_verified: true,
        created_at: new Date().toISOString(),
      };

      setClients((prev) => [fallbackClient, ...prev]);
      setSlots((prev) => [fallbackSlot, ...prev]);
      broadcastSync('SLOT_CREATED', fallbackSlot);
      showToast(`⚡ Emergency slot approved (local sync)`);
      setIsEmergencyModalOpen(false);
    } finally {
      setIsSubmittingEmergency(false);
    }
  };

  // Open Master Edit Client Modal
  const handleOpenEditClientModal = (client: DatabaseClient) => {
    setEditingClientModal(client);
    setEditClientForm({
      full_name: client.full_name || '',
      whatsapp_number: client.whatsapp_number || '',
      tech_stack: client.tech_stack || '',
      current_ctc_lpa: String(client.current_ctc_lpa || '14.0'),
      client_type: client.client_type || 'full_package',
      fee_status: client.fee_status || 'registration_paid_20k',
      naukri_status: client.naukri_status || client.profiles_status || 'in_progress',
      notes: client.notes || '',
    });
  };

  // Save Master Edit Client
  const handleSaveClientEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClientModal?.id) return;
    if (!editClientForm.full_name.trim() || !editClientForm.whatsapp_number.trim()) {
      showToast('Full name and WhatsApp number are required.');
      return;
    }

    setIsSavingClientEdit(true);
    const updatedClient: DatabaseClient = {
      ...editingClientModal,
      full_name: editClientForm.full_name.trim(),
      whatsapp_number: editClientForm.whatsapp_number.trim(),
      tech_stack: editClientForm.tech_stack.trim() || 'Software Engineer',
      current_ctc_lpa: editClientForm.current_ctc_lpa.trim() || '14.0',
      client_type: editClientForm.client_type,
      fee_status: editClientForm.fee_status as DatabaseClient['fee_status'],
      naukri_status: editClientForm.naukri_status,
      linkedin_status: editClientForm.naukri_status,
      profiles_status: editClientForm.naukri_status,
      notes: editClientForm.notes.trim() || null,
    };

    try {
      await supabase
        .from('clients')
        .update({
          full_name: updatedClient.full_name,
          whatsapp_number: updatedClient.whatsapp_number,
          tech_stack: updatedClient.tech_stack,
          current_ctc_lpa: updatedClient.current_ctc_lpa,
          client_type: updatedClient.client_type,
          fee_status: updatedClient.fee_status,
          naukri_status: updatedClient.naukri_status,
          linkedin_status: updatedClient.linkedin_status,
          notes: updatedClient.notes,
        })
        .eq('id', editingClientModal.id);

      // If name was updated, synchronize candidate name across their interview slots
      if (updatedClient.full_name !== editingClientModal.full_name) {
        await supabase
          .from('interview_slots')
          .update({ candidate_name: updatedClient.full_name })
          .eq('client_id', editingClientModal.id);

        setSlots((prev) =>
          prev.map((s) =>
            s.client_id === editingClientModal.id
              ? { ...s, candidate_name: updatedClient.full_name }
              : s
          )
        );
      }

      setClients((prev) =>
        prev.map((c) => (c.id === editingClientModal.id ? updatedClient : c))
      );
      broadcastSync('CLIENT_UPDATED', { clientId: editingClientModal.id });
      showToast(`Master update saved for ${updatedClient.full_name}`);
      setEditingClientModal(null);
    } catch {
      setClients((prev) =>
        prev.map((c) => (c.id === editingClientModal.id ? updatedClient : c))
      );
      showToast('Master update saved locally.');
      setEditingClientModal(null);
    } finally {
      setIsSavingClientEdit(false);
    }
  };

  // Header Analytics (Zero Currency Amounts)
  const currentMonthYear = '2026-10';
  const clientsThisMonth = clients.filter((c) => (c.created_at || '').startsWith(currentMonthYear)).length;
  const leadsThisMonth = leads.filter((l) => (l.created_at || '').startsWith(currentMonthYear)).length;
  const totalClientsCount = clients.length;
  const registrationPaidCount = clients.filter((c) => c.fee_status === 'registration_paid_20k').length;
  const offerLockedCount = clients.filter((c) => c.fee_status === 'offer_locked' || c.fee_status === 'final_12_percent_paid').length;

  const activeLeads = leads.filter((l) => l.status !== 'Converted');

  // Group slots by date
  const slotsGroupedByDate = slots.reduce<Record<string, DatabaseInterviewSlot[]>>((acc, slot) => {
    const d = slot.scheduled_date || 'Unscheduled';
    if (!acc[d]) acc[d] = [];
    acc[d].push(slot);
    return acc;
  }, {});

  const conflictingDates = new Set<string>();
  Object.entries(slotsGroupedByDate).forEach(([date, daySlots]) => {
    for (let i = 0; i < daySlots.length; i++) {
      for (let j = i + 1; j < daySlots.length; j++) {
        const m1 = timeToMinutes(daySlots[i].scheduled_time);
        const m2 = timeToMinutes(daySlots[j].scheduled_time);
        if (Math.abs(m1 - m2) < 45) {
          conflictingDates.add(date);
        }
      }
    }
  });

  // -------------------------------------------------------------
  // PIN LOCK SCREEN (PURE DARK BLACK)
  // -------------------------------------------------------------
  if (!isAdminAuthenticated) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col justify-center px-4 py-12">
        <div className="w-full max-w-sm mx-auto">
          <div className="mb-8 text-center">
            <span className="inline-block px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full bg-zinc-900 text-zinc-300 border border-zinc-800 mb-3">
              Admin Access Only
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              Operations Center
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Master schedule & candidate controller
            </p>
          </div>

          <div className="bg-[#111113] border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 bg-black border border-zinc-800 rounded-2xl flex items-center justify-center mx-auto text-white">
              <Lock className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h2 className="text-sm font-extrabold text-white">Enter Master PIN</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Authorized team passkey</p>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-4">
              <input
                type="password"
                maxLength={6}
                value={adminPinInput}
                onChange={(e) => setAdminPinInput(e.target.value)}
                placeholder="PIN: 8899"
                className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-center text-lg font-mono tracking-widest text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none transition-all"
              />

              {pinError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 text-center font-bold">
                  {pinError}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-white hover:bg-zinc-200 text-black font-extrabold text-xs py-3 px-4 rounded-xl transition-all shadow-md active:scale-[0.98]"
              >
                Unlock Operations
              </button>
            </form>

            <div className="pt-3 border-t border-zinc-800/80 text-center">
              <button
                type="button"
                onClick={() => setAdminPinInput('8899')}
                className="text-[11px] text-zinc-500 hover:text-white font-mono transition-colors"
              >
                Auto-fill Master PIN: 8899
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // MAIN ADMIN DASHBOARD (PURE DARK BLACK THEME)
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-black text-white pb-20 pt-4 sm:pt-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-4 inset-x-4 max-w-sm mx-auto z-50 bg-zinc-900 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center justify-between text-xs border border-zinc-700">
          <span className="font-semibold">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-zinc-400 hover:text-white ml-2">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-md mx-auto px-4 space-y-4">
        {/* Top Header */}
        <header className="flex items-center justify-between pb-3.5 border-b border-zinc-800">
          <div>
            <span className="text-xs font-bold text-zinc-400 block">Operations Desk</span>
            <h1 className="text-xl font-extrabold text-white tracking-tight">
              Control Center
            </h1>
          </div>
          <button
            onClick={handleAdminLogout}
            title="Sign out"
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl transition-colors border border-zinc-800"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </header>

        {/* PROMINENT EMERGENCY / PER-ROUND BOOKING BUTTON */}
        <button
          type="button"
          onClick={() => {
            setEmergencyError(null);
            setIsEmergencyModalOpen(true);
          }}
          className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-black font-extrabold text-xs py-3 px-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all border border-emerald-400/50 cursor-pointer"
        >
          <Zap className="w-4 h-4 fill-black" />
          <span>+ Emergency / Per-Round Booking</span>
        </button>

        {/* ======================================================== */}
        {/* MAIN HEADER ANALYTICS (ZERO CURRENCY AMOUNTS SHOWN)      */}
        {/* ======================================================== */}
        <section className="bg-[#111113] border border-zinc-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
            <h2 className="text-xs font-extrabold text-white uppercase tracking-wider">
              Overview
            </h2>
            <span className="text-xs font-mono text-zinc-400 font-bold">
              October 2026
            </span>
          </div>

          {/* Row 1: Monthly Inflow */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-black/60 border border-zinc-800 rounded-xl p-2.5">
              <span className="block text-[10px] font-bold text-zinc-400 uppercase">
                Clients (Mo.)
              </span>
              <strong className="block text-xl font-extrabold font-mono text-white mt-0.5">
                {clientsThisMonth}
              </strong>
            </div>
            <div className="bg-black/60 border border-zinc-800 rounded-xl p-2.5">
              <span className="block text-[10px] font-bold text-zinc-400 uppercase">
                Leads (Mo.)
              </span>
              <strong className="block text-xl font-extrabold font-mono text-white mt-0.5">
                {leadsThisMonth}
              </strong>
            </div>
            <div className="bg-black/60 border border-zinc-800 rounded-xl p-2.5">
              <span className="block text-[10px] font-bold text-zinc-400 uppercase">
                Total Clients
              </span>
              <strong className="block text-xl font-extrabold font-mono text-white mt-0.5">
                {totalClientsCount}
              </strong>
            </div>
          </div>

          {/* Row 2: Milestone Counts (No currency amounts) */}
          <div className="grid grid-cols-2 gap-2 text-center pt-1">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-2.5">
              <span className="block text-[10px] font-extrabold text-emerald-400 uppercase tracking-wide">
                Registration Verified
              </span>
              <strong className="block text-xl font-extrabold font-mono text-emerald-300 mt-0.5">
                {registrationPaidCount}
              </strong>
              <span className="block text-[10px] text-emerald-400/80 mt-0.5 font-medium">
                Converted to Candidate
              </span>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5">
              <span className="block text-[10px] font-extrabold text-amber-400 uppercase tracking-wide">
                Offer Letter Cleared
              </span>
              <strong className="block text-xl font-extrabold font-mono text-amber-300 mt-0.5">
                {offerLockedCount}
              </strong>
              <span className="block text-[10px] text-amber-400/80 mt-0.5 font-medium">
                Offer Stage Cleared
              </span>
            </div>
          </div>
        </section>

        {/* Tab Switcher */}
        <div className="grid grid-cols-3 bg-[#111113] border border-zinc-800 p-1 rounded-2xl gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('slots')}
            className={`py-2 text-xs font-extrabold rounded-xl transition-all text-center flex items-center justify-center gap-1.5 ${
              activeTab === 'slots'
                ? 'bg-white text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span>Interviews</span>
            <span className={`font-mono text-[10px] px-1 rounded ${
              activeTab === 'slots' ? 'bg-zinc-200 text-black' : 'bg-zinc-800 text-zinc-400'
            }`}>
              {slots.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('clients')}
            className={`py-2 text-xs font-extrabold rounded-xl transition-all text-center flex items-center justify-center gap-1.5 ${
              activeTab === 'clients'
                ? 'bg-white text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span>Candidates</span>
            <span className={`font-mono text-[10px] px-1 rounded ${
              activeTab === 'clients' ? 'bg-zinc-200 text-black' : 'bg-zinc-800 text-zinc-400'
            }`}>
              {clients.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('leads')}
            className={`py-2 text-xs font-extrabold rounded-xl transition-all text-center flex items-center justify-center gap-1.5 ${
              activeTab === 'leads'
                ? 'bg-white text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span>Leads</span>
            <span className={`font-mono text-[10px] px-1 rounded ${
              activeTab === 'leads' ? 'bg-zinc-200 text-black' : 'bg-zinc-800 text-zinc-400'
            }`}>
              {activeLeads.length}
            </span>
          </button>
        </div>

        {/* ======================================================== */}
        {/* TAB 1: INTERVIEWS & MASTER SCHEDULE                      */}
        {/* ======================================================== */}
        {activeTab === 'slots' && (
          <div className="space-y-3">
            {conflictingDates.size > 0 && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs flex items-center gap-2 text-amber-400">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>Schedule Clash:</strong> Multiple interviews on{' '}
                  {Array.from(conflictingDates).join(', ')}. Mentors coordinate directly.
                </span>
              </div>
            )}

            <div className="bg-[#111113] border border-zinc-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-white">
                  Master Interview Schedule
                </h2>
                <span className="text-xs text-zinc-400 font-mono font-bold">
                  {slots.length} Total
                </span>
              </div>

              {Object.keys(slotsGroupedByDate).length === 0 ? (
                <div className="text-center py-6 text-xs text-zinc-400">
                  No interview slots scheduled yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(slotsGroupedByDate).map(([dateStr, dateSlots]) => {
                    const hasConflict = conflictingDates.has(dateStr);
                    return (
                      <div key={dateStr} className="border border-zinc-800 rounded-xl p-3 bg-black/60">
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
                          <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-white">
                            <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                            <span>{dateStr}</span>
                          </div>
                          {hasConflict && (
                            <span className="text-[10px] text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                              <AlertTriangle className="w-2.5 h-2.5" /> Clash
                            </span>
                          )}
                        </div>

                        <div className="divide-y divide-zinc-800">
                          {dateSlots.map((slot) => {
                            const client = clients.find((c) => c.id === slot.client_id);
                            const candName = slot.candidate_name || client?.full_name || 'Candidate';
                            const isEmergency = client?.client_type === 'per_round' || Boolean(slot.round_fee);
                            const feeDisplay = slot.round_fee
                              ? (typeof slot.round_fee === 'string' && slot.round_fee.startsWith('₹')
                                  ? slot.round_fee
                                  : `₹${slot.round_fee}`)
                              : '₹3,000';

                            return (
                              <div key={slot.id} className="py-2.5 first:pt-0 last:pb-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <strong className="text-xs font-extrabold text-white">
                                        {slot.company_name}
                                      </strong>
                                      <span className="text-[11px] text-zinc-400">
                                        ({candName})
                                      </span>
                                      {slot.invite_verified && (
                                        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded font-bold border border-emerald-500/30">
                                          ✓ Genuine Invite
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-zinc-400">
                                      {slot.round_type}
                                    </div>
                                    <div className="text-[11px] font-mono text-zinc-400">
                                      {slot.scheduled_time}
                                    </div>

                                    {/* Visual Client Type Distinction Badges */}
                                    <div className="pt-0.5">
                                      {isEmergency ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/30">
                                          <Zap className="w-2.5 h-2.5 fill-emerald-400" />
                                          Emergency Per-Round - Fee: {feeDisplay}
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/30">
                                          <ShieldCheck className="w-2.5 h-2.5" />
                                          Full Retainer Client
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="text-right shrink-0 space-y-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleCycleSlotStatus(slot.id)}
                                      className={`block ml-auto text-[10px] uppercase font-bold px-2 py-0.5 rounded transition-colors ${
                                        slot.status === 'approved'
                                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                          : slot.status === 'rescheduled'
                                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                          : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                                      }`}
                                    >
                                      {slot.status} ↺
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleDeleteSlot(slot.id)}
                                      className="p-1 text-zinc-500 hover:text-red-400"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: CANDIDATES MANAGEMENT (WITH NOTES OPTION)         */}
        {/* ======================================================== */}
        {activeTab === 'clients' && (
          <div className="space-y-3">
            <div className="bg-[#111113] border border-zinc-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-white">
                  Enrolled Candidates ({clients.length})
                </h2>
              </div>

              {clients.length === 0 ? (
                <div className="text-center py-6 text-xs text-zinc-400">
                  No enrolled candidates yet. Convert leads to add candidates.
                </div>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {clients.map((c) => {
                    const profilesStatus = c.naukri_status || c.profiles_status || 'in_progress';

                    return (
                      <div key={c.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <strong className="text-xs font-extrabold text-white">
                                {c.full_name}
                              </strong>
                              {c.client_type === 'per_round' ? (
                                <span className="text-[10px] font-extrabold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/30">
                                  Emergency Per-Round
                                </span>
                              ) : (
                                <span className="text-[10px] font-extrabold text-blue-400 bg-blue-500/10 px-1.5 py-0.2 rounded border border-blue-500/30">
                                  Retainer
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-zinc-400 block">{c.tech_stack}</span>
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-300">
                              <span>
                                CTC: <strong className="font-mono text-white">{c.current_ctc_lpa || '12.0'} LPA</strong>
                              </span>
                              <span>•</span>
                              <span className="font-mono text-zinc-400">{c.whatsapp_number}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* WhatsApp link */}
                            <a
                              href={`https://wa.me/${c.whatsapp_number.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-white border border-zinc-800"
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                            </a>

                            {/* Edit Candidate Profile button (Admin Power) */}
                            <button
                              type="button"
                              title="Edit candidate profile & controls"
                              onClick={() => handleOpenEditClientModal(c)}
                              className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-lg border border-zinc-800 transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-zinc-400" />
                            </button>

                            {/* Note button */}
                            <button
                              type="button"
                              title="Edit candidate note"
                              onClick={() => handleOpenNoteModal('client', c.id, c.full_name, c.notes || '')}
                              className={`p-1.5 rounded-lg border transition-colors ${
                                c.notes
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : 'bg-zinc-900 text-zinc-400 hover:text-white border-zinc-800'
                              }`}
                            >
                              <StickyNote className="w-3.5 h-3.5" />
                            </button>

                            {/* Remove Client -> Moves back to Leads */}
                            <button
                              type="button"
                              title="Move back to Leads"
                              onClick={() => handleRemoveClientToLeads(c)}
                              className="p-1.5 text-zinc-400 hover:text-amber-400 bg-zinc-900 border border-zinc-800 rounded-lg transition-colors"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Note preview if exists */}
                        {c.notes && (
                          <div
                            onClick={() => handleOpenNoteModal('client', c.id, c.full_name, c.notes || '')}
                            className="p-2 bg-black/60 border border-zinc-800 rounded-lg text-[11px] text-zinc-300 cursor-pointer hover:border-zinc-700 flex items-center justify-between"
                          >
                            <span className="italic line-clamp-1">"{c.notes}"</span>
                            <Edit3 className="w-3 h-3 text-zinc-500 shrink-0 ml-1" />
                          </div>
                        )}

                        {/* Controls Matrix */}
                        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-800/80">
                          {/* Control 1: Job Profiles */}
                          <button
                            type="button"
                            onClick={() => handleToggleProfilesStatus(c.id)}
                            className="text-left bg-black border border-zinc-800 p-2 rounded-xl transition-colors hover:border-zinc-700"
                          >
                            <span className="block text-[9px] font-mono uppercase text-zinc-400 font-bold">
                              Job Profiles
                            </span>
                            <span
                              className={`inline-block text-[11px] font-extrabold mt-0.5 ${
                                profilesStatus === 'Optimized'
                                  ? 'text-emerald-400'
                                  : 'text-amber-400'
                              }`}
                            >
                              {profilesStatus === 'Optimized' ? 'Optimized ✅' : 'In Progress ⏳'}
                            </span>
                          </button>

                          {/* Control 2: ATS Verified Resume */}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingResumeClient(c);
                              setResumeUrlInput(c.resume_url || '');
                            }}
                            className="text-left bg-black border border-zinc-800 p-2 rounded-xl transition-colors hover:border-zinc-700"
                          >
                            <span className="block text-[9px] font-mono uppercase text-zinc-400 font-bold">
                              Master Resume
                            </span>
                            <span
                              className={`inline-block text-[11px] font-extrabold mt-0.5 ${
                                c.resume_url ? 'text-emerald-400' : 'text-amber-400'
                              }`}
                            >
                              {c.resume_url ? 'ATS Verified 📄' : '+ Add PDF'}
                            </span>
                          </button>

                          {/* Control 3: Fee Milestone (NO AMOUNTS) */}
                          <button
                            type="button"
                            onClick={() => handleCycleFeeStatus(c.id)}
                            className="text-left bg-black border border-zinc-800 p-2 rounded-xl transition-colors hover:border-zinc-700"
                          >
                            <span className="block text-[9px] font-mono uppercase text-zinc-400 font-bold">
                              Milestone
                            </span>
                            <span className="inline-block text-[11px] font-extrabold mt-0.5 text-white truncate">
                              {c.fee_status === 'registration_paid_20k'
                                ? 'Registration Verified'
                                : c.fee_status === 'offer_locked'
                                ? 'Offer Locked'
                                : 'Cleared'}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: LEADS MANAGEMENT (WITH NOTES OPTION)              */}
        {/* ======================================================== */}
        {activeTab === 'leads' && (
          <div className="space-y-3">
            <div className="bg-[#111113] border border-zinc-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-white">
                  Active Leads ({activeLeads.length})
                </h2>
                <span className="text-[11px] text-zinc-400 font-mono">
                  Inflow Pipeline
                </span>
              </div>

              {activeLeads.length === 0 ? (
                <div className="text-center py-6 text-xs text-zinc-400">
                  No active unconverted leads.
                </div>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {activeLeads.map((l) => (
                    <div key={l.id} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <strong className="text-xs font-extrabold text-white block">
                            {l.full_name}
                          </strong>
                          <span className="text-[11px] text-zinc-400 block">{l.tech_stack}</span>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-300 font-mono">
                            <span>CTC: {l.current_ctc_lpa} LPA</span>
                            <span>•</span>
                            <span>Notice: {l.notice_period}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0 space-y-1.5">
                          {/* 1-Click Convert & Enroll Button */}
                          <button
                            type="button"
                            onClick={() => handleConvertLead(l)}
                            className="inline-flex items-center gap-1 text-[11px] font-extrabold text-black bg-white hover:bg-zinc-200 px-3 py-1 rounded-lg transition-colors shadow-sm"
                          >
                            <UserPlus className="w-3 h-3 text-black" />
                            <span>Convert & Enroll</span>
                          </button>

                          <div className="flex items-center justify-end gap-1.5">
                            {/* Note button */}
                            <button
                              type="button"
                              title="Edit lead note"
                              onClick={() => l.id && handleOpenNoteModal('lead', l.id, l.full_name, l.notes || '')}
                              className={`p-1 rounded border transition-colors ${
                                l.notes
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : 'bg-zinc-900 text-zinc-400 hover:text-white border-zinc-800'
                              }`}
                            >
                              <StickyNote className="w-3.5 h-3.5" />
                            </button>

                            {/* Status Selector Dropdown */}
                            <select
                              value={l.status}
                              onChange={(e) => l.id && handleUpdateLeadStatus(l.id, e.target.value)}
                              className="text-[10px] font-mono font-bold bg-black border border-zinc-800 rounded px-1.5 py-0.5 text-white"
                            >
                              <option value="Pending Verification">Pending Verification</option>
                              <option value="Called">Called</option>
                              <option value="Diagnostic Scheduled">Diagnostic Scheduled</option>
                              <option value="Converted">Converted</option>
                            </select>

                            {/* Delete Lead */}
                            <button
                              type="button"
                              title="Delete Lead"
                              onClick={() => l.id && handleDeleteLead(l.id)}
                              className="p-1 text-zinc-500 hover:text-red-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Note preview if exists */}
                      {l.notes && (
                        <div
                          onClick={() => l.id && handleOpenNoteModal('lead', l.id, l.full_name, l.notes || '')}
                          className="p-2 bg-black/60 border border-zinc-800 rounded-lg text-[11px] text-zinc-300 cursor-pointer hover:border-zinc-700 flex items-center justify-between"
                        >
                          <span className="italic line-clamp-1">"{l.notes}"</span>
                          <Edit3 className="w-3 h-3 text-zinc-500 shrink-0 ml-1" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL: EDIT NOTE (FOR BOTH LEADS AND CLIENTS)            */}
      {/* ======================================================== */}
      {noteModalTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#121214] rounded-3xl max-w-sm w-full p-5 border border-zinc-800 shadow-2xl space-y-4 text-white">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div>
                <h3 className="text-sm font-extrabold text-white">
                  {noteModalTarget.type === 'lead' ? 'Lead Note' : 'Candidate Note'}
                </h3>
                <p className="text-xs text-zinc-400">{noteModalTarget.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setNoteModalTarget(null)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNote} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Operational Notes & Progress
                </label>
                <textarea
                  rows={4}
                  value={noteInputText}
                  onChange={(e) => setNoteInputText(e.target.value)}
                  placeholder="e.g. Cleared L1 on 20 Oct. Target role: Lead DevOps. Strong in K8s."
                  className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setNoteModalTarget(null)}
                  className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs py-2 rounded-xl transition-colors border border-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-white hover:bg-zinc-200 text-black font-extrabold text-xs py-2 rounded-xl transition-colors"
                >
                  Save Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: RESUME UPLOAD / GOOGLE DRIVE LINK (0 STORAGE USED) */}
      {/* ======================================================== */}
      {editingResumeClient && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#121214] rounded-3xl max-w-sm w-full p-5 border border-zinc-800 shadow-2xl space-y-4 text-white">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div>
                <h3 className="text-sm font-extrabold text-white">Upload ATS Verified Resume</h3>
                <p className="text-xs text-zinc-400">
                  {editingResumeClient.full_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingResumeClient(null)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2.5 bg-black/60 border border-zinc-800 rounded-xl text-xs text-zinc-400 space-y-1">
              <span className="font-bold text-white block">💡 Free Storage Tip:</span>
              <p>
                Paste a Google Drive or OneDrive PDF share link to use <strong>0 bytes of Supabase database quota</strong>, or select a PDF directly below.
              </p>
            </div>

            <form onSubmit={handleSaveResumeUrl} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Google Drive / Cloud Link
                </label>
                <input
                  type="text"
                  value={resumeUrlInput.startsWith('data:') ? 'Local PDF selected (ready to save)' : resumeUrlInput}
                  onChange={(e) => setResumeUrlInput(e.target.value)}
                  placeholder="https://drive.google.com/file/d/.../view"
                  className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Or Pick Local PDF File
                </label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadResumeFile(file);
                  }}
                  className="w-full text-xs text-zinc-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700 cursor-pointer"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingResumeClient(null)}
                  className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs py-2.5 rounded-xl transition-colors border border-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessingFile}
                  className="flex-1 bg-white hover:bg-zinc-200 text-black font-extrabold text-xs py-2.5 rounded-xl transition-colors"
                >
                  Save & Sync
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: EMERGENCY / PER-ROUND BOOKING MODAL               */}
      {/* ======================================================== */}
      {isEmergencyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-[#111113] rounded-t-3xl sm:rounded-3xl max-w-md w-full p-6 border border-zinc-800 shadow-2xl space-y-4 text-white max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Zap className="w-4 h-4 fill-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">
                    Emergency / Per-Round Booking
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Single urgent interview round • Clash-protected
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEmergencyModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {emergencyError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                <span>{emergencyError}</span>
              </div>
            )}

            <form onSubmit={handleEmergencySubmit} className="space-y-3.5">
              {/* Candidate Name & WhatsApp */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1">
                    Candidate Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={emergencyForm.candidate_name}
                    onChange={(e) =>
                      setEmergencyForm({ ...emergencyForm, candidate_name: e.target.value })
                    }
                    placeholder="e.g. Ramesh Varma"
                    className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1">
                    WhatsApp Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={emergencyForm.whatsapp_number}
                    onChange={(e) =>
                      setEmergencyForm({ ...emergencyForm, whatsapp_number: e.target.value })
                    }
                    placeholder="e.g. 9876543210"
                    className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Company & Round Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={emergencyForm.company_name}
                    onChange={(e) =>
                      setEmergencyForm({ ...emergencyForm, company_name: e.target.value })
                    }
                    placeholder="e.g. Oracle, Swiggy"
                    className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1">
                    Round Type *
                  </label>
                  <select
                    value={isEmergencyCustomRound ? 'Custom' : emergencyForm.round_type}
                    onChange={(e) => {
                      if (e.target.value === 'Custom') {
                        setIsEmergencyCustomRound(true);
                      } else {
                        setIsEmergencyCustomRound(false);
                        setEmergencyForm({ ...emergencyForm, round_type: e.target.value });
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
              </div>

              {/* Custom Round Type Input if selected */}
              {isEmergencyCustomRound && (
                <div>
                  <label className="block text-[11px] font-bold text-emerald-400 mb-1">
                    Custom Round Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={emergencyCustomRoundText}
                    onChange={(e) => setEmergencyCustomRoundText(e.target.value)}
                    placeholder="e.g. Director Round, Assignment Review, Live Architecture"
                    className="w-full bg-black border border-emerald-500/50 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-emerald-400 focus:outline-none"
                  />
                </div>
              )}

              {/* Agreed Round Fee */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Agreed Round Fee *
                </label>
                <div className="flex gap-2 mb-2">
                  {['₹3,000', '₹4,000', '₹5,000', '₹6,000'].map((fee) => (
                    <button
                      key={fee}
                      type="button"
                      onClick={() => setEmergencyForm({ ...emergencyForm, round_fee: fee })}
                      className={`flex-1 py-1.5 px-2 text-xs font-mono font-bold rounded-xl border text-center transition-colors ${
                        emergencyForm.round_fee === fee
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
                          : 'bg-black border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {fee}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={emergencyForm.round_fee}
                  onChange={(e) =>
                    setEmergencyForm({ ...emergencyForm, round_fee: e.target.value })
                  }
                  placeholder="Custom fee, e.g. ₹4,500"
                  className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                />
              </div>

              {/* Date Selection */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  Interview Date *
                </label>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {getUpcomingAdminDates().map(({ dateStr, label, dayName }) => {
                    const isSelected = dateStr === emergencyForm.scheduled_date;
                    const dayBookingsCount = slots.filter(
                      (s) =>
                        s.scheduled_date === dateStr &&
                        s.status !== 'declined' &&
                        s.status !== 'cancelled'
                    ).length;

                    return (
                      <button
                        key={dateStr}
                        type="button"
                        onClick={() =>
                          setEmergencyForm({ ...emergencyForm, scheduled_date: dateStr })
                        }
                        className={`flex flex-col items-center py-2 px-3 rounded-xl border text-center shrink-0 transition-all ${
                          isSelected
                            ? 'bg-white text-black border-white shadow-md'
                            : 'bg-black border-zinc-800 text-zinc-400 hover:bg-zinc-900'
                        }`}
                      >
                        <span className="text-[10px] font-mono uppercase">{dayName}</span>
                        <strong className="text-xs font-extrabold mt-0.5">{label}</strong>
                        {dayBookingsCount > 0 && (
                          <span
                            className={`text-[9px] mt-1 px-1 rounded font-mono ${
                              isSelected ? 'bg-zinc-800 text-white' : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {dayBookingsCount} booked
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Clash-Free Available Time Slot Grid */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-zinc-300">
                    Available Time Slot (IST) *
                  </label>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    Booked slots auto-disabled
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {getTimeSlotsAvailability(emergencyForm.scheduled_date, slots).map(
                    ({ time, isBooked, conflictInfo }) => {
                      const isSelected = emergencyForm.scheduled_time === time;
                      return (
                        <button
                          key={time}
                          type="button"
                          disabled={isBooked}
                          onClick={() =>
                            setEmergencyForm({ ...emergencyForm, scheduled_time: time })
                          }
                          title={isBooked ? `Clashes with ${conflictInfo}` : 'Slot available'}
                          className={`py-2 px-2.5 text-xs font-mono font-bold rounded-xl border text-center transition-all ${
                            isBooked
                              ? 'opacity-35 line-through bg-zinc-950 border-zinc-900 text-zinc-600 cursor-not-allowed'
                              : isSelected
                              ? 'bg-emerald-500 text-black border-emerald-400 shadow-md font-extrabold'
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
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEmergencyModalOpen(false)}
                  className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs py-3 rounded-xl transition-colors border border-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEmergency}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs py-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/40 disabled:opacity-50"
                >
                  {isSubmittingEmergency ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Approve & Book Slot</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: ADMIN MASTER EDIT CANDIDATE (OVERRIDE POWER)      */}
      {/* ======================================================== */}
      {editingClientModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#121214] rounded-3xl max-w-md w-full p-6 border border-zinc-800 shadow-2xl space-y-4 text-white max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">
                    Master Edit Candidate
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Administrator authority & profile override
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingClientModal(null)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveClientEdit} className="space-y-3.5">
              {/* Full Name & WhatsApp */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1">
                    Candidate Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editClientForm.full_name}
                    onChange={(e) =>
                      setEditClientForm({ ...editClientForm, full_name: e.target.value })
                    }
                    className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1">
                    WhatsApp Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={editClientForm.whatsapp_number}
                    onChange={(e) =>
                      setEditClientForm({ ...editClientForm, whatsapp_number: e.target.value })
                    }
                    className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Primary Role / Tech Stack */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Primary Tech Stack / Track *
                </label>
                <input
                  type="text"
                  required
                  value={editClientForm.tech_stack}
                  onChange={(e) =>
                    setEditClientForm({ ...editClientForm, tech_stack: e.target.value })
                  }
                  placeholder="e.g. Java Full Stack / Spring Boot / React"
                  className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                />
              </div>

              {/* CTC & Client Tier */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1">
                    Current CTC (LPA)
                  </label>
                  <input
                    type="text"
                    value={editClientForm.current_ctc_lpa}
                    onChange={(e) =>
                      setEditClientForm({ ...editClientForm, current_ctc_lpa: e.target.value })
                    }
                    placeholder="e.g. 14.5"
                    className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1">
                    Client Tier *
                  </label>
                  <select
                    value={editClientForm.client_type}
                    onChange={(e) =>
                      setEditClientForm({ ...editClientForm, client_type: e.target.value })
                    }
                    className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:border-zinc-500 focus:outline-none"
                  >
                    <option value="full_package">Full Retainer Client</option>
                    <option value="per_round">Emergency Per-Round</option>
                  </select>
                </div>
              </div>

              {/* Milestone & Profiles Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1">
                    Fee Status Milestone
                  </label>
                  <select
                    value={editClientForm.fee_status}
                    onChange={(e) =>
                      setEditClientForm({ ...editClientForm, fee_status: e.target.value })
                    }
                    className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:border-zinc-500 focus:outline-none"
                  >
                    <option value="registration_paid_20k">Registration Paid</option>
                    <option value="offer_locked">Offer Stage Locked</option>
                    <option value="final_12_percent_paid">Final 12% Settled</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-300 mb-1">
                    Job Profiles Status
                  </label>
                  <select
                    value={editClientForm.naukri_status}
                    onChange={(e) =>
                      setEditClientForm({ ...editClientForm, naukri_status: e.target.value })
                    }
                    className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:border-zinc-500 focus:outline-none"
                  >
                    <option value="in_progress">In Progress</option>
                    <option value="Optimized">Optimized</option>
                  </select>
                </div>
              </div>

              {/* Operational Notes */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Operational Notes
                </label>
                <textarea
                  rows={3}
                  value={editClientForm.notes}
                  onChange={(e) =>
                    setEditClientForm({ ...editClientForm, notes: e.target.value })
                  }
                  placeholder="e.g. Target companies: Wells Fargo, Oracle, Swiggy. Focus on System Design."
                  className="w-full bg-black border border-zinc-800 rounded-xl p-2.5 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingClientModal(null)}
                  className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs py-2.5 rounded-xl transition-colors border border-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingClientEdit}
                  className="flex-1 bg-white hover:bg-zinc-200 text-black font-extrabold text-xs py-2.5 rounded-xl transition-colors"
                >
                  {isSavingClientEdit ? 'Saving Master...' : 'Save Master Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
