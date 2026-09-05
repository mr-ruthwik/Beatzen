// Beat Zen

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyDdUpkeGD-imTIpiU4tSDUannXS0hIQr1w",
    // authDomain: Always use the default Firebase auth domain.
    authDomain: 'beatzen-e1112.firebaseapp.com',
    projectId: "beatzen-e1112",
    storageBucket: "beatzen-e1112.firebasestorage.app",
    messagingSenderId: "556167519281",
    appId: "1:556167519281:web:3c1fd3a58aa89802688910"
};

// SDK guard
if (typeof firebase === 'undefined') {
    throw new Error(
        '[BeatZen] Firebase SDK not loaded. ' +
        'auth.js must appear AFTER the three firebase-compat <script> tags in index.html ' +
        'and all four must carry the defer attribute.'
    );
}

// Init
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// Firestore network control
(function bzFirestoreNetworkControl() {
    function disableFS() { try { db.disableNetwork(); } catch (_) { } }
    function enableFS() { try { db.enableNetwork(); } catch (_) { } }
    window.addEventListener('offline', disableFS);
    window.addEventListener('online', enableFS);
    if (!navigator.onLine) disableFS();
})();

// Persistence: keep Google session alive across refreshes on ALL
(function applyAuthPersistence() {
    try {
        auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function (e) {
            console.warn('[BeatZen] setPersistence failed (non-critical):', e.code);
        });
    } catch (e) {
        console.warn('[BeatZen] setPersistence not available:', e.message);
    }
})();

// Background-sync audio protection
let _isSyncingInBackground = false;
let _audioStateBeforeSync = null;

function _bzRestoreAudio(audioEl, wasPlaying, time, rate, savedSrc) {
    if (!audioEl || !wasPlaying) return;
    try {
        // FIX (currently-playing-song bug): a merge that ran between
        if (savedSrc && audioEl.src !== savedSrc) return;
        if (audioEl.paused) {
            audioEl.currentTime = time || 0;
            audioEl.playbackRate = rate || 1;
            const p = audioEl.play();
            if (p !== undefined) p.catch(() => { });
        }
    } catch (_) { }
}

function _bzSaveAudioState() {
    const audioEl = document.getElementById('audio-player');
    return {
        el: audioEl,
        wasPlaying: !!(audioEl && !audioEl.paused && audioEl.currentTime > 0 && !audioEl.ended),
        time: audioEl?.currentTime || 0,
        rate: audioEl?.playbackRate || 1,
        // Remembered so _bzRestoreAudio can detect a mid-flight song swap
        src: audioEl?.src || ''
    };
}

// Local-storage keys to sync
const SYNC_KEYS = [
    // Preferences
    'beatzen_dark_mode',
    'beatzen_shortcuts',
    'beatZen_shuffle',
    'beatZen_loop',
    'beatzen_automix',
    'beatzen_history',              // history enabled/disabled toggle
    'beatZen_volume',               // volume level follows user across devices
    'beatZen_activeView',           // last active tab restores on any device
    // Scheduled Dark Mode ── all 5 keys sync so the full schedule
    'beatzen_schedule_dm_set',      // whether a schedule is currently active
    'beatzen_schedule_dm_enabled',  // the scheduled-DM on/off master toggle
    'beatzen_schedule_dm_days',     // JSON array of days e.g. [1,3,5] or ['daily']
    'beatzen_schedule_dm_on',       // schedule ON time as 'HH:MM' (24-hour)
    'beatzen_schedule_dm_off',      // schedule OFF time as 'HH:MM' (24-hour)
    // Search
    'beatZen_recentSearches',
    'beatZen_recentSearchesEnabled',
    // History + Signals
    'beatZen_history_auto',
    'beatZen_signals',
    'beatZen_rr_plays',             // Repeat Rewind qualifying plays (≥10 s listens, ≥3 = enters RR)
    // Player state
    'beatZen_currentSongTitle',
    'beatZen_currentSongArtist',
    'beatZen_currentSongCover',
    // lastPlayedSong / beatZen_lastPosition
    'lastPlayedSong',
    'beatZen_lastPosition',
    // Heavy/large fields
    'beatZen_importedPlaylists',
    'beatZen_queueState',
    'beatZen_favourites',
];

// Fields removed from sync
const PURGE_KEYS = [
    '_username',                   // no longer written — purge from old Firestore docs
    '_connectionType',             // old field — removed
    // Device-specific fields removed — storage is now purely account-based
    '_deviceId',
    '_deviceType',
    '_browserName',
    '_onlineStatus',
    '_devices',                    // entire devices map — no longer used
    // NOTE: Flat dot-notation device fields like
    'beatZen_currentSong',
    'beatZen_currentAlbum',
    'beatZen_currentAlbumName',
    'beatZen_currentIndex',
    'beatZen_currentTime',
    // Old Firestore field names for the 3 heavy fields
    'beatZen_importedPlaylists',
    'beatZen_queueState',
    'beatZen_favourites',
    // z_lastPlayedSong
    'z_lastPlayedSong',
];

// Two-tier sync split
const PLAYBACK_STATE_KEYS = new Set([
    'beatZen_queueState',
    'lastPlayedSong',
    'beatZen_lastPosition',
]);

// Account-based echo guard

// Player-state keys
const PLAYER_STATE_KEYS = [
    'lastPlayedSong',
    'beatZen_lastPosition',
    'beatZen_currentSong',
    'beatZen_currentAlbum',
    'beatZen_currentAlbumName',
    'beatZen_currentIndex',
    'beatZen_currentTime',
    'beatZen_currentSongTitle',
    'beatZen_currentSongArtist',
    'beatZen_currentSongCover',
    'beatZen_queueState',          // FIX 2: stale queue must never bleed to next user
];

// Wipes every player-related localStorage key
function clearPlayerState() {
    // 1. Remove all player localStorage keys
    PLAYER_STATE_KEYS.forEach(k => localStorage.removeItem(k));

    // 2. Stop audio playback immediately.
    const audioEl = document.getElementById('audio-player');
    if (audioEl) {
        audioEl.pause();
        audioEl.currentTime = 0;
        // Remove the src so the browser stops buffering the signed-out user's
        try { audioEl.removeAttribute('src'); audioEl.load(); } catch (_) { }
    }

    // 3. Reset ALL playback-mode settings to OFF. Shuffle
    localStorage.setItem('beatZen_shuffle', 'false');
    localStorage.setItem('beatZen_loop', 'false');
    localStorage.setItem('beatZen_repeat_mode', '0');
    localStorage.setItem('beatzen_automix', 'false');

    window.isShuffling = false;
    window.isLooping = false;
    window.repeatMode = 0;
    window.shuffledIndices = null;  // discard any active shuffled order

    // Flip the shuffle / loop button highlight states back to inactive.
    if (typeof window.syncPlaybackModesUI === 'function') {
        window.syncPlaybackModesUI();
    }

    // Uncheck the Auto-Mix toggle if it is currently in the DOM.
    const autoMixToggle = document.getElementById('automix-toggle');
    if (autoMixToggle) autoMixToggle.checked = false;

    // 4. Clear the OS media session so the signed-out user's song
    if ('mediaSession' in navigator) {
        try {
            navigator.mediaSession.metadata = null;
            navigator.mediaSession.playbackState = 'none';
        } catch (_) { }
    }

    // 5. Cancel any pending history-record timer so the signed-out user's
    if (window._bzHistoryTimer) {
        clearTimeout(window._bzHistoryTimer);
        window._bzHistoryTimer = null;
    }
    window._bzHistoryPending = null;
    window._bzRestoreOnReady = false;

    // 6. Reset the browser-tab title back to the app name.
    document.title = 'Beat Zen';

    // 7. Reset in-memory globals so _tryRestoreSession
    window.playingAlbum = null;
    window.currentSongIndex = -1;

    // 8. Restore the player bar to its HTML defaults.
    const titleEl = document.getElementById('player-song-title');
    const artistEl = document.getElementById('player-song-artist');
    const coverEl = document.getElementById('player-album-cover');
    if (titleEl) titleEl.textContent = 'Select a song to play';
    if (artistEl) artistEl.textContent = '';
    if (coverEl) coverEl.src =
        'https://res.cloudinary.com/beatzenapp/image/upload/v1782654641/Logo_kmpfjf.jpg';
}

// AUTO_SYNC_KEY ('beatzen_autosync') retired

// DOM helper
const $ = id => document.getElementById(id);

// Panel toggle
function showSignedOut() {
    // Remove the fast-path class so the CSS overrides from index.html <head>
    document.documentElement.classList.remove('bz-signed-in');
    // Re-apply guest mode so navbar/player/main content are hidden
    document.documentElement.classList.add('bz-guest');
    const out = $('bz-auth-signedout');
    const inn = $('bz-auth-signedin');
    // bz-auth-signedout defaults to display:none in HTML
    if (out) out.style.display = 'block';
    if (inn) inn.classList.remove('bz-auth-visible');
    // Hide cloud sync controls and all settings features until signed in
    const syncSec = $('bz-sync-section');
    if (syncSec) syncSec.style.display = 'none';
    const locked = $('bz-settings-locked');
    if (locked) locked.style.display = 'none';
    // Show the auth gate overlay
    const gate = $('bz-auth-gate');
    if (gate) gate.classList.add('bz-gate-visible');
    // Ensure loader is hidden so the auth gate is visible
    const _loaderEl = document.getElementById('bz-loader-overlay');
    if (_loaderEl) _loaderEl.classList.add('bz-loader-hidden');
}

function showSignedIn() {
    document.documentElement.classList.add('bz-signed-in');
    // Remove guest mode — reveals navbar, player, and main content
    document.documentElement.classList.remove('bz-guest');
    const out = $('bz-auth-signedout');
    const inn = $('bz-auth-signedin');
    if (out) out.style.display = 'none';
    if (inn) inn.classList.add('bz-auth-visible');
    // Reveal cloud sync controls and all settings features
    const syncSec = $('bz-sync-section');
    if (syncSec) syncSec.style.display = '';
    const locked = $('bz-settings-locked');
    if (locked) locked.style.display = '';
    // FIX: Always hide the auth gate when signed in.
    const gate = $('bz-auth-gate');
    if (gate) {
        gate.classList.remove('bz-gate-visible');
    }
    // Refresh toggle state
    syncAutoSyncUI();
}

// Toast — Delegates to window.showToast (script.js) when available
function bzToast(msg, type = 'success') {
    if (typeof window.showToast === 'function') {
        window.showToast(msg);
        return;
    }

    const container = document.getElementById('toast-container');
    if (!container) return;

    // Type → visual mapping
    const MAP = {
        success: {
            icon: 'fa-circle-check',
            bg: 'linear-gradient(135deg,#1db954,#1ed760)',
            border: 'rgba(29,185,84,0.45)',
            glow: 'rgba(29,185,84,0.12)',
            label: 'Done',
            color: '#6bcb77',
        },
        warning: {
            icon: 'fa-triangle-exclamation',
            bg: 'linear-gradient(135deg,#f59e0b,#d97706)',
            border: 'rgba(245,158,11,0.45)',
            glow: 'rgba(245,158,11,0.12)',
            label: 'Notice',
            color: '#fde68a',
        },
        danger: {
            icon: 'fa-circle-xmark',
            bg: 'linear-gradient(135deg,#c0392b,#e74c3c)',
            border: 'rgba(231,76,60,0.45)',
            glow: 'rgba(231,76,60,0.12)',
            label: 'Error',
            color: '#ff8a80',
        },
    };

    // Override label to be more descriptive for known sync messages
    let { icon, bg, border, glow, label, color } = MAP[type] || MAP.warning;
    if (/auto.?sync/i.test(msg)) {
        label = isAutoSyncOn() ? 'Auto Sync On' : 'Auto Sync Off';
    } else if (/cloud|upload|download/i.test(msg)) {
        label = 'Cloud Sync';
    } else if (/sign.?in|sign.?out|account/i.test(msg)) {
        label = 'Account';
    } else if (/restor/i.test(msg)) {
        label = 'Data Restored';
    } else if (/saved|upload/i.test(msg)) {
        label = 'Saved to Cloud';
    }

    const cleanMsg = msg.replace(/^[✓✦]\s*/, '').trim();
    const duration = 5000;

    const toast = document.createElement('div');
    toast.className = 'bz-generic-toast';
    toast.innerHTML = `
        <div class="bz-rr-icon-wrap" style="background:${bg};box-shadow:0 4px 14px ${glow.replace('0.12', '0.5')};">
            <i class="fas ${icon}" style="color:#fff;font-size:15px;"></i>
        </div>
        <div class="bz-rr-text">
            <span class="bz-rr-label" style="color:${color};">${label}</span>
            <span class="bz-rr-sub">${cleanMsg}</span>
        </div>
        <button class="bz-toast-close" aria-label="Close">
            <i class="fas fa-xmark"></i>
        </button>
        <div class="bz-toast-progress" style="--toast-duration:${duration}ms;background:${color};"></div>`;

    toast.style.cssText = `border-color:${border};box-shadow:0 8px 32px rgba(0,0,0,0.55),0 0 0 1px ${glow};`;

    container.appendChild(toast);

    requestAnimationFrame(() => requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0) scale(1)';
        const bar = toast.querySelector('.bz-toast-progress');
        if (bar) bar.classList.add('bz-toast-progress--running');
    }));

    function dismiss() {
        clearTimeout(timer);
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px) scale(0.96)';
        setTimeout(() => toast.remove(), 300);
    }

    const timer = setTimeout(dismiss, duration);

    toast.querySelector('.bz-toast-close').addEventListener('click', e => {
        e.stopPropagation();
        dismiss();
    });

    toast.addEventListener('click', dismiss, { once: true });
}

// Timestamp formatter
function fmtTimestamp(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    // Compact: "6 Jun 12:07 pm" — no comma, no leading zero on hour
    const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    return date + ' ' + time;
}

