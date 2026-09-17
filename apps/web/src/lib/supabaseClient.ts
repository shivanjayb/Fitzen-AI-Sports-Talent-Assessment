import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  'https://hfcodbbwiidrehbjwhmg.supabase.co';

const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmY29kYmJ3aWlkcmVoYmp3aG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NTYzODUsImV4cCI6MjEwNTEzMjM4NX0.3x4ykChTmPJJT1n3HymIrwdg95TOGbaOTIqwd5nlkbY';

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Uploads an assessment video clip to the Supabase Cloud Storage bucket ('assessment-videos').
 */
export async function uploadAssessmentVideoToSupabase(
  file: File | Blob,
  assessmentId: string
): Promise<string | null> {
  const fileExt = file instanceof File ? file.name.split('.').pop() ?? 'webm' : 'webm';
  const filePath = `squats/${assessmentId}.${fileExt}`;

  const { error } = await supabase.storage
    .from('assessment-videos')
    .upload(filePath, file, { upsert: true, contentType: file.type || 'video/webm' });

  if (error) {
    console.warn('Supabase video upload deferred:', error.message);
    return null;
  }

  const { data } = supabase.storage.from('assessment-videos').getPublicUrl(filePath);
  return data.publicUrl;
}

/**
 * Uploads 3D MediaPipe landmark telemetry logs to the Supabase Cloud Storage bucket ('assessment-landmarks').
 */
export async function uploadLandmarksJsonToSupabase(
  landmarksJson: unknown,
  assessmentId: string
): Promise<string | null> {
  const filePath = `squats/${assessmentId}_landmarks.json`;
  const blob = new Blob([JSON.stringify(landmarksJson, null, 2)], { type: 'application/json' });

  const { error } = await supabase.storage
    .from('assessment-landmarks')
    .upload(filePath, blob, { upsert: true, contentType: 'application/json' });

  if (error) {
    console.warn('Supabase landmark log upload deferred:', error.message);
    return null;
  }

  const { data } = supabase.storage.from('assessment-landmarks').getPublicUrl(filePath);
  return data.publicUrl;
}
