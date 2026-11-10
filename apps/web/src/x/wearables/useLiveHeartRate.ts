import { useSyncExternalStore } from 'react';
import { getLiveHr, subscribeLiveHr } from './heartRate';

export const useLiveHeartRate = () => useSyncExternalStore(subscribeLiveHr, getLiveHr);