// Plain-string version of fmtTimestamp
function fmtDateString(ts) {
    if (!ts) return '';
    try {
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        if (isNaN(d.getTime())) return String(ts);
        const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
        return date + ', ' + time;
    } catch (_) { return String(ts); }
}

function updateSyncStatusUI(ts) {
    const el = $('bz-sync-status-text');
    if (!el) return;
    if (ts) {
        el.innerHTML = `<i class="fas fa-check bz-sync-tick"></i><span class="bz-sync-label">Synced</span><span class="bz-sync-sep"> · </span><span class="bz-sync-time">${fmtTimestamp(ts)}</span>`;
    } else if (!navigator.onLine) {
        el.innerHTML = `<i class="fas fa-cloud bz-sync-tick bz-sync-offline-icon"></i><span class="bz-sync-label bz-sync-offline">Offline — sync resumes when connected</span>`;
    } else {
        el.innerHTML = `<span class="bz-sync-label bz-sync-none">Not synced yet</span>`;
    }
}

function setButtonLoading(btn, loading, icon, label) {
    if (!btn) return;
    btn.disabled = loading;
    btn.innerHTML = loading
        ? `<i class="fas fa-spinner fa-spin"></i> ${label}…`
        : `<i class="fas ${icon}"></i> ${label}`;
}

// AutoMix-aware restore-target resolver
function _bzResolveRestoreTarget(pa, ci, liveSong) {
    const srcAlbumMeta = window.allSongsMap?.get(String(liveSong.id))?.album
        || liveSong._sourceAlbum || pa;
    const isAutoMix = !!liveSong._autoMix;
    // If masterPool isn't populated
    const playingAlbumInMasterPool = !Array.isArray(window.masterPool) || window.masterPool.some(a =>
        String(a?.id ?? '') === String(pa.id) ||
        String(a?.name ?? '') === String(pa.id) ||
        String(a?.title ?? '') === String(pa.id)
    );
    const useSourceAlbumForRestore = isAutoMix || !playingAlbumInMasterPool;
    const restoreAlbum = useSourceAlbumForRestore ? srcAlbumMeta : pa;
    // When falling back to the source album
    return {
        albumId: String(restoreAlbum?.id || restoreAlbum?.name || restoreAlbum?.title || pa.id),
        songIndex: useSourceAlbumForRestore ? 0 : ci,
        type: restoreAlbum?.type || pa.type,
        isAutoMix,
        srcAlbumMeta
    };
}

// Data helpers
function gatherLocalData() {
    // 1. Identity block
    const _bzNow = Date.now();
    const payload = { _version: 1, _savedAt: _bzNow };
    // Store _savedAt locally so startLiveListener can detect our own write
    try { localStorage.setItem('_bz_lastSavedAt', String(_bzNow)); } catch (_) { }

    try {
        const _cu = auth.currentUser;
        if (_cu) {
            // _uid and _email mirror what callers used to add separately
            payload._uid = _cu.uid || '';
            payload._email = _cu.email
                || _cu.providerData?.[0]?.email
                || '';
            payload._displayName = _cu.displayName
                || localStorage.getItem('beatzen_fullName')
                || localStorage.getItem('beatzen_displayUsername')
                || '';
            payload._userEmail = _cu.email
                || _cu.providerData?.[0]?.email
                || '';
            payload._photoURL = _cu.photoURL || '';
            payload._lastSignInAt = _cu.metadata?.lastSignInTime ? fmtDateString(_cu.metadata.lastSignInTime) : '';
        }
    } catch (_) { /* best effort — never block sync */ }

    // 1b. Usage analytics
    try {
        let histList = [];
        try { histList = JSON.parse(localStorage.getItem('beatZen_history_auto') || '[]'); } catch (_) { }

        // _totalSongsPlayed — total play events recorded in history
        payload._totalSongsPlayed = histList.length;

        // _totalListenMinutes
        let totalSecs = 0;
        histList.forEach(entry => {
            const dur = String(entry.duration || '').trim();
            if (!dur) return;
            const parts = dur.split(':').map(Number);
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                totalSecs += parts[0] * 60 + parts[1];          // m:ss
            } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
                totalSecs += parts[0] * 3600 + parts[1] * 60 + parts[2]; // h:mm:ss
            }
        });
        payload._totalListenMinutes = Math.round(totalSecs / 60);

        // _topArtist — artist field most frequent in history
        const artistFreq = {};
        histList.forEach(e => {
            const a = (e.artist || '').trim();
            if (a) artistFreq[a] = (artistFreq[a] || 0) + 1;
        });
        const topArtistEntry = Object.entries(artistFreq).sort((a, b) => b[1] - a[1])[0];
        payload._topArtist = topArtistEntry ? topArtistEntry[0] : '';

        // _topMovie — albumTitle most frequent in history
        const movieFreq = {};
        histList.forEach(e => {
            const m = (e.albumTitle || e.sourceName || '').trim();
            if (m) movieFreq[m] = (movieFreq[m] || 0) + 1;
        });
        const topMovieEntry = Object.entries(movieFreq).sort((a, b) => b[1] - a[1])[0];
        payload._topMovie = topMovieEntry ? topMovieEntry[0] : '';

        // _peakListenHour
        const hourFreq = {};
        histList.forEach(e => {
            if (!e.playedAt) return;
            const h = new Date(e.playedAt).getHours();
            if (!isNaN(h)) hourFreq[h] = (hourFreq[h] || 0) + 1;
        });
        const peakHourEntry = Object.entries(hourFreq).sort((a, b) => b[1] - a[1])[0];
        if (peakHourEntry) {
            const h = parseInt(peakHourEntry[0], 10);
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 === 0 ? 12 : h % 12;
            payload._peakListenHour = `${h12}:00 ${ampm}`;
        } else {
            payload._peakListenHour = '';
        }
    } catch (_) { /* analytics failure must never block sync */ }

    // 1c. No device-specific fields stored All data is account-based. Device

    // 2. Snapshot live player state into localStorage before reading
    try {
        const audioEl = document.getElementById('audio-player');
        // FIX 1: Save position for any finite time > 0 (not > 1)
        if (audioEl && isFinite(audioEl.currentTime) && audioEl.currentTime > 0) {
            const _curSong = window.playingAlbum?.songs?.[window.currentSongIndex];
            localStorage.setItem('beatZen_lastPosition', JSON.stringify({
                t: audioEl.currentTime,
                d: isFinite(audioEl.duration) && audioEl.duration > 0 ? audioEl.duration : undefined,
                id: _curSong?.id != null ? String(_curSong.id) : ''
            }));
        }
        const ci = window.currentSongIndex;
        const pa = window.playingAlbum;
        if (pa && pa.songs && typeof ci === 'number' && ci >= 0) {
            const liveSong = pa.songs[ci];
            if (liveSong && liveSong.id) {
                // FIX 2: Always rewrite lastPlayedSong
                const _restoreTarget = _bzResolveRestoreTarget(pa, ci, liveSong);
                // FIX: carry forward url/duration from the live song object
                localStorage.setItem('lastPlayedSong', JSON.stringify({
                    albumId: _restoreTarget.albumId,
                    songIndex: _restoreTarget.songIndex,
                    songId: String(liveSong.id),
                    type: _restoreTarget.type,
                    isAutoMix: _restoreTarget.isAutoMix,
                    title: liveSong.title || '',
                    artist: liveSong.artist || '',
                    cover: _restoreTarget.srcAlbumMeta?.imageUrl || _restoreTarget.srcAlbumMeta?.albumCover || '',
                    url: liveSong.url || '',
                    duration: liveSong.duration || '',
                    savedAt: Date.now()
                }));
            }
        }
    } catch (_) { /* best effort */ }

    // 3. All SYNC_KEYS in declared order SYNC_KEYS is ordered
    const _BZ_FIELD_REMAP = {
        'beatZen_importedPlaylists': 'z_importedPlaylists',
        'beatZen_queueState': 'z_queueState',
        'beatZen_favourites': 'z_favourites',
        'beatZen_history_auto': 'z_history',
        'beatZen_signals': 'z_signals',
        'beatZen_rr_plays': 'z_rr_plays',   // Repeat Rewind qualifying plays
    };
    SYNC_KEYS.forEach(key => {
        const fsKey = _BZ_FIELD_REMAP[key] || key; // Firestore field name (may differ from localStorage key)
        if (key === 'beatZen_history_auto') {
            // Cap at 100 entries before uploading
            try {
                const _hist = JSON.parse(localStorage.getItem(key) || '[]');
                const _histCapped = Array.isArray(_hist) ? _hist.slice(0, 100) : [];
                payload[fsKey] = JSON.stringify(_histCapped);
            } catch (_) {
                const val = localStorage.getItem(key);
                if (val !== null) payload[fsKey] = val;
            }
        } else if (key === 'beatZen_signals') {
            // Cap at 500 signals
            try {
                const _sigs = JSON.parse(localStorage.getItem(key) || '[]');
                const _sigsCapped = Array.isArray(_sigs) ? _sigs.slice(0, 500) : [];
                payload[fsKey] = JSON.stringify(_sigsCapped);
            } catch (_) {
                const val = localStorage.getItem(key);
                if (val !== null) payload[fsKey] = val;
            }
        } else if (key === 'beatZen_rr_plays') {
            // Cap at 500 entries
            try {
                const _rr = JSON.parse(localStorage.getItem(key) || '[]');
                const _rrCapped = Array.isArray(_rr) ? _rr.slice(0, 500) : [];
                payload[fsKey] = JSON.stringify(_rrCapped);
            } catch (_) {
                const val = localStorage.getItem(key);
                if (val !== null) payload[fsKey] = val;
            }
        } else if (key === 'beatZen_favourites') {
            // Store only song IDs (not full objects) to keep Firestore small.
            try {
                const _favs = JSON.parse(localStorage.getItem(key) || '[]');
                const _slim = _favs.map(s =>
                    typeof s === 'string' ? s : String(s.id || s.title || '')
                ).filter(Boolean);
                payload[fsKey] = JSON.stringify(_slim);
            } catch (_) {
                const val = localStorage.getItem(key);
                if (val !== null) payload[fsKey] = val;
            }
        } else {
            const val = localStorage.getItem(key);
            if (val !== null) payload[fsKey] = val;
        }
    });

    return payload;
}

// Helper: is the CLOUD's playback state actually newer than ours?
function _bzCloudPlaybackIsFresher(cloudData) {
    try {
        let cloudSavedAt = 0;
        const cloudRaw = cloudData && cloudData.lastPlayedSong;
        if (cloudRaw) {
            const cloudParsed = typeof cloudRaw === 'string' ? JSON.parse(cloudRaw) : cloudRaw;
            cloudSavedAt = parseInt(cloudParsed?.savedAt, 10) || 0;
        }
        let localSavedAt = 0;
        const localRaw = localStorage.getItem('lastPlayedSong');
        if (localRaw) {
            const localParsed = JSON.parse(localRaw);
            localSavedAt = parseInt(localParsed?.savedAt, 10) || 0;
        }
        return cloudSavedAt > localSavedAt;
    } catch (_) {
        // Can't compare
        return true;
    }
}

// Shared restore trigger
function _bzTriggerPlaybackRestore() {
    if (window._bzMobileState) window._bzMobileState.restored = false;
    window._bzRestoreOnReady = false;
    restoreLastPlayedSong();
    [150, 700, 1500].forEach(delay => {
        setTimeout(() => {
            try { if (typeof window.restoreMobileSession === 'function') window.restoreMobileSession(); }
            catch (_) { /* best effort */ }
        }, delay);
    });
}

// Helper: is this device actively playing audio?
function _bzIsActivelyPlaying() {
    try {
        const audio = document.getElementById('audio-player')
            || document.querySelector('audio');
        if (audio && !audio.paused && audio.currentTime > 0 && !audio.ended) return true;

        // FIX (audio-focus interruption bug): opening another app
        if (window._bzExternallyInterrupted && Date.now() - (window._bzInterruptedAt || 0) < 5 * 60 * 1000) {
            return true;
        }
        return false;
    } catch (_) { return false; }
}

// Tier-1 merge: preferences only (always safe to apply silently) Applies
function mergeCloudDataPrefsOnly(data) {
    _applyCloudKeys(data, key => !PLAYBACK_STATE_KEYS.has(key));
    _applyInMemoryPrefs();
}

// Tier-2 merge: everything, including playback state
function mergeCloudData(data) {
    _applyCloudKeys(data, () => true);  // all SYNC_KEYS
    _applyInMemoryPrefs();

    // FIX Issue 18: restoreLastPlayedSong() is intentionally NOT called here
}

// Shared key-writer used by both merge functions
function _applyCloudKeys(data, shouldApply) {
    // Same remap used in gatherLocalData
    const _BZ_FIELD_REMAP = {
        'beatZen_importedPlaylists': 'z_importedPlaylists',
        'beatZen_queueState': 'z_queueState',
        'beatZen_favourites': 'z_favourites',
        'beatZen_history_auto': 'z_history',
        'beatZen_signals': 'z_signals',
        'beatZen_rr_plays': 'z_rr_plays',   // Repeat Rewind qualifying plays
    };
    SYNC_KEYS.forEach(key => {
        // Two-tier filter: caller passes a predicate so playback-state keys
        if (!shouldApply(key)) return;
        const fsKey = _BZ_FIELD_REMAP[key] || key; // Firestore field to read from
        // Support both new z_ name and old plain name
        const cloudVal = Object.prototype.hasOwnProperty.call(data, fsKey) ? data[fsKey]
            : Object.prototype.hasOwnProperty.call(data, key) ? data[key]
                : undefined;
        if (cloudVal == null) return;

        if (key === 'beatZen_favourites') {
            // Cloud stores slim IDs; expand back to full objects via allSongsMap.
            try {
                const _ids = JSON.parse(cloudVal);
                if (!Array.isArray(_ids)) { localStorage.setItem(key, cloudVal); return; }
                const _map = window.allSongsMap;
                const _expanded = _ids.map(function (id) {
                    if (typeof id !== 'string') return null;
                    var song = _map && _map.get(id);
                    return song ? Object.assign({}, song) : { id: id, title: id };
                }).filter(Boolean);
                localStorage.setItem(key, JSON.stringify(_expanded));
            } catch (_) {
                localStorage.setItem(key, cloudVal);
            }
        } else {
            localStorage.setItem(key, cloudVal);
        }
    });
}

