import type { ContactProfile, TriggerType } from '../types/ghost';

export interface ParsedCommandIntent {
  rawPrompt: string;
  contactQuery: string;
  matchedContacts: ContactProfile[];
  scheduledTime24: string;
  displayTime: string;
  messageBody: string;
  targetApp: 'WhatsApp' | 'WhatsApp Business' | 'Cross-App Chain';
  triggerType: TriggerType;
  triggerLabel: string;
  conditionalRule?: string;
  chainSteps?: string[];
  isAmbiguousContact: boolean;
  isOvernightWindow: boolean;
}

function format12Hour(hours24: number, minutes: number): string {
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const h12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${String(h12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
}

export function computeJitteredDisplayTime(
  time24: string,
  jitterMinutes: number,
  seedOffset = 3
): string {
  const [hStr, mStr] = time24.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return time24;
  if (jitterMinutes <= 0) return format12Hour(h, m);

  // Deterministic natural offset within [-jitter, +jitter] avoiding :00 exactness
  const applied = Math.min(jitterMinutes, Math.max(1, seedOffset));
  const totalMins = (h * 60 + m + applied + 1440) % 1440;
  const effH = Math.floor(totalMins / 60);
  const effM = totalMins % 60;
  return format12Hour(effH, effM);
}

export function parseNaturalCommand(
  input: string,
  contacts: ContactProfile[]
): ParsedCommandIntent {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  // 1. Detect Cross-App Chains (Uber / Ola / Blinkit / Swiggy)
  const isCrossApp =
    (lower.includes('uber') && lower.includes('ola')) ||
    lower.includes('blinkit') ||
    lower.includes('compare');

  // 2. Detect Trigger Type (Alarm Dismiss vs Bluetooth/Location vs Clock)
  let triggerType: TriggerType = isCrossApp ? 'cross_app_chain' : 'clock';
  let triggerLabel = 'Exact AlarmManager + Natural Jitter';

  if (lower.includes('alarm')) {
    triggerType = 'alarm_dismissed';
    triggerLabel = 'Sensor Event: Morning Alarm Dismissed + 5m';
  } else if (lower.includes('bluetooth') || lower.includes('reach') || lower.includes('gym')) {
    triggerType = 'bluetooth_location';
    triggerLabel = 'Geofence / Bluetooth State Trigger';
  } else if (isCrossApp) {
    triggerLabel = 'Multi-App UI Tree Chain (Uber → Ola → WhatsApp)';
  }

  // 3. Extract Time (e.g., "at 5 am", "at 5:30 am", "at 17:45", "around 6 pm")
  let hours24 = 5;
  let minutes = 0;
  const timeRegex = /\b(?:at|around|by)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;
  const timeMatch = trimmed.match(timeRegex);
  if (timeMatch) {
    let rawH = parseInt(timeMatch[1], 10);
    const rawM = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3].toLowerCase();
    if (meridiem === 'pm' && rawH < 12) rawH += 12;
    if (meridiem === 'am' && rawH === 12) rawH = 0;
    hours24 = Math.min(23, Math.max(0, rawH));
    minutes = Math.min(59, Math.max(0, rawM));
  } else {
    const time24Match = trimmed.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (time24Match) {
      hours24 = parseInt(time24Match[1], 10);
      minutes = parseInt(time24Match[2], 10);
    }
  }

  const scheduledTime24 = `${String(hours24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const displayTime =
    triggerType === 'alarm_dismissed'
      ? 'Alarm + 5m'
      : format12Hour(hours24, minutes);

  // 4. Extract Conditional Rule ("unless ...")
  let conditionalRule: string | undefined;
  let textWithoutCondition = trimmed;
  const unlessIdx = lower.indexOf(' unless ');
  if (unlessIdx !== -1) {
    conditionalRule = `Abort if: ${trimmed.slice(unlessIdx + 8).trim()}`;
    textWithoutCondition = trimmed.slice(0, unlessIdx).trim();
  }

  // 5. Match Contact Name
  let contactQuery = 'Jasmine';
  const msgRecipientMatch = textWithoutCondition.match(
    /\b(?:msg|message|text|whatsapp|send\s+to|tell)\s+([a-zA-Z]+)/i
  );
  if (msgRecipientMatch && msgRecipientMatch[1]) {
    contactQuery = msgRecipientMatch[1];
  } else {
    const foundByScan = contacts.find((c) =>
      lower.includes(c.name.split(' ')[0].toLowerCase())
    );
    if (foundByScan) {
      contactQuery = foundByScan.name.split(' ')[0];
    }
  }

  const qLower = contactQuery.toLowerCase();
  let matchedContacts = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(qLower) ||
      c.tag.toLowerCase().includes(qLower)
  );
  if (matchedContacts.length === 0) {
    matchedContacts = [contacts[0]];
  }

  // 6. Extract Message Body cleanly
  let messageBody = 'Good morning';
  if (isCrossApp) {
    messageBody =
      'Cheapest Airport Cab: {{winner_app}} at ₹{{fare}} (ETA {{eta}} mins)';
  } else if (timeMatch && timeMatch.index !== undefined) {
    const afterTime = textWithoutCondition
      .slice(timeMatch.index + timeMatch[0].length)
      .replace(/^[\s,:-]+/, '')
      .replace(/^["']|["']$/g, '')
      .trim();
    if (afterTime.length > 0) {
      messageBody = afterTime;
    } else {
      // Check if message came before "at 5 am", e.g., "msg jasmine Good morning at 5 am"
      const beforeTime = textWithoutCondition
        .slice(0, timeMatch.index)
        .replace(
          /^.*?\b(?:msg|message|text|whatsapp|tell)\s+[a-zA-Z]+\s*/i,
          ''
        )
        .replace(/^["']|["']$/g, '')
        .trim();
      if (beforeTime.length > 0) {
        messageBody = beforeTime;
      }
    }
  } else {
    const afterContact = textWithoutCondition
      .replace(/^.*?\b(?:msg|message|text|whatsapp|tell)\s+[a-zA-Z]+\s*/i, '')
      .trim();
    if (afterContact.length > 0 && afterContact.toLowerCase() !== textWithoutCondition.toLowerCase()) {
      messageBody = afterContact;
    }
  }

  const isOvernightWindow = hours24 >= 0 && hours24 <= 6;

  const chainSteps = isCrossApp
    ? [
        '1. Deep-Link Uber (Pickup: Current GPS → Airport) & read UI price node',
        '2. Deep-Link Ola Cabs & read Prime/Mini UI price node',
        '3. Enforce Red-Zone Guardrail: Hard-block Confirm Ride & UPI screens',
        '4. Open WhatsApp Self Chat & send lower fare summary',
      ]
    : undefined;

  return {
    rawPrompt: trimmed || 'please msg jasmine at 5 am Good morning',
    contactQuery,
    matchedContacts,
    scheduledTime24,
    displayTime,
    messageBody,
    targetApp: isCrossApp
      ? 'Cross-App Chain'
      : matchedContacts[0]?.whatsappPackage === 'com.whatsapp.w4b'
        ? 'WhatsApp Business'
        : 'WhatsApp',
    triggerType,
    triggerLabel,
    conditionalRule,
    chainSteps,
    isAmbiguousContact: matchedContacts.length > 1,
    isOvernightWindow,
  };
}
