'use client';

// Real-time synchronization utility between Admin Portal and Candidate Portal
// Works across browser tabs via BroadcastChannel and localStorage events,
// combined with live Supabase database updates.

export type SyncEventType =
  | 'CLIENT_UPDATED'
  | 'SLOT_CREATED'
  | 'SLOT_UPDATED'
  | 'LEAD_CONVERTED'
  | 'LEAD_UPDATED'
  | 'RESUME_UPDATED';

export interface SyncMessage {
  type: SyncEventType;
  payload?: any;
  timestamp: number;
}

let syncChannel: BroadcastChannel | null = null;

if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    syncChannel = new BroadcastChannel('cf_portal_sync_v1');
  } catch {
    syncChannel = null;
  }
}

export function broadcastSync(type: SyncEventType, payload?: any) {
  const message: SyncMessage = {
    type,
    payload,
    timestamp: Date.now(),
  };

  // 1. BroadcastChannel for instant same-browser cross-tab delivery
  if (syncChannel) {
    try {
      syncChannel.postMessage(message);
    } catch {
      // ignore
    }
  }

  // 2. localStorage storage event fallback for older browsers
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('cf_portal_sync_event', JSON.stringify(message));
    } catch {
      // ignore
    }
  }
}

export function subscribeToSync(onEvent: (msg: SyncMessage) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  // Listener for BroadcastChannel
  const handleBroadcast = (event: MessageEvent) => {
    if (event.data && event.data.type) {
      onEvent(event.data as SyncMessage);
    }
  };

  if (syncChannel) {
    syncChannel.addEventListener('message', handleBroadcast);
  }

  // Listener for localStorage
  const handleStorage = (event: StorageEvent) => {
    if (event.key === 'cf_portal_sync_event' && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        if (parsed && parsed.type) {
          onEvent(parsed);
        }
      } catch {
        // ignore
      }
    }
  };

  window.addEventListener('storage', handleStorage);

  // Auto re-sync when tab gains focus
  const handleFocus = () => {
    onEvent({ type: 'CLIENT_UPDATED', timestamp: Date.now() });
  };
  window.addEventListener('focus', handleFocus);

  return () => {
    if (syncChannel) {
      syncChannel.removeEventListener('message', handleBroadcast);
    }
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('focus', handleFocus);
  };
}