// Apply in-memory preference state after any cloud merge
function _applyInMemoryPrefs() {
    // FIX 4: Apply in-memory settings immediately after writing
    try {
        // Shuffle / loop — both the in-memory flag and the UI button highlight
        window.isShuffling = localStorage.getItem('beatZen_shuffle') === 'true';
        window.isLooping = localStorage.getItem('beatZen_loop') === 'true';
        if (typeof window.syncPlaybackModesUI === 'function') {
            window.syncPlaybackModesUI();
        }
    } catch (_) { /* best effort */ }

    try {
        // Auto-mix toggle — must reflect the restored cloud value in the DOM
        const autoMixToggle = document.getElementById('automix-toggle');
        if (autoMixToggle) {
            autoMixToggle.checked = localStorage.getItem('beatzen_automix') === 'true';
        }
    } catch (_) { /* best effort */ }

    try {
        // Dark mode — apply the cloud preference immediately
        const darkOn = localStorage.getItem('beatzen_dark_mode') === 'true';
        document.body.classList.toggle('dark-mode', darkOn);
        // If the app exposes a global dark-mode sync helper, call it
        if (typeof window.bzApplyDarkMode === 'function') {
            window.bzApplyDarkMode(darkOn);
        }
    } catch (_) { /* best effort */ }

    // FIX 4 (continued): After writing keys to localStorage
    setTimeout(() => {
        try {
            // Rebuild masterPool so imported playlists and smart playlists both
            if (typeof window._bzRebuildPlaylistUI === 'function') window._bzRebuildPlaylistUI();
            if (typeof window.renderPlaylists === 'function') window.renderPlaylists();
            else if (typeof window._bzPlaylistsRender === 'function') {
                const wrap = document.getElementById('bz-smart-playlists-wrap')
                    || document.getElementById('playlists-container');
                if (wrap) window._bzPlaylistsRender(wrap);
            }
        } catch (_) { /* best effort */ }
    }, 300);

    // Re-apply Scheduled Dark Mode settings from cloud
    try {
        if (typeof window.bzReinitScheduledDarkMode === 'function') {
            window.bzReinitScheduledDarkMode();
        }
    } catch (_) { /* best effort */ }

    // Re-apply Update Center "New" badge state from cloud
    try {
        if (typeof window._bzResetDynCache === 'function') {
            window._bzResetDynCache();
        } else if (typeof window.bzNotifRefresh === 'function') {
            window.bzNotifRefresh();
        }
    } catch (_) { /* best effort */ }
}

// Live Sync

let _uploadDebounceTimer = null;
const UPLOAD_DEBOUNCE_MS = 1000; // coalesce rapid changes into one write

async function silentUploadToCloud() {
    const user = auth.currentUser;
    if (!user) return;
    const _audio = _bzSaveAudioState();
    try {
        const payload = gatherLocalData();
        payload._uploadedAt = firebase.firestore.FieldValue.serverTimestamp();
        payload._uploadedAtFormatted = fmtDateString(new Date());
        await db.collection('beatzen_sync').doc(user.uid).set(payload, { merge: true });
        _bzRestoreAudio(_audio.el, _audio.wasPlaying, _audio.time, _audio.rate, _audio.src);

        // Step 1: Purge known removed/renamed fields
        const purgePayload = {};
        PURGE_KEYS.forEach(k => { purgePayload[k] = firebase.firestore.FieldValue.delete(); });
        await db.collection('beatzen_sync').doc(user.uid).update(purgePayload).catch(() => { });

        // Step 2: Purge orphaned flat dot-notation device fields
        try {
            const snap = await db.collection('beatzen_sync').doc(user.uid).get();
            if (snap.exists) {
                const docFields = Object.keys(snap.data() || {});
                // Collect any field that looks like an old device-tracking key: • starts
                const DEVICE_FIELD_PREFIXES = ['_devices.', 'bz_'];
                const DEVICE_EXACT_KEYS = new Set(['_onlineStatus', '_deviceId', '_deviceType', '_browserName', '_connectionType']);
                const orphans = docFields.filter(f =>
                    DEVICE_EXACT_KEYS.has(f) ||
                    DEVICE_FIELD_PREFIXES.some(prefix => f.startsWith(prefix))
                );
                if (orphans.length > 0) {
                    // FieldPath is required to delete fields whose names contain dots
                    const deepPurge = {};
                    orphans.forEach(f => {
                        deepPurge[f] = firebase.firestore.FieldValue.delete();
                    });
                    // Use a Firestore DocumentReference update with FieldPath objects
                    const ref = db.collection('beatzen_sync').doc(user.uid);
                    const hasDot = orphans.some(f => f.includes('.'));
                    if (hasDot) {
                        // Build an update with explicit FieldPath for dotted keys
                        const updateArgs = {};
                        orphans.forEach(f => {
                            if (f.includes('.')) {
                                // firebase.firestore.FieldPath escapes the key so dots
                                updateArgs[f] = firebase.firestore.FieldValue.delete();
                            } else {
                                updateArgs[f] = firebase.firestore.FieldValue.delete();
                            }
                        });
                        // Use the low-level updateDoc approach: pass an array of alternating
                        const dottedFields = orphans.filter(f => f.includes('.'));
                        const plainFields = orphans.filter(f => !f.includes('.'));
                        // Delete plain (no-dot) fields together
                        if (plainFields.length) {
                            const plainPurge = {};
                            plainFields.forEach(f => { plainPurge[f] = firebase.firestore.FieldValue.delete(); });
                            await ref.update(plainPurge).catch(() => { });
                        }
                        // Delete each dotted field individually using FieldPath
                        for (const f of dottedFields) {
                            await ref.update(
                                new firebase.firestore.FieldPath(f),
                                firebase.firestore.FieldValue.delete()
                            ).catch(() => { });
                        }
                    } else {
                        await ref.update(deepPurge).catch(() => { });
                    }
                    console.warn('[BeatZen Sync] Purged', orphans.length, 'orphaned device field(s):', orphans);
                }
            }
        } catch (_purgeErr) {
            // Non-critical
            console.warn('[BeatZen Sync] Deep device-field purge skipped:', _purgeErr.message);
        }

        const snap = await db.collection('beatzen_sync').doc(user.uid).get();
        updateSyncStatusUI(snap.data()?._uploadedAt);
    } catch (err) {
        console.warn('[BeatZen Sync] Upload failed:', err.code, err.message);
        _bzRestoreAudio(_audio.el, _audio.wasPlaying, _audio.time, _audio.rate, _audio.src);
    }
}

// Debounced upload
function bzScheduleUpload() {
    if (!isAutoSyncOn()) return; // manual-only mode — don't auto-write
    if (_uploadDebounceTimer) clearTimeout(_uploadDebounceTimer);
    _uploadDebounceTimer = setTimeout(() => {
        _uploadDebounceTimer = null;
        silentUploadToCloud();
    }, UPLOAD_DEBOUNCE_MS);
}

// onSnapshot live listener
let _liveListenerUnsubscribe = null;
let _liveListenerSkipNext = false; // skip the echo of our own write

function startLiveListener(uid) {
    stopLiveListener();
    _liveListenerUnsubscribe = db.collection('beatzen_sync').doc(uid)
        .onSnapshot(snap => {
            if (!snap.exists) return;
            if (!auth.currentUser) return;

            // Skip the immediate echo of our own write
            if (_liveListenerSkipNext) {
                _liveListenerSkipNext = false;
                return;
            }

            const data = snap.data();
            // Echo guard
            const remoteSavedAt = data?._savedAt;
            const localSavedAt = parseInt(localStorage.getItem('_bz_lastSavedAt') || '0', 10);
            if (remoteSavedAt && remoteSavedAt === localSavedAt) return;

            // Capture audio state before any merge touches the DOM
            const _audio = _bzSaveAudioState();
            _isSyncingInBackground = true;

            try {
                // Two-tier merge
                if (_bzIsActivelyPlaying()) {
                    mergeCloudDataPrefsOnly(data);
                } else if (_bzCloudPlaybackIsFresher(data)) {
                    mergeCloudData(data);
                    _bzTriggerPlaybackRestore();
                } else {
                    // FIX
                    mergeCloudDataPrefsOnly(data);
                }
                updateSyncStatusUI(data?._uploadedAt);
            } finally {
                _isSyncingInBackground = false;
                // Restore audio if it was playing before the merge ran
                _bzRestoreAudio(_audio.el, _audio.wasPlaying, _audio.time, _audio.rate, _audio.src);
            }
        }, err => {
            console.warn('[BeatZen LiveSync] Listener error:', err.code);
        });
}

function stopLiveListener() {
    if (_liveListenerUnsubscribe) {
        _liveListenerUnsubscribe();
        _liveListenerUnsubscribe = null;
    }
}

// Boot-sync completion counter
window._bzBootSyncCompletedCount = 0;
function _bzWaitForBootSyncSettle(sinceCount, maxWaitMs) {
    return new Promise(function (resolve) {
        const deadline = Date.now() + maxWaitMs;
        (function poll() {
            if ((window._bzBootSyncCompletedCount || 0) > sinceCount) return resolve();
            if (Date.now() >= deadline) return resolve(); // safety timeout — never hang the UI
            setTimeout(poll, 40);
        })();
    });
}

// bzBootSync
async function bzBootSync(isFreshSignIn) {
    const user = auth.currentUser;
    if (!user) return;
    if (!isAutoSyncOn()) {
        // Auto-sync off — just open the live listener; no upload/download.
        startLiveListener(user.uid);
        window._bzBootSyncCompletedCount = (window._bzBootSyncCompletedCount || 0) + 1;
        return;
    }
    const _audio = _bzSaveAudioState();
    _isSyncingInBackground = true;
    try {
        // ── Step 1: Download — pull cloud data and merge into localStorage ──
        const syncSnap = await db.collection('beatzen_sync').doc(user.uid).get();
        if (syncSnap.exists) {
            const _bootData = syncSnap.data();

            // FIX (currently-playing-song bug): bzBootSync runs on EVERY page open
            if (_bzIsActivelyPlaying()) {
                mergeCloudDataPrefsOnly(_bootData);
                updateSyncStatusUI(_bootData?._uploadedAt);
            } else if (_bzCloudPlaybackIsFresher(_bootData)) {
                // Cloud genuinely has a newer session
                mergeCloudData(_bootData);
                updateSyncStatusUI(_bootData?._uploadedAt);
                _bzTriggerPlaybackRestore();
            } else {
                // FIX (wrong-position-on-refresh): cloud's playback state is NOT newer
                mergeCloudDataPrefsOnly(_bootData);
                updateSyncStatusUI(_bootData?._uploadedAt);
            }
        }

        // Restore audio immediately after merge — before upload step
        _isSyncingInBackground = false;
        _bzRestoreAudio(_audio.el, _audio.wasPlaying, _audio.time, _audio.rate, _audio.src);

        // Download + merge has now settled
        window._bzBootSyncCompletedCount = (window._bzBootSyncCompletedCount || 0) + 1;

        // ── Step 2: Upload — push current local state to Firestore ──────────
        await silentUploadToCloud();

        // ── Step 3: Toast ─────────────────────────────────────────────────────
        if (syncSnap.exists) {
            try {
                const d = syncSnap.data();
                let parts = [];
                try { const favs = JSON.parse(d.z_favourites || '[]'); if (favs.length) parts.push(favs.length + ' favourite' + (favs.length !== 1 ? 's' : '')); } catch (_) { }
                try { const hist = JSON.parse(d.z_history || '[]'); if (hist.length) parts.push(hist.length + ' history ' + (hist.length !== 1 ? 'entries' : 'entry')); } catch (_) { }
                try { const pls = JSON.parse(d.z_importedPlaylists || '[]'); if (pls.length) parts.push(pls.length + ' playlist' + (pls.length !== 1 ? 's' : '')); } catch (_) { }

                if (isFreshSignIn) {
                    const msg = parts.length
                        ? '✓ Account synced — ' + parts.join(', ') + ' restored'
                        : '✓ Signed in — your data has been synced to this device';
                    setTimeout(() => bzToast(msg, 'success'), 600);
                }
                // isFreshSignIn=false (page reload / resume) → silent, no toast
            } catch (_) { }
        } else if (isFreshSignIn) {
            // First-ever sign-in — no cloud data yet; upload just ran so confirm
            setTimeout(() => bzToast('✓ Account created — your data will sync across all your devices', 'success'), 600);
        }
    } catch (_bootSyncErr) {
        // Suppress expected offline codes — only warn for unexpected failures
        const _bzIsOfflineErr = _bootSyncErr.code === 'unavailable' ||
            _bootSyncErr.code === 'failed-precondition' ||
            (_bootSyncErr.message || '').toLowerCase().includes('offline');
        if (!_bzIsOfflineErr) {
            console.warn('[BeatZen] Boot sync failed (non-critical):', _bootSyncErr.message);
        }
        _isSyncingInBackground = false;
        _bzRestoreAudio(_audio.el, _audio.wasPlaying, _audio.time, _audio.rate, _audio.src);
        // Settled (with an error)
        window._bzBootSyncCompletedCount = (window._bzBootSyncCompletedCount || 0) + 1;
    }
}

