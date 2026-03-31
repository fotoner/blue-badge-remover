import { getCollectedFadaks, clearCollectedFadaks, countTokens, topN } from '@features/keyword-collector';
import { getCustomFilterList, parseFilterList, DEFAULT_FILTER_LIST } from '@features/keyword-filter';
import type { CollectedFadak, FilterRule } from '@shared/types';

let hideFiltered = false;
let hideEnglish = false;
let selectedKeyword: string | null = null;
let topLimit = 30;
let cachedList: CollectedFadak[] = [];
let filterRules: FilterRule[] = [];

async function loadFilterRules(): Promise<FilterRule[]> {
  const custom = await getCustomFilterList();
  return parseFilterList(DEFAULT_FILTER_LIST + '\n' + custom);
}

function highlightToken(text: string, token: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const lower = text.toLowerCase();
  const lowerToken = token.toLowerCase();
  let last = 0;
  let idx: number;
  while ((idx = lower.indexOf(lowerToken, last)) !== -1) {
    if (idx > last) frag.appendChild(document.createTextNode(text.slice(last, idx)));
    const mark = document.createElement('mark');
    mark.className = 'kw-highlight';
    mark.textContent = text.slice(idx, idx + token.length);
    frag.appendChild(mark);
    last = idx + token.length;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  return frag;
}

function renderKeywordDetail(keyword: string, list: CollectedFadak[]): void {
  const section = document.getElementById('keywords')!;
  const lowerToken = keyword.toLowerCase();

  const matches: Array<{ handle: string; displayName: string; text: string; isBio: boolean }> = [];
  for (const fadak of list) {
    if (fadak.bio && fadak.bio.toLowerCase().includes(lowerToken)) {
      matches.push({ handle: fadak.handle, displayName: fadak.displayName, text: fadak.bio, isBio: true });
    }
    for (const tweet of fadak.tweetTexts) {
      if (tweet.toLowerCase().includes(lowerToken)) {
        matches.push({ handle: fadak.handle, displayName: fadak.displayName, text: tweet, isBio: false });
      }
    }
  }

  const detail = document.createElement('div');
  detail.className = 'kw-detail';

  const header = document.createElement('div');
  header.className = 'kw-detail-header';

  const title = document.createElement('span');
  title.className = 'kw-detail-title';
  title.textContent = `"${keyword}" 포함 · ${matches.length}건`;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'kw-detail-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => {
    selectedKeyword = null;
    renderKeywords(cachedList);
  });

  header.append(title, closeBtn);
  detail.appendChild(header);

  if (matches.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'kw-empty';
    empty.textContent = '매칭되는 트윗이 없습니다.';
    detail.appendChild(empty);
  } else {
    const listEl = document.createElement('div');
    listEl.className = 'kw-detail-list';
    for (const m of matches) {
      const item = document.createElement('div');
      item.className = 'kw-detail-item';

      const meta = document.createElement('span');
      meta.className = 'kw-detail-meta';
      meta.textContent = `@${m.handle}${m.isBio ? ' · 바이오' : ''}`;

      const textEl = document.createElement('p');
      textEl.className = 'kw-detail-text';
      textEl.appendChild(highlightToken(m.text, keyword));

      item.append(meta, textEl);
      listEl.appendChild(item);
    }
    detail.appendChild(listEl);
  }

  section.appendChild(detail);
}

function isEnglishToken(token: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9]*$/.test(token);
}

function isTokenFiltered(token: string, rules: FilterRule[]): boolean {
  return rules.some((rule) => {
    if (rule.type === 'keyword') return token.includes(rule.value.toLowerCase());
    if (rule.type === 'wildcard') return rule.pattern.test(token);
    return false;
  });
}

async function init(): Promise<void> {
  const [list, rules] = await Promise.all([getCollectedFadaks(), loadFilterRules()]);
  cachedList = list;
  filterRules = rules;
  renderStats(list);
  renderKeywords(list);
  renderList(list);
  bindEvents();

  chrome.storage.onChanged.addListener((changes) => {
    if (changes['collectedFadaks']) {
      const updated = (changes['collectedFadaks'].newValue as CollectedFadak[] | undefined) ?? [];
      cachedList = updated;
      renderStats(updated);
      renderKeywords(updated);
      renderList(updated);
    }
  });
}

function renderStats(list: CollectedFadak[]): void {
  const total = list.length;
  const totalTweets = list.reduce((sum, f) => sum + f.tweetTexts.length, 0);
  document.getElementById('stats')!.textContent =
    `${total}개 계정 · ${totalTweets}개 트윗`;
}

function buildKeywordRow(token: string, count: number, rank: number, max: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'kw-row';

  const rankEl = document.createElement('span');
  rankEl.className = 'kw-rank';
  rankEl.textContent = String(rank);

  const label = document.createElement('span');
  label.className = 'kw-label';
  label.textContent = token;

  const barWrap = document.createElement('div');
  barWrap.className = 'kw-bar-wrap';

  const bar = document.createElement('div');
  bar.className = 'kw-bar';
  bar.style.width = `${Math.round((count / max) * 100)}%`;
  barWrap.appendChild(bar);

  const countEl = document.createElement('span');
  countEl.className = 'kw-count';
  countEl.textContent = String(count);

  row.append(rankEl, label, barWrap, countEl);
  return row;
}

