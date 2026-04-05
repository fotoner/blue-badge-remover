import { describe, it, expect } from 'vitest';
import { detectBadgeSvg } from '@features/badge-detection/svg-fallback';

/** 현행 detectBadgeSvg 로직 (2026-04 기준):
 *  linearGradient 없음 + path 1개 + fill 속성 없음 = 파딱(true)
 *  그 외 전부 false.
 */

function createBlueBadge(): string {
  return `<svg viewBox="0 0 22 22" data-testid="icon-verified">
    <g><path d="M20.396 11c-.018-.137-.065-.27-.148-.385Z"></path></g>
  </svg>`;
}

function createGoldBadge(): string {
  return `<svg viewBox="0 0 22 22" data-testid="icon-verified">
    <g>
      <linearGradient id="grad1"><stop offset="0" stop-color="#f4e72a"></stop><stop offset=".539" stop-color="#cd8105"></stop></linearGradient>
      <linearGradient id="grad2"><stop offset="0" stop-color="#f9e87f"></stop><stop offset=".539" stop-color="#e2b719"></stop></linearGradient>
      <path fill="url(#grad1)" d="M20.396 11Z"></path>
      <path fill="url(#grad2)" d="M11 1Z"></path>
      <path fill="#d18800" d="M13 3Z"></path>
    </g>
  </svg>`;
}

function createGreyBadge(): string {
  return `<svg viewBox="0 0 22 22" data-testid="icon-verified">
    <g>
      <linearGradient id="g1"><stop offset="0" stop-color="#829aab"></stop></linearGradient>
      <linearGradient id="g2"><stop offset="0" stop-color="#829aab"></stop></linearGradient>
      <path fill="url(#g1)" d="M20.396 11Z"></path>
      <path fill="url(#g2)" d="M11 1Z"></path>
      <path fill="#829aab" d="M13 3Z"></path>
    </g>
  </svg>`;
}

describe('detectBadgeSvg', () => {
  it('파딱: path 1개 + fill 없음 → true', () => {
    const el = document.createElement('div');
    el.innerHTML = createBlueBadge();
    expect(detectBadgeSvg(el)).toBe(true);
  });

  it('금딱: linearGradient + path 3개 + fill → false', () => {
    const el = document.createElement('div');
    el.innerHTML = createGoldBadge();
    expect(detectBadgeSvg(el)).toBe(false);
  });

  it('회딱: linearGradient + path 3개 → false', () => {
    const el = document.createElement('div');
    el.innerHTML = createGreyBadge();
    expect(detectBadgeSvg(el)).toBe(false);
  });

  it('뱃지 없음 → false', () => {
    const el = document.createElement('div');
    el.innerHTML = '<span>no badge</span>';
    expect(detectBadgeSvg(el)).toBe(false);
  });

  it('부분 렌더링: badge 있으나 path 0개 → false', () => {
    const el = document.createElement('div');
    el.innerHTML = '<svg viewBox="0 0 22 22" data-testid="icon-verified"><g></g></svg>';
    expect(detectBadgeSvg(el)).toBe(false);
  });

  it('path에 fill 속성 있으면 → false (금딱/회딱 패턴)', () => {
    const el = document.createElement('div');
    el.innerHTML = `<svg viewBox="0 0 22 22" data-testid="icon-verified">
      <g><path fill="#E8B829" d="M20 11Z"></path></g>
    </svg>`;
    expect(detectBadgeSvg(el)).toBe(false);
  });

  it('path 2개 이상이면 → false', () => {
    const el = document.createElement('div');
    el.innerHTML = `<svg viewBox="0 0 22 22" data-testid="icon-verified">
      <g><path d="M20 11Z"></path><path d="M11 1Z"></path></g>
    </svg>`;
    expect(detectBadgeSvg(el)).toBe(false);
  });
});
