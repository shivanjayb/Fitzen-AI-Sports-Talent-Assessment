/**
 * Offline-first sync engine.
 *
 * Assessments are signed and written to the IndexedDB outbox FIRST, then the
 * outbox is flushed to the server whenever connectivity allows (submit time,
 * `online` events, interval ticks). Server-side idempotency on clientId makes
 * retries safe. Listeners let the UI render live pending counts.
 */

import { api, OfflineError, type AssessmentEnvelope } from './api';
import { idb } from './idb';
import { supabase } from './supabaseClient';

export interface SyncState {
  pending: number;
  syncing: boolean;
  lastSyncAt: number | null;
  online: boolean;
}

type Listener = (state: SyncState) => void;

const listeners = new Set<Listener>();
let state: SyncState = {
  pending: 0,
  syncing: false,
  lastSyncAt: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
};

function emit(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

export function subscribeSync(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function getSyncState(): SyncState {
  return state;
}

export async function refreshPendingCount(): Promise<void> {
  emit({ pending: await idb.count('outbox') });
}

async function syncToSupabaseCloud(envelope: AssessmentEnvelope): Promise<void> {
  const p = envelope.signed.payload;
  const m = p.metrics;
  try {
    await supabase.from('assessments').upsert(
      {
        client_id: p.clientId,
        athlete_id: p.athleteId,
        test: p.test ?? 'squat',
        captured_at: p.capturedAt,
        valid_reps: m.validReps ?? 0,
        total_attempts: m.totalAttempts ?? 0,
        form_accuracy_percent: m.formAccuracyPercent ?? m.movementQuality ?? 0,
        avg_asymmetry_deg: m.avgAsymmetryDeg ?? 0,
        movement_quality: m.movementQuality ?? 0,
        signature: envelope.signed.signature,
        key_fingerprint: envelope.signed.keyFingerprint,
        audit_trail: envelope.auditTrail ?? [],
      },
      { onConflict: 'client_id' }
    );
  } catch (e) {
    console.warn('Supabase cloud backup deferred:', e);
  }
}

/** Queue a signed envelope locally, then try to flush immediately. */
export async function enqueueAssessment(envelope: AssessmentEnvelope): Promise<void> {
  await idb.put('outbox', {
    clientId: envelope.signed.payload.clientId,
    envelope,
    queuedAt: Date.now(),
  });
  await refreshPendingCount();
  void flushOutbox();
}

let flushInFlight: Promise<void> | null = null;

export function flushOutbox(): Promise<void> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = doFlush().finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

async function doFlush(): Promise<void> {
  const items = await idb.getAll<{ clientId: string; envelope: AssessmentEnvelope }>('outbox');
  if (items.length === 0) {
    emit({ pending: 0 });
    return;
  }
  emit({ syncing: true });
  try {
    const response = await api.sync(items.map((i) => i.envelope));
    const results = response?.results || [];
    for (const result of results) {
      if (result.clientId && result.status !== 'network_error') {
        const matching = items.find((i) => i.clientId === result.clientId);
        if (matching) {
          void syncToSupabaseCloud(matching.envelope);
        }
        await idb.delete('outbox', result.clientId);
      }
    }
    emit({ online: true, lastSyncAt: Date.now() });
  } catch (err) {
    if (err instanceof OfflineError) emit({ online: false });
    console.error('[Sync] Outbox flush encountered error:', err);
  } finally {
    emit({ syncing: false, pending: await idb.count('outbox') });
  }
}

/** Wire browser connectivity events + a slow safety interval. Idempotent. */
let started = false;
export function startSyncLoop(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => {
    emit({ online: true });
    void flushOutbox();
  });
  window.addEventListener('offline', () => emit({ online: false }));
  window.setInterval(() => void flushOutbox(), 45_000);
  void refreshPendingCount();
  void flushOutbox();
}
