import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { exerciseById } from '@fitzen/engines';
import { deleteWellnessRecord, getWellnessRecords, restoreWellnessRecord, saveWellnessRecord, subscribeWellness, syncWellness, validateWellness, wellnessToday, type WellnessRecord } from '../app/wellnessStore';
import { getHistory } from '../app/store';
import { Card, CardHead, Icon, PageHead, Soon, toast } from './ui';
import { dayStart, fmt, useSampleMode } from './sample';
import './journal.css';

const MOODS = ['Great', 'Good', 'Okay', 'Low', 'Rough'] as const;
type Mood = typeof MOODS[number];
const moodValue = (m: Mood) => 5 - MOODS.indexOf(m);
const moodWord = (v: number | undefined) => MOODS[5 - (v ?? 3)] ?? 'Okay';

const fullDate = (when: string | Date) => {
  const d = typeof when === 'string' ? new Date(`${when}T12:00:00`) : when;
  return `${d.toLocaleDateString('en-GB', { weekday: 'short' })}, ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
};
const isoDaysAgo = (n: number) => { const d = dayStart(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const SAMPLE_ENTRIES: { date: string; mood: Mood }[] = (['Good', 'Okay', 'Great', 'Good', 'Low', 'Good'] as const).map((mood, i) => ({ date: isoDaysAgo(i + 1), mood }));
interface MoodRow { mood: Mood; days: number; recovery: number | null; sleep: number | null }
const SAMPLE_ROWS: MoodRow[] = [
  { mood: 'Great', days: 1, recovery: 62, sleep: 7.6 }, { mood: 'Good', days: 3, recovery: 70, sleep: 7.8 },
  { mood: 'Okay', days: 1, recovery: 72, sleep: 7.7 }, { mood: 'Low', days: 1, recovery: 80, sleep: 7.6 },
];

function Dots({ on, tone, label }: { on: number; tone: 'accent' | 'violet'; label: string }) {
  return <svg className="x-journal-dots" viewBox="0 0 69 6" width={69} height={6} role="img" aria-label={label}>
    {Array.from({ length: 10 }, (_, i) => <circle key={i} cx={3 + i * 7} cy={3} r={2.3} className={i < on ? `on t-${tone}` : ''} />)}
  </svg>;
}

export default function Journal() {
  const sample = useSampleMode();
  const [, bump] = useState(0);
  useEffect(() => subscribeWellness(() => bump((n) => n + 1)), []);
  const all = getWellnessRecords();
  const entries = all.filter((r) => r.kind === 'journal');
  const sleepByDate = new Map<string, number>();
  for (const r of all) if (r.kind === 'sleep' && r.values.hours !== undefined && !sleepByDate.has(r.date)) sleepByDate.set(r.date, r.values.hours);

  const [note, setNote] = useState('');
  const [mood, setMood] = useState<Mood | null>(null);
  const [date, setDate] = useState(wellnessToday());
  const [error, setError] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!mood) { setError('Choose a mood to save this check-in.'); return; }
    const input = { kind: 'journal' as const, date, title: mood, note, unit: '', values: { mood: moodValue(mood) } };
    const problem = validateWellness(input);
    if (problem) { setError(problem); return; }
    try { saveWellnessRecord(input); setNote(''); setMood(null); setError(''); toast('Check-in saved. Only you can see it.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'This check-in could not be saved.'); }
  };
  const remove = (r: WellnessRecord) => {
    try { deleteWellnessRecord(r.id); toast('Check-in deleted.', { label: 'Undo', run: () => restore(r) }); }
    catch (err) { toast(err instanceof Error ? err.message : 'This check-in could not be deleted.'); }
  };
  const restore = (r: WellnessRecord) => {
    try { restoreWellnessRecord(r); toast('Check-in restored.'); }
    catch (err) { toast(err instanceof Error ? err.message : 'This check-in could not be restored.'); }
  };
  const reload = async () => {
    try { await syncWellness(); } catch { /* offline: local records still show */ }
    bump((n) => n + 1); toast('Check-ins refreshed.');
  };
  const addNote = (name: string) => { setNote(`After ${name}: `); area.current?.focus(); area.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); };

  const rows: MoodRow[] = sample ? SAMPLE_ROWS : MOODS.flatMap((m) => {
    const days = entries.filter((r) => moodWord(r.values.mood) === m);
    if (!days.length) return [];
    const hours = days.map((r) => sleepByDate.get(r.date)).filter((h): h is number => h !== undefined);
    return [{ mood: m, days: days.length, recovery: null, sleep: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null }];
  });
  const tableCount = sample ? SAMPLE_ENTRIES.length : entries.length;

  type Row = { key: string; date: string; mood: Mood; text: string; record?: WellnessRecord };
  const list: Row[] = [
    ...entries.map((r) => ({ key: r.id, date: r.date, mood: moodWord(r.values.mood), text: r.note || r.title, record: r })),
    ...(sample ? SAMPLE_ENTRIES.map((s) => ({ key: `sample-${s.date}`, date: s.date, mood: s.mood, text: 'Sample check-in' })) : []),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const sessions = getHistory().slice().sort((a, b) => b.report.startedAt.localeCompare(a.report.startedAt)).slice(0, 3);

  return <>
    <PageHead title="Journal" subtitle="Private check-ins that connect your day to your data." />
    <div className="x-journal-grid">
      <Card className="x-journal-compose">
        <CardHead title="How are you feeling?" />
        <p className="x-journal-lead">Connect the dots between your day and your data.</p>
        <form onSubmit={save}>
          <label className="sr-only" htmlFor="x-journal-note">Your journal note</label>
          <textarea id="x-journal-note" ref={area} className="x-journal-text" value={note} maxLength={1000} placeholder="What’s on your mind today?"
            onChange={(e) => { setNote(e.target.value); setError(''); }} />
          <div className="x-journal-moods" role="group" aria-label="Mood">
            <span>Mood</span>
            {MOODS.map((m) => <button key={m} type="button" className="x-chip" aria-pressed={mood === m} onClick={() => { setMood(mood === m ? null : m); setError(''); }}>{m}</button>)}
          </div>
          {error && <p className="x-journal-error" role="alert">{error}</p>}
          <div className="x-journal-foot">
            <input type="date" className="x-journal-date num" aria-label="Journal date" value={date} max={wellnessToday()} required onChange={(e) => setDate(e.target.value)} />
            <span className="x-spacer" />
            <span className="x-journal-private">Only you can see this.</span>
            <button type="submit" className="x-btn accent x-journal-save" disabled={!note.trim()} title={note.trim() ? undefined : 'Write a note to save it'}>Save check-in</button>
          </div>
        </form>
      </Card>

      <aside className="x-journal-side">
        <Card tone="night" className="x-journal-ai">
          <CardHead title="Reflect with your AI"><Soon /></CardHead>
          <p className="x-journal-ai-lead">Write freely. Your AI can help you reflect on a check-in, with your readings only when you choose.</p>
          <div className="x-journal-ai-count">
            <div className="x-stat"><b>{sample ? SAMPLE_ENTRIES.length : entries.length}</b><small>check-ins{sample ? ' · sample' : ''}</small></div>
            <span className="x-caption">0 with an AI reflection</span>
          </div>
          <div className="x-journal-ai-foot">
            <span>Not connected yet</span><span className="x-spacer" />
            <button className="x-btn small x-journal-on-dark" onClick={() => toast('Connecting your AI is coming soon.')}>Connect your AI</button>
          </div>
        </Card>

        <Card className="x-journal-mood">
          <CardHead title={<>Mood and your body <span className="x-journal-muted">· {tableCount} check-in{tableCount === 1 ? '' : 's'}</span></>} />
          {rows.length ? <table className="x-journal-table">
            <thead><tr><th scope="col">Mood</th><th scope="col">Recovery</th><th scope="col">Sleep</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.mood}>
              <th scope="row">{r.mood}<small>{r.days} day{r.days === 1 ? '' : 's'}</small></th>
              <td><span className="x-journal-value">
                <Dots on={r.recovery === null ? 0 : Math.round(r.recovery / 10)} tone="accent" label={r.recovery === null ? 'No recovery readings' : `Recovery ${r.recovery}%`} />
                {r.recovery === null ? <span className="x-journal-none">—</span> : <span className="num">{r.recovery}<small>%</small></span>}
              </span></td>
              <td><span className="x-journal-value">
                <Dots on={r.sleep === null ? 0 : Math.round(r.sleep)} tone="violet" label={r.sleep === null ? 'No sleep records on these dates' : `Sleep ${fmt(r.sleep, 1)} hours`} />
                {r.sleep === null ? <span className="x-journal-none">—</span> : <span className="num">{fmt(r.sleep, 1)}<small>h</small></span>}
              </span></td>
            </tr>)}</tbody>
          </table> : <p className="x-empty x-journal-mood-empty">Save a check-in with a mood to see it beside your sleep.</p>}
          <p className="x-journal-note">After 8 check-ins with a mood, Fitzen shows which of your signals actually match how you feel. You have {entries.length} of 8. <Soon /></p>
          <p className="x-journal-note">Averages of the readings recorded on each check-in’s date. A pattern across your notes, not a cause.</p>
        </Card>

        <Card className="x-journal-training">
          <CardHead title="Training notes" />
          {sessions.length ? <ul className="x-journal-sessions">{sessions.map((s) => {
            const name = exerciseById(s.report.exerciseId)?.name ?? 'Assessment';
            return <li key={s.id}>
              <span><b>{name}</b><small>{fullDate(new Date(s.report.startedAt))}</small></span>
              <button className="x-btn small ghost" onClick={() => addNote(name)}><Icon name="pencil" />Add a note</button>
            </li>;
          })}</ul> : <div className="x-journal-sessions-empty">
            <p className="x-empty">Your last assessment sessions appear here, ready for a note on how they felt.</p>
            <Link className="x-btn small ghost" to="/train">Start a session</Link>
          </div>}
        </Card>
      </aside>

      <Card className="x-journal-history">
        <CardHead title={<>Check-ins <span className="x-journal-muted">· {list.length}{sample ? ' · Sample data' : ''}</span></>}>
          <button className="x-icon-btn small" aria-label="Reload check-ins" onClick={reload}><Icon name="refresh" /></button>
        </CardHead>
        {list.length ? <div className="x-journal-entries">{list.map((e) => <article key={e.key} className={`x-journal-entry${e.record ? '' : ' is-sample'}`}>
          <div className="x-journal-entry-head">
            <time dateTime={e.date}>{fullDate(e.date)}</time>
            <span className="x-badge">{e.mood}</span>
            <span className="x-spacer" />
            {e.record ? <button className="x-icon-btn small" aria-label={`Delete check-in from ${fullDate(e.date)}`} onClick={() => remove(e.record!)}><Icon name="close" /></button>
              : <span className="x-badge">Sample data</span>}
          </div>
          <p className="x-journal-entry-text">{e.text}</p>
        </article>)}</div> : <p className="x-empty x-journal-history-empty">Your check-ins appear here once you save one.</p>}
      </Card>
    </div>
  </>;
}
