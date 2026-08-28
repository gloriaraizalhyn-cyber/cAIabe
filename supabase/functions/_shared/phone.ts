// PH mobile number normalization, shared by the outbound sender
// (textbee.ts) and the inbound webhook (sms-webhook) so both agree on one
// canonical E.164 shape regardless of which of the three forms the
// registration form's PH_MOBILE_NUMBER_PATTERN (or TextBee's own `sender`
// field) hands us.
export function normalizePhMobileNumber(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  if (/^09\d{9}$/.test(digits)) return "+63" + digits.slice(1);
  if (/^\+639\d{9}$/.test(digits)) return digits;
  if (/^639\d{9}$/.test(digits)) return "+" + digits;
  return null;
}
