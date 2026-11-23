// @vitest-environment node
// CNT-3(.claude/rules/content.md)을 기계로 강제한다: X 화면 문구를 정규식·문자열 비교에 쓰는 판정은
// 일본어 등 다른 화면 언어에서 깨진다(#111). 판정은 data-testid·href·구조·API 데이터로 한다.
//
// 놓치는 것: 객체 값·변수에 담았다가 나중에 비교하는 문구(배열 포함), 문구 일부를 조각내 이어 붙이는 코드.
// 이 시험은 비교 자리에 문구가 곧바로 나오는 흔한 경우만 막는 그물이다. 리뷰에서도 본다.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// 검사 범위. src/shared/i18n은 화면 문구 사전이라 이 폴더들 밖에 있다
const SCAN_DIRS = ['src/content', 'src/features', 'src/injected'];

interface BannedPhrase {
  phrase: string;
  /** 영어는 단어 경계로 찾아 'QuoteCard' 같은 내부 식별자를 잡지 않는다 */
  pattern: RegExp;
}

function substring(phrase: string): BannedPhrase {
  return { phrase, pattern: new RegExp(phrase) };
}

function word(phrase: string): BannedPhrase {
  return { phrase, pattern: new RegExp(`\\b${phrase}\\b`) };
}

// X 화면 문구. ko: 팔로우·팔로잉·재게시·리포스트·리트윗·인용·인증된 계정·비공개 계정
const BANNED_PHRASES: BannedPhrase[] = [
  substring('팔로우'), substring('팔로잉'), substring('재게시'), substring('리포스트'), substring('리트윗'),
  substring('인용'), substring('인증된 계정'), substring('비공개 계정'),
  word('Follow'), word('Following'), word('Retweeted'), word('Reposted'), word('reposted'), word('Quote'),
  substring('フォロー'), substring('リポスト'), substring('引用'), substring('認証済み'), substring('非公開'),
];

// 비교·검색 자리로 보는 메서드. 문구가 이 호출의 인자로 곧바로 나오면 화면 문구로 판정하는 것이다
const MATCHING_METHODS = new Set([
  'includes', 'startsWith', 'endsWith', 'indexOf', 'lastIndexOf', 'match', 'matchAll', 'search',
  'replace', 'replaceAll', 'split', 'localeCompare',
]);
// 배열 리터럴이 수신자일 때 비교 자리로 보는 메서드. 배열 안 문구와 다른 값을 견주거나 찾는다
const ARRAY_COMPARISON_METHODS = new Set([
  'includes', 'indexOf', 'lastIndexOf', 'some', 'every', 'find', 'findIndex', 'filter',
]);
const COMPARISON_OPERATORS = new Set([
  ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);

interface UiTextUse {
  line: number;
  phrase: string;
  text: string;
}

function isRegExpConstructor(call: ts.Node): boolean {
  return (ts.isNewExpression(call) || ts.isCallExpression(call))
    && ts.isIdentifier(call.expression) && call.expression.text === 'RegExp';
}

/** 배열 리터럴이 비교 메서드 호출의 수신자인지 본다. `(['a'] as const).includes(x)`처럼 씌운 껍질은 벗겨서 본다 */
function isComparisonReceiver(array: ts.Node): boolean {
  let node = array;
  while (ts.isParenthesizedExpression(node.parent) || ts.isAsExpression(node.parent) || ts.isSatisfiesExpression(node.parent)) {
    node = node.parent;
  }
  const access = node.parent;
  return ts.isPropertyAccessExpression(access) && access.expression === node
    && ARRAY_COMPARISON_METHODS.has(access.name.text)
    && ts.isCallExpression(access.parent) && access.parent.expression === access;
}

function isMatchingPosition(node: ts.Node): boolean {
  const parent = node.parent;
  if (ts.isBinaryExpression(parent)) return COMPARISON_OPERATORS.has(parent.operatorToken.kind);
  if (ts.isCaseClause(parent)) return parent.expression === node;
  if (ts.isArrayLiteralExpression(parent)) return isComparisonReceiver(parent);
  if (!ts.isCallExpression(parent) && !ts.isNewExpression(parent)) return false;
  if (isRegExpConstructor(parent)) return true;
  return ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)
    && MATCHING_METHODS.has(parent.expression.name.text);
}

function bannedPhrasesIn(text: string, caseInsensitive: boolean): string[] {
  return BANNED_PHRASES
    .filter(({ pattern }) => (caseInsensitive ? new RegExp(pattern.source, 'i') : pattern).test(text))
    .map(({ phrase }) => phrase);
}

