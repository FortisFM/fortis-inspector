// Canonical Fortis FM slug rule. Must match the Hub's src/lib/slug.ts exactly.
// See FORTIS_FM_SLUG_RULE.md for the spec.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

// Make a slug unique by appending -2, -3, ... if a collision exists.
export async function uniqueSlug(
  base: string,
  exists: (s: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base) || "site";
  let candidate = root;
  let n = 2;
  while (await exists(candidate)) {
    candidate = `${root}-${n}`;
    n++;
  }
  return candidate;
}
