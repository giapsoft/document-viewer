export const FRIENDLY_DOC_ID_PATTERN = /^[A-Za-z0-9]+$/;
export const FRIENDLY_DOC_ID_MIN_LENGTH = 2;
export const FRIENDLY_DOC_ID_MAX_LENGTH = 64;

const RESERVED_DOC_IDS = new Set(['index', 'help']);

export function isFriendlyDocId(id: string): boolean {
  return FRIENDLY_DOC_ID_PATTERN.test(id);
}

export function normalizeFriendlyDocId(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, '');
}

export function validateFriendlyDocId(id: string): { ok: true } | { ok: false; error: string } {
  if (!id) {
    return { ok: false, error: 'Enter a link ID (letters and numbers only).' };
  }
  if (id.length < FRIENDLY_DOC_ID_MIN_LENGTH) {
    return {
      ok: false,
      error: `Link ID must be at least ${FRIENDLY_DOC_ID_MIN_LENGTH} characters.`,
    };
  }
  if (id.length > FRIENDLY_DOC_ID_MAX_LENGTH) {
    return {
      ok: false,
      error: `Link ID must be at most ${FRIENDLY_DOC_ID_MAX_LENGTH} characters.`,
    };
  }
  if (!FRIENDLY_DOC_ID_PATTERN.test(id)) {
    return { ok: false, error: 'Link ID may only contain letters and numbers (A–Z, a–z, 0–9).' };
  }
  if (RESERVED_DOC_IDS.has(id.toLowerCase())) {
    return { ok: false, error: 'This link ID is reserved. Choose a different one.' };
  }
  return { ok: true };
}

export function resolveNewDocumentId(customId: string | undefined): string {
  const trimmed = customId?.trim();
  if (!trimmed) {
    throw new Error('Link ID is required when publishing to remote storage.');
  }
  const normalized = normalizeFriendlyDocId(trimmed);
  const validation = validateFriendlyDocId(normalized);
  if (!validation.ok) throw new Error(validation.error);
  return normalized;
}

export function isDuplicateDocumentIdError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('duplicate') || lower.includes('unique') || lower.includes('23505');
}
