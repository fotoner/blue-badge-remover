// src/collector/account-list.ts
// 수집된 파딱 계정 목록 렌더링 + 내보내기
import { getCollectedFadaks, clearCollectedFadaks } from '@features/keyword-collector';
import type { CollectedFadak } from '@shared/types';
import { tp } from '@shared/i18n';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildEntry(fadak: CollectedFadak): HTMLElement {
  const el = document.createElement('div');
  el.className = 'entry';

  const header = document.createElement('div');
  header.className = 'entry-header';
  header.innerHTML = `
    <span class="handle">@${escapeHtml(fadak.handle)}</span>
    <span class="display-name">${escapeHtml(fadak.displayName)}</span>
    <span class="tweet-count">${tp('collectorTweetCount', { count: String(fadak.tweetTexts.length) })}</span>
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

  let expanded = false;
  header.addEventListener('click', () => {
    expanded = !expanded;
    body.style.display = expanded ? 'block' : 'none';
    el.classList.toggle('expanded', expanded);
  });

  el.append(header, body);
  return el;
}

export function renderList(list: CollectedFadak[]): void {
  const container = document.getElementById('list')!;
  container.innerHTML = '';

  if (list.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.append(tp('collectorEmpty'), document.createElement('br'), tp('collectorEmptyHint'));
    container.appendChild(empty);
    return;
  }

  const sorted = [...list].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  for (const fadak of sorted) {
    container.appendChild(buildEntry(fadak));
  }
}

export function renderStats(list: CollectedFadak[]): void {
  const total = list.length;
  const totalTweets = list.reduce((sum, f) => sum + f.tweetTexts.length, 0);
  document.getElementById('stats')!.textContent = tp('collectorStats', {
    accounts: String(total),
    tweets: String(totalTweets),
  });
}

export function bindExportEvents(): void {
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
    btn.textContent = tp('copied');
    setTimeout(() => { btn.textContent = tp('copyText'); }, 2000);
  });

  document.getElementById('clear-btn')!.addEventListener('click', async () => {
    if (!confirm(tp('collectorClearConfirm'))) return;
    await clearCollectedFadaks();
  });
}
