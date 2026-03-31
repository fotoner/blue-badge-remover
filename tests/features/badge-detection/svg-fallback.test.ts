import { describe, it, expect } from 'vitest';
import { detectBadgeSvg } from '@features/badge-detection/svg-fallback';

describe('detectBadgeSvg', () => {
  it('should detect blue badge SVG in tweet element', () => {
    const el = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('data-testid', 'icon-verified');
    el.appendChild(svg);
    expect(detectBadgeSvg(el)).toBe(true);
  });

  it('should return false when no badge SVG', () => {
    const el = document.createElement('div');
    el.innerHTML = '<span>no badge</span>';
    expect(detectBadgeSvg(el)).toBe(false);
  });

  it('should return false for gold badge (business)', () => {
    const el = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('data-testid', 'icon-verified');
    svg.setAttribute('fill', '#E8B829');
    el.appendChild(svg);
    expect(detectBadgeSvg(el)).toBe(false);
  });

  it('should return false for grey badge (government)', () => {
    const el = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('data-testid', 'icon-verified');
    svg.setAttribute('fill', '#829AAB');
    el.appendChild(svg);
    expect(detectBadgeSvg(el)).toBe(false);
  });

  it('should return false for gold badge with alternate color', () => {
    const el = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('data-testid', 'icon-verified');
    svg.setAttribute('fill', '#D4A72C');
    el.appendChild(svg);
    expect(detectBadgeSvg(el)).toBe(false);
  });

  it('should return false when child path has gold fill', () => {
    const el = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('data-testid', 'icon-verified');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', '#E8B829');
    svg.appendChild(path);
    el.appendChild(svg);
    expect(detectBadgeSvg(el)).toBe(false);
  });

  it('should return false for gold badge with linearGradient (actual X DOM)', () => {
    const el = document.createElement('div');
    el.innerHTML = `<svg viewBox="0 0 22 22" data-testid="icon-verified">
      <g><linearGradient id="a"><stop offset="0" stop-color="#f4e72a"></stop><stop offset=".539" stop-color="#cd8105"></stop></linearGradient>
      <path fill="url(#a)" d="M13 3L11 1"></path></g>
    </svg>`;
    expect(detectBadgeSvg(el)).toBe(false);
  });
});
