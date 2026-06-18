// Pure builders for the scheduled-job failure alert email. No app imports
// (no @/env, no Resend) so the alert path stays minimal and these stay
// unit-testable. Journal output is arbitrary (ANSI codes, <, &, long lines),
// so it is sanitized + HTML-escaped before embedding.

export function stripControlChars(text: string): string {
  return (
    text
      // ANSI CSI (e.g. colour/cursor) and OSC (e.g. hyperlinks) escape sequences.
      .replace(/\x1b(?:\[[0-9;]*[A-Za-z]|\][^\x07]*\x07)/g, '')
      // Remaining C0 control chars except \n (\x0a) and \t (\x09).
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
  );
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface JobFailureEmail {
  subject: string;
  html: string;
  text: string;
}

export function buildJobFailureEmail(unit: string, rawJournalTail: string): JobFailureEmail {
  const journalTail = stripControlChars(rawJournalTail).trim() || '(journal empty)';
  const subject = `[Balikha] Scheduled job failed: ${unit}`;
  const text = `The systemd unit ${unit} failed on the Balikha production box.\n\nLast 30 journal lines:\n\n${journalTail}`;
  const html = `<p>The systemd unit <strong>${escapeHtml(unit)}</strong> failed on the Balikha production box.</p>\n<p>Last 30 journal lines:</p>\n<pre style="font-family:ui-monospace,Menlo,monospace;font-size:12px;white-space:pre-wrap;background:#F3F4F6;padding:12px;border-radius:6px">${escapeHtml(journalTail)}</pre>`;
  return { subject, html, text };
}
