export interface FilterCategory {
  name: string;
  keywords: string[];
}

export function parseCategories(text: string): FilterCategory[] {
  if (!text.trim()) return [];

  const lines = text.split('\n');
  const categories: FilterCategory[] = [];
  let metadataDone = false;
  let current: FilterCategory | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines (they may separate metadata from categories)
    if (trimmed === '') {
      if (!metadataDone && current === null) {
        metadataDone = true;
      }
      continue;
    }

    // Comment line starting with !
    if (trimmed.startsWith('!')) {
      if (!metadataDone) continue; // skip metadata header comments
      // New category header
      const name = trimmed.slice(1).trim();
      if (name) {
        current = { name, keywords: [] };
        categories.push(current);
      }
      continue;
    }

    // Keyword line — if we haven't finished metadata yet, this means
    // there was no empty line separator, so mark metadata as done
    if (!metadataDone) metadataDone = true;

    if (current) {
      current.keywords.push(trimmed);
    }
  }

  return categories;
}

export function buildFilterTextFromCategories(
  categories: FilterCategory[],
  disabledCategories: string[],
): string {
  const disabled = new Set(disabledCategories);
  return categories
    .filter((c) => !disabled.has(c.name))
    .map((c) => c.keywords.join('\n'))
    .join('\n');
}