// startAutoSync / stopAutoSync
const AUTO_SYNC_INTERVAL_MS = 2 * 60 * 1000; // exactly 2 minutes
let _autoSyncIntervalTimer = null;

function startAutoSyncInterval() {
    if (_autoSyncIntervalTimer) return;
    _autoSyncIntervalTimer = setInterval(async () => {
        if (!auth.currentUser || !isAutoSyncOn()) return;
        try {
            await silentUploadToCloud(); // silent periodic upload — live listener handles downloads, no toast
        } catch (e) { /* silent — network may be offline */ }
    }, AUTO_SYNC_INTERVAL_MS);
}

function stopAutoSyncInterval() {
    if (_autoSyncIntervalTimer) {
        clearInterval(_autoSyncIntervalTimer);
        _autoSyncIntervalTimer = null;
    }
}

function startAutoSync() {
    const user = auth.currentUser;
    if (!user) return;
    startLiveListener(user.uid); // always open real-time listener when signed in
    window.bzSilentUpload = bzScheduleUpload;
    window.bzImmediateUpload = silentUploadToCloud; // immediate (non-debounced) upload for settings changes
    startAutoSyncInterval();     // periodic 2-minute sync (first fires at t+2min)
}

function stopAutoSync() {
    stopLiveListener();
    stopAutoSyncInterval();
    if (_uploadDebounceTimer) { clearTimeout(_uploadDebounceTimer); _uploadDebounceTimer = null; }
}

// App-resume sync
let _bzLastBootSyncAt = 0;
const BZ_RESUME_SYNC_MIN_MS = 60 * 1000; // at most once per minute on resume
document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    const user = auth.currentUser;
    if (!user || !isAutoSyncOn()) return;
    const now = Date.now();
    if (now - _bzLastBootSyncAt < BZ_RESUME_SYNC_MIN_MS) return;
    _bzLastBootSyncAt = now;
    // Short delay so the browser finishes painting before hitting Firestore
    setTimeout(() => bzBootSync(false), 500);
});

// Session watchdog
let _sessionWatchdogTimer = null;
const SESSION_WATCHDOG_INTERVAL_MS = 90 * 1000; // every 90 seconds

function startSessionWatchdog() {
    if (_sessionWatchdogTimer) return;
    _sessionWatchdogTimer = setInterval(async () => {
        const user = auth.currentUser;
        if (!user) { stopSessionWatchdog(); return; }
        try {
            await user.reload();          // re-fetches user record from Firebase Auth
            await user.getIdToken(true);  // forces a token refresh — fails if deleted
        } catch (err) {
            const fatalCodes = [
                'auth/user-not-found',
                'auth/user-disabled',
                'auth/user-token-revoked',
                'auth/invalid-user-token',
                'auth/network-request-failed', // transient — don't sign out for this
            ];
            if (err.code === 'auth/network-request-failed') return; // ignore offline blip
            if (fatalCodes.includes(err.code)) {
                console.warn('[BeatZen] Watchdog: auth account gone —', err.code);
                _forceSignOut();
            }
        }
    }, SESSION_WATCHDOG_INTERVAL_MS);
}

function stopSessionWatchdog() {
    if (_sessionWatchdogTimer) {
        clearInterval(_sessionWatchdogTimer);
        _sessionWatchdogTimer = null;
    }
}

// User-document watcher
let _userDocUnsubscribe = null;

function startUserDocWatcher(uid) {
    stopUserDocWatcher();
    // Track whether we have ever seen the document in an existing state.
    let _docEverExisted = false;
    _userDocUnsubscribe = db.collection('beatzen_users').doc(uid)
        .onSnapshot(
            snap => {
                if (!auth.currentUser) return; // already signed out — nothing to do
                if (snap.exists) {
                    _docEverExisted = true; // doc is present — future absences are real deletions

                    // FIX: read premium status/expiry live off the same doc so
                    // gating updates the instant an admin approves/declines —
                    // no waiting for the 30s bzApplyPremiumGating() interval.
                    const d = snap.data() || {};
                    const isPremium = !!d.premium;
                    const expiresAt = typeof d.premiumExpiresAt === 'number' ? d.premiumExpiresAt : 0;
                    window._bzIsPremium = isPremium;
                    window._bzPremiumExpiresAt = expiresAt;
                    try {
                        localStorage.setItem('beatzen_premium', String(isPremium));
                        localStorage.setItem('beatzen_premiumExpiresAt', String(expiresAt));
                    } catch (_) { /* private browsing, etc — non-fatal */ }
                    if (typeof window.bzApplyPremiumGating === 'function') window.bzApplyPremiumGating();
                    // If Premium is currently on screen (e.g. watching "Verifying…"),
                    // let it re-render immediately too.
                    if (typeof window.bzRenderPremiumView === 'function' &&
                        document.getElementById('premium-container')?.style.display !== 'none') {
                        window.bzRenderPremiumView();
                    }
                    return;
                }
                // snap.exists === false: only act if the doc existed
                if (!_docEverExisted) return;
                console.warn('[BeatZen] User document deleted — signing out');
                _forceSignOut();
            },
            err => {
                // permission-denied is expected once the doc (and its rules) are gone
                if (err.code === 'permission-denied') {
                    console.warn('[BeatZen] User doc watcher: permission-denied — signing out');
                    _forceSignOut();
                }
                // any other error (unavailable, etc.) — leave the watcher in place
            }
        );
}

function stopUserDocWatcher() {
    if (_userDocUnsubscribe) {
        _userDocUnsubscribe();
        _userDocUnsubscribe = null;
    }
}

// Shared forced sign-out used by both watchdog and doc watcher
function _forceSignOut() {
    stopSessionWatchdog();
    stopUserDocWatcher();
    stopAutoSync(); // stops live listener + debounce timer
    auth.signOut().catch(err =>
        console.warn('[BeatZen] Force sign-out error (non-critical):', err.code)
    );
}

function isAutoSyncEnabled() {
    return true; // live sync is always on when signed in
}

function setAutoSync(enabled) {
    // no-op — live sync cannot be disabled; kept for API compatibility
}

// Auto-sync toggle state
const AUTO_SYNC_ENABLED_KEY = 'beatzen_autosync_enabled';

function isAutoSyncOn() {
    // Always ON — users cannot disable auto sync
    localStorage.setItem(AUTO_SYNC_ENABLED_KEY, 'true');
    return true;
}

// Reflect current auto-sync state in the toggle and description text.
function syncAutoSyncUI() {
    const desc = $('bz-autosync-desc');
    // Auto sync is always ON — toggle is locked, upload row removed
    if (desc) desc.textContent = 'Changes sync automatically across all devices signed into your account';
}

// Auto-sync toggle is locked ON — no change listener needed
function wireAutoSyncToggle() {
    // Toggle is disabled in HTML — users cannot turn off auto sync
    syncAutoSyncUI();
}

// Manual Download
async function downloadFromCloud() {
    const btn = $('bz-download-btn');

    // FIX: Mirror bzNavGuard's three-state auth check instead of reading
    if (window.bzIsAuthenticated === false) {
        bzToast('Sign in first to access your cloud data', 'warning');
        return;
    }
    if (window.bzIsAuthenticated === undefined) {
        // Firebase still initializing — disable button, wait, then re-invoke.
        if (btn) { btn.disabled = true; }
        (window.bzAuthReady || Promise.resolve()).then(function () {
            if (btn) { btn.disabled = false; }
            if (!window.bzIsAuthenticated) {
                bzToast('Sign in first to access your cloud data', 'warning');
            } else {
                downloadFromCloud();
            }
        });
        return;
    }
    // window.bzIsAuthenticated === true
    try {
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading…'; }
        const snap = await db.collection('beatzen_sync').doc(auth.currentUser.uid).get();
        if (!snap.exists) {
            bzToast('No saved data found for this account — upload from another device first', 'warning');
            return;
        }
        const data = snap.data();

        // Count what's being restored for a meaningful notification
        let restoredParts = [];
        try {
            const favs = JSON.parse(data.z_favourites || '[]');
            if (Array.isArray(favs) && favs.length) restoredParts.push(favs.length + ' favourites');
        } catch (_) { }
        try {
            const hist = JSON.parse(data.z_history || '[]');
            if (Array.isArray(hist) && hist.length) restoredParts.push(hist.length + ' history entries');
        } catch (_) { }
        try {
            const playlists = JSON.parse(data.z_importedPlaylists || '[]');
            if (Array.isArray(playlists) && playlists.length) restoredParts.push(playlists.length + ' playlists');
        } catch (_) { }
        // lastPlayedSong / beatZen_lastPosition are included in mergeCloudData()

        mergeCloudData(data);
        updateSyncStatusUI(data?._uploadedAt);

        // FIX: Reset restore guard so the mobile engine runs fresh If a previous
        if (window._bzMobileState) window._bzMobileState.restored = false;
        if (typeof window._bzResetRestoredState === 'function') window._bzResetRestoredState();
        window._bzRestoreOnReady = false;

        // FIX: Restore player bar immediately from freshly written localStorage
        restoreLastPlayedSong();

        // FIX: Full session restore with staggered retries
        function _bzTriggerRestore() {
            try {
                if (typeof window.restoreMobileSession === 'function') {
                    window.restoreMobileSession();
                }
            } catch (_) { /* best effort */ }
        }
        setTimeout(_bzTriggerRestore, 150);   // fast path — masterPool already loaded
        setTimeout(_bzTriggerRestore, 700);   // retry — in case Sheets data was still loading
        setTimeout(_bzTriggerRestore, 1500);  // final retry — slow network / cold start

        const detail = restoredParts.length
            ? 'Restored: ' + restoredParts.join(', ')
            : 'All settings and preferences restored';
        bzToast('✓ ' + detail, 'success');

    } catch (err) {
        console.warn('[BeatZen] Manual download failed:', err);
        bzToast('Download failed — check your internet connection and try again', 'danger');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-cloud-arrow-down"></i> Download'; }
    }
}

// Wire upload + download buttons
function wireSyncButtons() {
    const downloadBtn = $('bz-download-btn');
    if (downloadBtn) downloadBtn.addEventListener('click', downloadFromCloud);
    wireAutoSyncToggle(); // sets desc text, toggle is locked disabled in HTML
}

// Restore last-played song
function restoreLastPlayedSong() {
    try {
        const raw = localStorage.getItem('lastPlayedSong') || localStorage.getItem('beatZen_currentSong');
        if (!raw) return;

        if (typeof window.restoreMobileSession === 'function') {
            window.restoreMobileSession();
            return;
        }

        const song = JSON.parse(raw);
        if (!song) return;

        // FIX 5: Read title/artist/cover from the rich lastPlayedSong object
        let title = song.title || '';
        let artist = song.artist || '';
        let cover = song.cover || '';

        // Fallback 1: separate localStorage keys written by older saves
        if (!title) title = localStorage.getItem('beatZen_currentSongTitle') || '';
        if (!artist) artist = localStorage.getItem('beatZen_currentSongArtist') || '';
        if (!cover) cover = localStorage.getItem('beatZen_currentSongCover') || '';

        // Fallback 2: scan play history for the matching song ID
        if (!title && song.songId) {
            try {
                const hist = JSON.parse(localStorage.getItem('beatZen_history_auto') || '[]');
                const entry = hist.find(h => String(h.id) === String(song.songId));
                if (entry) {
                    title = title || entry.title || '';
                    artist = artist || entry.artist || '';
                    cover = cover || entry._coverUrl || entry.albumCover || '';
                }
            } catch (_) { }
        }

        if (!title) return; /* Nothing useful to show yet */

        const titleEl = document.querySelector('.song-title') || document.getElementById('player-song-title');
        const artistEl = document.querySelector('.song-artist') || document.getElementById('player-song-artist');
        const coverEl = document.querySelector('.player-album-cover') || document.getElementById('player-album-cover');
        if (titleEl) titleEl.textContent = title;
        if (artistEl) artistEl.textContent = artist;
        if (coverEl && cover) coverEl.src = cover;
    } catch (e) {
        console.warn('[BeatZen] restoreLastPlayedSong:', e);
    }
}

// Sign-Out
function wireSignOutButton() {
    ['bz-google-signout-btn', 'bz-profile-signout-btn'].forEach(function (id) {
        const btn = $(id);
        if (!btn) return;
        btn.addEventListener('click', function () {
            stopAutoSync();
            auth.signOut().catch(err => console.error('[BeatZen SignOut]', err));
        });
    });
}

// Auth State
function refreshSignedInUI(user) {
    if (!user) { showSignedOut(); return; }
    showSignedIn();

    const avatar = $('bz-auth-avatar');
    const nameEl = $('bz-auth-name');
    const emailEl = $('bz-auth-email');

    if (avatar) {
        if (user.photoURL) {
            avatar.src = user.photoURL;
            avatar.style.display = '';
            const old = document.getElementById('bz-auth-avatar-init');
            if (old) old.remove();
            // FIX: cache the photo URL immediately so a returning user's real
            try { localStorage.setItem('beatzen_photoURL', user.photoURL); } catch (_) { }
        } else {
            avatar.src = '';
            avatar.style.display = 'none';
            let initWrap = document.getElementById('bz-auth-avatar-init');
            if (!initWrap) {
                initWrap = document.createElement('div');
                initWrap.id = 'bz-auth-avatar-init';
                initWrap.style.cssText = 'width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#2575fc);display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:700;color:#fff;flex-shrink:0;';
                if (avatar.parentNode) avatar.parentNode.insertBefore(initWrap, avatar);
            }
            const _fullName = localStorage.getItem('beatzen_fullName') || '';
            initWrap.textContent = (_fullName || user.displayName || user.email || 'U')[0].toUpperCase();
            try { localStorage.removeItem('beatzen_photoURL'); } catch (_) { }
        }
    }
    if (nameEl) nameEl.textContent = localStorage.getItem('beatzen_fullName') || user.displayName || user.email?.split('@')[0] || 'User';
    if (emailEl) emailEl.textContent = user.email || user.phoneNumber || '';

    // Fix: keep the Profile page's mirrored account card
    if (typeof window.bzSyncProfilePageFromAccountCard === 'function') {
        window.bzSyncProfilePageFromAccountCard();
    }
    if (typeof window.bzLoadProfileJoinedDate === 'function') {
        window.bzLoadProfileJoinedDate();
    }
}

