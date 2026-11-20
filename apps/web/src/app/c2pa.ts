import type { ForensicFlag } from '@fitzen/engines';
import type { ManifestStore } from '@contentauth/c2pa-web';

/** IPTC digital source types that declare generated or AI-composited media (C2PA 2.1 §18.13, IPTC vocabulary). */
const AI_SOURCE = /trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia|algorithmicMedia|compositeSynthetic|trainedAlgorithmicData/;
const SCREEN = /screenCapture/;

type Action = { action?: string; digitalSourceType?: string; softwareAgent?: unknown };

/**
 * Turn a cryptographically validated C2PA manifest store into forensic flags.
 * Replaces the text-scan flags from inspectContainer, which cannot tell a valid signature from a forged one.
 */
export function c2paFlags(store: ManifestStore): ForensicFlag[] {
  const flags: ForensicFlag[] = [];
  const failures = store.validation_results?.activeManifest?.failure ?? store.validation_status?.filter((s) => s.success === false) ?? [];
  const active = store.active_manifest ? store.manifests?.[store.active_manifest] : undefined;
  const actions = (active?.assertions ?? [])
    .filter((a) => a.label.startsWith('c2pa.actions'))
    .flatMap((a) => ((a.data as { actions?: Action[] } | undefined)?.actions ?? []));
  const sources = [...new Set(actions.map((a) => a.digitalSourceType).filter((s): s is string => !!s))];
  const signer = active?.signature_info?.issuer ?? active?.signature_info?.common_name ?? 'unknown signer';
  const tool = active?.claim_generator_info?.[0]?.name ?? active?.claim_generator ?? 'unknown tool';

  if (store.validation_state === 'Invalid') {
    const codes = failures.map((f) => f.code).join(', ') || 'validation_state=Invalid';
    // A hash mismatch means the pixels or timing changed after the manifest was signed.
    const tampered = failures.some((f) => /mismatch|hash/i.test(f.code));
    flags.push(tampered
      ? { code: 'c2pa-tampered', severity: 'strong', message: 'Content Credentials are signed, but the video was changed after signing (hash mismatch). The clip is not the one that was signed.', evidence: codes }
      : { code: 'c2pa-invalid', severity: 'warn', message: 'Content Credentials failed validation, so their claims about where this clip came from cannot be trusted.', evidence: codes });
  }
  const valid = store.validation_state === 'Valid' || store.validation_state === 'Trusted';
  const ai = sources.filter((s) => AI_SOURCE.test(s));
  if (ai.length) flags.push({
    code: 'c2pa-ai-generated', severity: 'strong',
    message: valid ? `Signed Content Credentials declare this clip AI-generated or AI-composited (signed by ${signer}).` : 'Content Credentials declare this clip AI-generated or AI-composited; the signature did not validate.',
    evidence: [...ai.map((s) => `digitalSourceType=${s.split('/').pop()}`), `tool=${tool}`].join(', '),
  });
  if (sources.some((s) => SCREEN.test(s))) flags.push({ code: 'c2pa-screen-capture', severity: 'warn', message: 'Content Credentials say this is a screen recording, so it may show someone else\'s video rather than an original capture.', evidence: 'digitalSourceType=screenCapture' });
  if (valid && !ai.length) flags.push({ code: 'c2pa-verified', severity: 'info', message: `Content Credentials signature verified (signed by ${signer} with ${tool}). Trust in the signer was not checked offline.`, evidence: `validation_state=${store.validation_state}` });
  return flags;
}

/**
 * Verify the clip's Content Credentials on the device with the official C2PA SDK (WebAssembly, lazy-loaded).
 * Offline by design: no trust-list download, OCSP or remote-manifest fetch. Returns null when the file has no
 * readable manifest or the SDK fails, so callers keep the text-scan flags.
 */
export async function verifyC2pa(file: Blob): Promise<ForensicFlag[] | null> {
  try {
    const [{ createC2pa, Reader, Context }, { default: wasmSrc }] = await Promise.all([
      import('@contentauth/c2pa-web'),
      import('@contentauth/c2pa-web/resources/c2pa.wasm?url'),
    ]);
    const c2pa = await createC2pa({ wasmSrc });
    try {
      const context = new Context({ verify: { verifyTrust: false, verifyTimestampTrust: false, ocspFetch: false, remoteManifestFetch: false } });
      const reader = await Reader.fromBlob(c2pa, file.type || 'video/mp4', file, context);
      if (!reader) return null;
      try { return c2paFlags(await reader.manifestStore()); } finally { await reader.free(); }
    } finally { c2pa.dispose(); }
  } catch { return null; }
}
