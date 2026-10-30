import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import './app/glass.css';
import './app/quiet.css';
import { isLowEndDevice } from './pose/poseSource';
import { languageReady } from './app/language';

// Lite mode: weak phones skip blur and motion so the camera and pose model get the CPU/GPU.
if (isLowEndDevice()) document.documentElement.dataset.lite = '';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}

void languageReady.then(() => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
));
