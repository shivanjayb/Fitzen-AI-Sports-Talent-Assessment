import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { EXERCISES, exerciseById } from '@fitzen/engines';
import { FigureArt } from '../app/Figure';
import { useIdentity } from '../lib/supabase';
import { Icon, Marker, type IconName, type Tone } from './ui';
import { setSampleMode } from './sample';
import './xeyo.css';
import './auth.css';

const HERO = exerciseById('back-squat') ?? EXERCISES[0]!;
const FEATURES: Array<{ title: string; text: string; icon: IconName; tone: Tone }> = [
  { title: 'Live camera coaching', text: 'Point your phone at yourself. Every rep, angle and hold is measured as you move, with green, amber and red form cues.', icon: 'camera', tone: 'dark' },
  { title: 'Offline video analysis', text: 'Upload a clip you already have. The same engine reads it on your device; the video never leaves it.', icon: 'upload', tone: 'light' },
  { title: 'Reports you can trust', text: 'Each session gets a report with rep count, range of motion, tempo and an integrity check for genuine attempts.', icon: 'reports', tone: 'light' },
  { title: 'Talent assessment', text: 'Jumps, sprints, throws and the SAI battery, compared with age-group norms to surface athletic potential.', icon: 'trophy', tone: 'night' },
];

/** Public landing page in the same Xeyo design language as the app. */
export default function XLanding() {
  const { user } = useIdentity();
  useEffect(() => {
    document.documentElement.classList.add('x-root');
    return () => document.documentElement.classList.remove('x-root');
  }, []);
  return <div className="x x-land">
    <header className="x-land-nav">
      <Link to="/" className="x-brand" style={{ textDecoration: 'none' }}><span className="x-orb" aria-hidden /><span className="x-brand-name">Fitzen</span></Link>
      <nav aria-label="Get started">
        {user ? <Link className="x-btn small" to="/home">Open your dashboard</Link> : <>
          <Link className="x-btn ghost small x-hide-sm" to="/auth?next=%2Fcoach">For coaches</Link>
          <Link className="x-btn ghost small" to="/auth">Sign in</Link>
          <Link className="x-btn small" to="/auth?mode=create">Create account</Link>
        </>}
      </nav>
    </header>

    <section className="x-land-hero">
      <div className="x-card x-land-copy">
        <div>
          <div className="x-dialog-kicker"><Marker />AI sports talent assessment</div>
          <h1>Every sport.<br /><em>One coach.</em></h1>
          <p>Fitzen reads {EXERCISES.length} exercises joint by joint from a single phone camera, counts every rep, and turns each session into a report you can share. Camera processing stays on your device.</p>
        </div>
        <div className="x-land-cta">
          <Link className="x-btn" to={user ? '/train' : '/auth?mode=create'}>{user ? 'Start training' : 'Get started free'}<Icon name="arrow" /></Link>
          <Link className="x-btn ghost" to="/home" onClick={() => setSampleMode(true)}>Explore the demo</Link>
        </div>
      </div>
      <div className="x-card x-tile orange x-land-stage">
        <div role="img" aria-label={`Animated demonstration of ${HERO.name}`}><FigureArt def={HERO} frame="mid" w={640} h={640} /></div>
        <div className="x-auth-panel">
          <div className="x-land-stats">
            <div><b>{EXERCISES.length}</b><span>exercises measured</span></div>
            <div><b>1</b><span>phone camera</span></div>
            <div><b>0</b><span>videos uploaded</span></div>
          </div>
        </div>
      </div>
    </section>

    <section className="x-land-grid" aria-label="What Fitzen does">
      {FEATURES.map((f) => <article key={f.title} className={`x-card x-tile ${f.tone === 'light' ? '' : f.tone}`}>
        <div className="x-card-head"><Marker /><h2>{f.title}</h2></div>
        <p>{f.text}</p>
        <span className="x-land-feature-icon" aria-hidden><Icon name={f.icon} /></span>
      </article>)}
    </section>

    <footer className="x-land-foot"><span>© Fitzen · Built for every starting point.</span><span>{!user && <><Link to="/auth?next=%2Fcoach">For coaches</Link> · </>}<Link to="/privacy">Privacy &amp; data</Link></span></footer>
  </div>;
}