/** 소스에서 화면 문구를 정규식·문자열 비교에 쓴 자리를 찾는다. 주석은 보지 않는다(AST) */
function findUiTextUses(fileName: string, source: string): UiTextUse[] {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const uses: UiTextUse[] = [];
  const report = (node: ts.Node, text: string, caseInsensitive: boolean): void => {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    for (const phrase of bannedPhrasesIn(text, caseInsensitive)) uses.push({ line, phrase, text });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isRegularExpressionLiteral(node)) {
      // 정규식 리터럴은 항상 매칭 자리다. i 플래그가 있으면 대소문자를 가리지 않는다
      report(node, node.text, node.text.slice(node.text.lastIndexOf('/') + 1).includes('i'));
    } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && isMatchingPosition(node)) {
      report(node, node.text, false);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return uses;
}

// 허용 목록: 구조 신호로 바꿀 수 없어 문구를 남긴 곳. 파일·문구·허용 횟수·이유를 적는다. 줄이는 방향으로만 고친다.
// 검출 수가 허용 횟수와 다르면 아래 시험이 실패시킨다. 같은 파일에 같은 문구 비교를 새로 넣어도 걸린다.
interface Allowed {
  file: string;
  phrase: string;
  /** 그 파일에서 그 문구가 비교 자리에 나오는 횟수(findUiTextUses가 찾는 수) */
  count: number;
  reason: string;
}
const ALLOWED_UI_TEXT: Allowed[] = [
  {
    file: 'src/content/tweet-processing.ts',
    phrase: '인용',
    count: 1,
    reason: 'quoteLabelKind(인용 라벨 판정): findQuoteBlock 폴백이 인용 카드 구조(User-Name을 품은 div[role="link"])가 없는 DOM 변형에서 라벨 다음 형제를 찾을 때, 그리고 User-Name이 하나인 트윗에서 조상만 거슬러 라벨 다음 블록 안인지 확인할 때 쓴다. 구조 신호가 없다 (#111)',
  },
  {
    file: 'src/content/tweet-processing.ts',
    phrase: 'Quote',
    count: 1,
    reason: 'quoteLabelKind(영어 라벨): 위와 같다 (#111)',
  },
  {
    file: 'src/content/tweet-processing.ts',
    phrase: '비공개 계정',
    count: 1,
    reason: 'extractDisplayName: 표시 이름 뒤에 붙는 접미사 문구 제거. 실측 DOM에 접미사 텍스트가 있는지 확인하지 못했다. 이 이름은 로그 라벨만이 아니라 tweet-orchestrator가 프로필 캐시가 없을 때 쓰는 profile.displayName(키워드 필터·수집 버퍼 입력)과 인용 숨김 문구의 인용자 라벨(quotedBy)에도 쓰인다 (#111)',
  },
  {
    file: 'src/content/tweet-processing.ts',
    phrase: '인증된 계정',
    count: 1,
    reason: '위와 같다 (#111)',
  },
  {
    file: 'src/injected/data-extractors.ts',
    phrase: 'Following',
    count: 1,
    reason: 'isFollowingEndpoint: X GraphQL 오퍼레이션 이름(API URL의 마지막 경로)이다. 화면 문구가 아니라 화면 언어와 무관하다 (#111)',
  },
];

function listSourceFiles(dir: string): string[] {
  const root = resolve(process.cwd(), dir);
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.d.ts'))
    .map((file) => relative(process.cwd(), join(root, file)).split('\\').join('/'));
}

interface FoundUse {
  file: string;
  use: UiTextUse;
}

/** 허용 목록에 없는 검출(violations)과, 허용 횟수와 검출 수가 다른 항목(countMismatches)을 가려낸다 */
function checkAllowList(found: FoundUse[], allowed: Allowed[]): { violations: string[]; countMismatches: string[] } {
  const violations = found
    .filter(({ file, use }) => !allowed.some((entry) => entry.file === file && entry.phrase === use.phrase))
    .map(({ file, use }) => `${file}:${use.line} ${use.phrase} ← ${use.text}`);
  const countMismatches = allowed.flatMap((entry) => {
    const actual = found.filter(({ file, use }) => file === entry.file && use.phrase === entry.phrase).length;
    return actual === entry.count ? [] : [`${entry.file} ${entry.phrase}: 허용 ${entry.count}회, 검출 ${actual}회`];
  });
  return { violations, countMismatches };
}

function scanAll(): FoundUse[] {
  return SCAN_DIRS.flatMap(listSourceFiles).flatMap((file) =>
    findUiTextUses(file, readFileSync(resolve(process.cwd(), file), 'utf8')).map((use) => ({ file, use })));
}

