// src/shared/i18n.ts

export type Language = 'ko' | 'en' | 'ja';

export const DEFAULT_LANGUAGE: Language = 'ko';

type TranslationKeys =
  | 'extName'
  | 'extDescription'
  | 'filtering'
  | 'filterScope'
  | 'filterScopeDesc'
  | 'homeTimeline'
  | 'tweetDetailReplies'
  | 'searchResults'
  | 'hideMode'
  | 'removeCompletely'
  | 'removeCompletelyDesc'
  | 'collapse'
  | 'collapseDesc'
  | 'retweets'
  | 'retweetsDesc'
  | 'hideRetweetsLabel'
  | 'quoteTweets'
  | 'quoteTweetsDesc'
  | 'quoteOff'
  | 'quoteOnly'
  | 'quoteEntire'
  | 'followSync'
  | 'followSyncDesc'
  | 'currentAccount'
  | 'accountNotDetected'
  | 'lastSync'
  | 'collectedFollows'
  | 'openFollowingPage'
  | 'followingPageHint'
  | 'clearFollowCache'
  | 'clearCacheDone'
  | 'scrollOnFollowingPage'
  | 'whitelist'
  | 'whitelistDesc'
  | 'whitelistPlaceholder'
  | 'add'
  | 'developer'
  | 'debugMode'
  | 'debugModeHint'
  | 'language'
  | 'hiddenTweetClick'
  | 'hiddenTweetFadak'
  | 'hiddenTweetRetweet'
  | 'hiddenTweetQuoteEntire'
  | 'hiddenQuoteTweet'
  | 'fadakProfileBanner'
  | 'feedback'
  | 'feedbackDesc'
  | 'manageWhitelist'
  | 'whitelistCount'
  | 'whitelistEmpty'
  | 'keywordFilterBeta'
  | 'keywordFilterBetaDesc'
  | 'advancedFilterSettings'
  | 'bookmarks'
  | 'addToWhitelist'
  | 'addedToWhitelist'
  | 'onboardingBanner'
  | 'onboardingCta'
  | 'onboardingDismiss'
  | 'followSyncBanner'
  | 'onboardingSiteBanner'
  | 'onboardingSiteCta';

type Translations = Record<TranslationKeys, string>;

