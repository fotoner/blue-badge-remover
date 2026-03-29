(function() {
  var MESSAGE_TYPES = {
    BADGE_DATA: 'BBR_BADGE_DATA',
    TOKEN_DATA: 'BBR_TOKEN_DATA',
    USER_ID: 'BBR_USER_ID',
    CSRF_TOKEN: 'BBR_CSRF_TOKEN',
    FOLLOW_DATA: 'BBR_FOLLOW_DATA'
  };

  var X_GRAPHQL_ENDPOINTS = ['/i/api/graphql/', '/i/api/2/'];

  // 디버그 모드: content script에서 postMessage로 전달
  var _bbrDebug = false;
  window.addEventListener('message', function(e) {
    if (e.source === window && e.data && e.data.type === 'BBR_SET_DEBUG') {
      _bbrDebug = !!e.data.enabled;
    }
  });
  function isDebug() { return _bbrDebug; }

  // XHR 인터셉트
  var OriginalXHR = window.XMLHttpRequest;
  var originalOpen = OriginalXHR.prototype.open;
  var originalSetRequestHeader = OriginalXHR.prototype.setRequestHeader;

  OriginalXHR.prototype.open = function(method, url) {
    this._bbrUrl = url;
    this._bbrHeaders = {};
    return originalOpen.apply(this, arguments);
  };

  OriginalXHR.prototype.setRequestHeader = function(name, value) {
    if (this._bbrHeaders) this._bbrHeaders[name.toLowerCase()] = value;
    return originalSetRequestHeader.apply(this, arguments);
  };

  var originalXhrSend = OriginalXHR.prototype.send;
  OriginalXHR.prototype.send = function() {
    var xhr = this;
    var url = xhr._bbrUrl || '';
    var headers = xhr._bbrHeaders || {};

    // 토큰 추출
    if (headers['authorization']) {
      window.postMessage({ type: MESSAGE_TYPES.TOKEN_DATA, token: headers['authorization'].replace('Bearer ', '') }, window.location.origin);
    }
    if (headers['x-csrf-token']) {
      window.postMessage({ type: MESSAGE_TYPES.CSRF_TOKEN, csrfToken: headers['x-csrf-token'] }, window.location.origin);
    }

    xhr.addEventListener('load', function() {
      var isGraphQL = X_GRAPHQL_ENDPOINTS.some(function(ep) { return url.includes(ep); });
      if (isGraphQL) {
        if (isDebug()) console.log('[BBR] XHR GraphQL:', url.split('?')[0]);
        try {
          var data = JSON.parse(xhr.responseText);
          extractBadgeData(data);
          extractViewerUserId(data);
          if (url.split('?')[0].includes('/Following')) {
            if (isDebug()) console.log('[BBR] XHR Follow URL:', url.split('?')[0]);
            extractFollowData(data);
          }
        } catch(e) {}
      }
    });

    return originalXhrSend.apply(this, arguments);
  };

  var originalFetch = window.fetch;

  window.fetch = function patchedFetch(input, init) {
    var url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    var authHeader = extractHeader(init, 'authorization');
    if (authHeader) {
      window.postMessage({ type: MESSAGE_TYPES.TOKEN_DATA, token: authHeader.replace('Bearer ', '') }, window.location.origin);
    }

    var csrfHeader = extractHeader(init, 'x-csrf-token');
    if (csrfHeader) {
      window.postMessage({ type: MESSAGE_TYPES.CSRF_TOKEN, csrfToken: csrfHeader }, window.location.origin);
    }

    return originalFetch.call(window, input, init).then(function(response) {
      var isGraphQL = X_GRAPHQL_ENDPOINTS.some(function(ep) { return url.includes(ep); });
      if (isGraphQL) {
        if (isDebug()) console.log('[BBR] GraphQL:', url.split('?')[0]);
        try {
          var cloned = response.clone();
          cloned.json().then(function(data) {
            var users = [];
            findUserObjects(data, users);
            if (users.length > 0 && isDebug()) console.log('[BBR] Badge data:', users.length, 'users');
            extractBadgeData(data);
            extractViewerUserId(data);
            if (url.split('?')[0].includes('/Following')) {
              if (isDebug()) console.log('[BBR] Follow URL detected:', url.split('?')[0]);
              extractFollowData(data);
            }
          }).catch(function(err) { if (isDebug()) console.log('[BBR] JSON parse error:', err); });
        } catch(e) { if (isDebug()) console.log('[BBR] Clone error:', e); }
      }
      return response;
    });
  };

  function extractHeader(init, headerName) {
    if (!init || !init.headers) return null;
    if (init.headers instanceof Headers) return init.headers.get(headerName);
    if (Array.isArray(init.headers)) {
      var entry = init.headers.find(function(h) { return h[0].toLowerCase() === headerName; });
      return entry ? entry[1] : null;
    }
    var keys = Object.keys(init.headers);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].toLowerCase() === headerName.toLowerCase()) return init.headers[keys[i]];
    }
    return null;
  }

  function extractBadgeData(data) {
    var users = [];
    findUserObjects(data, users);
    if (users.length > 0) {
      window.postMessage({ type: MESSAGE_TYPES.BADGE_DATA, users: users }, window.location.origin);
    }
  }

  function extractViewerUserId(data) {
    var viewerId = findViewerId(data);
    if (viewerId) {
      window.postMessage({ type: MESSAGE_TYPES.USER_ID, userId: viewerId }, window.location.origin);
    }
  }

  function extractFollowData(data) {
    var entries = [];
    findFollowedIds(data, entries);
    if (entries.length > 0) {
      // handle이 있는 것만 보냄
      var handles = entries.map(function(e) { return e.handle; }).filter(function(h) { return h !== null; });
      window.postMessage({ type: MESSAGE_TYPES.FOLLOW_DATA, handles: handles }, window.location.origin);
    }
  }

  function findViewerId(obj, depth) {
    if ((depth || 0) > 20 || obj === null || typeof obj !== 'object') return null;
    if ('viewer' in obj) {
      var viewer = obj.viewer;
      if (viewer && typeof viewer.rest_id === 'string') return viewer.rest_id;
      var nested = findViewerId(viewer, (depth||0)+1);
      if (nested) return nested;
    }
    if ('viewer_v2' in obj) {
      var n = findViewerId(obj.viewer_v2, (depth||0)+1);
      if (n) return n;
    }
    var wrappers = ['data', 'result', 'user'];
    for (var i = 0; i < wrappers.length; i++) {
      if (wrappers[i] in obj && typeof obj[wrappers[i]] === 'object') {
        var r = findViewerId(obj[wrappers[i]], (depth||0)+1);
        if (r) return r;
      }
    }
    return null;
  }

  function findFollowedIds(obj, result, depth) {
    if ((depth || 0) > 20 || obj === null || typeof obj !== 'object') return;
    if ('user_results' in obj) {
      var ur = obj.user_results;
      if (ur && ur.result && typeof ur.result.rest_id === 'string') {
        // screen_name을 core 또는 legacy에서 추출
        var sn = null;
        if (ur.result.core && ur.result.core.screen_name) sn = ur.result.core.screen_name;
        else if (ur.result.legacy && ur.result.legacy.screen_name) sn = ur.result.legacy.screen_name;
        result.push({ id: ur.result.rest_id, handle: sn ? sn.toLowerCase() : null });
      }
    }
    var values = Object.values(obj);
    for (var i = 0; i < values.length; i++) {
      if (Array.isArray(values[i])) {
        values[i].forEach(function(item) { findFollowedIds(item, result, (depth||0)+1); });
      } else if (typeof values[i] === 'object') {
        findFollowedIds(values[i], result, (depth||0)+1);
      }
    }
  }

  function findUserObjects(obj, result, depth) {
    if ((depth || 0) > 20 || obj === null || typeof obj !== 'object') return;
    if ('rest_id' in obj && 'is_blue_verified' in obj) {
      var screenName = obj.legacy && obj.legacy.screen_name;
      result.push({
        rest_id: obj.rest_id,
        is_blue_verified: obj.is_blue_verified,
        verified_type: obj.verified_type,
        legacy: obj.legacy,
        screen_name: screenName || null
      });
    }
    var values = Object.values(obj);
    for (var i = 0; i < values.length; i++) {
      if (Array.isArray(values[i])) {
        values[i].forEach(function(item) { findUserObjects(item, result, (depth||0)+1); });
      } else if (typeof values[i] === 'object') {
        findUserObjects(values[i], result, (depth||0)+1);
      }
    }
  }
})();