// Expose so script.js can call window.bzRefreshAuthUI() when settings
window.bzRefreshAuthUI = function () {
    if (window.bzIsAuthenticated !== undefined) {
        // Auth already resolved — act immediately.
        refreshSignedInUI(auth.currentUser);
        return;
    }
    const _likelySigned = !!(
        localStorage.getItem('beatZen_session_uid') ||
        document.documentElement.classList.contains('bz-signed-in')
    );
    if (_likelySigned) {
        // Cached session present
        (window.bzAuthReady || Promise.resolve()).then(function () {
            refreshSignedInUI(auth.currentUser);
        });
    } else {
        // No cached session — user is a genuine guest; safe to call immediately.
        refreshSignedInUI(auth.currentUser);
    }
};

// Per-user playlist restore helper
async function _bzRestoreUserPlaylists(uid) {
    try {
        const snap = await db.collection('beatzen_sync').doc(uid).get();
        // gatherLocalData() remaps beatZen_importedPlaylists
        const docData = snap.exists ? snap.data() : null;
        const cloudPlaylists = docData != null
            ? (Object.prototype.hasOwnProperty.call(docData, 'z_importedPlaylists')
                ? docData.z_importedPlaylists
                : docData.beatZen_importedPlaylists)
            : undefined;

        if (cloudPlaylists === undefined || cloudPlaylists === null) {
            // No cloud playlist data for this user
            if (localStorage.getItem('beatZen_importedPlaylists')) {
                localStorage.removeItem('beatZen_importedPlaylists');
                return true;
            }
            return false;
        }

        if (localStorage.getItem('beatZen_importedPlaylists') === cloudPlaylists) {
            return false; // already in sync — nothing to do
        }

        localStorage.setItem('beatZen_importedPlaylists', cloudPlaylists);
        return true; // caller should rebuild the playlist UI
    } catch (e) {
        console.warn('[BeatZen] Playlist restore failed:', e.message);
        return false;
    }
}

// Rebuild the in-memory masterPool and re-render the playlist
function _bzRebuildPlaylistUI() {
    try {
        const parsed = JSON.parse(
            localStorage.getItem('beatZen_importedPlaylists') || '[]'
        );
        if (Array.isArray(window.masterPool)) {
            // Strip old imported playlists, then inject this user's
            window.masterPool = window.masterPool.filter(p => !p.isImported);
            parsed.forEach(pl => {
                pl.id = String(pl.id);
                pl.isImported = true;
                if (!window.masterPool.some(m => String(m.id || m.name) === pl.id)) {
                    window.masterPool.push(pl);
                }
            });
        }
        if (typeof window.rebuildMasterMap === 'function') window.rebuildMasterMap();
        const wrap = document.getElementById('bz-smart-playlists-wrap')
            || document.getElementById('playlists-container');
        if (wrap && typeof window._bzPlaylistsRender === 'function') {
            window._bzPlaylistsRender(wrap);
        }
    } catch (_) { /* best-effort */ }
}



// Guest-state guard against Firebase's "null-before-real-user" race
function _bzApplyGuestState() {
    window.bzIsAuthenticated = false;
    _bzResolveAuthReadyOnce();
    showSignedOut();
    stopAutoSync();        // stops live listener + debounce timer
    stopSessionWatchdog();
    stopUserDocWatcher();

    // Re-apply guest mode
    document.documentElement.classList.remove('bz-signed-in');
    document.documentElement.classList.add('bz-guest');
    const _gateEl = document.getElementById('bz-auth-gate');
    if (_gateEl) _gateEl.classList.add('bz-gate-visible');

    // Stop Sheet live-sync polling — no need to hit the endpoint for guests.
    if (typeof window.bzStopLiveSync === 'function') window.bzStopLiveSync();
    // Clear all user-specific local data on sign-out so the next user
    localStorage.removeItem('beatZen_importedPlaylists');
    localStorage.removeItem('beatZen_favourites');         // <-- fix: was missing
    localStorage.removeItem('beatZen_history_auto');
    localStorage.removeItem('beatZen_signals');
    localStorage.removeItem('beatZen_rr_plays');           // Repeat Rewind qualifying plays
    localStorage.removeItem('beatZen_recentSearches');
    localStorage.removeItem('beatZen_session_uid');
    // Clear username-account identity keys so the next user
    localStorage.removeItem('beatzen_username');
    localStorage.removeItem('beatzen_displayUsername');
    localStorage.removeItem('beatzen_fullName');
    localStorage.removeItem('beatzen_resolvedEmail');
    // FIX: don't let one account's premium status leak into the next
    // person's session on a shared device.
    localStorage.removeItem('beatzen_premium');
    localStorage.removeItem('beatzen_premiumExpiresAt');
    window._bzIsPremium = false;
    window._bzPremiumExpiresAt = 0;
    if (typeof window.bzApplyPremiumGating === 'function') window.bzApplyPremiumGating();
    clearPlayerState(); // reset player bar so next user sees "Select a song to play"
    _bzRebuildPlaylistUI();
    // ──────────────────────────────────────────────────────────────────
}

// Auth-ready promise
let _bzAuthReadyResolve;
window.bzAuthReady = new Promise(function (resolve) { _bzAuthReadyResolve = resolve; });
let _bzAuthReadyResolved = false;
function _bzResolveAuthReadyOnce() {
    if (!_bzAuthReadyResolved) {
        _bzAuthReadyResolved = true;
        _bzAuthReadyResolve();
    }
}

let _bzAuthFirstCallback = true;
let _bzPendingGuestTimer = null;

// Explicit "fresh sign-in" flag
window._bzFreshSignIn = false;

auth.onAuthStateChanged(async (user) => {
    if (user) {
        _bzAuthFirstCallback = false;
        // A real user just confirmed
        if (_bzPendingGuestTimer) {
            clearTimeout(_bzPendingGuestTimer);
            _bzPendingGuestTimer = null;
        }
        window.bzIsAuthenticated = true;
        _bzResolveAuthReadyOnce();

        // FIX: persist beatZen_session_uid IMMEDIATELY
        var _prevUid = null;
        try {
            _prevUid = localStorage.getItem('beatZen_session_uid');
            localStorage.setItem('beatZen_session_uid', user.uid);
        } catch (_uidErr) {
            console.warn('[BeatZen] Early session UID persist failed:', _uidErr.message);
        }

        // Remove guest class
        const _wasGuestMode = document.documentElement.classList.contains('bz-guest');
        document.documentElement.classList.remove('bz-guest');

        // Dismiss the auth gate if it's open
        const gate = document.getElementById('bz-auth-gate');
        const _gateWasOpen = gate && gate.classList.contains('bz-gate-visible');
        if (gate) gate.classList.remove('bz-gate-visible');
        if ((_gateWasOpen || _wasGuestMode) && typeof window.displayHome === 'function') {
            // Clear any stale activeView (e.g. 'settings') so the restored view
            localStorage.removeItem('beatZen_activeView');
            window.displayHome();
        }

        // FIX: capture + consume the explicit fresh-sign-in flag right here
        const _isFreshSignIn = window._bzFreshSignIn === true;
        window._bzFreshSignIn = false;

        refreshSignedInUI(user);

        try {
            const snap = await db.collection('beatzen_sync').doc(user.uid).get();
            updateSyncStatusUI(snap.exists ? snap.data()?._uploadedAt : null);
        } catch (_) {
            updateSyncStatusUI(null);
        }

        window.bzSilentUpload = bzScheduleUpload;

        startAutoSync(); // open real-time listener

        // Boot sync: download → merge → upload → toast
        _bzLastBootSyncAt = Date.now(); // mark so visibilitychange doesn't double-fire
        bzBootSync(_isFreshSignIn);
        // ─────────────────────────────────────────────────────────────────────

        // Account-deletion guards
        startSessionWatchdog();
        startUserDocWatcher(user.uid);

        // Start Sheet live-sync polling now that a user is confirmed signed in.
        if (typeof window.bzStartLiveSync === 'function') window.bzStartLiveSync();

        // Per-user playlist isolation
        try { _bzRebuildPlaylistUI(); } catch (_) { /* best-effort */ }

        // Per-user history + recent-searches isolation
        try {
            if (_prevUid !== user.uid) {
                // Different (or first-ever) user on this device. Wipe ALL
                localStorage.removeItem('beatZen_history_auto');
                localStorage.removeItem('beatZen_signals');
                localStorage.removeItem('beatZen_rr_plays');        // Repeat Rewind qualifying plays
                localStorage.removeItem('beatZen_recentSearches');
                localStorage.removeItem('beatZen_favourites');     // <-- fix: was missing
                localStorage.removeItem('beatZen_importedPlaylists');
                // Clear username-account identity keys so a previous
                localStorage.removeItem('beatzen_username');
                localStorage.removeItem('beatzen_displayUsername');
                localStorage.removeItem('beatzen_fullName');
                localStorage.removeItem('beatzen_resolvedEmail');
                clearPlayerState(); // prevent previous user's song bleeding into new session

                // FIX 5: Reset the mobile-engine state.restored flag
                if (typeof window._bzResetRestoredState === 'function') {
                    window._bzResetRestoredState();
                }
                window._bzRestoreOnReady = false;

                // Rebuild immediately so no stale cards flash on screen.
                setTimeout(function () { try { _bzRebuildPlaylistUI(); } catch (_) { } }, 350);
            }
        } catch (_uidErr) {
            console.warn('[BeatZen] Session UID isolation failed:', _uidErr.message);
        }

        // Username-auth: sync profile to localStorage + analytics
        try {
            refreshSignedInUIWithUsername(user);
            const _profile = await fetchUserProfile(user.uid);
            if (_profile?.username) {
                localStorage.setItem('beatzen_username', _profile.username);
                localStorage.setItem('beatzen_displayUsername', _profile.displayUsername);
                if (_profile?.fullName) localStorage.setItem('beatzen_fullName', _profile.fullName);
            }
            // Google Sheets Account Analytics Sync
            try {
                if (typeof window.bzSyncAccountToSheet === 'function') {
                    window.bzSyncAccountToSheet(user, _profile || null);
                }
            } catch (_analyticsErr) {
                console.warn('[BeatZen auth.js] Sheet sync error (non-critical):', _analyticsErr.message);
            }
        } catch (_profileErr) {
            console.warn('[BeatZen] Profile sync failed (non-critical):', _profileErr.message);
        }
        // 
    } else {
        // Race guard
        if (_bzAuthFirstCallback) {
            _bzAuthFirstCallback = false;
            var _hadCachedSession = false;
            // FIX: previously only checked beatZen_session_uid.
            try {
                _hadCachedSession = !!localStorage.getItem('beatZen_session_uid') ||
                    document.documentElement.classList.contains('bz-signed-in');
            } catch (_) { /* private mode */ }
            if (_hadCachedSession) {
                _bzPendingGuestTimer = setTimeout(function () {
                    _bzPendingGuestTimer = null;
                    // Re-check right before committing
                    if (!auth.currentUser) _bzApplyGuestState();
                }, 1500);
                return;
            }
        }
        _bzApplyGuestState();
    }
});


// Bootstrap

