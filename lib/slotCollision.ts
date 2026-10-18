import { DatabaseInterviewSlot } from './supabase';

export const STANDARD_TIME_SLOTS = [
  '09:00 AM IST',
  '10:00 AM IST',
  '11:00 AM IST',
  '12:00 PM IST',
  '01:30 PM IST',
  '02:30 PM IST',
  '03:30 PM IST',
  '04:30 PM IST',
  '05:30 PM IST',
  '06:30 PM IST',
  '07:30 PM IST',
  '08:30 PM IST',
];

/**
 * Converts formatted time string (e.g. "02:30 PM IST" or "10:00 AM") to minutes from midnight
 */
export function timeToMinutes(timeStr: string): number {
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

export interface ClashResult {
  isClash: boolean;
  conflictingSlot?: DatabaseInterviewSlot | null;
  message?: string;
}

/**
 * Checks if a proposed time slot clashes with existing non-cancelled bookings on the same date.
 * Slots are considered clashing if their scheduled start times are within 50 minutes of each other.
 */
export function checkSlotCollision(
  proposedTime: string,
  proposedDate: string,
  existingSlots: DatabaseInterviewSlot[],
  excludeSlotId?: string
): ClashResult {
  if (!proposedTime || !proposedDate) return { isClash: false };

  const proposedMins = timeToMinutes(proposedTime);

  const activeOnDate = existingSlots.filter(
    (s) =>
      s.scheduled_date === proposedDate &&
      s.status !== 'declined' &&
      s.status !== 'cancelled' &&
      (excludeSlotId ? s.id !== excludeSlotId : true)
  );

  const conflict = activeOnDate.find((slot) => {
    const slotMins = timeToMinutes(slot.scheduled_time);
    return Math.abs(slotMins - proposedMins) < 50;
  });

  if (conflict) {
    const comp = conflict.company_name || 'Interview';
    const cand = conflict.candidate_name ? ` (${conflict.candidate_name})` : '';
    return {
      isClash: true,
      conflictingSlot: conflict,
      message: `Already booked at ${conflict.scheduled_time} for ${comp}${cand}. Please pick an open slot.`,
    };
  }

  return { isClash: false };
}

/**
 * Returns list of standard time slots with availability and collision status for a selected date
 */
export function getTimeSlotsAvailability(
  selectedDate: string,
  existingSlots: DatabaseInterviewSlot[],
  excludeSlotId?: string
): Array<{ time: string; isBooked: boolean; conflictInfo?: string }> {
  return STANDARD_TIME_SLOTS.map((time) => {
    const check = checkSlotCollision(time, selectedDate, existingSlots, excludeSlotId);
    return {
      time,
      isBooked: check.isClash,
      conflictInfo: check.conflictingSlot
        ? `${check.conflictingSlot.company_name} (${check.conflictingSlot.scheduled_time})`
        : undefined,
    };
  });
}
