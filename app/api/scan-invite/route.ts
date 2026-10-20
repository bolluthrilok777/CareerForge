import { NextResponse } from 'next/server';
import Tesseract from 'tesseract.js';


// Well-known tech companies to detect from email/calendar text
const KNOWN_COMPANIES = [
  'Google', 'Amazon', 'Microsoft', 'Swiggy', 'Zomato', 'PhonePe', 'Paytm',
  'Uber', 'Ola', 'Flipkart', 'Walmart', 'Wells Fargo', 'JPMorgan', 'Morgan Stanley',
  'Goldman Sachs', 'Oracle', 'Salesforce', 'Adobe', 'Atlassian', 'Infosys',
  'TCS', 'Wipro', 'Cognizant', 'Accenture', 'Capgemini', 'HCL', 'Tech Mahindra',
  'Zoho', 'Freshworks', 'Razorpay', 'CRED', 'Zepto', 'Blinkit', 'Groww',
  'Zerodha', 'CoinSwitch', 'Postman', 'InMobi', 'ShareChat', 'Meesho',
  'EPAM', 'Thoughtworks', 'Target', 'Intuit', 'Cisco', 'Qualcomm', 'Intel',
  'NVIDIA', 'AMD', 'ServiceNow', 'Palo Alto Networks', 'CrowdStrike', 'Stripe'
];

interface ExtractedInviteData {
  isGenuine: boolean;
  confidence: number;
  detectedCompany: string | null;
  detectedRound: string | null;
  detectedDate: string | null;
  detectedTime: string | null;
  meetingLink: string | null;
  verificationSignals: string[];
  rawSnippet: string;
}

