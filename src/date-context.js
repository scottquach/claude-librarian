// src/date-context.js
const TIMEZONE = process.env.BOT_TIMEZONE ?? 'America/Chicago';

function localDate(d, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function computeDateContext() {
  const now = new Date();
  const today = localDate(now, TIMEZONE);
  const currentTime = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);

  // Reconstruct a "week start" Date by parsing today's date in the target timezone
  const [year, month, day] = today.split('-').map(Number);
  const localNow = new Date(year, month - 1, day);
  const weekStart = new Date(localNow);
  weekStart.setDate(localNow.getDate() - localNow.getDay());
  const weekStartStr = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;

  const jan1 = new Date(weekStart.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((weekStart - jan1) / 86400000 + jan1.getDay() + 1) / 7);

  return { today, currentTime, weekStartStr, weekNum, year: weekStart.getFullYear() };
}

module.exports = { localDate, computeDateContext };