const ko: Translations = {
  extName: 'Blue Badge Remover',
  extDescription: 'X(트위터)에서 수익성 파란 뱃지 계정을 숨깁니다',
  filtering: '필터링',
  filterScope: '필터링 범위',
  filterScopeDesc: '파딱 트윗을 숨길 영역을 선택합니다',
  homeTimeline: '홈 타임라인',
  tweetDetailReplies: '트윗 상세 / 답글',
  searchResults: '검색 결과',
  hideMode: '숨김 방식',
  removeCompletely: '완전 제거',
  removeCompletelyDesc: '트윗을 타임라인에서 완전히 제거합니다',
  collapse: '접어서 표시',
  collapseDesc: '클릭하면 펼쳐볼 수 있도록 접어둡니다',
  retweets: '리트윗',
  retweetsDesc: '팔로우가 파딱 트윗을 리트윗한 경우',
  hideRetweetsLabel: '파딱 리트윗 숨기기',
  quoteTweets: '인용 트윗',
  quoteTweetsDesc: '파딱 트윗을 인용한 경우의 처리 방식',
  quoteOff: '필터링하지 않음',
  quoteOnly: '인용 부분만 숨기기',
  quoteEntire: '트윗 전체 숨기기',
  followSync: '수동 팔로우 동기화',
  followSyncDesc: '타임라인에 등장하는 팔로우 계정은 자동으로 감지·저장됩니다. 팔로잉 페이지 스크롤로 전체 목록을 한번에 가져올 수 있습니다.',
  currentAccount: '현재 계정: @{account}',
  accountNotDetected: '계정 미감지',
  lastSync: '마지막 동기화: {time}',
  collectedFollows: '수집된 팔로우: {count}명',
  openFollowingPage: '팔로잉 페이지 열기',
  followingPageHint: '팔로잉 페이지에서 스크롤하면 전체 목록을 한번에 가져옵니다',
  clearFollowCache: '현재 계정 팔로우 캐시 초기화',
  clearCacheDone: '초기화 완료',
  scrollOnFollowingPage: '팔로잉 페이지에서 스크롤하세요',
  whitelist: '화이트리스트',
  whitelistDesc: '파딱이어도 숨기지 않을 계정을 직접 추가합니다',
  whitelistPlaceholder: '@아이디 입력',
  add: '추가',
  developer: '개발자',
  debugMode: '디버그 모드',
  debugModeHint: '각 트윗에 처리 정보 라벨을 표시하고 콘솔에 로그를 출력합니다',
  language: '언어',
  hiddenTweetClick: '숨겨진 트윗 (클릭하여 펼치기)',
  hiddenTweetFadak: '파딱 {handle}의 트윗이 숨겨졌습니다 (클릭하여 펼치기)',
  hiddenTweetRetweet: '{retweetedBy}님이 파딱 {handle}의 트윗을 리트윗했습니다 (클릭하여 펼치기)',
  hiddenTweetQuoteEntire: '{quotedBy}님이 파딱 {handle}을 인용한 트윗이 숨겨졌습니다 (클릭하여 펼치기)',
  hiddenQuoteTweet: '파딱 {handle}의 인용 트윗이 숨겨졌습니다 (클릭하여 펼치기)',
  fadakProfileBanner: '@{handle}은(는) 파딱 계정입니다',
  feedback: '피드백 보내기',
  feedbackDesc: '버그 제보, 기능 제안 등 여러분의 피드백이 서비스 개선에 큰 도움이 됩니다',
  manageWhitelist: '화이트리스트 관리',
  whitelistCount: '등록된 계정 ({count})',
  whitelistEmpty: '등록된 계정이 없습니다',
  keywordFilterBeta: '[Beta] 키워드 필터',
  keywordFilterBetaDesc: '모든 파딱이 아닌, 특정 키워드에 해당하는 바이오나 본문을 가지고 있는 글만 가립니다. 가끔 유용한 정보 파딱 등의 글을 보고 싶은 분들에게 추천입니다.',
  advancedFilterSettings: '고급 필터 설정',
  bookmarks: '북마크',
  addToWhitelist: '화이트리스트에 추가',
  addedToWhitelist: '화이트리스트에 추가됨',
  onboardingBanner: '팔로잉 목록을 동기화하면 팔로우 중인 계정이 필터링에서 제외됩니다.',
  onboardingCta: '팔로잉 페이지 열기',
  onboardingDismiss: '닫기',
  followSyncBanner: '전체 팔로우 목록을 가져오려면 최하단까지 스크롤해주세요',
  onboardingSiteBanner: '팔로잉 페이지에서 스크롤하면 팔로우 중인 계정을 필터에서 제외할 수 있습니다',
  onboardingSiteCta: '동기화하기',
};