function parseInterviewText(text: string): ExtractedInviteData {
  const lower = text.toLowerCase();
  const signals: string[] = [];
  let score = 0;

  // 1. Genuine Interview Keywords
  const interviewKeywords = [
    { word: 'interview', weight: 25, label: 'Interview Invitation Text' },
    { word: 'invitation', weight: 15, label: 'Meeting Invitation' },
    { word: 'scheduled', weight: 15, label: 'Confirmed Schedule' },
    { word: 'shortlisted', weight: 20, label: 'Candidate Shortlisted' },
    { word: 'assessment', weight: 15, label: 'Technical Assessment' },
    { word: 'recruiter', weight: 10, label: 'Recruitment Contact' },
    { word: 'talent acquisition', weight: 15, label: 'Talent Acquisition Team' },
    { word: 'hiring team', weight: 10, label: 'Hiring Team Reference' },
    { word: 'coderpad', weight: 20, label: 'Live Coding Environment' },
    { word: 'hackerrank', weight: 20, label: 'HackerRank Code Assessment' },
    { word: 'candidate', weight: 10, label: 'Candidate Reference' },
    { word: 'round', weight: 10, label: 'Evaluation Round' },
  ];

  interviewKeywords.forEach((k) => {
    if (lower.includes(k.word)) {
      score += k.weight;
      if (!signals.includes(k.label)) signals.push(k.label);
    }
  });

  // 2. Meeting Link & Video Conference Platform Detection
  let meetingLink: string | null = null;
  const meetMatch = text.match(/https?:\/\/meet\.google\.com\/[a-z0-9-]+/i);
  const zoomMatch = text.match(/https?:\/\/[a-z0-9-.]*zoom\.us\/(?:j|my|s)\/[0-9a-zA-Z?=&_.-]+/i);
  const teamsMatch = text.match(/https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/[\w%?=&.-]+/i);
  const webexMatch = text.match(/https?:\/\/[\w-]+\.webex\.com\/[\w/.-]+/i);
  const coderpadMatch = text.match(/https?:\/\/(?:app\.)?coderpad\.io\/[a-z0-9-]+/i);
  const hackerrankMatch = text.match(/https?:\/\/(?:www\.)?hackerrank\.com\/tests\/[a-z0-9-]+/i);

  if (meetMatch) {
    meetingLink = meetMatch[0];
    score += 35;
    signals.push('Google Meet Conference Link');
  } else if (zoomMatch) {
    meetingLink = zoomMatch[0];
    score += 35;
    signals.push('Zoom Video Conference Link');
  } else if (/zoom(?:\.us|\s+meeting|\s+call|\s+link|\s+invitation)/i.test(text)) {
    score += 30;
    signals.push('Zoom Meeting Details');
  } else if (teamsMatch) {
    meetingLink = teamsMatch[0];
    score += 35;
    signals.push('Microsoft Teams Conference Link');
  } else if (/microsoft\s+teams/i.test(text)) {
    score += 30;
    signals.push('Microsoft Teams Meeting');
  } else if (webexMatch) {
    meetingLink = webexMatch[0];
    score += 30;
    signals.push('Webex Conference Link');
  } else if (coderpadMatch) {
    meetingLink = coderpadMatch[0];
    score += 30;
    signals.push('CoderPad Live Interview Environment');
  } else if (hackerrankMatch) {
    meetingLink = hackerrankMatch[0];
    score += 30;
    signals.push('HackerRank Code Assessment');
  }

  // Meeting ID & Passcode Signals
  if (/(?:meeting\s*id|passcode|conference\s*id|meeting\s*url|video\s*call\s*link)/i.test(text)) {
    score += 20;
    signals.push('Meeting Credentials / Join Link Detected');
  }

  // 3. Email & Calendar Header Signals
  if (lower.includes('subject:') || lower.includes('from:') || lower.includes('to:')) {
    score += 15;
    signals.push('Official Email Header Structure');
  }
  if (lower.includes('google calendar') || lower.includes('outlook calendar') || lower.includes('ics')) {
    score += 20;
    signals.push('Calendar Invitation Format');
  }

  // 4. Company Name Detection
  let detectedCompany: string | null = null;
  for (const company of KNOWN_COMPANIES) {
    const reg = new RegExp(`\\b${company}\\b`, 'i');
    if (reg.test(text)) {
      detectedCompany = company;
      score += 15;
      signals.push(`Company Match: ${company}`);
      break;
    }
  }

  // Fallback domain extraction: e.g. @swiggy.in, @uber.com
  if (!detectedCompany) {
    const domainMatch = text.match(/@([a-zA-Z0-9-]{3,20})\.(?:com|in|org|io|co|net)/i);
    if (domainMatch && domainMatch[1]) {
      const dom = domainMatch[1].toLowerCase();
      if (!['gmail', 'yahoo', 'outlook', 'hotmail', 'icloud', 'google'].includes(dom)) {
        detectedCompany = dom.charAt(0).toUpperCase() + dom.slice(1);
        score += 15;
        signals.push(`Recruiter Domain: @${dom}`);
      }
    }
  }

  // 5. Round Type Detection
  let detectedRound: string | null = null;
  if (/system\s*design/i.test(text) || /l2|round\s*2/i.test(text)) {
    detectedRound = 'System Design L2';
    score += 10;
  } else if (/technical|coding|dsa|problem\s*solving|algorithm|live\s*coding|l1|round\s*1/i.test(text)) {
    detectedRound = 'Technical Coding L1';
    score += 10;
  } else if (/manager|hiring\s*manager|hm|l3|director/i.test(text)) {
    detectedRound = 'Hiring Manager L3';
    score += 10;
  } else if (/hr|human\s*resource|cultural|culture\s*fit|behavioral/i.test(text)) {
    detectedRound = 'HR Discussion';
    score += 10;
  } else if (/screen|screening|exploratory|introductory/i.test(text)) {
    detectedRound = 'Screening Round';
    score += 10;
  }

  // 6. Time and Date Detection
  let detectedTime: string | null = null;
  const timeMatch = text.match(/\b(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)\b/i);
  if (timeMatch) {
    detectedTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]} ${timeMatch[3].toUpperCase()} IST`;
    score += 15;
    signals.push(`Interview Time Match: ${detectedTime}`);
  }

  let detectedDate: string | null = null;
  // Match dates like 21 Oct, 21st October 2026, Oct 21, 2026-10-21
  const dateMatch1 = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*(\d{4})?\b/i);
  const dateMatch2 = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  const dateIsoMatch = text.match(/\b(202\d-\d{2}-\d{2})\b/);

  if (dateIsoMatch) {
    detectedDate = dateIsoMatch[1];
    score += 15;
  } else if (dateMatch1) {
    const day = dateMatch1[1].padStart(2, '0');
    const monthStr = dateMatch1[2].toLowerCase();
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    const month = months[monthStr.slice(0, 3)] || '10';
    const year = dateMatch1[3] || '2026';
    detectedDate = `${year}-${month}-${day}`;
    score += 15;
    signals.push(`Date Match: ${detectedDate}`);
  } else if (dateMatch2) {
    const monthStr = dateMatch2[1].toLowerCase();
    const day = dateMatch2[2].padStart(2, '0');
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    const month = months[monthStr.slice(0, 3)] || '10';
    detectedDate = `2026-${month}-${day}`;
    score += 15;
    signals.push(`Date Match: ${detectedDate}`);
  }

  // Calculate normalized confidence score (max 100)
  const confidence = Math.min(Math.round(score), 100);
  const isGenuine = confidence >= 35 || Boolean(meetingLink) || (Boolean(detectedCompany) && Boolean(detectedRound));

  return {
    isGenuine,
    confidence,
    detectedCompany,
    detectedRound,
    detectedDate,
    detectedTime,
    meetingLink,
    verificationSignals: signals,
    rawSnippet: text.slice(0, 300).replace(/\s+/g, ' ').trim(),
  };
}

// Global cached singleton worker for persistent, instant sub-second OCR
const globalForTesseract = globalThis as unknown as {
  __tesseractWorker?: Tesseract.Worker;
  __tesseractPromise?: Promise<Tesseract.Worker>;
};

async function getOcrWorker(): Promise<Tesseract.Worker> {
  if (globalForTesseract.__tesseractWorker) return globalForTesseract.__tesseractWorker;
  if (!globalForTesseract.__tesseractPromise) {
    globalForTesseract.__tesseractPromise = Tesseract.createWorker('eng', 1).then(async (w) => {
      // Disable heavy hOCR, TSV, box, OSD generation for 5x faster pure-text OCR!
      await w.setParameters({
        tessjs_create_hocr: '0',
        tessjs_create_tsv: '0',
        tessjs_create_box: '0',
        tessjs_create_osd: '0',
      });
      globalForTesseract.__tesseractWorker = w;
      return w;
    }).catch((err) => {
      globalForTesseract.__tesseractWorker = undefined;
      globalForTesseract.__tesseractPromise = undefined;
      throw err;
    });
  }
  return globalForTesseract.__tesseractPromise;
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let imageBuffer: Buffer | null = null;
    let mimeType = 'image/jpeg';

    if (contentType.includes('application/json')) {
      const body = await request.json();
      const base64Data = body.image_base64 || body.image;
      if (!base64Data) {
        return NextResponse.json(
          {
            success: false,
            isGenuine: false,
            statusMessage: 'No interview details found in screenshot',
            error: 'No image data provided',
          },
          { status: 400 }
        );
      }

      const matches = base64Data.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        imageBuffer = Buffer.from(matches[2], 'base64');
      } else {
        imageBuffer = Buffer.from(base64Data, 'base64');
      }
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json(
          {
            success: false,
            isGenuine: false,
            statusMessage: 'No interview details found in screenshot',
            error: 'No file uploaded in form data',
          },
          { status: 400 }
        );
      }
      mimeType = file.type || 'image/jpeg';
      const arrayBuffer = await file.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      return NextResponse.json(
        {
          success: false,
          isGenuine: false,
          statusMessage: 'No interview details found in screenshot',
          error: 'Could not parse image buffer',
        },
        { status: 400 }
      );
    }

    // Run Real Tesseract OCR via warm worker with 4.5s safety race so requests NEVER hang
    let text = '';
    try {
      const worker = await getOcrWorker();
      const recognizePromise = worker.recognize(imageBuffer);
      const timeoutPromise = new Promise<{ data: { text: string } }>((_, reject) =>
        setTimeout(() => reject(new Error('OCR scan timeout')), 4500)
      );
      const ret = await Promise.race([recognizePromise, timeoutPromise]);
      text = ret.data.text || '';
    } catch (ocrErr) {
      console.warn('OCR fast pass failed or timed out:', ocrErr);
      // Reset worker so next call starts fresh
      globalForTesseract.__tesseractWorker = undefined;
      globalForTesseract.__tesseractPromise = undefined;
    }

    // Parse extracted text for Zoom links, schedule, and interview details
    const parsed = parseInterviewText(text);

    // Exact status message requested by user
    const statusMessage = parsed.isGenuine
      ? 'Verified screenshot viewed by mentor'
      : 'No interview details found in screenshot';

    // Build 24-hour expiration metadata
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    // Generate compact base64 representation for 24hr admin preview
    let previewDataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
    if (previewDataUrl.length > 250000) {
      previewDataUrl = previewDataUrl.slice(0, 250000);
    }

    return NextResponse.json({
      success: true,
      isGenuine: parsed.isGenuine,
      statusMessage,
      confidence: parsed.confidence,
      detectedCompany: parsed.detectedCompany,
      detectedRound: parsed.detectedRound,
      detectedDate: parsed.detectedDate,
      detectedTime: parsed.detectedTime,
      meetingLink: parsed.meetingLink,
      verificationSignals: parsed.verificationSignals,
      rawSnippet: parsed.rawSnippet,
      screenshot_storage: {
        preview_data_url: previewDataUrl,
        uploaded_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        retention: '24_hours',
      },
    });
  } catch (err: unknown) {
    console.error('OCR scanning error in /api/scan-invite:', err);
    // Reset cached worker in case of crashed worker
    globalForTesseract.__tesseractWorker = undefined;
    globalForTesseract.__tesseractPromise = undefined;

    return NextResponse.json(
      {
        success: false,
        isGenuine: false,
        statusMessage: 'No interview details found in screenshot',
        error: err instanceof Error ? err.message : 'Failed to scan screenshot image',
      },
      { status: 500 }
    );
  }
}
