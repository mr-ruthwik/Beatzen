(function () {
    'use strict';

    /* ── Firebase init ───────────────────────────────────────────────── */
    var firebaseConfig = {
        apiKey: "AIzaSyDdUpkeGD-imTIpiU4tSDUannXS0hIQr1w",
        authDomain: "beatzen-e1112.firebaseapp.com",
        databaseURL: "https://beatzen-e1112-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "beatzen-e1112",
        storageBucket: "beatzen-e1112.firebasestorage.app",
        messagingSenderId: "556167519281",
        appId: "1:556167519281:web:3c1fd3a58aa89802688910"
    };

    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

    window.auth = firebase.auth();
    window.db = firebase.firestore();
    var auth = window.auth;
    var db = window.db;

    var SIGNUP_BONUS_HOURS = 24; // free Premium hours granted on signup

    // Emails that get permanent free Premium — must stay in sync with
    // isFreeForeverEmail() in firestore.rules (same list, lowercase).
    var FREE_FOREVER_EMAILS = ['sairuthwik2002@gmail.com'];
    // Sentinel "never expires" timestamp: 2100-01-01T00:00:00.000Z in ms —
    // must match isPermanentExpiry() in firestore.rules exactly.
    var PERMANENT_PREMIUM_EXPIRES_AT = 4102444800000;

    /* ── bzAuthReady / bzIsAuthenticated contract (read by script.js) ──
       script.js polls window.bzAuthReady and reads window.bzIsAuthenticated
       to decide whether to show the auth gate. Both are set for real here. */
    var _authReadyResolve;
    window.bzAuthReady = new Promise(function (resolve) { _authReadyResolve = resolve; });

    /* ── Live premium sync — keeps window._bzIsPremium in sync with
       beatzen_users/{uid} so admin-granted/expired premium reflects
       instantly without a refresh. ── */
    var _userDocUnsub = null;
    function stopUserDocListener() {
        if (_userDocUnsub) { _userDocUnsub(); _userDocUnsub = null; }
    }
    function startUserDocListener(uid) {
        stopUserDocListener();
        _userDocUnsub = db.collection('beatzen_users').doc(uid).onSnapshot(function (doc) {
            var d = doc.data() || {};
            window._bzIsPremium = !!d.premium;
            window._bzPremiumExpiresAt = typeof d.premiumExpiresAt === 'number' ? d.premiumExpiresAt : 0;
            try {
                localStorage.setItem('beatzen_premium', window._bzIsPremium ? 'true' : 'false');
                localStorage.setItem('beatzen_premiumExpiresAt', String(window._bzPremiumExpiresAt));
            } catch (_) { }
            if (typeof window.bzApplyPremiumGating === 'function') window.bzApplyPremiumGating();
        }, function (err) {
            console.warn('Beat Zen: user doc listener failed', err && err.message);
        });
    }

    // firestore.rules permits any FREE_FOREVER_EMAILS user to write
    // {premium:true, premiumExpiresAt:PERMANENT_PREMIUM_EXPIRES_AT} to
    // their own beatzen_users doc at any time (isFreeForeverEmail() /
    // isValidFreeForeverGrant()) — but permitting a write isn't the same
    // as performing one. Nothing ever actually made this write, so being
    // on the whitelist alone did nothing. This does the actual write, once
    // per sign-in, and is a no-op once the permanent grant is already in
    // place so it's safe to call on every sign-in.
    function grantFreeForeverPremiumIfEligible(user) {
        if (!user || !user.email) return Promise.resolve();
        var email = user.email.toLowerCase();
        if (FREE_FOREVER_EMAILS.indexOf(email) === -1) return Promise.resolve();

        var ref = db.collection('beatzen_users').doc(user.uid);
        return ref.get().then(function (doc) {
            var d = doc.data() || {};
            if (d.premium === true && d.premiumExpiresAt === PERMANENT_PREMIUM_EXPIRES_AT) {
                return; // already granted — nothing to do
            }
            return ref.set({
                premium: true,
                premiumExpiresAt: PERMANENT_PREMIUM_EXPIRES_AT
            }, { merge: true });
        }).then(function () {
            window._bzIsPremium = true;
            window._bzPremiumExpiresAt = PERMANENT_PREMIUM_EXPIRES_AT;
            window._bzPremiumPlan = 'free_forever';
            try {
                localStorage.setItem('beatzen_premium', 'true');
                localStorage.setItem('beatzen_premiumExpiresAt', String(PERMANENT_PREMIUM_EXPIRES_AT));
                localStorage.setItem('beatzen_premiumPlan', 'free_forever');
            } catch (_) { }
            if (typeof window.bzApplyPremiumGating === 'function') window.bzApplyPremiumGating();
        }).catch(function (e) {
            console.warn('Beat Zen: free-forever premium grant failed', e);
        });
    }

    // Keeps fullName/email current + writes createdAt once. Never touches
    // premium/premiumExpiresAt so it can never race the signup-bonus write.
    function ensureUserDoc(user) {
        var ref = db.collection('beatzen_users').doc(user.uid);
        return ref.get().then(function (doc) {
            var updates = { fullName: user.displayName || '', email: user.email || '' };
            if (!doc.exists) updates.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            return ref.set(updates, { merge: true });
        }).catch(function (e) { console.warn('Beat Zen: user doc sync failed', e); });
    }

    /* ══════════════════════════════════════════════════════════════════
       ADMIN-DASHBOARD FEED  (device recording + cloud sync upload)

       The Admin Dashboard in script.js only READS:
         • beatzen_sync/{uid}                    → stats, prefs, now-playing,
                                                    history, favourites, "Last Synced"
         • beatzen_users/{uid}/devices/{devId}   → the "Devices" section
         • beatzen_users/{uid}.activeDevice*     → the "Active now" badge
       and script.js calls window.bzImmediateUpload() / window.bzSilentUpload()
       after settings changes and on every play / pause. Nothing in the app
       defined those functions or wrote those documents, so the dashboard had
       nothing to show. This block is the missing writer.

       It only ever writes fields that firestore.rules already allows.
       ══════════════════════════════════════════════════════════════════ */

    // Set right before a real sign-in / sign-up so the auth-state handler can
    // tell a fresh login (counts toward the device's sign-in total) from a
    // returning visit that merely restored a saved session.
    var _bzFreshSignIn = false;

    function bzGetDeviceId() {
        // Same key + format as _bzGetDeviceId() in script.js so both agree.
        try {
            var id = localStorage.getItem('bz_device_id');
            if (!id) {
                id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
                localStorage.setItem('bz_device_id', id);
            }
            return id;
        } catch (_) { return 'dev_unknown'; }
    }

    function bzDetectDevice() {
        var ua = navigator.userAgent || '';
        var isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
        var isIPad = /iPad/i.test(ua) || isIPadOS;
        var isIPhone = /iPhone|iPod/i.test(ua);

        var os = 'Unknown';
        if (/Android/i.test(ua)) os = 'Android';
        else if (isIPad) os = 'iPadOS';
        else if (isIPhone) os = 'iOS';
        else if (/Windows/i.test(ua)) os = 'Windows';
        else if (/CrOS/i.test(ua)) os = 'ChromeOS';
        else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
        else if (/Linux/i.test(ua)) os = 'Linux';

        var browser = 'Browser';
        if (/Edg\//i.test(ua)) browser = 'Edge';
        else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
        else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';
        else if (/Firefox\/|FxiOS/i.test(ua)) browser = 'Firefox';
        else if (/Chrome\/|CriOS/i.test(ua)) browser = 'Chrome';
        else if (/Safari\//i.test(ua)) browser = 'Safari';

        var deviceType = 'desktop';
        if (isIPad || (/Android/i.test(ua) && !/Mobile/i.test(ua))) deviceType = 'tablet';
        else if (isIPhone || /Android|Mobile/i.test(ua)) deviceType = 'mobile';

        // Android model, e.g. "SM-S918B". Chrome's reduced UA reports just "K".
        var model = '';
        var m = ua.match(/Android [\d.]+; ([^;)]+)/);
        if (m && m[1]) {
            var raw = m[1].replace(/\s*Build.*$/i, '').trim();
            if (raw && raw !== 'K' && raw.length <= 60) model = raw;
        }

        return {
            deviceId: bzGetDeviceId(),
            deviceName: (browser + ' on ' + (model || os)).slice(0, 190),
            deviceType: deviceType,
            model: model,
            os: os,
            browser: browser,
            userAgent: ua.slice(0, 480),
            platform: (navigator.platform || '').slice(0, 90)
        };
    }

    // Writes beatzen_users/{uid}/devices/{deviceId} and marks this device as
    // the user's active one. Shapes match deviceFieldsOk() /
    // activeDeviceFieldsOk() in firestore.rules exactly.
    //
    // NOTE: this only RECORDS the device. It does not sign other devices out.
    function bzRecordDeviceLogin(user, isFreshSignIn) {
        if (!user || !user.uid) return Promise.resolve();
        var info = bzDetectDevice();
        var ts = firebase.firestore.FieldValue.serverTimestamp();
        var userRef = db.collection('beatzen_users').doc(user.uid);
        var devRef = userRef.collection('devices').doc(info.deviceId);

        return devRef.get().then(function (snap) {
            var prev = snap.exists ? (snap.data() || {}) : null;
            var prevCount = (prev && typeof prev.loginCount === 'number') ? prev.loginCount : 0;
            var fields = {
                deviceId: info.deviceId,
                deviceName: info.deviceName,
                deviceType: info.deviceType,
                os: info.os,
                browser: info.browser,
                userAgent: info.userAgent,
                platform: info.platform,
                lastLoginAt: ts,
                loginCount: Math.max(1, prevCount + ((isFreshSignIn || !prev) ? 1 : 0))
            };
            if (info.model) fields.model = info.model;
            if (!prev) fields.firstLoginAt = ts;
            return devRef.set(fields, { merge: true });
        }).then(function () {
            return userRef.get();
        }).then(function (uSnap) {
            var u = uSnap.exists ? (uSnap.data() || {}) : {};
            // Only touch the user doc when the active device actually changes.
            // (Every write to beatzen_users makes the admin user-list listener
            // re-subscribe to every user's sync doc, so don't do it per visit.)
            if (u.activeDeviceId === info.deviceId && !isFreshSignIn) return;
            return userRef.set({
                activeDeviceId: info.deviceId,
                activeDeviceName: info.deviceName,
                activeDeviceAt: ts
            }, { merge: true });
        }).catch(function (e) {
            console.warn('Beat Zen: device record failed', e && e.code, e && e.message);
        });
    }
    window.bzRecordDeviceLogin = bzRecordDeviceLogin;

    /* ── Cloud sync upload → beatzen_sync/{uid} ────────────────────────── */
    var BZ_SYNC_MIN_GAP_MS = 4000;      // never write more often than this
    var BZ_SYNC_HEARTBEAT_MS = 120000;  // re-check for changes while visible
    var BZ_SYNC_FIELD_MAX = 150000;     // skip any single JSON field bigger than this

    var _syncEnabled = false;
    var _syncTimer = null;
    var _syncDue = 0;
    var _syncForce = false;
    var _syncInFlight = false;
    var _syncLastWriteAt = 0;
    var _syncLastSig = '';
    var _syncHeartbeat = null;

    function bzLsGet(key) {
        try { return localStorage.getItem(key); } catch (_) { return null; }
    }
    function bzReadJSON(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (_) { return fallback; }
    }
    function bzParseDurationSec(d) {
        if (typeof d === 'number' && isFinite(d)) return d;
        if (typeof d !== 'string' || !d) return 0;
        var parts = d.split(':').map(function (x) { return parseInt(x, 10); });
        if (parts.some(function (x) { return isNaN(x); })) return 0;
        var sec = 0;
        parts.forEach(function (p) { sec = sec * 60 + p; });
        return sec;
    }
    function bzTopKey(map) {
        var best = '', bestN = 0;
        Object.keys(map).forEach(function (k) { if (map[k] > bestN) { best = k; bestN = map[k]; } });
        return best;
    }
    // Admin-facing timestamps are shown in IST (the app is India-focused);
    // hard-coded so an admin isn't reading a user's local time by mistake.
    function bzFormatIST(date) {
        try {
            return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST';
        } catch (_) { return date.toISOString(); }
    }

    // Lifetime counters live in localStorage (per account) because the app's
    // own play history is capped at 100 entries. Each history entry newer than
    // the last one already counted adds 1 song + its duration.
    function bzComputeStats(uid, history) {
        var key = 'bz_sync_stats_' + uid;
        var s = bzReadJSON(key, null);
        if (!s || typeof s !== 'object') s = { songs: 0, sec: 0, last: '' };
        var last = s.last || '';
        var newest = last;

        var artists = {}, albums = {}, hours = {};
        history.forEach(function (e) {
            if (!e || typeof e.playedAt !== 'string') return;
            if (e.playedAt > last) {
                s.songs += 1;
                s.sec += bzParseDurationSec(e.duration);
                if (e.playedAt > newest) newest = e.playedAt;
            }
            if (e.artist) artists[e.artist] = (artists[e.artist] || 0) + 1;
            var album = e.albumTitle || e.sourceName;
            if (album) albums[album] = (albums[album] || 0) + 1;
            var dt = new Date(e.playedAt);
            if (!isNaN(dt.getTime())) {
                var h = dt.getHours();
                hours[h] = (hours[h] || 0) + 1;
            }
        });
        s.last = newest;
        try { localStorage.setItem(key, JSON.stringify(s)); } catch (_) { }

        var peak = bzTopKey(hours);
        var peakLabel = '';
        if (peak !== '') {
            var h24 = parseInt(peak, 10);
            peakLabel = ((h24 % 12) || 12) + ' ' + (h24 < 12 ? 'AM' : 'PM');
        }
        return {
            songs: s.songs,
            minutes: Math.round(s.sec / 60),
            topArtist: bzTopKey(artists),
            topAlbum: bzTopKey(albums),
            peakHour: peakLabel
        };
    }

    // Field names are exactly what _bzRenderUserDetail() / bzLoadAdminUserList()
    // in script.js read. Never put `undefined` in here — Firestore rejects it.
    function bzBuildSyncPayload(user) {
        var history = bzReadJSON('beatZen_history_auto', []);
        if (!Array.isArray(history)) history = [];
        var stats = bzComputeStats(user.uid, history);

        var slimHistory = history.map(function (e) {
            e = e || {};
            return {
                id: String(e.id || ''),
                title: e.title || '',
                artist: e.artist || '',
                albumTitle: e.albumTitle || '',
                sourceName: e.sourceName || '',
                playedAt: e.playedAt || ''
            };
        });

        var lastSignIn = '';
        if (user.metadata && user.metadata.lastSignInTime) {
            var d = new Date(user.metadata.lastSignInTime);
            if (!isNaN(d.getTime())) lastSignIn = bzFormatIST(d);
        }

        var data = {
            _displayName: user.displayName || bzLsGet('beatzen_fullName') || '',
            _email: user.email || '',
            _lastSignInAt: lastSignIn,
            _deviceId: bzGetDeviceId(),
            _totalSongsPlayed: stats.songs,
            _totalListenMinutes: stats.minutes,
            _topArtist: stats.topArtist,
            _topMovie: stats.topAlbum,
            _peakListenHour: stats.peakHour,
            beatzen_dark_mode: bzLsGet('beatzen_dark_mode') || 'false',
            beatZen_shuffle: bzLsGet('beatZen_shuffle') || 'false',
            beatZen_loop: bzLsGet('beatZen_loop') || 'false',
            beatzen_automix: bzLsGet('beatzen_automix') || 'false',
            beatzen_history: bzLsGet('beatzen_history') || 'false',
            beatZen_activeView: bzLsGet('beatZen_activeView') || '',
            z_history: JSON.stringify(slimHistory)
        };

        var lastSong = bzLsGet('lastPlayedSong');
        if (lastSong && lastSong.length <= BZ_SYNC_FIELD_MAX) data.lastPlayedSong = lastSong;

        var favs = bzLsGet('beatZen_favourites');
        if (favs && favs.length <= BZ_SYNC_FIELD_MAX) data.z_favourites = favs;

        if (data.z_history.length > BZ_SYNC_FIELD_MAX) data.z_history = JSON.stringify(slimHistory.slice(0, 40));

        return { data: data, sig: JSON.stringify(data) };
    }

    function bzFlushSync(force) {
        _syncTimer = null;
        _syncForce = false;
        var user = auth.currentUser;
        if (!_syncEnabled || !user) return;
        if (_syncInFlight) { bzScheduleSync(1000, force); return; }

        var built = bzBuildSyncPayload(user);
        if (!force && built.sig === _syncLastSig) return; // nothing changed

        _syncInFlight = true;
        var data = built.data;
        data._uploadedAt = firebase.firestore.FieldValue.serverTimestamp();
        data._uploadedAtFormatted = bzFormatIST(new Date());

        db.collection('beatzen_sync').doc(user.uid).set(data, { merge: true })
            .then(function () {
                _syncLastSig = built.sig;
                _syncLastWriteAt = Date.now();
            })
            .catch(function (e) {
                console.warn('Beat Zen: cloud sync upload failed', e && e.code, e && e.message);
            })
            .then(function () { _syncInFlight = false; });
    }

    // Coalesces bursts (e.g. several toggles, play + favourite) into one write
    // and keeps at least BZ_SYNC_MIN_GAP_MS between writes.
    function bzScheduleSync(delayMs, force) {
        if (!_syncEnabled) return;
        var wait = Math.max(delayMs, (_syncLastWriteAt + BZ_SYNC_MIN_GAP_MS) - Date.now());
        var due = Date.now() + wait;
        if (_syncTimer) {
            _syncForce = _syncForce || !!force;
            if (due >= _syncDue) return;   // an earlier flush is already queued
            clearTimeout(_syncTimer);
        } else {
            _syncForce = !!force;
        }
        _syncDue = due;
        _syncTimer = setTimeout(function () { bzFlushSync(_syncForce); }, wait);
    }

    function _bzSyncOnVisibility() {
        if (document.visibilityState === 'hidden') bzScheduleSync(0, false); // flush before backgrounding
    }
    function _bzSyncOnPageHide() { bzScheduleSync(0, false); }

    function bzStartSyncEngine() {
        if (_syncEnabled) return;
        _syncEnabled = true;
        _syncLastSig = '';
        _syncLastWriteAt = 0;
        bzScheduleSync(2500, true); // first push once the app has settled; forced so "Last Synced" is fresh
        _syncHeartbeat = setInterval(function () {
            if (document.visibilityState === 'visible') bzScheduleSync(0, false);
        }, BZ_SYNC_HEARTBEAT_MS);
        document.addEventListener('visibilitychange', _bzSyncOnVisibility);
        window.addEventListener('pagehide', _bzSyncOnPageHide);
    }

    function bzStopSyncEngine() {
        _syncEnabled = false;
        if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }
        if (_syncHeartbeat) { clearInterval(_syncHeartbeat); _syncHeartbeat = null; }
        document.removeEventListener('visibilitychange', _bzSyncOnVisibility);
        window.removeEventListener('pagehide', _bzSyncOnPageHide);
        _syncLastSig = '';
    }

    // Hooks script.js already calls (as no-ops until now).
    window.bzImmediateUpload = function () { bzScheduleSync(400, false); };   // settings toggles
    window.bzSilentUpload = function () { bzScheduleSync(1500, false); };     // play / pause / favourites

    /* ── Central auth-state handler ─────────────────────────────────── */
    auth.onAuthStateChanged(function (user) {
        window.bzIsAuthenticated = !!user;
        var html = document.documentElement;

        if (user) {
            try { localStorage.setItem('beatZen_session_uid', user.uid); } catch (_) { }
            html.classList.remove('bz-guest');
            html.classList.add('bz-signed-in');
            var freshSignIn = _bzFreshSignIn;
            _bzFreshSignIn = false;
            // Sequenced AFTER ensureUserDoc so ensureUserDoc still sees a
            // missing doc on first sign-up and writes createdAt.
            ensureUserDoc(user).then(function () { return bzRecordDeviceLogin(user, freshSignIn); });
            grantFreeForeverPremiumIfEligible(user);
            startUserDocListener(user.uid);
            bzStartSyncEngine();

            var gate = document.getElementById('bz-auth-gate');
            if (gate) gate.classList.remove('bz-gate-visible');

            var syncSection = document.getElementById('bz-sync-section');
            if (syncSection) syncSection.style.display = 'block';
            var settingsLocked = document.getElementById('bz-settings-locked');
            if (settingsLocked) settingsLocked.style.display = 'block';
        } else {
            try { localStorage.removeItem('beatZen_session_uid'); } catch (_) { }
            html.classList.remove('bz-signed-in');
            html.classList.add('bz-guest');
            stopUserDocListener();
            bzStopSyncEngine();
            window._bzIsPremium = false;
            try { localStorage.setItem('beatzen_premium', 'false'); } catch (_) { }

            var syncSection2 = document.getElementById('bz-sync-section');
            if (syncSection2) syncSection2.style.display = 'none';
            var settingsLocked2 = document.getElementById('bz-settings-locked');
            if (settingsLocked2) settingsLocked2.style.display = 'none';

            if (typeof window.showBzAuthGate === 'function') window.showBzAuthGate();
        }

        bzRefreshAuthUI();
        if (typeof window.bzSyncProfilePageFromAccountCard === 'function') window.bzSyncProfilePageFromAccountCard();
        if (typeof window.bzLoadProfileJoinedDate === 'function') window.bzLoadProfileJoinedDate();
        if (typeof window.bzApplyPremiumGating === 'function') window.bzApplyPremiumGating();

        if (_authReadyResolve) { _authReadyResolve(); _authReadyResolve = null; }
    });

    /* ── Account card (feeds the Profile page mirror in script.js) ──── */
    function bzRefreshAuthUI() {
        var signedOutCard = document.getElementById('bz-auth-signedout');
        var signedInCard = document.getElementById('bz-auth-signedin');
        var notice = document.getElementById('bz-auth-notice');
        var user = auth.currentUser;

        if (user) {
            if (signedOutCard) signedOutCard.style.display = 'none';
            if (signedInCard) signedInCard.classList.add('bz-auth-visible');
            if (notice) notice.style.display = 'none';

            var nameEl = document.getElementById('bz-auth-name');
            var emailEl = document.getElementById('bz-auth-email');
            var avatarEl = document.getElementById('bz-auth-avatar');
            var syncEl = document.getElementById('bz-sync-status-text');
            var displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'Beat Zen User');

            if (nameEl) nameEl.textContent = displayName;
            if (emailEl) emailEl.textContent = user.email || '';
            if (avatarEl) {
                if (user.photoURL) { avatarEl.src = user.photoURL; avatarEl.style.display = ''; }
                else { avatarEl.removeAttribute('src'); avatarEl.style.display = 'none'; }
            }
            if (syncEl) syncEl.textContent = 'Synced';

            try {
                localStorage.setItem('beatzen_fullName', user.displayName || '');
                localStorage.setItem('beatzen_displayUsername', user.email || '');
                localStorage.setItem('beatzen_photoURL', user.photoURL || '');
            } catch (_) { }
        } else {
            if (signedOutCard) signedOutCard.style.display = '';
            if (signedInCard) signedInCard.classList.remove('bz-auth-visible');
            if (notice) notice.style.display = '';
        }
    }
    window.bzRefreshAuthUI = bzRefreshAuthUI;

    function fetchUserProfile(uid) {
        return db.collection('beatzen_users').doc(uid).get().then(function (doc) {
            return doc.exists ? doc.data() : null;
        });
    }
    window.fetchUserProfile = fetchUserProfile;

    /* ── Friendly error messages ─────────────────────────────────────── */
    function friendlyAuthError(err) {
        switch (err && err.code) {
            case 'auth/email-already-in-use': return 'That email is already registered — try signing in instead.';
            case 'auth/invalid-email': return 'Enter a valid email address.';
            case 'auth/weak-password': return 'Password must be at least 6 characters.';
            case 'auth/user-not-found': return 'No account found with that email.';
            case 'auth/wrong-password': return 'Incorrect password.';
            case 'auth/invalid-credential': return 'Incorrect email or password.';
            case 'auth/too-many-requests': return 'Too many attempts — please wait a moment and try again.';
            case 'auth/network-request-failed': return "Couldn't reach the server — check your connection.";
            default: return (err && err.message) || 'Something went wrong. Please try again.';
        }
    }

    /* ── Gate panel switching ────────────────────────────────────────── */
    function showGatePanel(which) {
        var landing = document.getElementById('bz-gate-landing');
        var signup = document.getElementById('bz-gate-signup-form');
        var signin = document.getElementById('bz-gate-signin-form');
        var forgot = document.getElementById('bz-gate-forgot-form');
        if (landing) landing.style.display = which === 'landing' ? '' : 'none';
        if (signup) signup.style.display = which === 'signup' ? '' : 'none';
        if (signin) signin.style.display = which === 'signin' ? '' : 'none';
        if (forgot) forgot.style.display = which === 'forgot' ? '' : 'none';

        var card = document.querySelector('.bz-gate-card');
        if (card) card.setAttribute('data-active-panel', which === 'landing' ? 'bz-gate-landing' : 'bz-gate-' + which + '-form');

        if (which === 'forgot') showGateForgotStep(1);
    }

    function showGateForgotStep(step) {
        var s1 = document.getElementById('bz-gate-forgot-step1');
        var s2 = document.getElementById('bz-gate-forgot-step2');
        if (s1) s1.style.display = step === 1 ? '' : 'none';
        if (s2) s2.style.display = step === 2 ? '' : 'none';
    }

    function updateGateSigninSubmitState() {
        var email = document.getElementById('bz-gate-si-email');
        var pw = document.getElementById('bz-gate-si-password');
        var btn = document.getElementById('bz-gate-si-submit');
        if (!btn) return;
        var ok = !!(email && email.value.trim() && pw && pw.value);
        btn.disabled = !ok;
        btn.style.opacity = ok ? '' : '0.45';
        btn.style.cursor = ok ? '' : 'not-allowed';
    }

    /* ── Sign up (grants the 2-hour free-access bonus) ───────────────── */
    function handleGateSignup() {
        var nameEl = document.getElementById('bz-gate-su-fullname');
        var emailEl = document.getElementById('bz-gate-su-email');
        var pwEl = document.getElementById('bz-gate-su-password');
        var confirmEl = document.getElementById('bz-gate-su-confirm');
        var errEl = document.getElementById('bz-gate-su-error');
        var btn = document.getElementById('bz-gate-su-submit');

        var name = (nameEl && nameEl.value || '').trim();
        var email = (emailEl && emailEl.value || '').trim().toLowerCase();
        var pw = (pwEl && pwEl.value) || '';
        var confirm = (confirmEl && confirmEl.value) || '';

        function showErr(msg) { if (errEl) { errEl.textContent = msg; errEl.style.display = ''; } }
        if (errEl) errEl.style.display = 'none';

        if (!name) return showErr('Enter your full name.');
        if (!email) return showErr('Enter your email address.');
        if (pw.length < 6) return showErr('Password must be at least 6 characters.');
        if (pw !== confirm) return showErr('Passwords do not match.');

        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Creating Account…'; }

        _bzFreshSignIn = true;
        auth.createUserWithEmailAndPassword(email, pw).then(function (cred) {
            var user = cred.user;
            var expiresAt = Date.now() + SIGNUP_BONUS_HOURS * 3600000;
            return user.updateProfile({ displayName: name }).then(function () {
                return db.collection('beatzen_users').doc(user.uid).set({
                    fullName: name,
                    email: email,
                    premium: true,
                    premiumExpiresAt: expiresAt
                }, { merge: true });
            }).then(function () {
                window._bzIsPremium = true;
                window._bzPremiumExpiresAt = expiresAt;
                window._bzPremiumPlan = 'signup_bonus';
                try {
                    localStorage.setItem('beatzen_premium', 'true');
                    localStorage.setItem('beatzen_premiumExpiresAt', String(expiresAt));
                    localStorage.setItem('beatzen_premiumPlan', 'signup_bonus');
                } catch (_) { }
                if (typeof window.bzApplyPremiumGating === 'function') window.bzApplyPremiumGating();
            });
        }).then(function () {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account'; }
            if (typeof window.showToast === 'function') window.showToast('Welcome to Beat Zen! 24 hours of Premium unlocked.');
            if (typeof window.displayHome === 'function') window.displayHome();
        }).catch(function (err) {
            _bzFreshSignIn = false;
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account'; }
            showErr(friendlyAuthError(err));
        });
    }

    /* ── Sign in ──────────────────────────────────────────────────────── */
    function handleGateSignin() {
        var emailEl = document.getElementById('bz-gate-si-email');
        var pwEl = document.getElementById('bz-gate-si-password');
        var errEl = document.getElementById('bz-gate-si-error');
        var btn = document.getElementById('bz-gate-si-submit');

        var email = (emailEl && emailEl.value || '').trim().toLowerCase();
        var pw = (pwEl && pwEl.value) || '';

        function showErr(msg) { if (errEl) { errEl.textContent = msg; errEl.style.display = ''; } }
        if (errEl) errEl.style.display = 'none';
        if (!email || !pw) return;

        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Signing In…'; }

        _bzFreshSignIn = true;
        auth.signInWithEmailAndPassword(email, pw).then(function () {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In'; }
        }).catch(function (err) {
            _bzFreshSignIn = false;
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In'; }
            updateGateSigninSubmitState();
            showErr(friendlyAuthError(err));
        });
    }

    /* ── Forgot password ─────────────────────────────────────────────── */
    function handleGateForgotPassword() {
        var emailEl = document.getElementById('bz-gate-fp-email');
        var errEl = document.getElementById('bz-gate-fp-error');
        var btn = document.getElementById('bz-gate-fp-submit');
        var email = (emailEl && emailEl.value || '').trim().toLowerCase();

        function showErr(msg) { if (errEl) { errEl.textContent = msg; errEl.style.display = ''; } }
        if (errEl) errEl.style.display = 'none';
        if (!email) return showErr('Enter your email address.');

        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Sending…'; }
        auth.sendPasswordResetEmail(email).then(function () {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reset Link'; }
            showGateForgotStep(2);
        }).catch(function (err) {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reset Link'; }
            showErr(friendlyAuthError(err));
        });
    }

    /* ── Wire up every button once the DOM exists ────────────────────── */
    document.addEventListener('DOMContentLoaded', function () {
        var on = function (id, evt, fn) { var el = document.getElementById(id); if (el) el.addEventListener(evt, fn); };

        // Landing → open a panel (stays inside the gate, doesn't hide it)
        on('bz-gate-signup-btn', 'click', function () { showGatePanel('signup'); });
        on('bz-gate-signin-btn', 'click', function () { showGatePanel('signin'); });

        // Back buttons
        on('bz-gate-signup-back', 'click', function () { showGatePanel('landing'); });
        on('bz-gate-signin-back', 'click', function () { showGatePanel('landing'); });
        on('bz-gate-forgot-back', 'click', function () { showGatePanel('signin'); });

        // Switch-panel links
        on('bz-gate-su-to-si', 'click', function () { showGatePanel('signin'); });
        on('bz-gate-si-to-su', 'click', function () { showGatePanel('signup'); });
        on('bz-gate-si-forgot', 'click', function () { showGatePanel('forgot'); });
        on('bz-gate-fp-to-si', 'click', function () { showGatePanel('signin'); });
        on('bz-gate-fp-goto-si', 'click', function () { showGatePanel('signin'); });

        // Sign-in submit button starts disabled until both fields are filled
        on('bz-gate-si-email', 'input', updateGateSigninSubmitState);
        on('bz-gate-si-password', 'input', updateGateSigninSubmitState);
        updateGateSigninSubmitState();

        // Submits
        on('bz-gate-su-submit', 'click', handleGateSignup);
        on('bz-gate-si-submit', 'click', handleGateSignin);
        on('bz-gate-fp-submit', 'click', handleGateForgotPassword);

        // Pressing Enter inside any sign-up / sign-in field submits that form
        // (these forms aren't wrapped in a <form> tag, so Enter does nothing
        // by default — this wires it up manually).
        function onEnterKey(id, fn) {
            var el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    fn();
                }
            });
        }
        ['bz-gate-su-fullname', 'bz-gate-su-email', 'bz-gate-su-password', 'bz-gate-su-confirm']
            .forEach(function (id) { onEnterKey(id, handleGateSignup); });
        ['bz-gate-si-email', 'bz-gate-si-password']
            .forEach(function (id) { onEnterKey(id, handleGateSignin); });
        onEnterKey('bz-gate-fp-email', handleGateForgotPassword);

        // Block copy / cut / paste on email + password fields for both
        // Sign Up and Sign In (prevents pasting credentials in from
        // elsewhere, and copying them back out).
        function blockCopyPaste(id) {
            var el = document.getElementById(id);
            if (!el) return;
            ['copy', 'cut', 'paste', 'drop'].forEach(function (evt) {
                el.addEventListener(evt, function (e) { e.preventDefault(); return false; });
            });
        }
        ['bz-gate-su-email', 'bz-gate-su-password', 'bz-gate-su-confirm', 'bz-gate-si-email', 'bz-gate-si-password']
            .forEach(blockCopyPaste);

        // Sign out (Settings account card + Profile page)
        on('bz-google-signout-btn', 'click', function () { auth.signOut(); });
        on('bz-profile-signout-btn', 'click', function () { auth.signOut(); });
    });

})();