function onDOMReady() {
    // Do NOT call showSignedOut() here. onAuthStateChanged controls

    // Optimistic pre-show for returning users
    try {
        if (localStorage.getItem('beatZen_session_uid')) {
            // Optimistic pre-show for returning users
            const locked = document.getElementById('bz-settings-locked');
            if (locked) locked.style.display = '';
            const syncSec = document.getElementById('bz-sync-section');
            if (syncSec) syncSec.style.display = '';

            // FIX: the block above only ever revealed the two Settings-page sections
            document.documentElement.classList.remove('bz-guest');
            document.documentElement.classList.add('bz-signed-in');
            const _gate = document.getElementById('bz-auth-gate');
            if (_gate) _gate.classList.remove('bz-gate-visible');
        }
    } catch (_) { /* private-mode Safari may block localStorage reads */ }
    wireSignOutButton();
    wireSyncButtons();          // wire upload, download, and auto-sync toggle
    // FIX: previously a flat setTimeout(restoreLastPlayedSong, 400)
    restoreLastPlayedSong();
    (function _bzPollForFullRestore() {
        var _tries = 0;
        var _maxTries = 100; // 100 × 20ms = 2s ceiling — script.js should be long done by then
        (function _poll() {
            if (typeof window.restoreMobileSession === 'function') {
                window.restoreMobileSession();
            } else if (++_tries < _maxTries) {
                setTimeout(_poll, 20);
            }
            // else: give up silently
        })();
    })();

    window.addEventListener('beforeunload', () => {
        try {
            const audioEl = document.getElementById('audio-player');
            const ci = window.currentSongIndex;
            const pa = window.playingAlbum;
            const liveSong = (pa && pa.songs && typeof ci === 'number' && ci >= 0) ? pa.songs[ci] : null;
            // FIX 3a: Save position for any finite time > 0
            if (audioEl && isFinite(audioEl.currentTime) && audioEl.currentTime > 0) {
                localStorage.setItem('beatZen_lastPosition', JSON.stringify({
                    t: audioEl.currentTime,
                    d: isFinite(audioEl.duration) && audioEl.duration > 0 ? audioEl.duration : undefined,
                    id: liveSong?.id != null ? String(liveSong.id) : ''
                }));
            }
            if (liveSong && liveSong.id) {
                // FIX 3b: Always overwrite with full metadata (no songId-match guard).
                const _restoreTarget = _bzResolveRestoreTarget(pa, ci, liveSong);
                // FIX: carry forward url/duration
                localStorage.setItem('lastPlayedSong', JSON.stringify({
                    albumId: _restoreTarget.albumId,
                    songIndex: _restoreTarget.songIndex,
                    songId: String(liveSong.id),
                    type: _restoreTarget.type,
                    isAutoMix: _restoreTarget.isAutoMix,
                    title: liveSong.title || '',
                    artist: liveSong.artist || '',
                    cover: _restoreTarget.srcAlbumMeta?.imageUrl || _restoreTarget.srcAlbumMeta?.albumCover || '',
                    url: liveSong.url || '',
                    duration: liveSong.duration || '',
                    savedAt: Date.now()
                }));
            }
            // FIX Bug C: previously used isAutoSyncEnabled() which always returns
            if (auth.currentUser && isAutoSyncOn()) {
                silentUploadToCloud(); // may complete if page is backgrounded, not truly closed
            }
        } catch (_) { /* non-critical */ }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDOMReady);
} else {
    onDOMReady();
}
// USERNAME + PASSWORD AUTH — BeatZen Sign Up : username + password

// Strict email format validation
function isValidEmail(email) {
    if (!email) return { ok: false, reason: 'Email is required.' };

    const trimmed = email.trim().toLowerCase();

    // Must contain exactly one @ symbol
    const atCount = (trimmed.match(/@/g) || []).length;
    if (atCount !== 1) return { ok: false, reason: 'Enter a valid email address.' };

    const [localPart, domain] = trimmed.split('@');

    // Local part checks
    if (!localPart || localPart.length === 0)
        return { ok: false, reason: 'Email address is missing a username before @.' };
    if (localPart.length > 64)
        return { ok: false, reason: 'The part before @ is too long.' };
    if (localPart.startsWith('.') || localPart.endsWith('.'))
        return { ok: false, reason: 'Email username cannot start or end with a dot.' };
    if (/\.{2,}/.test(localPart))
        return { ok: false, reason: 'Email username cannot have consecutive dots.' };
    if (!/^[a-zA-Z0-9._%+\-]+$/.test(localPart))
        return { ok: false, reason: 'Email username contains invalid characters.' };

    // Domain checks
    if (!domain || domain.length === 0)
        return { ok: false, reason: 'Email address is missing a domain after @.' };
    if (domain.length > 253)
        return { ok: false, reason: 'Email domain is too long.' };
    if (!domain.includes('.'))
        return { ok: false, reason: 'Enter a valid email domain (e.g. gmail.com).' };
    if (domain.startsWith('.') || domain.endsWith('.'))
        return { ok: false, reason: 'Email domain cannot start or end with a dot.' };
    if (/\.{2,}/.test(domain))
        return { ok: false, reason: 'Email domain cannot have consecutive dots.' };
    if (!/^[a-zA-Z0-9.\-]+$/.test(domain))
        return { ok: false, reason: 'Email domain contains invalid characters.' };

    // TLD check — must be at least 2 letters
    const tld = domain.split('.').pop();
    if (!tld || tld.length < 2 || !/^[a-zA-Z]{2,}$/.test(tld))
        return { ok: false, reason: 'Enter a valid top-level domain (e.g. .com, .in, .org).' };

    // Block obviously invalid / placeholder domains
    const BLOCKED_DOMAINS = new Set([
        'example.com', 'example.org', 'example.net', 'test.com', 'test.org',
        'mailinator.com', 'guerrillamail.com', 'throwam.com', 'trashmail.com',
        'yopmail.com', 'tempmail.com', 'dispostable.com', 'sharklasers.com',
        'guerrillamailblock.com', 'grr.la', 'guerrillamail.info', 'spam4.me',
        'fakeinbox.com', 'maildrop.cc', 'spamgourmet.com', 'mytemp.email',
        'discard.email', 'tempr.email', 'throwit.email', 'burnermail.io'
    ]);
    if (BLOCKED_DOMAINS.has(domain))
        return { ok: false, reason: 'Please use a valid personal email address.' };

    return { ok: true, reason: null };
}

// Reserved words
const RESERVED_USERNAMES = new Set([
    'admin', 'root', 'system', 'null', 'undefined', 'beatzen', 'support',
    'moderator', 'mod', 'staff', 'official', 'login', 'signup', 'home',
    'profile', 'settings', 'search', 'playlist', 'help', 'contact'
]);

// Username validation
const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9._-]{2,19}$/;

function validateUsername(username) {
    if (!username || username.length < 3) return 'Username must be at least 3 characters.';
    if (username.length > 20) return 'Username must be 20 characters or less.';
    if (!USERNAME_REGEX.test(username)) return 'Start with a letter; only letters, numbers, . _ - allowed.';
    if (username.includes('..') || username.includes('--') || username.includes('__'))
        return 'No consecutive dots, hyphens, or underscores.';
    if (RESERVED_USERNAMES.has(username.toLowerCase()))
        return 'That username is reserved. Please choose another.';
    return null; // valid
}


// Internal email helper (Firebase Auth requires an email)
function usernameToEmail(username) {
    return username.toLowerCase() + '@beatzen.app';
}

// Check username uniqueness in Firestore
async function isUsernameTaken(username) {
    const snap = await db.collection('beatzen_usernames')
        .doc(username.toLowerCase()).get();
    return snap.exists;
}

