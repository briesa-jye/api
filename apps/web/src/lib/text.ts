const ACRONYMS = /\b(cdd|aml|ctf|pep|peps|smr|ttr|whs|pcbu|kyc|ml|tf)\b/gi;

/** snake_case or kebab-case to plain words, keeping regulatory acronyms in capitals (cdd to CDD). */
export const humanize = (s: string) => s.replace(/[_-]/g, " ").replace(ACRONYMS, (m) => m.toUpperCase());

/** First letter capitalised, the rest left alone. */
export const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
