import type { Category, ExerciseDef } from '../types.js';
import { GYM } from './gym.js';
import { CALISTHENICS } from './calisthenics.js';
import { SPORT } from './sport.js';
import { WELLNESS } from './wellness.js';

export const EXERCISES: ExerciseDef[] = [...GYM, ...CALISTHENICS, ...SPORT, ...WELLNESS];

export const CATEGORIES: Array<{ id: Category; label: string; icon: string }> = [
  { id: 'gym', label: 'Gym', icon: '🏋️' },
  { id: 'calisthenics', label: 'Calisthenics', icon: '🤸' },
  { id: 'athletics', label: 'Athletics', icon: '🏃' },
  { id: 'throws', label: 'Throws & Strikes', icon: '🎯' },
  { id: 'olympic', label: 'Olympic Lifts', icon: '🥇' },
  { id: 'sai', label: 'SAI Battery', icon: '🇮🇳' },
  { id: 'yoga', label: 'Yoga', icon: '🧘' },
  { id: 'mobility', label: 'Mobility', icon: '🌀' },
];

export const exerciseById = (id: string): ExerciseDef | undefined => EXERCISES.find((e) => e.id === id);
