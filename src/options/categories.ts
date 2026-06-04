import { saveDisabledFilterCategories, type FilterCategory } from '@features/keyword-filter';

interface RenderCategoriesOptions {
  container: HTMLDivElement;
  categories: FilterCategory[];
  disabledCategories: string[];
  masterEnabled: boolean;
  onChange: (disabledCategories: string[]) => void;
}

export function renderCategories({
  container,
  categories,
  disabledCategories,
  masterEnabled,
  onChange,
}: RenderCategoriesOptions): void {
  container.innerHTML = '';
  if (!masterEnabled) {
    container.innerHTML = '<p class="categories-disabled">내장 필터가 비활성화되어 있습니다</p>';
    return;
  }

  const disabledSet = new Set(disabledCategories);

  for (const category of categories) {
    container.appendChild(createCategoryCard(category, disabledSet.has(category.name), disabledCategories, onChange));
  }
}

function createCategoryCard(
  category: FilterCategory,
  isDisabled: boolean,
  disabledCategories: string[],
  onChange: (disabledCategories: string[]) => void,
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'category-card' + (isDisabled ? ' is-disabled' : '');

  const header = document.createElement('label');
  header.className = 'category-header';

  const info = document.createElement('div');
  info.className = 'category-info';

  const name = document.createElement('span');
  name.className = 'category-name';
  name.textContent = category.name;

  const count = document.createElement('span');
  count.className = 'category-count';
  count.textContent = `${category.keywords.length}`;

  info.appendChild(name);
  info.appendChild(count);

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = !isDisabled;
  toggle.addEventListener('change', () => {
    void handleCategoryToggle(category.name, toggle.checked, disabledCategories, card, onChange);
  });

  header.appendChild(info);
  header.appendChild(toggle);
  card.appendChild(header);
  card.appendChild(createKeywordList(category.keywords));
  return card;
}

function createKeywordList(keywords: string[]): HTMLElement {
  const keywordsEl = document.createElement('div');
  keywordsEl.className = 'category-keywords';
  for (const keyword of keywords) {
    const chip = document.createElement('span');
    chip.className = 'keyword-chip';
    chip.textContent = keyword;
    keywordsEl.appendChild(chip);
  }
  return keywordsEl;
}

async function handleCategoryToggle(
  categoryName: string,
  enabled: boolean,
  disabledCategories: string[],
  card: HTMLElement,
  onChange: (disabledCategories: string[]) => void,
): Promise<void> {
  if (enabled) {
    const idx = disabledCategories.indexOf(categoryName);
    if (idx !== -1) disabledCategories.splice(idx, 1);
    card.classList.remove('is-disabled');
  } else {
    if (!disabledCategories.includes(categoryName)) {
      disabledCategories.push(categoryName);
    }
    card.classList.add('is-disabled');
  }

  const next = [...disabledCategories];
  await saveDisabledFilterCategories(next);
  onChange(next);
}
