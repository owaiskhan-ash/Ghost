'use strict';

const { createHash } = require('node:crypto');

const TARGET_WHATSAPP = 'com.whatsapp';
const TARGET_WHATSAPP_BUSINESS = 'com.whatsapp.w4b';

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function resolveMessageVariables(template, contactName, refDate = new Date()) {
  const safeName = String(contactName || '').trim() || 'Friend';
  const firstName = safeName.split(/\s+/)[0] || safeName;
  const date = refDate instanceof Date ? refDate : new Date(refDate);
  const dayNames = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const dateLabel = `${String(date.getDate()).padStart(2, '0')} ${
    monthNames[date.getMonth()]
  } ${date.getFullYear()}`;

  return String(template || '')
    .replace(/\{\s*name\s*\}/gi, safeName)
    .replace(/\{\s*first_name\s*\}/gi, firstName)
    .replace(/\{\s*date\s*\}/gi, dateLabel)
    .replace(/\{\s*day\s*\}/gi, dayNames[date.getDay()]);
}

function createWhatsAppUrl(target, phone, message) {
  const cleanPhone = normalizePhone(phone);
  if (cleanPhone.length < 5) {
    throw new Error('A valid international phone number is required.');
  }

  const query = `phone=${encodeURIComponent(cleanPhone)}&text=${encodeURIComponent(
    String(message || '')
  )}`;

  if (target === TARGET_WHATSAPP_BUSINESS) {
    // WhatsApp does not publish a separate Windows Business protocol handler.
    // The official WhatsApp Web compose URL is the deterministic PC fallback.
    return `https://web.whatsapp.com/send?${query}`;
  }

  return `whatsapp://send?${query}`;
}

function formatDateYmd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(date.getDate()).padStart(2, '0')}`;
}

function computeNextTrigger(task, fromMillis = Date.now()) {
  const now = new Date(fromMillis);
  const [hoursRaw, minutesRaw] = String(task.scheduledTime24 || '00:00')
    .split(':')
    .map(Number);
  const hours = Number.isInteger(hoursRaw) ? Math.min(23, Math.max(0, hoursRaw)) : 0;
  const minutes = Number.isInteger(minutesRaw)
    ? Math.min(59, Math.max(0, minutesRaw))
    : 0;
  const buffer = fromMillis + 2000;

  if (task.repeatMode === 'daily') {
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    if (next.getTime() <= buffer) next.setDate(next.getDate() + 1);
    return { triggerAtMillis: next.getTime(), scheduledDate: formatDateYmd(next) };
  }

  if (task.repeatMode === 'weekly') {
    const days = Array.isArray(task.repeatDays) && task.repeatDays.length > 0
      ? task.repeatDays
      : [now.getDay()];
    const allowed = new Set(days.map(Number));
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    for (let offset = 0; offset <= 8; offset += 1) {
      if (allowed.has(next.getDay()) && next.getTime() > buffer) {
        return {
          triggerAtMillis: next.getTime(),
          scheduledDate: formatDateYmd(next),
        };
      }
      next.setDate(next.getDate() + 1);
    }
  }

  if (task.repeatMode === 'monthly') {
    const desiredDay = Math.min(31, Math.max(1, Number(task.repeatMonthDay) || 1));
    for (let offset = 0; offset <= 14; offset += 1) {
      const year = now.getFullYear();
      const month = now.getMonth() + offset;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const next = new Date(
        year,
        month,
        Math.min(desiredDay, daysInMonth),
        hours,
        minutes,
        0,
        0
      );
      if (next.getTime() > buffer) {
        return {
          triggerAtMillis: next.getTime(),
          scheduledDate: formatDateYmd(next),
        };
      }
    }
  }

  if (task.repeatMode === 'interval') {
    const intervalDays = Math.min(
      365,
      Math.max(2, Number(task.repeatIntervalDays) || 2)
    );
    const [year, month, day] = String(task.scheduledDate || '')
      .split('-')
      .map(Number);
    const next = new Date(
      year || now.getFullYear(),
      (month || now.getMonth() + 1) - 1,
      day || now.getDate(),
      hours,
      minutes,
      0,
      0
    );
    while (next.getTime() <= buffer) next.setDate(next.getDate() + intervalDays);
    return { triggerAtMillis: next.getTime(), scheduledDate: formatDateYmd(next) };
  }

  return null;
}

function taskRecipients(task) {
  if (Array.isArray(task.recipients) && task.recipients.length > 0) {
    return task.recipients;
  }
  return [
    {
      contactId: task.contactId,
      contactName: task.contactName,
      contactPhone: task.contactPhone,
      contactInitials: task.contactInitials,
      messageBody: task.messageBody,
    },
  ];
}

function hashAutomationMessage(message) {
  const normalized = String(message || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trimEnd();
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function parseAutomationOutput(output, fallbackDetail = 'Windows automation did not return a result.') {
  const lines = String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (
        typeof parsed.ok === 'boolean' &&
        typeof parsed.method === 'string' &&
        typeof parsed.detail === 'string'
      ) {
        return {
          ok: parsed.ok,
          method: parsed.method,
          detail: parsed.detail,
        };
      }
    } catch {
      // Ignore PowerShell diagnostics and continue to the JSON result line.
    }
  }

  return {
    ok: false,
    method: 'automation-error',
    detail: fallbackDetail,
  };
}

function isValidTask(task) {
  return Boolean(
    task &&
      typeof task.id === 'string' &&
      task.id.length > 0 &&
      typeof task.triggerAtMillis === 'number' &&
      Number.isFinite(task.triggerAtMillis) &&
      [TARGET_WHATSAPP, TARGET_WHATSAPP_BUSINESS].includes(task.whatsappPackage) &&
      taskRecipients(task).every(
        (recipient) =>
          normalizePhone(recipient.contactPhone).length >= 5 &&
          typeof recipient.messageBody === 'string' &&
          recipient.messageBody.trim().length > 0
      )
  );
}

module.exports = {
  TARGET_WHATSAPP,
  TARGET_WHATSAPP_BUSINESS,
  computeNextTrigger,
  createWhatsAppUrl,
  formatDateYmd,
  hashAutomationMessage,
  isValidTask,
  normalizePhone,
  parseAutomationOutput,
  resolveMessageVariables,
  taskRecipients,
};
