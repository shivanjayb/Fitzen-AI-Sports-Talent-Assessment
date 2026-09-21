import { supabase, isSupabaseConfigured } from './supabase';

export { supabase, isSupabaseConfigured };

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
