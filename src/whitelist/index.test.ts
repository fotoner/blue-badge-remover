// src/whitelist/index.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeHandle, renderWhitelistItems } from './index';

describe('normalizeHandle', () => {
  it('유효한 핸들에서 @ prefix를 붙여 반환한다', () => {
    expect(normalizeHandle('testuser')).toBe('@testuser');
  });

  it('입력에 @ 가 이미 있어도 정상 처리한다', () => {
    expect(normalizeHandle('@testuser')).toBe('@testuser');
  });

  it('앞뒤 공백을 제거한다', () => {
    expect(normalizeHandle('  testuser  ')).toBe('@testuser');
  });

  it('빈 문자열이면 null을 반환한다', () => {
    expect(normalizeHandle('')).toBeNull();
    expect(normalizeHandle('  ')).toBeNull();
    expect(normalizeHandle('@')).toBeNull();
  });

  it('16자 이상이면 null을 반환한다', () => {
    expect(normalizeHandle('a'.repeat(16))).toBeNull();
  });

  it('허용되지 않는 문자가 있으면 null을 반환한다', () => {
    expect(normalizeHandle('user name')).toBeNull();
    expect(normalizeHandle('user!name')).toBeNull();
    expect(normalizeHandle('user.name')).toBeNull();
  });

  it('15자 핸들은 허용한다', () => {
    expect(normalizeHandle('a'.repeat(15))).toBe(`@${'a'.repeat(15)}`);
  });
});

describe('renderWhitelistItems', () => {
  let container: HTMLElement;
  let emptyEl: HTMLElement;
  let headingEl: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    emptyEl = document.createElement('p');
    headingEl = document.createElement('h2');
  });

  it('목록이 비어있으면 emptyEl을 표시하고 container는 비운다', () => {
    renderWhitelistItems(container, emptyEl, headingEl, [], 'ko', async () => {});
    expect(emptyEl.style.display).toBe('block');
    expect(container.children.length).toBe(0);
    expect(headingEl.textContent).toBe('등록된 계정 (0)');
  });

  it('목록 항목만큼 .whitelist-item 엘리먼트를 렌더링한다', () => {
    renderWhitelistItems(
      container, emptyEl, headingEl,
      ['@alice', '@bob'], 'ko',
      async () => {},
    );
    expect(emptyEl.style.display).toBe('none');
    expect(container.querySelectorAll('.whitelist-item').length).toBe(2);
    expect(headingEl.textContent).toBe('등록된 계정 (2)');
  });

  it('각 항목의 span에 핸들 텍스트가 표시된다', () => {
    renderWhitelistItems(
      container, emptyEl, headingEl,
      ['@alice'], 'ko',
      async () => {},
    );
    const span = container.querySelector('.whitelist-item span');
    expect(span?.textContent).toBe('@alice');
  });
});
