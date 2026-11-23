// src/content/index.ts
// Content script 진입점. 초기화 + 모듈 연결만 담당.
import { browser } from 'wxt/browser';
import { FeedObserver, setTweetHiderLanguage } from '@features/content-filter';
import { getSettings as loadSettings, getStoredWhitelist, addToWhitelist } from '@features/settings';
import { MESSAGE_TYPES, STORAGE_KEYS, TIMINGS } from '@shared/constants';
import { logger } from '@shared/utils/logger';
import { showFadakProfileBanner, showFadakDetailBanner, removeFadakBanner } from './fadak-banner';
import { listenForNavigation, setOnNavigate } from './navigation';
import { collectFollowsFromDOM, disconnectFollowObserver, listenForFollowButtonClicks, getMyHandle, switchFollowAccount } from './follow-collector';
import { isProfilePage, getAccountHandle } from './page-utils';
import { observeSettingsShortcut } from './settings-shortcut';
import { setSettings, setFollowSet, setWhitelistSet, setProtectedKeywords, setCurrentUserHandle, getSettings, getFollowSet, getProtectedKeywords, getCurrentUserHandle, isHandleFollowed, isHandleWhitelisted, isCurrentUserHandle, profileCache, collectorBuffer } from './state';
import { flushCollector } from './collector-buffer';
import { loadFilterRules } from './filter-pipeline';
import { processTweet, restoreHiddenTweets, reprocessExistingTweets, applyCurrentUserFallback } from './tweet-orchestrator';
import { listenForMessages, listenForViewerHandle, reprocessTweetsByHandles, scheduleFollowReprocess } from './message-handler';
import { listenForSettingsChanges } from './storage-listener';
import { listenForReloadProbe } from './reload-probe';
import { resetFollowGrace } from './follow-grace';
import { startStatsFlush, flushStats, setOnFlush } from '@features/stats';
import { checkMilestone } from './milestone-banner';
import { HoverCardObserver, mergeHoverCardBio, shouldObserveHoverCards } from './hover-card-observer';

let feedObserver: FeedObserver;
let accountSwitchTimerId: ReturnType<typeof setInterval> | null = null;
let collectorFlushTimerId: ReturnType<typeof setInterval> | null = null;
let contentReadyAccount: string | null = null;
// 초기 계정 판정(loadInitialAccountState)이 끝났는지. 그 전에 온 힌트는 그 판정이 getAccountHandle로 직접 읽는다 (#142)
let initialAccountSettled = false;
const hoverCardObserver = new HoverCardObserver(handleHoverCardBio);

function setDebugFlag(enabled: boolean): void {
  window.postMessage({ type: 'BBR_SET_DEBUG', enabled }, window.location.origin);
}

const fadakBannerDeps = {
  isProfilePage,
  isHandleFollowed,
  isHandleWhitelisted,
  isCurrentUser: isCurrentUserHandle,
  getCurrentSettings: () => getSettings(),
  addToWhitelist,
};

const followCollectorDeps = {
  getCurrentSettings: () => getSettings(),
  setFollowSet: (set: Set<string>) => { setFollowSet(set); },
  getFollowSet: () => getFollowSet(),
  // 같은 탭 팔로우 클릭은 storage 쓰기 전에 메모리 Set에 먼저 넣어서 storage 리스너의 added에 잡히지 않는다 — 여기서 재판정을 예약한다 (#100)
  onFollowed: (handle: string) => { removeFadakBanner(); scheduleFollowReprocess([handle]); },
  onUnfollowed: () => { showFadakProfileBanner(fadakBannerDeps); },
};

