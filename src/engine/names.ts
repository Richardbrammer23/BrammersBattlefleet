export const NAME_MIN = 2;
export const NAME_MAX = 15;

const BLOCKLIST = ['fuck', 'shit', 'cunt', 'nigg', 'fag', 'bitch', 'rape', 'nazi', 'hitler', 'whore', 'slut', 'retard', 'dick', 'cock', 'pussy', 'wank', 'twat'];

export type NameError = 'too_short' | 'too_long' | 'invalid_characters' | 'not_allowed';

export function normaliseName(raw: unknown): string {
  return typeof raw === 'string' ? raw.normalize('NFKC').replace(/\s+/g, ' ').trim() : '';
}

export function nameError(raw: unknown): NameError | null {
  const name = normaliseName(raw);
  const len = [...name].length;
  if (len < NAME_MIN) return 'too_short';
  if (len > NAME_MAX) return 'too_long';
  if (!/^[\p{L}\p{N} ._'-]+$/u.test(name)) return 'invalid_characters';
  const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b' };
  const squashed = name
    .toLowerCase()
    .replace(/[0134578]/g, (d) => LEET[d])
    .replace(/[^a-z]/g, '');
  if (BLOCKLIST.some((w) => squashed.includes(w))) return 'not_allowed';
  return null;
}
