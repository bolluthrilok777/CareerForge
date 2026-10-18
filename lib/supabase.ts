import { createClient } from '@supabase/supabase-js';

let envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (envUrl) {
  envUrl = envUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
}

const supabaseUrl = envUrl && envUrl.length > 0 ? envUrl : 'https://placeholder-project.supabase.co';
const supabaseAnonKey = envKey && envKey.length > 0 ? envKey : 'placeholder-anon-key';

export const isSupabaseConfigured = Boolean(
  envUrl && envKey && !envUrl.includes('placeholder-project')
);

// Initialize the Supabase client with safe fallback for static/build generation
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface DatabaseLead {
  id?: string;
  full_name: string;
  whatsapp_number: string;
  tech_stack: string;
  current_ctc_lpa: string | number;
  target_ctc_lpa?: string | number;
  notice_period: string;
  willing_to_invest: string;
  booking_date: string;
  booking_time: string;
  status: string;
  notes?: string | null;
  created_at?: string;
}

export interface DatabaseClient {
  id: string;
  created_at?: string;
  lead_id?: string | null;
  full_name: string;
  whatsapp_number: string;
  tech_stack: string;
  current_ctc_lpa?: string | number;
  target_ctc_lpa?: string;
  fee_status: 'registration_paid_20k' | 'offer_locked' | 'final_12_percent_paid';
  naukri_status?: string;
  linkedin_status?: string;
  profiles_status?: string;
  resume_url?: string | null;
  notes?: string | null;
  client_type?: 'per_round' | 'full_package' | string | null;
}

export interface DatabaseInterviewSlot {
  id: string;
  created_at?: string;
  client_id: string;
  company_name: string;
  round_type: string;
  scheduled_date: string;
  scheduled_time: string;
  jd_text?: string | null;
  meeting_link?: string | null;
  status: 'requested' | 'approved' | 'declined' | 'rescheduled' | 'cancelled';
  priority?: 'urgent' | 'high' | 'standard';
  invite_verified?: boolean;
  verification_status?: string;
  candidate_name?: string;
  tech_stack?: string;
  round_fee?: string | number | null;
  // Joined or augmented client details for UI display
  client?: DatabaseClient;
}

export interface CandidateLead {
  id?: string;
  fullName: string;
  whatsappNumber: string;
  techStack: string;
  currentCtcLpa: string | number;
  targetCtcLpa: string | number;
  noticePeriod: 'Immediate' | '15 Days' | '30 Days' | '60+ Days';
  willingToInvest: 'Yes' | 'No';
  bookingDate: string;
  bookingTime: string;
  email?: string;
  phone?: string;
  notes?: string;
  createdAt?: string;
  status?: string;
}
