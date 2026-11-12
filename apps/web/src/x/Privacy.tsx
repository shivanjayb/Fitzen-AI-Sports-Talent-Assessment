import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Icon, Marker, PageHead, type IconName } from './ui';
import './account.css';

// Each statement mirrors app/store.ts, app/wellnessStore.ts, lib/supabase.ts and supabase/migrations; update them together.
const ITEMS: [IconName, string, string][] = [
  ['camera', 'Camera and video', 'Pose detection runs in your browser. The camera feed and any video you analyse are processed on your device and never uploaded. Only the resulting report is saved: the exercise, reps or measurement, form score, timing and integrity checks.'],
  ['reports', 'Assessment sessions', 'Your latest 60 sessions are saved in this browser. When you sign in, the full report is also backed up to your account so you can open it on another device, and a coach sees it only if you join their squad. Leaderboards receive just the exercise, your best number, form score and date. Demo runs stay on this device.'],
  ['heart', 'Wellness records', 'Vitals, sleep, body, nutrition, journal check-ins and blood results you enter are saved in this browser, separately for each account. When you sign in they sync privately to your account. Fitzen does not diagnose or interpret them.'],
  ['people', 'Leaderboards and under-18s', 'Public leaderboards are off until you turn them on. Off, only your groups see your scores. Athletes aged 18 or younger appear as initials and need a parent or guardian’s approval before public sharing or before a squad coach can see their reports.'],
  ['sparkle', 'AI, food photos and wearables', 'The Ask bar uses Fitzen’s on-device coach, so no chat is sent to an AI provider. Food photos are recognised by a model that runs in your browser: the model is downloaded once from a public CDN, and the photo itself is never uploaded. Health-file imports (Apple Health, Fitbit, Garmin) are read on your device, and a Bluetooth heart-rate strap talks only to this browser. Imported and measured values are saved as wellness records, as above.'],
  ['shield', 'Deleting your data', 'Profile → Account & leaderboards → Delete account data removes your wellness backup, synced sessions, profile copy and public profile, and with it your scores, groups you own and memberships. Your sign-in email itself stays. Sessions saved in this browser stay until you delete them or clear this site’s data.'],
];

export default function Privacy() {
  return <div>
    <PageHead title="Privacy" subtitle="Your data, your choice." />
    <section className="x-card x-privacy" aria-labelledby="x-privacy-title">
      <div className="x-dialog-kicker"><Marker />Privacy</div>
      <h2 id="x-privacy-title" style={{ fontSize: 24, lineHeight: '29px', letterSpacing: '-.5px', fontWeight: 400 }}>Your data, your choice</h2>
      <p>Fitzen works without an account: your profile, sessions and records are stored in this browser. {supabase
        ? 'If you sign in, they are also kept in your Fitzen account (a Supabase project) and protected by row-level policies, so only your login can read or change them.'
        : 'This build has no online account configured, so nothing leaves this device.'}</p>
      <ul className="x-privacy-list">{ITEMS.map(([icon, title, body]) => <li key={title}>
        <span className="x-privacy-icon" aria-hidden><Icon name={icon} /></span>
        <div><h3>{title}</h3><p>{body}</p></div>
      </li>)}</ul>
      <div className="x-dialog-footer">
        <Link className="x-btn ghost" to="/profile#account">Manage account data <Icon name="arrow" /></Link>
        <span>Export your data anytime from Profile.</span>
      </div>
    </section>
  </div>;
}
