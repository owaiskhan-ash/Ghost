'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeNextTrigger,
  createWhatsAppUrl,
  isValidTask,
  normalizePhone,
  resolveMessageVariables,
  taskRecipients,
} = require('./automation.cjs');

function baseTask(overrides = {}) {
  return {
    id: 'task-1',
    contactId: 'contact-1',
    contactName: 'Asha Khan',
    contactPhone: '+91 98765-43210',
    contactInitials: 'AK',
    messageBody: 'Hello {first_name}',
    scheduledTime24: '09:30',
    scheduledDate: '2026-11-03',
    triggerAtMillis: Date.parse('2026-11-03T09:30:00'),
    repeatMode: 'once',
    whatsappPackage: 'com.whatsapp',
    enabled: true,
    ...overrides,
  };
}

test('normalizes international phone numbers', () => {
  assert.equal(normalizePhone('+91 (98765) 43210'), '919876543210');
});

test('creates strict WhatsApp Desktop and Business Web compose URLs', () => {
  assert.equal(
    createWhatsAppUrl('com.whatsapp', '+91 98765 43210', 'Hello Asha'),
    'whatsapp://send?phone=919876543210&text=Hello%20Asha'
  );
  assert.equal(
    createWhatsAppUrl('com.whatsapp.w4b', '+91 98765 43210', 'Hello Asha'),
    'https://web.whatsapp.com/send?phone=919876543210&text=Hello%20Asha'
  );
});

test('rejects invalid phone numbers before desktop automation starts', () => {
  assert.throws(
    () => createWhatsAppUrl('com.whatsapp', '123', 'Hello'),
    /valid international phone number/
  );
});

test('resolves per-recipient dynamic variables', () => {
  const resolved = resolveMessageVariables(
    'Hi {first_name}, {name} — {day}, {date}',
    'Asha Khan',
    new Date(2026, 10, 2, 9, 0, 0)
  );
  assert.equal(resolved, 'Hi Asha, Asha Khan — Monday, 02 Nov 2026');
});

test('computes the next daily schedule after the current time', () => {
  const from = new Date(2026, 10, 2, 10, 0, 0).getTime();
  const result = computeNextTrigger(
    baseTask({ repeatMode: 'daily', scheduledTime24: '09:30' }),
    from
  );
  assert.equal(result.scheduledDate, '2026-11-03');
  assert.equal(new Date(result.triggerAtMillis).getHours(), 9);
  assert.equal(new Date(result.triggerAtMillis).getMinutes(), 30);
});

test('computes a selected weekly day', () => {
  const from = new Date(2026, 10, 2, 10, 0, 0).getTime(); // Monday
  const result = computeNextTrigger(
    baseTask({
      repeatMode: 'weekly',
      repeatDays: [3],
      scheduledTime24: '08:15',
    }),
    from
  );
  assert.equal(result.scheduledDate, '2026-11-04');
  assert.equal(new Date(result.triggerAtMillis).getDay(), 3);
});

test('clamps monthly schedules to the final day of short months', () => {
  const from = new Date(2027, 1, 1, 12, 0, 0).getTime();
  const result = computeNextTrigger(
    baseTask({
      repeatMode: 'monthly',
      repeatMonthDay: 31,
      scheduledTime24: '09:00',
    }),
    from
  );
  assert.equal(result.scheduledDate, '2027-02-28');
});

test('validates single and batch desktop tasks', () => {
  assert.equal(isValidTask(baseTask()), true);
  const batch = baseTask({
    recipients: [
      {
        contactId: 'one',
        contactName: 'One',
        contactPhone: '+919999999991',
        contactInitials: 'O',
        messageBody: 'First',
      },
      {
        contactId: 'two',
        contactName: 'Two',
        contactPhone: '+919999999992',
        contactInitials: 'T',
        messageBody: 'Second',
      },
    ],
  });
  assert.equal(taskRecipients(batch).length, 2);
  assert.equal(isValidTask(batch), true);
  assert.equal(isValidTask(baseTask({ messageBody: '' })), false);
});
