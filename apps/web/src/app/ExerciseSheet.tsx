import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { ExerciseDef } from '@fitzen/engines';
import { IconCamera, IconPlay, IconUpload } from './icons';
import { setPendingVideo } from './Session';
import Pictogram from './Pictogram';

export default function ExerciseSheet({ ex, onClose }: { ex: ExerciseDef; onClose: () => void }) {
  const nav = useNavigate();
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const start = useRef<number | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const close = () => { setClosing(true); setTimeout(onClose, 260); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const go = (src: 'camera' | 'demo' | 'video') => nav(`/train/${ex.id}?src=${src}`);
  const target = ex.mode === 'reps' && ex.reps ? `${ex.reps.start === 'high' ? '≤' : '≥'} ${ex.reps.target}° ${ex.angles.find((a) => a.id === ex.reps!.driver)?.label.toLowerCase()}` :
    ex.mode === 'hold' ? `${ex.hold?.targetSec ?? 30} s hold` : ex.event?.releaseAngle ? `${ex.event.releaseAngle.good[0]}–${ex.event.releaseAngle.good[1]}° release` : 'Max height';

  return createPortal(
    <>
      <div className="scrim" onClick={close} style={closing ? { opacity: 0, transition: 'opacity .3s' } : undefined} />
      <div
        className={`sheet glass ${closing ? 'closing' : ''}`} role="dialog" aria-modal="true" aria-label={ex.name}
        style={dragY ? { transform: `translate(-50%, ${dragY}px)`, animation: 'none' } : undefined}
      >
        <div
          className="grabber"
          onPointerDown={(e) => { start.current = e.clientY; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { if (start.current !== null) setDragY(Math.max(0, e.clientY - start.current)); }}
          onPointerUp={() => { start.current = null; if (dragY > 120) close(); else setDragY(0); }}
        />
        <div className="row" style={{ gap: 14 }}>
          <Pictogram def={ex} size={72} />
          <div>
            <h2 style={{ margin: 0, fontSize: '1.6rem', letterSpacing: '-0.03em' }}>{ex.name}</h2>
            <div className="muted" style={{ fontSize: '0.88rem' }}>{ex.muscles.slice(0, 4).join(' · ')}</div>
          </div>
        </div>
        <p className="muted" style={{ lineHeight: 1.5 }}>{ex.summary}</p>

        <div className="kv">
          <div><span>Camera</span><b>{ex.camera === 'side' ? 'Side-on' : 'Facing'}</b></div>
          <div><span>Target</span><b style={{ fontSize: '1.05rem' }}>{target}</b></div>
          <div><span>Checks</span><b>{ex.checks.length} joints</b></div>
        </div>

        <h3 className="section-title" style={{ marginTop: 20 }}>Set up</h3>
        <ol className="steps">{ex.setup.map((s, i) => <li key={i}>{s}</li>)}</ol>

        <h3 className="section-title">What we measure</h3>
        <div className="list">
          {ex.checks.map((c, i) => (
            <div key={i} className="row" style={{ fontSize: '0.88rem', gap: 12 }}>
              <span className="tag" style={{ minWidth: 64, textAlign: 'center' }}>{c.when}</span>
              <span style={{ flex: 1 }}>{ex.angles.find((a) => a.id === c.angle)?.label}</span>
              <span className="num z-good">{c.good[0]}–{c.good[1]}</span>
            </div>
          ))}
        </div>
        <div className="zone-legend" style={{ marginTop: 12 }}><span><i style={{ background: 'var(--good)' }} />Correct</span><span><i style={{ background: 'var(--ok)' }} />Moderate</span><span><i style={{ background: 'var(--bad)' }} />Fix it</span></div>

        <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
          <button className="btn primary block press" onClick={() => go('camera')}><IconCamera /> Start with camera</button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button className="btn block press" onClick={() => file.current?.click()}><IconUpload /> Analyse video</button>
            <button className="btn block press" onClick={() => go('demo')}><IconPlay /> Watch demo</button>
          </div>
          <input ref={file} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPendingVideo(f); go('video'); } }} />
        </div>
      </div>
    </>,
    document.body,
  );
}
