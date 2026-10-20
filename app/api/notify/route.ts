import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const { type, data = {} } = payload;

    const token = process.env.META_WHATSAPP_TOKEN?.trim();
    const phoneNumberId = process.env.META_PHONE_NUMBER_ID?.trim();
    const adminPhoneNumber = process.env.ADMIN_PHONE_NUMBER?.trim().replace(/\D/g, '');

    if (!token || !phoneNumberId || !adminPhoneNumber) {
      console.warn('⚠️ Meta WhatsApp Cloud API configuration is incomplete:', {
        hasToken: Boolean(token),
        hasPhoneNumberId: Boolean(phoneNumberId),
        hasAdminPhoneNumber: Boolean(adminPhoneNumber),
      });

      return NextResponse.json(
        {
          success: false,
          warning: 'Meta WhatsApp credentials missing or incomplete in environment variables.',
        },
        { status: 200 }
      );
    }

    // Build message text based on alert type
    let messageText = '';

    if (type === 'new_lead') {
      const rawPhone = String(data.whatsapp_number || '').replace(/\D/g, '');
      const cleanPhone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
      const targetLpa = data.target_ctc_lpa || data.target_ctc || 'Not specified';
      const targetStr = String(targetLpa).toLowerCase().includes('lpa')
        ? targetLpa
        : `${targetLpa} LPA`;

      messageText = `⚡ *NEW STRATEGY CALL BOOKED!*
*Name:* ${data.full_name || 'Candidate'}
*Stack:* ${data.tech_stack || 'General Engineering'}
*Target:* ${targetStr}
*Slot:* ${data.booking_date || 'Date TBD'} at ${data.booking_time || 'Time TBD'}
*Chat:* https://wa.me/${cleanPhone}`;
    } else if (type === 'emergency_booking') {
      const rawFee = String(data.round_fee || '3,000').replace(/^₹\s*/, '').trim();
      const candName = data.name || data.candidate_name || data.full_name || 'Candidate';
      const candPhone = data.phone || data.whatsapp_number || 'N/A';
      const company = data.company_name || 'Urgent Interview';
      const round = data.round_type || 'Technical Round';
      const date = data.date || data.scheduled_date || 'Today';
      const time = data.time || data.scheduled_time || 'Immediate';

      messageText = `🚨 *EMERGENCY PER-ROUND BOOKED!*
*Candidate:* ${candName} (${candPhone})
*Company:* ${company} - ${round}
*Fee:* ₹${rawFee}
*Slot:* ${date} at ${time}
👉 Check Admin: /admin`;
    } else if (type === 'client_slot_request') {
      const clientName = data.client_name || data.candidate_name || data.name || 'Enrolled Candidate';
      const company = data.company_name || 'Interview';
      const round = data.round_type || 'Interview Round';
      const date = data.date || data.scheduled_date || 'TBD';
      const time = data.time || data.scheduled_time || 'TBD';

      messageText = `🎯 *CLIENT INTERVIEW REQUEST!*
*Client:* ${clientName}
*Company:* ${company} - ${round}
*Slot:* ${date} at ${time}`;
    } else if (type === 'client_slot_rescheduled') {
      const clientName = data.client_name || data.candidate_name || data.name || 'Enrolled Candidate';
      const company = data.company_name || 'Interview';
      const round = data.round_type || 'Interview Round';
      const date = data.date || data.scheduled_date || 'TBD';
      const time = data.time || data.scheduled_time || 'TBD';

      messageText = `🔄 *INTERVIEW SLOT RESCHEDULED!*
*Candidate:* ${clientName}
*Company:* ${company} - ${round}
*New Slot:* ${date} at ${time}
*Status:* Pending Admin Approval
👉 Review in Admin Center: /admin`;
    } else if (data.message || data.body || payload.message || payload.body) {
      messageText = data.message || data.body || payload.message || payload.body;
    } else {
      messageText = `🔔 *CAREERFORGE ALERT*\nNew operational event received (${type || 'general'}).`;
    }

    // Meta WhatsApp Cloud API endpoint & payload
    const endpoint = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

    const requestBody = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: adminPhoneNumber,
      type: 'text',
      text: {
        preview_url: false,
        body: messageText,
      },
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const responseData = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('❌ Meta WhatsApp Cloud API error:', responseData);
      return NextResponse.json(
        {
          success: false,
          status: res.status,
          error: responseData,
        },
        { status: 200 } // Keep 200 so caller UI flow never breaks
      );
    }

    return NextResponse.json({
      success: true,
      messageId: responseData?.messages?.[0]?.id,
    });
  } catch (error) {
    // Non-blocking catch to protect frontend user flow
    console.error('❌ Error dispatching Meta WhatsApp notification (non-blocking):', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown notification error',
      },
      { status: 200 }
    );
  }
}

// Optional health check / debug endpoint
export async function GET() {
  const hasToken = Boolean(process.env.META_WHATSAPP_TOKEN?.trim());
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID?.trim() || 'Not set';
  const adminPhoneNumber = process.env.ADMIN_PHONE_NUMBER?.trim() || 'Not set';

  return NextResponse.json({
    status: 'online',
    service: 'Meta WhatsApp Cloud API Notification Service',
    configured: hasToken && phoneNumberId !== 'Not set' && adminPhoneNumber !== 'Not set',
    phone_number_id: phoneNumberId,
    admin_phone_number: adminPhoneNumber,
  });
}
