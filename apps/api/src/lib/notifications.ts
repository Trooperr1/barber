import { env } from '../config/env.js';

export interface NotificationPayload {
  to: string;
  channel: 'sms' | 'email';
  subject?: string;
  message: string;
}

export interface NotificationProvider {
  send(payload: NotificationPayload): Promise<void>;
}

// Local dev default: log instead of sending. Swap NOTIFICATION_PROVIDER to
// "twilio"/"sendgrid" and fill in the matching provider below once real
// credentials are available.
class ConsoleNotificationProvider implements NotificationProvider {
  async send(payload: NotificationPayload): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(
      `[notify:${payload.channel}] to=${payload.to}${payload.subject ? ` subject="${payload.subject}"` : ''} :: ${payload.message}`,
    );
  }
}

class TwilioNotificationProvider implements NotificationProvider {
  async send(payload: NotificationPayload): Promise<void> {
    if (payload.channel !== 'sms') return;
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
      throw new Error('Twilio credentials are not configured');
    }
    const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: payload.to,
          From: env.TWILIO_FROM_NUMBER,
          Body: payload.message,
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`Twilio send failed: ${res.status} ${await res.text()}`);
    }
  }
}

class SendGridNotificationProvider implements NotificationProvider {
  async send(payload: NotificationPayload): Promise<void> {
    if (payload.channel !== 'email') return;
    if (!env.SENDGRID_API_KEY || !env.SENDGRID_FROM_EMAIL) {
      throw new Error('SendGrid credentials are not configured');
    }
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: payload.to }] }],
        from: { email: env.SENDGRID_FROM_EMAIL },
        subject: payload.subject ?? 'Notification',
        content: [{ type: 'text/plain', value: payload.message }],
      }),
    });
    if (!res.ok) {
      throw new Error(`SendGrid send failed: ${res.status} ${await res.text()}`);
    }
  }
}

function buildProvider(): NotificationProvider {
  switch (env.NOTIFICATION_PROVIDER) {
    case 'twilio':
      return new TwilioNotificationProvider();
    case 'sendgrid':
      return new SendGridNotificationProvider();
    default:
      return new ConsoleNotificationProvider();
  }
}

export const notifications = buildProvider();