// Save username → Firestore
async function saveUsernameToFirestore(uid, username, fullName, email) {
    const lower = username.toLowerCase();
    const batch = db.batch();

    // beatzen_usernames/{lower} → uid  (uniqueness index)
    batch.set(db.collection('beatzen_usernames').doc(lower), {
        uid,
        username: lower,
        displayUsername: username,
        fullName: fullName,
        email: email.toLowerCase(),   // real email — for forgot password only
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // beatzen_users/{uid} → full profile
    batch.set(db.collection('beatzen_users').doc(uid), {
        uid,
        username: lower,
        displayUsername: username,
        fullName: fullName,
        email: email.toLowerCase(),   // real email — for forgot password only
        provider: 'username',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await batch.commit();
}

// Fetch user profile
async function fetchUserProfile(uid) {
    try {
        const snap = await db.collection('beatzen_users').doc(uid).get();
        return snap.exists ? snap.data() : null;
    } catch (_) { return null; }
}

// Refresh signed-in UI with Firestore username
async function refreshSignedInUIWithUsername(user) {
    if (!user) { showSignedOut(); return; }
    showSignedIn();

    const avatar = $('bz-auth-avatar');
    const nameEl = $('bz-auth-name');
    const emailEl = $('bz-auth-email');

    const profile = await fetchUserProfile(user.uid);
    const fullName = profile?.fullName || user.displayName || localStorage.getItem('beatzen_fullName') || '';
    const displayUsername = profile?.displayUsername || localStorage.getItem('beatzen_displayUsername') || '';

    // Cache these locally so the account card
    if (fullName) localStorage.setItem('beatzen_fullName', fullName);
    if (displayUsername) localStorage.setItem('beatzen_displayUsername', displayUsername);

    const avatarLetter = (fullName[0] || displayUsername[0] || user.email?.[0] || 'U').toUpperCase();

    if (avatar) {
        avatar.src = '';
        avatar.style.display = 'none';
        let initWrap = document.getElementById('bz-auth-avatar-init');
        if (!initWrap) {
            initWrap = document.createElement('div');
            initWrap.id = 'bz-auth-avatar-init';
            initWrap.style.cssText = 'width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#2575fc);display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:700;color:#fff;flex-shrink:0;';
            if (avatar.parentNode) avatar.parentNode.insertBefore(initWrap, avatar);
        }
        initWrap.textContent = avatarLetter;
    }

    if (nameEl) nameEl.textContent = fullName || displayUsername || user.email?.split('@')[0] || 'User';
    if (emailEl) emailEl.textContent = displayUsername ? '@' + displayUsername : user.email || '';

    // FIX: see matching comment in refreshSignedInUI above
    if (typeof window.bzSyncProfilePageFromAccountCard === 'function') {
        window.bzSyncProfilePageFromAccountCard();
    }
    if (typeof window.bzLoadProfileJoinedDate === 'function') {
        window.bzLoadProfileJoinedDate();
    }
}

// FIX: guard against the Firebase race window
window.bzRefreshAuthUI = function () {
    if (window.bzIsAuthenticated !== undefined) {
        // Auth already resolved — act immediately.
        refreshSignedInUIWithUsername(auth.currentUser);
        return;
    }
    const _likelySigned = !!(
        localStorage.getItem('beatZen_session_uid') ||
        document.documentElement.classList.contains('bz-signed-in')
    );
    if (_likelySigned) {
        // Cached session present
        (window.bzAuthReady || Promise.resolve()).then(function () {
            refreshSignedInUIWithUsername(auth.currentUser);
        });
    } else {
        // No cached session — genuine guest; safe to call immediately.
        refreshSignedInUIWithUsername(auth.currentUser);
    }
};

// Show / hide forms
function showAuthForm(formId) {
    ['bz-email-signup-form', 'bz-email-signin-form', 'bz-forgot-password-form'].forEach(id => {
        const el = $(id);
        if (el) el.style.display = (id === formId) ? '' : 'none';
    });
    // Hide username toggle buttons and divider while a form is open
    const toggleBtns = document.querySelector('.bz-email-auth-btns');
    if (toggleBtns) toggleBtns.style.display = 'none';


    // Reset forgot form state when opening it
    if (formId === 'bz-forgot-password-form') {
        const eInput = $('bz-forgot-email');
        if (eInput) eInput.value = '';
        setFormError('bz-forgot-error', '');
        // Reset to step 1, hide all other steps
        showForgotStep('bz-forgot-step-input');
    }
}
function hideAllAuthForms() {
    ['bz-email-signup-form', 'bz-email-signin-form', 'bz-forgot-password-form'].forEach(id => {
        const el = $(id);
        if (el) el.style.display = 'none';
    });
    // Restore username toggle buttons
    const toggleBtns = document.querySelector('.bz-email-auth-btns');
    if (toggleBtns) toggleBtns.style.display = '';

}

// Inline error helper
function setFormError(elId, msg) {
    const el = $(elId);
    if (!el) return;
    el.textContent = msg || '';
    el.style.display = msg ? '' : 'none';
}

// Email confirmation modal
function showEmailConfirmModal(email, onConfirm) {
    const existing = document.getElementById('bz-email-confirm-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'bz-email-confirm-modal';
    overlay.style.cssText = [
        'position:fixed;inset:0;z-index:999999;',
        'background:rgba(0,0,0,0.72);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);',
        'display:flex;align-items:center;justify-content:center;padding:20px;',
        'animation:bzEcmIn 0.22s cubic-bezier(0.34,1.4,0.64,1) both;'
    ].join('');

    overlay.innerHTML = `
        <style>
            @keyframes bzEcmIn{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}
            #bz-email-confirm-modal .bzecm-yes:hover{filter:brightness(1.12);}
            #bz-email-confirm-modal .bzecm-no:hover{background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.9);}
        </style>
        <div style="
            background:linear-gradient(145deg,#1c1040 0%,#0e0b22 100%);
            border:1.5px solid rgba(124,58,237,0.45);border-radius:22px;
            padding:30px 24px 24px;max-width:360px;width:100%;
            box-shadow:0 24px 64px rgba(0,0,0,0.75),0 0 0 1px rgba(124,58,237,0.12);
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
            animation:bzEcmIn 0.22s cubic-bezier(0.34,1.4,0.64,1) both;
        ">
            <!-- icon -->
            <div style="text-align:center;margin-bottom:18px;">
                <div style="
                    width:60px;height:60px;border-radius:50%;
                    background:linear-gradient(135deg,#7c3aed,#2575fc);
                    display:inline-flex;align-items:center;justify-content:center;
                    box-shadow:0 8px 28px rgba(124,58,237,0.55);
                ">
                    <i class="fas fa-envelope-open-text" style="color:#fff;font-size:1.5rem;"></i>
                </div>
            </div>
            <!-- title -->
            <h3 style="text-align:center;margin:0 0 8px;font-size:1.08rem;font-weight:800;color:#fff;letter-spacing:-0.2px;">
                Confirm Your Email
            </h3>
            <!-- subtitle -->
            <p style="text-align:center;margin:0 0 20px;font-size:0.8rem;color:rgba(255,255,255,0.5);line-height:1.6;">
                This email is used to <strong style="color:#a78bfa;">reset your password</strong> if you forget it.<br>
                Make sure it is correct before creating your account.
            </p>
            <!-- email pill -->
            <div style="
                background:rgba(124,58,237,0.14);
                border:1.5px solid rgba(124,58,237,0.38);
                border-radius:14px;padding:13px 16px;
                text-align:center;margin-bottom:24px;
            ">
                <div style="font-size:0.65rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#a78bfa;margin-bottom:5px;">
                    <i class="fas fa-envelope" style="margin-right:4px;"></i>YOUR EMAIL ADDRESS
                </div>
                <div style="font-size:0.97rem;font-weight:700;color:#fff;word-break:break-all;">${email}</div>
            </div>
            <!-- buttons -->
            <button class="bzecm-yes" style="
                width:100%;padding:13px;border-radius:12px;border:none;cursor:pointer;
                background:linear-gradient(135deg,#7c3aed,#2575fc);
                color:#fff;font-size:0.9rem;font-weight:700;
                box-shadow:0 4px 18px rgba(124,58,237,0.5);
                margin-bottom:10px;transition:filter 0.15s;
                display:flex;align-items:center;justify-content:center;gap:8px;
            ">
                <i class="fas fa-check-circle"></i> Yes, Create My Account
            </button>
            <button class="bzecm-no" style="
                width:100%;padding:11px;border-radius:12px;
                border:1.5px solid rgba(255,255,255,0.1);cursor:pointer;
                background:transparent;color:rgba(255,255,255,0.55);
                font-size:0.85rem;font-weight:600;transition:background 0.15s,color 0.15s;
            ">
                <i class="fas fa-pen"></i> Change Email
            </button>
        </div>`;

    document.body.appendChild(overlay);

    // "Yes" → proceed with account creation
    overlay.querySelector('.bzecm-yes').addEventListener('click', () => {
        overlay.remove();
        onConfirm();
    });

    // "Change email" → dismiss and focus the email field
    overlay.querySelector('.bzecm-no').addEventListener('click', () => {
        overlay.remove();
        const emailInput = $('bz-signup-email');
        if (emailInput) { emailInput.focus(); emailInput.select(); }
    });

    // Click outside the card → dismiss (treat same as "change email")
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// SIGN UP: full name + email + password + confirm
function handleEmailSignUp() {
    const fullName = ($('bz-signup-fullname')?.value || '').trim();
    const email = ($('bz-signup-email')?.value || '').trim();
    const password = $('bz-signup-password')?.value || '';
    const confirm = $('bz-signup-confirm')?.value || '';

    setFormError('bz-signup-error', '');

    // Validate
    if (!fullName) return setFormError('bz-signup-error', 'Please enter your full name.');
    if (fullName.length < 2) return setFormError('bz-signup-error', 'Full name must be at least 2 characters.');

    const emailCheck = isValidEmail(email);
    if (!emailCheck.ok) return setFormError('bz-signup-error', emailCheck.reason);

    if (password.length < 6)
        return setFormError('bz-signup-error', 'Password must be at least 6 characters.');
    if (password !== confirm)
        return setFormError('bz-signup-error', 'Passwords do not match.');

    // All valid
    showEmailConfirmModal(email, () => doCreateAccount(fullName, email, password));
}

// Actual Firebase account creation
async function doCreateAccount(fullName, email, password) {
    const btn = $('bz-signup-submit-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating…'; }
    window._bzFreshSignIn = true; // explicit user action — see flag declaration above

    try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);

        // Set displayName in Firebase Auth so it is available immediately
        try { await cred.user.updateProfile({ displayName: fullName }); } catch (_) { }

        // Save full profile to Firestore so user-doc watcher and settings
        await db.collection('beatzen_users').doc(cred.user.uid).set({
            uid: cred.user.uid,
            email: email.toLowerCase(),
            fullName: fullName,
            provider: 'email',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // Persist fullName locally so avatar/settings render before next
        localStorage.setItem('beatzen_fullName', fullName);

        bzToast('✓ Account created! Welcome to Beat Zen', 'success');
        hideAllAuthForms();

    } catch (err) {
        console.error('[BeatZen SignUp] code:', err.code, '| message:', err.message, '| full:', err);
        let msg = 'Sign-up failed. Try again.';
        if (err.code === 'auth/email-already-in-use') msg = 'That email is already registered. Try signing in.';
        else if (err.code === 'auth/weak-password') msg = 'Password is too weak (min 6 characters).';
        else if (err.code === 'auth/network-request-failed') msg = 'Network error. Check your connection.';
        else if (err.code === 'permission-denied') msg = 'Firestore rules blocked signup. Check rules.';
        else if (err.code === 'auth/invalid-email') msg = 'Enter a valid email address.';
        else msg = 'Sign-up failed: ' + (err.message || err.code || 'unknown error');
        setFormError('bz-signup-error', msg);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account'; }
    }
}

// SIGN IN: email + password
async function handleEmailSignIn() {
    const email = ($('bz-signin-email')?.value || '').trim();
    const password = $('bz-signin-password')?.value || '';

    setFormError('bz-signin-error', '');

    if (!email) return setFormError('bz-signin-error', 'Enter your email address.');
    const emailCheck = isValidEmail(email);
    if (!emailCheck.ok) return setFormError('bz-signin-error', emailCheck.reason);
    if (!password) return setFormError('bz-signin-error', 'Enter your password.');

    const btn = $('bz-signin-submit-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in…'; }
    window._bzFreshSignIn = true; // explicit user action — see flag declaration above
    // Snapshot BEFORE the Firebase call
    const _preSignInSyncCount = window._bzBootSyncCompletedCount || 0;

    try {
        await auth.signInWithEmailAndPassword(email, password);
        // Credentials are confirmed
        if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing…';
        await _bzWaitForBootSyncSettle(_preSignInSyncCount, 6000);
        bzToast('✓ Welcome back!', 'success');
        hideAllAuthForms();
    } catch (err) {
        console.error('[BeatZen SignIn]', err.code, err.message);
        let msg = 'Sign-in failed. Try again.';
        if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential')
            msg = 'Incorrect email or password.';
        else if (err.code === 'auth/too-many-requests') msg = 'Too many attempts. Wait a moment and try again.';
        else if (err.code === 'auth/network-request-failed') msg = 'Network error. Check your connection.';
        else if (err.code === 'auth/invalid-email') msg = 'Enter a valid email address.';
        setFormError('bz-signin-error', msg);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In'; }
    }
}

// FORGOT PASSWORD

// Whitelisted production domains for the password-reset continueUrl
const BZ_PROD_RESET_DOMAINS = [
    'beatzen.in', 'www.beatzen.in',
    'beatzen.app', 'www.beatzen.app',
    'mr-ruthwik.github.io' // GitHub Pages test deployment — remove once no longer needed
];

function _bzIsProdOrigin() {
    return BZ_PROD_RESET_DOMAINS.indexOf(window.location.hostname) !== -1;
}

// Builds actionCodeSettings ONLY on a whitelisted production origin
function _bzGetResetActionCodeSettings() {
    if (!_bzIsProdOrigin()) return null;
    return {
        url: window.location.origin + window.location.pathname,
        handleCodeInApp: true
    };
}

// Helper: show only one step inside the forgot form
function showForgotStep(stepId) {
    ['bz-forgot-step-input', 'bz-forgot-step-sent', 'bz-forgot-step-reset', 'bz-forgot-step-done'].forEach(id => {
        const el = $(id);
        if (!el) return;
        if (id === stepId) {
            el.classList.remove('bz-hidden');
            el.style.display = '';
        } else {
            el.classList.add('bz-hidden');
            el.style.display = 'none';
        }
    });
}

// Step 1 → Step 2: send the reset email
async function handleForgotPassword() {
    const email = ($('bz-forgot-email')?.value || '').trim();
    setFormError('bz-forgot-error', '');

    if (!email) return setFormError('bz-forgot-error', 'Enter your email address.');
    const forgotEmailCheck = isValidEmail(email);
    if (!forgotEmailCheck.ok) return setFormError('bz-forgot-error', forgotEmailCheck.reason);

    const btn = $('bz-forgot-submit-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…'; }

    try {
        // continueUrl brings the user back to BeatZen after Firebase validates
        const actionCodeSettings = _bzGetResetActionCodeSettings();

        // Firebase throws auth/user-not-found if no account with this email
        if (actionCodeSettings) {
            await auth.sendPasswordResetEmail(email.toLowerCase(), actionCodeSettings);
        } else {
            await auth.sendPasswordResetEmail(email.toLowerCase());
        }

        // ✅ Step 2: show "Check your inbox"
        showForgotStep('bz-forgot-step-sent');

        // Listen for reset completion from the new tab that opens via
        try {
            const resetChannel = new BroadcastChannel('beatzen_reset_complete');
            resetChannel.onmessage = () => {
                resetChannel.close();
                hideAllAuthForms();
                showAuthForm('bz-email-signin-form');
            };
        } catch (e) { /* BroadcastChannel not supported in this browser */ }

    } catch (err) {
        console.error('[BeatZen ForgotPw]', err.code, err.message);
        let msg = 'Failed to send reset email. Try again.';
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential')
            msg = 'No account found with that email address.';
        else if (err.code === 'auth/network-request-failed') msg = 'Network error. Check your connection.';
        else if (err.code === 'auth/too-many-requests') msg = 'Too many attempts. Wait a few minutes.';
        else if (err.code === 'auth/invalid-email') msg = 'Enter a valid email address.';
        else if (err.code === 'auth/unauthorized-continue-uri' || err.code === 'auth/invalid-continue-uri' || err.code === 'auth/missing-continue-uri')
            msg = 'Reset link setup issue for this domain. Try again from beatzen.in or beatzen.app, or contact support.';
        setFormError('bz-forgot-error', msg);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reset Link'; }
    }
}

// Step 3 → Step 4: user submits new password
async function handleSetNewPassword(oobCode) {
    const newPw = $('bz-reset-password')?.value || '';
    const confirmPw = $('bz-reset-password-confirm')?.value || '';
    setFormError('bz-reset-error', '');

    if (newPw.length < 6) return setFormError('bz-reset-error', 'Password must be at least 6 characters.');
    if (newPw !== confirmPw) return setFormError('bz-reset-error', 'Passwords do not match.');

    const btn = $('bz-reset-submit-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }

    try {
        await auth.confirmPasswordReset(oobCode, newPw);

        // Clean the oobCode from the URL so it can't be replayed
        window.history.replaceState({}, document.title,
            window.location.origin + window.location.pathname);

        // ✅ Step 4: show "Password Changed Successfully"
        showForgotStep('bz-forgot-step-done');

        // Update the success screen: this is a dedicated reset tab opened
        const doneP = $('bz-forgot-step-done')?.querySelector('p');
        if (doneP) doneP.innerHTML = 'Your password has been updated. Head back to your <strong style="color:#a78bfa;">previous tab</strong> to sign in.';
        const doneBtn = $('bz-forgot-done-signin-btn');
        if (doneBtn) {
            doneBtn.innerHTML = '<i class="fas fa-times"></i> Close this tab';
            doneBtn.onclick = () => { window.close(); };
        }

        // Notify the original tab (stuck on "Check Your Inbox")
        try {
            const resetChannel = new BroadcastChannel('beatzen_reset_complete');
            resetChannel.postMessage('done');
            resetChannel.close();
        } catch (e) { /* BroadcastChannel not supported in this browser */ }

    } catch (err) {
        console.error('[BeatZen ResetPw]', err.code, err.message);
        if (err.code === 'auth/expired-action-code' || err.code === 'auth/invalid-action-code') {
            // Link expired or already used
            window.history.replaceState({}, document.title,
                window.location.origin + window.location.pathname);
            showForgotStep('bz-forgot-step-input');
            setFormError('bz-forgot-error',
                err.code === 'auth/expired-action-code'
                    ? 'This reset link has expired. Enter your email to get a new one.'
                    : 'This link has already been used. Enter your email to get a new one.');
        } else {
            const msg = (err.code === 'auth/weak-password')
                ? 'Password is too weak. Use at least 6 characters.'
                : 'Failed to reset password. Please try again.';
            setFormError('bz-reset-error', msg);
        }
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-key"></i> Set New Password'; }
    }
}

// Page-load: detect Firebase oobCode in URL
async function handlePasswordResetCode() {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const oobCode = params.get('oobCode');

    if (mode !== 'resetPassword' || !oobCode) return; // Not a password reset link

    // Navigate to the Settings tab so the reset form is actually
    function _goToSettings() {
        if (typeof window.displaySettings === 'function') {
            window.displaySettings();
            return;
        }
        // Fallback: click the settings nav link directly
        const sLink = document.getElementById('settings-link');
        if (sLink) sLink.click();
    }

    // Give script.js a tick to finish registering globals, then navigate
    setTimeout(_goToSettings, 80);

    try {
        // Verify the code is still valid before showing the form
        await auth.verifyPasswordResetCode(oobCode);

        // Open the forgot-password form and jump straight to step 3
        showAuthForm('bz-forgot-password-form');
        showForgotStep('bz-forgot-step-reset');

        // Make sure the signed-out auth panel is visible
        const authOut = $('bz-auth-signedout');
        if (authOut) authOut.style.display = '';

        // Wire the submit button with the confirmed oobCode
        const btn = $('bz-reset-submit-btn');
        if (btn) {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', () => handleSetNewPassword(oobCode));
        }

        // Enter key on confirm-password field
        const confirmInput = $('bz-reset-password-confirm');
        if (confirmInput) {
            confirmInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') handleSetNewPassword(oobCode);
            });
        }

    } catch (err) {
        console.error('[BeatZen oobCode verify]', err.code, err.message);

        // Code expired or already used
        const authOut = $('bz-auth-signedout');
        if (authOut) authOut.style.display = '';

        showAuthForm('bz-forgot-password-form');
        showForgotStep('bz-forgot-step-input');

        const msg = (err.code === 'auth/expired-action-code')
            ? 'This reset link has expired. Enter your email below to get a new one.'
            : 'This reset link has already been used. Enter your email below to get a new one.';
        setFormError('bz-forgot-error', msg);

        window.history.replaceState({}, document.title,
            window.location.origin + window.location.pathname);
    }
}

// Wire all email-auth buttons
function wireEmailAuthButtons() {
    const showSignup = $('bz-show-signup-btn');
    const showSignin = $('bz-show-signin-btn');
    if (showSignup) showSignup.addEventListener('click', () => showAuthForm('bz-email-signup-form'));
    if (showSignin) showSignin.addEventListener('click', () => showAuthForm('bz-email-signin-form'));

    ['bz-signup-back-btn', 'bz-signin-back-btn', 'bz-forgot-back-btn'].forEach(id => {
        const el = $(id);
        if (el) el.addEventListener('click', hideAllAuthForms);
    });

    const signupBtn = $('bz-signup-submit-btn');
    if (signupBtn) signupBtn.addEventListener('click', handleEmailSignUp);

    const signinBtn = $('bz-signin-submit-btn');
    if (signinBtn) {
        signinBtn.disabled = true;
        signinBtn.style.opacity = '0.45';
        signinBtn.style.cursor = 'not-allowed';
        signinBtn.addEventListener('click', handleEmailSignIn);
    }

    // Forgot password link from sign-in form
    const forgotLink = $('bz-forgot-link-btn');
    if (forgotLink) forgotLink.addEventListener('click', () => showAuthForm('bz-forgot-password-form'));

    // Forgot password submit (step 1)
    const forgotBtn = $('bz-forgot-submit-btn');
    if (forgotBtn) forgotBtn.addEventListener('click', handleForgotPassword);

    // Enter key on forgot email field
    const forgotEmailInput = $('bz-forgot-email');
    if (forgotEmailInput) {
        forgotEmailInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') handleForgotPassword();
        });
    }

    // Step 2 "Check inbox" → Back to Sign In button
    const gotoSignin = $('bz-forgot-goto-signin');
    if (gotoSignin) gotoSignin.addEventListener('click', () => {
        hideAllAuthForms();
        showAuthForm('bz-email-signin-form');
    });

    // Step 4 "Password Changed"
    const doneSininBtn = $('bz-forgot-done-signin-btn');
    if (doneSininBtn) doneSininBtn.addEventListener('click', () => {
        if (!window.close()) {
            // window.close() is blocked (tab not opened by script)
            hideAllAuthForms();
            showAuthForm('bz-email-signin-form');
        }
    });

    // Enable Sign In button only when email field has valid content
    const signinEmailInput = $('bz-signin-email');
    function updateSignInBtnState() {
        const btn = $('bz-signin-submit-btn');
        if (!btn) return;
        const val = (signinEmailInput?.value || '').trim();
        const valid = val.length >= 5 && isValidEmail(val).ok;
        btn.disabled = !valid;
        btn.style.opacity = valid ? '1' : '0.45';
        btn.style.cursor = valid ? 'pointer' : 'not-allowed';
    }
    if (signinEmailInput) {
        signinEmailInput.addEventListener('input', updateSignInBtnState);
    }

    // Enter key support
    const signupConfirm = $('bz-signup-confirm');
    if (signupConfirm) signupConfirm.addEventListener('keydown', e => { if (e.key === 'Enter') handleEmailSignUp(); });
    const signinPw = $('bz-signin-password');
    if (signinPw) signinPw.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const val = ($('bz-signin-email')?.value || '').trim();
            if (val.length >= 5 && isValidEmail(val).ok) handleEmailSignIn();
        }
    });
}

