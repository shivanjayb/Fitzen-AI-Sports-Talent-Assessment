/** Sleep goals (a local preference) and the opt-in bedtime reminder, shared by Sleep, Home and the recovery estimate. */
export interface Goals { sleep: number; recovery: number; bedtime: number; wake: number }
const GOALS_KEY = 'fitzen-sleep-goals';
const REMINDER_KEY = 'fitzen-bedtime-reminder';
const DEFAULTS: Goals = { sleep: 8, recovery: 66, bedtime: 23 * 60, wake: 7 * 60 };
const isClock = (m: unknown): m is number => Number.isInteger(m) && (m as number) >= 0 && (m as number) < 1440;

export const goalsError = (g: Goals) =>
  !Number.isFinite(g.sleep) || g.sleep < 4 || g.sleep > 12 || (g.sleep * 4) % 1 !== 0 ? 'Choose a sleep goal from 4 to 12 hours, in quarter hours.'
    : !Number.isInteger(g.recovery) || g.recovery < 1 || g.recovery > 100 ? 'Choose a recovery goal from 1 to 100%.'
      : !isClock(g.bedtime) || !isClock(g.wake) ? 'Choose a target bedtime and wake time.' : null;

export function readGoals(): Goals {
  try {
    const g = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(GOALS_KEY) ?? 'null') as Partial<Goals> | null) };
    if (!goalsError(g)) return { sleep: g.sleep, recovery: g.recovery, bedtime: g.bedtime, wake: g.wake };
  } catch { /* damaged or blocked storage: fall back to defaults */ }
  return DEFAULTS;
}
/** Returns false when device storage is blocked. */
export function writeGoals(g: Goals) {
  try { localStorage.setItem(GOALS_KEY, JSON.stringify(g)); } catch { return false; }
  armReminder();
  return true;
}

export const reminderOn = () => { try { return localStorage.getItem(REMINDER_KEY) === 'on'; } catch { return false; } };
const canNotify = () => typeof Notification !== 'undefined';

let timer: ReturnType<typeof setTimeout> | undefined;
/** Fires 30 minutes before the target bedtime. Browsers give a closed web app no background timers, so this only runs while Fitzen is open. */
export function armReminder() {
  clearTimeout(timer);
  if (!reminderOn() || !canNotify() || Notification.permission !== 'granted') return;
  const at = readGoals().bedtime - 30, now = new Date();
  const wait = ((((at - (now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60)) % 1440) + 1440) % 1440) || 1440;
  timer = setTimeout(() => {
    try { new Notification('Bedtime in 30 minutes', { body: 'Time to wind down for your sleep goal.', tag: 'fitzen-bedtime' }); } catch { /* some mobile browsers only notify from a service worker */ }
    armReminder();
  }, wait * 60_000);
}

/** Turn the reminder on (asks permission) or off. Returns a message for the user. */
export async function setReminder(on: boolean): Promise<string> {
  if (on) {
    if (!canNotify()) return 'This browser cannot show notifications.';
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') return 'Notifications are blocked for Fitzen. Allow them in your browser settings to use the reminder.';
  }
  try { localStorage.setItem(REMINDER_KEY, on ? 'on' : 'off'); } catch { return 'Device storage is blocked, so the reminder cannot be saved.'; }
  armReminder();
  return on ? 'Bedtime reminder on. It only fires while Fitzen is open.' : 'Bedtime reminder off.';
}

armReminder();
