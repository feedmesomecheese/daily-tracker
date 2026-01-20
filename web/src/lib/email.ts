// web/src/lib/email.ts
import { Resend } from "resend";

// Lazy initialization to avoid build-time errors
let resendInstance: Resend | null = null;

function getResend(): Resend {
  if (!resendInstance) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }
    resendInstance = new Resend(apiKey);
  }
  return resendInstance;
}

export type StreakAlertEmailData = {
  to: string;
  metricName: string;
  streakDays: number;
  date: string;
};

/**
 * Send a streak alert email
 */
export async function sendStreakAlertEmail({
  to,
  metricName,
  streakDays,
  date,
}: StreakAlertEmailData): Promise<{ success: boolean; error?: string }> {
  const absStreak = Math.abs(streakDays);
  const isNegative = streakDays < 0;

  const subject = isNegative
    ? `⚠️ ${metricName}: ${absStreak} day streak`
    : `🎉 ${metricName}: ${absStreak} day milestone!`;

  const bodyText = isNegative
    ? `Your metric "${metricName}" has reached a ${absStreak} day negative streak as of ${date}.\n\nThis is an automated reminder from Daily Tracker.`
    : `Congratulations! Your metric "${metricName}" has reached a ${absStreak} day streak as of ${date}!\n\nKeep up the great work!\n\nThis is an automated notification from Daily Tracker.`;

  const bodyHtml = isNegative
    ? `
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">⚠️ Streak Alert</h2>
        <p>Your metric <strong>"${metricName}"</strong> has reached a <strong>${absStreak} day</strong> negative streak as of ${date}.</p>
        <p style="color: #666; font-size: 14px; margin-top: 24px;">This is an automated reminder from Daily Tracker.</p>
      </div>
    `
    : `
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">🎉 Milestone Reached!</h2>
        <p>Congratulations! Your metric <strong>"${metricName}"</strong> has reached a <strong>${absStreak} day</strong> streak as of ${date}!</p>
        <p>Keep up the great work!</p>
        <p style="color: #666; font-size: 14px; margin-top: 24px;">This is an automated notification from Daily Tracker.</p>
      </div>
    `;

  try {
    const resend = getResend();
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "Daily Tracker <notifications@resend.dev>",
      to,
      subject,
      text: bodyText,
      html: bodyHtml,
    });

    if (error) {
      console.error("Resend error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Email send error:", msg);
    return { success: false, error: msg };
  }
}