function renderKeywords(list: CollectedFadak[]): void {
  const section = document.getElementById('keywords')!;

  const allTexts: string[] = [];
  for (const fadak of list) {
    if (fadak.bio) allTexts.push(fadak.bio);
    for (const t of fadak.tweetTexts) allTexts.push(t);
  }

  if (allTexts.length === 0) {
    section.style.display = 'none';
    return;
  }

  let counts = countTokens(allTexts);
  if (hideFiltered) {
    for (const token of counts.keys()) {
      if (isTokenFiltered(token, filterRules)) counts.delete(token);
    }
  }
  if (hideEnglish) {
    for (const token of counts.keys()) {
      if (isEnglishToken(token)) counts.delete(token);
    }
  }
  const top = topN(counts, topLimit);
  const max = top[0]?.count ?? 1;

  section.style.display = 'block';
  section.innerHTML = '';

  const headingRow = document.createElement('div');
  headingRow.className = 'keywords-heading-row';

  const heading = document.createElement('h2');
  heading.className = 'keywords-heading';
  heading.textContent = `자주 사용되는 키워드 Top ${topLimit}`;

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'kw-toggle' + (hideFiltered ? ' active' : '');
  toggleBtn.textContent = '필터 미포함만';
  toggleBtn.addEventListener('click', () => {
    hideFiltered = !hideFiltered;
    renderKeywords(cachedList);
  });

  const toggleEnglishBtn = document.createElement('button');
  toggleEnglishBtn.type = 'button';
  toggleEnglishBtn.className = 'kw-toggle' + (hideEnglish ? ' active' : '');
  toggleEnglishBtn.textContent = '영어 키워드 제외';
  toggleEnglishBtn.addEventListener('click', () => {
    hideEnglish = !hideEnglish;
    renderKeywords(cachedList);
  });

  const toggleGroup = document.createElement('div');
  toggleGroup.className = 'kw-toggle-group';
  toggleGroup.append(toggleBtn, toggleEnglishBtn);

  const limitGroup = document.createElement('div');
  limitGroup.className = 'kw-toggle-group';
  for (const n of [30, 50, 100, 200]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kw-toggle' + (topLimit === n ? ' active' : '');
    btn.textContent = String(n);
    btn.addEventListener('click', () => {
      topLimit = n;
      selectedKeyword = null;
      renderKeywords(cachedList);
    });
    limitGroup.appendChild(btn);
  }

  const headingControls = document.createElement('div');
  headingControls.className = 'kw-heading-controls';
  headingControls.append(limitGroup, toggleGroup);

  headingRow.append(heading, headingControls);
  section.appendChild(headingRow);

  if (top.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'kw-empty';
    empty.textContent = '필터 미포함 키워드가 없습니다.';
    section.appendChild(empty);
    return;
  }

  const chart = document.createElement('div');
  chart.className = 'keywords-chart';

  top.forEach(({ token, count }, i) => {
    const row = buildKeywordRow(token, count, i + 1, max);
    if (token === selectedKeyword) row.classList.add('selected');
    row.addEventListener('click', () => {
      selectedKeyword = selectedKeyword === token ? null : token;
      renderKeywords(cachedList);
    });
    chart.appendChild(row);
  });

  section.appendChild(chart);

  if (selectedKeyword !== null && top.some(({ token }) => token === selectedKeyword)) {
    renderKeywordDetail(selectedKeyword, cachedList);
  } else {
    selectedKeyword = null;
  }
}

function renderList(list: CollectedFadak[]): void {
  const container = document.getElementById('list')!;
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = '<p class="empty">수집된 데이터가 없습니다.<br>팝업에서 키워드 수집을 활성화하고 X를 탐색하세요.</p>';
    return;
  }

  const sorted = [...list].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  for (const fadak of sorted) {
    container.appendChild(buildEntry(fadak));
  }
}

function buildEntry(fadak: CollectedFadak): HTMLElement {
  const el = document.createElement('div');
  el.className = 'entry';

  const header = document.createElement('div');
  header.className = 'entry-header';
  header.innerHTML = `
    <span class="handle">@${fadak.handle}</span>
    <span class="display-name">${escapeHtml(fadak.displayName)}</span>
    <span class="tweet-count">${fadak.tweetTexts.length}개 트윗</span>
  `;

  const body = document.createElement('div');
  body.className = 'entry-body';

  if (fadak.bio) {
    const bio = document.createElement('p');
    bio.className = 'bio';
    bio.textContent = fadak.bio;
    body.appendChild(bio);
  }

  if (fadak.tweetTexts.length > 0) {
    const tweets = document.createElement('ul');
    tweets.className = 'tweets';
    for (const text of fadak.tweetTexts) {
      const li = document.createElement('li');
      li.textContent = text;
      tweets.appendChild(li);
    }
    body.appendChild(tweets);
  }

  // Toggle expand/collapse
  let expanded = false;
  header.addEventListener('click', () => {
    expanded = !expanded;
    body.style.display = expanded ? 'block' : 'none';
    el.classList.toggle('expanded', expanded);
  });

  el.append(header, body);
  return el;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function bindEvents(): void {
  document.getElementById('export-json-btn')!.addEventListener('click', async () => {
    const list = await getCollectedFadaks();
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bbr-collected-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('copy-text-btn')!.addEventListener('click', async () => {
    const list = await getCollectedFadaks();
    const lines: string[] = [];
    for (const f of list) {
      lines.push(`@${f.handle} ${f.displayName}`);
      if (f.bio) lines.push(`  bio: ${f.bio}`);
      for (const t of f.tweetTexts) lines.push(`  > ${t}`);
      lines.push('');
    }
    await navigator.clipboard.writeText(lines.join('\n'));
    const btn = document.getElementById('copy-text-btn') as HTMLButtonElement;
    btn.textContent = '복사됨!';
    setTimeout(() => { btn.textContent = '텍스트 복사'; }, 2000);
  });

  document.getElementById('clear-btn')!.addEventListener('click', async () => {
    if (!confirm('수집된 모든 데이터를 삭제하시겠습니까?')) return;
    await clearCollectedFadaks();
  });
}

init();