const en: Translations = {
  extName: 'Blue Badge Remover',
  extDescription: 'Hide paid blue badge accounts on X (Twitter)',
  filtering: 'Filtering',
  filterScope: 'Filter Scope',
  filterScopeDesc: 'Select areas to hide paid badge tweets',
  homeTimeline: 'Home Timeline',
  tweetDetailReplies: 'Tweet Detail / Replies',
  searchResults: 'Search Results',
  hideMode: 'Hide Mode',
  removeCompletely: 'Remove Completely',
  removeCompletelyDesc: 'Remove tweets completely from the timeline',
  collapse: 'Collapse',
  collapseDesc: 'Collapse tweets so you can expand them by clicking',
  retweets: 'Retweets',
  retweetsDesc: 'When followed accounts retweet paid badge tweets',
  hideRetweetsLabel: 'Hide Paid Badge Retweets',
  quoteTweets: 'Quote Tweets',
  quoteTweetsDesc: 'How to handle quotes of paid badge tweets',
  quoteOff: "Don't Filter",
  quoteOnly: 'Hide Quote Only',
  quoteEntire: 'Hide Entire Tweet',
  followSync: 'Manual Follow Sync',
  followSyncDesc: 'Followed accounts appearing in your timeline are detected and saved automatically. Scroll the Following page to import the full list at once.',
  currentAccount: 'Current account: @{account}',
  accountNotDetected: 'Account not detected',
  lastSync: 'Last sync: {time}',
  collectedFollows: 'Collected follows: {count}',
  openFollowingPage: 'Open Following Page',
  followingPageHint: 'Scroll the Following page to import the full list at once',
  clearFollowCache: 'Clear Follow Cache for Current Account',
  clearCacheDone: 'Cache cleared',
  scrollOnFollowingPage: 'Scroll on the Following page',
  whitelist: 'Whitelist',
  whitelistDesc: 'Manually add accounts to never hide',
  whitelistPlaceholder: 'Enter @username',
  add: 'Add',
  developer: 'Developer',
  debugMode: 'Debug Mode',
  debugModeHint: 'Show processing labels on each tweet and output logs to console',
  language: 'Language',
  hiddenTweetClick: 'Hidden tweet (click to expand)',
  hiddenTweetFadak: 'Tweet by paid badge {handle} hidden (click to expand)',
  hiddenTweetRetweet: 'Retweeted by {retweetedBy} from paid badge {handle} (click to expand)',
  hiddenTweetQuoteEntire: 'Quote of paid badge {handle} by {quotedBy} hidden (click to expand)',
  hiddenQuoteTweet: 'Quote tweet by paid badge {handle} hidden (click to expand)',
  fadakProfileBanner: '@{handle} is a paid blue badge account',
  feedback: 'Send Feedback',
  feedbackDesc: 'Bug reports and feature suggestions help us improve the extension',
  manageWhitelist: 'Manage Whitelist',
  whitelistCount: 'Accounts ({count})',
  whitelistEmpty: 'No accounts added',
  keywordFilterBeta: '[Beta] Keyword Filter',
  keywordFilterBetaDesc: 'It does not hide all Paid badge posts, but only those containing specific keywords in the bio or the main text. This is recommended for users who occasionally want to see useful information from Paid badge holders.',
  advancedFilterSettings: 'Advanced Filter Settings',
  bookmarks: 'Bookmarks',
  addToWhitelist: 'Add to Whitelist',
  addedToWhitelist: 'Added to Whitelist',
  onboardingBanner: 'Sync your following list to exclude followed accounts from filtering.',
  onboardingCta: 'Open Following Page',
  onboardingDismiss: 'Dismiss',
  followSyncBanner: 'Scroll to the bottom to import your full following list',
  onboardingSiteBanner: 'Scroll the Following page to exclude accounts you follow from filtering',
  onboardingSiteCta: 'Sync now',
};

