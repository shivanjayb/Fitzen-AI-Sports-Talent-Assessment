import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './app/glass.css';
import { isLowEndDevice } from './pose/poseSource';

// Lite mode: weak phones skip blur and motion so the camera and pose model get the CPU/GPU.
if (isLowEndDevice()) document.documentElement.dataset.lite = '';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
