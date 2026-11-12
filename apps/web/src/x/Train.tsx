import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CATEGORIES, EXERCISES, standardReps, type ExerciseDef } from '@fitzen/engines';
import { ExerciseArt } from '../app/Figure';
import { setPendingVideo } from '../app/pendingVideo';
import { getHistory, isEligibleSession, measureOf } from '../app/store';
import { Card, CardHead, Icon, PageHead, Soon, Stat, toast } from './ui';
import './train.css';

const MODE = { reps: 'Reps', hold: 'Hold', event: 'Power' } as const;
const catLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

/** Latest measured number per exercise, read once for the whole grid. */
function latestByExercise() {
  const out = new Map<string, string>();
  for (const s of getHistory()) {
    if (out.has(s.report.exerciseId) || !isEligibleSession(s)) continue;
    const m = measureOf(s.report);
    const v = m?.metric === 'reps' ? standardReps(s.report) : m?.value;
    if (m && v != null) out.set(s.report.exerciseId, `${Number(v.toFixed(1))} ${m.unit}`);
  }
  return out;
}

function ExCard({ ex, latest }: { ex: ExerciseDef; latest?: string }) {
  const [play, setPlay] = useState(false);
  const on = () => setPlay(true), off = () => setPlay(false);
  return <article className="x-card x-tile x-train-ex" onMouseEnter={on} onMouseLeave={off} onFocus={on} onBlur={off}>
    <Link to={`/exercise/${ex.id}`} className="x-train-ex-link">
      <div className="x-train-art"><ExerciseArt def={ex} play={play} w={480} h={360} /></div>
      <h3>{ex.name}</h3>
      <span className="x-caption">{catLabel(ex.category)} · {MODE[ex.mode]}{ex.mode === 'hold' ? ` ${ex.hold?.targetSec ?? 30} s` : ''}</span>
    </Link>
    <div className="x-train-ex-foot">
      <span className="x-caption">{latest ? `Latest ${latest}` : 'No assessment yet'}</span>
      <Link to={`/train/${ex.id}?src=demo`} className="x-chip x-train-demo" aria-label={`Watch a demo of ${ex.name}`}><Icon name="play" size={11} />Demo</Link>
    </div>
  </article>;
}