// NOTE: username sync + Sheets analytics moved out of this listener

// Bootstrap email auth wiring
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        wireEmailAuthButtons();
        handlePasswordResetCode(); // detect ?mode=resetPassword&oobCode= on page load
    });
} else {
    wireEmailAuthButtons();
    handlePasswordResetCode(); // detect ?mode=resetPassword&oobCode= on page load
}
// AUTH GATE INLINE FORMS

function bzGateShowPanel(panelId) {
    const panels = [
        'bz-gate-landing',
        'bz-gate-signup-form',
        'bz-gate-signin-form',
        'bz-gate-forgot-form'
    ];
    panels.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === panelId) ? '' : 'none';
    });
    // Flag which panel is active so CSS can grow the card into the wide
    const gateCard = document.querySelector('.bz-gate-card');
    if (gateCard) gateCard.setAttribute('data-active-panel', panelId);
}

function bzGateSetError(elId, msg) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg || '';
    el.style.display = msg ? '' : 'none';
}

// Gate Sign Up handler
function bzGateHandleSignUp() {
    const fullName = (document.getElementById('bz-gate-su-fullname')?.value || '').trim();
    const email = (document.getElementById('bz-gate-su-email')?.value || '').trim();
    const password = document.getElementById('bz-gate-su-password')?.value || '';
    const confirm = document.getElementById('bz-gate-su-confirm')?.value || '';

    bzGateSetError('bz-gate-su-error', '');

    if (!fullName) return bzGateSetError('bz-gate-su-error', 'Please enter your full name.');
    if (fullName.length < 2) return bzGateSetError('bz-gate-su-error', 'Full name must be at least 2 characters.');

    const emailCheck = isValidEmail(email);
    if (!emailCheck.ok) return bzGateSetError('bz-gate-su-error', emailCheck.reason);
    if (password.length < 6) return bzGateSetError('bz-gate-su-error', 'Password must be at least 6 characters.');
    if (password !== confirm) return bzGateSetError('bz-gate-su-error', 'Passwords do not match.');

    showEmailConfirmModal(email, () => bzGateDoCreateAccount(fullName, email, password));
}

async function bzGateDoCreateAccount(fullName, email, password) {
    const btn = document.getElementById('bz-gate-su-submit');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating…'; }
    window._bzFreshSignIn = true; // explicit user action — see flag declaration above
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        try { await cred.user.updateProfile({ displayName: fullName }); } catch (_) { }
        await db.collection('beatzen_users').doc(cred.user.uid).set({
            uid: cred.user.uid,
            email: email.toLowerCase(),
            fullName: fullName,
            provider: 'email',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        localStorage.setItem('beatzen_fullName', fullName);
        bzToast('✓ Account created! Welcome to Beat Zen', 'success');
        // onAuthStateChanged will fire and dismiss the gate automatically
    } catch (err) {
        let msg = 'Sign-up failed. Try again.';
        if (err.code === 'auth/email-already-in-use') msg = 'That email is already registered. Try signing in.';
        else if (err.code === 'auth/weak-password') msg = 'Password is too weak (min 6 characters).';
        else if (err.code === 'auth/network-request-failed') msg = 'Network error. Check your connection.';
        else if (err.code === 'auth/invalid-email') msg = 'Enter a valid email address.';
        else msg = 'Sign-up failed: ' + (err.message || err.code || 'unknown error');
        bzGateSetError('bz-gate-su-error', msg);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account'; }
    }
}

// Gate Sign In handler
async function bzGateHandleSignIn() {
    const email = (document.getElementById('bz-gate-si-email')?.value || '').trim();
    const password = document.getElementById('bz-gate-si-password')?.value || '';

    bzGateSetError('bz-gate-si-error', '');

    if (!email) return bzGateSetError('bz-gate-si-error', 'Enter your email address.');
    const emailCheck = isValidEmail(email);
    if (!emailCheck.ok) return bzGateSetError('bz-gate-si-error', emailCheck.reason);
    if (!password) return bzGateSetError('bz-gate-si-error', 'Enter your password.');

    const btn = document.getElementById('bz-gate-si-submit');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in…'; }
    window._bzFreshSignIn = true; // explicit user action — see flag declaration above
    // Snapshot BEFORE the Firebase call
    const _preSignInSyncCount = window._bzBootSyncCompletedCount || 0;

    try {
        await auth.signInWithEmailAndPassword(email, password);
        // onAuthStateChanged will fire and dismiss the gate automatically.
        if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing…';
        await _bzWaitForBootSyncSettle(_preSignInSyncCount, 6000);
        bzToast('✓ Welcome back!', 'success');
    } catch (err) {
        let msg = 'Sign-in failed. Try again.';
        if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential')
            msg = 'Incorrect email or password.';
        else if (err.code === 'auth/too-many-requests') msg = 'Too many attempts. Wait a moment and try again.';
        else if (err.code === 'auth/network-request-failed') msg = 'Network error. Check your connection.';
        else if (err.code === 'auth/invalid-email') msg = 'Enter a valid email address.';
        bzGateSetError('bz-gate-si-error', msg);
    } finally {
        if (btn) {
            const emailVal = (document.getElementById('bz-gate-si-email')?.value || '').trim();
            const isValid = emailVal.length >= 5 && isValidEmail(emailVal).ok;
            btn.disabled = !isValid;
            btn.style.opacity = isValid ? '1' : '0.45';
            btn.style.cursor = isValid ? 'pointer' : 'not-allowed';
            btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
        }
    }
}

// Gate Forgot Password handler
async function bzGateHandleForgotPassword() {
    const email = (document.getElementById('bz-gate-fp-email')?.value || '').trim();
    bzGateSetError('bz-gate-fp-error', '');

    if (!email) return bzGateSetError('bz-gate-fp-error', 'Enter your email address.');
    const emailCheck = isValidEmail(email);
    if (!emailCheck.ok) return bzGateSetError('bz-gate-fp-error', emailCheck.reason);

    const btn = document.getElementById('bz-gate-fp-submit');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…'; }

    try {
        // Same domain-gated continueUrl logic as handleForgotPassword()
        const actionCodeSettings = _bzGetResetActionCodeSettings();

        if (actionCodeSettings) {
            await auth.sendPasswordResetEmail(email.toLowerCase(), actionCodeSettings);
        } else {
            await auth.sendPasswordResetEmail(email.toLowerCase());
        }

        // Show step 2
        const step1 = document.getElementById('bz-gate-forgot-step1');
        const step2 = document.getElementById('bz-gate-forgot-step2');
        if (step1) step1.style.display = 'none';
        if (step2) step2.style.display = '';
    } catch (err) {
        // Was missing entirely before
        console.error('[BeatZen GateForgotPw]', err.code, err.message);
        let msg = 'Failed to send reset email. Try again.';
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential')
            msg = 'No account found with that email address.';
        else if (err.code === 'auth/network-request-failed') msg = 'Network error. Check your connection.';
        else if (err.code === 'auth/too-many-requests') msg = 'Too many attempts. Wait a few minutes.';
        else if (err.code === 'auth/invalid-email') msg = 'Enter a valid email address.';
        else if (err.code === 'auth/unauthorized-continue-uri' || err.code === 'auth/invalid-continue-uri' || err.code === 'auth/missing-continue-uri')
            msg = 'Reset link setup issue for this domain. Try again from beatzen.in or beatzen.app, or contact support.';
        bzGateSetError('bz-gate-fp-error', msg);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reset Link'; }
    }
}

// Wire gate form buttons
function wireAuthGateForms() {
    // Landing → forms
    const signupBtn = document.getElementById('bz-gate-signup-btn');
    if (signupBtn) signupBtn.addEventListener('click', () => bzGateShowPanel('bz-gate-signup-form'));

    const signinBtn = document.getElementById('bz-gate-signin-btn');
    if (signinBtn) signinBtn.addEventListener('click', () => bzGateShowPanel('bz-gate-signin-form'));

    // Back buttons
    const suBack = document.getElementById('bz-gate-signup-back');
    if (suBack) suBack.addEventListener('click', () => bzGateShowPanel('bz-gate-landing'));

    const siBack = document.getElementById('bz-gate-signin-back');
    if (siBack) siBack.addEventListener('click', () => bzGateShowPanel('bz-gate-landing'));

    const fpBack = document.getElementById('bz-gate-forgot-back');
    if (fpBack) fpBack.addEventListener('click', () => bzGateShowPanel('bz-gate-signin-form'));

    // Cross-links
    const suToSi = document.getElementById('bz-gate-su-to-si');
    if (suToSi) suToSi.addEventListener('click', () => bzGateShowPanel('bz-gate-signin-form'));

    const siToSu = document.getElementById('bz-gate-si-to-su');
    if (siToSu) siToSu.addEventListener('click', () => bzGateShowPanel('bz-gate-signup-form'));

    const fpToSi = document.getElementById('bz-gate-fp-to-si');
    if (fpToSi) fpToSi.addEventListener('click', () => bzGateShowPanel('bz-gate-signin-form'));

    const siForgot = document.getElementById('bz-gate-si-forgot');
    if (siForgot) siForgot.addEventListener('click', () => {
        bzGateShowPanel('bz-gate-forgot-form');
        // Reset forgot form
        const step1 = document.getElementById('bz-gate-forgot-step1');
        const step2 = document.getElementById('bz-gate-forgot-step2');
        if (step1) step1.style.display = '';
        if (step2) step2.style.display = 'none';
        const fpInput = document.getElementById('bz-gate-fp-email');
        if (fpInput) fpInput.value = '';
        bzGateSetError('bz-gate-fp-error', '');
    });

    const fpGotoSi = document.getElementById('bz-gate-fp-goto-si');
    if (fpGotoSi) fpGotoSi.addEventListener('click', () => bzGateShowPanel('bz-gate-signin-form'));

    // Submit buttons
    const suSubmit = document.getElementById('bz-gate-su-submit');
    if (suSubmit) suSubmit.addEventListener('click', bzGateHandleSignUp);

    const siSubmit = document.getElementById('bz-gate-si-submit');
    if (siSubmit) siSubmit.addEventListener('click', bzGateHandleSignIn);

    const fpSubmit = document.getElementById('bz-gate-fp-submit');
    if (fpSubmit) fpSubmit.addEventListener('click', bzGateHandleForgotPassword);

    // Enter key support
    const suConfirmInput = document.getElementById('bz-gate-su-confirm');
    if (suConfirmInput) suConfirmInput.addEventListener('keydown', e => { if (e.key === 'Enter') bzGateHandleSignUp(); });

    const siPwInput = document.getElementById('bz-gate-si-password');
    if (siPwInput) siPwInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const val = (document.getElementById('bz-gate-si-email')?.value || '').trim();
            if (val.length >= 5 && isValidEmail(val).ok) bzGateHandleSignIn();
        }
    });

    const fpEmailInput = document.getElementById('bz-gate-fp-email');
    if (fpEmailInput) fpEmailInput.addEventListener('keydown', e => { if (e.key === 'Enter') bzGateHandleForgotPassword(); });

    // Enable sign-in button only when email is valid
    const siEmailInput = document.getElementById('bz-gate-si-email');
    if (siEmailInput) {
        siEmailInput.addEventListener('input', function () {
            const btn = document.getElementById('bz-gate-si-submit');
            if (!btn) return;
            const val = (this.value || '').trim();
            const valid = val.length >= 5 && isValidEmail(val).ok;
            btn.disabled = !valid;
            btn.style.opacity = valid ? '1' : '0.45';
            btn.style.cursor = valid ? 'pointer' : 'not-allowed';
        });
    }
}

// Registered-users counter (hero)

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
        wireAuthGateForms();
    });
} else {
    wireAuthGateForms();
}