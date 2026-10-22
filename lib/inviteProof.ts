/**
 * Utility for parsing and serializing 24-hour screenshot proof in interview slots
 */

export interface SlotProofMetadata {
  notesText: string;
  hasScreenshot: boolean;
  screenshotPreviewUrl?: string;
  isExpired: boolean;
  expiresAt?: string;
  uploadedAt?: string;
  isGenuine: boolean;
  confidence?: number;
  signals?: string[];
  meetingLink?: string;
}

export function parseSlotProof(jdText?: string | null): SlotProofMetadata {
  if (!jdText) {
    return { notesText: '', hasScreenshot: false, isExpired: false, isGenuine: false };
  }

  const trimmed = jdText.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const expiresAt = parsed.expires_at || parsed.screenshot_storage?.expires_at;
      const uploadedAt = parsed.uploaded_at || parsed.screenshot_storage?.uploaded_at;
      const isExpired =
        expiresAt && typeof window !== 'undefined'
          ? Date.now() > new Date(expiresAt).getTime()
          : false;
      const preview =
        parsed.screenshot_preview ||
        parsed.screenshot_storage?.preview_data_url ||
        parsed.preview_url;

      return {
        notesText: parsed.notes || '',
        hasScreenshot: Boolean(preview),
        screenshotPreviewUrl: isExpired ? undefined : preview,
        isExpired,
        expiresAt,
        uploadedAt,
        isGenuine: Boolean(parsed.verified ?? parsed.isGenuine ?? (preview ? true : false)),
        confidence: parsed.confidence || (preview ? 90 : 0),
        signals: parsed.verification_signals || parsed.verificationSignals || [],
        meetingLink: parsed.meeting_link || parsed.meetingLink,
      };
    } catch {
      // ignore JSON parse error and fallback to string inspection
    }
  }

  const hasTag = jdText.includes('[Verified Invite Screenshot Attached]');
  const cleanNotes = jdText
    .replace(/\[Verified Invite Screenshot Attached\]/g, '')
    .replace(/^JD:\s*/, '')
    .trim();

  return {
    notesText: cleanNotes,
    hasScreenshot: hasTag,
    isExpired: false,
    isGenuine: hasTag,
    confidence: hasTag ? 85 : 0,
    signals: hasTag ? ['Verified Recruiter Invite'] : [],
  };
}

export function serializeSlotProof(
  notes: string,
  screenshotData?: {
    preview_data_url?: string;
    uploaded_at?: string;
    expires_at?: string;
    confidence?: number;
    isGenuine?: boolean;
    verificationSignals?: string[];
    meetingLink?: string | null;
  } | null
): string {
  if (!screenshotData || !screenshotData.preview_data_url) {
    return notes.trim();
  }

  return JSON.stringify({
    notes: notes.trim(),
    screenshot_preview: screenshotData.preview_data_url,
    uploaded_at: screenshotData.uploaded_at || new Date().toISOString(),
    expires_at:
      screenshotData.expires_at ||
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    verified: screenshotData.isGenuine ?? true,
    confidence: screenshotData.confidence || 90,
    verification_signals: screenshotData.verificationSignals || [],
    meeting_link: screenshotData.meetingLink || null,
  });
}