describe('findUiTextUses (검사기 자체 시험)', () => {
  it.each([
    ['한국어 정규식', 'const a = /팔로잉\\s*@(\\S+)/.test(label);', '팔로잉'],
    ['영어 정규식(i 플래그, 소문자)', 'const a = /following/i.test(label);', 'Following'],
    ['문자열 비교', "if (text === '인용') return;", '인용'],
    ['부정 비교', "if (text !== 'フォロー') return;", 'フォロー'],
    ['includes 인자', "const a = label.includes('Follow');", 'Follow'],
    ['startsWith 인자', "const a = label.startsWith('リポスト');", 'リポスト'],
    ['RegExp 생성자', "const a = new RegExp('Retweeted');", 'Retweeted'],
    ['switch case', "switch (t) { case 'Quote': break; }", 'Quote'],
    ['문구 목록 includes', "const a = ['재게시함', 'x'].includes(label);", '재게시'],
    ['문구 목록 some', "const a = ['Quote'].some((phrase) => label.includes(phrase));", 'Quote'],
    ['문구 목록 indexOf', "const a = ['リポスト'].indexOf(label);", 'リポスト'],
    ['as const를 씌운 문구 목록 includes', "const a = (['팔로잉'] as const).includes(label);", '팔로잉'],
  ])('잡는다: %s', (_name, source, phrase) => {
    expect(findUiTextUses('probe.ts', source).map((use) => use.phrase)).toContain(phrase);
  });

  it.each([
    ['주석', '// 팔로우 Follow 재게시함\n/* 引用 */\nconst a = 1;'],
    ['로그 메시지', "logger.info('Follow handles saved', { count: 1 });"],
    ['디버그 라벨', "parts.push('FOLLOW'); parts.push('QUOTE');"],
    ['내부 이유 토큰', "if (reason === 'retweet' || reason === 'self-quote-followed') return;"],
    ['경로 비교', "const a = pathname.includes('/following');"],
    ['정규식 없는 식별자', "if (kind === 'QuoteCard') return;"],
    // 배열 리터럴은 includes·some 같은 비교 메서드의 수신자일 때만 비교 자리다. 단순 목록·인자는 판정이 아니다
    ['변수에 담은 문구 목록', "const tabs = ['팔로잉', '추천'];"],
    ['함수 인자로 넘기는 목록', "render(['Follow', 'x']);"],
    ['비교가 아닌 배열 메서드', "const a = ['재게시함'].map((label) => label.length);"],
    ['비교 메서드의 인자로 들어간 배열', "const a = others.includes(['리포스트']);"],
  ])('잡지 않는다: %s', (_name, source) => {
    expect(findUiTextUses('probe.ts', source)).toEqual([]);
  });
});

describe('checkAllowList (허용 횟수 검사기 자체 시험)', () => {
  const allowed = [{ file: 'src/a.ts', phrase: '인용', count: 1, reason: '폴백' }];
  const found = (line: number, file = 'src/a.ts', phrase = '인용') => ({ file, use: { line, phrase, text: phrase } });

  it('허용 횟수와 검출 수가 같으면 통과한다', () => {
    expect(checkAllowList([found(3)], allowed)).toEqual({ violations: [], countMismatches: [] });
  });

  it('같은 파일에 같은 문구 비교가 하나 더 생기면 허용 횟수를 넘어 걸린다', () => {
    const result = checkAllowList([found(3), found(40)], allowed);
    expect(result.countMismatches).toHaveLength(1);
    expect(result.countMismatches[0]).toContain('허용 1회');
    expect(result.countMismatches[0]).toContain('검출 2회');
  });

  it('허용 항목이 더 이상 쓰이지 않으면 걸린다', () => {
    const result = checkAllowList([], allowed);
    expect(result.countMismatches).toHaveLength(1);
    expect(result.countMismatches[0]).toContain('검출 0회');
  });

  it('허용 목록에 없는 파일·문구는 위반이다', () => {
    const result = checkAllowList([found(3), found(5, 'src/b.ts'), found(7, 'src/a.ts', 'Quote')], allowed);
    expect(result.violations).toHaveLength(2);
    expect(result.countMismatches).toEqual([]);
  });
});

describe('CNT-3: 화면 문구로 판정하지 않는다', () => {
  const { violations, countMismatches } = checkAllowList(scanAll(), ALLOWED_UI_TEXT);

  it('허용 목록 밖에서 화면 문구를 정규식·문자열 비교에 쓰지 않는다', () => {
    expect(violations).toEqual([]);
  });

  it('허용 목록의 항목마다 검출 수가 허용 횟수와 같다 (쓰이지 않으면 목록에서 지우고, 늘었으면 구조 신호로 바꾼다)', () => {
    expect(countMismatches).toEqual([]);
  });

  it('허용 목록의 모든 항목에 이유가 있다', () => {
    expect(ALLOWED_UI_TEXT.filter((allowed) => allowed.reason.trim() === '')).toEqual([]);
  });
});
