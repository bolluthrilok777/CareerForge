/**
 * Client-side non-blocking trigger for Meta WhatsApp Cloud API notifications
 */
export function triggerWhatsAppAlert(
  type: 'new_lead' | 'emergency_booking' | 'client_slot_request',
  data: Record<string, any>
) {
  try {
    fetch('/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type, data }),
    }).catch((err) => {
      // Non-blocking silent error catch
      console.warn('WhatsApp alert failed silently:', err);
    });
  } catch {
    // Non-blocking safeguard
  }
}