export default function Train() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const file = useRef<HTMLInputElement>(null);
  const uploadCard = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [clipFor, setClipFor] = useState(EXERCISES[0]!.id);
  const upload = params.get('upload') === '1';
  useEffect(() => { if (upload) uploadCard.current?.scrollIntoView({ block: 'center' }); }, [upload]);

  const category = params.get('type') ?? 'all', mode = params.get('mode') ?? 'all', query = params.get('q') ?? '';
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key); else next.set(key, value);
    setParams(next, { replace: true });
  };
  const needle = query.trim().toLocaleLowerCase();
  const list = EXERCISES.filter((e) => (category === 'all' || e.category === category) && (mode === 'all' || e.mode === mode) &&
    (!needle || [e.name, catLabel(e.category), ...e.muscles, ...e.equipment].some((v) => v.toLocaleLowerCase().includes(needle))));
  const latest = useMemo(latestByExercise, []);
  const filtered = category !== 'all' || mode !== 'all' || !!query;

  return <div className="x-train">
    <PageHead title="Train" subtitle="90+ movements, measured by your camera.">
      <Link to="/reports" className="x-btn ghost small"><Icon name="reports" />Reports</Link>
    </PageHead>

    <div className="x-train-hero">
      <Card tone="dark">
        <CardHead title="Live session" />
        <span className="x-train-glyph" aria-hidden><Icon name="camera" size={22} /></span>
        <Stat value={EXERCISES.length} unit="movements" />
        <span className="x-caption">Pick a movement and start. Your camera measures every rep; video stays on this device.</span>
        <div className="x-train-actions">
          <button className="x-btn small accent" onClick={() => { search.current?.focus(); search.current?.scrollIntoView({ block: 'center' }); }}>Pick a movement</button>
        </div>
      </Card>

      <section ref={uploadCard} className={`x-card x-tile orange x-train-upload${upload ? ' is-focus' : ''}`} aria-labelledby="x-train-upload-title">
        <div className="x-card-head"><span className="x-marker" aria-hidden /><h2 id="x-train-upload-title">Analyse a video</h2></div>
        <span className="x-train-glyph" aria-hidden><Icon name="upload" size={22} /></span>
        <p className="x-train-lead">Upload a clip you already have and get the same report, worked out offline on this device.</p>
        <div className="x-train-actions">
          <label className="sr-only" htmlFor="x-train-clip">Movement in the clip</label>
          <select id="x-train-clip" className="x-train-select" value={clipFor} onChange={(e) => setClipFor(e.target.value)} autoFocus={upload}>
            {CATEGORIES.map((c) => <optgroup key={c.id} label={c.label}>
              {EXERCISES.filter((e) => e.category === c.id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </optgroup>)}
          </select>
          <button className="x-btn small" onClick={() => file.current?.click()}><Icon name="upload" />Choose video</button>
        </div>
        <input ref={file} type="file" accept="video/*" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = ''; // picking the same clip again (e.g. after going back) must still fire onChange
          if (f) { setPendingVideo(f); nav(`/train/${clipFor}?src=video`); }
        }} />
      </section>

      <Card tone="night">
        <CardHead title="Guided assessment" />
        <span className="x-train-glyph" aria-hidden><Icon name="flag" size={22} /></span>
        <p className="x-train-lead">Jump, squat, push-up and plank. Four guided tests, with a camera check before each one.</p>
        <div className="x-train-actions">
          <Link to="/guided" className="x-btn small accent">Start assessment</Link>
          <Link to="/validation" className="x-text-button x-train-on-dark">Coach validation</Link>
        </div>
      </Card>
    </div>

    <Card className="x-train-soon">
      <div className="x-card-head">
        <span className="x-train-glyph small" aria-hidden><Icon name="watch" size={17} /></span>
        <h2>Smartwatch heart rate during sessions</h2><span className="x-spacer" /><Soon />
      </div>
      <p className="x-caption">Pair a watch to see your heart rate next to your form score while you train.</p>
      <button className="x-btn ghost small" aria-disabled="true" onClick={() => toast('Smartwatch heart rate is coming soon.')}>Connect a watch</button>
    </Card>

    <section className="x-train-library" aria-labelledby="x-train-lib-title">
      <div className="x-train-lib-head">
        <div className="x-card-head"><span className="x-marker" aria-hidden /><h2 id="x-train-lib-title">Movement library</h2>
          <span className="x-caption" role="status">· {list.length} {list.length === 1 ? 'movement' : 'movements'}</span></div>
        <label className="x-train-search">
          <Icon name="search" size={16} /><span className="sr-only">Search movements</span>
          <input ref={search} className="x-input" type="search" value={query} onChange={(e) => set('q', e.target.value)} placeholder="Search movements, muscles or equipment" />
        </label>
      </div>
      <div className="x-train-chips" role="group" aria-label="Categories">
        <button className="x-chip" aria-pressed={category === 'all'} onClick={() => set('type', 'all')}>All</button>
        {CATEGORIES.map((c) => <button key={c.id} className="x-chip" aria-pressed={category === c.id} onClick={() => set('type', c.id)}>{c.label}</button>)}
      </div>
      <div className="x-train-chips" role="group" aria-label="Measured by">
        {(['all', 'reps', 'hold', 'event'] as const).map((m) => <button key={m} className="x-chip" aria-pressed={mode === m} onClick={() => set('mode', m)}>{m === 'all' ? 'All types' : MODE[m]}</button>)}
        {filtered && <button className="x-text-button" onClick={() => setParams({}, { replace: true })}>Clear filters</button>}
      </div>
      {list.length ? <div className="x-train-grid">{list.map((e) => <ExCard key={e.id} ex={e} latest={latest.get(e.id)} />)}</div>
        : <Card className="x-train-none"><p className="x-empty">No movement matches. Try another name or clear the filters.</p>
          <button className="x-btn small" onClick={() => setParams({}, { replace: true })}>Clear filters</button></Card>}
    </section>
  </div>;
}