async function detectAndHandleAccountSwitch(): Promise<boolean> {
  const currentHandle = getAccountHandle();
  if (!currentHandle) return false;

  // 저장소가 이미 이 계정이어도 이 탭의 메모리 계정이 다르면 따라간다. 다른 탭이 먼저 계정을 저장하면 이 탭에 이전 계정이 남는다 (#142)
  const switched = await switchFollowAccount(currentHandle, getCurrentUserHandle());
  if (switched) {
    setFollowSet(new Set(switched.follows));
    setCurrentUserHandle(currentHandle);
    // 이전 계정이 있다가 바뀐 것이면 새 계정의 첫 방문으로 다시 센다. 계정을 처음 알게 된 경우는 이미 돌고 있는 유예를 이어 간다 (#142)
    if (switched.from) resetFollowGrace();
    const settings = getSettings();
    if (settings.debugMode) logger.info('Account switched', { from: switched.from, to: currentHandle, cachedFollows: switched.follows.length });
    restoreHiddenTweets();
    reprocessExistingTweets();
    // 계정이 바뀌면 본인 여부가 달라진다 — 배너를 새 계정 기준으로 다시 맞춘다 (#88)
    showFadakProfileBanner(fadakBannerDeps);
    showFadakDetailBanner(fadakBannerDeps);
  }
  return true;
}

function signalContentReady(): void {
  const account = getCurrentUserHandle();
  if (!account || contentReadyAccount === account) return;
  contentReadyAccount = account;
  window.postMessage({ type: MESSAGE_TYPES.CONTENT_READY, account }, window.location.origin);
}

// xweb: MAIN world가 초기 데이터의 본인 계정을 알려 주면 그 값으로 계정을 판정한다 (#142)
// 초기 계정 판정 전에 온 힌트는 여기서 다루지 않는다. 판정이 힌트를 직접 읽고 끝에서 바로 준비 신호를 보낸다.
function handleViewerHandle(): void {
  if (!initialAccountSettled) return;
  void detectAndHandleAccountSwitch().then(() => signalContentReady());
}

// 계정을 아직 못 찾았으면 메시지 수신 시작을 MAIN world에 알린다. 힌트가 아직 없을 때의 대체 경로다 — MAIN world가 본인 계정을 다시 보낸다 (#142)
function announceListening(): void {
  window.postMessage({ type: MESSAGE_TYPES.CONTENT_READY }, window.location.origin);
}

function startAccountSwitchWatcher(): void {
  if (accountSwitchTimerId !== null) clearInterval(accountSwitchTimerId);
  let lastHandle = getAccountHandle();
  accountSwitchTimerId = setInterval(() => {
    const handle = getAccountHandle();
    if (handle && handle !== lastHandle) {
      lastHandle = handle;
      void detectAndHandleAccountSwitch().then(() => signalContentReady());
    }
  }, TIMINGS.ACCOUNT_SWITCH_POLL);
}

function startObserving(): void {
  const feed = document.querySelector('main') ?? document.body;
  // X는 이동해도 main을 유지한다 — 연결을 유지해야 새로 그려진 트윗을 첫 페인트 전에 숨긴다
  feedObserver.ensureObserving(feed);
}

function handleNavigate(): void {
  const settings = getSettings();
  if (settings.keywordCollectorEnabled) void flushCollector();
  void flushStats();
  removeFadakBanner();
  if (!window.location.pathname.includes('/following')) {
    disconnectFollowObserver();
  }
  requestAnimationFrame(() => {
    startObserving();
    reprocessExistingTweets();
    showFadakProfileBanner(fadakBannerDeps);
    showFadakDetailBanner(fadakBannerDeps);
    if (window.location.pathname.includes('/following')) {
      collectFollowsFromDOM(followCollectorDeps);
    }
  });
}

function handleHoverCardBio(key: string, bio: string): void {
  const cached = profileCache.get(key);
  const merged = mergeHoverCardBio(cached, key, bio);
  if (merged !== cached) {
    profileCache.set(key, merged);
    const settings = getSettings();
    if (settings.keywordFilterEnabled || settings.aggressorFilterEnabled || getProtectedKeywords().length > 0) {
      reprocessTweetsByHandles(new Set([key]));
    }
  }

  const settings = getSettings();
  if (settings.keywordCollectorEnabled) {
    const buffered = collectorBuffer.get(key);
    if (buffered && !buffered.bio) {
      buffered.bio = bio;
      if (settings.debugMode) logger.debug('Hover card bio received', { handle: key, bioPreview: bio.slice(0, 40) });
    }
  }
}

