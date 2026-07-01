import { buildApp } from './app.js';
import { env } from './config/env.js';
import { runReminderSweep } from './jobs/reminders.js';

const REMINDER_SWEEP_INTERVAL_MS = 15 * 60 * 1000;

async function main() {
  const app = await buildApp();

  setInterval(() => {
    runReminderSweep(app.prisma).catch((err) => app.log.error(err, 'reminder sweep failed'));
  }, REMINDER_SWEEP_INTERVAL_MS);

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