const ja: Translations = {
  extName: 'Blue Badge Remover',
  extDescription: 'X(Twitter)で課金バッジアカウントを非表示にします',
  filtering: 'フィルタリング',
  filterScope: 'フィルタ範囲',
  filterScopeDesc: '課金バッジのツイートを非表示にする範囲を選択します',
  homeTimeline: 'ホームタイムライン',
  tweetDetailReplies: 'ツイート詳細 / リプライ',
  searchResults: '検索結果',
  hideMode: '非表示方式',
  removeCompletely: '完全削除',
  removeCompletelyDesc: 'タイムラインからツイートを完全に削除します',
  collapse: '折りたたみ表示',
  collapseDesc: 'クリックで展開できるように折りたたみます',
  retweets: 'リツイート',
  retweetsDesc: 'フォロー中のアカウントが課金バッジのツイートをリツイートした場合',
  hideRetweetsLabel: '課金バッジのリツイートを非表示',
  quoteTweets: '引用ツイート',
  quoteTweetsDesc: '課金バッジのツイートを引用した場合の処理方式',
  quoteOff: 'フィルタしない',
  quoteOnly: '引用部分のみ非表示',
  quoteEntire: 'ツイート全体を非表示',
  followSync: '手動フォロー同期',
  followSyncDesc: 'タイムラインに表示されたフォロー中のアカウントは自動で検出・保存されます。フォローページでスクロールすると全リストを一括取得できます。',
  currentAccount: '現在のアカウント: @{account}',
  accountNotDetected: 'アカウント未検出',
  lastSync: '最終同期: {time}',
  collectedFollows: '収集済みフォロー: {count}人',
  openFollowingPage: 'フォローページを開く',
  followingPageHint: 'フォローページでスクロールすると全リストを一括取得できます',
  clearFollowCache: '現在のアカウントのフォローキャッシュをクリア',
  clearCacheDone: 'クリア完了',
  scrollOnFollowingPage: 'フォローページでスクロールしてください',
  whitelist: 'ホワイトリスト',
  whitelistDesc: '課金バッジでも非表示にしないアカウントを手動で追加します',
  whitelistPlaceholder: '@ユーザーIDを入力',
  add: '追加',
  developer: '開発者',
  debugMode: 'デバッグモード',
  debugModeHint: '各ツイートに処理情報ラベルを表示し、コンソールにログを出力します',
  language: '言語',
  hiddenTweetClick: '非表示のツイート (クリックで展開)',
  hiddenTweetFadak: '課金バッジ {handle}のツイートが非表示になりました (クリックで展開)',
  hiddenTweetRetweet: '{retweetedBy}が課金バッジ {handle}のツイートをリツイートしました (クリックで展開)',
  hiddenTweetQuoteEntire: '{quotedBy}が課金バッジ {handle}を引用したツイートが非表示になりました (クリックで展開)',
  hiddenQuoteTweet: '課金バッジ {handle}の引用ツイートが非表示になりました (クリックで展開)',
  fadakProfileBanner: '@{handle}は課金バッジアカウントです',
  feedback: 'フィードバックを送る',
  feedbackDesc: 'バグ報告や機能提案は、サービス改善に大きく役立ちます',
  manageWhitelist: 'ホワイトリスト管理',
  whitelistCount: '登録済み ({count})',
  whitelistEmpty: '登録なし',
  keywordFilterBeta: '[Beta] キーワードフィルター',
  keywordFilterBetaDesc: 'すべての課金バッジの投稿を非表示にするのではなく、プロフィールや本文に特定のキーワードが含まれている投稿のみを非表示にします。時々、課金バッジユーザーによる有益な情報を確認したい方に適しています。',
  advancedFilterSettings: '高度なフィルター設定',
  bookmarks: 'ブックマーク',
  addToWhitelist: 'ホワイトリストに追加',
  addedToWhitelist: 'ホワイトリストに追加済み',
  onboardingBanner: 'フォローリストを同期すると、フォロー中のアカウントがフィルタリングから除外されます。',
  onboardingCta: 'フォローページを開く',
  onboardingDismiss: '閉じる',
  followSyncBanner: '全フォローリストを取得するには一番下までスクロールしてください',
  onboardingSiteBanner: 'フォローページでスクロールするとフォロー中のアカウントをフィルタから除外できます',
  onboardingSiteCta: '同期する',
};

const translations: Record<Language, Translations> = { ko, en, ja };

export function t(key: TranslationKeys, lang: Language = DEFAULT_LANGUAGE, params?: Record<string, string>): string {
  const message = translations[lang]?.[key] ?? translations[DEFAULT_LANGUAGE][key] ?? key;
  if (!params) return message;
  return Object.entries(params).reduce<string>(
    (result, [paramKey, value]) => result.replace(`{${paramKey}}`, value),
    message,
  );
}

export function getTranslations(lang: Language): Translations {
  return translations[lang] ?? translations[DEFAULT_LANGUAGE];
}