function syncHoverCardObserver(settings: ReturnType<typeof getSettings>): void {
  const enabled = shouldObserveHoverCards(settings, getProtectedKeywords());
  hoverCardObserver.sync(enabled, document.body);
}

async function loadInitialAccountState(whitelist: string[]): Promise<boolean> {
  const stored = await browser.storage.local.get([STORAGE_KEYS.FOLLOW_LIST, STORAGE_KEYS.FOLLOW_CACHE, STORAGE_KEYS.CURRENT_USER_ID, STORAGE_KEYS.PROTECTED_KEYWORDS]);
  const currentAccount = (stored[STORAGE_KEYS.CURRENT_USER_ID] as string | null) ?? '';
  setCurrentUserHandle(currentAccount || null);
  const cache = (stored[STORAGE_KEYS.FOLLOW_CACHE] as Record<string, string[]> | undefined) ?? {};
  const cachedFollows = currentAccount ? (cache[currentAccount] ?? []) : ((stored[STORAGE_KEYS.FOLLOW_LIST] as string[] | undefined) ?? []);
  setFollowSet(new Set(cachedFollows));
  setWhitelistSet(new Set(whitelist));
  setProtectedKeywords((stored[STORAGE_KEYS.PROTECTED_KEYWORDS] as string[] | undefined) ?? []);
  return detectAndHandleAccountSwitch();
}

async function finishInitialSetup(): Promise<void> {
  await detectAndHandleAccountSwitch();
  applyCurrentUserFallback(getMyHandle);
  signalContentReady();
  showFadakProfileBanner(fadakBannerDeps);
  showFadakDetailBanner(fadakBannerDeps);
  startAccountSwitchWatcher();
}

async function init(): Promise<void> {
  listenForReloadProbe();
  // 비동기 대기보다 앞에서 등록한다. MAIN world가 DOM 준비 때 보낸 본인 계정 힌트를 초기 계정 판정 전에 받기 위해서다 (#142)
  listenForViewerHandle(handleViewerHandle);
  // 화이트리스트는 저장소에서 바로 읽는다. background 응답을 기다리면 background가 응답하지 않을 때(예: iOS Orion 제보) 숨김이 시작되지 않는다 (#135)
  const [settings, whitelist] = await Promise.all([loadSettings(), getStoredWhitelist()]);
  setSettings(settings);
  await loadFilterRules();

  const accountResolved = await loadInitialAccountState(whitelist);
  initialAccountSettled = true;

  setTweetHiderLanguage(settings.language);
  setDebugFlag(settings.debugMode);
  listenForMessages(followCollectorDeps);
  listenForSettingsChanges(setDebugFlag, syncHoverCardObserver);
  if (collectorFlushTimerId !== null) clearInterval(collectorFlushTimerId);
  collectorFlushTimerId = setInterval(() => { if (getSettings().keywordCollectorEnabled) void flushCollector(); }, TIMINGS.COLLECTOR_FLUSH_INTERVAL);
  setOnFlush((totalHidden) => void checkMilestone(totalHidden));
  startStatsFlush();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushStats();
  });

  if (accountResolved) signalContentReady();
  else announceListening();

  feedObserver = new FeedObserver(processTweet);
  startObserving();
  reprocessExistingTweets();
  syncHoverCardObserver(settings);

  setOnNavigate(handleNavigate);
  listenForNavigation();
  observeSettingsShortcut();
  collectFollowsFromDOM(followCollectorDeps);
  listenForFollowButtonClicks(followCollectorDeps);

  setTimeout(() => {
    void finishInitialSetup();
  }, TIMINGS.INITIAL_SETUP_DELAY);

  if (settings.debugMode) {
    const allStorage = await browser.storage.local.get(null);
    logger.debug('Storage state', {
      followCount: ((allStorage[STORAGE_KEYS.FOLLOW_LIST] as string[]) ?? []).length,
      whitelistCount: ((allStorage['whitelist'] as string[]) ?? []).length,
      lastSyncAt: allStorage[STORAGE_KEYS.LAST_SYNC_AT],
    });
    logger.info('Blue Badge Remover initialized');
  }
}

if (typeof document !== 'undefined') {
  init();
}
