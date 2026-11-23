// 키워드 매칭·수집기 토큰화가 함께 쓰는 텍스트 정규화와 라틴 단어 경계 판정 (#112).
// 키워드와 대상 텍스트에 같은 함수를 적용해야 전각·반각, 히라가나·가타카나, 제로폭 문자로
// 표기만 바꾼 글이 서로 다른 글로 취급되는 문제가 사라진다.

// 눈에 보이지 않아 키워드를 피해 가는 데 쓰이는 문자: 소프트 하이픈, 제로폭 공백·논조이너·조이너,
// 워드 조이너, BOM
const INVISIBLE = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;
// U+3041–U+3096(ぁ–ゖ)과 반복 기호 U+309D·U+309E(ゝゞ)는 +0x60이 대응하는 가타카나다
// 한글 호환 자모(ㄱ–ㆎ)는 NFKC를 거치면 조합형 자모가 되고, 자음 뒤 모음이 음절로 합쳐진다("ㅋㅋㅋㅠㅠ" → "ᄏᄏ큐ᅲ").
// 그러면 "ㅋㅋㅋ" 같은 키워드가 모음 자모가 붙은 글을 놓치므로 이 구간만 NFKC에서 뺀다 (#112 컨실 r2)
const OUTSIDE_COMPAT_JAMO = /[^\u3131-\u318E]+/g;
const HIRAGANA = /[\u3041-\u3096\u309D\u309E]/g;
const HIRAGANA_TO_KATAKANA_OFFSET = 0x60;

const LATIN_LETTER = /\p{Script=Latin}/u;
const ANY_LETTER = /\p{L}/u;
// 단어를 이루는 글자는 라틴 문자뿐이다. 한글·가나·한자는 조사가 라틴 단어에 바로 붙어 쓰이므로
// ("ETH를", "BTCを") 단어 안으로 보면 원래 잡던 글을 놓친다. 숫자("10ETH", "ETH2.0")와 이모지에 붙는
// 변형 선택자·에워싸기 기호("❤️BTC", "1️⃣BTC")도 단어 안으로 보면 트윗에서 흔한 표기를 놓친다.
const WORD_END = /\p{Script=Latin}$/u;
const WORD_START = /^\p{Script=Latin}/u;
// 앞 글자에 붙는 결합 기호(밑줄 U+0332 등). 경계를 볼 때는 건너뛰고 붙은 바탕 글자를 본다.
// 이모지 변형 선택자는 이모지에 붙으므로 건너뛰지 않고 경계로 둔다 (#112 컨실 r2)
const COMBINING_MARK = /^[\p{Mn}\p{Mc}]$/u;
const VARIATION_SELECTOR = /^[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]$/u;

function isAttachedMark(char: string): boolean {
  return COMBINING_MARK.test(char) && !VARIATION_SELECTOR.test(char);
}

/** position 바로 앞 글자의 시작 위치. 서로게이트 쌍을 한 글자로 본다 */
function previousCharStart(text: string, position: number): number {
  const start = position - 1;
  const low = text.charCodeAt(start);
  if (start > 0 && low >= 0xdc00 && low <= 0xdfff) {
    const high = text.charCodeAt(start - 1);
    if (high >= 0xd800 && high <= 0xdbff) return start - 1;
  }
  return start;
}

/** index 바로 앞의 바탕 글자(붙은 결합 기호는 건너뜀)가 라틴 문자인지. 이웃 글자만 본다 */
function latinBefore(text: string, index: number): boolean {
  let position = index;
  while (position > 0) {
    const start = previousCharStart(text, position);
    const char = text.slice(start, position);
    if (!isAttachedMark(char)) return WORD_END.test(char);
    position = start;
  }
  return false;
}

/** end부터의 바탕 글자(일치 끝에 붙은 결합 기호는 건너뜀)가 라틴 문자인지. 이웃 글자만 본다 */
function latinAfter(text: string, end: number): boolean {
  let position = end;
  while (position < text.length) {
    const char = String.fromCodePoint(text.codePointAt(position) ?? 0);
    if (!isAttachedMark(char)) return WORD_START.test(char);
    position += char.length;
  }
  return false;
}

/**
 * 제로폭 문자 제거 → NFKC → 소문자. 히라가나는 그대로 둔다(토큰 분리에 필요하다).
 * 제로폭 문자를 먼저 지워야 그 사이에 끼어 있던 반각 반탁음·결합 기호가 앞 글자와 NFKC로 합쳐진다.
 */
/** 제로폭 문자 등 눈에 보이지 않는 문자만 지운다. 규칙 문법(별표 위치)을 볼 때도 쓴다 (#112) */
export function removeInvisible(text: string): string {
  return text.replace(INVISIBLE, '');
}

export function normalizeText(text: string): string {
  return removeInvisible(text)
    .replace(OUTSIDE_COMPAT_JAMO, (segment) => segment.normalize('NFKC'))
    .toLowerCase();
}

function foldHiraganaToKatakana(text: string): string {
  return text.replace(HIRAGANA, (char) =>
    String.fromCharCode(char.charCodeAt(0) + HIRAGANA_TO_KATAKANA_OFFSET),
  );
}

/** 매칭용 정규화: normalizeText 뒤에 히라가나를 가타카나로 접는다. 키워드와 대상 텍스트에 모두 쓴다. */
export function normalizeForMatch(text: string): string {
  return foldHiraganaToKatakana(normalizeText(text));
}

/** 정규화된 키워드가 라틴 문자로만 되어 있는지(라틴 글자가 있고 다른 문자 체계의 글자가 없다). */
export function isLatinKeyword(keyword: string): boolean {
  let hasLatin = false;
  for (const char of keyword) {
    if (LATIN_LETTER.test(char)) hasLatin = true;
    else if (ANY_LETTER.test(char)) return false;
  }
  return hasLatin;
}

/**
 * 정규화된 text 안에 정규화된 keyword가 있는지 본다.
 * wholeWord면 일치 앞뒤가 라틴 문자가 아닐 때만 인정한다. `\b`는 비ASCII 라틴 문자(café)를
 * 단어로 보지 못하고 숫자를 단어로 보므로 글자 종류로 직접 판정한다. 키워드 자체가
 * 기호나 숫자로 시작·끝나면("$btc") 그쪽은 경계를 따지지 않는다.
 */
export function includesNormalized(text: string, keyword: string, wholeWord: boolean): boolean {
  if (!keyword) return false;
  let index = text.indexOf(keyword);
  if (!wholeWord) return index !== -1;
  // 대부분의 트윗은 키워드를 포함하지 않는다. 정규식은 일치 후보가 있을 때만 쓴다
  if (index === -1) return false;

  // 키워드 끝 글자에 결합 기호가 붙어 있어도(정규화한 "aİ" → "ai\u0307") 바탕 글자로 경계 여부를 정한다
  const checkBefore = latinAfter(keyword, 0);
  const checkAfter = latinBefore(keyword, keyword.length);
  for (;;) {
    const end = index + keyword.length;
    const beforeOk = !checkBefore || !latinBefore(text, index);
    const afterOk = !checkAfter || !latinAfter(text, end);
    if (beforeOk && afterOk) return true;
    index = text.indexOf(keyword, index + 1);
    if (index === -1) return false;
  }
}
