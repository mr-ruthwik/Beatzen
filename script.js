// Growth / marketing copy
window.BZ_PROMO_BULLETS = [];

// Manual "users left" counter (auth-gate hero)
window.BZ_MANUAL_OFFER_TOTAL = 100;
window.BZ_MANUAL_CURRENT_USERS = 28; // <-- EDIT THIS NUMBER MANUALLY

(function () {
    function paintManualUsersLeft() {
        const countEl = document.getElementById('bz-gate-live-count');
        if (!countEl) return;
        const left = Math.max(0, window.BZ_MANUAL_OFFER_TOTAL - window.BZ_MANUAL_CURRENT_USERS);
        countEl.textContent = left;
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', paintManualUsersLeft);
    } else {
        paintManualUsersLeft();
    }
})();

// ALBUM-ART ADAPTIVE PLAYER THEME
(function () {
    const mainPlayer = document.getElementById('main-player');
    const coverImg = document.getElementById('player-album-cover');
    if (!mainPlayer || !coverImg) return;

    const paletteCache = new Map(); // image src -> {c1, c2, c3}
    let loadToken = 0;              // guards against a slow, stale extraction
    // clobbering the theme after the user has already skipped to another

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0;
        const l = (max + min) / 2;
        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                default: h = (r - g) / d + 4;
            }
            h /= 6;
        }
        return [h * 360, s, l];
    }

    function colorDistance(a, b) {
        return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
    }

    // Nudge an {r,g,b} toward white (factor > 0) or black
    function shade(c, factor) {
        const clamp = v => Math.max(0, Math.min(255, v));
        let { r, g, b } = c;
        if (factor >= 0) {
            r = clamp(r + (255 - r) * factor);
            g = clamp(g + (255 - g) * factor);
            b = clamp(b + (255 - b) * factor);
        } else {
            r = clamp(r * (1 + factor));
            g = clamp(g * (1 + factor));
            b = clamp(b * (1 + factor));
        }
        return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
    }

    function hslToRgb(h, s, l) {
        h = ((h % 360) + 360) % 360 / 360;
        if (s <= 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        const hue2rgb = t => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        return {
            r: Math.round(hue2rgb(h + 1 / 3) * 255),
            g: Math.round(hue2rgb(h) * 255),
            b: Math.round(hue2rgb(h - 1 / 3) * 255),
        };
    }

    // Push a sampled color toward a richer
    function vividize(c, satBoost, minL, maxL) {
        const [h, s, l] = rgbToHsl(c.r, c.g, c.b);
        const newS = Math.min(1, s + satBoost);
        let newL = l;
        if (minL != null) newL = Math.max(newL, minL);
        if (maxL != null) newL = Math.min(newL, maxL);
        return hslToRgb(h, newS, newL);
    }

    function toRgbString(c) {
        return `rgb(${c.r}, ${c.g}, ${c.b})`;
    }

    function extractPalette(img) {
        const SIZE = 48;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE); // throws if CORS-tainted

        const STEP = 24; // quantization bucket size per channel
        const buckets = new Map();

        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 200) continue; // skip transparent pixels
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const [, s, l] = rgbToHsl(r, g, b);
            // Skip near-black / near-white / washed-out pixels so the palette
            if (l < 0.06 || l > 0.94 || s < 0.08) continue;
            const key = `${(r / STEP) | 0}_${(g / STEP) | 0}_${(b / STEP) | 0}`;
            const bucket = buckets.get(key);
            if (bucket) { bucket.count++; bucket.r += r; bucket.g += g; bucket.b += b; bucket.sat += s; }
            else buckets.set(key, { count: 1, r, g, b, sat: s });
        }

        // Rank by VIBRANCY, not raw pixel count. Pure frequency picks whatever
        const vibrancy = bkt => bkt.count * Math.pow(bkt.sat / bkt.count, 1.6);
        let sorted = [...buckets.values()].sort((a, b) => vibrancy(b) - vibrancy(a));

        // Flat / near-monochrome art (e.g. a plain logo placeholder)
        if (sorted.length === 0) {
            let r = 0, g = 0, b = 0, sat = 0, n = 0;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] < 200) continue;
                const rr = data[i], gg = data[i + 1], bb = data[i + 2];
                const [, s] = rgbToHsl(rr, gg, bb);
                r += rr; g += gg; b += bb; sat += s; n++;
            }
            n = n || 1;
            sorted = [{ count: n, r, g, b, sat }];
        }

        const top = sorted.slice(0, 5).map(bkt => ({
            r: Math.round(bkt.r / bkt.count),
            g: Math.round(bkt.g / bkt.count),
            b: Math.round(bkt.b / bkt.count),
        }));

        const c1 = top[0];
        const c2 = top.find(c => colorDistance(c, c1) > 60) || top[1] || c1;

        // Every stop is built as a *saturated* variant of a sampled hue
        return {
            c1: toRgbString(vividize(c1, -0.35, 0.14, 0.26)),  // dominant tone, dulled/muted
            c2: toRgbString(vividize(c2, 0.22, 0.40, 0.70)),  // secondary tone, punched up + lighter
            c3: toRgbString(vividize(c1, 0.32, 0.20, 0.28)),  // deep but still-vivid base tone
        };
    }

    function applyPalette(pal) {
        mainPlayer.style.setProperty('--bz-art-c1', pal.c1);
        mainPlayer.style.setProperty('--bz-art-c2', pal.c2);
        mainPlayer.style.setProperty('--bz-art-c3', pal.c3);
    }

    function updatePlayerTheme() {
        const src = coverImg.currentSrc || coverImg.src;
        if (!src) return;

        const cached = paletteCache.get(src);
        if (cached) { applyPalette(cached); return; }

        const token = ++loadToken;
        // Fetch through a detached Image (not the visible <img>) so a CORS
        const probe = new Image();
        probe.crossOrigin = 'anonymous';
        probe.onload = () => {
            if (token !== loadToken) return; // a newer song started meanwhile
            try {
                const pal = extractPalette(probe);
                paletteCache.set(src, pal);
                applyPalette(pal);
            } catch (err) {
                // Tainted canvas (no CORS headers on this image host) or a decode error
                console.warn('[BeatZen] Skipping adaptive theme for this cover:', err);
            }
        };
        probe.onerror = () => { /* leave current background as-is */ };
        probe.src = src;
    }

    coverImg.addEventListener('load', updatePlayerTheme);
    // The cover can already be loaded (browser cache) before this listener
    if (coverImg.complete && coverImg.naturalWidth > 0) updatePlayerTheme();

    window.bzUpdatePlayerTheme = updatePlayerTheme;
})();

// All scripts load with defer
(function () {

    // BZ POPUP ENGINE
    (function () {
        const OVERLAY_ID = 'bz-micro-popup';
        const ICONS = {
            danger: { bg: 'rgba(255,77,77,0.12)', border: 'rgba(255,77,77,0.30)', color: '#ff6b6b', fa: 'fa-exclamation-circle' },
            warning: { bg: 'rgba(243,156,18,0.12)', border: 'rgba(243,156,18,0.30)', color: '#f39c12', fa: 'fa-exclamation-triangle' },
            success: { bg: 'rgba(107,203,119,0.12)', border: 'rgba(107,203,119,0.30)', color: '#6bcb77', fa: 'fa-check-circle' },
            info: { bg: 'rgba(37,117,252,0.12)', border: 'rgba(37,117,252,0.30)', color: '#2575fc', fa: 'fa-info-circle' },
            playlist: { bg: 'rgba(124,58,237,0.12)', border: 'rgba(124,58,237,0.30)', color: '#a855f7', fa: 'fa-compact-disc' },
        };
        function getOverlay() {
            let el = document.getElementById(OVERLAY_ID);
            if (!el) {
                el = document.createElement('div');
                el.id = OVERLAY_ID;
                el.className = 'bz-clear-popup';
                el.setAttribute('role', 'dialog');
                el.setAttribute('aria-modal', 'true');
                document.body.appendChild(el);
            }
            return el;
        }
        function close() {
            const el = document.getElementById(OVERLAY_ID);
            if (!el) return;
            el.classList.remove('visible');
            if (el._esc) { document.removeEventListener('keydown', el._esc); el._esc = null; }
        }
        function open(type, title, body, btns, afterRender) {
            const ic = ICONS[type] || ICONS.info;
            const el = getOverlay();
            el.innerHTML = `
              <div class="bz-popup-box">
                <div class="bz-popup-icon" style="background:${ic.bg};border-color:${ic.border};color:${ic.color};">
                  <i class="fas ${ic.fa}"></i>
                </div>
                <p class="bz-popup-title">${title}</p>
                ${body ? `<p class="bz-popup-body">${body}</p>` : ''}
                <div class="bz-popup-actions">${btns}</div>
              </div>`;
            el.classList.add('visible');
            el.onclick = (e) => { if (e.target === el) close(); };
            el._esc = (e) => { if (e.key === 'Escape') close(); };
            document.addEventListener('keydown', el._esc);
            requestAnimationFrame(() => { if (afterRender) afterRender(el); else el.querySelector('button')?.focus(); });
            return el;
        }
        window.bzPopupClose = close;
        window.bzAlert = function (type, title, body) {
            open(type, title, body, `<button class="bz-popup-ok bz-popup-single" onclick="bzPopupClose()">OK</button>`);
        };
        window.bzConfirm = function (type, title, body, onOk, okLabel, cancelLabel) {
            const el = open(type, title, body,
                `<button class="bz-popup-cancel" onclick="bzPopupClose()">${cancelLabel || 'Cancel'}</button>
                 <button class="bz-popup-ok" id="_bzOk">${okLabel || 'Confirm'}</button>`);
            el.querySelector('#_bzOk').onclick = () => { close(); onOk && onOk(); };
            el.querySelector('#_bzOk')?.focus();
        };
        window.bzInput = function (type, title, placeholder, onOk) {
            const ic = ICONS[type] || ICONS.playlist;
            const el = getOverlay();
            el.innerHTML = `
              <div class="bz-popup-box">
                <div class="bz-popup-icon" style="background:${ic.bg};border-color:${ic.border};color:${ic.color};">
                  <i class="fas ${ic.fa}"></i>
                </div>
                <p class="bz-popup-title">${title}</p>
                <input id="_bzInp" type="text" placeholder="${placeholder}"
                  style="width:100%;padding:10px 14px;background:rgba(255,255,255,0.07);
                  border:1.5px solid rgba(255,255,255,0.15);border-radius:10px;color:#fff;
                  font-size:0.9rem;font-family:inherit;outline:none;box-sizing:border-box;margin-top:2px;">
                <div class="bz-popup-actions">
                  <button class="bz-popup-cancel" onclick="bzPopupClose()">Cancel</button>
                  <button class="bz-popup-ok" id="_bzOk">Create</button>
                </div>
              </div>`;
            el.classList.add('visible');
            el.onclick = (e) => { if (e.target === el) close(); };
            el._esc = (e) => { if (e.key === 'Escape') close(); };
            document.addEventListener('keydown', el._esc);
            const inp = el.querySelector('#_bzInp');
            const submit = () => {
                const v = inp.value.trim();
                if (!v) { inp.style.borderColor = '#ff6b6b'; inp.focus(); return; }
                close(); onOk && onOk(v);
            };
            el.querySelector('#_bzOk').onclick = submit;
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
            requestAnimationFrame(() => inp?.focus());
        };

        // Dropdown-of-reasons prompt (used by the admin "Decline" flow so every
        // rejected user gets one of a few clear, consistent reasons instead of
        // a generic "verification failed"). Falls back to a free-text field
        // when the admin picks the "Other" option.
        // onOk(reasonText, wasCustomText)
        window.bzSelect = function (type, title, options, onOk, okLabel) {
            const ic = ICONS[type] || ICONS.playlist;
            const el = getOverlay();
            const optsHtml = options.map(function (o, i) {
                return `<option value="${_bzEscapeHTML(o.value)}"${i === 0 ? ' selected' : ''}>${_bzEscapeHTML(o.label)}</option>`;
            }).join('');
            el.innerHTML = `
              <div class="bz-popup-box">
                <div class="bz-popup-icon" style="background:${ic.bg};border-color:${ic.border};color:${ic.color};">
                  <i class="fas ${ic.fa}"></i>
                </div>
                <p class="bz-popup-title">${title}</p>
                <select id="_bzSel"
                  style="width:100%;padding:10px 14px;background:rgba(255,255,255,0.07);
                  border:1.5px solid rgba(255,255,255,0.15);border-radius:10px;color:#fff;
                  font-size:0.9rem;font-family:inherit;outline:none;box-sizing:border-box;margin-top:2px;">
                  ${optsHtml}
                </select>
                <input id="_bzSelOther" type="text" placeholder="Type the reason the user will see…"
                  style="display:none;width:100%;padding:10px 14px;background:rgba(255,255,255,0.07);
                  border:1.5px solid rgba(255,255,255,0.15);border-radius:10px;color:#fff;
                  font-size:0.9rem;font-family:inherit;outline:none;box-sizing:border-box;margin-top:8px;">
                <div class="bz-popup-actions">
                  <button class="bz-popup-cancel" onclick="bzPopupClose()">Cancel</button>
                  <button class="bz-popup-ok" id="_bzOk">${okLabel || 'Confirm'}</button>
                </div>
              </div>`;
            el.classList.add('visible');
            el.onclick = (e) => { if (e.target === el) close(); };
            el._esc = (e) => { if (e.key === 'Escape') close(); };
            document.addEventListener('keydown', el._esc);
            const sel = el.querySelector('#_bzSel');
            const otherInp = el.querySelector('#_bzSelOther');
            sel.addEventListener('change', function () {
                const isOther = sel.value === '__other__';
                otherInp.style.display = isOther ? 'block' : 'none';
                if (isOther) otherInp.focus();
            });
            const submit = () => {
                const isOther = sel.value === '__other__';
                let value = sel.value;
                if (isOther) {
                    const v = otherInp.value.trim();
                    if (!v) { otherInp.style.borderColor = '#ff6b6b'; otherInp.focus(); return; }
                    value = v;
                }
                close(); onOk && onOk(value, isOther);
            };
            el.querySelector('#_bzOk').onclick = submit;
            requestAnimationFrame(() => sel?.focus());
        };
    })();


    // GOOGLE SHEETS DATA LOADER
    const BEATZEN_SHEET_URL = "https://script.google.com/macros/s/AKfycbwhDDOdtuLW89vwQQLlgwVPBwtj_Gk6VNxJoLsQnd4SnI8JbgySOD_PxtmTZNJSb_7R/exec";
    window.BEATZEN_SHEET_URL = BEATZEN_SHEET_URL; /* exposed for playlists.js live-sync */

    /* ── Loader helpers ── */
    /* ── Loader hide ── */
    function loaderHide() {
        // Loader is disabled — overlay starts hidden, nothing to do.
        const ov = document.getElementById('bz-loader-overlay');
        if (ov) { ov.style.display = 'none'; ov.style.opacity = '0'; ov.style.visibility = 'hidden'; }
    }

    // Escape user-controlled text before inserting into innerHTML Playlist
    function _bzEscapeHTML(str) {
        const d = document.createElement('div');
        d.textContent = String(str ?? '');
        return d.innerHTML;
    }


    // Shared "looks signed in" check
    function _bzLikelySignedIn() {
        return !!(localStorage.getItem('beatZen_session_uid') ||
            document.documentElement.classList.contains('bz-signed-in'));
    }

    // sanitizeSheetData
    function sanitizeSheetData(data) {
        if (!data || typeof data !== 'object') return data;

        function fixDuration(raw) {
            if (!raw && raw !== 0) return '';
            const s = String(raw).trim();
            if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) return s;
            const dateMatch = s.match(/(\d{1,2}):(\d{2}):(\d{2})/);
            if (dateMatch) {
                const h = parseInt(dateMatch[1], 10);
                const m = parseInt(dateMatch[2], 10);
                const sec = parseInt(dateMatch[3], 10);
                const totalSec = h * 3600 + m * 60 + sec;
                if (totalSec > 0) {
                    const mm = Math.floor(totalSec / 60);
                    const ss = String(totalSec % 60).padStart(2, '0');
                    return `${mm}:${ss}`;
                }
            }
            const n = parseFloat(s);
            if (!isNaN(n) && n > 0 && n < 1) {
                const totalSec = Math.round(n * 86400);
                const mm = Math.floor(totalSec / 60);
                const ss = String(totalSec % 60).padStart(2, '0');
                return `${mm}:${ss}`;
            }
            return s;
        }

        Object.values(data).forEach(albums => {
            if (!Array.isArray(albums)) return;
            albums.forEach(album => {
                if (!Array.isArray(album.songs)) return;
                album.songs.forEach(song => {
                    if (song && song.duration !== undefined) {
                        song.duration = fixDuration(song.duration);
                    }
                });
            });
        });
        return data;
    }
    window.sanitizeSheetData = sanitizeSheetData; /* exposed for playlists.js live-sync */

    // SMART DATA LOADER

    const SHEET_CACHE_KEY = 'beatZen_sheetData_v2';

    /* Persistent cache */
    function getCachedSheetData() {
        try {
            const raw = localStorage.getItem(SHEET_CACHE_KEY);
            if (!raw) return null;
            return sanitizeSheetData(JSON.parse(raw));
        } catch (_) { return null; }
    }

    function setCachedSheetData(data) {
        try {
            /* Store raw data as-is — sanitizeSheetData is applied on read */
            localStorage.setItem(SHEET_CACHE_KEY, JSON.stringify(data));
        } catch (_) { /* storage full — skip */ }
    }

    function startApp() {

        // FIX Bug 3: SPA-internal navigation depth counter. Incremented on every
        window._bzSpaNavDepth = 0;

        // HISTORY-TARGET PULSE STYLE (injected once)
        if (!document.getElementById('bz-history-target-style')) {
            const s = document.createElement('style');
            s.id = 'bz-history-target-style';
            s.textContent = `
                @keyframes bz-history-pulse {
                    0%   { background: rgba(37,117,252,0.00); box-shadow: none; }
                    25%  { background: rgba(37,117,252,0.18); box-shadow: 0 0 0 2px rgba(37,117,252,0.35); }
                    60%  { background: rgba(37,117,252,0.12); box-shadow: 0 0 0 2px rgba(37,117,252,0.20); }
                    100% { background: rgba(37,117,252,0.00); box-shadow: none; }
                }
                .bz-history-target {
                    animation: bz-history-pulse 1.6s ease forwards !important;
                    border-radius: 10px;
                }`;
            document.head.appendChild(s);
        }

        /* ── Back button styles (injected once) ── */
        // FIX: album-playlist-desc needs white-space:pre-line
        if (!document.getElementById('bz-playlist-desc-style')) {
            const _pds = document.createElement('style');
            _pds.id = 'bz-playlist-desc-style';
            _pds.textContent = `
                .album-playlist-desc {
                    white-space: pre-line;
                }`;
            document.head.appendChild(_pds);
        }

        if (!document.getElementById('bz-back-btn-style')) {
            const _bs = document.createElement('style');
            _bs.id = 'bz-back-btn-style';
            _bs.textContent = `
                .bz-album-nav-bar {
                    display: flex;
                    align-items: center;
                    padding: 0 0 4px 0;
                }
                .bz-back-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: auto;
                    height: 36px;
                    border-radius: 20px;
                    padding: 0 12px 0 10px;
                    gap: 6px;
                    border: none;
                    background: rgba(255,255,255,0.09);
                    border: 1px solid rgba(255,255,255,0.12);
                    color: #fff;
                    font-size: 0.88rem;
                    cursor: pointer;
                    transition: background 0.18s, transform 0.15s, border-color 0.18s;
                    flex-shrink: 0;
                }
                .bz-back-btn:hover {
                    background: rgba(255,255,255,0.16);
                    border-color: rgba(255,255,255,0.22);
                }
                .bz-back-btn:active {
                    transform: scale(0.92);
                }
                body.dark-mode .bz-back-btn {
                    background: rgba(255,255,255,0.06);
                    border-color: rgba(255,255,255,0.10);
                }
                .bz-back-label {
                    font-size: 0.82rem;
                    font-weight: 600;
                    letter-spacing: 0.01em;
                    white-space: nowrap;
                }
                .bz-album-nav-bar {
                    justify-content: space-between;
                }
                .bz-album-nav-dots {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    border: 1px solid rgba(255,255,255,0.12);
                    background: rgba(255,255,255,0.09);
                    color: #fff;
                    font-size: 0.95rem;
                    cursor: pointer;
                    transition: background 0.18s, transform 0.15s, border-color 0.18s;
                    flex-shrink: 0;
                }
                .bz-album-nav-dots:hover {
                    background: rgba(255,255,255,0.16);
                    border-color: rgba(255,255,255,0.22);
                }
                .bz-album-nav-dots:active {
                    transform: scale(0.92);
                }
                body.dark-mode .bz-album-nav-dots {
                    background: rgba(255,255,255,0.06);
                    border-color: rgba(255,255,255,0.10);
                }`;
            document.head.appendChild(_bs);
        }

        // INSTANT LAST-PLAYED RESTORE
        (function paintLastPlayedBar() {
            try {
                const raw = localStorage.getItem('lastPlayedSong');
                if (!raw) return;
                const saved = JSON.parse(raw);
                const { songId, albumId } = saved;
                if (!songId && !albumId) return;

                /* Priority 1: Use rich metadata saved directly in lastPlayedSong */
                let title = saved.title || '';
                let artist = saved.artist || '';
                let cover = saved.cover || '';

                /* Priority 2: Fallback — scan history for this song */
                if (!title) {
                    const hist = JSON.parse(localStorage.getItem('beatZen_history_auto') || '[]');
                    const entry = hist.find(h => String(h.id) === String(songId));
                    if (entry) {
                        title = entry.title || '';
                        artist = entry.artist || '';
                        cover = entry._coverUrl || entry.albumCover || '';
                    }
                }

                if (!title) return; /* Nothing useful to show yet — full restore will populate */

                // INSTANT AUDIO PRE-LOAD
                if (saved.url) {
                    try {
                        const _audioEl = document.getElementById('audio-player');
                        if (_audioEl) {
                            const _srcUnset = !_audioEl.src || _audioEl.src === window.location.href;
                            if (_srcUnset) {
                                _audioEl._bzInstantSrc = saved.url;
                                _audioEl.src = saved.url;
                                _audioEl.load();
                            }
                        }
                    } catch (_aErr) { /* silent — full restore will still handle it */ }
                }

                const titleEl = document.getElementById('player-song-title');
                const artistEl = document.getElementById('player-song-artist');
                const coverEl = document.getElementById('player-album-cover');

                if (titleEl) titleEl.textContent = title;
                if (artistEl) artistEl.textContent = artist;
                if (coverEl && cover) coverEl.src = cover;

                /* ── Reveal player bar (restore path) ──────────────────────── */
                (function _bzRevealPlayerRestore() {
                    var mp = document.getElementById('main-player');
                    if (mp) {
                        mp.classList.add('bz-player-active');
                        // Remove the inline failsafe styles added to the HTML element so the CSS
                        mp.style.removeProperty('transform');
                        mp.style.removeProperty('pointer-events');
                    }
                    document.body.classList.add('bz-has-player');
                })();


                // Fix: instant position paint on refresh
                try {
                    const posRaw = localStorage.getItem('beatZen_lastPosition');
                    if (posRaw) {
                        let savedTime = NaN, savedDur = NaN, savedPosId = '';
                        try {
                            const parsed = JSON.parse(posRaw);
                            if (parsed && typeof parsed === 'object' && 't' in parsed) {
                                savedTime = parseFloat(parsed.t);
                                savedDur = parseFloat(parsed.d);
                                savedPosId = String(parsed.id || '');
                            } else {
                                savedTime = parseFloat(posRaw);
                            }
                        } catch (_pe) { savedTime = parseFloat(posRaw); }

                        /* Only paint if position belongs to this song */
                        const posMatchesSong = !savedPosId || !songId || savedPosId === String(songId);
                        const _fmt = (s) => isNaN(s) ? '0:00' : `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

                        // FIX: paint duration independently of the savedTime>2 gate below
                        if (posMatchesSong) {
                            if (isFinite(savedDur) && savedDur > 0) {
                                document.querySelectorAll('#duration, #bz-lyrics-duration').forEach(el => el.textContent = _fmt(savedDur));
                            } else {
                                /* Duration not yet in payload (old save) — show placeholder */
                                document.querySelectorAll('#duration, #bz-lyrics-duration').forEach(el => el.textContent = '--:--');
                            }
                        }

                        if (posMatchesSong && isFinite(savedTime) && savedTime > 2) {
                            document.querySelectorAll('#current-time, #bz-lyrics-current-time').forEach(el => el.textContent = _fmt(savedTime));
                            if (isFinite(savedDur) && savedDur > 0) {
                                /* Paint progress bar width immediately */
                                const pct = Math.min(100, (savedTime / savedDur) * 100);
                                document.querySelectorAll('#progress, #bz-lyrics-progress').forEach(el => el.style.width = `${pct}%`);
                            }
                        }
                    }
                } catch (_posErr) { /* silent — cosmetic only */ }

            } catch (_) { /* silent — full restore will handle it */ }
        })();

        /* STATE */
        window.currentAlbum = null;
        window.playingAlbum = null;
        window.currentSongIndex = -1;
        window.isShuffling = localStorage.getItem('beatZen_shuffle') === 'true';
        // REPEAT MODE: 0 = off, 1 = repeat all (album/playlist loops)
        window.repeatMode = parseInt(localStorage.getItem('beatZen_repeat_mode') || '0', 10);
        if (![0, 1, 2].includes(window.repeatMode)) window.repeatMode = 0;
        // Legacy migration: old 'beatZen_loop' = true maps to mode 2
        if (!localStorage.getItem('beatZen_repeat_mode') && localStorage.getItem('beatZen_loop') === 'true') {
            window.repeatMode = 2;
            localStorage.setItem('beatZen_repeat_mode', '2');
        }
        window.isLooping = window.repeatMode === 2; // legacy compat alias used in several places
        // Tracks how many songs the current album/playlist had when it started
        window._bzSourceSongCount = 0;
        // Snapshot of manually-queued songs saved when repeat-all is turned
        window._bzPreRepeatAllQueue = null;
        window.isHistoryEnabled = localStorage.getItem('beatzen_history') === 'true';
        window.historyList = JSON.parse(localStorage.getItem('beatZen_history_auto') || '[]');
        // FIX Bug 8: pre-seed scrollPositions from localStorage so the first
        window.scrollPositions = {
            home: parseInt(localStorage.getItem('beatZen_scroll_home') || '0', 10) || 0,
            playlists: parseInt(localStorage.getItem('beatZen_scroll_playlists') || '0', 10) || 0,
            search: parseInt(localStorage.getItem('beatZen_scroll_search') || '0', 10) || 0,
            settings: parseInt(localStorage.getItem('beatZen_scroll_settings') || '0', 10) || 0
        };
        // FIX: the album/song-list view never had its own scroll position
        window._bzAlbumScrollKey = (albumId) => `beatZen_scroll_album_${albumId}`;
        window._bzGetAlbumScroll = (albumId) => {
            if (!albumId) return 0;
            return parseInt(localStorage.getItem(window._bzAlbumScrollKey(albumId)) || '0', 10) || 0;
        };
        window._bzSetAlbumScroll = (albumId, y) => {
            if (!albumId) return;
            localStorage.setItem(window._bzAlbumScrollKey(albumId), String(Math.max(0, Math.round(y))));
        };

        /* SEARCH KEYS */
        const RECENT_SEARCHES_KEY = 'beatZen_recentSearches';
        const RECENT_SEARCHES_ENABLED_KEY = 'beatZen_recentSearchesEnabled';
        const MAX_RECENT_SEARCHES = 5;

        let timerInterval = null;
        let isDragging = false;
        let selH = 0, selM = 0, selS = 0;

        /* DATA POOL */
        const allYears = Object.keys(customYearAlbumsData || {}).sort().reverse();
        const allAlbums = Object.values(customYearAlbumsData || {}).flat().filter(a => a && (a.id || a.title));
        const exploreList = typeof customGenreData !== 'undefined' ? Object.values(customGenreData).flat().filter(Boolean) : [];
        const playlistList = [];

        window.masterPool = [...allAlbums, ...exploreList, ...playlistList];

        const savedPlaylists = JSON.parse(localStorage.getItem('beatZen_importedPlaylists') || '[]');
        savedPlaylists.forEach(pl => {
            pl.id = String(pl.id);
            pl.isImported = true;
            pl.songs = (pl.songs || []).map(s => (typeof s === 'object' && s !== null) ? { ...s } : s);
            if (!window.masterPool.some(m => String(m.id || m.name) === pl.id)) window.masterPool.push(pl);
        });

        // SONG MAP
        window.allSongsMap = new Map();
        window.rebuildMasterMap = function () {
            window.allSongsMap.clear();

            // PASS 1 — index only from the authoritative Movie/Album pool.
            allAlbums.forEach(album => {
                if (!album || !Array.isArray(album.songs)) return;
                album.songs.forEach(song => {
                    if (!song || typeof song !== 'object') return;
                    const sId = String(song.id);
                    // Only write if not already present — first definition wins.
                    if (!window.allSongsMap.has(sId)) {
                        window.allSongsMap.set(sId, { ...song, album });
                    }
                });
            });

            // PASS 2 — index imported/user playlists that may contain full song
            window.masterPool.forEach(album => {
                if (!album || !Array.isArray(album.songs)) return;
                // Skip plain movie albums — already handled in Pass 1
                const isMovieAlbum = allAlbums.some(a => String(a.id) === String(album.id));
                if (isMovieAlbum) return;
                album.songs.forEach(song => {
                    if (!song || typeof song !== 'object') return;
                    const sId = String(song.id);
                    if (!window.allSongsMap.has(sId)) {
                        // Resolve source album for cover art
                        const sourceEntry = window.allSongsMap.get(sId);
                        const sourceAlbum = sourceEntry?.album || album;
                        window.allSongsMap.set(sId, { ...song, album: sourceAlbum });
                    }
                });
            });
        };
        window.rebuildMasterMap();

        // Migrate existing history entries:
        (function migrateHistoryAlbumFields() {
            try {
                const raw = localStorage.getItem('beatZen_history_auto');
                if (!raw) return;
                const list = JSON.parse(raw);
                let changed = false;

                function fixDur(v) {
                    if (!v && v !== 0) return '';
                    const s = String(v).trim();
                    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) return s;
                    const dm = s.match(/(\d{1,2}):(\d{2}):(\d{2})/);
                    if (dm) {
                        const tot = parseInt(dm[1], 10) * 3600 + parseInt(dm[2], 10) * 60 + parseInt(dm[3], 10);
                        if (tot > 0) return `${Math.floor(tot / 60)}:${String(tot % 60).padStart(2, '0')}`;
                    }
                    const n = parseFloat(s);
                    if (!isNaN(n) && n > 0 && n < 1) {
                        const tot = Math.round(n * 86400);
                        return `${Math.floor(tot / 60)}:${String(tot % 60).padStart(2, '0')}`;
                    }
                    return s;
                }

                list.forEach(entry => {
                    // Fix duration
                    const fixedDur = fixDur(entry.duration);
                    if (fixedDur !== String(entry.duration || '')) {
                        entry.duration = fixedDur;
                        changed = true;
                    }
                    // Fix album fields
                    if (!entry.albumId || !entry.albumTitle) {
                        const canonical = window.allSongsMap.get(String(entry.id));
                        const album = canonical?.album;
                        if (album) {
                            entry.albumId = String(album.id || '');
                            entry.albumTitle = album.title || album.name || entry.sourceName || '';
                            entry.albumCover = album.imageUrl || album.albumCover || entry._coverUrl || '';
                            changed = true;
                        } else if (entry.sourceName && !entry.albumTitle) {
                            entry.albumTitle = entry.sourceName;
                            entry.albumCover = entry._coverUrl || '';
                            changed = true;
                        }
                    }
                });
                if (changed) localStorage.setItem('beatZen_history_auto', JSON.stringify(list));
            } catch (e) { /* silent — don't break startup */ }
        })();

        // customArtistsData

        /* DOM REFERENCES */
        const audioPlayer = document.getElementById('audio-player');

        // HD Sound Enhancement
        (function initHDAudioChain() {
            try {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                if (!Ctx) return;
                audioPlayer.crossOrigin = 'anonymous';

                const ctx = new Ctx();
                const source = ctx.createMediaElementSource(audioPlayer);

                const lowCut = ctx.createBiquadFilter();
                lowCut.type = 'highpass';
                lowCut.frequency.value = 40;
                lowCut.Q.value = 0.7;

                // Bass shelf
                const bassBoost = ctx.createBiquadFilter();
                bassBoost.type = 'lowshelf';
                bassBoost.frequency.value = 130;

                // Vocal "body"
                const vocalBody = ctx.createBiquadFilter();
                vocalBody.type = 'peaking';
                vocalBody.frequency.value = 1000;
                vocalBody.Q.value = 0.9;

                // Vocal "presence/clarity"
                const clarityBoost = ctx.createBiquadFilter();
                clarityBoost.type = 'peaking';
                clarityBoost.frequency.value = 3200;
                clarityBoost.Q.value = 1;

                const hissCut = ctx.createBiquadFilter();
                hissCut.type = 'highshelf';
                hissCut.frequency.value = 13000;
                hissCut.gain.value = -4;

                const volumeBoost = ctx.createGain();
                volumeBoost.gain.value = 1; // unity gain — no artificial boost

                const compressor = ctx.createDynamicsCompressor();
                compressor.threshold.value = -3;
                compressor.knee.value = 6;
                compressor.ratio.value = 20;
                compressor.attack.value = 0.001;
                compressor.release.value = 0.1;

                source.connect(lowCut);
                lowCut.connect(bassBoost);
                bassBoost.connect(vocalBody);
                vocalBody.connect(clarityBoost);
                clarityBoost.connect(hissCut);
                hissCut.connect(volumeBoost);
                volumeBoost.connect(compressor);
                compressor.connect(ctx.destination);

                audioPlayer.addEventListener('play', () => {
                    if (ctx.state === 'suspended') ctx.resume().catch(() => { });
                });

                // Public API for a future frontend Bass / Vocal Clarity UI Percent-based
                const VOCAL_BODY_DB_AT_100 = 4;   // body-band boost at 100% clarity
                const CLARITY_DB_AT_100 = 7;      // presence-band boost at 100% clarity
                const DEFAULT_BASS_PERCENT = 50;    // "reduce bass 50% less"
                const DEFAULT_VOCAL_CLARITY_PERCENT = 100; // "vocals high audible"

                function setBassPercent(pct) {
                    pct = Math.max(0, Number(pct) || 0);
                    bassBoost.gain.value = pct <= 0 ? -60 : 20 * Math.log10(pct / 100);
                }
                function getBassPercent() {
                    return Math.round(100 * Math.pow(10, bassBoost.gain.value / 20));
                }
                function setVocalClarity(pct) {
                    pct = Math.max(0, Number(pct) || 0);
                    const scale = pct / 100;
                    vocalBody.gain.value = VOCAL_BODY_DB_AT_100 * scale;
                    clarityBoost.gain.value = CLARITY_DB_AT_100 * scale;
                }
                function getVocalClarity() {
                    return Math.round(100 * (clarityBoost.gain.value / CLARITY_DB_AT_100));
                }

                // Apply the requested defaults through the same API a future slider will
                setBassPercent(DEFAULT_BASS_PERCENT);
                setVocalClarity(DEFAULT_VOCAL_CLARITY_PERCENT);

                window.bzAudioFX = {
                    ctx, nodes: { lowCut, bassBoost, vocalBody, clarityBoost, hissCut, volumeBoost, compressor },
                    setBassPercent, getBassPercent,
                    setVocalClarity, getVocalClarity,
                    reset() {
                        setBassPercent(DEFAULT_BASS_PERCENT);
                        setVocalClarity(DEFAULT_VOCAL_CLARITY_PERCENT);
                    }
                };
            } catch (_) { /* silent — never block playback if Web Audio isn't available */ }
        })();

        // FIX: Volume Persistence
        (function restoreSavedVolume() {
            const v = parseFloat(localStorage.getItem('beatZen_volume'));
            if (!isNaN(v) && v >= 0 && v <= 1) audioPlayer.volume = v;
        })();

        // FIX: Gapless Playback – hidden preload buffer A second
        const _preloadAudio = document.createElement('audio');
        _preloadAudio.preload = 'auto';
        _preloadAudio.volume = 0;
        _preloadAudio.muted = true;
        _preloadAudio.setAttribute('aria-hidden', 'true');
        _preloadAudio.style.cssText =
            'position:fixed;top:-9999px;left:-9999px;width:0;height:0;pointer-events:none;';
        document.body.appendChild(_preloadAudio);

        let _gpIdx = -1;    // song index currently being pre-fetched
        let _gpReady = false; // true once canplaythrough fires
        let _gpSrc = '';    // URL that was prefetched

        function bzPreloadNext() {
            if (window.repeatMode === 2) return; // repeat-one: no need to prefetch next
            if (window._bzOffline) return;   // don't preload on no connection
            const nextIdx = (window.currentSongIndex ?? -1) + 1;
            const nextSong = window.playingAlbum?.songs?.[nextIdx];
            if (!nextSong?.url || nextIdx === _gpIdx) return;
            _gpIdx = nextIdx;
            _gpReady = false;
            _gpSrc = nextSong.url;
            _preloadAudio.oncanplaythrough = () => {
                if (_preloadAudio.src.endsWith(_gpSrc) || _preloadAudio.src === _gpSrc) {
                    _gpReady = true;
                }
            };
            // Reset preload index on error so playSong falls back to normal load()
            _preloadAudio.onerror = () => { _gpReady = false; _gpIdx = -1; };
            _preloadAudio.src = _gpSrc;
            try { _preloadAudio.load(); } catch (_) { /* ignore */ }
        }
        window._bzPreloadNext = bzPreloadNext;
        const playPauseBtn = document.getElementById('play-pause-btn');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const playerSongTitle = document.getElementById('player-song-title');
        const playerSongArtist = document.getElementById('player-song-artist');
        const playerAlbumCover = document.getElementById('player-album-cover');
        const progressBar = document.getElementById('progress-bar');
        const progress = document.getElementById('progress');
        const currentTimeSpan = document.getElementById('current-time');
        const durationSpan = document.getElementById('duration');
        const homeLink = document.getElementById('home-link');
        const searchLink = document.getElementById('search-link');
        const playlistsLink = document.getElementById('playlists-link');
        const artistsLink = document.getElementById('artists-link');
        const settingsLink = document.getElementById('settings-link');
        const profileLink = document.getElementById('profile-link');
        const updatesLink = document.getElementById('updates-link');
        const premiumLink = document.getElementById('premium-link');
        const darkModeToggle = document.getElementById('dark-mode-toggle');
        const searchContainer = document.getElementById('search-container');
        const yearSectionsContainer = document.getElementById('year-sections-container');
        const playlistsContainer = document.getElementById('playlists-container');
        const exploreContainer = playlistsContainer; /* alias — explore content now lives in playlists */
        const artistsContainer = document.getElementById('artists-container');
        const settingsContainer = document.getElementById('settings-container');
        const updatesContainer = document.getElementById('updates-container');
        const premiumContainer = document.getElementById('premium-container');
        const profileContainer = document.getElementById('profile-container');
        const albumViewContainer = document.getElementById('album-view-container');
        const albumMainContent = document.getElementById('album-main-content');
        const searchResultsContainer = document.getElementById('search-results-container');
        const timerBtn = document.getElementById('timer-btn');
        const timerPopup = document.getElementById('timer-popup');
        const timerMainHeading = timerPopup?.querySelector('h3');
        const timerSubText = document.getElementById('bz-timer-sub');
        const cancelTimerBtn = document.getElementById('cancel-timer-btn');
        const timerDisplay = document.getElementById('timer-display');
        const timerHeading = document.getElementById('timer-heading');
        const maximizeBtn = document.getElementById('maximize-btn');
        const mainPlayer = document.getElementById('main-player');
        const minimizeBtn = document.getElementById('minimize-btn');
        const closeTimerBtn = document.getElementById('close-timer-popup');
        const contactForm = document.getElementById('contact-form');
        const successPopup = document.getElementById('success-popup');
        const closeSuccessBtn = document.getElementById('close-success-popup');
        const timerEndedPopup = document.getElementById('timer-ended-popup');
        const actualSearchBar = document.getElementById('search-bar');
        const clearSearchBtn = document.getElementById('clear-search');



        const startTimerBtn = document.getElementById('start-timer-btn');

        /* SETTINGS */
        function applyDarkMode(enabled) {
            document.body.classList.toggle('dark-mode', enabled);
            localStorage.setItem('beatzen_dark_mode', enabled);
        }

        /* History storage key */
        const HISTORY_KEY = 'beatZen_history_auto';
        const HISTORY_MAX = 100;
        // Separate store for Repeat Rewind qualifying plays. Every completed
        const BZ_RR_PLAYS_KEY = 'beatZen_rr_plays';
        const BZ_RR_PLAYS_MAX = 500;
        const BZ_RR_LISTEN_SECS = 0;   // No minimum seconds threshold — every play qualifies
        const BZ_RR_MIN_PLAYS = 3;     // minimum qualifying plays to enter Repeat Rewind

        // Immediate cloud sync helper (silent, no toast)
        function _bzSyncNow() {
            if (typeof window.bzImmediateUpload === 'function') window.bzImmediateUpload();
        }

        /* ── PREMIUM ─────────────────────────────────────────────────────────
           A user is "premium" while window._bzIsPremium is true AND the clock
           hasn't passed window._bzPremiumExpiresAt. Both are seeded here from
           a localStorage cache (so gating doesn't flash unlocked on boot
           before Firestore resolves) and are kept live by auth.js's
           beatzen_users/{uid} listener and by bzRenderPremiumView() below. */
        window._bzIsPremium = localStorage.getItem('beatzen_premium') === 'true';
        window._bzPremiumExpiresAt = parseInt(localStorage.getItem('beatzen_premiumExpiresAt') || '0', 10) || 0;
        window._bzPremiumPlan = localStorage.getItem('beatzen_premiumPlan') || '';

        function bzIsPremiumUser() {
            return !!(window._bzIsPremium && window._bzPremiumExpiresAt && Date.now() < window._bzPremiumExpiresAt);
        }
        window.bzIsPremiumUser = bzIsPremiumUser;

        // Nav items that require an active premium subscription. Profile and
        // Premium itself are intentionally excluded — a locked-out user must
        // always be able to reach the Premium screen (and their own Profile).
        const BZ_PREMIUM_LOCKED_LINK_IDS = ['home-link', 'search-link', 'playlists-link', 'settings-link', 'updates-link'];
        const BZ_PREMIUM_LOCKED_VIEWS = ['home', 'search', 'playlists', 'settings', 'updates'];

        // Dims locked nav items + adds a small lock badge (see .bz-nav-locked
        // in style.css), and bounces the user off a locked view the instant
        // their premium expires while the app is already open.
        function bzApplyPremiumGating() {
            const unlocked = bzIsPremiumUser();
            BZ_PREMIUM_LOCKED_LINK_IDS.forEach(function (id) {
                const link = document.getElementById(id);
                const content = link && link.querySelector('.nav-link-content');
                if (content) content.classList.toggle('bz-nav-locked', !unlocked);
            });
            if (!unlocked && BZ_PREMIUM_LOCKED_VIEWS.indexOf(window.lastActiveView) !== -1) {
                if (typeof displayPremium === 'function') displayPremium();
            }
        }
        window.bzApplyPremiumGating = bzApplyPremiumGating;

        // Runs every second: re-applies gating (so a locked-out nav and the
        // forced redirect off a locked view happen within ~1s of expiry
        // instead of up to 30s late) and, once the Premium screen exists,
        // also refreshes its live countdown (see _bzUpdatePremiumCountdown).
        function _bzPremiumTick() {
            bzApplyPremiumGating();
            _bzUpdatePremiumCountdown();
        }
        _bzPremiumTick();
        setInterval(_bzPremiumTick, 1000);

        // Reads an <input type="file"> image, downsizes it to maxDim on its
        // longest edge and re-encodes as JPEG, returning a base64 data URL
        // small enough to store directly on a Firestore document field.
        function bzCompressImageToBase64(file, maxDim, quality) {
            return new Promise(function (resolve, reject) {
                const reader = new FileReader();
                reader.onerror = function () { reject(new Error('Could not read file')); };
                reader.onload = function (ev) {
                    const img = new Image();
                    img.onerror = function () { reject(new Error('Could not decode image')); };
                    img.onload = function () {
                        let w = img.naturalWidth || img.width;
                        let h = img.naturalHeight || img.height;
                        const scale = Math.min(1, (maxDim || 900) / Math.max(w, h));
                        w = Math.max(1, Math.round(w * scale));
                        h = Math.max(1, Math.round(h * scale));
                        const canvas = document.createElement('canvas');
                        canvas.width = w; canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, w, h);
                        try {
                            resolve(canvas.toDataURL('image/jpeg', quality || 0.72));
                        } catch (e) { reject(e); }
                    };
                    img.src = ev.target.result;
                };
                reader.readAsDataURL(file);
            });
        }

        let _bzPremiumSelectedPlan = { id: 'month', hours: 720, amount: 20 }; // matches the pre-selected card
        let _bzPremiumScreenshotBase64 = '';
        let _bzPremiumScreenshotFile = null; // original (uncompressed) file — used for on-device OCR so small text stays legible

        /* ─────────────────────────────────────────────────────────────────
           AUTOMATED PAYMENT-SCREENSHOT VERIFICATION
           Before a request ever reaches an admin, we run on-device OCR
           (Tesseract.js, loaded via CDN in index.html) over the uploaded
           screenshot and check two things in the extracted text:
             1. Today's date is present, in whatever format the app used.
             2. A recognizable UPI app / bank name (or "UPI" itself) is present.
           The date check below is format-agnostic: instead of guessing
           every string today's date could be written as (which breaks the
           moment some app spells a month differently — e.g. Google Pay's
           "Sept" — or a bank app uses its own layout), it pulls anything
           that *looks* like a date out of the text — numeric (5/9/2026,
           05-09-2026, 2026.09.05, 05092026...), with a month name
           (5 Sept 2026, Sept 5 2026, 5th September, 2026...), a month+day
           with NO year at all (common for same-day transactions), or a
           relative word ("Today", "Just now") — parses/matches it against
           today's real date, and never lets a written-but-wrong year slip
           through the no-year fallback. That works for any bank/UPI app
           without needing to know its exact format ahead of time.
           The UPI/bank-name check recognizes both third-party UPI apps
           (Google Pay, PhonePe, Paytm, ...) and the major Indian banks'
           own apps/net-banking, plus generic banking terms (IFSC, A/C no).
           This is a best-effort client-side check, not a payment-gateway
           verification — OCR can misread compressed/blurry screenshots, so
           treat it as a first filter that catches wrong/fake/unrelated
           screenshots, not a guarantee of authenticity. Genuine edge cases
           still get resolved by the admin's manual Accept/Decline either
           way (via the existing beatzen_premium_requests review flow).
           ───────────────────────────────────────────────────────────── */

        const _BZ_MONTH_ALIASES = {
            jan: 1, january: 1,
            feb: 2, february: 2,
            mar: 3, march: 3,
            apr: 4, april: 4,
            may: 5,
            jun: 6, june: 6,
            jul: 7, july: 7,
            aug: 8, august: 8,
            sep: 9, sept: 9, september: 9, // Google Pay spells this one "Sept"
            oct: 10, october: 10,
            nov: 11, november: 11,
            dec: 12, december: 12
        };
        const _BZ_MONTH_WORD_RE = '(' + Object.keys(_BZ_MONTH_ALIASES).join('|') + ')';

        function _bzTextHasTodayDate(text) {
            const now = new Date();
            const todayDay = now.getDate();
            const todayMonth = now.getMonth() + 1;
            const todayYear = now.getFullYear();
            const todayYearShort = todayYear % 100;

            function yearMatches(y) {
                return y >= 1000 ? y === todayYear : y === todayYearShort;
            }
            function isTodayDMY(day, month, year) {
                return day === todayDay && month === todayMonth && yearMatches(year);
            }
            // Tries every reasonable way to assign three raw numbers to
            // (day, month, year) — covers DD/MM/YYYY, MM/DD/YYYY,
            // YYYY/MM/DD and every other ordering, without needing to know
            // which convention a given app used.
            function anyOrderMatchesToday(a, b, c) {
                return isTodayDMY(a, b, c) || isTodayDMY(a, c, b) ||
                    isTodayDMY(b, a, c) || isTodayDMY(b, c, a) ||
                    isTodayDMY(c, a, b) || isTodayDMY(c, b, a);
            }

            // Many UPI apps (Google Pay in particular) label a same-day
            // transaction with a relative word instead of a written date —
            // "Today", "Just now" — rather than any digits at all. Treat
            // those as an immediate pass before trying to parse a date out
            // of the text.
            const lower = (text || '').toLowerCase();
            if (/\btoday\b/.test(lower) || /\bjust now\b/.test(lower)) return true;

            // Strip time-of-day (e.g. "10:36 am") first so it's never
            // mistaken for part of a date.
            const clean = (text || '').replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b/gi, ' ');
            let m;

            // ── Numeric, separated: 5/9/2026, 05-09-2026, 2026.09.05 ──
            const numRe = /\b(\d{1,4})[\/\-.](\d{1,4})[\/\-.](\d{1,4})\b/g;
            while ((m = numRe.exec(clean))) {
                if (anyOrderMatchesToday(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10))) return true;
            }

            // ── Numeric, no separators: 05092026, 050926 ──
            const compactRe = /\b(\d{6}|\d{8})\b/g;
            while ((m = compactRe.exec(clean))) {
                const s = m[1];
                // Each candidate is [dayStr, monthStr, yearStr].
                const candidates = s.length === 8 ? [
                    [s.slice(0, 2), s.slice(2, 4), s.slice(4, 8)], // DDMMYYYY
                    [s.slice(2, 4), s.slice(0, 2), s.slice(4, 8)], // MMDDYYYY
                    [s.slice(6, 8), s.slice(4, 6), s.slice(0, 4)]  // YYYYMMDD
                ] : [
                    [s.slice(0, 2), s.slice(2, 4), s.slice(4, 6)], // DDMMYY
                    [s.slice(2, 4), s.slice(0, 2), s.slice(4, 6)], // MMDDYY
                    [s.slice(4, 6), s.slice(2, 4), s.slice(0, 2)]  // YYMMDD
                ];
                for (let i = 0; i < candidates.length; i++) {
                    if (isTodayDMY(parseInt(candidates[i][0], 10), parseInt(candidates[i][1], 10), parseInt(candidates[i][2], 10))) return true;
                }
            }

            // ── Month name, either order: "5 Sept 2026" / "Sept 5, 2026" ──
            const dmyRe = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s,]+' + _BZ_MONTH_WORD_RE + '[\\s,]+(\\d{2,4})\\b', 'gi');
            while ((m = dmyRe.exec(clean))) {
                if (isTodayDMY(parseInt(m[1], 10), _BZ_MONTH_ALIASES[m[2].toLowerCase()], parseInt(m[3], 10))) return true;
            }
            const mdyRe = new RegExp('\\b' + _BZ_MONTH_WORD_RE + '[\\s,]+(\\d{1,2})(?:st|nd|rd|th)?[\\s,]+(\\d{2,4})\\b', 'gi');
            while ((m = mdyRe.exec(clean))) {
                if (isTodayDMY(parseInt(m[2], 10), _BZ_MONTH_ALIASES[m[1].toLowerCase()], parseInt(m[3], 10))) return true;
            }

            // ── Month name, NO year: "5 Sept" / "Sept 5" ──
            // Some apps (Google Pay in particular) drop the year entirely
            // for a recent transaction. The negative lookahead/lookbehind-
            // free guards below make sure this only fires when there is no
            // year-like number actually present — if a year IS written
            // (even a wrong one), the stricter regexes above already
            // handled it, and this loose fallback must not paper over a
            // genuinely wrong year by matching just the day+month part of it.
            const dmNoYearRe = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s,]+' + _BZ_MONTH_WORD_RE + '\\b(?![\\s,]*\\d)', 'gi');
            while ((m = dmNoYearRe.exec(clean))) {
                if (parseInt(m[1], 10) === todayDay && _BZ_MONTH_ALIASES[m[2].toLowerCase()] === todayMonth) return true;
            }
            const mdNoYearRe = new RegExp('(?:^|[^\\d])' + _BZ_MONTH_WORD_RE + '[\\s,]+(\\d{1,2})(?:st|nd|rd|th)?\\b(?![\\s,]*\\d)', 'gi');
            while ((m = mdNoYearRe.exec(clean))) {
                if (parseInt(m[2], 10) === todayDay && _BZ_MONTH_ALIASES[m[1].toLowerCase()] === todayMonth) return true;
            }

            return false;
        }

        function _bzTextHasUpiSignal(text) {
            const norm = (text || '').toLowerCase();
            const keywords = [
                // UPI apps
                'upi', 'unified payments', 'google pay', 'gpay', 'g pay', 'phonepe', 'phone pe',
                'paytm', 'bhim', 'amazon pay', 'whatsapp pay', 'cred', 'navi', 'mobikwik',
                'freecharge',
                // Handles / reference terms
                '@ybl', '@okaxis', '@okhdfcbank', '@okicici', '@oksbi', '@okbizaxis',
                '@paytm', '@apl', 'utr', 'upi ref', 'upi id', 'vpa', 'transaction id',
                'beatzenapp', '@naviaxis',
                // Major Indian banks — covers screenshots from a bank's own
                // app/net-banking rather than a third-party UPI app.
                'state bank of india', 'sbi', 'hdfc bank', 'hdfc', 'icici bank', 'icici',
                'axis bank', 'kotak mahindra', 'kotak', 'punjab national bank', 'pnb',
                'bank of baroda', 'canara bank', 'union bank of india', 'union bank',
                'indusind bank', 'indusind', 'yes bank', 'idfc first bank', 'idfc',
                'federal bank', 'rbl bank', 'bandhan bank', 'central bank of india',
                'indian bank', 'indian overseas bank', 'uco bank', 'idbi bank', 'idbi',
                'bank of india', 'bank of maharashtra', 'south indian bank', 'karnataka bank',
                'city union bank', 'dcb bank', 'au small finance bank', 'equitas', 'ujjivan',
                'karur vysya bank', 'jammu and kashmir bank',
                // Generic banking terms that show up on most receipts
                'ifsc', 'a/c no', 'account number', 'net banking', 'bank a/c'
            ];
            return keywords.some(function (k) { return norm.indexOf(k) !== -1; });
        }

        function _bzWithTimeout(promise, ms) {
            return new Promise(function (resolve, reject) {
                const timer = setTimeout(function () { reject(new Error('Verification timed out')); }, ms);
                promise.then(
                    function (v) { clearTimeout(timer); resolve(v); },
                    function (e) { clearTimeout(timer); reject(e); }
                );
            });
        }

        // Runs OCR on the screenshot and checks it against: today's date and a
        // UPI app/bank name. Resolves { ok:true } on a pass, or
        // { ok:false, reason } with a human-readable explanation.
        async function bzVerifyPaymentScreenshot(imageSource) {
            if (typeof Tesseract === 'undefined' || !Tesseract.createWorker) {
                return { ok: false, reason: "Couldn't run screenshot verification right now (verification tool failed to load). Check your connection and tap Try Again." };
            }

            let text = '';
            let ocrData = null;
            let worker = null;
            try {
                worker = await _bzWithTimeout(Tesseract.createWorker('eng'), 20000);
                const result = await _bzWithTimeout(worker.recognize(imageSource), 25000);
                ocrData = (result && result.data) || null;
                text = (ocrData && ocrData.text) || '';
            } catch (e) {
                console.error('Beat Zen: OCR failed', e);
                return { ok: false, reason: "We couldn't read that screenshot clearly. Please upload a clear, uncropped screenshot of your UPI payment confirmation and tap Try Again." };
            } finally {
                if (worker) { try { await worker.terminate(); } catch (_) { } }
            }

            const hasDate = _bzTextHasTodayDate(text);
            const hasUpi = _bzTextHasUpiSignal(text);

            const checks = [
                { label: "Today's date", passed: hasDate },
                { label: 'A UPI app / bank name', passed: hasUpi }
            ];

            if (hasDate && hasUpi) return { ok: true, checks: checks };

            return { ok: false, checks: checks };
        }

        // Writes (or overwrites) this user's premium request doc. Document ID
        // is the uid itself — one active request per user — so "returning to
        // Premium while pending always shows this verification state" is just
        // a plain doc read/listen, no querying needed.
        async function bzSubmitPremiumRequest() {
            const submitBtn = document.getElementById('bz-premium-submit-btn');
            const user = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
            if (!user) { if (typeof bzToast === 'function') bzToast('Sign in first', 'warning'); return; }
            if (typeof db === 'undefined') { showToast("Couldn't reach the server — check your connection."); return; }
            if (!_bzPremiumScreenshotBase64) { showToast('Upload a payment screenshot first.'); return; }
            if (!_bzPremiumSelectedPlan || !_bzPremiumSelectedPlan.id) { showToast('Select a plan first.'); return; }

            if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Verifying Screenshot…'; }

            // Auto-check the screenshot (date / UPI name) BEFORE this ever
            // reaches an admin. A failed check rejects immediately and sends
            // the user to the "Payment Failed" view with Try Again — nothing
            // gets written to Firestore for a screenshot that fails here.
            const verification = await bzVerifyPaymentScreenshot(_bzPremiumScreenshotFile || _bzPremiumScreenshotBase64);
            if (!verification.ok) {
                _bzShowPremiumVerificationFailed(verification);
                if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit for Verification'; }
                return;
            }

            if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Submitting…';
            try {
                const cached = typeof bzCachedIdentity === 'function' ? bzCachedIdentity() : {};
                // Screenshot already passed auto-verification above, so grant
                // Premium immediately instead of waiting on manual admin review.
                // The request doc (with screenshot) is still written for the
                // Admin Dashboard — flagged autoApproved so admin can double
                // check it later (including that the amount paid matches the
                // selected plan) and Cancel Premium if it turns out invalid.
                const grantedPlan = _bzPremiumSelectedPlan;
                const expiresAt = Date.now() + grantedPlan.hours * 3600000;
                await db.collection('beatzen_premium_requests').doc(user.uid).set({
                    userId: user.uid,
                    name: user.displayName || cached.name || '',
                    email: user.email || (cached.email || '').replace(/^@/, ''),
                    photoURL: user.photoURL || cached.photoURL || '',
                    plan: grantedPlan.id,
                    hours: grantedPlan.hours,
                    amount: grantedPlan.amount,
                    screenshot: _bzPremiumScreenshotBase64,
                    status: 'active',
                    autoApproved: true,
                    expiresAt: expiresAt,
                    submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    approvedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                await db.collection('beatzen_users').doc(user.uid).set({
                    premium: true,
                    premiumExpiresAt: expiresAt
                }, { merge: true });
                // The live listener started in bzRenderPremiumView() flips the
                // screen to "Activated" the instant this write lands.
            } catch (e) {
                console.error('Beat Zen: premium request submit failed', e);
                showToast("Couldn't submit your request — please try again.");
                if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit for Verification'; }
            }
        }

        function _bzShowPremiumSubView(name) {
            ['plans', 'pending', 'active', 'failed'].forEach(function (v) {
                const el = document.getElementById('bz-premium-' + v + '-view');
                if (el) el.style.display = (v === name) ? '' : 'none';
            });
            window.scrollTo({ top: 0, behavior: 'instant' });
        }

        // Local (client-side) rejection — used when the automated screenshot
        // check fails, before anything is ever submitted to an admin. Renders
        // the three requirements as a checklist (pass/fail) instead of one
        // run-on sentence.
        function _bzShowPremiumVerificationFailed(verification) {
            const reasonEl = document.getElementById('bz-premium-failed-reason');
            const listEl = document.getElementById('bz-premium-failed-checklist');
            const instructionEl = document.getElementById('bz-premium-failed-instruction');

            if (verification && Array.isArray(verification.checks)) {
                if (reasonEl) { reasonEl.style.display = 'none'; reasonEl.textContent = ''; }
                if (listEl) {
                    listEl.innerHTML = verification.checks.map(function (c) {
                        return '<li class="' + (c.passed ? 'bz-check-pass' : 'bz-check-fail') + '">' +
                            '<i class="fas ' + (c.passed ? 'fa-check-circle' : 'fa-times-circle') + '"></i>' +
                            '<span>' + _bzEscapeHTML(c.label) + '</span></li>';
                    }).join('');
                    listEl.style.display = '';
                }
                if (instructionEl) {
                    instructionEl.textContent = "Please upload a proper screenshot of today's UPI payment and tap Try Again.";
                    instructionEl.style.display = '';
                }
            } else {
                if (reasonEl) {
                    reasonEl.style.display = '';
                    reasonEl.textContent = (verification && verification.reason) || "We couldn't verify your payment screenshot. Please upload a proper screenshot and try again.";
                }
                if (listEl) { listEl.style.display = 'none'; listEl.innerHTML = ''; }
                if (instructionEl) { instructionEl.style.display = 'none'; instructionEl.textContent = ''; }
            }
            _bzShowPremiumSubView('failed');
        }

        let _bzPremiumRequestUnsub = null;
        function _bzStopPremiumRequestListener() {
            if (_bzPremiumRequestUnsub) { _bzPremiumRequestUnsub(); _bzPremiumRequestUnsub = null; }
        }

        // Plan id ('trial' / 'month') → the same human-readable label shown
        // on the plan cards and in the Admin Dashboard.
        function _bzPremiumPlanLabel(id) {
            return id === 'trial' ? '1 Day Trial' : (id === 'month' ? '1 Month' : 'Premium');
        }

        // "5 Sep 2026, 11:59 PM"
        function _bzFormatPremiumEndDate(ms) {
            if (!ms) return '—';
            try {
                return new Date(ms).toLocaleString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                    hour: 'numeric', minute: '2-digit', hour12: true
                });
            } catch (_) { return '—'; }
        }

        // Live "time left" readout shown under the expiry line on the
        // Activated view — no label, just the countdown itself
        // (e.g. "13d 05h 42m 18s", or "05h 42m 18s" once under a day left).
        function _bzFormatPremiumCountdown(ms) {
            if (ms <= 0) return '0s';
            const totalSec = Math.floor(ms / 1000);
            const d = Math.floor(totalSec / 86400);
            const h = Math.floor((totalSec % 86400) / 3600);
            const m = Math.floor((totalSec % 3600) / 60);
            const s = totalSec % 60;
            const parts = [];
            if (d > 0) parts.push(d + 'd');
            if (d > 0 || h > 0) parts.push(String(h).padStart(2, '0') + 'h');
            if (d > 0 || h > 0 || m > 0) parts.push(String(m).padStart(2, '0') + 'm');
            parts.push(String(s).padStart(2, '0') + 's');
            return parts.join(' ');
        }

        // Called every second by _bzPremiumTick. Keeps the "Activated" view's
        // sub-line showing the plan + exact expiry, and — the instant the
        // clock passes expiresAt — flips the local premium flag off,
        // re-applies gating immediately, and (only if that view is still the
        // one on screen) bounces it back to the plan picker instead of
        // leaving a stale "Active" screen up.
        function _bzUpdatePremiumCountdown() {
            const sub = document.getElementById('bz-premium-active-sub');
            const countdownEl = document.getElementById('bz-premium-active-countdown');
            if (!sub || !window._bzPremiumExpiresAt) return;
            const remaining = window._bzPremiumExpiresAt - Date.now();
            if (remaining <= 0) {
                window._bzIsPremium = false;
                try { localStorage.setItem('beatzen_premium', 'false'); } catch (_) { /* private browsing, etc — non-fatal */ }
                bzApplyPremiumGating();
                const activeView = document.getElementById('bz-premium-active-view');
                if (activeView && activeView.style.display !== 'none') _bzShowPremiumSubView('plans');
                return;
            }
            sub.innerHTML = 'Your premium plan of ' + _bzEscapeHTML(_bzPremiumPlanLabel(window._bzPremiumPlan)) +
                ' ends in<br>' + _bzEscapeHTML(_bzFormatPremiumEndDate(window._bzPremiumExpiresAt));
            if (countdownEl) countdownEl.textContent = _bzFormatPremiumCountdown(remaining);
        }

        // planId is optional — omit it (e.g. when just re-showing an
        // already-cached premium state) to keep whatever plan is already
        // stored, or pass it (from a Firestore request doc's `plan` field)
        // to update it.
        function _bzSetPremiumActiveLocal(expiresAt, planId) {
            window._bzIsPremium = true;
            window._bzPremiumExpiresAt = expiresAt || 0;
            if (planId !== undefined) window._bzPremiumPlan = planId || '';
            try {
                localStorage.setItem('beatzen_premium', 'true');
                localStorage.setItem('beatzen_premiumExpiresAt', String(window._bzPremiumExpiresAt));
                if (planId !== undefined) localStorage.setItem('beatzen_premiumPlan', window._bzPremiumPlan);
            } catch (_) { /* private browsing, etc — non-fatal */ }
            bzApplyPremiumGating();
            _bzUpdatePremiumCountdown();
        }

        // Decides which of the four Premium sub-views to show, and — while a
        // request is pending — keeps a live listener open so an admin's
        // Accept/Decline is reflected on screen instantly, no refresh needed.
        function bzRenderPremiumView() {
            _bzStopPremiumRequestListener();

            // Already premium and not expired: Premium reads as a status
            // page (with the real expiry) rather than a sales pitch.
            if (bzIsPremiumUser()) {
                _bzSetPremiumActiveLocal(window._bzPremiumExpiresAt);
                _bzShowPremiumSubView('active');
                return;
            }

            const user = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
            if (!user || typeof db === 'undefined') {
                _bzShowPremiumSubView('plans');
                return;
            }

            _bzPremiumRequestUnsub = db.collection('beatzen_premium_requests').doc(user.uid)
                .onSnapshot(function (snap) {
                    if (!snap.exists) { _bzShowPremiumSubView('plans'); return; }
                    const d = snap.data() || {};
                    if (d.status === 'pending') {
                        _bzShowPremiumSubView('pending');
                    } else if (d.status === 'active') {
                        if (d.expiresAt && Date.now() < d.expiresAt) {
                            _bzSetPremiumActiveLocal(d.expiresAt, d.plan);
                            _bzShowPremiumSubView('active');
                        } else {
                            // Approved previously but has since expired.
                            window._bzIsPremium = false;
                            try { localStorage.setItem('beatzen_premium', 'false'); } catch (_) { }
                            bzApplyPremiumGating();
                            _bzShowPremiumSubView('plans');
                        }
                    } else if (d.status === 'failed') {
                        // Admin-declined request — a free-text reason, not our
                        // structured OCR checklist, so make sure any leftover
                        // checklist/instruction from a prior local rejection is cleared.
                        _bzShowPremiumSubView('failed');
                        const reasonEl = document.getElementById('bz-premium-failed-reason');
                        if (reasonEl) {
                            reasonEl.style.display = '';
                            reasonEl.textContent = d.declineReason || "We couldn't verify your payment. Please try again.";
                        }
                        const listEl = document.getElementById('bz-premium-failed-checklist');
                        if (listEl) { listEl.style.display = 'none'; listEl.innerHTML = ''; }
                        const instructionEl = document.getElementById('bz-premium-failed-instruction');
                        if (instructionEl) { instructionEl.style.display = 'none'; instructionEl.textContent = ''; }
                    } else {
                        _bzShowPremiumSubView('plans');
                    }
                }, function (err) {
                    console.warn('[BeatZen] Premium request listener failed:', err && err.message);
                    _bzShowPremiumSubView('plans');
                });
        }
        window.bzRenderPremiumView = bzRenderPremiumView;

        // Wires every control on the Premium screen. The markup is static
        // (lives in index.html, unlike the Admin Dashboard), so this only
        // ever needs to run once.
        let _bzPremiumUIInited = false;
        function bzInitPremiumUI() {
            if (_bzPremiumUIInited) return;
            _bzPremiumUIInited = true;

            const amountValueEl = document.getElementById('bz-premium-amount-value');
            document.querySelectorAll('#bz-premium-plans-grid .bz-premium-plan-card').forEach(function (card) {
                card.addEventListener('click', function () {
                    document.querySelectorAll('#bz-premium-plans-grid .bz-premium-plan-card').forEach(function (c) { c.classList.remove('selected'); });
                    card.classList.add('selected');
                    _bzPremiumSelectedPlan = {
                        id: card.getAttribute('data-plan'),
                        hours: parseInt(card.getAttribute('data-hours'), 10) || 0,
                        amount: parseInt(card.getAttribute('data-amount'), 10) || 0
                    };
                    if (amountValueEl) amountValueEl.textContent = '₹' + _bzPremiumSelectedPlan.amount;
                });
            });

            const copyBtn = document.getElementById('bz-premium-copy-upi-btn');
            const upiIdEl = document.getElementById('bz-premium-upi-id');
            if (copyBtn && upiIdEl) {
                copyBtn.addEventListener('click', async function () {
                    const id = upiIdEl.textContent.trim();
                    try {
                        await navigator.clipboard.writeText(id);
                        showToast('✓ UPI ID copied!');
                    } catch (_) {
                        const ta = document.createElement('textarea');
                        ta.value = id;
                        ta.style.position = 'fixed';
                        ta.style.opacity = '0';
                        document.body.appendChild(ta);
                        ta.select();
                        try { document.execCommand('copy'); } catch (_) { }
                        ta.remove();
                        showToast('✓ UPI ID copied!');
                    }
                });
            }

            const qrBtn = document.getElementById('bz-premium-show-qr-btn');
            const qrBlock = document.getElementById('bz-premium-qr-block');
            if (qrBtn && qrBlock) {
                qrBtn.addEventListener('click', function () {
                    const showing = qrBlock.style.display !== 'none';
                    qrBlock.style.display = showing ? 'none' : 'block';
                    qrBtn.innerHTML = showing
                        ? '<i class="fas fa-qrcode"></i> Show QR'
                        : '<i class="fas fa-chevron-up"></i> Hide QR';
                });
            }

            // Share the QR as an image — lets someone pay from another
            // device/app by sharing it over WhatsApp, etc, or save it to
            // their gallery when the Web Share API isn't available.
            const qrShareBtn = document.getElementById('bz-premium-qr-share-btn');
            const qrImgEl = document.getElementById('bz-premium-qr-img');
            if (qrShareBtn && qrImgEl) {
                qrShareBtn.addEventListener('click', async function () {
                    try {
                        const resp = await fetch(qrImgEl.src);
                        const blob = await resp.blob();
                        const file = new File([blob], 'beatzen-upi-qr.png', { type: blob.type || 'image/png' });
                        if (navigator.canShare && navigator.canShare({ files: [file] })) {
                            await navigator.share({
                                files: [file],
                                title: 'BeatZen UPI QR',
                                text: 'Scan this QR with any UPI app to pay.'
                            });
                        } else if (navigator.share) {
                            await navigator.share({ title: 'BeatZen UPI QR', text: 'Scan this QR with any UPI app to pay.' });
                        } else {
                            const a = document.createElement('a');
                            a.href = qrImgEl.src;
                            a.download = 'beatzen-upi-qr.png';
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            showToast('QR image downloaded — share it from your gallery.');
                        }
                    } catch (e) {
                        if (e && e.name === 'AbortError') return;
                        console.error('Beat Zen: QR share failed', e);
                        showToast("Couldn't share the QR image.");
                    }
                });
            }

            const uploadInput = document.getElementById('bz-premium-screenshot-input');
            const uploadBtn = document.getElementById('bz-premium-upload-btn');
            const previewWrap = document.getElementById('bz-premium-upload-preview-wrap');
            const previewImg = document.getElementById('bz-premium-upload-preview');
            const submitBtn = document.getElementById('bz-premium-submit-btn');
            if (uploadBtn && uploadInput) {
                uploadBtn.addEventListener('click', function () { uploadInput.click(); });
                uploadInput.addEventListener('change', function (e) {
                    const file = e.target.files && e.target.files[0];
                    if (!file) return;
                    if (!file.type || !file.type.startsWith('image/')) { showToast('Please choose an image file.'); return; }
                    uploadBtn.disabled = true;
                    uploadBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processing…';
                    _bzPremiumScreenshotFile = file; // kept full-resolution for on-device OCR at submit time
                    bzCompressImageToBase64(file, 900, 0.72).then(function (dataUrl) {
                        _bzPremiumScreenshotBase64 = dataUrl;
                        if (previewImg) previewImg.src = dataUrl;
                        if (previewWrap) previewWrap.style.display = 'flex';
                        if (submitBtn) submitBtn.style.display = 'flex';
                        uploadBtn.innerHTML = '<i class="fas fa-camera"></i> Change Screenshot';
                    }).catch(function (err) {
                        console.error('Beat Zen: screenshot compression failed', err);
                        showToast("Couldn't read that image — try another one.");
                        uploadBtn.innerHTML = '<i class="fas fa-camera"></i> Upload Payment Screenshot';
                    }).finally(function () {
                        uploadBtn.disabled = false;
                        uploadInput.value = '';
                    });
                });
            }
            if (submitBtn) submitBtn.addEventListener('click', bzSubmitPremiumRequest);

            const tryAgainBtn = document.getElementById('bz-premium-try-again-btn');
            if (tryAgainBtn) tryAgainBtn.addEventListener('click', async function () {
                tryAgainBtn.disabled = true;
                try {
                    const user = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
                    if (user && typeof db !== 'undefined') {
                        await db.collection('beatzen_premium_requests').doc(user.uid).delete().catch(function () { });
                    }
                } finally {
                    tryAgainBtn.disabled = false;
                    _bzPremiumScreenshotBase64 = '';
                    _bzPremiumScreenshotFile = null;
                    if (previewWrap) previewWrap.style.display = 'none';
                    if (submitBtn) submitBtn.style.display = 'none';
                    if (uploadBtn) uploadBtn.innerHTML = '<i class="fas fa-camera"></i> Upload Payment Screenshot';
                    const failedListEl = document.getElementById('bz-premium-failed-checklist');
                    if (failedListEl) { failedListEl.style.display = 'none'; failedListEl.innerHTML = ''; }
                    const failedInstructionEl = document.getElementById('bz-premium-failed-instruction');
                    if (failedInstructionEl) { failedInstructionEl.style.display = 'none'; failedInstructionEl.textContent = ''; }
                    _bzShowPremiumSubView('plans');
                }
            });

            const doneBtn = document.getElementById('bz-premium-active-done-btn');
            if (doneBtn) doneBtn.addEventListener('click', function () {
                if (typeof displayHome === 'function') displayHome();
            });
        }

        function initSettings() {
            const savedDark = localStorage.getItem('beatzen_dark_mode') === 'true';
            applyDarkMode(savedDark);
            if (darkModeToggle) {
                darkModeToggle.checked = savedDark;
                darkModeToggle.addEventListener('change', () => {
                    /* Block if schedule is currently managing dark mode */
                    if (localStorage.getItem('beatzen_schedule_dm_enabled') === 'true') return;
                    applyDarkMode(darkModeToggle.checked);
                    _bzSyncNow('✓ Dark mode ' + (darkModeToggle.checked ? 'on' : 'off') + ' — synced to cloud');
                });
            }
            const historyToggle = document.getElementById('history-toggle');
            /* Default ON for new users */
            if (localStorage.getItem('beatzen_history') === null) {
                localStorage.setItem('beatzen_history', 'true');
            }
            const savedHistory = localStorage.getItem('beatzen_history') !== 'false';
            window.isHistoryEnabled = savedHistory;
            if (historyToggle) {
                historyToggle.checked = savedHistory;
                historyToggle.addEventListener('change', () => {
                    window.isHistoryEnabled = historyToggle.checked;
                    localStorage.setItem('beatzen_history', String(historyToggle.checked));
                    /* Re-render Explore so Listen Again section appears/disappears instantly */
                    if (typeof window.renderExplore === 'function') window.renderExplore();
                    _bzSyncNow('✓ Play history ' + (historyToggle.checked ? 'on' : 'off') + ' — synced to cloud');
                });
            }

            /* ── AUTO MIX TOGGLE ── */
            const autoMixToggle = document.getElementById('automix-toggle');
            if (autoMixToggle) {
                autoMixToggle.checked = localStorage.getItem('beatzen_automix') === 'true';
                autoMixToggle.addEventListener('change', () => {
                    localStorage.setItem('beatzen_automix', String(autoMixToggle.checked));
                    if (autoMixToggle.checked && typeof window.bzTriggerAutoMix === 'function') {
                        window.bzTriggerAutoMix();
                        showToast('Auto Mix enabled — queue will fill with your top songs');
                    } else {
                        // FIX (automix-toggle-not-syncing bug): this used to only show a toast
                        if (typeof window.bzClearAutoMix === 'function') {
                            window.bzClearAutoMix();
                        }
                        showToast('Auto Mix disabled');
                    }
                    _bzSyncNow('✓ Auto Mix synced to cloud');
                });
            }

            /* ── RECENT SEARCHES TOGGLE ── */
            const recentSearchesToggle = document.getElementById('recent-searches-toggle');
            if (recentSearchesToggle) {
                recentSearchesToggle.checked = isRecentSearchesEnabled();
                recentSearchesToggle.addEventListener('change', () => {
                    localStorage.setItem(RECENT_SEARCHES_ENABLED_KEY, recentSearchesToggle.checked);
                    if (!recentSearchesToggle.checked) {
                        /* Wipe saved queries and dismiss panel immediately when disabled */
                        localStorage.removeItem(RECENT_SEARCHES_KEY);
                        document.getElementById('recent-searches-panel')?.remove();
                    } else {
                        /* Show panel immediately if user is on search and bar is empty */
                        const searchView = document.getElementById('search-container');
                        const bar = document.getElementById('search-bar');
                        if (searchView && !searchView.classList.contains('hidden') && bar && !bar.value.trim()) {
                            renderRecentSearches();
                        }
                    }
                    _bzSyncNow('✓ Recent searches ' + (recentSearchesToggle.checked ? 'on' : 'off') + ' — synced to cloud');
                });
            }

            /* ── KEYBOARD SHORTCUTS TOGGLE ── */
            const shortcutsToggle = document.getElementById('shortcuts-toggle');
            const viewShortcutsBtn = document.getElementById('view-shortcuts-btn');
            const savedShortcuts = localStorage.getItem('beatzen_shortcuts') === 'true';
            if (shortcutsToggle) {
                shortcutsToggle.checked = savedShortcuts;
                if (viewShortcutsBtn) viewShortcutsBtn.style.display = savedShortcuts ? 'block' : 'none';
                shortcutsToggle.addEventListener('change', () => {
                    localStorage.setItem('beatzen_shortcuts', shortcutsToggle.checked);
                    if (viewShortcutsBtn) viewShortcutsBtn.style.display = shortcutsToggle.checked ? 'block' : 'none';
                    _bzSyncNow('✓ Shortcuts ' + (shortcutsToggle.checked ? 'on' : 'off') + ' — synced to cloud');
                });
            }
            if (viewShortcutsBtn) {
                viewShortcutsBtn.addEventListener('click', () => {
                    if (window.showShortcutsCheatSheet) window.showShortcutsCheatSheet();
                });
            }

            const clearHistBtn = document.getElementById('clear-history-btn');
            if (clearHistBtn) {
                clearHistBtn.addEventListener('click', () => {
                    bzConfirm('danger', 'Clear History?', 'All play history will be removed.', () => {
                        localStorage.removeItem(HISTORY_KEY);
                        /* Also clear the Repeat Rewind qualifying plays store */
                        localStorage.removeItem(BZ_RR_PLAYS_KEY);
                        // FIX B2: Also clear behavior signals so smart playlists
                        const BZ_SIGNALS_KEY = 'beatZen_signals';
                        localStorage.removeItem(BZ_SIGNALS_KEY);
                        if (typeof customGenreData !== 'undefined') customGenreData['History'] = [];
                        patchHistoryPanel([]);
                        /* Remove Recently Played card from Playlists Made for You */
                        if (typeof window.bzRemoveListenAgainPlaylist === 'function') window.bzRemoveListenAgainPlaylist();
                        /* Re-render Explore so Listen Again disappears immediately */
                        if (typeof window.renderExplore === 'function') window.renderExplore();
                        showToast('Play history cleared');
                        _bzSyncNow('✓ History cleared — synced to cloud');
                    }, 'Clear', 'Cancel');
                });
            }

            /* ── DELETE ALL USER PLAYLISTS + RESTORE ── */
            const deletePlaylistsBtn = document.getElementById('delete-playlists-btn');
            const restorePlaylistsBtn = document.getElementById('restore-playlists-btn');

            /* Show/hide restore button based on whether a backup exists */
            function syncRestorePlaylistsBtn() {
                if (!restorePlaylistsBtn) return;
                const hasBackup = !!sessionStorage.getItem('_bz_deleted_playlists_backup');
                restorePlaylistsBtn.style.display = hasBackup ? 'inline-flex' : 'none';
            }
            syncRestorePlaylistsBtn();

            if (deletePlaylistsBtn) {
                deletePlaylistsBtn.addEventListener('click', () => {
                    const userPls = window.masterPool.filter(p =>
                        p.type === 'Playlist' || p.isImported ||
                        String(p.id).startsWith('user-') || String(p.id).startsWith('imported-')
                    );
                    const count = userPls.length;
                    if (count === 0) { showToast('No playlists to delete'); return; }

                    bzConfirm(
                        'danger',
                        'Delete All Playlists?',
                        `This will remove all ${count} playlist${count !== 1 ? 's' : ''}. You can restore them before closing this page.`,
                        () => {
                            /* Back up to sessionStorage before deleting */
                            sessionStorage.setItem('_bz_deleted_playlists_backup',
                                JSON.stringify(userPls));

                            /* Remove from masterPool and localStorage */
                            window.masterPool = window.masterPool.filter(p =>
                                !(p.type === 'Playlist' || p.isImported ||
                                    String(p.id).startsWith('user-') || String(p.id).startsWith('imported-'))
                            );
                            localStorage.removeItem('beatZen_importedPlaylists');

                            if (typeof displayPlaylists === 'function') displayPlaylists(true);
                            syncRestorePlaylistsBtn();
                            showToast(`✓ ${count} playlist${count !== 1 ? 's' : ''} deleted — Restore available`);
                            _bzSyncNow('✓ Playlists deleted — synced to cloud');
                        },
                        'Delete All', 'Cancel'
                    );
                });
            }

            if (restorePlaylistsBtn) {
                restorePlaylistsBtn.addEventListener('click', () => {
                    const raw = sessionStorage.getItem('_bz_deleted_playlists_backup');
                    if (!raw) { showToast('No backup available'); return; }

                    bzConfirm(
                        'success',
                        'Restore Playlists?',
                        'All deleted playlists will be brought back exactly as they were.',
                        () => {
                            try {
                                const backup = JSON.parse(raw);
                                backup.forEach(pl => {
                                    pl.id = String(pl.id);
                                    pl.isImported = true;
                                    pl.songs = (pl.songs || []).map(s =>
                                        typeof s === 'object' && s !== null ? { ...s } : s
                                    );
                                    if (!window.masterPool.some(m => String(m.id || m.name) === pl.id)) {
                                        window.masterPool.push(pl);
                                    }
                                });
                                /* Persist restored playlists */
                                localStorage.setItem('beatZen_importedPlaylists', JSON.stringify(backup));
                                /* Clear backup now that it's restored */
                                sessionStorage.removeItem('_bz_deleted_playlists_backup');

                                if (typeof displayPlaylists === 'function') displayPlaylists(true);
                                syncRestorePlaylistsBtn();
                                showToast(`✓ ${backup.length} playlist${backup.length !== 1 ? 's' : ''} restored`);
                                _bzSyncNow('✓ Playlists restored — synced to cloud');
                            } catch (e) {
                                console.error('Restore failed:', e);
                                showToast('Restore failed — backup may be corrupted');
                            }
                        },
                        'Restore', 'Cancel'
                    );
                });
            }

            /* ── EXPLORE PLAYLISTS — Remove & Restore ── */
            const removeExploreBtn = document.getElementById('remove-explore-btn');
            const restoreExploreBtn = document.getElementById('restore-explore-btn');

            /* Show/hide restore button based on whether a backup exists */
            function syncRestoreExploreBtn() {
                if (!restoreExploreBtn) return;
                const hasBackup = !!sessionStorage.getItem('_bz_deleted_explore_backup');
                restoreExploreBtn.style.display = hasBackup ? 'inline-flex' : 'none';
            }
            syncRestoreExploreBtn();

            if (removeExploreBtn) {
                removeExploreBtn.addEventListener('click', () => {
                    const exploreCount = (window.dailyPlaylistGroups || [])
                        .reduce((n, g) => n + (g.playlists?.length || 0), 0);

                    bzConfirm(
                        'warning',
                        'Remove Explore Playlists?',
                        'All daily and generated playlists will be cleared. You can restore them before closing this page.',
                        () => {
                            /* Back up current dailyPlaylistGroups */
                            sessionStorage.setItem('_bz_deleted_explore_backup',
                                JSON.stringify(window.dailyPlaylistGroups || []));

                            /* Clear explore playlists */
                            window.dailyPlaylistGroups = [];
                            if (typeof customGenreData !== 'undefined') {
                                delete customGenreData['Your Daily Mix'];
                                delete customGenreData['Recap'];
                            }
                            window.masterPool = window.masterPool.filter(p =>
                                !(p.type === 'Explore' && String(p.id || '').includes('daily-'))
                            );

                            const expContainer = document.getElementById('playlists-container');
                            if (expContainer && expContainer.style.display !== 'none') {
                                if (typeof displayexplore === 'function') displayexplore(true);
                            }
                            syncRestoreExploreBtn();
                            showToast('✓ Explore playlists removed — Restore available');
                        },
                        'Remove', 'Cancel'
                    );
                });
            }

            if (restoreExploreBtn) {
                restoreExploreBtn.addEventListener('click', () => {
                    const raw = sessionStorage.getItem('_bz_deleted_explore_backup');
                    if (!raw) { showToast('No backup available'); return; }

                    bzConfirm(
                        'success',
                        'Restore Explore Playlists?',
                        'All removed daily and generated playlists will be brought back.',
                        () => {
                            try {
                                const backup = JSON.parse(raw);
                                window.dailyPlaylistGroups = backup;

                                /* Re-add any explore entries that were stripped from masterPool */
                                backup.forEach(group => {
                                    (group.playlists || []).forEach(pl => {
                                        if (!window.masterPool.some(m =>
                                            String(m.id || m.name) === String(pl.id))) {
                                            window.masterPool.push(pl);
                                        }
                                    });
                                });

                                /* Clear backup */
                                sessionStorage.removeItem('_bz_deleted_explore_backup');

                                const expContainer = document.getElementById('playlists-container');
                                if (expContainer && expContainer.style.display !== 'none') {
                                    if (typeof displayexplore === 'function') displayexplore(true);
                                }
                                syncRestoreExploreBtn();
                                const total = backup.reduce((n, g) => n + (g.playlists?.length || 0), 0);
                                showToast(`✓ ${total} explore playlist${total !== 1 ? 's' : ''} restored`);
                            } catch (e) {
                                console.error('Explore restore failed:', e);
                                showToast('Restore failed — backup may be corrupted');
                            }
                        },
                        'Restore', 'Cancel'
                    );
                });
            }
            const exportBtn = document.getElementById('export-data-btn');
            if (exportBtn) {
                exportBtn.addEventListener('click', () => {
                    try {
                        /* Collect ALL Beat Zen data from localStorage */
                        const payload = {
                            _version: 4,
                            _exported: new Date().toISOString(),
                            _app: 'BeatZen',
                            /* Playlists */
                            beatZen_importedPlaylists: JSON.parse(localStorage.getItem('beatZen_importedPlaylists') || '[]'),
                            /* Play history */
                            beatZen_history_auto: JSON.parse(localStorage.getItem('beatZen_history_auto') || '[]'),
                            /* Repeat Rewind qualifying plays */
                            beatZen_rr_plays: JSON.parse(localStorage.getItem('beatZen_rr_plays') || '[]'),
                            /* Preferences */
                            beatzen_dark_mode: localStorage.getItem('beatzen_dark_mode') || 'false',
                            beatzen_history: localStorage.getItem('beatzen_history') || 'false',
                            beatzen_automix: localStorage.getItem('beatzen_automix') || 'false',
                            /* Last played session */
                            lastPlayedSong: localStorage.getItem('lastPlayedSong') || null,
                            beatZen_lastPosition: localStorage.getItem('beatZen_lastPosition') || null,
                        };
                        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const now = new Date();
                        const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
                        const a = document.createElement('a');
                        a.href = url; a.download = `beatzen_backup_${stamp}.json`;
                        document.body.appendChild(a); a.click(); a.remove();
                        URL.revokeObjectURL(url);
                        showToast('✓ Data exported successfully');
                    } catch (e) {
                        console.error('Export failed:', e);
                        showToast('Export failed. Please try again.');
                    }
                });
            }

            /* ── IMPORT DATA ── */
            const importBtn = document.getElementById('import-data-btn');
            const fileInput = document.getElementById('data-file-input');
            if (importBtn && fileInput) {
                importBtn.addEventListener('click', () => fileInput.click());
                fileInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        try {
                            const payload = JSON.parse(ev.target.result);
                            if (!payload || payload._app !== 'BeatZen') {
                                showToast('Invalid Beat Zen backup file.');
                                return;
                            }
                            bzConfirm('warning', 'Import Backup?', 'Overwrites playlists, history & settings.', () => {
                                if (Array.isArray(payload.beatZen_importedPlaylists)) {
                                    localStorage.setItem('beatZen_importedPlaylists', JSON.stringify(payload.beatZen_importedPlaylists));
                                }
                                if (Array.isArray(payload.beatZen_history_auto)) {
                                    localStorage.setItem('beatZen_history_auto', JSON.stringify(payload.beatZen_history_auto));
                                    if (typeof customGenreData !== 'undefined') {
                                        customGenreData['History'] = payload.beatZen_history_auto;
                                    }
                                }
                                /* Restore Repeat Rewind qualifying plays */
                                if (Array.isArray(payload.beatZen_rr_plays)) {
                                    localStorage.setItem('beatZen_rr_plays', JSON.stringify(payload.beatZen_rr_plays));
                                }
                                if (payload.beatzen_dark_mode !== undefined) {
                                    localStorage.setItem('beatzen_dark_mode', payload.beatzen_dark_mode);
                                    applyDarkMode(payload.beatzen_dark_mode === 'true');
                                    if (darkModeToggle) darkModeToggle.checked = payload.beatzen_dark_mode === 'true';
                                }
                                if (payload.beatzen_history !== undefined) {
                                    localStorage.setItem('beatzen_history', payload.beatzen_history);
                                    window.isHistoryEnabled = payload.beatzen_history === 'true';
                                    const historyToggle = document.getElementById('history-toggle');
                                    if (historyToggle) historyToggle.checked = payload.beatzen_history === 'true';
                                }
                                if (payload.beatzen_automix !== undefined) {
                                    localStorage.setItem('beatzen_automix', payload.beatzen_automix);
                                    const autoMixToggle = document.getElementById('automix-toggle');
                                    if (autoMixToggle) autoMixToggle.checked = payload.beatzen_automix === 'true';
                                }
                                if (payload.lastPlayedSong) localStorage.setItem('lastPlayedSong', payload.lastPlayedSong);
                                if (payload.beatZen_lastPosition) localStorage.setItem('beatZen_lastPosition', payload.beatZen_lastPosition);
                                fileInput.value = '';
                                showToast('✓ Data imported successfully');
                                setTimeout(() => location.reload(), 1200);
                            }, 'Import', 'Cancel');
                        } catch (err) {
                            console.error('Import failed:', err);
                            showToast('Import failed — file may be corrupted.');
                            fileInput.value = '';
                        }
                    };
                    reader.readAsText(file);
                });
            }
        }
        initSettings();
        initScheduledDarkMode();

        // SCHEDULED DARK MODE
        function initScheduledDarkMode() {
            const SDM_ENABLED_KEY = 'beatzen_schedule_dm_enabled';
            const SDM_DAYS_KEY = 'beatzen_schedule_dm_days';
            const SDM_ON_KEY = 'beatzen_schedule_dm_on';
            const SDM_OFF_KEY = 'beatzen_schedule_dm_off';

            let _sdmOnTimer = null;
            let _sdmOffTimer = null;

            /* ── Read saved state ── */
            function getSavedDays() { try { return JSON.parse(localStorage.getItem(SDM_DAYS_KEY) || '["daily"]'); } catch (_) { return ['daily']; } }
            function getSavedOn() { return localStorage.getItem(SDM_ON_KEY) || '22:00'; }
            function getSavedOff() { return localStorage.getItem(SDM_OFF_KEY) || '07:00'; }
            function isEnabled() { return localStorage.getItem(SDM_ENABLED_KEY) === 'true'; }

            /* ── Check if today matches selected days ── */
            function isTodayActive(days) {
                if (!days || days.includes('daily')) return true;
                const dow = new Date().getDay(); // 0=Sun … 6=Sat
                return days.map(Number).includes(dow);
            }

            /* ── Check if current time is inside the ON window ── */
            function isInsideWindow(onStr, offStr) {
                const [onH, onM] = onStr.split(':').map(Number);
                const [offH, offM] = offStr.split(':').map(Number);
                const now = new Date();
                const cur = now.getHours() * 60 + now.getMinutes();
                const on = onH * 60 + onM;
                const off = offH * 60 + offM;
                /* Overnight: e.g. 22:00 → 07:00 */
                if (on > off) return cur >= on || cur < off;
                return cur >= on && cur < off;
            }

            /* ── Apply or remove dark mode via schedule, update UI ── */
            function applySchedule() {
                if (!isEnabled()) return;
                const days = getSavedDays();
                const onStr = getSavedOn();
                const offStr = getSavedOff();
                const active = isTodayActive(days) && isInsideWindow(onStr, offStr);
                applyDarkMode(active);
                if (darkModeToggle) darkModeToggle.checked = active;
                updateBadge(active, onStr, offStr);
                armTimers(onStr, offStr, days);
            }

            /* ── Update the "Dark mode active via schedule" badge ── */
            function updateBadge(active, onStr, offStr) {
                const badge = document.getElementById('schedule-dm-active-badge');
                const text = document.getElementById('schedule-dm-badge-text');
                if (!badge) return;
                if (active) {
                    badge.style.display = 'flex';
                    if (text) text.textContent = `Dark mode active · off at ${fmt12(offStr)}`;
                } else {
                    badge.style.display = 'none';
                }
            }

            /* ── Update the status subtext + the coloured ON pill ── */
            function updateStatusText() {
                const el = document.getElementById('schedule-dm-status-text');
                const pill = document.getElementById('sdm-active-pill');
                const pillText = document.getElementById('sdm-active-pill-text');
                const collapseLabel = document.getElementById('sdm-collapse-label');
                const SDM_SET_KEY = 'beatzen_schedule_dm_set';
                const scheduleSet = localStorage.getItem(SDM_SET_KEY) === 'true';

                if (!isEnabled()) {
                    if (el) { el.style.display = ''; el.textContent = 'Auto-enable dark mode on a schedule'; }
                    if (pill) pill.style.display = 'none';
                    return;
                }
                const days = getSavedDays();
                const onStr = getSavedOn();
                const offStr = getSavedOff();
                const dayLabel = days.includes('daily') ? 'Daily' : days.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ');

                // When schedule is confirmed: hide the plain subtext
                if (scheduleSet) {
                    if (el) el.style.display = 'none';
                    if (pill && pillText) {
                        // Only the time range goes in pillText
                        pillText.textContent = `${dayLabel} · ${fmt12(onStr)} – ${fmt12(offStr)}`;
                        pill.style.display = 'inline-flex';
                    }
                } else {
                    if (el) { el.style.display = ''; el.textContent = `${dayLabel} · ${fmt12(onStr)} – ${fmt12(offStr)}`; }
                    if (pill) pill.style.display = 'none';
                }

                // Update collapse button label: "Edit timings" when collapsed
                if (collapseLabel) {
                    const isCollapsed = document.getElementById('sdm-collapse-btn')?.classList.contains('collapsed');
                    collapseLabel.textContent = isCollapsed ? 'Edit' : 'Close';
                }
            }
            /* ── Set timers to fire at the exact ON / OFF boundary ── */
            function msUntil(hhmm) {
                const [h, m] = hhmm.split(':').map(Number);
                const now = new Date();
                const target = new Date(now);
                target.setHours(h, m, 0, 0);
                if (target <= now) target.setDate(target.getDate() + 1);
                return target - now;
            }

            function armTimers(onStr, offStr, days) {
                clearTimeout(_sdmOnTimer);
                clearTimeout(_sdmOffTimer);
                _sdmOnTimer = setTimeout(() => {
                    if (isEnabled() && isTodayActive(days)) {
                        applyDarkMode(true);
                        if (darkModeToggle) darkModeToggle.checked = true;
                        updateBadge(true, onStr, offStr);
                    }
                    armTimers(onStr, offStr, days); // re-arm for tomorrow
                }, msUntil(onStr));

                _sdmOffTimer = setTimeout(() => {
                    if (isEnabled()) {
                        applyDarkMode(false);
                        if (darkModeToggle) darkModeToggle.checked = false;
                        updateBadge(false, onStr, offStr);
                    }
                    armTimers(onStr, offStr, days); // re-arm for tomorrow
                }, msUntil(offStr));

                // FIX B3: Midnight day-filter re-check for overnight windows
                const [onH, onM] = onStr.split(':').map(Number);
                const [offH, offM] = offStr.split(':').map(Number);
                const isOvernight = (onH * 60 + onM) > (offH * 60 + offM);
                if (isOvernight && !days.includes('daily')) {
                    // ms until next midnight
                    const _now = new Date();
                    const _midnight = new Date(_now);
                    _midnight.setHours(24, 0, 0, 0);
                    const _msToMidnight = _midnight - _now;
                    setTimeout(() => {
                        if (!isEnabled()) return;
                        // After midnight: if the NEW today is not an active day,
                        if (!isTodayActive(days) && document.body.classList.contains('dark-mode')) {
                            applyDarkMode(false);
                            if (darkModeToggle) darkModeToggle.checked = false;
                            updateBadge(false, onStr, offStr);
                        }
                    }, _msToMidnight + 500); // +500ms safety margin past midnight
                }
            }

            /* ── Lock/unlock manual dark mode toggle ── */
            function syncManualToggleLock() {
                const label = darkModeToggle?.closest('label') || darkModeToggle?.parentElement;
                if (isEnabled()) label?.classList.add('sdm-managed');
                else label?.classList.remove('sdm-managed');
            }

            /* ── 12h ↔ 24h helpers ── */
            /* 24h "HH:MM" → { h12: 1-12, m: 0-59, ampm: 'AM'|'PM' } */
            function to12h(hhmm) {
                const [h24, m] = hhmm.split(':').map(Number);
                const ampm = h24 < 12 ? 'AM' : 'PM';
                let h12 = h24 % 12;
                if (h12 === 0) h12 = 12;
                return { h12, m, ampm };
            }
            /* { h12, m, ampm } → 24h "HH:MM" */
            function to24h(h12, m, ampm) {
                let h24 = h12 % 12;
                if (ampm === 'PM') h24 += 12;
                return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            }
            /* Format a 24h "HH:MM" string as "12:00 AM" for display */
            function fmt12(hhmm) {
                const { h12, m, ampm } = to12h(hhmm);
                return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
            }

            /* ── Init manual inputs with saved values ── */
            function initManualInputs() {
                const onParts = to12h(getSavedOn());
                const offParts = to12h(getSavedOff());

                const onHrEl = document.getElementById('sdm-on-hr-input');
                const onMinEl = document.getElementById('sdm-on-min-input');
                const onAmPmEl = document.getElementById('sdm-on-ampm-btn');
                const offHrEl = document.getElementById('sdm-off-hr-input');
                const offMinEl = document.getElementById('sdm-off-min-input');
                const offAmPmEl = document.getElementById('sdm-off-ampm-btn');

                /* Live state */
                let onH = onParts.h12, onM = onParts.m, onAP = onParts.ampm;
                let offH = offParts.h12, offM = offParts.m, offAP = offParts.ampm;

                function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

                /* Populate initial values */
                if (onHrEl) onHrEl.value = String(onH).padStart(2, '0');
                if (onMinEl) onMinEl.value = String(onM).padStart(2, '0');
                if (onAmPmEl) onAmPmEl.textContent = onAP;
                if (offHrEl) offHrEl.value = String(offH).padStart(2, '0');
                if (offMinEl) offMinEl.value = String(offM).padStart(2, '0');
                if (offAmPmEl) offAmPmEl.textContent = offAP;

                function wireHrInput(el, setV) {
                    if (!el) return;
                    el.addEventListener('input', () => { setV(clamp(parseInt(el.value) || 1, 1, 12)); markSchedulePending(); });
                    el.addEventListener('blur', () => { const v = clamp(parseInt(el.value) || 1, 1, 12); setV(v); el.value = String(v).padStart(2, '0'); });
                }
                function wireMinInput(el, setV) {
                    if (!el) return;
                    el.addEventListener('input', () => { setV(clamp(parseInt(el.value) || 0, 0, 59)); markSchedulePending(); });
                    el.addEventListener('blur', () => { const v = clamp(parseInt(el.value) || 0, 0, 59); setV(v); el.value = String(v).padStart(2, '0'); });
                }
                function wireAmPmToggle(btn, getAP, setAP) {
                    if (!btn) return;
                    btn.addEventListener('click', () => { const n = getAP() === 'AM' ? 'PM' : 'AM'; setAP(n); btn.textContent = n; markSchedulePending(); });
                }

                wireHrInput(onHrEl, v => { onH = v; });
                wireMinInput(onMinEl, v => { onM = v; });
                wireAmPmToggle(onAmPmEl, () => onAP, v => { onAP = v; });
                wireHrInput(offHrEl, v => { offH = v; });
                wireMinInput(offMinEl, v => { offM = v; });
                wireAmPmToggle(offAmPmEl, () => offAP, v => { offAP = v; });

                /* ── Set Schedule / Cancel Schedule button ── */
                const setBtn = document.getElementById('sdm-set-schedule-btn');

                /* Track whether schedule has been committed */
                const SDM_SET_KEY = 'beatzen_schedule_dm_set';
                function isScheduleSet() { return localStorage.getItem(SDM_SET_KEY) === 'true'; }

                /* Render the button in the correct state */
                function renderScheduleBtn() {
                    if (!setBtn) return;
                    if (isScheduleSet()) {
                        setBtn.classList.remove('sdm-set-schedule-btn--pending', 'sdm-set-schedule-btn--saved');
                        setBtn.classList.add('sdm-set-schedule-btn--cancel');
                        setBtn.innerHTML = '<i class="fas fa-calendar-xmark"></i> Cancel Schedule';
                    } else {
                        setBtn.classList.remove('sdm-set-schedule-btn--cancel', 'sdm-set-schedule-btn--saved');
                        setBtn.innerHTML = '<i class="fas fa-calendar-check"></i> Set Schedule';
                    }
                }

                /* Init button state on open */
                renderScheduleBtn();

                if (setBtn) {
                    setBtn.addEventListener('click', () => {
                        if (isScheduleSet()) {
                            /* ── CANCEL flow ── */
                            localStorage.setItem(SDM_SET_KEY, 'false');
                            /* Clear saved times so it reverts to defaults on next open */
                            clearTimeout(_sdmOnTimer);
                            clearTimeout(_sdmOffTimer);
                            applyDarkMode(false);
                            if (darkModeToggle) darkModeToggle.checked = false;
                            document.getElementById('schedule-dm-active-badge').style.display = 'none';
                            updateStatusText();
                            renderScheduleBtn();
                            showToast('Schedule cancelled — no longer auto-switching');
                            _bzSyncNow('✓ Schedule cancelled — synced to cloud');
                        } else {
                            /* ── SET flow ── */
                            saveTime('on', onH, onM, onAP);
                            saveTime('off', offH, offM, offAP);
                            applySchedule();
                            localStorage.setItem(SDM_SET_KEY, 'true');
                            /* Flash green confirmation briefly, then switch to red Cancel */
                            setBtn.classList.remove('sdm-set-schedule-btn--pending', 'sdm-set-schedule-btn--cancel');
                            setBtn.classList.add('sdm-set-schedule-btn--saved');
                            setBtn.innerHTML = '<i class="fas fa-check"></i> Schedule Set!';
                            const onLabel = fmt12(getSavedOn());
                            const offLabel = fmt12(getSavedOff());
                            const days = getSavedDays();
                            const dayLabel = days.includes('daily') ? 'Daily' : days.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ');
                            showToast(`Schedule set — ON ${onLabel}, OFF ${offLabel} · ${dayLabel}`);
                            _bzSyncNow('✓ Schedule saved — synced to cloud');
                            // Show the ON pill immediately in the header row
                            updateStatusText();
                            setTimeout(() => {
                                setBtn.classList.remove('sdm-set-schedule-btn--saved');
                                renderScheduleBtn();
                                /* Auto-collapse once schedule is confirmed */
                                sdmCollapse();
                            }, 2000);
                        }
                    });
                }
            }

            function saveTime(which, h12, m, ampm) {
                const str24 = to24h(h12, m, ampm);
                localStorage.setItem(which === 'on' ? SDM_ON_KEY : SDM_OFF_KEY, str24);
                updateStatusText();
            }

            /* ── Mark the Set Schedule button as having pending changes ── */
            function markSchedulePending() {
                const setBtn = document.getElementById('sdm-set-schedule-btn');
                if (!setBtn) return;
                const SDM_SET_KEY = 'beatzen_schedule_dm_set';
                /* If schedule is active (cancel state), revert to "Set Schedule" pending */
                if (localStorage.getItem(SDM_SET_KEY) === 'true') {
                    localStorage.setItem(SDM_SET_KEY, 'false');
                    setBtn.classList.remove('sdm-set-schedule-btn--cancel', 'sdm-set-schedule-btn--saved');
                }
                if (!setBtn.classList.contains('sdm-set-schedule-btn--saved')) {
                    setBtn.classList.add('sdm-set-schedule-btn--pending');
                    setBtn.innerHTML = '<i class="fas fa-calendar-check"></i> Set Schedule';
                }
            }

            /* ── Day chips ── */
            function initDayChips() {
                const chips = document.querySelectorAll('.sdm-day-chip');
                const saved = getSavedDays();

                /* Set initial active state */
                chips.forEach(chip => {
                    const v = chip.dataset.day;
                    chip.classList.toggle('active', saved.includes(v) || (saved.includes('daily') && v === 'daily'));
                });

                chips.forEach(chip => {
                    chip.addEventListener('click', () => {
                        const v = chip.dataset.day;
                        if (v === 'daily') {
                            /* Daily selected — deselect all individual days */
                            chips.forEach(c => c.classList.toggle('active', c.dataset.day === 'daily'));
                            localStorage.setItem(SDM_DAYS_KEY, JSON.stringify(['daily']));
                        } else {
                            /* Individual day — deselect Daily, toggle this one */
                            const dailyChip = document.querySelector('.sdm-day-all');
                            dailyChip?.classList.remove('active');
                            chip.classList.toggle('active');
                            const selected = [...chips]
                                .filter(c => c.classList.contains('active') && c.dataset.day !== 'daily')
                                .map(c => c.dataset.day);
                            if (!selected.length) {
                                /* Nothing selected — revert to Daily */
                                dailyChip?.classList.add('active');
                                localStorage.setItem(SDM_DAYS_KEY, JSON.stringify(['daily']));
                            } else {
                                localStorage.setItem(SDM_DAYS_KEY, JSON.stringify(selected));
                            }
                        }
                        updateStatusText();
                        markSchedulePending();
                    });
                });
            }

            /* ── Main toggle ── */
            const sdmToggle = document.getElementById('schedule-dm-toggle');
            const sdmPanel = document.getElementById('schedule-dm-panel');
            const sdmCollapseBtn = document.getElementById('sdm-collapse-btn');

            let _sdmPanelCollapsed = false;

            /* ── Expand the schedule panel (show it, reset chevron) ── */
            function sdmExpand() {
                _sdmPanelCollapsed = false;
                if (sdmPanel) sdmPanel.style.display = 'flex';
                if (sdmCollapseBtn) {
                    // Always visible when toggle is ON — button shows panel is expandable
                    sdmCollapseBtn.classList.remove('sdm-collapse-btn--hidden', 'collapsed');
                    sdmCollapseBtn.title = 'Hide schedule controls';
                }
                const lbl = document.getElementById('sdm-collapse-label');
                if (lbl) lbl.textContent = 'Close';
            }

            /* ── Collapse the schedule panel (hide it, flip chevron) ── */
            function sdmCollapse() {
                _sdmPanelCollapsed = true;
                if (sdmPanel) sdmPanel.style.display = 'none';
                if (sdmCollapseBtn) {
                    // Stay visible — user can click to expand again
                    sdmCollapseBtn.classList.remove('sdm-collapse-btn--hidden');
                    sdmCollapseBtn.classList.add('collapsed');
                    sdmCollapseBtn.title = 'Show schedule controls';
                }
                const lbl = document.getElementById('sdm-collapse-label');
                if (lbl) lbl.textContent = 'Edit';
            }

            /* ── Fully hide the collapse button (toggle is OFF) ── */
            function hideCollapseBtn() {
                _sdmPanelCollapsed = false;
                if (sdmCollapseBtn) {
                    sdmCollapseBtn.classList.add('sdm-collapse-btn--hidden');
                    sdmCollapseBtn.classList.remove('collapsed');
                }
            }

            if (sdmToggle) {
                sdmToggle.checked = isEnabled();
                /* On load: if already enabled, expand immediately */
                if (isEnabled() && sdmPanel) { sdmExpand(); }

                sdmToggle.addEventListener('change', () => {
                    localStorage.setItem(SDM_ENABLED_KEY, String(sdmToggle.checked));
                    if (sdmToggle.checked) {
                        /* Toggle turned ON → expand and init */
                        if (sdmPanel) initManualInputs();
                        initDayChips();
                        sdmExpand();
                        syncManualToggleLock();
                        applySchedule();
                    } else {
                        /* Toggle turned OFF → hide panel, reset collapse state */
                        if (sdmPanel) sdmPanel.style.display = 'none';
                        hideCollapseBtn();
                        clearTimeout(_sdmOnTimer);
                        clearTimeout(_sdmOffTimer);
                        syncManualToggleLock();
                        const manual = localStorage.getItem('beatzen_dark_mode') === 'true';
                        applyDarkMode(manual);
                        if (darkModeToggle) darkModeToggle.checked = manual;
                        document.getElementById('schedule-dm-active-badge').style.display = 'none';
                        localStorage.setItem('beatzen_schedule_dm_set', 'false');
                    }
                    updateStatusText();
                    _bzSyncNow('✓ Schedule ' + (sdmToggle.checked ? 'on' : 'off') + ' — synced to cloud');
                });
            }

            /* Open panel and init if already enabled on load */
            if (isEnabled() && sdmPanel) {
                sdmExpand();
                initManualInputs();
                initDayChips();
                syncManualToggleLock();
                applySchedule();
            }
            updateStatusText();

            /* ── SDM: Chevron — manually toggle collapsed / expanded ── */
            if (sdmCollapseBtn && sdmPanel) {
                sdmCollapseBtn.addEventListener('click', () => {
                    if (_sdmPanelCollapsed) sdmExpand(); else sdmCollapse();
                });
            }

            // Expose a public hook so auth.js can re-run the SDM engine
            window.bzReinitScheduledDarkMode = function () {
                try {
                    // Clear any running timers from the previous schedule
                    clearTimeout(_sdmOnTimer);
                    clearTimeout(_sdmOffTimer);
                    _sdmOnTimer = null;
                    _sdmOffTimer = null;
                    // Re-apply the schedule using the freshly written localStorage values
                    applySchedule();
                    updateStatusText();
                } catch (_) { /* best effort */ }
            };
        }
        // AUTO HISTORY

        /* Maps internal view IDs to human-readable nav names */
        function resolveNavLabel() {
            const view = window.lastActiveView || 'home';
            const map = { home: 'Home', playlists: 'Playlists', explore: 'Playlists', search: 'Search', settings: 'Settings' };
            return map[view] || 'Home';
        }

        /* Returns the album/playlist/artist name the user is currently browsing */
        function resolveSourceName(album) {
            if (!album) return '';
            return album.title || album.name || '';
        }

        /* Format a Date object → "9:45 AM" */
        function fmtTime(d) {
            let h = d.getHours(), m = d.getMinutes();
            const ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12 || 12;
            return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
        }

        /* Format a Date object → "5 Jan 2025" */
        function fmtDate(d) {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
        }

        /* Core writer — called automatically from playSong */
        window.recordHistory = function (song, playingAlbum) {
            if (!song) return;
            const now = new Date();
            const sourceAlbum = window.allSongsMap.get(String(song.id))?.album || song._sourceAlbum || playingAlbum;
            const isAutoMix = !!song._autoMix;
            // For AutoMix songs: sourceName should show the real movie name
            const realMovieName = isAutoMix
                ? (sourceAlbum?.title || sourceAlbum?.name || playingAlbum?.title || playingAlbum?.name || '')
                : '';
            const entry = {
                id: String(song.id),
                title: song.title || 'Unknown',
                artist: song.artist || '',
                duration: song.duration || '',
                _coverUrl: sourceAlbum?.imageUrl || sourceAlbum?.albumCover || '',
                playedAt: now.toISOString(),
                playedTime: fmtTime(now),
                playedDate: fmtDate(now),
                sourceView: resolveNavLabel(),
                sourceName: resolveSourceName(playingAlbum),
                // AutoMix-specific fields
                isAutoMix: isAutoMix,
                autoMixMovieName: realMovieName,
                autoMixAlbumId: isAutoMix ? String(sourceAlbum?.id || sourceAlbum?.name || sourceAlbum?.title || '') : '',
                autoMixAlbumType: isAutoMix ? (sourceAlbum?.type || 'Movie') : '',
                // Album fields used by Top Album stats
                albumId: String(sourceAlbum?.id || playingAlbum?.id || ''),
                albumTitle: sourceAlbum?.title || sourceAlbum?.name || playingAlbum?.title || playingAlbum?.name || '',
                albumCover: sourceAlbum?.imageUrl || sourceAlbum?.albumCover || playingAlbum?.imageUrl || playingAlbum?.albumCover || '',
                // The EXACT album/playlist the user was playing from
                playingAlbumId: String(playingAlbum?.id || ''),
                playingAlbumType: playingAlbum?.type || 'Movie'
            };

            /* Load, prepend (allow duplicates — each play is its own entry), cap */
            let list = [];
            try { list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { list = []; }
            list.unshift(entry);
            list = list.slice(0, HISTORY_MAX);
            localStorage.setItem(HISTORY_KEY, JSON.stringify(list));

            /* Sync live runtime so Explore picks it up without full re-render */
            if (typeof customGenreData !== 'undefined') {
                customGenreData['History'] = list;
            }

            /* Instant DOM patch — update the history panel if it's currently visible */
            patchHistoryPanel(list);

        };

        // HISTORY HELPERS

        // Open the album / playlist a history entry came from. Behaviour
        function playHistoryEntry(entry) {
            const canonical = window.allSongsMap.get(String(entry.id));
            if (!canonical?.album) return;

            /* ── AutoMix shortcut: route to the real source movie ── */
            if (entry.isAutoMix && entry.autoMixAlbumId) {
                const amId = String(entry.autoMixAlbumId);
                const amRaw = window.masterPool.find(a =>
                    String(a.id || a.name || a.title) === amId
                ) || canonical.album;
                const amType = entry.autoMixAlbumType || amRaw?.type || 'Movie';
                const amData = resolveData(amRaw, amType);
                if (amData) {
                    // Tag the song with _autoMix + _sourceAlbum so that when the user clicks
                    const targetSongId = String(entry.id);
                    const songInAlbum = amData.songs?.find(s => String(s.id) === targetSongId);
                    if (songInAlbum) {
                        songInAlbum._autoMix = true;
                        songInAlbum._sourceAlbum = amRaw;
                    }
                    window.currentAlbum = amData;
                    window.lastActiveView = 'home';
                    selectAlbum(amData, true, 'home', false);
                    const _amTargetSongId = String(entry.id);
                    setTimeout(() => {
                        const amIdx = (amData.songs || []).findIndex(s => String(s.id) === _amTargetSongId);
                        // Update player bar without auto-play
                        if (amIdx >= 0) {
                            const amSong = amData.songs[amIdx];
                            const amCanonical = window.allSongsMap?.get(_amTargetSongId);
                            const amSource = amCanonical?.album || amRaw;
                            const amCover = amSource?.imageUrl || amSource?.albumCover || amData.imageUrl || '';
                            if (playerSongTitle && amSong?.title) playerSongTitle.textContent = amSong.title;
                            if (playerSongArtist && amSong?.artist !== undefined) playerSongArtist.textContent = amSong.artist || '';
                            if (playerAlbumCover && amCover) playerAlbumCover.src = amCover;
                            const amAlbumTitle = amSource?.title || amSource?.name || amData.title || 'Beat Zen';
                            if (amSong?.title) document.title = `${amSong.title} - ${amAlbumTitle}`;
                        }
                        const row = albumViewContainer.querySelector(`.song-item[data-song-id="${_amTargetSongId}"]`);
                        if (row) {
                            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            row.classList.add('bz-history-target');
                            row.addEventListener('animationend', () => row.classList.remove('bz-history-target'), { once: true });
                        }
                    }, 120);
                    return;
                }
            }

            /* ── Step 1: exact album/playlist saved at play time ── */
            let targetRaw = null;
            let targetType = 'Movie';
            let navTab = 'home';

            if (entry.playingAlbumId) {
                targetRaw = window.masterPool.find(a =>
                    String(a.id || a.name || a.title) === String(entry.playingAlbumId)
                );
                if (targetRaw) {
                    targetType = entry.playingAlbumType || targetRaw.type || 'Movie';
                    const t = String(targetType).toLowerCase();
                    navTab = (t === 'playlist' || t === 'explore' || t === 'collection' || t === 'artist')
                        ? 'playlists'
                        : 'home';
                }
            }

            /* ── Step 2: sourceView hint for older entries without playingAlbumId ── */
            if (!targetRaw && entry.sourceView === 'Playlists' && entry.sourceName) {
                targetRaw = window.masterPool.find(a =>
                    (a.name || a.title || '') === entry.sourceName &&
                    (a.type === 'Playlist' || a.type === 'Explore' || a.type === 'Collection')
                );
                if (targetRaw) {
                    targetType = targetRaw.type || 'Playlist';
                    navTab = 'playlists';
                }
            }

            /* ── Step 3: fallback — canonical movie album on Home ── */
            if (!targetRaw) {
                targetRaw = canonical.album;
                targetType = canonical.album.type || 'Movie';
                navTab = 'home';
            }

            /* ── Resolve and open the album/playlist view (no auto-play) ── */
            const data = resolveData(targetRaw, targetType);
            if (!data) return;

            // Only update playingAlbum context if this is the album already playing
            window.currentAlbum = data;
            window.lastActiveView = navTab;

            // Open the album view
            selectAlbum(data, true, navTab, false);

            // After the song rows are rendered
            const targetSongId = String(entry.id);
            setTimeout(() => {
                const idx = (data.songs || []).findIndex(x => String(x.id) === targetSongId);
                // Update player bar display without starting playback
                if (idx >= 0) {
                    const targetSong = data.songs[idx];
                    const canonical = window.allSongsMap?.get(targetSongId);
                    const sourceAlbum = canonical?.album || targetSong?._sourceAlbum || data;
                    const coverUrl = sourceAlbum?.imageUrl || sourceAlbum?.albumCover || data.imageUrl || '';
                    if (playerSongTitle && targetSong?.title) playerSongTitle.textContent = targetSong.title;
                    if (playerSongArtist && targetSong?.artist !== undefined) playerSongArtist.textContent = targetSong.artist || '';
                    if (playerAlbumCover && coverUrl) playerAlbumCover.src = coverUrl;
                    // Update tab title to reflect the highlighted (not-yet-playing) song
                    const albumTitle = sourceAlbum?.title || sourceAlbum?.name || data.title || 'Beat Zen';
                    if (targetSong?.title) document.title = `${targetSong.title} - ${albumTitle}`;
                }
                const row = albumViewContainer.querySelector(`.song-item[data-song-id="${targetSongId}"]`);
                if (row) {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    row.classList.add('bz-history-target');
                    row.addEventListener('animationend', () => row.classList.remove('bz-history-target'), { once: true });
                }
            }, 120);
        }

        /* Build one history row element used in both the preview list */
        function buildHistoryRow(entry, inOverlay) {
            const item = document.createElement('div');
            item.className = inOverlay ? 'bzh-full-row' : 'bz-history-item song-item';
            item.dataset.historyId = String(entry.id || '');

            const cover = entry._coverUrl || '';
            const title = entry.title || 'Unknown';
            const artist = entry.artist || '';
            const dur = entry.duration || '';
            const time = entry.playedTime || '';
            const date = entry.playedDate || '';
            const src = entry.sourceView || '';
            const srcN = entry.sourceName || '';
            const isAutoMix = !!entry.isAutoMix;
            const autoMixMovie = entry.autoMixMovieName || '';

            // For AutoMix entries show: song name · Auto-Mix wand icon · movie
            const autoMixBadgeLine = isAutoMix
                ? `<span class="bzh-dot">\u00b7</span>
                   <i class="fas fa-wand-magic-sparkles bzh-meta-icon" style="color:#2575fc;"></i>
                   <span class="bzh-automix-badge-inline">Auto-Mix</span>
                   ${autoMixMovie ? `<span class="bzh-dot">\u00b7</span><i class="fas fa-film bzh-meta-icon"></i><span class="bzh-automix-movie">${autoMixMovie}</span>` : ''}`
                : '';

            const normalSrcLine = !isAutoMix
                ? `${src ? `<span class="bzh-dot">\u00b7</span><i class="fas fa-compass bzh-meta-icon"></i><span style="text-transform:capitalize;">${src}</span>` : ''}
                   ${srcN ? `<span class="bzh-dot">\u00b7</span><i class="fas fa-music bzh-meta-icon"></i>${srcN}` : ''}`
                : '';

            item.innerHTML = `
            <div class="bzh-row-left">
                <img src="${cover}" class="${inOverlay ? 'bzh-cover' : 'playlist-song-cover'}" alt="" loading="lazy">
                <div class="bzh-text">
                    <span class="bzh-title">${title}</span>
                    <span class="bzh-artist">${artist}</span>
                    <span class="bzh-meta">
                        <i class="fas fa-clock bzh-meta-icon"></i>${time}
                        <span class="bzh-dot">·</span>
                        <i class="fas fa-calendar-alt bzh-meta-icon"></i>${date}
                        ${autoMixBadgeLine}
                        ${normalSrcLine}
                    </span>
                </div>
            </div>
            <div class="bzh-row-right">
                <span class="bzh-dur">${dur}</span>
                <i class="fas fa-play bzh-play-hint"></i>
            </div>`;

            item.addEventListener('click', () => {
                // For AutoMix entries, route to the real source movie
                if (isAutoMix && entry.autoMixAlbumId) {
                    const autoMixEntry = {
                        ...entry,
                        playingAlbumId: entry.autoMixAlbumId,
                        playingAlbumType: entry.autoMixAlbumType || 'Movie'
                    };
                    playHistoryEntry(autoMixEntry);
                } else {
                    playHistoryEntry(entry);
                }
                if (inOverlay) closeBzhOverlay();
            });
            return item;
        }

        /* Open the full-history overlay */
        function openFullHistoryOverlay(list) {
            closeBzhOverlay(); /* remove any existing one */

            const ov = document.createElement('div');
            ov.id = 'bzh-overlay';

            const modal = document.createElement('div');
            modal.className = 'bzh-modal';

            /* Header */
            const hdr = document.createElement('div');
            hdr.className = 'bzh-modal-header';
            hdr.innerHTML = `
            <div class="bzh-modal-title">
                <i class="fas fa-history"></i> Full History
                <span class="bzh-modal-count">${list.length} plays</span>
            </div>
            <button class="bzh-close-btn" id="bzh-close-btn">
                <i class="fas fa-times"></i>
            </button>`;
            modal.appendChild(hdr);

            /* Scrollable list */
            const body = document.createElement('div');
            body.className = 'bzh-modal-body';
            if (!list.length) {
                body.innerHTML = '<p class="bzh-empty">No history yet. Play a song to start tracking.</p>';
            } else {
                list.forEach(entry => body.appendChild(buildHistoryRow(entry, true)));
            }
            modal.appendChild(body);
            ov.appendChild(modal);
            document.body.appendChild(ov);

            /* Close handlers */
            document.getElementById('bzh-close-btn').addEventListener('click', closeBzhOverlay);
            ov.addEventListener('click', e => { if (e.target === ov) closeBzhOverlay(); });
            const escHandler = e => { if (e.key === 'Escape') { closeBzhOverlay(); document.removeEventListener('keydown', escHandler); } };
            document.addEventListener('keydown', escHandler);

            /* Animate in */
            requestAnimationFrame(() => ov.classList.add('bzh-overlay-visible'));
        }

        function closeBzhOverlay() {
            const ov = document.getElementById('bzh-overlay');
            if (!ov) return;
            ov.classList.remove('bzh-overlay-visible');
            setTimeout(() => ov.remove(), 280);
        }

        // Patches the live Listen Again section in Explore without full
        function patchHistoryPanel(list) {
            // Preferred path: prepend only the newest entry to the Listen Again row.
            if (list.length && typeof window.bzPrependListenAgainPLPL === 'function') {
                window.bzPrependListenAgainPLPL(list[0]);
            }

            /* Legacy fallback: patch old bz-history-section if it exists */
            const sec = document.getElementById('bz-history-section');
            if (!sec) return;
            const container = sec.querySelector('.bz-history-list');
            if (!container) return;
            container.innerHTML = '';
            renderHistoryItems(list, container);
        }

        /* Renders up to 6 history rows + a "Show Full History" button */
        function renderHistoryItems(list, container) {
            if (!list.length) {
                container.innerHTML = '<p style="color:rgba(255,255,255,0.4);padding:16px 0 10px;font-size:13px;text-align:center;">No history yet. Play a song to start tracking.</p>';
                return;
            }

            const preview = list.slice(0, 6);
            preview.forEach(entry => container.appendChild(buildHistoryRow(entry, false)));

            /* "Show Full History" button — always shown so user knows there's more */
            const btn = document.createElement('button');
            btn.className = 'bzh-show-all-btn';
            btn.innerHTML = `<i class="fas fa-list"></i> Show Full History <span class="bzh-count-badge">${list.length}</span>`;
            btn.addEventListener('click', () => openFullHistoryOverlay(list));
            container.appendChild(btn);
        }

        /* Legacy manual-save stub */
        window.saveToHistoryManual = function (song) {
            if (song) window.recordHistory(song, window.playingAlbum);
        };

        /* Legacy stub — kept so other callers don't crash */
        function saveToHistory() { }

        /* CONTACT FORM */
        if (contactForm) {
            contactForm.onsubmit = async (e) => {
                e.preventDefault();
                const btn = contactForm.querySelector('.submit-btn');

                // ── Client-side validation before sending ──────────────────────
                const nameVal = (contactForm.querySelector('#contact-name')?.value || '').trim();
                const emailVal = (contactForm.querySelector('#contact-email')?.value || '').trim();
                const msgVal = (contactForm.querySelector('#contact-message')?.value || '').trim();

                // Full name check
                if (!nameVal || nameVal.length < 2) {
                    bzAlert('warning', 'Name Required', 'Please enter your full name (at least 2 characters).');
                    contactForm.querySelector('#contact-name')?.focus();
                    return;
                }

                // Strict email validation
                function _bzContactEmailValid(email) {
                    if (!email) return 'Email address is required.';
                    const atCount = (email.match(/@/g) || []).length;
                    if (atCount !== 1) return 'Enter a valid email address.';
                    const [local, domain] = email.toLowerCase().split('@');
                    if (!local || local.length === 0) return 'Email is missing a username before @.';
                    if (local.length > 64) return 'The part before @ is too long.';
                    if (local.startsWith('.') || local.endsWith('.')) return 'Email username cannot start or end with a dot.';
                    if (/\.{2,}/.test(local)) return 'Email username cannot have consecutive dots.';
                    if (!/^[a-zA-Z0-9._%+\-]+$/.test(local)) return 'Email username contains invalid characters.';
                    if (!domain || !domain.includes('.')) return 'Enter a valid email domain (e.g. gmail.com).';
                    if (domain.startsWith('.') || domain.endsWith('.')) return 'Email domain cannot start or end with a dot.';
                    if (/\.{2,}/.test(domain)) return 'Email domain cannot have consecutive dots.';
                    if (!/^[a-zA-Z0-9.\-]+$/.test(domain)) return 'Email domain contains invalid characters.';
                    const tld = domain.split('.').pop();
                    if (!tld || tld.length < 2 || !/^[a-zA-Z]{2,}$/.test(tld)) return 'Enter a valid top-level domain (e.g. .com, .in, .org).';
                    const BLOCKED = new Set(['example.com', 'test.com', 'mailinator.com', 'guerrillamail.com', 'throwam.com', 'trashmail.com', 'yopmail.com', 'tempmail.com', 'dispostable.com', 'fakeinbox.com', 'maildrop.cc', 'spamgourmet.com', 'mytemp.email', 'discard.email', 'tempr.email', 'throwit.email', 'burnermail.io']);
                    if (BLOCKED.has(domain)) return 'Please use a valid personal email address.';
                    return null; // valid
                }
                const emailErr = _bzContactEmailValid(emailVal);
                if (emailErr) {
                    bzAlert('warning', 'Invalid Email', emailErr);
                    contactForm.querySelector('#contact-email')?.focus();
                    return;
                }

                // Message check
                if (!msgVal || msgVal.length < 10) {
                    bzAlert('warning', 'Message Required', 'Please enter a message (at least 10 characters).');
                    contactForm.querySelector('#contact-message')?.focus();
                    return;
                }

                // ── Submit ─────────────────────────────────────────────────────
                btn.disabled = true;
                // 10-second timeout so button never stays stuck on a hung request
                const ctrl = new AbortController();
                const timeoutId = setTimeout(() => ctrl.abort(), 10000);
                try {
                    const res = await fetch(contactForm.action, {
                        method: 'POST',
                        body: new FormData(contactForm),
                        headers: { 'Accept': 'application/json' },
                        signal: ctrl.signal
                    });
                    clearTimeout(timeoutId);
                    if (res.ok) { successPopup.style.display = 'flex'; successPopup.classList.add('visible'); contactForm.reset(); }
                    else throw new Error('HTTP ' + res.status);
                } catch (err) {
                    clearTimeout(timeoutId);
                    if (err.name === 'AbortError') {
                        bzAlert('danger', 'Request Timed Out', 'The server took too long. Please try again.');
                    } else {
                        bzAlert('danger', 'Send Failed', 'Something went wrong. Check your connection and try again.');
                    }
                }
                finally { btn.disabled = false; }
            };
        }
        if (closeSuccessBtn) closeSuccessBtn.onclick = () => { successPopup.style.display = 'none'; successPopup.classList.remove('visible'); };

        /* UTILITIES */
        const formatTime = (s) => isNaN(s) ? "0:00" : `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

        function updateDynamicTitle() {
            const song = window.playingAlbum?.songs?.[window.currentSongIndex];
            if (song) {
                // AutoMix songs belong to a different source album — show that title
                const songIdStr = String(song.id || '');
                const _titleAlbum = song._autoMix
                    ? (window.allSongsMap?.get(songIdStr)?.album || song._sourceAlbum || window.playingAlbum)
                    : window.playingAlbum;
                const albumTitle = _titleAlbum?.title || _titleAlbum?.name || window.playingAlbum?.title || 'Beat Zen';
                // Show song title only while actively playing
                if (!audioPlayer.paused) {
                    document.title = `${song.title} - ${albumTitle}`;
                } else {
                    document.title = 'Beat Zen - Premium';
                }
            } else {
                document.title = 'Beat Zen - Premium';
            }
        }

        function updatePlayPauseIcon() {
            const paused = audioPlayer.paused;
            if (playPauseBtn) playPauseBtn.innerHTML = paused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
            // Sync mini play/pause button (mobile mini-player)
            const miniBtn = document.getElementById('mini-play-pause-btn');
            if (miniBtn) miniBtn.innerHTML = paused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
            // Sync the Lyrics overlay's desktop side-panel play/pause button
            const lyricsPPBtn = document.getElementById('bz-lyrics-pp-btn');
            if (lyricsPPBtn) lyricsPPBtn.innerHTML = paused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
            const albumPlayBtn = document.querySelector('.play-album-btn');
            if (albumPlayBtn && window.currentAlbum?.id === window.playingAlbum?.id) {
                const icon = albumPlayBtn.querySelector('i'), text = albumPlayBtn.querySelector('span');
                if (icon) icon.className = paused ? 'fas fa-play' : 'fas fa-pause';
                if (text) text.textContent = paused ? 'Play' : 'Pause';
            }
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = paused ? "paused" : "playing";
            // Fix 4: keep home-grid card buttons in sync on every player state
            syncAllCardPlayBtns();
        }
        // BUG FIX: expose globally
        window.updatePlayPauseIcon = updatePlayPauseIcon;

        // Cache setPositionState support check once
        const _canSetPosition = 'mediaSession' in navigator && 'setPositionState' in navigator.mediaSession;

        // Detect MIUI/Xiaomi
        const _isMIUI = /MIUI|MiuiBrowser|XiaoMi|Redmi/i.test(navigator.userAgent);
        let _miuiPositionTimer = null; // interval handle for MIUI live position push

        function updateMediaPositionState() {
            if (!_canSetPosition) return;
            const dur = audioPlayer.duration, cur = audioPlayer.currentTime;
            // Guard: MIUI older WebView throws on Infinity, NaN
            if (!isFinite(dur) || dur <= 0 || !isFinite(cur) || cur < 0) return;
            try {
                navigator.mediaSession.setPositionState({
                    duration: dur,
                    // playbackRate:0 freezes the OS counter (paused)
                    playbackRate: audioPlayer.paused ? 0 : (audioPlayer.playbackRate || 1),
                    position: Math.min(Math.max(0, cur), dur) // clamp both ends for MIUI
                });
            } catch (e) { /* MIUI older versions throw — silently ignore */ }
        }

        // Start 1-second position push for MIUI (does nothing on stock Android)
        function _startMIUIPositionTimer() {
            if (!_isMIUI) return;
            clearInterval(_miuiPositionTimer);
            _miuiPositionTimer = setInterval(() => {
                if (!audioPlayer.paused) updateMediaPositionState();
            }, 1000);
        }

        // Stop the MIUI timer on pause/end
        function _stopMIUIPositionTimer() {
            if (!_isMIUI) return;
            clearInterval(_miuiPositionTimer);
            _miuiPositionTimer = null;
        }

        function resolveData(data, type) {
            if (!data) return null;

            // Resolve each entry in songs[]:
            const songs = (data.songs || []).map(entry => {
                if (typeof entry === 'string') {
                    const canonical = window.allSongsMap.get(entry);
                    if (!canonical) return null;
                    // Return a copy so mutations on this resolved object stay local
                    return { ...canonical.song || canonical, _sourceAlbum: canonical.album };
                }
                // Full object — re-attach source album from map for cover consistency
                const sId = String(entry.id);
                const canonical = window.allSongsMap.get(sId);
                return { ...entry, _sourceAlbum: canonical?.album || entry.album || data };
            }).filter(Boolean);

            let total = 0;
            songs.forEach(s => {
                if (s?.duration) {
                    const p = s.duration.split(':');
                    total += parseInt(p[0]) * 60 + parseInt(p[1]);
                }
            });
            const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
            const dur = `${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm ' : ''}${s}s`.trim();

            const details = `<p><strong>Songs :</strong> ${songs.length} &nbsp;&nbsp; <strong>Duration :</strong> ${dur}${data.year ? ` &nbsp;&nbsp; <strong>Year :</strong> ${data.year}` : ''}</p>`;

            // Build desc for user/imported/saved playlists
            let resolvedDesc = data.desc || data.description || '';

            // Override desc for smart-playlist saves to show origin name instead
            if (data._savedFrom === 'smart' && data._originalSmartId) {
                const SMART_NAMES = {
                    'bz-daily-mix': 'Daily Mix',
                    'bz-repeat-rewind': 'Repeat Rewind',
                    'bz-hidden-gems': 'Hidden Gems',
                    'bz-listen-again': 'Recently Played',
                    'bz-infinite-play': 'Infinite Play',
                };
                const smartName = SMART_NAMES[data._originalSmartId]
                    || (data._originalSmartId.startsWith('bz-year-')
                        ? data._originalSmartId.replace('bz-year-', '') + ' Collection'
                        : data._originalSmartId);
                resolvedDesc = `Added from ${smartName}`;
            }

            // Append "Created:" timestamp when the playlist has a createdAt value
            if (data.createdAt) {
                try {
                    const _cd = new Date(data.createdAt);
                    const _dateStr = _cd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                    const _timeStr = _cd.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                    const _stamp = `Created: ${_dateStr} · ${_timeStr}`;
                    resolvedDesc = resolvedDesc ? `${resolvedDesc}\n${_stamp}` : _stamp;
                } catch (_) { /* ignore malformed date */ }
            }

            return {
                id: String(data.id || data.name || data.title),
                title: data.name || data.title || 'Unknown',
                imageUrl: data.imageUrl || data.albumCover || data.cover || '',
                songs,
                detailsHtml: details,
                desc: resolvedDesc,
                type,
                year: data.year || null
            };
        }
        window.resolveData = resolveData;

        // REPEAT REWIND ENGINE
        function checkRepeatRewind(song) {
            if (!song) return;
            try {
                const BZ_SIGNALS_KEY = 'beatZen_signals';
                const songIdStr_rr = String(song.id);

                // Count qualifying plays from the DEDICATED RR plays store. Each entry
                let rrList = [];
                try { rrList = JSON.parse(localStorage.getItem(BZ_RR_PLAYS_KEY) || '[]'); } catch (_) { }
                const qualifyingPlays = rrList.filter(e => String(e.id) === songIdStr_rr).length;

                if (qualifyingPlays < BZ_RR_MIN_PLAYS) return; /* not yet a Repeat Rewind candidate */

                // Record a 'replay' signal on every qualifying play. Each signal carries
                let signals = [];
                try { signals = JSON.parse(localStorage.getItem(BZ_SIGNALS_KEY) || '[]'); } catch (_) { }
                signals.unshift({ id: songIdStr_rr, signal: 'replay', count: qualifyingPlays, ts: Date.now() });
                signals = signals.slice(0, 1000);
                localStorage.setItem(BZ_SIGNALS_KEY, JSON.stringify(signals));

                /* Toast ONLY on the exact 3rd qualifying play — silent adds after that */
                if (qualifyingPlays === BZ_RR_MIN_PLAYS) {
                    setTimeout(() => {
                        showRepeatRewindToast(song.title, '3rd');
                    }, 800);
                }

                /* Notify Explore to refresh Repeat Rewind section live */
                if (typeof window.bzRefreshRepeatRewind === 'function') {
                    window.bzRefreshRepeatRewind();
                }

            } catch (_rrErr) { /* silent — never break playback */ }
        }

        // Refresh Repeat Rewind section in Playlists tab when a qualifying
        window.bzRefreshRepeatRewind = function () {
            // Guard: never navigate to playlists while the album view is open.
            const _albumView = document.getElementById('album-view-container');
            const _albumOpen = _albumView && _albumView.style.display !== 'none';
            if (!_albumOpen &&
                window.lastActiveView === 'playlists' &&
                typeof window.displayPlaylists === 'function') {
                window.displayPlaylists(true); // only re-renders when Playlists tab is active
            }
        };

        // Build a sorted Repeat Rewind song list from the dedicated RR plays
        window.buildRepeatRewindList = function () {
            try {
                let rrList = [];
                try { rrList = JSON.parse(localStorage.getItem(BZ_RR_PLAYS_KEY) || '[]'); } catch (_) { }

                /* Count qualifying plays per song ID from dedicated RR store */
                const countMap = new Map();
                rrList.forEach(entry => {
                    const id = String(entry.id);
                    countMap.set(id, (countMap.get(id) || 0) + 1);
                });

                /* Build result array */
                const result = [];
                countMap.forEach((count, songId) => {
                    if (count < BZ_RR_MIN_PLAYS) return;
                    const canonical = window.allSongsMap?.get(songId);
                    if (!canonical) return;
                    result.push({
                        songId,
                        count,
                        song: canonical,
                        album: canonical.album
                    });
                });

                /* Sort: most-replayed first; tie-break by most-recent qualifying play */
                result.sort((a, b) => {
                    if (b.count !== a.count) return b.count - a.count;
                    const lastA = rrList.find(e => String(e.id) === a.songId);
                    const lastB = rrList.find(e => String(e.id) === b.songId);
                    return (lastB?.ts || 0) - (lastA?.ts || 0);
                });

                return result;
            } catch (_) { return []; }
        };

        /* PLAY ENGINE */
        window.playSong = async function (index, shouldPlay = true) {
            if (!window.playingAlbum?.songs?.[index]) return;

            // FIX: Early-Skip Signal
            if (shouldPlay && !window._bzHistoryRecorded && window._bzHistoryPending) {
                try {
                    const _prevSong = window._bzHistoryPending.song;
                    const _listenedSecs = audioPlayer.currentTime;          // actual seconds heard
                    const SKIP_THRESHOLD_SECS = 20;

                    if (_prevSong && isFinite(_listenedSecs) && _listenedSecs < SKIP_THRESHOLD_SECS) {
                        const BZ_SIGNALS_KEY = 'beatZen_signals';
                        let signals = [];
                        try { signals = JSON.parse(localStorage.getItem(BZ_SIGNALS_KEY) || '[]'); } catch (_) { /* ignore */ }
                        signals.unshift({
                            id: String(_prevSong.id),
                            signal: 'skip_early',
                            listenedSecs: Math.round(_listenedSecs),
                            ts: Date.now()
                        });
                        signals = signals.slice(0, 500);
                        localStorage.setItem(BZ_SIGNALS_KEY, JSON.stringify(signals));
                    }
                } catch (_seErr) { /* silent — never block playback */ }
            }

            // Fix: Queue Switching
            const _newAlbumId = String(window.playingAlbum.id);
            if (shouldPlay &&
                window._bzCurrentPlayingAlbumId !== undefined &&
                window._bzCurrentPlayingAlbumId !== _newAlbumId) {
                window._bzAutoMixStartIndex = -1;
                window._bzOriginalQueue = null;
                window._bzOriginalAutoMixBoundary = undefined;
                window._bzPreRepeatQueue = null;
                window._bzPreRepeatAutoMixBoundary = undefined;
                window._bzPreRepeatAllQueue = null;
                /* Clear session-used set so AutoMix picks fresh songs for new album */
                if (window._bzAmUsedIds instanceof Set) window._bzAmUsedIds.clear();
            }
            // Track source song count
            if (shouldPlay && (window._bzCurrentPlayingAlbumId === undefined || window._bzCurrentPlayingAlbumId !== _newAlbumId)) {
                window._bzSourceSongCount = window.playingAlbum.songs.length;
            }
            if (shouldPlay) window._bzCurrentPlayingAlbumId = _newAlbumId;

            window.currentSongIndex = index;
            const song = window.playingAlbum.songs[index];
            saveToHistory(window.playingAlbum);
            const albumIdStr = String(window.playingAlbum.id), songIdStr = String(song.id);
            // History is NOT auto-saved here
            const _titleAlbum = song._autoMix
                ? (window.allSongsMap.get(songIdStr)?.album || song._sourceAlbum || window.playingAlbum)
                : window.playingAlbum;
            const _titleStr = _titleAlbum.title || _titleAlbum.name || window.playingAlbum.title;
            // Always update the browser tab title so it reflects the restored song
            document.title = `${song.title} - ${_titleStr}`;
            if (shouldPlay) {
                // FIX: preserve navFrom and scrollY that selectAlbum wrote
                const _existingState = history.state || {};
                history.replaceState({
                    view: 'album',
                    albumId: albumIdStr,
                    songIndex: index,
                    songId: songIdStr,
                    navFrom: _existingState.navFrom || 'home',
                    scrollY: typeof _existingState.scrollY === 'number' ? _existingState.scrollY : 0
                }, `${song.title} • ${_titleStr}`, `#album-${albumIdStr}/song-${songIdStr}`);
            }
            // When intentionally starting a new song
            if (shouldPlay) {
                localStorage.removeItem('beatZen_lastPosition');
                // Only persist on real plays
                const _srcAlbumMeta = window.allSongsMap.get(songIdStr)?.album || song._sourceAlbum || window.playingAlbum;
                // For AutoMix songs, always use the song's real canonical source album
                const _isAutoMixSave = !!song._autoMix;
                // FIX: "Virtual" collections
                const _playingAlbumInMasterPool = Array.isArray(window.masterPool) && window.masterPool.some(a =>
                    String(a?.id ?? '') === String(window.playingAlbum.id) ||
                    String(a?.name ?? '') === String(window.playingAlbum.id) ||
                    String(a?.title ?? '') === String(window.playingAlbum.id)
                );
                // FIX (wrong-song-on-restore): songs added via "Play Next" / "Add to End
                const _srcAlbumIdForCompare = String(_srcAlbumMeta?.id ?? _srcAlbumMeta?.name ?? _srcAlbumMeta?.title ?? '');
                const _playingAlbumIdForCompare = String(window.playingAlbum?.id ?? window.playingAlbum?.name ?? window.playingAlbum?.title ?? '');
                const _songBelongsToPlayingAlbum = !_srcAlbumIdForCompare || _srcAlbumIdForCompare === _playingAlbumIdForCompare;
                const _useSourceAlbumForRestore = _isAutoMixSave || !_playingAlbumInMasterPool || !_songBelongsToPlayingAlbum;
                const _restoreAlbum = _useSourceAlbumForRestore ? (_srcAlbumMeta) : window.playingAlbum;
                const _restoreAlbumId = String(_restoreAlbum?.id || _restoreAlbum?.name || _restoreAlbum?.title || albumIdStr);
                const _restoreType = _restoreAlbum?.type || window.playingAlbum.type;
                // When falling back to the source album
                const _restoreSongIndex = _useSourceAlbumForRestore ? 0 : index;
                localStorage.setItem('lastPlayedSong', JSON.stringify({
                    albumId: _restoreAlbumId,
                    songIndex: _restoreSongIndex,
                    songId: songIdStr,
                    type: _restoreType,
                    isAutoMix: _isAutoMixSave,
                    title: song.title || '',
                    artist: song.artist || '',
                    cover: _srcAlbumMeta?.imageUrl || _srcAlbumMeta?.albumCover || '',
                    // FIX: persist the actual streamable audio URL (+ known duration)
                    url: song.url || '',
                    duration: song.duration || '',
                    savedAt: Date.now()
                }));
            }
            const songData = window.allSongsMap.get(songIdStr);
            const albumData = songData?.album || song._sourceAlbum || window.playingAlbum;
            if (playerSongTitle) playerSongTitle.textContent = song.title;

            // Reveal player bar on first play
            (function _bzRevealPlayer() {
                var _mp = document.getElementById('main-player');
                if (_mp && !_mp.classList.contains('bz-player-active')) {
                    _mp.classList.add('bz-player-active');
                    // Remove the inline failsafe styles so the CSS class can control
                    _mp.style.removeProperty('transform');
                    _mp.style.removeProperty('pointer-events');
                }
                document.body.classList.add('bz-has-player');
            })();

            // INSTANT HISTORY RECORD
            if (shouldPlay) {
                if (window._bzHistoryTimer) { clearTimeout(window._bzHistoryTimer); window._bzHistoryTimer = null; }
                window._bzHistoryRecorded = true;
                window.recordHistory(song, window.playingAlbum);
            }

            // REPEAT REWIND
            if (shouldPlay) {
                window._bzRRCountedThisSong = null; // reset flag for new song
                window._bzRRListenedSecs = 0;     // accumulated real audio seconds
                window._bzRRLastTime = null;  // last audioPlayer.currentTime sample
                window._bzRRSongId = String(song.id); // guard: which song we're tracking
            }
            if (playerSongArtist) playerSongArtist.textContent = song.artist;

            if (playerAlbumCover) {
                const _coverSrc = albumData.imageUrl || albumData.albumCover || albumData.cover
                    || window.playingAlbum?.imageUrl || window.playingAlbum?.albumCover
                    || song._coverUrl || '';
                playerAlbumCover.src = _coverSrc || 'https://res.cloudinary.com/beatzenapp/image/upload/v1782654641/Logo_kmpfjf.jpg';
                playerAlbumCover.onerror = () => {
                    playerAlbumCover.onerror = null;
                    playerAlbumCover.src = 'https://res.cloudinary.com/beatzenapp/image/upload/v1782654641/Logo_kmpfjf.jpg';
                };
            }
            const headerLabel = document.getElementById('header-playing-from');
            const headerMovie = document.getElementById('header-movie-name');
            if (headerLabel && headerMovie) {
                const type = String(window.playingAlbum.type).toLowerCase();

                // Resolve the true source album for this individual song. Priority
                const canonicalAlbum = window.allSongsMap.get(songIdStr)?.album
                    || song._sourceAlbum || null;
                const sourceAlbum = canonicalAlbum || song._sourceAlbum || null;

                // Is this an Auto-Mix injected song playing inside a "movie" context?
                const isAutoMixSong = !!song._autoMix;

                if (isAutoMixSong && sourceAlbum) {
                    // Auto-Mix song: always show its own source movie, labelled as Auto-Mix
                    const realMovie = (sourceAlbum.title || sourceAlbum.name || "Single");
                    headerLabel.textContent = "Auto-Mix — Playing from movie";
                    headerMovie.textContent = realMovie;
                } else {
                    // Normal (non-automix) playback — use original logic
                    const name = (window.playingAlbum.title || window.playingAlbum.name || "Unknown");
                    const movie = (sourceAlbum?.title || sourceAlbum?.name || "Single");
                    if (type === "movie") { headerLabel.textContent = "Playing from movie"; headerMovie.textContent = name; }
                    else if (type === "artist") { headerLabel.textContent = `Playing from artist - ${name}`; headerMovie.textContent = movie; }
                    else if (type === "playlist") { headerLabel.textContent = `Playing from playlist - ${name}`; headerMovie.textContent = movie; }
                    else if (type === "explore" || type === "collection") { headerLabel.textContent = `Playing from playlists - ${name}`; headerMovie.textContent = movie; }
                    else { headerLabel.textContent = "Playing from Beat Zen"; headerMovie.textContent = name; }
                }
            }
            audioPlayer.onended = null;
            window._bzMarkExplicitPause?.();
            audioPlayer.pause();
            // Reset restore state BEFORE changing src so stale
            audioPlayer._restoreApplied = false;
            clearTimeout(audioPlayer._restoreTimeout);
            if (audioPlayer._restoreCPHandler) {
                audioPlayer.removeEventListener('canplay', audioPlayer._restoreCPHandler);
                audioPlayer.removeEventListener('loadedmetadata', audioPlayer._restoreCPHandler);
                audioPlayer._restoreCPHandler = null;
            }
            // Track whether this load is a real play or just a restore. The audio
            window._bzExpectingPlayback = !!shouldPlay;
            // Fix: skips re-setting <audio>.src and calling load() again
            const _instantRestoreHit = !shouldPlay && audioPlayer._bzInstantSrc && audioPlayer._bzInstantSrc === song.url;
            audioPlayer._bzInstantSrc = null; // one-shot flag — consume regardless of outcome
            if (!_instantRestoreHit) {
                audioPlayer.src = song.url;
            }

            // Fix: assigns onended before load() so the ended event can never fire
            audioPlayer.onended = handleTrackEnded;

            // FIX: Gapless playback
            const _isGapless = shouldPlay && _gpReady && _gpIdx === index && _gpSrc === song.url;
            if (!_isGapless && !_instantRestoreHit) {
                audioPlayer.load();
            }
            /* Reset preload state so the next song gets a fresh preload window */
            if (shouldPlay) {
                _gpIdx = -1;
                _gpReady = false;
                _gpSrc = '';
                try { _preloadAudio.src = ''; } catch (_) { /* ignore */ }
            }

            // Set onended immediately after load
            audioPlayer.onended = handleTrackEnded;
            if ('mediaSession' in navigator) {
                navigator.mediaSession.metadata = new MediaMetadata({ title: song.title, artist: song.artist, album: albumData.title || "Beat Zen", artwork: [{ src: albumData.imageUrl, sizes: '512x512', type: 'image/jpeg' }] });
                // MIUI/Redmi injects seekbackward+seekforward buttons automatically
                [
                    ['play', () => { if (audioPlayer.paused) window.togglePlayback(); }],
                    ['pause', () => { if (!audioPlayer.paused) window.togglePlayback(); }],
                    ['previoustrack', () => window.playPrevSong()],
                    ['nexttrack', () => window.playNextSong()],
                    ['seekto', (d) => { if (d.seekTime && isFinite(d.seekTime)) audioPlayer.currentTime = d.seekTime; }],
                    ['seekbackward', (d) => { audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - (d?.seekOffset ?? 10)); }],
                    ['seekforward', (d) => { audioPlayer.currentTime = Math.min(audioPlayer.duration || 0, audioPlayer.currentTime + (d?.seekOffset ?? 10)); }],
                ].forEach(([a, h]) => { try { navigator.mediaSession.setActionHandler(a, h); } catch (e) { } });
            }
            if (shouldPlay) {
                audioPlayer.play().then(() => {
                    window._bzExpectingPlayback = true; /* confirm still active */
                    updatePlayPauseIcon(); updateDynamicTitle();
                    syncAllCardPlayBtns(); // Fix 2: sync home grid on every playSong call
                    if (typeof window.bzSyncPlaylistsPlayBtns === 'function') window.bzSyncPlaylistsPlayBtns();
                }).catch(() => { window._bzExpectingPlayback = false; });
            } else {
                updatePlayPauseIcon(); updateDynamicTitle();
                syncAllCardPlayBtns(); // Fix 2: sync home grid even when not autoplaying (restore)
                // applySavedTime handles its own canplay/loadedmetadata listener
                if (window.applySavedTime) window.applySavedTime();
                // FIX Bug 6: if the user hit play while restore was still in progress
                if (window._bzAutoPlayAfterRestore) {
                    window._bzAutoPlayAfterRestore = false;
                    audioPlayer.play().then(() => {
                        updatePlayPauseIcon(); updateDynamicTitle();
                        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
                    }).catch(() => { });
                }
            }
            if (typeof updateActiveSongHighlight === 'function') updateActiveSongHighlight();
        };

        // SESSION RESTORE
        if (typeof window.restoreMobileSession === 'function') {
            window.restoreMobileSession();
        } else {
            // Mobile IIFE parsed after startApp (unusual)
            window._bzRestoreOnReady = true;
        }

        function handleTrackEnded() {
            /* Song ended naturally = fully played. Record history now if not already */
            if (window._bzHistoryTimer) { clearTimeout(window._bzHistoryTimer); window._bzHistoryTimer = null; }
            /* Song ended naturally — always a qualifying listen (handled below). */
            if (!window._bzHistoryRecorded && window._bzHistoryPending) {
                window._bzHistoryRecorded = true;
                window.recordHistory(window._bzHistoryPending.song, window._bzHistoryPending.album);
            }

            // Song played to completion
            try {
                const _endedSong = window.playingAlbum?.songs?.[window.currentSongIndex];
                if (_endedSong) {
                    // Since syncProgressBar now records RR on the very first tick of a new
                    const _alreadyCounted = window._bzRRCountedThisSong === String(_endedSong.id);
                    if (!_alreadyCounted) {
                        try {
                            let rrList = [];
                            try { rrList = JSON.parse(localStorage.getItem(BZ_RR_PLAYS_KEY) || '[]'); } catch (_) { }
                            rrList.unshift({ id: String(_endedSong.id), ts: Date.now() });
                            rrList = rrList.slice(0, BZ_RR_PLAYS_MAX);
                            localStorage.setItem(BZ_RR_PLAYS_KEY, JSON.stringify(rrList));
                        } catch (_) { }
                        // Only call checkRepeatRewind when we actually wrote a new entry
                        checkRepeatRewind(_endedSong);
                    }
                }
            } catch (_) { /* silent */ }

            /* Record 'full_play' signal — song was listened to completion */
            try {
                const song = window.playingAlbum?.songs?.[window.currentSongIndex];
                if (song) {
                    const BZ_SIGNALS_KEY = 'beatZen_signals';
                    let signals = [];
                    try { signals = JSON.parse(localStorage.getItem(BZ_SIGNALS_KEY) || '[]'); } catch (_) { }
                    signals.unshift({ id: String(song.id), signal: 'full_play', ts: Date.now() });
                    signals = signals.slice(0, 500);
                    localStorage.setItem(BZ_SIGNALS_KEY, JSON.stringify(signals));
                }
            } catch (_) { /* silent */ }
            window._bzHistoryPending = null;

            if (window.repeatMode === 2) {
                /* REPEAT ONE: restart from zero, keep onended intact */
                window._bzHistoryRecorded = false;
                const song = window.playingAlbum?.songs?.[window.currentSongIndex];

                /* Each completed loop iteration counts as a qualifying play for Repeat */
                if (song) {
                    const _loopSongId = String(song.id);
                    try {
                        let rrList = [];
                        try { rrList = JSON.parse(localStorage.getItem(BZ_RR_PLAYS_KEY) || '[]'); } catch (_) { }
                        rrList.unshift({ id: _loopSongId, ts: Date.now() });
                        rrList = rrList.slice(0, BZ_RR_PLAYS_MAX);
                        localStorage.setItem(BZ_RR_PLAYS_KEY, JSON.stringify(rrList));
                    } catch (_) { /* silent */ }
                    checkRepeatRewind(song);
                }

                audioPlayer.currentTime = 0;
                audioPlayer.onended = handleTrackEnded;
                audioPlayer.play().then(() => {
                    if (song) {
                        const _gSong = song, _gAlbum = window.playingAlbum;
                        window._bzHistoryPending = { song: _gSong, album: _gAlbum };
                        window._bzHistoryTimer = setTimeout(function () {
                            if (!window._bzHistoryRecorded && !audioPlayer.paused) {
                                window._bzHistoryRecorded = true;
                                window.recordHistory(_gSong, _gAlbum);
                            }
                        }, 30000);
                        window._bzRRCountedThisSong = null;
                        window._bzRRListenedSecs = 0;
                        window._bzRRLastTime = null;
                        window._bzRRSongId = String(_gSong.id);
                    }
                }).catch(() => { });
                return;
            }

            // FIX: Gapless – ensure the preload flag is set for the next index
            const _nextIdxForGapless = window.currentSongIndex + 1;
            if (!_gpReady && _gpIdx === _nextIdxForGapless && _gpSrc) {
                /* Preload may have finished by now even if canplaythrough hadn't fired */
                _gpReady = _preloadAudio.readyState >= 3;
            }

            playNextSong();
        }

        function togglePlayback() {
            // FIX: audioPlayer.src can now be set early by the "INSTANT AUDIO
            const valid = audioPlayer.src && audioPlayer.src !== window.location.href && !audioPlayer.src.endsWith('/')
                && !!window.playingAlbum && window.currentSongIndex > -1;
            if (!valid) {
                // FIX Bug 6: previously this silently returned
                const hasLastSong = !!localStorage.getItem('lastPlayedSong');
                if (hasLastSong) {
                    if (!window._bzAutoPlayAfterRestore) {
                        window._bzAutoPlayAfterRestore = true;
                        // FIX: give immediate visual feedback
                        if (playPauseBtn) playPauseBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
                        const miniBtn = document.getElementById('mini-play-pause-btn');
                        if (miniBtn) miniBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
                        if (typeof window.restoreMobileSession === 'function') window.restoreMobileSession();
                        // Safety net: if restore (success or failure) hasn't cleared the spinner
                        clearTimeout(window._bzSpinnerSafety);
                        window._bzSpinnerSafety = setTimeout(() => {
                            if (typeof updatePlayPauseIcon === 'function') updatePlayPauseIcon();
                        }, 8000);
                    }
                }
                return;
            }
            if (audioPlayer.paused) {
                audioPlayer.play().then(() => { updatePlayPauseIcon(); updateDynamicTitle(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing"; }).catch(() => { });
            } else {
                window._bzMarkExplicitPause?.();
                audioPlayer.pause(); updatePlayPauseIcon(); updateDynamicTitle();
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "paused";
            }
        }
        window.togglePlayback = togglePlayback;

        function playNextSong() {
            if (!window.playingAlbum?.songs?.length) return;
            const total = window.playingAlbum.songs.length;
            if (window.repeatMode === 2) {
                /* REPEAT ONE: handleTrackEnded handles history — don't double-record */
                audioPlayer.currentTime = 0;
                audioPlayer.play().catch(() => { });
                if (window._highlightActive && typeof window.updateActiveSongHighlight === 'function') {
                    requestAnimationFrame(() => window.updateActiveSongHighlight());
                }
                return;
            }

            // When shuffle is ON the queue is already reordered by toggleShuffle
            const next = window.currentSongIndex + 1;
            if (next >= total) {
                // REPEAT ALL (mode 1): wrap back to song 0 when end of album/playlist
                if (window.repeatMode === 1) {
                    if (window._bzOffline && !navigator.onLine) { stopAndReset(); return; }
                    // Strip any manually-queued songs that sit beyond the source album
                    const srcCount = window._bzSourceSongCount;
                    if (srcCount > 0 && window.playingAlbum.songs.length > srcCount) {
                        window.playingAlbum.songs.splice(srcCount);
                        if (typeof window.rebuildMasterMap === 'function') window.rebuildMasterMap();
                        if (typeof window.renderFullscreenQueue === 'function') window.renderFullscreenQueue();
                    }
                    window._highlightActive = true;
                    window._bzScrollToActive = true;
                    window.playSong(0);
                    return;
                }
                // FIX: Queue Continuation
                const automixEnabled = localStorage.getItem('beatzen_automix') === 'true';
                if (automixEnabled) {
                    let _retries = 0;
                    const _waitForAutoMix = () => {
                        const newTotal = window.playingAlbum?.songs?.length || 0;
                        const newNext = window.currentSongIndex + 1;
                        if (newNext < newTotal) {
                            /* Auto-Mix injected songs — play now */
                            if (window._bzOffline && !navigator.onLine) { stopAndReset(); return; }
                            window._highlightActive = true;
                            window._bzScrollToActive = true;
                            window.playSong(newNext);
                            return;
                        }
                        if (_retries < 5) {
                            _retries++;
                            setTimeout(_waitForAutoMix, 120);
                        } else {
                            /* AutoMix didn't deliver in time — stop cleanly */
                            stopAndReset();
                        }
                    };
                    setTimeout(_waitForAutoMix, 120);
                    return;
                }
                return stopAndReset();
            }

            // Offline guard: don't load next song
            if (window._bzOffline && !navigator.onLine) {
                stopAndReset();
                return;
            }
            window._bzOffline = false;

            /* Preserve highlight state across next/prev navigation */
            window._highlightActive = true;
            window._bzScrollToActive = true;  // signal updateActiveSongHighlight to center this row
            window.playSong(next);
        }

        function playPrevSong() {
            if (!window.playingAlbum) return;
            if (audioPlayer.currentTime > 3) { audioPlayer.currentTime = 0; return; }
            // When shuffle is ON the queue is already reordered by toggleShuffle
            const prev = window.currentSongIndex - 1;
            if (prev < 0) { audioPlayer.currentTime = 0; return; }
            /* Preserve highlight state across next/prev navigation */
            window._highlightActive = true;
            window._bzScrollToActive = true;  // signal updateActiveSongHighlight to center this row
            window.playSong(prev);
        }

        // Replaced by enhanced version above

        window.playNextSong = playNextSong;
        window.playPrevSong = playPrevSong;

        /* NEXT ALBUM CYCLING & TOAST */
        window.nextAlbum = function () {
            if (!window.masterPool?.length) return null;

            // Prefer recent history first
            let candidates = window.masterPool.filter(a => a && a.songs?.length > 0);
            if (window.historyList?.length) {
                const recentId = window.historyList[0].id;
                const recent = candidates.find(a => String(a.id) === String(recentId));
                if (recent && recent !== window.playingAlbum) {
                    return window.resolveData(recent, recent.type || 'album');
                }
            }

            // Filter out current album, pick first valid
            candidates = candidates.filter(a => String(a.id) !== String(window.playingAlbum?.id));
            return candidates[0] ? window.resolveData(candidates[0], candidates[0].type || 'album') : null;
        };

        // TOAST NOTIFICATION ENGINE
        function showToast(message, duration = 5000) {
            const container = document.getElementById('toast-container');
            if (!container) return;

            /* Accept {title, message} object OR plain string */
            let rawMsg, forcedTitle = null;
            if (message && typeof message === 'object') {
                rawMsg = message.message || '';
                forcedTitle = message.title || null;
            } else {
                rawMsg = message || '';
            }
            const msg = rawMsg;

            let iconClass, iconBg, borderColor, glowColor, labelText, labelColor;

            // Auto Sync is checked first
            if (/auto.?sync|auto sync/i.test(msg)) {
                iconClass = 'fa-cloud-bolt';
                iconBg = 'linear-gradient(135deg,#2575fc,#0099ff)';
                borderColor = 'rgba(37,117,252,0.45)';
                glowColor = 'rgba(37,117,252,0.12)';
                labelText = 'Auto Sync'; labelColor = '#90caf9';
                // Error — "couldn't load" and "skipping" added so audio-load failures
            } else if (/fail|error|invalid|corrupt|couldn't load|skipping/i.test(msg)) {
                iconClass = 'fa-circle-exclamation';
                iconBg = 'linear-gradient(135deg,#c0392b,#e74c3c)';
                borderColor = 'rgba(231,76,60,0.45)';
                glowColor = 'rgba(231,76,60,0.12)';
                labelText = 'Error'; labelColor = '#ff8a80';
            } else if (/restored|success|import|export|created|added|copied|saved|set!/i.test(msg) || msg.includes('\u2713')) {
                iconClass = 'fa-circle-check';
                iconBg = 'linear-gradient(135deg,#1db954,#1ed760)';
                borderColor = 'rgba(29,185,84,0.45)';
                glowColor = 'rgba(29,185,84,0.12)';
                labelText = 'Done'; labelColor = '#6bcb77';
            } else if (/cancel|remov|delet|stop/i.test(msg)) {
                iconClass = 'fa-circle-xmark';
                iconBg = 'linear-gradient(135deg,#b91c1c,#ef4444)';
                borderColor = 'rgba(239,68,68,0.45)';
                glowColor = 'rgba(239,68,68,0.12)';
                labelText = 'Removed'; labelColor = '#fca5a5';
            } else if (/sync|syncing|refresh|refreshing|updating|update/i.test(msg)) {
                iconClass = 'fa-arrows-rotate';
                iconBg = 'linear-gradient(135deg,#2575fc,#0099ff)';
                borderColor = 'rgba(37,117,252,0.45)';
                glowColor = 'rgba(37,117,252,0.12)';
                labelText = 'Cloud Sync'; labelColor = '#90caf9';
            } else if (/download|saving|cached|offline/i.test(msg)) {
                iconClass = 'fa-cloud-arrow-down';
                iconBg = 'linear-gradient(135deg,#6a11cb,#2575fc)';
                borderColor = 'rgba(106,17,203,0.45)';
                glowColor = 'rgba(106,17,203,0.12)';
                labelText = 'Download'; labelColor = '#ce93d8';
            } else if (/loading|fetching|connecting|preparing/i.test(msg)) {
                iconClass = 'fa-spinner';
                iconBg = 'linear-gradient(135deg,#f39c12,#e67e22)';
                borderColor = 'rgba(243,156,18,0.45)';
                glowColor = 'rgba(243,156,18,0.12)';
                labelText = 'Loading'; labelColor = '#ffd580';
            } else if (/auto.?mix/i.test(msg) || msg.includes('\u2726')) {
                iconClass = 'fa-wand-magic-sparkles';
                iconBg = 'linear-gradient(135deg,#2575fc,#6a11cb)';
                borderColor = 'rgba(37,117,252,0.45)';
                glowColor = 'rgba(37,117,252,0.12)';
                labelText = 'Auto Mix'; labelColor = '#90b8ff';
            } else if (/schedule|dark.?mode/i.test(msg)) {
                iconClass = 'fa-clock';
                iconBg = 'linear-gradient(135deg,#7c3aed,#4f46e5)';
                borderColor = 'rgba(124,58,237,0.45)';
                glowColor = 'rgba(124,58,237,0.12)';
                labelText = 'Dark Mode Schedule'; labelColor = '#a78bfa';
                // History and Playlist are checked BEFORE Queue so that messages
            } else if (/histor|cleared/i.test(msg)) {
                iconClass = 'fa-clock-rotate-left';
                iconBg = 'linear-gradient(135deg,#636e72,#2d3436)';
                borderColor = 'rgba(178,190,195,0.35)';
                glowColor = 'rgba(178,190,195,0.08)';
                labelText = 'Play History'; labelColor = '#b2bec3';
            } else if (/playlist/i.test(msg)) {
                iconClass = 'fa-compact-disc';
                iconBg = 'linear-gradient(135deg,#7c3aed,#4f46e5)';
                borderColor = 'rgba(124,58,237,0.45)';
                glowColor = 'rgba(124,58,237,0.12)';
                labelText = 'Playlist'; labelColor = '#a78bfa';
            } else if (/next|play/i.test(msg)) {
                iconClass = 'fa-forward-step';
                iconBg = 'linear-gradient(135deg,#f39c12,#e67e22)';
                borderColor = 'rgba(243,156,18,0.45)';
                glowColor = 'rgba(243,156,18,0.12)';
                labelText = 'Queue'; labelColor = '#ffd580';
            } else if (/songs.*loaded|data.*ready|music.*ready/i.test(msg)) {
                iconClass = 'fa-music';
                iconBg = 'linear-gradient(135deg,#1db954,#2575fc)';
                borderColor = 'rgba(29,185,84,0.45)';
                glowColor = 'rgba(29,185,84,0.12)';
                labelText = 'Music Ready'; labelColor = '#6bcb77';
            } else if (/timer|alarm|sleep/i.test(msg)) {
                iconClass = 'fa-hourglass-half';
                iconBg = 'linear-gradient(135deg,#f59e0b,#d97706)';
                borderColor = 'rgba(245,158,11,0.45)';
                glowColor = 'rgba(245,158,11,0.12)';
                labelText = 'Sleep Timer'; labelColor = '#fde68a';
                // Fullscreen
            } else if (/fullscreen/i.test(msg)) {
                iconClass = 'fa-expand';
                iconBg = 'linear-gradient(135deg,#7c3aed,#4f46e5)';
                borderColor = 'rgba(124,58,237,0.45)';
                glowColor = 'rgba(124,58,237,0.12)';
                labelText = 'Fullscreen'; labelColor = '#a78bfa';
            } else {
                iconClass = 'fa-circle-info';
                iconBg = 'linear-gradient(135deg,#2575fc,#6a11cb)';
                borderColor = 'rgba(124,58,237,0.45)';
                glowColor = 'rgba(124,58,237,0.12)';
                labelText = 'Notice'; labelColor = '#a78bfa';
            }

            if (forcedTitle) labelText = forcedTitle;

            // Strip only a leading ✓ or ✦ symbol — keep the full message text
            const cleanMsg = msg.replace(/^[✓✦]\s*/, '').trim();

            const toast = document.createElement('div');
            toast.className = 'bz-generic-toast';
            toast.innerHTML = `
                <div class="bz-rr-icon-wrap" style="background:${iconBg};box-shadow:0 4px 14px ${glowColor.replace('0.12', '0.5')};">
                    <i class="fas ${iconClass}" style="color:#fff;font-size:15px;"></i>
                </div>
                <div class="bz-rr-text">
                    <span class="bz-rr-label" style="color:${labelColor};">${labelText}</span>
                    <span class="bz-rr-sub">${cleanMsg}</span>
                </div>
                <button class="bz-toast-close" aria-label="Close">
                    <i class="fas fa-xmark"></i>
                </button>
                <div class="bz-toast-progress" style="--toast-duration:${duration}ms;background:${labelColor};"></div>`;
            toast.style.cssText = `border-color:${borderColor};box-shadow:0 8px 32px rgba(0,0,0,0.55),0 0 0 1px ${glowColor};`;

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
        // BUG FIX: expose globally
        window.showToast = showToast;

        /* ── Repeat Rewind styled toast — bottom-center, icon-based ── */
        function showRepeatRewindToast(songTitle, playWord, duration = 3500) {
            const container = document.getElementById('toast-container');
            if (!container) return;

            /* Remove any existing repeat-rewind toast to avoid stacking */
            container.querySelector('.bz-rr-toast')?.remove();

            const toast = document.createElement('div');
            toast.className = 'bz-rr-toast';
            toast.innerHTML = `
                <div class="bz-rr-icon-wrap" style="
                    background:linear-gradient(135deg,#7c3aed,#4f46e5);
                    box-shadow:0 4px 14px rgba(124,58,237,0.5);
                ">
                    <i class="fas fa-repeat" style="color:#fff;font-size:14px;"></i>
                </div>
                <div class="bz-rr-text">
                    <span class="bz-rr-label">Repeat Rewind</span>
                    <span class="bz-rr-sub">Songs you replayed upto 3+ times &nbsp;·&nbsp; ${songTitle}</span>
                </div>`;

            container.appendChild(toast);

            requestAnimationFrame(() => requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateY(0) scale(1)';
            }));

            const timer = setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(8px) scale(0.96)';
                setTimeout(() => toast.remove(), 300);
            }, duration);

            toast.addEventListener('click', () => {
                clearTimeout(timer);
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(8px) scale(0.96)';
                setTimeout(() => toast.remove(), 280);
            }, { once: true });
        }

        function stopAndReset() {
            window._bzMarkExplicitPause?.();
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
            _stopMIUIPositionTimer(); // clear MIUI position timer if running
            /* Reset RR accumulators so no stale seconds bleed into the next song */
            window._bzRRCountedThisSong = null;
            window._bzRRListenedSecs = 0;
            window._bzRRLastTime = null;
            window._bzRRSongId = null;
            // Clear active song highlight so no row glows after queue ends
            window._highlightActive = false;
            window.currentSongIndex = -1;
            document.querySelectorAll('.song-item').forEach(el => el.classList.remove('active'));
            updatePlayPauseIcon();
            updateDynamicTitle();
        }

        // Audio-focus interruption tracking
        window._bzLastPlayingHeartbeatAt = 0;
        audioPlayer.addEventListener('timeupdate', () => { window._bzLastPlayingHeartbeatAt = Date.now(); });
        function _bzMarkExplicitPause() { window._bzExplicitPauseAt = Date.now(); }
        window._bzMarkExplicitPause = _bzMarkExplicitPause;

        /* AUDIO EVENTS */
        audioPlayer.onplay = () => {
            // A new/resumed playback stream means any prior interruption is over.
            window._bzExternallyInterrupted = false;
            updatePlayPauseIcon(); updateDynamicTitle();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            // Sync BOTH card layers — home grid cards and playlist cards
            syncAllCardPlayBtns();
            if (typeof window.bzSyncPlaylistsPlayBtns === 'function') window.bzSyncPlaylistsPlayBtns();
            // Re-sync active song highlight on every play event
            if (window._highlightActive && typeof updateActiveSongHighlight === 'function') {
                requestAnimationFrame(() => updateActiveSongHighlight());
            }
            // Tell OS to start counting forward; start MIUI 1s interval in parallel
            updateMediaPositionState();
            _startMIUIPositionTimer();
            // Push lastPlayedSong/beatZen_lastPosition to the cloud promptly
            setTimeout(() => { try { window.bzSilentUpload?.(); } catch (_) { } }, 200);
        };
        audioPlayer.onpause = () => {
            // FIX (audio-focus interruption bug): this pause was genuinely
            const wasMidSong = audioPlayer.currentTime > 0 && (Date.now() - (window._bzLastPlayingHeartbeatAt || 0)) < 3000;
            const wasExplicit = (Date.now() - (window._bzExplicitPauseAt || 0)) < 500;
            // FIX (song-repeats-after-ending bug): the browser always fires a native
            window._bzExternallyInterrupted = wasMidSong && !wasExplicit && !audioPlayer.ended;
            if (window._bzExternallyInterrupted) window._bzInterruptedAt = Date.now();

            updatePlayPauseIcon(); updateDynamicTitle();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
            // Sync BOTH card layers on pause too
            syncAllCardPlayBtns();
            if (typeof window.bzSyncPlaylistsPlayBtns === 'function') window.bzSyncPlaylistsPlayBtns();
            // Freeze OS counter; stop MIUI interval
            updateMediaPositionState();
            _stopMIUIPositionTimer();
            // Push the position reached at pause-time promptly
            setTimeout(() => { try { window.bzSilentUpload?.(); } catch (_) { } }, 200);
        };
        audioPlayer.addEventListener('waiting', () => {
            if (playPauseBtn) playPauseBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
            const miniBtn = document.getElementById('mini-play-pause-btn');
            if (miniBtn) miniBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
        });

        // FIX (audio-focus interruption bug): when the OS paused us because
        function _bzTryAutoResumeAfterInterruption() {
            if (!window._bzExternallyInterrupted) return;
            // Don't surprise-resume audio after a long absence.
            if (Date.now() - (window._bzInterruptedAt || 0) > 30 * 60 * 1000) {
                window._bzExternallyInterrupted = false;
                return;
            }
            if (!audioPlayer.paused) { window._bzExternallyInterrupted = false; return; }
            if (!audioPlayer.src || audioPlayer.src === window.location.href) return;
            const p = audioPlayer.play();
            if (p !== undefined) {
                p.then(() => { window._bzExternallyInterrupted = false; })
                    .catch(() => { /* browser withheld playback — leave paused, user can tap play */ });
            }
        }
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') _bzTryAutoResumeAfterInterruption();
        });
        window.addEventListener('focus', _bzTryAutoResumeAfterInterruption);
        audioPlayer.addEventListener('playing', () => { updatePlayPauseIcon(); updateMediaPositionState(); });
        // FIX: live-duration corruption
        audioPlayer.addEventListener('loadeddata', () => { if (isFinite(audioPlayer.duration) && audioPlayer.duration > 0) document.querySelectorAll('#duration, #bz-lyrics-duration').forEach(el => el.textContent = formatTime(audioPlayer.duration)); });
        audioPlayer.addEventListener('seeked', updateMediaPositionState);
        audioPlayer.addEventListener('loadedmetadata', () => { updateMediaPositionState(); if (isFinite(audioPlayer.duration) && audioPlayer.duration > 0) document.querySelectorAll('#duration, #bz-lyrics-duration').forEach(el => el.textContent = formatTime(audioPlayer.duration)); }); // FIX Bug 9: use querySelectorAll for all duration elements
        audioPlayer.addEventListener('ratechange', updateMediaPositionState);
        audioPlayer.addEventListener('error', () => {
            /* Guard 1: ignore errors from empty/unset src (page load, reset) */
            if (!audioPlayer.src || audioPlayer.src === window.location.href) return;
            // Guard 2: ignore errors during session restore (shouldPlay=false).
            if (!window._bzExpectingPlayback) return;
            // Code 4 (MEDIA_ERR_SRC_NOT_SUPPORTED) = URL definitively broken
            const delay = (audioPlayer.error?.code === 4) ? 0 : 2000;
            showToast("Couldn't load this song, skipping…");
            setTimeout(playNextSong, delay);
        });
        audioPlayer.addEventListener('play', () => { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing"; });
        audioPlayer.addEventListener('ended', () => { if (window.repeatMode !== 2 && 'mediaSession' in navigator) navigator.mediaSession.playbackState = "none"; });

        /* FIX: Volume Persistence – save whenever volume changes */
        audioPlayer.addEventListener('volumechange', () => {
            localStorage.setItem('beatZen_volume', String(audioPlayer.volume));
        });

        // Save playback position for restore on refresh.
        function saveLastPosition() {
            const cur = audioPlayer.currentTime, dur = audioPlayer.duration;
            if (!isFinite(cur) || cur <= 0) return;
            try {
                const _posSongId = window.playingAlbum?.songs?.[window.currentSongIndex]?.id;
                localStorage.setItem('beatZen_lastPosition', JSON.stringify({
                    t: cur,
                    d: isFinite(dur) && dur > 0 ? dur : undefined,
                    id: _posSongId != null ? String(_posSongId) : ''
                }));
            } catch (_) { /* storage full/unavailable — the next tick will retry */ }
        }
        window.saveLastPosition = saveLastPosition;

        /* PROGRESS BAR */
        function syncProgressBar() {
            if (isDragging) return;
            // FIX Bug 1 & 2: while paused and the saved-position restore hasn't been
            if (audioPlayer.paused && !audioPlayer._restoreApplied) return;
            const cur = audioPlayer.currentTime, dur = audioPlayer.duration;
            const pct = dur > 0 ? (cur / dur) * 100 : 0;
            document.querySelectorAll('#progress, #bz-lyrics-progress').forEach(el => el.style.width = `${pct}%`);
            document.querySelectorAll('#current-time, #bz-lyrics-current-time').forEach(el => el.textContent = formatTime(cur));
            // FIX: isFinite, not !isNaN
            if (isFinite(dur) && dur > 0) document.querySelectorAll('#duration, #bz-lyrics-duration').forEach(el => el.textContent = formatTime(dur));
            saveLastPosition();
            // REPEAT REWIND real-audio-second accumulator
            if (!audioPlayer.paused && isFinite(cur) && cur > 0) {
                const _rrTrackedId = window._bzRRSongId;
                const _curSongId = window.playingAlbum?.songs?.[window.currentSongIndex]?.id;
                if (_rrTrackedId && String(_curSongId) === _rrTrackedId && !window._bzRRCountedThisSong) {
                    // Record immediately on first active tick
                    window._bzRRCountedThisSong = _rrTrackedId;
                    try {
                        let rrList = [];
                        try { rrList = JSON.parse(localStorage.getItem(BZ_RR_PLAYS_KEY) || '[]'); } catch (_e) { }
                        rrList.unshift({ id: _rrTrackedId, ts: Date.now() });
                        rrList = rrList.slice(0, BZ_RR_PLAYS_MAX);
                        localStorage.setItem(BZ_RR_PLAYS_KEY, JSON.stringify(rrList));
                    } catch (_e) { /* never break playback */ }
                    const _rrSongObj = window.playingAlbum?.songs?.[window.currentSongIndex];
                    if (_rrSongObj) checkRepeatRewind(_rrSongObj);
                }
            }
            // setPositionState must only be called on play/pause/seek events
            /* FIX: Gapless – start prefetching next track when ≤15 s remain */
            if (window.repeatMode !== 2 && dur > 0 && (dur - cur) <= 15 &&
                _gpIdx !== (window.currentSongIndex + 1) &&
                !audioPlayer.paused) {
                bzPreloadNext();
            }
        }
        audioPlayer.ontimeupdate = syncProgressBar;
        audioPlayer.addEventListener('loadedmetadata', syncProgressBar);
        // FIX: belt-and-suspenders
        audioPlayer.addEventListener('canplay', syncProgressBar);
        audioPlayer.addEventListener('durationchange', syncProgressBar);

        // FIX (position-not-restoring bug)
        audioPlayer.addEventListener('pause', saveLastPosition);
        document.addEventListener('visibilitychange', () => { if (document.hidden) saveLastPosition(); });
        window.addEventListener('pagehide', saveLastPosition);
        window.addEventListener('beforeunload', saveLastPosition);

        // Wires up drag-to-seek on a progress bar
        function attachScrubHandlers(barEl, fillEl, timeEl) {
            if (!barEl) return;
            let scrubbing = false;
            const handleScrub = (e) => {
                const dur = audioPlayer.duration;
                // FIX: also bail on Infinity (unresolved streamed duration)
                if (!dur || !isFinite(dur)) return;
                const rect = barEl.getBoundingClientRect();
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const pct = Math.max(0, Math.min(clientX - rect.left, rect.width)) / rect.width;
                const newTime = pct * dur;
                // Keep both progress bars + time labels in sync while dragging either
                document.querySelectorAll('#progress, #bz-lyrics-progress').forEach(el => el.style.width = `${pct * 100}%`);
                document.querySelectorAll('#current-time, #bz-lyrics-current-time').forEach(el => el.textContent = formatTime(newTime));
                audioPlayer.currentTime = newTime;
                // seeked event fires after scrub — updateMediaPositionState called there
            };
            barEl.onmousedown = (e) => { scrubbing = true; window._bzScrubbing = true; handleScrub(e); };
            window.addEventListener('mousemove', (e) => { if (scrubbing) handleScrub(e); });
            window.addEventListener('mouseup', () => { scrubbing = false; window._bzScrubbing = false; });
            barEl.ontouchstart = (e) => { scrubbing = true; window._bzScrubbing = true; handleScrub(e); };
            barEl.ontouchmove = (e) => { if (scrubbing) { if (e.cancelable) e.preventDefault(); handleScrub(e); } };
            barEl.ontouchend = () => { scrubbing = false; window._bzScrubbing = false; };
            // Handle OS-level touch cancellations
            barEl.ontouchcancel = () => { scrubbing = false; window._bzScrubbing = false; };
            // Safety net: switching apps mid-scrub should also reset the flag
            document.addEventListener('visibilitychange', () => { if (document.hidden) { scrubbing = false; window._bzScrubbing = false; } });
        }
        // Main player progress bar
        attachScrubHandlers(progressBar, progress, currentTimeSpan);
        // Lyrics side-panel progress bar (BUG FIX: now interactive, see above)
        attachScrubHandlers(document.getElementById('bz-lyrics-progress-bar'), document.getElementById('bz-lyrics-progress'), document.getElementById('bz-lyrics-current-time'));

        /* NAVIGATION */
        function hideAllViews() {
            [yearSectionsContainer, searchResultsContainer, playlistsContainer, artistsContainer, albumViewContainer, exploreContainer, settingsContainer, updatesContainer, profileContainer, premiumContainer, document.getElementById('bz-admin-dashboard-container')]
                .forEach(v => { if (v && v.style.display !== 'none') v.style.display = 'none'; });
            if (searchContainer && !searchContainer.classList.contains('hidden')) searchContainer.classList.add('hidden');
        }

        function updateNav(id) {
            document.querySelectorAll('.nav-link-content').forEach(l => l.classList.remove('active'));
            document.getElementById(`${id}-link`)?.querySelector('.nav-link-content')?.classList.add('active');
        }

        function renderCard(title, img, onClick, albumId) {
            const div = document.createElement('div');
            div.className = 'album-card';
            div.setAttribute('data-album-id', String(albumId));
            let src = img || '';
            if (src.includes('cloudinary')) src = src.replace('/upload/', '/upload/f_auto,q_auto,w_400/');
            div.innerHTML = `
                <div class="album-card-img-wrap">
                    <img src="${src}" alt="${title}" loading="lazy" style="background:#2c3e50;min-height:150px;object-fit:cover;">
                    <div class="album-card-music-bars" aria-hidden="true">
                        <span></span><span></span><span></span><span></span>
                    </div>
                </div>
                <div class="album-info"><h2>${title}</h2></div>`;

            /* Card click — open album view */
            div.addEventListener('click', (e) => {
                e.preventDefault();
                onClick();
            });

            return div;
        }

        /* Sync all home cards to show correct now-playing/playing state via */
        function syncAllCardPlayBtns() {
            const audio = document.getElementById('audio-player');
            const playingId = window.playingAlbum ? String(window.playingAlbum.id) : '';
            const isPaused = !audio || audio.paused;

            document.querySelectorAll('.album-card').forEach(card => {
                const cardAlbumId = String(card.getAttribute('data-album-id') || '');
                const isMatch = playingId && cardAlbumId && cardAlbumId === playingId;
                if (isMatch && !isPaused) {
                    card.classList.add('album-card--now-playing');
                    card.classList.add('album-card--playing');
                } else if (isMatch && isPaused) {
                    card.classList.add('album-card--now-playing');
                    card.classList.remove('album-card--playing');
                } else {
                    card.classList.remove('album-card--now-playing');
                    card.classList.remove('album-card--playing');
                }
            });
        }
        /* Expose so audio events can call it */
        window.syncAllCardPlayBtns = function () {
            syncAllCardPlayBtns();
            if (typeof window.bzSyncPlaylistsPlayBtns === 'function') window.bzSyncPlaylistsPlayBtns();
        };

        function navigateToView(id, container, isBack = false) {
            // FIX: Save scroll unconditionally
            if (window.lastActiveView && window.lastActiveView !== id) {
                // FIX Bug 5: prefer the continuously-updated scrollPositions map
                const pos = (typeof window.scrollPositions[window.lastActiveView] === 'number')
                    ? window.scrollPositions[window.lastActiveView]
                    : window.scrollY;
                window.scrollPositions[window.lastActiveView] = pos;
                localStorage.setItem('beatZen_scroll_' + window.lastActiveView, pos);
            }
            hideAllViews();
            updateNav(id);
            window.lastActiveView = id;
            localStorage.setItem('beatZen_activeView', id);
            // FIX Bug 7: include scrollY for the target view in the pushState
            if (!isBack && window.location.hash !== `#${id}`) {
                window._bzSpaNavDepth++; // FIX Bug 3: track SPA-internal navigation depth
                const _targetScroll = parseInt(window.scrollPositions[id] || localStorage.getItem('beatZen_scroll_' + id) || 0);
                history.pushState({ view: id, scrollY: _targetScroll }, '', `#${id}`);
            }
            const saved = localStorage.getItem('beatZen_scroll_' + id);
            const targetPos = parseInt(window.scrollPositions[id] || saved || 0);
            // Show container immediately — no visibility:hidden flash
            if (container) container.style.display = 'block';
            // FIX: Double-rAF ensures the browser has fully laid out and painted
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    window.scrollTo({ top: targetPos, behavior: 'instant' });
                });
            });
            updateDynamicTitle();
        }

        /* VIEW ENGINES */
        /* Build a row of N skeleton cards (matches .album-card 140px shape) */
        function _bzHomeSkeletonRow(count) {
            const row = document.createElement('div');
            row.className = 'albums-grid bz-sk-grid';
            for (let i = 0; i < count; i++) {
                row.innerHTML += `<div class="bz-sk-card">
                    <div class="bz-skel bz-sk-card__img"></div>
                    <div class="bz-skel bz-sk-card__title"></div>
                    <div class="bz-skel bz-sk-card__sub"></div>
                </div>`;
            }
            return row;
        }

        /* ── Build skeleton year-sections for the home grid ── */
        function _bzInjectHomeSkeletons() {
            yearSectionsContainer.innerHTML = '';
            delete yearSectionsContainer.dataset.bzScrollReady;
            const years = allYears.length ? allYears : [0, 1, 2];   // fallback if data not ready
            years.forEach((year, idx) => {
                const sec = document.createElement('div');
                sec.className = 'year-section bz-sk-year-section';
                sec.id = `year-sec-skel-${idx}`;
                /* Heading skeleton */
                const heading = document.createElement('div');
                heading.className = 'bz-skel bz-sk-year-heading';
                sec.appendChild(heading);
                /* Card row skeleton — show ~5 cards */
                sec.appendChild(_bzHomeSkeletonRow(5));
                yearSectionsContainer.appendChild(sec);
            });
        }

        function displayHome(isBack = false, targetYear = null) {
            // Always rebuild if empty; also rebuild after a data refresh
            if (!yearSectionsContainer.innerHTML.trim() || yearSectionsContainer.dataset.builtFor !== window._bzDataVersion) {
                /* Show skeletons immediately so there is no blank flash */
                _bzInjectHomeSkeletons();
                navigateToView('home', yearSectionsContainer, isBack);

                /* Yield to browser paint, then swap in real cards */
                requestAnimationFrame(() => {
                    yearSectionsContainer.innerHTML = '';
                    const frag = document.createDocumentFragment();
                    allYears.forEach(year => {
                        const sec = document.createElement('div');
                        sec.className = 'year-section bz-sk-replaced'; sec.id = `year-sec-${year}`;
                        sec.innerHTML = `<h2>${year}</h2><div class="albums-grid"></div>`;
                        const grid = sec.querySelector('.albums-grid');
                        (customYearAlbumsData[year] || []).forEach(a => grid.appendChild(renderCard(a.title, a.imageUrl, () => selectAlbum(resolveData(a, "Movie")), a.id)));
                        frag.appendChild(sec);
                    });
                    yearSectionsContainer.appendChild(frag);
                    yearSectionsContainer.dataset.builtFor = window._bzDataVersion;
                    if (targetYear) {
                        const el = document.getElementById(`year-sec-${targetYear}`);
                        if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
                        yearSectionsContainer.dataset.bzScrollReady = '1';
                    } else {
                        // FIX: on a cold reload, navigateToView() above ran its scroll restore
                        const _savedHomeScroll = parseInt(
                            window.scrollPositions['home'] ?? localStorage.getItem('beatZen_scroll_home') ?? 0,
                            10
                        ) || 0;
                        if (_savedHomeScroll > 0) {
                            requestAnimationFrame(() => {
                                window.scrollTo({ top: _savedHomeScroll, behavior: 'instant' });
                                yearSectionsContainer.dataset.bzScrollReady = '1';
                            });
                        } else {
                            yearSectionsContainer.dataset.bzScrollReady = '1';
                        }
                    }
                });
                return; // navigateToView already called above
            }
            navigateToView('home', yearSectionsContainer, isBack);
            yearSectionsContainer.dataset.bzScrollReady = '1';
            /* Re-sync card play states and active highlight after back navigation */
            if (isBack) {
                requestAnimationFrame(() => {
                    syncAllCardPlayBtns();
                    if (window._highlightActive && typeof updateActiveSongHighlight === 'function') {
                        updateActiveSongHighlight();
                    }
                });
            }
            if (targetYear) {
                // FIX Issue 8: navigateToView uses a double-rAF to restore saved scroll.
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            const el = document.getElementById(`year-sec-${targetYear}`);
                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        });
                    });
                });
            }
        }

        // DAILY PLAYLISTS
        const BEAT_ZEN_LOGO = 'https://res.cloudinary.com/beatzenapp/image/upload/v1782654641/Logo_kmpfjf.jpg';

        /* ── Seeded RNG (better LCG) ── */
        function dailySeedRandom(seed) {
            let s = ((seed ^ 0xdeadbeef) >>> 0) || 1;
            return function () {
                s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
                s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
                s = (s ^ (s >>> 16)) >>> 0;
                return s / 4294967296;
            };
        }

        /* Stable numeric hash of a string (djb2) */
        function strHash(str) {
            let h = 5381;
            for (let i = 0; i < str.length; i++) h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0;
            return h;
        }

        /* Date seed: unique integer per calendar day */
        function getTodaySeed() {
            const d = new Date();
            return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
        }

        /* Parse "mm:ss" or "h:mm:ss" → total seconds */
        function parseDurSec(dur) {
            if (!dur) return 0;
            const p = String(dur).split(':').map(Number);
            if (p.length === 3) return p[0] * 3600 + p[1] * 60 + (p[2] || 0);
            if (p.length === 2) return p[0] * 60 + (p[1] || 0);
            return 0;
        }

        /* Seeded Fisher-Yates shuffle */
        function seededShuffle(arr, rng) {
            const a = arr.slice();
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        }

        // MOOD CONSTANTS
        const MOOD = { PEPPY: 0, UPBEAT: 1, ROMANTIC: 2, MELODIC: 3, DEEP: 4, RETRO: 5, TRENDING: 6, EMOTIONAL: 7 };

        function classifySong(song, album) {
            const dur = parseDurSec(song.duration);
            const year = parseInt(album.year) || 2015;
            const nowY = new Date().getFullYear();
            const hash = strHash(String(song.id)) % 8;
            const moods = new Set();

            if (dur > 0 && dur < 180) moods.add(MOOD.PEPPY);
            if (dur >= 180 && dur < 240) moods.add(MOOD.UPBEAT);
            if (dur >= 240 && dur < 300) { moods.add(MOOD.MELODIC); moods.add(MOOD.ROMANTIC); }
            if (dur >= 300) moods.add(MOOD.DEEP);
            if (dur >= 270 && hash % 2 === 0) moods.add(MOOD.EMOTIONAL);
            if (year >= nowY - 3) moods.add(MOOD.TRENDING);
            if (year < 2012) moods.add(MOOD.RETRO);
            /* Hash-partition fallback so every song lands somewhere */
            moods.add(hash % 8);

            return moods;
        }

        // SLOT + PLAYLIST DEFINITIONS
        const SLOT_DEFS = [
            {
                id: 'daily-morning', label: 'Morning Vibes', hour: 6,
                playlists: [
                    { name: 'Chirpy Mornings', primary: [MOOD.PEPPY], fallback: [MOOD.UPBEAT, MOOD.TRENDING] },
                    { name: 'Morning Masala', primary: [MOOD.UPBEAT, MOOD.PEPPY], fallback: [MOOD.TRENDING] },
                    { name: 'Wake Up Hits', primary: [MOOD.TRENDING], fallback: [MOOD.UPBEAT, MOOD.PEPPY] },
                    { name: 'Sunrise Melodies', primary: [MOOD.MELODIC], fallback: [MOOD.ROMANTIC, MOOD.DEEP] },
                    { name: 'Feel Good Start', primary: [MOOD.ROMANTIC], fallback: [MOOD.MELODIC, MOOD.UPBEAT] },
                    { name: 'Morning Rush', primary: [MOOD.PEPPY, MOOD.UPBEAT], fallback: [MOOD.TRENDING] },
                    { name: 'Acoustic Awakening', primary: [MOOD.MELODIC, MOOD.DEEP], fallback: [MOOD.EMOTIONAL, MOOD.ROMANTIC] },
                    { name: 'Freshly Brewed', primary: [MOOD.TRENDING, MOOD.PEPPY], fallback: [MOOD.UPBEAT] },
                ]
            },
            {
                id: 'daily-afternoon', label: 'Afternoon Energy', hour: 12,
                playlists: [
                    { name: 'Afternoon Drive', primary: [MOOD.UPBEAT], fallback: [MOOD.PEPPY, MOOD.TRENDING] },
                    { name: 'High Noon Beats', primary: [MOOD.PEPPY, MOOD.UPBEAT], fallback: [MOOD.TRENDING] },
                    { name: 'Post Lunch Vibes', primary: [MOOD.MELODIC], fallback: [MOOD.ROMANTIC, MOOD.DEEP] },
                    { name: 'Power Hour', primary: [MOOD.PEPPY], fallback: [MOOD.UPBEAT, MOOD.TRENDING] },
                    { name: 'Midday Romance', primary: [MOOD.ROMANTIC], fallback: [MOOD.MELODIC, MOOD.EMOTIONAL] },
                    { name: 'Work Mode On', primary: [MOOD.MELODIC, MOOD.DEEP], fallback: [MOOD.EMOTIONAL] },
                    { name: 'Street Bangers', primary: [MOOD.PEPPY, MOOD.UPBEAT], fallback: [MOOD.TRENDING] },
                    { name: 'Afternoon Gold', primary: [MOOD.RETRO], fallback: [MOOD.MELODIC, MOOD.ROMANTIC] },
                ]
            },
            {
                id: 'daily-evening', label: 'Evening Mood', hour: 18,
                playlists: [
                    { name: 'Sunset Sessions', primary: [MOOD.MELODIC, MOOD.ROMANTIC], fallback: [MOOD.DEEP, MOOD.EMOTIONAL] },
                    { name: 'Party Starter', primary: [MOOD.PEPPY, MOOD.UPBEAT], fallback: [MOOD.TRENDING] },
                    { name: 'Evening Romance', primary: [MOOD.ROMANTIC], fallback: [MOOD.MELODIC, MOOD.EMOTIONAL] },
                    { name: 'Chill Zone', primary: [MOOD.DEEP, MOOD.MELODIC], fallback: [MOOD.EMOTIONAL, MOOD.ROMANTIC] },
                    { name: 'Retro Rewind', primary: [MOOD.RETRO], fallback: [MOOD.MELODIC, MOOD.DEEP] },
                    { name: 'Drama Kings', primary: [MOOD.EMOTIONAL], fallback: [MOOD.DEEP, MOOD.ROMANTIC] },
                    { name: 'Bass Drop', primary: [MOOD.PEPPY, MOOD.UPBEAT], fallback: [MOOD.TRENDING] },
                    { name: 'Evening Unplugged', primary: [MOOD.DEEP, MOOD.EMOTIONAL], fallback: [MOOD.MELODIC, MOOD.ROMANTIC] },
                ]
            },
            {
                id: 'daily-midnight', label: 'Midnight Feels', hour: 0,
                playlists: [
                    { name: 'Midnight Melancholy', primary: [MOOD.EMOTIONAL, MOOD.DEEP], fallback: [MOOD.ROMANTIC, MOOD.MELODIC] },
                    { name: 'Late Night Drive', primary: [MOOD.DEEP, MOOD.UPBEAT], fallback: [MOOD.EMOTIONAL, MOOD.MELODIC] },
                    { name: 'Slow Burns', primary: [MOOD.DEEP], fallback: [MOOD.EMOTIONAL, MOOD.MELODIC] },
                    { name: 'Stars & Stories', primary: [MOOD.MELODIC, MOOD.ROMANTIC], fallback: [MOOD.DEEP, MOOD.EMOTIONAL] },
                    { name: 'Insomniac Beats', primary: [MOOD.UPBEAT, MOOD.PEPPY], fallback: [MOOD.TRENDING] },
                    { name: 'Heartbreak Hotel', primary: [MOOD.EMOTIONAL], fallback: [MOOD.DEEP, MOOD.ROMANTIC] },
                    { name: 'Midnight Romance', primary: [MOOD.ROMANTIC, MOOD.DEEP], fallback: [MOOD.EMOTIONAL, MOOD.MELODIC] },
                    { name: 'The Night Owl', primary: [MOOD.DEEP, MOOD.MELODIC], fallback: [MOOD.EMOTIONAL, MOOD.RETRO] },
                ]
            }
        ];

        /* ── MAIN OVERRIDE ─────────────────────────────────────────── */
        window.buildDailyPlaylists = function () {
            const todaySeed = getTodaySeed();

            /* ── Constants — declared FIRST so all code below can use them ── */
            const MIN_SONGS = 80, MAX_SONGS = 150;
            const RANGE = MAX_SONGS - MIN_SONGS + 1;   // 71 possible values
            const TOTAL_PL = SLOT_DEFS.reduce((s, sd) => s + sd.playlists.length, 0); // 32

            /* ── Collect every song from non-user sources ── */
            const allSongEntries = [];
            (window.masterPool || []).forEach(album => {
                if (!album || !Array.isArray(album.songs) || album.type === 'Playlist') return;
                album.songs.forEach(song => {
                    if (song && song.id) allSongEntries.push({ song, album });
                });
            });

            /* ── Pre-classify every song once into mood buckets ── */
            const moodBuckets = new Map();
            for (let m = 0; m < 8; m++) moodBuckets.set(m, []);
            allSongEntries.forEach(({ song, album }) => {
                classifySong(song, album).forEach(m => moodBuckets.get(m)?.push(String(song.id)));
            });

            /* Total unique song IDs available */
            const totalSongs = allSongEntries.length;

            // 32 unique song-count targets: MIN_SONGS
            const countRng = dailySeedRandom(todaySeed * 999 + 7);
            const usedCounts = new Set();
            const uniqueCounts = [];
            let safety = 0;
            while (uniqueCounts.length < TOTAL_PL && safety++ < 10000) {
                const c = MIN_SONGS + Math.floor(countRng() * RANGE);
                if (!usedCounts.has(c)) { usedCounts.add(c); uniqueCounts.push(c); }
            }
            /* Sequential fallback — fills any remaining if RNG exhausts range */
            for (let v = MIN_SONGS; uniqueCounts.length < TOTAL_PL && v <= MAX_SONGS; v++) {
                if (!usedCounts.has(v)) { usedCounts.add(v); uniqueCounts.push(v); }
            }

            let _plCountIdx = 0;

            return SLOT_DEFS.map((slotDef, slotIdx) => {
                const slotRng = dailySeedRandom(todaySeed * 7 + slotIdx * 31);

                const playlists = slotDef.playlists.map((def, defIdx) => {
                    const _plTarget = uniqueCounts[_plCountIdx++];
                    const plRng = dailySeedRandom(todaySeed * 13 + slotIdx * 97 + defIdx * 17);

                    /* Primary pool */
                    const primarySet = new Set();
                    def.primary.forEach(m => {
                        seededShuffle(moodBuckets.get(m) || [],
                            dailySeedRandom(todaySeed + m * 1000 + defIdx * 7)
                        ).forEach(id => primarySet.add(id));
                    });

                    /* Fallback pool — only songs not in primary */
                    const fallbackSet = new Set();
                    def.fallback.forEach(m => {
                        seededShuffle(moodBuckets.get(m) || [],
                            dailySeedRandom(todaySeed + m * 500 + defIdx * 11)
                        ).forEach(id => { if (!primarySet.has(id)) fallbackSet.add(id); });
                    });

                    /* If still short of target, pull remaining songs not yet used */
                    const merged = seededShuffle([...primarySet, ...fallbackSet], plRng);
                    let songIds = [...new Set(merged)];

                    /* Top-up: if we have fewer songs than target, add any remaining songs */
                    if (songIds.length < _plTarget) {
                        const usedSet = new Set(songIds);
                        const topUp = seededShuffle(
                            allSongEntries.map(e => String(e.song.id)).filter(id => !usedSet.has(id)),
                            dailySeedRandom(todaySeed * 77 + slotIdx * 13 + defIdx)
                        );
                        songIds = songIds.concat(topUp).slice(0, _plTarget);
                    } else {
                        songIds = songIds.slice(0, _plTarget);
                    }

                    return {
                        id: `${slotDef.id}-${def.name.toLowerCase().replace(/\s+/g, '-')}`,
                        name: def.name,
                        type: 'Explore',
                        songs: songIds,
                        albumCover: '',
                        imageUrl: ''
                    };
                    // Soft minimum: keep playlist if it has at least 5 songs
                }).filter(pl => pl.songs.length >= 5);

                return {
                    slot: { id: slotDef.id, label: slotDef.label, hour: slotDef.hour },
                    playlists: seededShuffle(playlists, slotRng)
                };
            });
        };

        /* Initialise on load — override whatever explore.js set */
        window.dailyPlaylistGroups = window.buildDailyPlaylists();

        function getNextSlotTime(slotHour) {
            const now = new Date();
            const next = new Date(now);
            next.setHours(slotHour, 0, 0, 0);
            if (next <= now) next.setDate(next.getDate() + 1);
            return next;
        }

        function getActiveSlotIndex() {
            const h = new Date().getHours();
            if (h >= 0 && h < 6) return 3;
            if (h >= 6 && h < 12) return 0;
            if (h >= 12 && h < 18) return 1;
            return 2;
        }

        function formatCountdown(ms) {
            if (ms <= 0) return '00:00:00';
            const totalSec = Math.floor(ms / 1000);
            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);
            const s = totalSec % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }

        /* Build a 2×2 collage from up to 4 album cover URLs */
        function buildCollageHTML(coverUrls) {
            const filled = [...coverUrls];
            while (filled.length < 4) filled.push(filled[filled.length - 1] || '');
            const imgs = filled.slice(0, 4).map(u => {
                let src = u || '';
                if (src.includes('cloudinary')) src = src.replace('/upload/', '/upload/f_auto,q_auto,w_300/');
                return `<img src="${src}" alt="" loading="lazy" style="width:50%;height:50%;object-fit:cover;display:block;flex-shrink:0;">`;
            }).join('');
            return `<div style="display:flex;flex-wrap:wrap;width:100%;height:100%;">${imgs}</div>`;
        }

        // Get up to 4 distinct album cover URLs from a playlist's songs. Handles
        function getPlaylistCovers(playlist) {
            const seen = new Set();
            const covers = [];
            if (!window.allSongsMap) return covers;
            for (const entry of (playlist.songs || [])) {
                let url = '';
                if (typeof entry === 'string') {
                    /* Daily-playlist style: entry is a song ID string */
                    url = window.allSongsMap.get(entry)?.album?.imageUrl || '';
                } else if (entry && typeof entry === 'object') {
                    /* User-playlist style: entry is a full song object */
                    const sid = String(entry.id || '');
                    const canonical = window.allSongsMap.get(sid);
                    url = canonical?.album?.imageUrl
                        || entry._sourceAlbum?.imageUrl
                        || entry.album?.imageUrl
                        || '';
                }
                if (url && url.trim() && !seen.has(url)) {
                    seen.add(url);
                    covers.push(url);
                    if (covers.length === 4) break;
                }
            }
            return covers;
        }

        // Render a user playlist as a bzp-card
        function renderPlaylistCard(p) {
            const card = document.createElement('div');
            card.className = 'bzp-card';
            card.id = p.isImported ? 'card-' + p.id : '';
            card.setAttribute('data-dp-id', String(p.id || p.name));

            const songCount = (p.songs || []).length;

            /* ── Cover area ── */
            const coverWrap = document.createElement('div');
            coverWrap.className = 'bzp-card-cover';

            if (p._isFavourites) {
                /* Favourites: gradient cover with heart icon — no white-bg emoji image */
                const g = document.createElement('div');
                g.className = 'bzp-card-gradient';
                g.style.cssText = [
                    'background:linear-gradient(135deg,#f43f5e 0%,#be123c 100%)',
                    'width:100%',
                    'height:100%',
                    'display:flex',
                    'align-items:center',
                    'justify-content:center'
                ].join(';');
                g.innerHTML = '<i class="fas fa-heart" style="font-size:3.3rem;color:rgba(255,255,255,0.92);filter:drop-shadow(0 2px 8px rgba(0,0,0,0.35));"></i>';
                coverWrap.appendChild(g);
            } else {
                const covers = getPlaylistCovers(p);
                if (covers.length >= 4) {
                    /* 2×2 collage for playlists with 4+ distinct album covers */
                    const collageDiv = document.createElement('div');
                    collageDiv.style.cssText = 'display:flex;flex-wrap:wrap;width:100%;height:100%;';
                    covers.slice(0, 4).forEach(u => {
                        const ci = document.createElement('img');
                        ci.src = u; ci.alt = '';
                        ci.style.cssText = 'width:50%;height:50%;object-fit:cover;display:block;flex-shrink:0;';
                        ci.loading = 'lazy';
                        collageDiv.appendChild(ci);
                    });
                    coverWrap.appendChild(collageDiv);
                } else if (covers.length > 0) {
                    const img = document.createElement('img');
                    img.src = covers[0]; img.alt = p.name || '';
                    img.loading = 'lazy';
                    img.onerror = () => {
                        img.remove();
                        const g = document.createElement('div');
                        g.className = 'bzp-card-gradient';
                        g.innerHTML = '<i class="fas fa-compact-disc"></i>';
                        coverWrap.insertBefore(g, coverWrap.firstChild);
                    };
                    coverWrap.appendChild(img);
                } else {
                    const g = document.createElement('div');
                    g.className = 'bzp-card-gradient';
                    g.innerHTML = '<i class="fas fa-compact-disc"></i>';
                    coverWrap.appendChild(g);
                }
            }

            /* Play button overlay removed */

            /* ── Info area ── */
            const info = document.createElement('div');
            info.className = 'bzp-card-info';
            info.innerHTML = `
                <div class="bzp-card-name">${p.name || p.title || 'Playlist'}</div>
                <div class="bzp-card-meta">${songCount} song${songCount !== 1 ? 's' : ''}</div>`;

            card.appendChild(coverWrap);
            card.appendChild(info);
            card.addEventListener('click', () => {
                const data = resolveData(p, 'Playlist');
                if (data) selectAlbum(data, false, 'playlists');
            });
            return card;
        }

        function displayPlaylists(isBack = false) {
            /* ── Inject skeletons immediately so the view is never blank ── */
            playlistsContainer.innerHTML = '';
            const _skelFrag = document.createDocumentFragment();

            /* Skeleton: "Your Playlists" section — header + horizontal card row */
            const _skelSec1 = document.createElement('div');
            _skelSec1.className = 'bzp-section dp-section';
            _skelSec1.innerHTML = `
                <div class="bz-sk-section-head">
                    <div class="bz-skel bz-sk-section-head__icon"></div>
                    <div class="bz-sk-section-head__lines">
                        <div class="bz-skel bz-sk-section-head__title"></div>
                        <div class="bz-skel bz-sk-section-head__sub"></div>
                    </div>
                </div>
                <div class="albums-grid bzp-row dp-grid bz-sk-grid" style="overflow-x:auto;">
                    ${Array.from({ length: 5 }, (_, i) => `
                    <div class="bz-sk-card">
                        <div class="bz-skel bz-sk-card__img"></div>
                        <div class="bz-skel bz-sk-card__title"></div>
                        <div class="bz-skel bz-sk-card__sub"></div>
                    </div>`).join('')}
                </div>`;
            _skelFrag.appendChild(_skelSec1);

            /* Skeleton: smart playlists section below */
            const _skelSec2 = document.createElement('div');
            _skelSec2.className = 'bzp-section';
            _skelSec2.style.marginTop = '24px';
            _skelSec2.innerHTML = `
                <div class="bz-sk-section-head">
                    <div class="bz-skel bz-sk-section-head__icon"></div>
                    <div class="bz-sk-section-head__lines">
                        <div class="bz-skel bz-sk-section-head__title"></div>
                        <div class="bz-skel bz-sk-section-head__sub"></div>
                    </div>
                </div>
                <div class="albums-grid bzp-row bz-sk-grid" style="overflow-x:auto;">
                    ${Array.from({ length: 5 }, (_, i) => `
                    <div class="bz-sk-card">
                        <div class="bz-skel bz-sk-card__img"></div>
                        <div class="bz-skel bz-sk-card__title"></div>
                        <div class="bz-skel bz-sk-card__sub"></div>
                    </div>`).join('')}
                </div>`;
            _skelFrag.appendChild(_skelSec2);

            playlistsContainer.appendChild(_skelFrag);
            navigateToView('playlists', playlistsContainer, isBack);

            /* Yield to browser paint, then swap in real content */
            requestAnimationFrame(() => {
                playlistsContainer.innerHTML = '';

                /* Section heading: "Your Playlists" */
                const sec = document.createElement('div');
                sec.className = 'bzp-section dp-section bz-sk-replaced';
                sec.id = 'bzp-your-playlists';
                const header = document.createElement('div');
                header.className = 'bzp-section-head';
                header.innerHTML = `
                <div class="bzp-section-title-row">
                    <span class="bzp-section-icon dp-icon-playlist"><i class="fas fa-compact-disc"></i></span>
                    <div>
                        <div class="bzp-section-title">Your Playlists</div>
                        <div class="bzp-section-sub">Your saved &amp; created playlists</div>
                    </div>
                </div>`;
                sec.appendChild(header);

                /* ── Horizontal scroll grid of bzp-cards ── */
                const grid = document.createElement('div');
                grid.className = 'albums-grid bzp-row dp-grid';

                window.masterPool.forEach(p => {
                    if (p.type === 'Playlist') {
                        grid.appendChild(renderPlaylistCard(p));
                    }
                });

                sec.appendChild(grid);
                playlistsContainer.appendChild(sec);



                /* ── Smart Playlists (formerly Explore) — rendered by playlists.js ── */
                if (typeof window._bzPlaylistsRender === 'function') {
                    const smartWrap = document.createElement('div');
                    smartWrap.id = 'bz-smart-playlists-wrap';
                    smartWrap.className = 'bz-sk-replaced';
                    playlistsContainer.appendChild(smartWrap);
                    window._bzPlaylistsRender(smartWrap);
                }

                // FIX: same race as displayHome
                {
                    const _savedPlaylistsScroll = parseInt(
                        window.scrollPositions['playlists'] ?? localStorage.getItem('beatZen_scroll_playlists') ?? 0,
                        10
                    ) || 0;
                    if (_savedPlaylistsScroll > 0) {
                        requestAnimationFrame(() => {
                            window.scrollTo({ top: _savedPlaylistsScroll, behavior: 'instant' });
                        });
                    }
                }

            }); // end rAF
        }

        // Renders a Recap year card using the dp-card collage style.
        function renderRecapCard(item) {
            const card = document.createElement('div');
            card.className = 'dp-card dp-card-recap';
            card.setAttribute('data-dp-id', item.id || item.name);

            const coverSrc = item.albumCover || '';
            card.innerHTML = `
            <div class="dp-card-inner">
                <div class="dp-card-collage dp-card-year-cover">
                    <img src="${coverSrc}" alt="${item.name}" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:0;">
                </div>
                <img class="dp-card-logo" src="${BEAT_ZEN_LOGO}" alt="Beat Zen">
                <div class="dp-card-body dp-recap-body">
                    <div class="dp-card-name">${item.name || ''}</div>
                    <div class="dp-card-count">${(item.songs || []).length} songs</div>
                </div>
            </div>`;
            card.addEventListener('click', () => {
                const data = resolveData(item, 'Explore');
                if (data) selectAlbum(data, false, 'playlists');
            });
            return card;
        }

        function renderDailyPlaylistCard(playlist) {
            const card = document.createElement('div');
            card.className = 'dp-card';
            card.setAttribute('data-dp-id', playlist.id);

            const covers = getPlaylistCovers(playlist);
            const collage = buildCollageHTML(covers);

            card.innerHTML = `
            <div class="dp-card-inner">
                <div class="dp-card-collage">${collage}</div>
                <img class="dp-card-logo" src="${BEAT_ZEN_LOGO}" alt="Beat Zen">
                <div class="dp-card-body">
                    <div class="dp-card-name">${_bzEscapeHTML(playlist.name)}</div>
                    <div class="dp-card-count">${playlist.songs.length} songs</div>
                </div>
            </div>`;

            card.addEventListener('click', () => {
                const data = resolveData(playlist, 'Explore');
                if (data) selectAlbum(data, false, 'playlists');
            });
            return card;
        }

        const _dpIntervals = {};

        function appendDailySlotSection(container, group, isActive, slotIdx) {
            const { slot, playlists } = group;
            const nextSlotIdx = (slotIdx + 1) % 4;
            const nextSlotHour = dailyPlaylistSlots[nextSlotIdx].hour;
            const nextSlotLabel = dailyPlaylistSlots[nextSlotIdx].label;
            const nextTime = getNextSlotTime(nextSlotHour);
            const timerId = `dp-timer-${slot.id}`;

            /* Icon map — circle badge spans matching explore heading style */
            const slotIcons = {
                'daily-morning': '<span class="dp-icon-badge dp-icon-morning"><i class="fas fa-sun"></i></span>',
                'daily-afternoon': '<span class="dp-icon-badge dp-icon-afternoon"><i class="fas fa-cloud-sun"></i></span>',
                'daily-evening': '<span class="dp-icon-badge dp-icon-evening"><i class="fas fa-cloud-moon"></i></span>',
                'daily-midnight': '<span class="dp-icon-badge dp-icon-midnight"><i class="fas fa-moon"></i></span>'
            };
            const nextSlotId = dailyPlaylistSlots[nextSlotIdx].id;
            const currentIcon = slotIcons[slot.id] || '<span class="dp-icon-badge dp-icon-default"><i class="fas fa-music"></i></span>';
            const nextIcon = slotIcons[nextSlotId] || '<span class="dp-icon-badge dp-icon-default"><i class="fas fa-music"></i></span>';

            /* Next slot time label e.g. "18:00" */
            const nextHourPadded = String(nextSlotHour).padStart(2, '0');
            const nextTimeLabel = `${nextHourPadded}:00`;

            const sec = document.createElement('div');
            sec.className = 'year-section dp-section';
            sec.id = `bz-dp-section-${slot.id}`;

            if (isActive) {
                /* ── ACTIVE SLOT: heading + inline countdown + active dot ── */
                const header = document.createElement('div');
                header.className = 'dp-header';
                header.innerHTML = `
                <h2>${currentIcon}${slot.label} <span class="dp-active-dot"></span></h2>
                <div class="dp-countdown-wrap">
                    <span class="dp-countdown-label">Next in</span>
                    <span class="dp-countdown-timer" id="${timerId}">--:--:--</span>
                </div>`;
                sec.appendChild(header);

            } else {
                /* ── INACTIVE SLOT: compact heading + small countdown pill ── */
                const header = document.createElement('div');
                header.className = 'dp-header';
                header.innerHTML = `
                <h2>${currentIcon}${slot.label}</h2>
                <div class="dp-countdown-wrap">
                    <span class="dp-countdown-label">Next in</span>
                    <span class="dp-countdown-timer" id="${timerId}">--:--:--</span>
                </div>`;
                sec.appendChild(header);
            }

            /* Horizontal scroll row */
            const grid = document.createElement('div');
            grid.className = 'albums-grid dp-grid';
            playlists.forEach(pl => grid.appendChild(renderDailyPlaylistCard(pl)));
            sec.appendChild(grid);
            container.appendChild(sec);

            /* Countdown tick */
            if (_dpIntervals[slot.id]) clearInterval(_dpIntervals[slot.id]);
            function tick() {
                const el = document.getElementById(timerId);
                if (!el) { clearInterval(_dpIntervals[slot.id]); return; }
                const remaining = nextTime - Date.now();
                el.textContent = formatCountdown(Math.max(0, remaining));
                if (remaining <= 0) {
                    clearInterval(_dpIntervals[slot.id]);
                    /* Always use the override version so we get full playlists */
                    window.dailyPlaylistGroups = window.buildDailyPlaylists();
                    displayexplore();
                }
            }
            tick();
            _dpIntervals[slot.id] = setInterval(tick, 1000);
        }

        /* appendDailyPlaylistsSection removed */

        /* displayexplore is now an alias for displayPlaylists */
        function displayexplore(isBack = false) { displayPlaylists(isBack); }

        /* ── DAILY AUTO-REFRESH at midnight ── */
        (function scheduleDailyRefresh() {
            function msUntilMidnight() {
                const now = new Date(), midnight = new Date(now);
                midnight.setHours(24, 0, 0, 0);
                return midnight - now;
            }
            function triggerDailyRebuild() {
                if (window.lastActiveView === 'playlists') displayPlaylists(true);
                setTimeout(triggerDailyRebuild, msUntilMidnight());
            }
            setTimeout(triggerDailyRebuild, msUntilMidnight());
        })();

        /* ─── ARTISTS VIEW ─────────────────────────────────────────── */
        function displayArtists(isBack = false) {
            if (!artistsContainer) return;
            navigateToView('artists', artistsContainer, isBack);
            artistsContainer.style.display = 'block';

            /* Skip re-render if already built */
            if (artistsContainer.dataset.builtFor === 'v1') return;
            artistsContainer.dataset.builtFor = 'v1';
            artistsContainer.innerHTML = '';

            const data = (typeof customArtistsData !== 'undefined') ? customArtistsData : {};
            const allSongs = window.allSongsMap ? [...window.allSongsMap.values()] : [];

            Object.entries(data).forEach(([groupName, artists]) => {
                /* Section wrapper */
                const section = document.createElement('div');
                section.className = 'bz-artists-section';

                /* Section heading */
                const heading = document.createElement('div');
                heading.className = 'bz-artists-heading';
                heading.innerHTML = `<i class="fas fa-microphone-alt"></i><span>${groupName}</span>`;
                section.appendChild(heading);

                /* Horizontal scroll row */
                const row = document.createElement('div');
                row.className = 'bz-artists-row';

                artists.forEach(artist => {
                    /* Count songs for this artist */
                    const songCount = allSongs.filter(s =>
                        s.artist && s.artist.toLowerCase().includes(artist.name.toLowerCase())
                    ).length;

                    const card = document.createElement('div');
                    card.className = 'bz-artist-card';
                    card.setAttribute('data-artist-id', artist.id);

                    const imgHtml = artist.imageUrl
                        ? `<img src="${artist.imageUrl}" alt="${artist.name}" loading="lazy" class="bz-artist-img">`
                        : `<div class="bz-artist-img bz-artist-img-placeholder"><i class="fas fa-microphone-alt"></i></div>`;

                    card.innerHTML = `
                        <div class="bz-artist-img-wrap">${imgHtml}</div>
                        <div class="bz-artist-name">${artist.name}</div>
                        <div class="bz-artist-count">${songCount ? songCount + ' song' + (songCount !== 1 ? 's' : '') : 'Artist'}</div>`;

                    /* Click → filter songs by artist via search */
                    card.addEventListener('click', () => {
                        document.getElementById('search-link')?.click();
                        setTimeout(() => {
                            const bar = document.getElementById('search-bar');
                            if (bar) {
                                bar.value = artist.name;
                                bar.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                        }, 100);
                    });

                    row.appendChild(card);
                });

                section.appendChild(row);
                artistsContainer.appendChild(section);
            });

            if (!Object.keys(data).length) {
                artistsContainer.innerHTML = `<div class="bz-artists-empty"><i class="fas fa-microphone-slash"></i><p>No artists found.</p></div>`;
            }
        }
        /* Expose so notification action can call it */
        window.bzDisplayArtists = displayArtists;

        function displaySettings(isBack = false) {
            navigateToView('settings', settingsContainer, isBack);
            if (settingsContainer) settingsContainer.style.display = 'block';
            // Refresh auth UI in case Firebase resolved while settings was hidden.
            setTimeout(() => {
                if (typeof window.bzRefreshAuthUI === 'function') window.bzRefreshAuthUI();
            }, 80);
        }

        function displayUpdates(isBack = false) {
            navigateToView('updates', updatesContainer, isBack);
            if (updatesContainer) updatesContainer.style.display = 'block';
        }

        // Premium / upgrade page
        function displayPremium(isBack = false) {
            navigateToView('premium', premiumContainer, isBack);
            if (premiumContainer) premiumContainer.style.display = 'block';
            bzInitPremiumUI();
            if (typeof window.bzRenderPremiumView === 'function') window.bzRenderPremiumView();
        }
        window.displayPremium = displayPremium;

        // Profile page
        function displayProfile(isBack = false) {
            navigateToView('profile', profileContainer, isBack);
            if (profileContainer) profileContainer.style.display = 'block';
            // Refresh auth UI in case Firebase resolved while this view was hidden
            setTimeout(() => {
                if (typeof window.bzRefreshAuthUI === 'function') window.bzRefreshAuthUI();
                bzSyncProfilePageFromAccountCard();
                bzLoadProfileJoinedDate();
                if (typeof window.bzRefreshStreakCard === 'function') window.bzRefreshStreakCard();
                if (typeof bzUpdateAdminEntryButton === 'function') bzUpdateAdminEntryButton();
            }, 80);
            // Paint immediately too (don't wait 80ms) using whatever the account
            bzSyncProfilePageFromAccountCard();
            bzLoadProfileJoinedDate();
            if (typeof window.bzRefreshStreakCard === 'function') window.bzRefreshStreakCard();
            if (typeof bzUpdateAdminEntryButton === 'function') bzUpdateAdminEntryButton();
        }

        // Copies the live values out of the Settings → Account card
        function bzCachedIdentity() {
            const fullName = localStorage.getItem('beatzen_fullName') || '';
            const displayUsername = localStorage.getItem('beatzen_displayUsername') || '';
            const username = localStorage.getItem('beatzen_username') || '';
            const name = fullName || displayUsername || (username ? '@' + username : '') || '';
            const letter = (name || 'U').trim().charAt(0).toUpperCase() || 'U';
            const email = displayUsername ? '@' + displayUsername : '';
            const photoURL = localStorage.getItem('beatzen_photoURL') || '';
            return { name, letter, email, photoURL };
        }

        function bzSyncProfilePageFromAccountCard() {
            const srcAvatar = document.getElementById('bz-auth-avatar');
            const srcInit = document.getElementById('bz-auth-avatar-init');
            const srcName = document.getElementById('bz-auth-name');
            const srcEmail = document.getElementById('bz-auth-email');
            const srcSync = document.getElementById('bz-sync-status-text');

            const pageAvatar = document.getElementById('bz-profile-page-avatar');
            const pageInit = document.getElementById('bz-profile-page-avatar-init');
            const pageName = document.getElementById('bz-profile-page-name');
            const pageEmail = document.getElementById('bz-profile-page-email');
            const pageSync = document.getElementById('bz-profile-page-sync-text');

            // FIX: fall back to the cached identity (see bzCachedIdentity above)
            const cached = bzCachedIdentity();
            const liveName = (srcName && srcName.textContent && srcName.textContent.trim()) || '';

            const hasLivePhoto = !!(srcAvatar && srcAvatar.getAttribute('src') && srcAvatar.style.display !== 'none');
            const hasCachedPhoto = !hasLivePhoto && !!cached.photoURL;
            if (pageAvatar && pageInit) {
                if (hasLivePhoto || hasCachedPhoto) {
                    pageAvatar.src = hasLivePhoto ? srcAvatar.src : cached.photoURL;
                    pageAvatar.style.display = '';
                    pageInit.style.display = 'none';
                } else {
                    pageAvatar.style.display = 'none';
                    pageInit.style.display = 'flex';
                    const fallbackLetter = (liveName || cached.name || 'U').trim().charAt(0).toUpperCase() || 'U';
                    pageInit.textContent = (srcInit && srcInit.textContent) ? srcInit.textContent : fallbackLetter;
                }
            }
            if (pageName) pageName.textContent = liveName || cached.name || 'Beat Zen User';
            if (pageEmail) pageEmail.textContent = (srcEmail && srcEmail.textContent) || cached.email || '';
            if (pageSync) pageSync.textContent = (srcSync && srcSync.textContent) || 'Not synced yet';
        }
        // FIX: expose globally so auth.js can push a fresh sync onto the Profile
        window.bzSyncProfilePageFromAccountCard = bzSyncProfilePageFromAccountCard;

        // Turns a Firestore Timestamp (has .toDate()) or any Date-parsable value
        function bzFormatJoinedDate(dateInput) {
            try {
                const d = (dateInput && typeof dateInput.toDate === 'function')
                    ? dateInput.toDate()
                    : new Date(dateInput);
                if (isNaN(d.getTime())) return '';
                return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
            } catch (_) { return ''; }
        }

        // Loads and displays the signed-in user's join date on the Profile page.
        function bzLoadProfileJoinedDate() {
            const pageJoined = document.getElementById('bz-profile-page-joined-text');
            if (!pageJoined) return;

            // FIX: same race as the name/avatar sync above — this can run
            const CACHE_KEY = 'beatzen_joinedDateText';
            const cached = (function () { try { return localStorage.getItem(CACHE_KEY) || ''; } catch (_) { return ''; } })();

            const user = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
            if (!user) { pageJoined.textContent = cached ? `Joined ${cached}` : '—'; return; }

            if (user.metadata && user.metadata.creationTime) {
                const formatted = bzFormatJoinedDate(user.metadata.creationTime);
                if (formatted) {
                    pageJoined.textContent = `Joined ${formatted}`;
                    try { localStorage.setItem(CACHE_KEY, formatted); } catch (_) { }
                    return;
                }
            }

            // Fallback — only reached if Auth metadata is unavailable.
            pageJoined.textContent = cached ? `Joined ${cached}` : '—';
            if (typeof fetchUserProfile === 'function') {
                fetchUserProfile(user.uid).then(profile => {
                    if (!profile || !profile.createdAt) return;
                    const formatted = bzFormatJoinedDate(profile.createdAt);
                    if (formatted) {
                        pageJoined.textContent = `Joined ${formatted}`;
                        try { localStorage.setItem(CACHE_KEY, formatted); } catch (_) { }
                    }
                }).catch(() => { /* keep whatever is currently shown */ });
            }
        }
        // FIX: expose globally so auth.js can re-run this the INSTANT the real
        window.bzLoadProfileJoinedDate = bzLoadProfileJoinedDate;

        // ADMIN DASHBOARD (email-gated)
        const BZ_ADMIN_EMAILS = ['sairuthwik2002@gmail.com']; // ← must match firestore.rules

        function bzIsAdminUser() {
            try {
                if (typeof auth === 'undefined' || !auth || !auth.currentUser) return false;
                const email = (auth.currentUser.email || '').toLowerCase();
                return !!email && BZ_ADMIN_EMAILS.indexOf(email) !== -1;
            } catch (_) { return false; }
        }

        // script.js executes before the Firebase SDK / auth.js
        function bzAdminWaitForAuthReady(cb) {
            let tries = 0;
            (function poll() {
                if (window.bzAuthReady) { window.bzAuthReady.then(() => cb()); return; }
                if (++tries > 200) { cb(); return; }
                setTimeout(poll, 50);
            })();
        }

        // Show/hide the "Admin" button on the Profile page
        function bzUpdateAdminEntryButton() {
            const card = document.getElementById('bz-profile-admin-entry-container');
            if (!card) return;
            const existingRow = document.getElementById('bz-admin-entry-row');
            if (bzIsAdminUser()) {
                if (existingRow) return;
                const row = document.createElement('div');
                row.id = 'bz-admin-entry-row';
                row.className = 'bz-auth-admin-row';
                const btn = document.createElement('button');
                btn.id = 'bz-admin-entry-btn';
                btn.className = 'stg-action-btn stg-btn--purple';
                btn.innerHTML = '<i class="fas fa-user-shield"></i> Admin Dashboard';
                btn.addEventListener('click', () => displayAdminDashboard());
                row.appendChild(btn);
                card.appendChild(row);
            } else if (existingRow) {
                existingRow.remove();
            }
        }

        // Recompute the Admin button on every auth change too
        bzAdminWaitForAuthReady(function () {
            if (typeof auth !== 'undefined' && auth) auth.onAuthStateChanged(() => bzUpdateAdminEntryButton());
        });

        // Build (once) and return the Admin Dashboard container
        let _bzAdminContainer = null;
        function bzGetAdminDashboardContainer() {
            if (_bzAdminContainer) return _bzAdminContainer;
            const main = document.querySelector('.main-content');
            if (!main) return null;
            const el = document.createElement('section');
            el.id = 'bz-admin-dashboard-container';
            el.className = 'settings-container';
            el.style.display = 'none';
            el.innerHTML = `
                <div class="stg-section" id="bz-admin-section">
                    <div class="stg-section-label"><i class="fas fa-user-shield"></i> Admin Dashboard</div>

                    <div class="bz-admin-tabs" id="bz-admin-tabs">
                        <button type="button" id="bz-admin-tab-users" class="bz-admin-tab-btn active"><i class="fas fa-users"></i> Users</button>
                        <button type="button" id="bz-admin-tab-premium" class="bz-admin-tab-btn"><i class="fas fa-crown"></i> Premium Requests<span id="bz-admin-premium-badge" class="bz-admin-premium-badge" style="display:none;">0</span></button>
                    </div>

                    <div id="bz-admin-users-view">
                        <div id="bz-admin-toolbar" class="bz-admin-toolbar">
                            <div class="bz-admin-toolbar-left">
                                <button id="bz-admin-back-btn" class="stg-action-btn stg-btn--blue"><i class="fas fa-arrow-left"></i> Back</button>
                                <button id="bz-admin-refresh-btn" class="stg-action-btn stg-btn--blue"><i class="fas fa-rotate"></i> Refresh</button>
                                <div id="bz-admin-sort-wrap" style="position:relative; flex-shrink:0;">
                                    <button id="bz-admin-sort-btn" class="stg-action-btn stg-btn--blue"><i class="fas fa-arrow-down-wide-short"></i> Sort</button>
                                    <div id="bz-admin-sort-menu" class="bz-admin-sort-menu" style="display:none;">
                                        <div class="bz-admin-sort-fields">
                                            <button type="button" class="bz-admin-sort-field" data-field="name"><i class="fas fa-user"></i> Name</button>
                                            <button type="button" class="bz-admin-sort-field" data-field="email"><i class="fas fa-envelope"></i> Email</button>
                                            <button type="button" class="bz-admin-sort-field" data-field="joined"><i class="fas fa-calendar"></i> Join Date</button>
                                            <button type="button" class="bz-admin-sort-field" data-field="synced"><i class="fas fa-rotate"></i> Last Synced</button>
                                        </div>
                                        <div class="bz-admin-sort-divider"></div>
                                        <div id="bz-admin-sort-dir-group" class="bz-admin-sort-dir-group" role="radiogroup" aria-label="Sort direction">
                                            <label class="bz-admin-sort-dir-radio" data-dir="desc">
                                                <input type="radio" name="bz-admin-sort-dir" value="desc" disabled>
                                                <span class="bz-admin-sort-dir-indicator"></span>
                                                <span class="bz-admin-sort-dir-text">Latest</span>
                                            </label>
                                            <label class="bz-admin-sort-dir-radio" data-dir="asc">
                                                <input type="radio" name="bz-admin-sort-dir" value="asc" disabled>
                                                <span class="bz-admin-sort-dir-indicator"></span>
                                                <span class="bz-admin-sort-dir-text">Old</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="bz-admin-search-wrap">
                                <div class="bz-admin-search-input-wrap">
                                    <i class="fas fa-search"></i>
                                    <input type="text" id="bz-admin-search-input" class="bz-admin-search-input" placeholder="Search names and emails">
                                </div>
                            </div>
                        </div>
                        <div id="bz-admin-summary" style="opacity:.7; font-size:.85rem; margin-bottom:4px; display:none;"></div>
                        <div id="bz-admin-user-list"></div>
                        <div id="bz-admin-detail" style="display:none; margin-top:18px;"></div>
                    </div>

                    <div id="bz-admin-premium-view" style="display:none;">
                        <div id="bz-admin-premium-list"></div>
                    </div>
                </div>`;
            main.appendChild(el);
            _bzAdminContainer = el;
            el.querySelector('#bz-admin-tab-users').addEventListener('click', function () {
                this.classList.add('active');
                el.querySelector('#bz-admin-tab-premium').classList.remove('active');
                document.getElementById('bz-admin-users-view').style.display = '';
                document.getElementById('bz-admin-premium-view').style.display = 'none';
            });
            el.querySelector('#bz-admin-tab-premium').addEventListener('click', function () {
                this.classList.add('active');
                el.querySelector('#bz-admin-tab-users').classList.remove('active');
                document.getElementById('bz-admin-users-view').style.display = 'none';
                document.getElementById('bz-admin-premium-view').style.display = '';
                bzLoadPremiumRequests();
            });
            el.querySelector('#bz-admin-back-btn').addEventListener('click', () => {
                // Leaving the dashboard entirely
                _bzAdminStopUserListListener();
                _bzAdminStopUserDetailListener();
                _bzAdminStopSyncListeners();
                _bzAdminStopPremiumListener();
                displaySettings();
            });
            el.querySelector('#bz-admin-refresh-btn').addEventListener('click', () => bzLoadAdminUserList());
            const sortBtn = el.querySelector('#bz-admin-sort-btn');
            const sortMenu = el.querySelector('#bz-admin-sort-menu');
            sortBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                sortMenu.style.display = sortMenu.style.display === 'none' ? 'block' : 'none';
            });
            el.querySelectorAll('.bz-admin-sort-field').forEach(fieldBtn => {
                fieldBtn.addEventListener('click', () => {
                    _bzAdminSortField = fieldBtn.getAttribute('data-field');
                    _bzAdminSortKey = _bzAdminComputeSortKey();
                    _bzAdminUpdateSortUI();
                    _bzRenderAdminUserRows();
                });
            });
            el.querySelectorAll('.bz-admin-sort-dir-radio input[type="radio"]').forEach(radio => {
                radio.addEventListener('change', () => {
                    if (!_bzAdminSortField) return; // pick a field first
                    _bzAdminSortDir = radio.value; // 'desc' (Latest) | 'asc' (Old)
                    _bzAdminSortKey = _bzAdminComputeSortKey();
                    _bzAdminUpdateSortUI();
                    _bzRenderAdminUserRows();
                });
            });
            document.addEventListener('click', (e) => {
                if (sortMenu.style.display !== 'none' && !e.target.closest('#bz-admin-sort-wrap')) {
                    sortMenu.style.display = 'none';
                }
            });
            const searchInput = el.querySelector('#bz-admin-search-input');
            searchInput.addEventListener('input', () => {
                _bzAdminSearchQuery = searchInput.value.toLowerCase().trim();
                _bzRenderAdminUserRows();
            });
            // Reflect the default sort (Last Synced / Latest) in the dropdown's
            _bzAdminUpdateSortUI();
            return el;
        }

        // Sort state + cached user rows for the admin list
        let _bzAdminUsersData = [];
        // Bumped on every fresh bzLoadAdminUserList() user-list snapshot
        let _bzAdminSyncFetchToken = 0;
        let _bzAdminSortField = 'synced'; // null | 'name' | 'email' | 'joined' | 'synced'
        let _bzAdminSortDir = 'desc';  // 'asc' (Old) | 'desc' (Latest) — defaults to Latest
        let _bzAdminSortKey = null; // derived below once _bzAdminComputeSortKey is declared
        let _bzAdminSearchQuery = ''; // Current search term for filtering by name/email
        // Tracks whether bzShowAdminUserDetail() pushed a history entry
        let _bzAdminDetailPushed = false;

        function _bzAdminComputeSortKey() {
            return _bzAdminSortField ? (_bzAdminSortField + '-' + _bzAdminSortDir) : null;
        }
        _bzAdminSortKey = _bzAdminComputeSortKey(); // 'synced-desc' by default, see the two lets above

        // Refreshes the active-field highlight and the Latest/Old direction
        function _bzAdminUpdateSortUI() {
            const menu = document.getElementById('bz-admin-sort-menu');
            if (!menu) return;
            menu.querySelectorAll('.bz-admin-sort-field').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-field') === _bzAdminSortField);
            });
            const hasField = !!_bzAdminSortField;
            menu.querySelectorAll('.bz-admin-sort-dir-radio').forEach(label => {
                const input = label.querySelector('input[type="radio"]');
                if (!input) return;
                input.disabled = !hasField;
                label.classList.toggle('disabled', !hasField);
                const checked = hasField && label.getAttribute('data-dir') === _bzAdminSortDir;
                input.checked = checked;
                label.classList.toggle('checked', checked);
            });
        }

        // Admin live-listener handles
        let _bzAdminUserListUnsub = null;
        let _bzAdminUserDetailUnsub = null;
        function _bzAdminStopUserListListener() {
            if (_bzAdminUserListUnsub) { _bzAdminUserListUnsub(); _bzAdminUserListUnsub = null; }
        }
        function _bzAdminStopUserDetailListener() {
            if (_bzAdminUserDetailUnsub) { _bzAdminUserDetailUnsub(); _bzAdminUserDetailUnsub = null; }
        }

        // One live listener per row's beatzen_sync/{uid} doc
        let _bzAdminSyncListenerUnsubs = [];
        function _bzAdminStopSyncListeners() {
            _bzAdminSyncListenerUnsubs.forEach(function (unsub) { try { unsub(); } catch (_) { } });
            _bzAdminSyncListenerUnsubs = [];
        }

        function _bzSortAdminUsers(list, key) {
            const arr = list.slice();
            const nameOf = (u) => (u.fullName || u.displayUsername || '').toLowerCase();
            const emailOf = (u) => (u.email || '').toLowerCase();
            switch (key) {
                case 'name-asc':
                    arr.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
                    break;
                case 'name-desc':
                    arr.sort((a, b) => nameOf(b).localeCompare(nameOf(a)));
                    break;
                case 'email-asc':
                    arr.sort((a, b) => emailOf(a).localeCompare(emailOf(b)));
                    break;
                case 'email-desc':
                    arr.sort((a, b) => emailOf(b).localeCompare(emailOf(a)));
                    break;
                case 'joined-asc': // oldest first
                    arr.sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
                    break;
                case 'joined-desc': // newest first
                    arr.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
                    break;
                case 'synced-asc': // least recent synced first
                    arr.sort((a, b) => (a.lastSyncedMs || a.createdAtMs || 0) - (b.lastSyncedMs || b.createdAtMs || 0));
                    break;
                case 'synced-desc': // most recent synced first
                    arr.sort((a, b) => (b.lastSyncedMs || b.createdAtMs || 0) - (a.lastSyncedMs || a.createdAtMs || 0));
                    break;
                default:
                    break; // no key selected yet — keep original fetch order
            }
            return arr;
        }

        function _bzRenderAdminUserRows() {
            const listEl = document.getElementById('bz-admin-user-list');
            if (!listEl) return;
            const sorted = _bzSortAdminUsers(_bzAdminUsersData, _bzAdminSortKey);

            // Apply search filter
            let filtered = sorted;
            if (_bzAdminSearchQuery) {
                filtered = sorted.filter(u => {
                    const name = (u.fullName || u.displayUsername || '').toLowerCase();
                    const email = (u.email || '').toLowerCase();
                    return name.includes(_bzAdminSearchQuery) || email.includes(_bzAdminSearchQuery);
                });
            }

            let rows = '';
            if (filtered.length === 0 && _bzAdminSearchQuery) {
                rows = `<div style="padding:20px; text-align:center; opacity:.6; font-size:.9rem;">No users found matching "${_bzEscapeHTML(_bzAdminSearchQuery)}"</div>`;
            } else {
                // The right-hand date reflects whichever field the list is actually
                const _showSynced = _bzAdminSortField === 'synced';
                filtered.forEach(function (u) {
                    const dateLabel = _showSynced ? (u.lastSyncedLabel || 'Never synced') : u.createdLabel;
                    rows += `
                        <div class="bz-admin-user-row" data-uid="${u.id}" style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:12px 14px; margin-bottom:8px; border-radius:var(--radius-sm,10px); background:rgba(255,255,255,0.04); cursor:pointer; width:100%; box-sizing:border-box; overflow:hidden;">
                            <span style="min-width:0; flex:1 1 auto; overflow:hidden;">
                                <strong style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${_bzEscapeHTML(u.fullName || u.displayUsername || 'Unnamed')}</strong>
                                <span style="display:block; opacity:.7; font-size:.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${_bzEscapeHTML(u.email || '')}</span>
                            </span>
                            <span style="opacity:.55; font-size:.8rem; white-space:nowrap; flex-shrink:0;">${_bzEscapeHTML(dateLabel)}</span>
                        </div>`;
                });
            }
            listEl.innerHTML = rows;
            listEl.querySelectorAll('.bz-admin-user-row').forEach(function (row) {
                row.addEventListener('click', () => bzShowAdminUserDetail(row.getAttribute('data-uid')));
            });
        }

        // ── PREMIUM REQUESTS (Admin) ─────────────────────────────────────
        // One live listener on the whole collection — keeps both the pending
        // badge and the rendered list in sync in real time (an Accept click
        // by this admin, or by another admin in a second tab, updates here
        // immediately without a manual refresh).
        let _bzAdminPremiumUnsub = null;
        let _bzAdminPremiumData = [];
        function _bzAdminStopPremiumListener() {
            if (_bzAdminPremiumUnsub) { _bzAdminPremiumUnsub(); _bzAdminPremiumUnsub = null; }
        }

        function _bzFmtPremiumTime(ts) {
            try {
                const d = (ts && typeof ts.toDate === 'function') ? ts.toDate() : (ts ? new Date(ts) : null);
                return d && !isNaN(d.getTime()) ? d.toLocaleString() : '—';
            } catch (_) { return '—'; }
        }

        function _bzShowImageLightbox(src) {
            if (!src) return;
            let overlay = document.getElementById('bz-admin-lightbox');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'bz-admin-lightbox';
                overlay.className = 'bz-admin-lightbox';
                overlay.innerHTML = '<img id="bz-admin-lightbox-img" src="" alt="Payment screenshot">';
                overlay.addEventListener('click', function () { overlay.classList.remove('visible'); });
                document.body.appendChild(overlay);
            }
            const img = document.getElementById('bz-admin-lightbox-img');
            if (img) img.src = src;
            overlay.classList.add('visible');
        }

        async function _bzAdminAcceptPremium(uid, hours, btn) {
            if (!uid || !hours || typeof db === 'undefined') return;
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>'; }
            try {
                // FIX (per spec): the expiry timer starts exactly when the
                // admin clicks Accept, not at request-submission time.
                const expiresAt = Date.now() + hours * 3600000;
                await db.collection('beatzen_premium_requests').doc(uid).update({
                    status: 'active',
                    expiresAt: expiresAt,
                    approvedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                await db.collection('beatzen_users').doc(uid).set({
                    premium: true,
                    premiumExpiresAt: expiresAt
                }, { merge: true });
                showToast('✓ Premium approved');
            } catch (e) {
                console.error('Beat Zen: approve premium failed', e);
                showToast("Couldn't approve — please try again.");
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Accept'; }
            }
        }

        function _bzAdminDeclinePremium(uid, btn) {
            if (!uid || typeof db === 'undefined') return;
            const reasons = [
                { value: "Payment not verified — the amount doesn't match your selected plan. Please try again with the correct screenshot.", label: "Amount doesn't match plan" },
                { value: 'Payment not verified — the screenshot is unclear or unreadable. Please upload a clearer screenshot.', label: 'Screenshot unclear / unreadable' },
                { value: 'Payment not verified — no payment confirmation is visible in the screenshot. Please upload the confirmation screen.', label: 'No payment confirmation visible' },
                { value: "Payment not verified — this doesn't look like a payment screenshot. Please upload your UPI payment confirmation.", label: "Doesn't look like a payment screenshot" },
                { value: '__other__', label: 'Other (write a reason)' }
            ];
            window.bzSelect('danger', 'Decline — choose a reason', reasons, async function (reasonText, isCustom) {
                if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>'; }
                try {
                    await db.collection('beatzen_premium_requests').doc(uid).update({
                        status: 'failed',
                        declineReason: isCustom ? ('Payment not verified — ' + reasonText) : reasonText
                    });
                } catch (e) {
                    console.error('Beat Zen: decline premium failed', e);
                    showToast("Couldn't decline — please try again.");
                    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-times"></i> Decline'; }
                }
            }, 'Decline');
        }

        // Revokes an active premium subscription right away. Writes two
        // places on purpose:
        //  1. beatzen_users/{uid}.premium=false — this is what auth.js's
        //     live listener actually gates the app on, so access drops
        //     instantly for that user if they're online.
        //  2. beatzen_premium_requests/{uid}.status='cancelled' — without
        //     this, bzRenderPremiumView() would see the old status:'active'
        //     doc (still with a future expiresAt) next time the user opens
        //     the Premium tab and would silently re-activate it.
        async function _bzAdminCancelPremium(uid, btn, onDone) {
            if (!uid || typeof db === 'undefined') return;
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>'; }
            try {
                await db.collection('beatzen_users').doc(uid).set({
                    premium: false,
                    premiumExpiresAt: 0
                }, { merge: true });
                await db.collection('beatzen_premium_requests').doc(uid).set({
                    status: 'cancelled',
                    cancelledAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                showToast('✓ Premium cancelled');
                if (typeof onDone === 'function') onDone();
            } catch (e) {
                console.error('Beat Zen: cancel premium failed', e);
                showToast("Couldn't cancel — please try again.");
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-ban"></i> Cancel Premium'; }
            }
        }

        // Confirmation gate in front of _bzAdminCancelPremium — this is a
        // destructive, immediate action so it always asks first.
        function bzAdminConfirmCancelPremium(uid, name, btn, onDone) {
            window.bzConfirm(
                'danger',
                'Cancel Premium?',
                (name ? _bzEscapeHTML(name) : 'This user') + "'s premium access will be revoked immediately.",
                function () { _bzAdminCancelPremium(uid, btn, onDone); },
                'Cancel Premium',
                'Keep Premium'
            );
        }

        function _bzRenderAdminPremiumList() {
            const listEl = document.getElementById('bz-admin-premium-list');
            if (!listEl) return;
            if (!_bzAdminPremiumData.length) {
                listEl.innerHTML = '<div style="padding:20px; text-align:center; opacity:.6; font-size:.9rem;">No premium requests yet.</div>';
                return;
            }
            listEl.innerHTML = _bzAdminPremiumData.map(function (d) {
                const initial = (d.name || d.email || 'U').trim().charAt(0).toUpperCase() || 'U';
                const avatarHtml = d.photoURL
                    ? `<img src="${_bzEscapeHTML(d.photoURL)}" class="bz-admin-premium-avatar" alt="">`
                    : `<span class="bz-admin-premium-avatar bz-admin-premium-avatar--init">${_bzEscapeHTML(initial)}</span>`;
                const planLabel = d.plan === 'trial' ? '1 Day Trial' : (d.plan === 'month' ? '1 Month' : _bzEscapeHTML(d.plan || ''));
                const statusBadge = d.status === 'active'
                    ? '<span class="bz-admin-premium-status bz-admin-premium-status--active">Active</span>'
                    : d.status === 'failed'
                        ? '<span class="bz-admin-premium-status bz-admin-premium-status--failed">Declined</span>'
                        : d.status === 'cancelled'
                            ? '<span class="bz-admin-premium-status bz-admin-premium-status--failed">Cancelled</span>'
                            : '<span class="bz-admin-premium-status bz-admin-premium-status--pending">Pending</span>';
                const actionsHtml = d.status === 'pending'
                    ? `<div class="bz-admin-premium-actions">
                            <button type="button" class="stg-action-btn stg-btn--green bz-admin-premium-accept" data-uid="${d.id}" data-hours="${parseInt(d.hours, 10) || 0}"><i class="fas fa-check"></i> Accept</button>
                            <button type="button" class="stg-action-btn stg-btn--danger bz-admin-premium-decline" data-uid="${d.id}"><i class="fas fa-times"></i> Decline</button>
                       </div>`
                    : d.status === 'active'
                        ? `<div class="bz-admin-premium-actions">
                                <button type="button" class="stg-action-btn stg-btn--danger bz-admin-premium-cancel" data-uid="${d.id}"><i class="fas fa-ban"></i> Cancel Premium</button>
                           </div>`
                        : '';
                return `
                    <div class="bz-admin-premium-card">
                        ${avatarHtml}
                        <div class="bz-admin-premium-card-info">
                            <strong>${_bzEscapeHTML(d.name || 'Unnamed')}</strong>
                            <span class="bz-admin-premium-card-email">${_bzEscapeHTML(d.email || '')}</span>
                            <span class="bz-admin-premium-card-meta">${_bzEscapeHTML(planLabel)} · ₹${_bzEscapeHTML(String(d.amount != null ? d.amount : ''))} · ${_bzEscapeHTML(_bzFmtPremiumTime(d.submittedAt))}</span>
                        </div>
                        ${d.screenshot ? `<img src="${d.screenshot}" class="bz-admin-premium-thumb" data-full="${d.screenshot}" alt="Payment screenshot">` : ''}
                        ${statusBadge}
                        ${actionsHtml}
                    </div>`;
            }).join('');

            listEl.querySelectorAll('.bz-admin-premium-thumb').forEach(function (img) {
                img.addEventListener('click', function () { _bzShowImageLightbox(img.getAttribute('data-full')); });
            });
            listEl.querySelectorAll('.bz-admin-premium-accept').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    _bzAdminAcceptPremium(btn.getAttribute('data-uid'), parseInt(btn.getAttribute('data-hours'), 10) || 0, btn);
                });
            });
            listEl.querySelectorAll('.bz-admin-premium-decline').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    _bzAdminDeclinePremium(btn.getAttribute('data-uid'), btn);
                });
            });
            listEl.querySelectorAll('.bz-admin-premium-cancel').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    const uid = btn.getAttribute('data-uid');
                    const entry = _bzAdminPremiumData.find(function (x) { return x.id === uid; });
                    bzAdminConfirmCancelPremium(uid, entry && (entry.name || entry.email), btn);
                });
            });
        }

        function _bzAdminEnsurePremiumListener() {
            if (_bzAdminPremiumUnsub || typeof db === 'undefined') return;
            _bzAdminPremiumUnsub = db.collection('beatzen_premium_requests').onSnapshot(function (snap) {
                _bzAdminPremiumData = [];
                snap.forEach(function (doc) {
                    _bzAdminPremiumData.push(Object.assign({ id: doc.id }, doc.data() || {}));
                });
                _bzAdminPremiumData.sort(function (a, b) {
                    const at = (a.submittedAt && typeof a.submittedAt.toMillis === 'function') ? a.submittedAt.toMillis() : 0;
                    const bt = (b.submittedAt && typeof b.submittedAt.toMillis === 'function') ? b.submittedAt.toMillis() : 0;
                    return bt - at;
                });
                const pendingCount = _bzAdminPremiumData.filter(function (d) { return d.status === 'pending'; }).length;
                const badge = document.getElementById('bz-admin-premium-badge');
                if (badge) {
                    badge.textContent = String(pendingCount);
                    badge.style.display = pendingCount > 0 ? '' : 'none';
                }
                _bzRenderAdminPremiumList();
            }, function (err) {
                console.warn('[BeatZen Admin] premium requests listener failed:', err && err.message);
            });
        }

        function bzLoadPremiumRequests() {
            const listEl = document.getElementById('bz-admin-premium-list');
            if (listEl && !_bzAdminPremiumUnsub) {
                listEl.innerHTML = '<div class="bz-generating" style="padding:40px 0;"><div class="bz-spinner"></div><span>Loading requests…</span></div>';
            }
            _bzAdminEnsurePremiumListener();
            _bzRenderAdminPremiumList();
        }

        // Fetches every doc in beatzen_users and renders it as a clickable
        function bzLoadAdminUserList() {
            const listEl = document.getElementById('bz-admin-user-list');
            const summaryEl = document.getElementById('bz-admin-summary');
            const detailEl = document.getElementById('bz-admin-detail');
            const toolbarEl = document.getElementById('bz-admin-toolbar');
            if (!listEl) return;
            // Loading (or re-Refreshing) the list always means "show the list view"
            listEl.style.display = '';
            if (summaryEl) summaryEl.style.display = '';
            // FIX: .bz-admin-toolbar has `display: flex !important` in style.css
            if (toolbarEl) toolbarEl.classList.remove('bz-hidden');
            listEl.innerHTML = '<div class="bz-generating" style="padding:40px 0;"><div class="bz-spinner"></div><span>Loading users…</span></div>';
            if (summaryEl) summaryEl.textContent = '';
            if (detailEl) { detailEl.style.display = 'none'; detailEl.innerHTML = ''; }

            // A fresh call to this function always means "start clean"
            _bzAdminStopUserDetailListener();
            _bzAdminStopUserListListener();
            _bzAdminStopSyncListeners();
            _bzAdminDetailPushed = false;

            bzAdminWaitForAuthReady(function () {
                if (typeof db === 'undefined' || !bzIsAdminUser()) {
                    listEl.innerHTML = '<p style="opacity:.6;">Not authorized.</p>';
                    return;
                }
                // Live listener
                _bzAdminUserListUnsub = db.collection('beatzen_users').onSnapshot(function (snap) {
                    // snap.metadata.fromCache is true whenever this resolved
                    const fromCache = !!(snap.metadata && snap.metadata.fromCache);
                    if (fromCache) return;
                    if (summaryEl) {
                        summaryEl.textContent = snap.size + ' user' + (snap.size === 1 ? '' : 's');
                        summaryEl.style.display = snap.size > 0 ? '' : 'none';
                    }
                    if (snap.empty) {
                        listEl.innerHTML = '<p style="opacity:.6;">No users found.</p>';
                        return;
                    }
                    // A fresh set of rows means the previous batch's per-row
                    _bzAdminStopSyncListeners();
                    _bzAdminUsersData = [];
                    snap.forEach(function (doc) {
                        const d = doc.data() || {};
                        const createdDate = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate() : null;
                        _bzAdminUsersData.push({
                            id: doc.id,
                            fullName: d.fullName || '',
                            displayUsername: d.displayUsername || '',
                            email: d.email || '',
                            createdLabel: createdDate ? createdDate.toLocaleDateString() : '—',
                            createdAtMs: createdDate ? createdDate.getTime() : 0,
                            lastSyncedMs: 0,        // filled in below from each user's beatzen_sync doc
                            lastSyncedLabel: null,  // "—" until that read resolves
                            premium: !!d.premium,
                            premiumExpiresAt: typeof d.premiumExpiresAt === 'number' ? d.premiumExpiresAt : 0
                        });
                    });
                    // Only render right now if the active sort doesn't depend on sync data
                    if (_bzAdminSortField !== 'synced') {
                        _bzRenderAdminUserRows();
                    }

                    // "Last Synced" used to silently fall back to join date because
                    const _syncFetchToken = ++_bzAdminSyncFetchToken;
                    let _pendingFirstSyncReads = _bzAdminUsersData.length;
                    _bzAdminUsersData.forEach(function (row) {
                        const unsub = db.collection('beatzen_sync').doc(row.id).onSnapshot(function (syncSnap) {
                            if (_syncFetchToken !== _bzAdminSyncFetchToken) return; // superseded by a newer batch
                            const uploadedAt = syncSnap.exists ? syncSnap.data()?._uploadedAt : null;
                            if (uploadedAt && uploadedAt.toDate) {
                                row.lastSyncedMs = uploadedAt.toDate().getTime();
                                row.lastSyncedLabel = typeof fmtTimestamp === 'function' ? fmtTimestamp(uploadedAt) : new Date(row.lastSyncedMs).toLocaleString();
                            }
                            if (_pendingFirstSyncReads > 0) {
                                // Hold off rendering until every row has reported in at least once
                                _pendingFirstSyncReads--;
                                if (_pendingFirstSyncReads === 0) _bzRenderAdminUserRows();
                            } else {
                                // Every row already has an initial value
                                _bzRenderAdminUserRows();
                            }
                        }, function () {
                            // permission-denied or no sync doc yet
                            if (_syncFetchToken !== _bzAdminSyncFetchToken) return;
                            if (_pendingFirstSyncReads > 0) {
                                _pendingFirstSyncReads--;
                                if (_pendingFirstSyncReads === 0) _bzRenderAdminUserRows();
                            }
                        });
                        _bzAdminSyncListenerUnsubs.push(unsub);
                    });
                }, function (err) {
                    console.warn('[BeatZen Admin] user list listener failed:', err && err.message);
                    const denied = err && err.code === 'permission-denied';
                    listEl.innerHTML = `<p style="opacity:.6;">Failed to load users${denied ? " — permission denied. Check that this email is in firestore.rules' isAdmin() list." : '.'}</p>`;
                });
            });
        }

        // Clean-UI rendering helpers for a user's beatzen_sync document

        // Parses a JSON-string field back into an object/array
        function _bzSafeJSON(value, fallback) {
            if (value === undefined || value === null) return fallback;
            if (typeof value !== 'string') return value; // already parsed
            try { return JSON.parse(value); } catch (_) { return fallback; }
        }

        // "true"/"false" (or real booleans) → a small On/Off pill.
        function _bzBoolPill(value) {
            const on = value === true || value === 'true';
            return `<span style="display:inline-block; padding:2px 10px; border-radius:999px; font-size:.72rem; font-weight:700; background:${on ? 'rgba(29,185,84,0.15)' : 'rgba(255,255,255,0.08)'}; color:${on ? '#3ddc71' : '#9099a8'};">${on ? 'On' : 'Off'}</span>`;
        }

        // One label/value line inside a section.
        function _bzInfoRow(label, valueHtml) {
            return `<div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
                <span style="opacity:.6; font-size:.82rem;">${label}</span>
                <span style="font-size:.86rem; font-weight:600; text-align:right;">${valueHtml}</span>
            </div>`;
        }

        // A titled group of rows/content.
        function _bzSection(title, icon, innerHtml) {
            return `<div style="margin-bottom:22px;">
                <div style="font-size:.72rem; font-weight:800; letter-spacing:.05em; text-transform:uppercase; opacity:.5; margin-bottom:8px;"><i class="fas ${icon}"></i> ${title}</div>
                ${innerHtml}
            </div>`;
        }

        // Builds the full clean-headings view for one user's synced-data doc.
        // userMeta (from _bzAdminUsersData) carries the premium/premiumExpiresAt
        // fields, which live on beatzen_users, not on the beatzen_sync doc in d.
        function _bzRenderUserDetail(d, userMeta) {
            d = d || {};

            const isPremiumActive = !!(userMeta && userMeta.premium && userMeta.premiumExpiresAt && Date.now() < userMeta.premiumExpiresAt);
            const premiumRows = _bzInfoRow('Status', isPremiumActive
                ? '<span class="bz-admin-premium-status bz-admin-premium-status--active">Active</span>'
                : '<span class="bz-admin-premium-status bz-admin-premium-status--failed">Not Premium</span>')
                + (isPremiumActive ? _bzInfoRow('Expires', _bzEscapeHTML(new Date(userMeta.premiumExpiresAt).toLocaleString())) : '');
            const premiumActionHtml = isPremiumActive
                ? `<button type="button" id="bz-admin-detail-cancel-premium-btn" class="stg-action-btn stg-btn--danger" style="margin-top:10px;"><i class="fas fa-ban"></i> Cancel Premium</button>`
                : '';

            const profileRows =
                _bzInfoRow('Full Name', _bzEscapeHTML(d._displayName || '—')) +
                _bzInfoRow('Email', _bzEscapeHTML(d._email || d._userEmail || '—')) +
                _bzInfoRow('Last Sign-in', _bzEscapeHTML(d._lastSignInAt || '—')) +
                _bzInfoRow('Last Synced', _bzEscapeHTML(d._uploadedAtFormatted || '—'));

            const statsRows =
                _bzInfoRow('Songs Played', _bzEscapeHTML(String(d._totalSongsPlayed ?? 0))) +
                _bzInfoRow('Listening Time', _bzEscapeHTML((d._totalListenMinutes ?? 0) + ' min')) +
                _bzInfoRow('Top Artist', _bzEscapeHTML(d._topArtist || '—')) +
                _bzInfoRow('Top Album', _bzEscapeHTML(d._topMovie || '—')) +
                _bzInfoRow('Peak Listening Hour', _bzEscapeHTML(d._peakListenHour || '—'));

            const prefsRows =
                _bzInfoRow('Dark Mode', _bzBoolPill(d.beatzen_dark_mode)) +
                _bzInfoRow('Shuffle', _bzBoolPill(d.beatZen_shuffle)) +
                _bzInfoRow('Loop', _bzBoolPill(d.beatZen_loop)) +
                _bzInfoRow('AutoMix', _bzBoolPill(d.beatzen_automix)) +
                _bzInfoRow('History Tracking', _bzBoolPill(d.beatzen_history)) +
                _bzInfoRow('Last Active Tab', _bzEscapeHTML(d.beatZen_activeView || '—'));

            // Now Playing / Last Played
            const lastSong = _bzSafeJSON(d.lastPlayedSong, null);
            const nowPlayingHtml = (lastSong && (lastSong.title || lastSong.artist))
                ? `<div style="display:flex; align-items:center; gap:12px; padding:10px; background:rgba(255,255,255,0.04); border-radius:10px;">
                        ${lastSong.cover ? `<img src="${lastSong.cover}" alt="" style="width:48px; height:48px; border-radius:8px; object-fit:cover; flex-shrink:0;">` : ''}
                        <div style="min-width:0;">
                            <div style="font-weight:700; font-size:.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${_bzEscapeHTML(lastSong.title || 'Unknown title')}</div>
                            <div style="opacity:.65; font-size:.8rem;">${_bzEscapeHTML(lastSong.artist || 'Unknown artist')}</div>
                        </div>
                    </div>`
                : '<p style="opacity:.5; font-size:.85rem;">No recent playback recorded.</p>';

            // Listening History
            const historyList = _bzSafeJSON(d.z_history, []);
            let historyHtml;
            if (Array.isArray(historyList) && historyList.length) {
                const shown = historyList.slice(0, 25).map(function (entry) {
                    const title = entry.title || 'Unknown title';
                    const artist = entry.artist || '';
                    const album = entry.albumTitle || entry.sourceName || '';
                    let when = '';
                    if (entry.playedAt) { try { when = new Date(entry.playedAt).toLocaleString(); } catch (_) { } }
                    return `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.05);">
                        <span style="min-width:0;">
                            <span style="font-weight:600; font-size:.85rem;">${_bzEscapeHTML(title)}</span>
                            <span style="opacity:.6; font-size:.78rem; display:block;">${_bzEscapeHTML(artist)}${album ? ' · ' + _bzEscapeHTML(album) : ''}</span>
                        </span>
                        <span style="opacity:.5; font-size:.74rem; white-space:nowrap;">${_bzEscapeHTML(when)}</span>
                    </div>`;
                }).join('');
                historyHtml = `<div style="max-height:280px; overflow-y:auto; border-radius:10px; background:rgba(255,255,255,0.02);">${shown}</div>`
                    + (historyList.length > 25 ? `<p style="opacity:.5; font-size:.76rem; margin-top:6px;">+ ${historyList.length - 25} more</p>` : '');
            } else {
                historyHtml = '<p style="opacity:.5; font-size:.85rem;">No listening history recorded.</p>';
            }

            // Favourites
            const favs = _bzSafeJSON(d.z_favourites, []);
            const favsHtml = (Array.isArray(favs) && favs.length)
                ? `<p style="font-size:.85rem;">${favs.length} song${favs.length === 1 ? '' : 's'} favourited</p>`
                : '<p style="opacity:.5; font-size:.85rem;">No favourites yet.</p>';

            // Everything else
            const advancedHtml = `<details style="opacity:.75;">
                <summary style="cursor:pointer; font-size:.78rem; opacity:.7;">Show raw synced fields</summary>
                <pre style="white-space:pre-wrap; word-break:break-word; font-size:.74rem; opacity:.8; max-height:300px; overflow:auto; background:rgba(255,255,255,0.04); padding:12px; border-radius:8px; margin-top:8px;">${_bzEscapeHTML(JSON.stringify(d, null, 2))}</pre>
            </details>`;

            return _bzSection('Premium', 'fa-crown', premiumRows + premiumActionHtml)
                + _bzSection('Profile', 'fa-user', profileRows)
                + _bzSection('Listening Stats', 'fa-chart-simple', statsRows)
                + _bzSection('Preferences', 'fa-sliders', prefsRows)
                + _bzSection('Now Playing / Last Played', 'fa-play', nowPlayingHtml)
                + _bzSection('Listening History', 'fa-clock-rotate-left', historyHtml)
                + _bzSection('Favourites', 'fa-heart', favsHtml)
                + advancedHtml;
        }

        // Restores the user list view: shown after "← Back to list" is clicked
        function bzShowAdminUserList(fromPop = false) {
            const listEl = document.getElementById('bz-admin-user-list');
            const summaryEl = document.getElementById('bz-admin-summary');
            const detailEl = document.getElementById('bz-admin-detail');
            const toolbarEl = document.getElementById('bz-admin-toolbar');
            if (listEl) listEl.style.display = '';
            if (summaryEl && summaryEl.textContent) summaryEl.style.display = '';
            // FIX: see bzLoadAdminUserList()
            if (toolbarEl) toolbarEl.classList.remove('bz-hidden');
            if (detailEl) { detailEl.style.display = 'none'; detailEl.innerHTML = ''; }
            // Pop the history entry bzShowAdminUserDetail() pushed
            if (_bzAdminDetailPushed) {
                _bzAdminDetailPushed = false;
                if (!fromPop) history.back();
            }
        }

        function _bzAdminBackToListButton() {
            return `<button id="bz-admin-back-to-list-btn" class="stg-action-btn stg-btn--blue" style="margin-bottom:16px;"><i class="fas fa-arrow-left"></i> Back to list</button>`;
        }

        // Fetches one user's beatzen_sync document and renders
        function bzShowAdminUserDetail(uid) {
            const listEl = document.getElementById('bz-admin-user-list');
            const summaryEl = document.getElementById('bz-admin-summary');
            const detailEl = document.getElementById('bz-admin-detail');
            const toolbarEl = document.getElementById('bz-admin-toolbar');
            if (!detailEl || typeof db === 'undefined') return;

            // Replace the list with the detail view instead of stacking the detail
            if (listEl) listEl.style.display = 'none';
            if (summaryEl) summaryEl.style.display = 'none';
            // FIX: this used to be toolbarEl.style.display = 'none'
            if (toolbarEl) toolbarEl.classList.add('bz-hidden');

            detailEl.style.display = 'block';
            detailEl.innerHTML = '<div class="bz-generating" style="padding:40px 0;"><div class="bz-spinner"></div><span>Loading synced data…</span></div>';
            detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

            // Push a history entry (reusing the current #admin hash) so Back
            history.pushState({ view: 'admin', adminDetail: true }, '', '#admin');
            _bzAdminDetailPushed = true;

            let _lastSyncData = {};

            // Renders (or re-renders) the whole detail pane and rewires its
            // buttons. Called on every live beatzen_sync update, and again
            // right after a Cancel Premium action so the Premium section
            // reflects it instantly instead of waiting on the next snapshot.
            function _renderDetailPane() {
                const userMeta = _bzAdminUsersData.find(function (u) { return u.id === uid; });
                detailEl.innerHTML = _bzAdminBackToListButton()
                    + `<div class="stg-section-label"><i class="fas fa-sliders-h"></i> Synced Data</div>`
                    + _bzRenderUserDetail(_lastSyncData, userMeta);
                const backBtn = document.getElementById('bz-admin-back-to-list-btn');
                if (backBtn) backBtn.addEventListener('click', function () { _bzAdminStopUserDetailListener(); bzShowAdminUserList(); });
                const cancelBtn = document.getElementById('bz-admin-detail-cancel-premium-btn');
                if (cancelBtn) cancelBtn.addEventListener('click', function () {
                    const meta = _bzAdminUsersData.find(function (u) { return u.id === uid; });
                    bzAdminConfirmCancelPremium(uid, meta && (meta.fullName || meta.displayUsername || meta.email), cancelBtn, function () {
                        // beatzen_users' own listener will confirm this a
                        // moment later — update the cached row now too so
                        // the panel doesn't wait on that round-trip.
                        const cachedRow = _bzAdminUsersData.find(function (u) { return u.id === uid; });
                        if (cachedRow) { cachedRow.premium = false; cachedRow.premiumExpiresAt = 0; }
                        _renderDetailPane();
                    });
                });
            }

            // Switching to a different user's detail (or reopening this one)
            _bzAdminStopUserDetailListener();
            _bzAdminUserDetailUnsub = db.collection('beatzen_sync').doc(uid).onSnapshot(function (snap) {
                _lastSyncData = snap.exists ? snap.data() : {};
                _renderDetailPane();
            }, function (err) {
                console.warn('[BeatZen Admin] sync listener failed:', err && err.message);
                detailEl.innerHTML = _bzAdminBackToListButton() + '<p style="opacity:.6;">Failed to load synced data.</p>';
                const backBtn = document.getElementById('bz-admin-back-to-list-btn');
                if (backBtn) backBtn.addEventListener('click', function () { _bzAdminStopUserDetailListener(); bzShowAdminUserList(); });
            });
        }

        // Capture-phase listener runs before script.js's main
        window.addEventListener('popstate', function (e) {
            const detailEl = document.getElementById('bz-admin-detail');
            if (_bzAdminDetailPushed && detailEl && detailEl.style.display !== 'none') {
                e.stopImmediatePropagation();
                _bzAdminStopUserDetailListener();
                bzShowAdminUserList(true); // fromPop=true — don't call history.back() again
            }
        }, true);

        // Entry point
        function displayAdminDashboard(isBack = false) {
            if (!bzIsAdminUser()) { displaySettings(isBack); return; }
            const adminContainer = bzGetAdminDashboardContainer();
            // Admin-only fix: the Year Jump Bar spacer can leave a stale
            const _bzMain = document.querySelector('.main-content');
            if (_bzMain) _bzMain.style.paddingTop = '';
            navigateToView('admin', adminContainer, isBack);
            if (adminContainer) adminContainer.style.display = 'block';
            bzLoadAdminUserList();
            _bzAdminEnsurePremiumListener();
        }
        window.displayAdminDashboard = displayAdminDashboard;

        function displayAbout(isBack = false) { displaySettings(isBack); }
        function displayContact(isBack = false) {
            displaySettings(isBack);
            const cf = document.getElementById('contact-form');
            if (cf) setTimeout(() => cf.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
        }


        window.displayHome = displayHome;
        window.displayPlaylists = displayPlaylists;
        window.displayexplore = displayexplore;
        window.displaySettings = displaySettings;
        window.displayAbout = displayAbout;
        window.displayContact = displayContact;
        window.displayUpdates = displayUpdates;

        // FIX B1: renderExplore
        window.renderExplore = function () {
            // Only re-render if the Playlists tab is currently visible. Calling
            if (window.lastActiveView === 'playlists' &&
                typeof displayPlaylists === 'function') {
                displayPlaylists(true);
            }
        };

        /* ALBUM DETAIL VIEW */
        function selectAlbum(album, isBack = false, navOverride = null, highlightPlaying = false) {
            if (!album || !album.id) return;

            // Dismiss this specific item's "New" badge now that it has actually been
            if (typeof window.bzMarkNewSeen === 'function') {
                window.bzMarkNewSeen('album', album.id);
                window.bzMarkNewSeen('playlist', album.id);
            }

            /* Save scroll position of the current view before leaving */
            const callerView = window.lastActiveView || 'home';
            // FIX Issue 5: window.scrollY is stale at selectAlbum() call time
            const callerScrollY = window.scrollPositions[callerView]
                || parseInt(localStorage.getItem('beatZen_scroll_' + callerView) || '0', 10);
            // Keep scrollPositions in sync
            window.scrollPositions[callerView] = callerScrollY;
            localStorage.setItem('beatZen_scroll_' + callerView, callerScrollY);

            // If opening from a non-home tab
            if (!isBack && callerView !== 'home' && callerView !== 'album') {
                // Return to the actual caller view (explore, playlists, etc.)
                const callerScroll = window.scrollPositions[callerView]
                    || parseInt(localStorage.getItem('beatZen_scroll_' + callerView) || '0');
                localStorage.setItem('beatZen_activeView', callerView);
                history.replaceState({ view: callerView, scrollY: callerScroll }, '', `#${callerView}`);
            }

            window.currentAlbum = album;
            hideAllViews();
            albumViewContainer.style.display = 'flex';
            delete albumViewContainer.dataset.bzScrollReady;
            window.scrollTo({ top: 0, behavior: 'instant' });
            const isPlaying = window.playingAlbum?.id === album.id && !audioPlayer.paused;
            const isUserPlaylist = String(album.id).startsWith('user-') || String(album.id).startsWith('imported-');
            albumMainContent.innerHTML = `
        <div class="bz-album-nav-bar">
            <button class="bz-back-btn" id="bz-album-back-btn" aria-label="Go back">
                <i class="fas fa-arrow-left"></i><span class="bz-back-label">Back</span>
            </button>
            <button class="bz-album-nav-dots" id="bz-album-nav-dots-btn" aria-label="More options">
                <i class="fas fa-ellipsis-v"></i>
            </button>
        </div>
        <div class="album-info-section">
            <div class="album-details-img-wrapper">${(album.imageUrl || album.albumCover)
                    ? `<img src="${album.imageUrl || album.albumCover}" class="album-details-img${album._isFavourites ? ' bz-fav-album-img' : ''}" style="${album._isFavourites ? 'object-fit:cover;border-radius:18px;' : ''}">`
                    : `<div class="album-details-img bzp-card-gradient" style="background:linear-gradient(135deg,${(album.color || '#6d28d9')}cc,${(album.color || '#6d28d9')}44);display:flex;align-items:center;justify-content:center;border-radius:18px;"><i class="fas ${album.icon || 'fa-music'}" style="font-size:3.5rem;color:#fff;opacity:0.9;"></i></div>`
                }</div>
            <div class="album-text-info">
                <h2>${album.title}</h2>
                <div class="internal-details">${album.detailsHtml}</div>
                ${album.desc ? `<div class="album-playlist-desc">${album.desc}</div>` : ''}
                <div class="action-bar">
                    <button class="action-btn primary play-album-btn"><i class="fas ${isPlaying ? 'fa-pause' : 'fa-play'}"></i> <span>${isPlaying ? 'Pause' : 'Play'}</span></button>
                    <button class="action-btn secondary share-album-btn" title="Share"><i class="fas fa-share-alt"></i> <span>Share</span></button>
                    ${isUserPlaylist ? `<button class="action-btn secondary delete-playlist-btn" title="Delete Playlist"><i class="fas fa-trash-alt"></i> <span>Delete</span></button>` : ""}
                </div>
            </div>
        </div>
        <div class="songs-list"></div>`;
            const list = albumMainContent.querySelector('.songs-list');

            // ── Show skeleton rows while song data populates ───────────────
            function _buildSongSkeleton() {
                const sk = document.createElement('div');
                sk.className = 'bz-song-skeleton';
                sk.innerHTML = `
                    <div class="bz-skel bz-skel-thumb"></div>
                    <div class="bz-skel-lines">
                        <div class="bz-skel bz-skel-title"></div>
                        <div class="bz-skel bz-skel-artist"></div>
                    </div>`;
                return sk;
            }
            // Always inject 6 skeletons.
            const skelCount = 6;
            for (let _s = 0; _s < skelCount; _s++) list.appendChild(_buildSongSkeleton());

            // Defer real render by one frame so skeletons paint first
            requestAnimationFrame(() => {
                list.querySelectorAll('.bz-song-skeleton').forEach(el => el.remove());

                // Empty-state: Repeat Rewind with no songs
                if (!album.songs.length && String(album.id) === 'bz-repeat-rewind') {
                    const emptyEl = document.createElement('div');
                    emptyEl.className = 'bz-empty';
                    emptyEl.style.display = 'flex';
                    emptyEl.innerHTML = `
                        <i class="fas fa-rotate-left"></i>
                        <p>No songs in Repeat Rewind yet</p>
                        <p style="font-size:0.82rem;font-weight:500;opacity:0.65;margin-top:-4px;
                                   background:none;color:var(--bz-text-dim);">
                            Songs you replayed upto 3+ times will appear here.
                        </p>`;
                    list.appendChild(emptyEl);
                    // Nothing to scroll-restore for an empty album
                    albumViewContainer.dataset.bzScrollReady = '1';
                    return; // nothing else to render
                }

                album.songs.forEach((song, i) => {
                    const item = document.createElement('div');
                    item.className = 'song-item';
                    item.dataset.songId = String(song.id);
                    // Use _sourceAlbum (attached by resolveData) for cover art
                    const sourceAlbum = song._sourceAlbum || window.allSongsMap.get(String(song.id))?.album;
                    const prefix = sourceAlbum && (sourceAlbum.imageUrl || sourceAlbum.albumCover) ? `<img src="${sourceAlbum.imageUrl || sourceAlbum.albumCover}" class="playlist-song-cover">` : `<span class="song-num">${i + 1}</span>`;
                    item.innerHTML = `
                    <div class="bz-swipe-hint"><i class="fas fa-list-ul"></i> Add to Queue</div>
                    <div class="song-item-inner">
                        <div class="song-details">
                            <div class="song-number-wrapper">${prefix}</div>
                            <div class="song-text-details">
                                <span class="song-item-title">${song.title}</span>
                                <span class="song-item-artist">${song.artist}</span>
                            </div>
                        </div>
                        <div class="song-item-right">
                            <span class="song-item-duration">${song.duration}</span>
                            <button class="song-menu-btn" aria-label="Song Options"><i class="fas fa-ellipsis-v"></i></button>
                        </div>
                    </div>`;
                    item.onclick = () => {
                        window._highlightActive = true;
                        window.playingAlbum = window.currentAlbum;
                        window.playSong(i);
                        if (window._bzEnterFullscreenOnSelect) window._bzEnterFullscreenOnSelect();
                        requestAnimationFrame(() => updateActiveSongHighlight());
                    };
                    item.querySelector('.song-menu-btn').onclick = (e) => { e.stopPropagation(); window.openSongMenu(song, e); };

                    // ── Swipe-right → Add to Queue ───────────────────────────
                    (function attachSwipe(el, songRef) {
                        const inner = el.querySelector('.song-item-inner');
                        if (!inner) return;
                        let startX = 0, startY = 0, dx = 0, active = false;
                        const THRESHOLD = 65;

                        el.addEventListener('touchstart', (e) => {
                            startX = e.touches[0].clientX;
                            startY = e.touches[0].clientY;
                            dx = 0; active = true;
                        }, { passive: true });

                        el.addEventListener('touchmove', (e) => {
                            if (!active) return;
                            dx = e.touches[0].clientX - startX;
                            const dy = Math.abs(e.touches[0].clientY - startY);
                            // Cancel if more vertical than horizontal
                            if (dy > Math.abs(dx) * 1.2) { active = false; inner.style.transform = ''; el.classList.remove('bz-swiping'); return; }
                            if (dx > 0) {
                                e.preventDefault();
                                const clamped = Math.min(dx, THRESHOLD * 1.4);
                                inner.style.transform = `translateX(${clamped}px)`;
                                el.classList.toggle('bz-swiping', clamped > 16);
                            }
                        }, { passive: false });

                        el.addEventListener('touchend', (e) => {
                            if (!active) return;
                            active = false;
                            el.classList.remove('bz-swiping');
                            inner.style.transition = 'transform 0.22s cubic-bezier(.22,.68,0,1.2)';
                            inner.style.transform = '';
                            setTimeout(() => { inner.style.transition = ''; }, 240);

                            // FIX: if a real horizontal swipe happened
                            if (dx >= THRESHOLD) {
                                e.stopPropagation();
                                // Add to "Up Next" queue
                                if (window.playingAlbum?.songs) {
                                    const insertAt = (window.currentSongIndex ?? -1) + 1;
                                    const songs = window.playingAlbum.songs;
                                    const alreadyNext = songs[insertAt] && String(songs[insertAt].id) === String(songRef.id);
                                    if (!alreadyNext) {
                                        songs.splice(insertAt, 0, songRef);
                                        if (typeof window.rebuildMasterMap === 'function') window.rebuildMasterMap();
                                        if (typeof window.renderFullscreenQueue === 'function') window.renderFullscreenQueue();
                                    }
                                    if (typeof showToast === 'function') showToast(`"${songRef.title}" will play next`);
                                } else {
                                    if (typeof showToast === 'function') showToast('Start playing a song first to use the queue');
                                }
                            }
                        });
                    })(item, song);

                    list.appendChild(item);
                });
                // Song items are now in the DOM — safe to highlight the active one.
                if (_shouldHighlight) {
                    updateActiveSongHighlight();
                }
                // FIX (unwanted auto-scroll): scrolling to the active row used
                if (highlightPlaying) {
                    // Deliberate request to reveal the playing song — scroll to it.
                    requestAnimationFrame(() => {
                        const activeRow = list.querySelector('.song-item.active');
                        if (activeRow) {
                            activeRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                        albumViewContainer.dataset.bzScrollReady = '1';
                    });
                } else {
                    // FIX: restore the saved scroll position for this album now
                    const _savedAlbumScroll = window._bzGetAlbumScroll(album.id);
                    if (_savedAlbumScroll > 0) {
                        requestAnimationFrame(() => {
                            window.scrollTo({ top: _savedAlbumScroll, behavior: 'instant' });
                            albumViewContainer.dataset.bzScrollReady = '1';
                        });
                    } else {
                        albumViewContainer.dataset.bzScrollReady = '1';
                    }
                }
            }); // end requestAnimationFrame
            albumMainContent.querySelector('.play-album-btn').onclick = () => {
                // If this album is already playing, just toggle play/pause
                if (window.playingAlbum?.id === album.id) {
                    window.togglePlayback();
                } else {
                    // First time opening — load and play from song 0
                    window.playingAlbum = album;
                    window.playSong(0);
                    if (window._bzEnterFullscreenOnSelect) window._bzEnterFullscreenOnSelect();
                    // FIX (shuffle-not-applied-on-new-album bug): Shuffle is a persisted
                    if (window.isShuffling && typeof window._bzShuffleRemainingFromCurrent === 'function') {
                        window._bzShuffleRemainingFromCurrent();
                    }
                }
            };
            albumMainContent.querySelector('.delete-playlist-btn')?.addEventListener('click', () => window.handleDeletePlaylist(album.id));
            /* ── Back button ── */
            albumMainContent.querySelector('#bz-album-back-btn')?.addEventListener('click', () => {
                // history.back() works when the user navigated here within the SPA.
                if (window._bzSpaNavDepth > 0) {
                    history.back();
                } else {
                    // Cold refresh: go back to whatever tab opened this album
                    const navFrom = history.state?.navFrom || 'home';
                    const _savedScrollY = window.scrollPositions[navFrom]
                        || parseInt(localStorage.getItem('beatZen_scroll_' + navFrom) || '0', 10);
                    if (navFrom === 'playlists' && typeof displayPlaylists === 'function') {
                        history.replaceState({ view: 'playlists', scrollY: _savedScrollY }, '', '#playlists');
                        displayPlaylists(true);
                    } else if (typeof displayHome === 'function') {
                        history.replaceState({ view: 'home', scrollY: _savedScrollY }, '', '#home');
                        displayHome(true);
                    }
                }
            });
            /* ── Album nav three-dot dropdown ── */
            (function wireAlbumNavDots() {
                const dotsBtn = albumMainContent.querySelector('#bz-album-nav-dots-btn');
                if (!dotsBtn) return;

                // Inject dropdown styles once
                if (!document.getElementById('bz-album-dots-style')) {
                    const st = document.createElement('style');
                    st.id = 'bz-album-dots-style';
                    st.textContent = `
                        .bz-album-dots-menu {
                            position: fixed;
                            background: rgba(22,22,38,0.97);
                            backdrop-filter: blur(16px);
                            -webkit-backdrop-filter: blur(16px);
                            border: 1px solid rgba(255,255,255,0.11);
                            border-radius: 13px;
                            box-shadow: 0 10px 40px rgba(0,0,0,0.55);
                            z-index: 99999;
                            min-width: 200px;
                            overflow: hidden;
                            animation: bzDotMenuIn 0.15s cubic-bezier(0.2,0.8,0.4,1) both;
                        }
                        @keyframes bzDotMenuIn {
                            from { opacity:0; transform:scale(0.94) translateY(-6px); }
                            to   { opacity:1; transform:scale(1) translateY(0); }
                        }
                        .bz-album-dots-item {
                            display: flex;
                            align-items: center;
                            gap: 10px;
                            width: 100%;
                            padding: 13px 16px;
                            border: none;
                            background: none;
                            color: #fff;
                            font-size: 0.84rem;
                            font-weight: 500;
                            font-family: inherit;
                            cursor: pointer;
                            text-align: left;
                            transition: background 0.14s;
                            white-space: nowrap;
                        }
                        .bz-album-dots-item:hover { background: rgba(255,255,255,0.08); }
                        .bz-album-dots-item:active { background: rgba(255,255,255,0.13); }
                        .bz-album-dots-item i { width: 16px; text-align: center; opacity: 0.8; }
                    `;
                    document.head.appendChild(st);
                }

                function closeDotsMenu() {
                    document.getElementById('bz-album-dots-dropdown')?.remove();
                    document.removeEventListener('click', closeDotsMenu, true);
                }

                dotsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();

                    // Toggle — close if already open
                    if (document.getElementById('bz-album-dots-dropdown')) { closeDotsMenu(); return; }

                    const dropdown = document.createElement('div');
                    dropdown.id = 'bz-album-dots-dropdown';
                    dropdown.className = 'bz-album-dots-menu';

                    // Already saved as a user playlist?
                    const alreadySaved = (() => {
                        try {
                            const saved = JSON.parse(localStorage.getItem('beatZen_importedPlaylists') || '[]');
                            return saved.some(pl => pl._sourceAlbumId === String(album.id));
                        } catch (_) { return false; }
                    })();

                    // "Share Album" removed — only Save as Playlist remains
                    dropdown.innerHTML = `
                        <button class="bz-album-dots-item" id="bz-adots-save">
                            <i class="fas fa-plus-circle"></i> Save as Playlist
                        </button>`;

                    // Position below the dots button using its current viewport rect
                    const rect = dotsBtn.getBoundingClientRect();
                    dropdown.style.top = (rect.bottom + 6) + 'px';
                    dropdown.style.right = (window.innerWidth - rect.right) + 'px';
                    document.body.appendChild(dropdown);

                    // FIX: Close the dropdown whenever the page scrolls so the menu never
                    const _scrollClose = () => closeDotsMenu();
                    window.addEventListener('scroll', _scrollClose, { passive: true, once: true });

                    // Close on outside click
                    setTimeout(() => document.addEventListener('click', closeDotsMenu, true), 10);

                    // ── Save as Playlist ──
                    dropdown.querySelector('#bz-adots-save').addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        closeDotsMenu();
                        window.bzInput('playlist', 'Save as Playlist', album.title || 'My Playlist', (name) => {
                            if (!name) return;
                            // Check for duplicate name
                            const existing = JSON.parse(localStorage.getItem('beatZen_importedPlaylists') || '[]');
                            if (existing.some(pl => pl.name.toLowerCase() === name.toLowerCase())) {
                                window.bzAlert('warning', 'Already Exists', `A playlist named "${name}" already exists. Choose a different name.`);
                                return;
                            }
                            const pl = {
                                id: 'user-' + Date.now(),
                                name,
                                title: name,
                                albumCover: album.imageUrl || album.albumCover || 'https://res.cloudinary.com/beatzenapp/image/upload/v1782654641/Logo_kmpfjf.jpg',
                                songs: (album.songs || []).map(s => ({ ...s })),
                                type: 'Playlist',
                                isImported: true,
                                createdAt: Date.now(),
                                _sourceAlbumId: String(album.id)
                            };
                            window.masterPool.push(pl);
                            if (typeof window.rebuildMasterMap === 'function') window.rebuildMasterMap();
                            if (typeof window.syncPlaylistData === 'function') window.syncPlaylistData();
                            showToast(`✓ "${name}" saved to your Playlists`);
                        });
                    });
                });
            })();
            if (!isBack) { window._bzSpaNavDepth++; history.pushState({ view: 'album', albumId: album.id, navFrom: navOverride || callerView || 'home', scrollY: callerScrollY }, album.title, `#album-${album.id}`); }
            // When user intentionally opens an album
            localStorage.removeItem('beatZen_activeView');
            updateNav(navOverride || 'home');
            // Highlight the active song whenever the caller explicitly requests it
            const _isPlayingAlbum = window.playingAlbum != null &&
                String(window.playingAlbum.id) === String(album.id) &&
                window.currentSongIndex >= 0;
            const _shouldHighlight = !!highlightPlaying || _isPlayingAlbum;
            window._highlightActive = _shouldHighlight;
            if (!_shouldHighlight) {
                document.querySelectorAll('.song-item').forEach(el => el.classList.remove('active'));
            }
            updateDynamicTitle();
        }
        window.selectAlbum = selectAlbum;

        // HIGHLIGHT
        function updateActiveSongHighlight() {
            document.querySelectorAll('.song-item').forEach(el => el.classList.remove('active'));
            if (!window._highlightActive) return;

            const song = window.playingAlbum?.songs?.[window.currentSongIndex];
            const playingSongId = song?.id != null ? String(song.id) : null;
            if (!playingSongId) return;

            /* Highlight EVERY song-item across ALL open lists that matches */
            let _firstActiveRow = null;
            document.querySelectorAll(`.song-item[data-song-id="${playingSongId}"]`)
                .forEach(el => {
                    el.classList.add('active');
                    if (!_firstActiveRow) _firstActiveRow = el;
                });

            // Auto-scroll the active row(s) to center
            const _shouldAutoScroll = !!window._bzScrollToActive;
            window._bzScrollToActive = false;
            if (_firstActiveRow && _shouldAutoScroll) {
                if (window._bzScrollRaf) cancelAnimationFrame(window._bzScrollRaf);
                window._bzScrollRaf = requestAnimationFrame(() => {
                    window._bzScrollRaf = null;
                    _firstActiveRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                });
            }

            /* ── Highlight in history preview list ── */
            document.querySelectorAll('.bz-history-item.bzh-playing, .bzh-full-row.bzh-playing')
                .forEach(el => el.classList.remove('bzh-playing'));

            /* Preview list — match by data-history-id attribute */
            document.querySelectorAll('.bz-history-item[data-history-id]').forEach(el => {
                if (el.dataset.historyId === playingSongId) {
                    el.classList.add('bzh-playing');
                }
            });

            // Full overlay
            document.querySelectorAll('.bzh-full-row[data-history-id]').forEach(el => {
                if (el.dataset.historyId === playingSongId) {
                    el.classList.add('bzh-playing');
                    if (_shouldAutoScroll) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }
            });
        }
        /* Export so external modules */
        window.updateActiveSongHighlight = updateActiveSongHighlight;

        // PERSISTENT HIGHLIGHT SAFETY NET — Any view re-render
        (function () {
            let _highlightRaf = null;
            const observer = new MutationObserver((mutations) => {
                if (!window._highlightActive) return;
                // Only react if song-row-like nodes were actually added
                const relevant = mutations.some(m =>
                    Array.from(m.addedNodes).some(n =>
                        n.nodeType === 1 && (
                            n.matches?.('.song-item, .bz-history-item, .bzh-full-row') ||
                            n.querySelector?.('.song-item, .bz-history-item, .bzh-full-row')
                        )
                    )
                );
                if (!relevant) return;
                if (_highlightRaf) return;
                _highlightRaf = requestAnimationFrame(() => {
                    _highlightRaf = null;
                    updateActiveSongHighlight();
                });
            });
            observer.observe(document.body, { childList: true, subtree: true });
        })();

        /* PLAYLIST DELETE */
        let playlistToDelete = null;
        window.handleDeletePlaylist = function (id) {
            playlistToDelete = id;
            const popup = document.getElementById('delete-confirm-popup');
            if (popup) { popup.style.display = 'flex'; popup.classList.add('visible'); }
        };
        document.getElementById('cancel-delete-btn')?.addEventListener('click', () => {
            const popup = document.getElementById('delete-confirm-popup');
            if (popup) popup.style.display = 'none';
            playlistToDelete = null;
        });
        document.getElementById('confirm-delete-btn')?.addEventListener('click', () => {
            if (!playlistToDelete) return;
            // If the playlist being deleted is currently playing
            if (String(window.playingAlbum?.id) === String(playlistToDelete)) {
                stopAndReset();
                window.playingAlbum = null;
                const titleEl = document.getElementById('player-song-title');
                const artistEl = document.getElementById('player-song-artist');
                const coverEl = document.getElementById('player-album-cover');
                if (titleEl) titleEl.textContent = 'Select a song to play';
                if (artistEl) artistEl.textContent = '';
                if (coverEl) coverEl.src = 'https://res.cloudinary.com/beatzenapp/image/upload/v1782654641/Logo_kmpfjf.jpg';
                showToast('Playlist deleted — playback stopped');
            }
            window.masterPool = window.masterPool.filter(a => String(a.id) !== String(playlistToDelete));
            const saved = JSON.parse(localStorage.getItem('beatZen_importedPlaylists') || '[]');
            localStorage.setItem('beatZen_importedPlaylists', JSON.stringify(saved.filter(pl => String(pl.id) !== String(playlistToDelete))));
            document.getElementById('card-' + playlistToDelete)?.remove();
            const popup = document.getElementById('delete-confirm-popup');
            if (popup) popup.style.display = 'none';
            hideAllViews();
            displayPlaylists();
            playlistToDelete = null;
        });

        /* SEARCH — RECENT SEARCHES */
        function isRecentSearchesEnabled() {
            /* Default ON if never set */
            const val = localStorage.getItem(RECENT_SEARCHES_ENABLED_KEY);
            return val === null ? true : val === 'true';
        }

        function getRecentSearches() {
            try { return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]'); } catch (e) { return []; }
        }

        function saveRecentSearch(q) {
            if (!isRecentSearchesEnabled()) return;
            if (!q || q.length < 2) return;
            let searches = getRecentSearches().filter(s => s.toLowerCase() !== q.toLowerCase());
            searches.unshift(q);
            searches = searches.slice(0, MAX_RECENT_SEARCHES);
            localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
        }

        function renderRecentSearches() {
            document.getElementById('recent-searches-panel')?.remove();
            if (!isRecentSearchesEnabled()) return;
            const searches = getRecentSearches();
            if (!searches.length) return;
            const wrapper = document.querySelector('.search-bar-wrapper');
            if (!wrapper) return;

            const panel = document.createElement('div');
            panel.id = 'recent-searches-panel';

            panel.innerHTML = searches.map((s, i) => `
            <div class="rs-item" data-idx="${i}">
                <i class="fas fa-clock-rotate-left rs-icon"></i>
                <span class="rs-text">${s}</span>
                <i class="fas fa-times rs-remove" data-idx="${i}" title="Remove"></i>
            </div>`).join('') +
                `<div class="rs-footer">
                <span class="rs-clear-all" id="rs-clear-all-btn">Clear all</span>
            </div>`;

            wrapper.appendChild(panel);

            /* Click on a row — fill search bar and execute */
            panel.querySelectorAll('.rs-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    if (e.target.classList.contains('rs-remove') || e.target.closest('.rs-remove')) return;
                    const q = searches[+item.dataset.idx];
                    actualSearchBar.value = q;
                    clearSearchBtn.style.display = 'block';
                    panel.remove();
                    executeSearchLogic(q.toLowerCase().trim());
                });
            });

            /* Remove individual item */
            panel.querySelectorAll('.rs-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = +btn.dataset.idx;
                    searches.splice(idx, 1);
                    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
                    renderRecentSearches();
                });
            });

            /* Clear all */
            panel.querySelector('#rs-clear-all-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify([]));
                panel.remove();
                if (typeof window.bzImmediateUpload === 'function') window.bzImmediateUpload();
            });
        }

        actualSearchBar.addEventListener('focus', () => {
            if (!actualSearchBar.value.trim()) renderRecentSearches();
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#search-container') && !e.target.closest('#recent-searches-panel')) {
                document.getElementById('recent-searches-panel')?.remove();
            }
        });

        clearSearchBtn.onclick = () => {
            actualSearchBar.value = '';
            searchResultsContainer.innerHTML = '';
            clearSearchBtn.style.display = 'none';
            actualSearchBar.focus();
            renderRecentSearches();
        };

        let searchTimeout = null;
        actualSearchBar.oninput = (e) => {
            const q = e.target.value.toLowerCase().trim();
            clearSearchBtn.style.display = q ? 'block' : 'none';
            clearTimeout(searchTimeout);
            document.getElementById('recent-searches-panel')?.remove();
            searchTimeout = setTimeout(() => executeSearchLogic(q), 300);
        };

        function executeSearchLogic(q) {
            searchResultsContainer.innerHTML = '';
            searchResultsContainer.style.display = 'block';
            if (!q) return;
            const sw = q.split(/\s+/);
            const MAX = 8;
            const matchesStart = (str) => {
                if (!str) return false;
                return sw.some(w => str.toLowerCase().split(/\s+/).some(tw => tw.startsWith(w)));
            };
            const mt = {
                y: allYears.filter(y => sw.some(w => y.startsWith(w))).slice(0, 5),
                a: Object.values(customArtistsData).flat().filter(art => matchesStart(art.name)).slice(0, MAX),
                h: Object.values(typeof customHeroesData !== 'undefined' ? customHeroesData : {}).flat().filter(hero => matchesStart(hero.name)).slice(0, MAX),
                c: Object.keys(customGenreData || {}).filter(key => matchesStart(customGenreData[key]?.name || key)).slice(0, MAX),
                p: JSON.parse(localStorage.getItem('beatZen_importedPlaylists') || '[]').filter(pl => matchesStart(pl.name || pl.title)).slice(0, MAX),
                al: allAlbums.filter(alb => matchesStart(alb.title)).slice(0, MAX),
                s: Array.from(window.allSongsMap.values()).filter(s => matchesStart(s.title)).slice(0, MAX)
            };
            const mkSec = (title) => { const s = document.createElement('div'); s.className = 'year-section'; s.innerHTML = `<h2>${title}</h2><div class="albums-grid"></div>`; return s; };
            if (mt.y.length) {
                const sec = mkSec('Years'), grid = sec.querySelector('.albums-grid');
                mt.y.forEach(y => { const b = document.createElement('a'); b.className = 'year-button'; b.textContent = y; b.onclick = () => { hideAllViews(); displayHome(false, y); }; grid.appendChild(b); });
                searchResultsContainer.appendChild(sec);
            }
            if (mt.a.length) {
                const sec = mkSec('Artists'), grid = sec.querySelector('.albums-grid');
                mt.a.forEach(art => grid.appendChild(renderCard(art.name, art.imageUrl, () => { hideAllViews(); selectAlbum(resolveData(art, "Artist")); }, art.id)));
                searchResultsContainer.appendChild(sec);
            }
            if (mt.h.length) {
                const sec = mkSec('Heroes'), grid = sec.querySelector('.albums-grid');
                mt.h.forEach(hero => {
                    const heroSongs = (typeof window.bzResolveHeroSongs === 'function') ? window.bzResolveHeroSongs(hero.name) : [];
                    grid.appendChild(renderCard(hero.name, hero.imageUrl, () => { hideAllViews(); selectAlbum(resolveData({ ...hero, songs: heroSongs }, "Hero")); }, hero.id));
                });
                searchResultsContainer.appendChild(sec);
            }
            if (mt.c.length) {
                const sec = mkSec('Explore'), grid = sec.querySelector('.albums-grid');
                mt.c.forEach(key => { const col = customGenreData[key]; grid.appendChild(renderCard(col?.name || key, col?.albumCover, () => { hideAllViews(); selectAlbum(resolveData(col, "Collection")); }, key)); });
                searchResultsContainer.appendChild(sec);
            }
            if (mt.p.length) {
                const sec = mkSec('Playlists'), grid = sec.querySelector('.albums-grid');
                mt.p.forEach(pl => grid.appendChild(renderCard(pl.name || pl.title, pl.albumCover || pl.imageUrl, () => { hideAllViews(); selectAlbum(resolveData(pl, "Playlist")); }, pl.id)));
                searchResultsContainer.appendChild(sec);
            }
            if (mt.al.length) {
                const sec = mkSec('Albums'), grid = sec.querySelector('.albums-grid');
                mt.al.forEach(alb => grid.appendChild(renderCard(alb.title, alb.imageUrl, () => { hideAllViews(); selectAlbum(resolveData(alb, "Movie")); }, alb.id)));
                searchResultsContainer.appendChild(sec);
            }
            if (mt.s.length) {
                const sec = mkSec('Songs'), list = document.createElement('div');
                list.className = 'songs-list';
                mt.s.forEach(s => {
                    const item = document.createElement('div');
                    item.className = 'song-item';
                    item.innerHTML = `<div class="song-details"><img src="${s.album?.imageUrl || s.album?.albumCover || ''}" class="playlist-song-cover"><div class="song-text-details"><span class="song-item-title">${s.title}</span><span class="song-item-artist">${s.artist}</span></div></div>`;
                    item.onclick = () => {
                        hideAllViews();
                        const data = resolveData(s.album, s.album?.type || "Movie");

                        // FIX: Queue cleanup on search-song click
                        window._bzAutoMixStartIndex = -1;
                        window._bzOriginalQueue = null;
                        window._bzOriginalAutoMixBoundary = undefined;
                        window._bzPreRepeatQueue = null;
                        window._bzPreRepeatAutoMixBoundary = undefined;
                        window._bzPreRepeatAllQueue = null;
                        window._bzSourceSongCount = 0; // reset so playSong re-captures for new album
                        if (window._bzAmUsedIds instanceof Set) window._bzAmUsedIds.clear();

                        /* Force-update the tracking id so playSong's own guard stays in sync */
                        window._bzCurrentPlayingAlbumId = String(data.id);

                        // If shuffle was active for the previous album
                        if (window.isShuffling) {
                            window._bzOriginalQueue = null;           // already nulled above
                            // Re-apply syncPlaybackModesUI so the shuffle button reflects
                            if (typeof window.syncPlaybackModesUI === 'function') {
                                window.syncPlaybackModesUI();
                            }
                        }

                        window.playingAlbum = data;
                        selectAlbum(data, /*highlightPlaying=*/true);

                        const songIdx = data.songs.findIndex(x => String(x.id) === String(s.id));
                        window.playSong(songIdx >= 0 ? songIdx : 0);
                        if (window._bzEnterFullscreenOnSelect) window._bzEnterFullscreenOnSelect();

                        // Record 'search_after' signal
                        try {
                            const BZ_SIGNALS_KEY = 'beatZen_signals';
                            let signals = [];
                            try { signals = JSON.parse(localStorage.getItem(BZ_SIGNALS_KEY) || '[]'); } catch (_) { /* ignore */ }
                            signals.unshift({ id: String(s.id), signal: 'search_after', ts: Date.now() });
                            signals = signals.slice(0, 500);
                            localStorage.setItem(BZ_SIGNALS_KEY, JSON.stringify(signals));
                        } catch (_saErr) { /* silent — never break playback */ }
                    };
                    list.appendChild(item);
                });
                sec.appendChild(list); searchResultsContainer.appendChild(sec);
            }
            if (!mt.y.length && !mt.a.length && !mt.h.length && !mt.c.length && !mt.p.length && !mt.al.length && !mt.s.length) {
                searchResultsContainer.innerHTML = `<div class="no-results">No matches for "${q}"</div>`;
            } else {
                saveRecentSearch(q);
            }
        }

        // TRANSPORT
        if (!nextBtn._bzOnclickWired) {
            nextBtn.onclick = (e) => { e.stopPropagation(); if (window.playNextSong) window.playNextSong(); };
            nextBtn._bzOnclickWired = true;
        }
        if (!prevBtn._bzOnclickWired) {
            prevBtn.onclick = (e) => { e.stopPropagation(); if (window.playPrevSong) window.playPrevSong(); };
            prevBtn._bzOnclickWired = true;
        }
        if (!playPauseBtn._bzOnclickWired) {
            playPauseBtn.onclick = (e) => { e.stopPropagation(); if (window.togglePlayback) window.togglePlayback(); };
            playPauseBtn._bzOnclickWired = true;
        }

        // Guard touchend handlers
        function _bzRetryCall(fn, attempts) {
            if (typeof fn === 'function') { fn(); return; }
            if (attempts > 0) setTimeout(() => _bzRetryCall(fn, attempts - 1), 80);
        }
        [
            [nextBtn, () => _bzRetryCall(window.playNextSong, 3)],
            [prevBtn, () => _bzRetryCall(window.playPrevSong, 3)],
            [playPauseBtn, () => _bzRetryCall(window.togglePlayback, 3)],
        ].forEach(([btn, handler]) => {
            if (!btn || btn._bzTouchWired) return;
            btn._bzTouchWired = true;
            btn.addEventListener('touchend', (e) => {
                e.stopPropagation(); // prevent swipe engine from seeing this touch
                e.preventDefault();  // prevent delayed synthetic click
                handler();
            }, { passive: false });
        });

        /* Mini play/pause button (mobile mini-player) */
        const miniPlayPauseBtn = document.getElementById('mini-play-pause-btn');
        if (miniPlayPauseBtn && !miniPlayPauseBtn._bzTouchWired) {
            miniPlayPauseBtn._bzTouchWired = true;
            miniPlayPauseBtn.onclick = (e) => { e.stopPropagation(); _bzRetryCall(window.togglePlayback, 3); };
            miniPlayPauseBtn.addEventListener('touchend', (e) => {
                e.stopPropagation();
                e.preventDefault();
                // FIX: retry if togglePlayback isn't ready yet (cold refresh race)
                _bzRetryCall(window.togglePlayback, 3);
            }, { passive: false });
        }

        /* PLAYBACK MODES */
        window.syncPlaybackModesUI = function () {
            const sBtns = document.querySelectorAll('#shuffle-btn');
            sBtns.forEach(btn => {
                btn.classList.toggle('active', !!window.isShuffling);
            });
            const lBtns = document.querySelectorAll('#loop-btn');
            lBtns.forEach(btn => {
                const mode = window.repeatMode || 0;
                btn.classList.toggle('active', mode !== 0);
                btn.classList.toggle('repeat-one', mode === 2);
                const label = mode === 2 ? 'Repeat One' : (mode === 1 ? 'Repeat All' : 'Repeat');
                btn.title = label;
                btn.setAttribute('aria-label', 'Toggle Repeat Mode: ' + label);
            });
        };
        /* Apply restored state immediately so buttons reflect saved preference */
        window.syncPlaybackModesUI();

        /* Exposed global toggles */
        // FIX (shuffle-not-applied-on-new-album bug): pulled the reorder logic
        function _bzShuffleRemainingFromCurrent() {
            if (!(window.playingAlbum?.songs && window.currentSongIndex >= 0)) return;
            const ci = window.currentSongIndex;
            const songs = window.playingAlbum.songs;

            // ── Save original remaining queue + AutoMix boundary ──────────
            window._bzOriginalQueue = songs.slice(ci + 1);
            window._bzOriginalAutoMixBoundary = window._bzAutoMixStartIndex ?? -1;

            // Shuffle remaining SOURCE songs and already-queued AutoMix songs as two
            const bnd = window._bzAutoMixStartIndex;
            const hasAutoMix = bnd !== undefined && bnd !== null && bnd > ci;
            const splitAt = hasAutoMix ? bnd : songs.length;

            const sourceRemaining = songs.slice(ci + 1, splitAt);
            const autoMixRemaining = songs.slice(splitAt);

            const shuffleInPlace = (arr) => {
                for (let i = arr.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [arr[i], arr[j]] = [arr[j], arr[i]];
                }
                return arr;
            };
            shuffleInPlace(sourceRemaining);
            shuffleInPlace(autoMixRemaining);

            songs.splice(ci + 1, songs.length - ci - 1, ...sourceRemaining, ...autoMixRemaining);

            // ── Boundary sits right after the (now-shuffled) source segment ──
            window._bzAutoMixStartIndex = hasAutoMix ? (ci + 1 + sourceRemaining.length) : -1;

            if (typeof window.renderFullscreenQueue === 'function') {
                window.renderFullscreenQueue();
            }
        }
        window._bzShuffleRemainingFromCurrent = _bzShuffleRemainingFromCurrent;

        window.toggleShuffle = function () {
            window.isShuffling = !window.isShuffling;
            localStorage.setItem('beatZen_shuffle', window.isShuffling);

            if (window.playingAlbum?.songs && window.currentSongIndex >= 0) {
                const ci = window.currentSongIndex;
                const songs = window.playingAlbum.songs;

                if (window.isShuffling) {
                    _bzShuffleRemainingFromCurrent();
                } else {
                    // ── Restore original queue order and AutoMix boundary ─────────
                    if (window._bzOriginalQueue) {
                        songs.splice(ci + 1, songs.length - ci - 1, ...window._bzOriginalQueue);
                        window._bzOriginalQueue = null;
                    }
                    if (window._bzOriginalAutoMixBoundary !== undefined) {
                        window._bzAutoMixStartIndex = window._bzOriginalAutoMixBoundary;
                        window._bzOriginalAutoMixBoundary = undefined;
                    }
                }

                if (typeof window.renderFullscreenQueue === 'function') {
                    window.renderFullscreenQueue();
                }
            }

            window.syncPlaybackModesUI();
        };
        window.toggleLoop = function () {
            // Cycle: 0 (off) → 1 (repeat all) → 2 (repeat one) → 0
            const prev = window.repeatMode || 0;
            const next = (prev + 1) % 3;
            window.repeatMode = next;
            window.isLooping = next === 2; // legacy compat
            localStorage.setItem('beatZen_repeat_mode', String(next));
            localStorage.setItem('beatZen_loop', String(next === 2)); // legacy compat key

            if (window.playingAlbum?.songs && window.currentSongIndex >= 0) {
                const ci = window.currentSongIndex;
                const songs = window.playingAlbum.songs;

                if (next === 2) {
                    // Entering repeat-one: save remaining queue, leave only current song
                    window._bzPreRepeatQueue = songs.slice(ci + 1);
                    window._bzPreRepeatAutoMixBoundary = window._bzAutoMixStartIndex ?? -1;
                    songs.splice(ci + 1);          // queue now contains only the current song
                    window._bzAutoMixStartIndex = -1;
                } else if (prev === 2) {
                    // ── Leaving repeat-one (→ OFF): restore saved queue tail ──
                    if (window._bzPreRepeatQueue) {
                        songs.splice(ci + 1, 0, ...window._bzPreRepeatQueue);
                        window._bzPreRepeatQueue = null;
                    }
                    if (window._bzPreRepeatAutoMixBoundary !== undefined) {
                        window._bzAutoMixStartIndex = window._bzPreRepeatAutoMixBoundary;
                        window._bzPreRepeatAutoMixBoundary = undefined;
                    }
                    // Also restore the queue snapshot saved when we entered repeat-all
                    if (window._bzPreRepeatAllQueue?.length) {
                        songs.push(...window._bzPreRepeatAllQueue);
                        window._bzPreRepeatAllQueue = null;
                    }
                } else if (next === 1) {
                    // Entering repeat-all (OFF → 1): immediately remove any
                    const srcCount = window._bzSourceSongCount;
                    if (srcCount > 0 && songs.length > srcCount) {
                        window._bzPreRepeatAllQueue = songs.splice(srcCount);
                        if (typeof window.rebuildMasterMap === 'function') window.rebuildMasterMap();
                    }
                }
                // Note: 1 → 0 direct is unreachable via the (prev+1)%3 cycle.

                if (typeof window.renderFullscreenQueue === 'function') {
                    window.renderFullscreenQueue();
                }
            }

            window.syncPlaybackModesUI();
        };

        // Wire buttons directly
        function wireModeButtons() {
            const sBtn = document.getElementById('shuffle-btn');
            const lBtn = document.getElementById('loop-btn');
            const shareBtn = document.getElementById('fs-share-btn'); // fullscreen-only Share button
            // Always re-assign onclick on each call
            if (sBtn) sBtn.onclick = (e) => { e.stopPropagation(); if (window.toggleShuffle) window.toggleShuffle(); sBtn.blur(); };
            if (lBtn) lBtn.onclick = (e) => { e.stopPropagation(); if (window.toggleLoop) window.toggleLoop(); lBtn.blur(); };
            if (shareBtn) shareBtn.onclick = (e) => {
                e.stopPropagation();
                const song = (typeof _bzGetPlayingSong === 'function') ? _bzGetPlayingSong() : (window.playingAlbum?.songs?.[window.currentSongIndex] || null);
                if (song) window.openShareSongModal?.(song);
                shareBtn.blur();
            };
        }
        wireModeButtons();
        // Re-wire after all deferred scripts have loaded
        window.addEventListener('load', () => {
            wireModeButtons();
            if (window.syncPlaybackModesUI) window.syncPlaybackModesUI();
        });

        /* Currently playing song helper */
        function _bzGetPlayingSong() {
            return window.playingAlbum?.songs?.[window.currentSongIndex] || null;
        }

        /* MAXIMIZE */
        function toggleMaximize(isBack = false) {
            const mp = document.getElementById('main-player');
            if (!mp) return;

            if (!mp.classList.contains('maximized')) {
                mp.classList.add('maximized');
                document.body.style.overflow = 'hidden';

                if (window.location.hash !== '#player') { window._bzSpaNavDepth++; history.pushState({ view: 'fullscreen-player' }, 'Player', '#player'); }
            } else {
                mp.classList.remove('maximized');
                document.body.style.overflow = '';
                // FIX: only call history.back() when the URL is actually #player.
                if (!isBack && window.location.hash === '#player') history.back();
            }
        }

        // Expose toggleMaximize globally so the popstate handler
        window._bzToggleMaximize = toggleMaximize;
        if (maximizeBtn) maximizeBtn.onclick = (e) => { e.stopPropagation(); if (window.playingAlbum) toggleMaximize(); };
        if (minimizeBtn) minimizeBtn.onclick = (e) => { e.stopPropagation(); toggleMaximize(); };

        // Selecting/playing a song from a list
        window._bzEnterFullscreenOnSelect = function () {
            // intentionally does nothing
        };

        // Clicking the album art or song info area opens fullscreen. All control
        if (mainPlayer) {
            mainPlayer.addEventListener('click', (e) => {
                /* Already maximized — ignore (minimize-btn handles close) */
                if (mainPlayer.classList.contains('maximized')) return;
                // Only trigger fullscreen if clicking directly on the album-cover
                const clickedCover = e.target.closest('#player-album-cover, .player-cover-wrap, .player-song-info, #player-song-title, #player-song-artist');
                if (!clickedCover) return;
                // FIX: if playingAlbum isn't ready yet
                if (!window.playingAlbum) {
                    setTimeout(() => { if (window.playingAlbum) toggleMaximize(); }, 350);
                    return;
                }
                toggleMaximize();
            });
        }

        /* ── FULLSCREEN THREE-DOT MENU ── */
        const fsMenuBtn = document.getElementById('fs-menu-btn');
        const fsMenuDropdown = document.getElementById('fs-menu-dropdown');
        const fsGotoAlbumBtn = document.getElementById('fs-goto-album-btn');
        const fsGotoPlaylistBtn = document.getElementById('fs-goto-playlist-btn');

        function closeFsMenu() {
            if (!fsMenuDropdown) return;
            fsMenuDropdown.classList.remove('open');
            fsMenuDropdown.setAttribute('aria-hidden', 'true');
        }

        function minimizePlayer() {
            const mp = document.getElementById('main-player');
            if (mp && mp.classList.contains('maximized')) {
                mp.classList.remove('maximized');
                document.body.style.overflow = '';
            }
        }

        /* Show "Go to Playlist" only when playing */
        function updateFsMenuButtons() {
            if (!fsGotoPlaylistBtn) return;
            const type = String(window.playingAlbum?.type || 'movie').toLowerCase();
            fsGotoPlaylistBtn.style.display = (type === 'movie') ? 'none' : '';
        }

        /* ── Go to Album action (shared) ── */
        function doGotoAlbum() {
            window.closePlaylistModal();
            if (!window.playingAlbum) return;
            minimizePlayer();
            const currentSong = window.playingAlbum.songs?.[window.currentSongIndex];
            const songIdStr = currentSong?.id != null ? String(currentSong.id) : null;

            // Resolve the TRUE source album/movie for this song
            const canonicalAlbum = songIdStr ? window.allSongsMap?.get(songIdStr)?.album : null;
            const isMovieType = (a) => !!a && String(a.type || '').toLowerCase() === 'movie';
            const taggedSource = currentSong?._sourceAlbum;
            const playingAlbumMatch = allAlbums.find(a => String(a.id) === String(window.playingAlbum.id))
                || (window.masterPool || []).find(a => String(a.id) === String(window.playingAlbum.id));

            const sourceAlbum = canonicalAlbum
                || (isMovieType(taggedSource) ? taggedSource : null)
                || (isMovieType(playingAlbumMatch) ? playingAlbumMatch : null);

            const albumToOpen = sourceAlbum
                ? resolveData(sourceAlbum, sourceAlbum.type || 'Movie')
                : window.playingAlbum;

            history.replaceState({ view: 'album', albumId: albumToOpen.id }, '', `#album-${albumToOpen.id}`);
            window.lastActiveView = 'home';
            selectAlbum(albumToOpen, true, 'home', true);
        }

        /* ── Go to Playlist action (shared) ── */
        function doGotoPlaylist() {
            window.closePlaylistModal();
            if (!window.playingAlbum) return;
            minimizePlayer();

            const currentSong = window.playingAlbum.songs?.[window.currentSongIndex];

            // FIX: previously this also consulted allSongsMap's canonicalAlbum first
            const sourceAlbum = currentSong?._sourceAlbum || null;

            // If this song's real source (Queue/AutoMix injected) differs
            const sourceIsDifferent = sourceAlbum && String(sourceAlbum.id) !== String(window.playingAlbum.id);
            const sourceType = String(sourceAlbum?.type || '').toLowerCase();
            const targetAlbum = (sourceIsDifferent && sourceType !== 'movie' && sourceType !== '')
                ? resolveData(sourceAlbum, sourceAlbum.type)
                : window.playingAlbum;

            window.lastActiveView = 'playlists';
            displayPlaylists(false);
            setTimeout(() => selectAlbum(targetAlbum, false, 'playlists', true), 80);
        }

        if (fsMenuBtn && fsMenuDropdown) {
            const _fsMenuHandler = (e) => {
                e.stopPropagation();
                e.preventDefault();
                let song = window.playingAlbum?.songs?.[window.currentSongIndex];

                // FIX (mobile): currentSongIndex/playingAlbum can momentarily
                if (!song && audioPlayer?.src && window.allSongsMap) {
                    try {
                        const _decodedSrc = decodeURIComponent(audioPlayer.src);
                        for (const [, mapped] of window.allSongsMap) {
                            if (mapped?.url && (mapped.url === audioPlayer.src || decodeURIComponent(mapped.url) === _decodedSrc)) {
                                song = mapped;
                                break;
                            }
                        }
                    } catch (_) { /* ignore */ }
                }
                if (!song) {
                    if (typeof showToast === 'function') showToast('No song playing yet');
                    return;
                }

                // Open the shared context menu
                window.openSongMenu(song, e);

                // After the menu renders, inject fullscreen-specific navigation buttons
                requestAnimationFrame(() => {
                    const opts = document.getElementById('modal-main-options');
                    if (!opts) return;

                    // Remove any previously injected fs-nav buttons to avoid duplicates
                    opts.querySelectorAll('.bz-fs-nav-btn').forEach(b => b.remove());

                    const type = String(window.playingAlbum?.type || 'movie').toLowerCase();
                    const isMovie = type === 'movie' || type === '' || !type;
                    // FIX: also show "Go to Playlist" when the CURRENT SONG
                    const taggedType = String(song?._sourceAlbum?.type || '').toLowerCase();
                    const hasPlaylistSource = !!taggedType && taggedType !== 'movie';
                    const showGotoPlaylist = !isMovie || hasPlaylistSource;

                    // ── Go to Album (always shown in fullscreen) ──
                    const gotoAlbumBtn = document.createElement('button');
                    gotoAlbumBtn.className = 'bz-fs-nav-btn';
                    gotoAlbumBtn.innerHTML = '<i class="fas fa-compact-disc"></i> Go to Album';
                    gotoAlbumBtn.onclick = () => doGotoAlbum();
                    opts.appendChild(gotoAlbumBtn);

                    // Go to Playlist
                    if (showGotoPlaylist) {
                        const gotoPlBtn = document.createElement('button');
                        gotoPlBtn.className = 'bz-fs-nav-btn';
                        gotoPlBtn.innerHTML = '<i class="fas fa-list-ul"></i> Go to Playlist';
                        gotoPlBtn.onclick = () => doGotoPlaylist();
                        opts.appendChild(gotoPlBtn);
                    }

                });
            };

            fsMenuBtn.onclick = _fsMenuHandler;
            // FIX (mobile): some mobile browsers swallow the synthetic click
            fsMenuBtn.addEventListener('touchend', (e) => {
                e.stopPropagation();
                e.preventDefault();
                _fsMenuHandler(e);
            }, { passive: false });
        }

        /* Keep old fsGotoAlbumBtn / fsGotoPlaylistBtn wired for any legacy */
        if (fsGotoAlbumBtn) fsGotoAlbumBtn.onclick = (e) => { e.stopPropagation(); doGotoAlbum(); };
        if (fsGotoPlaylistBtn) fsGotoPlaylistBtn.onclick = (e) => { e.stopPropagation(); doGotoPlaylist(); };

        /* KEYBOARD SHORTCUTS */
        // Shortcut cheat sheet modal
        function showShortcutsCheatSheet() {
            const existing = document.getElementById('bz-shortcuts-popup');
            if (existing) { existing.remove(); return; }
            const modal = document.createElement('div');
            modal.id = 'bz-shortcuts-popup';
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);';
            modal.innerHTML = `<div style="background:var(--card-bg,#1a1a1a);border:1px solid rgba(255,255,255,0.12);border-radius:18px;padding:24px 20px;max-width:380px;width:100%;max-height:80vh;overflow-y:auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
                <h3 style="margin:0;font-size:1.1rem;display:flex;align-items:center;gap:8px;"><i class="fas fa-keyboard" style="color:var(--primary-color,#2575fc);"></i> Keyboard Shortcuts</h3>
                <button id="bz-shortcuts-close" style="background:transparent;border:none;color:rgba(255,255,255,0.5);font-size:1.2rem;cursor:pointer;padding:4px 8px;"><i class="fas fa-times"></i></button>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;">
                ${[
                    ['Space', 'Play / Pause'],
                    ['→ Arrow Right', 'Next Song'],
                    ['← Arrow Left', 'Previous Song'],
                    ['↑ Arrow Up', 'Volume Up'],
                    ['↓ Arrow Down', 'Volume Down'],
                    ['M', 'Mute / Unmute'],
                    ['F', 'Fullscreen Player'],
                    ['S', 'Toggle Shuffle'],
                    ['Shift + S', 'Share Song'],
                    ['L', 'Toggle Loop'],
                    ['Shift + L', 'Show / Hide Lyrics'],
                    ['T', 'Open Sleep Timer'],
                    ['Q', 'Open / Close Queue'],
                    ['Escape', 'Close / Exit'],
                ].map(([key, label]) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(255,255,255,0.04);border-radius:10px;">
                    <span style="font-size:0.88rem;opacity:0.8;">${label}</span>
                    <kbd style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:3px 10px;font-size:0.78rem;font-family:monospace;letter-spacing:0.5px;">${key}</kbd>
                </div>`).join('')}
            </div>
        </div>`;
            document.body.appendChild(modal);
            modal.querySelector('#bz-shortcuts-close').onclick = () => modal.remove();
            modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        }
        window.showShortcutsCheatSheet = showShortcutsCheatSheet;

        document.addEventListener('keydown', (e) => {
            if (e.target.closest('input, textarea, select, [contenteditable="true"]')) { if (e.code === 'Escape') e.target.blur(); return; }
            if (e.code === 'Escape') {
                if (mainPlayer.classList.contains('maximized')) toggleMaximize();
                [timerPopup, successPopup, timerEndedPopup].forEach(p => { if (p) { if (p === timerPopup) { _showTimerPopup(false); } else { p.classList.remove('visible'); if (p === successPopup) p.style.display = 'none'; } } });
                document.body.classList.remove('no-scroll');
                const shortcutsPopup = document.getElementById('bz-shortcuts-popup');
                if (shortcutsPopup) { shortcutsPopup.remove(); return; }
                const shareOverlay = document.getElementById('bz-share-overlay');
                if (shareOverlay && typeof window.bzCloseShareModal === 'function') { window.bzCloseShareModal(); return; }
                if (shareOverlay) { shareOverlay.remove(); return; }
                return;
            }
            // Block all shortcuts if the toggle is disabled
            if (localStorage.getItem('beatzen_shortcuts') !== 'true') return;
            switch (e.code) {
                case 'Space': e.preventDefault(); togglePlayback(); break;
                case 'ArrowRight': e.preventDefault(); playNextSong(); break;
                case 'ArrowLeft': e.preventDefault(); playPrevSong(); break;
                case 'ArrowUp': e.preventDefault(); audioPlayer.volume = Math.min(1, parseFloat((audioPlayer.volume + 0.1).toFixed(1))); break;
                case 'ArrowDown': e.preventDefault(); audioPlayer.volume = Math.max(0, parseFloat((audioPlayer.volume - 0.1).toFixed(1))); break;
                case 'KeyM': e.preventDefault(); audioPlayer.muted = !audioPlayer.muted; break;
                case 'KeyF': e.preventDefault(); toggleMaximize(); break;
                case 'KeyS':
                    e.preventDefault();
                    if (e.shiftKey) {
                        const _shareSong = (typeof _bzGetPlayingSong === 'function') ? _bzGetPlayingSong() : (window.playingAlbum?.songs?.[window.currentSongIndex] || null);
                        if (_shareSong) window.openShareSongModal?.(_shareSong);   // Shift+S = Share
                    } else {
                        window.toggleShuffle?.();                                  // S = Shuffle
                    }
                    break;
                case 'KeyL':
                    e.preventDefault();
                    if (e.shiftKey) {
                        // Shift+L = Show/Hide Lyrics
                        const _lo = document.getElementById('bz-lyrics-fullscreen');
                        if (_lo?.classList.contains('active')) {
                            window.bzCloseLyrics?.();
                        } else {
                            const _lyricsSong = (typeof _bzGetPlayingSong === 'function') ? _bzGetPlayingSong() : (window.playingAlbum?.songs?.[window.currentSongIndex] || null);
                            if (_lyricsSong) window.bzOpenLyrics?.(_lyricsSong);
                            else if (typeof showToast === 'function') showToast('No song playing yet');
                        }
                    } else {
                        window.toggleLoop?.();                                  // L = Loop
                    }
                    break;
                case 'KeyT': e.preventDefault(); timerBtn?.click(); break;       // T = Timer popup
                case 'KeyQ': e.preventDefault(); {                               // Q = Queue
                    const _qo = document.getElementById('bz-queue-fullscreen');
                    if (_qo?.classList.contains('active')) window.bzCloseQueue?.();
                    else window.bzOpenQueue?.();
                    break;
                }
            }
        });

        /* POPUP OVERLAY CLOSE */
        document.addEventListener('mousedown', (e) => {
            [{ el: timerPopup, trigger: timerBtn }, { el: successPopup }, { el: timerEndedPopup }].forEach(({ el, trigger }) => {
                const visible = el && (el.classList.contains('visible') || el.style.display === 'flex' || el.style.display === 'block');
                if (visible && !el.contains(e.target) && (!trigger || !trigger.contains(e.target))) {
                    if (el === timerPopup) { _showTimerPopup(false); }
                    else { el.classList.remove('visible'); if (el === successPopup) el.style.display = 'none'; }
                }
            });
        });

        /* Screen Wake Lock (keeps screen alive while sleep timer runs on mobile) */
        let _bzWakeLock = null;
        async function requestWakeLock() {
            if (!('wakeLock' in navigator)) return; // not supported (older Android/iOS)
            try {
                _bzWakeLock = await navigator.wakeLock.request('screen');
                _bzWakeLock.addEventListener('release', () => { _bzWakeLock = null; });
            } catch (e) { /* permission denied or not available — ignore */ }
        }
        async function releaseWakeLock() {
            if (_bzWakeLock) { try { await _bzWakeLock.release(); } catch (e) { } _bzWakeLock = null; }
        }
        // Re-acquire wake lock when page becomes visible
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && timerInterval !== null) {
                requestWakeLock();
            }
        });

        /* TIMER — text inputs for Hours and Minutes */
        const timerInputH = document.getElementById('timer-input-hours');
        const timerInputM = document.getElementById('timer-input-mins');
        const timerInputHint = document.getElementById('bz-timer-input-hint');

        // Show / hide the shared inline hint message
        let _hintClearTimer = null;
        function _showTimerHint(msg) {
            if (!timerInputHint) return;
            if (_hintClearTimer) { clearTimeout(_hintClearTimer); _hintClearTimer = null; }
            timerInputHint.textContent = msg;
            timerInputHint.style.display = 'flex';
            timerInputHint.classList.add('bz-timer-hint-visible');
        }
        function _hideTimerHint() {
            if (!timerInputHint) return;
            timerInputHint.classList.remove('bz-timer-hint-visible');
            _hintClearTimer = setTimeout(() => {
                timerInputHint.style.display = 'none';
                timerInputHint.textContent = '';
            }, 300);
        }

        // Clamp & zero-pad on blur; keep selH/selM in sync on every input change
        function _clampTimerInput(inp, max) {
            let v = parseInt(inp.value, 10);
            if (isNaN(v) || v < 0) v = 0;
            if (v > max) v = max;
            inp.value = String(v).padStart(2, '0');
            return v;
        }

        // Validate a value live — show hint and clear field if over limit
        function _validateTimerInput(inp, max, label) {
            const raw = inp.value;
            if (raw === '' || raw === '-') return; // still typing — don't interrupt
            const v = parseInt(raw, 10);
            if (!isNaN(v) && v > max) {
                _showTimerHint(`⚠ Enter ${max} or below for ${label}`);
                inp.value = '';          // clear the invalid value immediately
                inp.classList.add('bz-time-input--error');
                setTimeout(() => inp.classList.remove('bz-time-input--error'), 600);
            } else {
                _hideTimerHint();
            }
        }

        if (timerInputH) {
            timerInputH.addEventListener('input', () => {
                _validateTimerInput(timerInputH, 24, 'hours');
                selH = Math.min(24, Math.max(0, parseInt(timerInputH.value, 10) || 0));
            });
            timerInputH.addEventListener('blur', () => {
                selH = _clampTimerInput(timerInputH, 24);
                if (timerInputH.value && timerInputM && !timerInputM.value) {
                    _showTimerHint('ℹ Now enter minutes');
                    setTimeout(_hideTimerHint, 2000);
                } else { _hideTimerHint(); }
            });
            timerInputH.addEventListener('keydown', e => { if (e.key === 'Enter') { timerInputH.blur(); timerInputM && timerInputM.focus(); } });
        }
        if (timerInputM) {
            timerInputM.addEventListener('input', () => {
                _validateTimerInput(timerInputM, 60, 'mins');
                selM = Math.min(60, Math.max(0, parseInt(timerInputM.value, 10) || 0));
            });
            timerInputM.addEventListener('blur', () => {
                selM = _clampTimerInput(timerInputM, 60);
                _hideTimerHint();
            });
            timerInputM.addEventListener('keydown', e => { if (e.key === 'Enter') { timerInputM.blur(); startTimerBtn && startTimerBtn.click(); } });
            // Show a welcome hint when user first focuses minutes
            timerInputM.addEventListener('focus', () => {
                if (!timerInputM.value) {
                    _showTimerHint('ℹ Enter 60 or below for mins');
                }
            });
        }
        if (timerInputH) {
            timerInputH.addEventListener('focus', () => {
                if (!timerInputH.value) {
                    _showTimerHint('ℹ Enter 24 or below for hours');
                }
            });
        }

        // Timer popup aria-hidden / focus helper
        function _showTimerPopup(open) {
            if (open) {
                timerPopup.classList.add('visible');
                timerPopup.removeAttribute('aria-hidden');          // accessible when open
                document.body.classList.add('no-scroll');
                // Move focus into popup so screen readers land correctly
                requestAnimationFrame(() => closeTimerBtn && closeTimerBtn.focus());
            } else {
                // Blur any focused element inside BEFORE setting aria-hidden
                if (timerPopup.contains(document.activeElement)) {
                    document.activeElement.blur();
                }
                timerPopup.classList.remove('visible');
                timerPopup.setAttribute('aria-hidden', 'true');     // hidden from AT when closed
                document.body.classList.remove('no-scroll');
            }
        }
        /* Exposed globally to open the sleep timer popup from elsewhere */
        window.bzOpenSleepTimer = function () {
            timerPopup.style.zIndex = '10002';
            _showTimerPopup(true);
        };

        // Sleep Timer icon removed from the player
        if (timerBtn) {
            timerBtn.onclick = (e) => {
                e.stopPropagation();
                timerPopup.style.zIndex = "10002";
                _showTimerPopup(!timerPopup.classList.contains('visible'));
            };
            // FIX: Add touchend handler for timer button so it works on mobile
            if (!timerBtn._bzTouchWired) {
                timerBtn._bzTouchWired = true;
                let _timerTouchStartY = 0;
                timerBtn.addEventListener('touchstart', (e) => {
                    _timerTouchStartY = e.touches[0].clientY;
                }, { passive: true });
                timerBtn.addEventListener('touchend', (e) => {
                    // Non-cancelable = browser owns this touch sequence (scrolling)
                    if (!e.cancelable) return;
                    // Large Y movement = scroll gesture, not a tap
                    if (Math.abs(e.changedTouches[0].clientY - _timerTouchStartY) > 8) return;
                    e.stopPropagation();
                    e.preventDefault();
                    timerPopup.style.zIndex = "10002";
                    _showTimerPopup(!timerPopup.classList.contains('visible'));
                }, { passive: false });
            }
        }
        window.addEventListener('mousedown', (e) => { if (timerPopup.classList.contains('visible') && e.target === timerPopup) { _showTimerPopup(false); } });
        /* FIX: Also close timer popup on touchstart outside */
        window.addEventListener('touchstart', (e) => { if (timerPopup.classList.contains('visible') && e.target === timerPopup) { _showTimerPopup(false); } }, { passive: true });

        function resetTimerUI() {
            clearInterval(timerInterval); timerInterval = null;
            localStorage.removeItem('beatzen_sleep_timer_end'); // clear persisted timer on cancel/end
            if (typeof releaseWakeLock === 'function') releaseWakeLock();
            timerDisplay.textContent = ''; timerHeading?.style && (timerHeading.style.display = 'none');
            cancelTimerBtn.style.display = 'none'; startTimerBtn.style.display = 'block';
            document.querySelector('.timer-columns-container')?.style && (document.querySelector('.timer-columns-container').style.display = 'flex');
            // Clear input values
            selH = 0; selM = 0; selS = 0;
            if (timerInputH) timerInputH.value = '';
            if (timerInputM) timerInputM.value = '';
            _hideTimerHint();
            // Restore preset buttons
            const presets = document.querySelector('.bz-timer-presets');
            if (presets) presets.style.display = 'flex';
            // Restore OR section
            const orSection = document.getElementById('bz-timer-or-section');
            if (orSection) orSection.style.display = 'flex';
            timerBtn?.classList.remove('active', 'timer-pulse-active', 'timer-pulse-urgent');
            timerMainHeading.textContent = 'Set Sleep Timer'; _showTimerPopup(false);
            document.body.classList.remove('no-scroll');
            if (timerSubText) {
                timerSubText.textContent = 'Choose your sleep duration';
                timerSubText.classList.remove('bz-timer-subtitle--running');
            }
            // Clear preset highlight and confirmation panel
            document.querySelectorAll('.bz-preset-btn').forEach(b => b.classList.remove('bz-preset-active'));
            const cp = document.getElementById('bz-preset-confirm');
            if (cp) cp.style.display = 'none';
        }

        // Sleep Timer core start logic
        function _startSleepTimer(totalSeconds) {
            if (totalSeconds <= 0) return;
            if (typeof requestWakeLock === 'function') requestWakeLock();
            clearInterval(timerInterval);
            // Always save end timestamp so a page refresh can restore
            localStorage.setItem('beatzen_sleep_timer_end', String(Date.now() + totalSeconds * 1000));
            // Hide wheel columns AND preset buttons while timer is running
            const wc = document.querySelector('.timer-columns-container');
            if (wc) wc.style.display = 'none';
            const presets = document.querySelector('.bz-timer-presets');
            if (presets) presets.style.display = 'none';
            const orSection = document.getElementById('bz-timer-or-section');
            if (orSection) orSection.style.display = 'none';
            startTimerBtn.style.display = 'none'; cancelTimerBtn.style.display = 'block';
            timerMainHeading.textContent = 'Sleep Timer Running';
            if (timerSubText) {
                timerSubText.textContent = 'Songs will stop playing in';
                timerSubText.classList.add('bz-timer-subtitle--running');
            }
            timerBtn?.classList.add('active');
            const fmt = t => `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
            timerDisplay.textContent = fmt(totalSeconds);
            const origVol = audioPlayer.volume;
            // Use the stored endTime (already in localStorage) for all
            const _timerEndTime = Date.now() + totalSeconds * 1000;
            function _timerTick() {
                const remaining = Math.max(0, Math.floor((_timerEndTime - Date.now()) / 1000));
                timerDisplay.textContent = fmt(remaining);
                if (remaining > 15) { timerBtn?.classList.add('timer-pulse-active'); timerBtn?.classList.remove('timer-pulse-urgent'); }
                else if (remaining > 0) { timerBtn?.classList.remove('timer-pulse-active'); timerBtn?.classList.add('timer-pulse-urgent'); }
                if (remaining <= 15 && remaining > 0) audioPlayer.volume = origVol * (remaining <= 4 ? 0.1 : remaining <= 8 ? 0.2 : remaining <= 10 ? 0.5 : remaining <= 12 ? 0.7 : 0.9);
                if (remaining <= 0) { window._bzMarkExplicitPause?.(); audioPlayer.pause(); audioPlayer.volume = origVol; resetTimerUI(); timerEndedPopup.classList.add('visible'); updatePlayPauseIcon(); }
            }
            timerInterval = setInterval(_timerTick, 1000);
        }

        startTimerBtn.onclick = () => {
            // Clamp inputs before reading
            if (timerInputH) selH = _clampTimerInput(timerInputH, 24);
            if (timerInputM) selM = _clampTimerInput(timerInputM, 60);
            const total = (selH * 3600) + (selM * 60);
            if (total <= 0) {
                showToast('⏱ Please set a time before starting the timer', 3000);
                return;
            }
            _startSleepTimer(total);
        };

        // ── Quick-preset buttons (15m / 30m / 45m / 60m) ────────────────────
        const confirmPanel = document.getElementById('bz-preset-confirm');
        const confirmDur = document.getElementById('bz-confirm-duration');
        const confirmStartBtn = document.getElementById('bz-confirm-start-btn');
        const confirmBackBtn = document.getElementById('bz-confirm-back-btn');
        let _pendingPresetSecs = 0;

        // Label map for friendly display
        const _presetLabel = { 900: '15 minutes', 1800: '30 minutes', 2700: '45 minutes', 3600: '60 minutes' };

        function _showPresetConfirm(secs, btnEl) {
            // Highlight the chosen preset
            document.querySelectorAll('.bz-preset-btn').forEach(b => b.classList.remove('bz-preset-active'));
            btnEl.classList.add('bz-preset-active');
            _pendingPresetSecs = secs;

            // Hide wheels + main action row, show confirmation
            const wc = document.querySelector('.timer-columns-container');
            if (wc) wc.style.display = 'none';
            const orSection = document.getElementById('bz-timer-or-section');
            if (orSection) orSection.style.display = 'none';
            startTimerBtn.style.display = 'none';
            cancelTimerBtn.style.display = 'none';
            if (confirmDur) confirmDur.textContent = _presetLabel[secs] || `${Math.round(secs / 60)} minutes`;
            if (confirmPanel) confirmPanel.style.display = 'flex';
        }

        function _hidePresetConfirm() {
            if (confirmPanel) confirmPanel.style.display = 'none';
            document.querySelectorAll('.bz-preset-btn').forEach(b => b.classList.remove('bz-preset-active'));
            _pendingPresetSecs = 0;
            // Restore wheels and OR section
            const wc = document.querySelector('.timer-columns-container');
            if (wc) wc.style.display = 'flex';
            const orSection = document.getElementById('bz-timer-or-section');
            if (orSection) orSection.style.display = 'flex';
            startTimerBtn.style.display = 'block';
        }

        document.querySelectorAll('.bz-preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const secs = parseInt(btn.dataset.seconds, 10);
                if (!secs || secs <= 0) return;
                _showPresetConfirm(secs, btn);
            });
        });

        confirmStartBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!_pendingPresetSecs) return;
            _startSleepTimer(_pendingPresetSecs);
            if (confirmPanel) confirmPanel.style.display = 'none';
            // Popup stays open — countdown is now visible in-place
        });

        confirmBackBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            _hidePresetConfirm();
        });

        // Restore any sleep timer that was active before page refresh
        (function restoreSleepTimer() {
            // Timer always persists across refresh — no toggle needed
            const endTime = parseInt(localStorage.getItem('beatzen_sleep_timer_end'));
            if (!endTime || isNaN(endTime)) return;
            const remaining = Math.floor((endTime - Date.now()) / 1000);
            if (remaining <= 5) { localStorage.removeItem('beatzen_sleep_timer_end'); return; } // expired
            // Silently restart the countdown — no toast notification
            _startSleepTimer(remaining);
        })();

        cancelTimerBtn.onclick = resetTimerUI;
        closeTimerBtn.onclick = () => { _showTimerPopup(false); };
        document.getElementById('close-timer-ended')?.addEventListener('click', () => timerEndedPopup.classList.remove('visible'));

        // Mobile background / screen-lock re-sync
        function _resyncTimerOnForeground() {
            const endTime = parseInt(localStorage.getItem('beatzen_sleep_timer_end'));
            if (!endTime || isNaN(endTime)) return; // no timer running
            const remaining = Math.floor((endTime - Date.now()) / 1000);
            if (remaining <= 0) {
                // Timer expired while we were in the background — fire end logic now
                clearInterval(timerInterval); timerInterval = null;
                window._bzMarkExplicitPause?.();
                window._bzExternallyInterrupted = false; // definitely intentional — timer ended, don't auto-resume
                audioPlayer.pause();
                updatePlayPauseIcon();
                resetTimerUI();
                timerEndedPopup.classList.add('visible');
            } else {
                // Timer still running
                clearInterval(timerInterval); timerInterval = null;
                _startSleepTimer(remaining);
            }
        }
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') _resyncTimerOnForeground();
        });
        // pageshow fires on iOS bfcache restore (back-forward navigation)
        window.addEventListener('pageshow', (e) => {
            if (e.persisted) _resyncTimerOnForeground();
        });

        /* ── Auth Guard ──────────────────────────────────────────────────────── */
        function showBzAuthGate() {
            const gate = document.getElementById('bz-auth-gate');
            if (gate) gate.classList.add('bz-gate-visible');
            // Do NOT call displaySettings() here

            // FIX: On a fresh install (no session, no cached album data)
            if (typeof loaderHide === 'function' && !_bzLikelySignedIn()) {
                loaderHide();
            }
        }

        window.showBzAuthGate = showBzAuthGate;

        // NAV LINKS
        function _bzGetAuthReadyPromise() {
            if (window.bzAuthReady && typeof window.bzAuthReady.then === 'function') {
                return window.bzAuthReady;
            }
            return new Promise(function (resolve) {
                var _tries = 0;
                (function _poll() {
                    if (window.bzAuthReady && typeof window.bzAuthReady.then === 'function') {
                        window.bzAuthReady.then(resolve);
                    } else if (++_tries >= 100) {
                        // auth.js failed to load / Firebase SDK blocked
                        resolve();
                    } else {
                        setTimeout(_poll, 20);
                    }
                })();
            });
        }

        function bzNavGuard(action) {
            // Fast-path: Firebase already resolved — act immediately.
            if (window.bzIsAuthenticated !== undefined) {
                if (!window.bzIsAuthenticated) { showBzAuthGate(); return; }
                action();
            } else {
                // Firebase is still resolving (~100-300 ms on page refresh).
                const _cachedUid = _bzLikelySignedIn();
                if (_cachedUid) {
                    // Optimistically run the action; confirm with Firebase async.
                    action();
                    _bzGetAuthReadyPromise().then(function () {
                        // If Firebase disagrees (e.g. token revoked), show the gate.
                        if (!window.bzIsAuthenticated) { showBzAuthGate(); }
                    });
                } else {
                    // No cached session — wait for Firebase before proceeding.
                    _bzGetAuthReadyPromise().then(function () {
                        if (!window.bzIsAuthenticated) { showBzAuthGate(); return; }
                        action();
                    });
                }
            }
        }

        if (homeLink) homeLink.onclick = (e) => {
            e.preventDefault();
            bzNavGuard(() => {
                if (!bzIsPremiumUser()) { displayPremium(); return; }
                displayHome();
            });
        };
        if (playlistsLink) playlistsLink.onclick = (e) => {
            e.preventDefault();
            bzNavGuard(() => {
                if (!bzIsPremiumUser()) { displayPremium(); return; }
                displayPlaylists();
            });
        };
        if (artistsLink) artistsLink.onclick = (e) => {
            e.preventDefault();
            bzNavGuard(() => displayArtists());
        };
        /* explore nav removed */
        if (settingsLink) settingsLink.onclick = (e) => {
            e.preventDefault();
            // Settings now requires sign-in like all other tabs.
            bzNavGuard(() => {
                if (!bzIsPremiumUser()) { displayPremium(); return; }
                const gate = document.getElementById('bz-auth-gate');
                if (gate) gate.classList.remove('bz-gate-visible');
                displaySettings();
            });
        };
        // Premium is never gated by itself — this is the way out.
        if (premiumLink) premiumLink.onclick = (e) => {
            e.preventDefault();
            bzNavGuard(() => {
                const gate = document.getElementById('bz-auth-gate');
                if (gate) gate.classList.remove('bz-gate-visible');
                displayPremium();
            });
        };
        // Desktop nav link
        if (profileLink) profileLink.onclick = (e) => {
            e.preventDefault();
            bzNavGuard(() => {
                const gate = document.getElementById('bz-auth-gate');
                if (gate) gate.classList.remove('bz-gate-visible');
                displayProfile();
            });
        };
        // Mobile top-bar profile button
        const mobileTopbarProfileBtn = document.getElementById('bz-mobile-profile-btn');
        const bzProfileBackBtn = document.getElementById('bz-profile-back-btn');

        if (mobileTopbarProfileBtn) mobileTopbarProfileBtn.onclick = (e) => {
            e.preventDefault();
            bzNavGuard(() => {
                const gate = document.getElementById('bz-auth-gate');
                if (gate) gate.classList.remove('bz-gate-visible');
                displayProfile();
            });
        };
        if (bzProfileBackBtn) bzProfileBackBtn.onclick = () => {
            // history.back() works when the user navigated here within the SPA
            if (window._bzSpaNavDepth > 0) {
                history.back();
            } else {
                displayHome();
            }
        };

        // Keep the mobile top-bar button itself showing the signed-in user's
        function bzUpdateMobileTopbarAvatar() {
            const img = document.getElementById('bz-mobile-topbar-avatar-img');
            const initEl = document.getElementById('bz-mobile-topbar-avatar-init');
            if (!img || !initEl) return;

            const srcAvatar = document.getElementById('bz-auth-avatar');
            const srcInit = document.getElementById('bz-auth-avatar-init');
            const srcName = document.getElementById('bz-auth-name');

            const hasPhoto = !!(srcAvatar && srcAvatar.getAttribute('src') && srcAvatar.style.display !== 'none');
            const fallbackLetter = ((srcName && srcName.textContent) || '').trim().charAt(0).toUpperCase();
            const hasLetter = !!((srcInit && srcInit.textContent.trim()) || fallbackLetter);

            if (hasPhoto) {
                img.src = srcAvatar.src;
                img.style.display = '';
                initEl.style.display = 'none';
                initEl.classList.remove('bz-topbar-avatar--guest');
            } else if (hasLetter) {
                img.style.display = 'none';
                initEl.style.display = 'flex';
                initEl.classList.remove('bz-topbar-avatar--guest');
                initEl.textContent = (srcInit && srcInit.textContent.trim()) ? srcInit.textContent : fallbackLetter;
            } else {
                // Signed out / not yet known — fall back to the generic icon.
                img.style.display = 'none';
                initEl.style.display = 'flex';
                initEl.classList.add('bz-topbar-avatar--guest');
                initEl.innerHTML = '<i class="fas fa-user-circle"></i>';
            }
        }
        window.bzUpdateMobileTopbarAvatar = bzUpdateMobileTopbarAvatar;
        (function bzSetupMobileTopbarAvatarSync() {
            const accountCard = document.getElementById('bz-auth-signedin');
            if (accountCard && window.MutationObserver) {
                const mo = new MutationObserver(() => bzUpdateMobileTopbarAvatar());
                mo.observe(accountCard, {
                    childList: true, subtree: true, characterData: true,
                    attributes: true, attributeFilter: ['src', 'style']
                });
            }
            bzUpdateMobileTopbarAvatar(); // initial paint (guest icon until auth resolves)
        })();
        if (updatesLink) updatesLink.onclick = (e) => {
            e.preventDefault();
            bzNavGuard(() => {
                if (!bzIsPremiumUser()) { displayPremium(); return; }
                const gate = document.getElementById('bz-auth-gate');
                if (gate) gate.classList.remove('bz-gate-visible');
                displayUpdates();
            });
        };
        if (searchLink) searchLink.onclick = (e) => {
            e.preventDefault();
            bzNavGuard(() => {
                if (!bzIsPremiumUser()) { displayPremium(); return; }
                hideAllViews();
                searchContainer?.classList.remove('hidden');
                if (searchResultsContainer) searchResultsContainer.style.display = 'block';
                updateNav('search');
                window._bzSpaNavDepth++; history.pushState({ view: 'search' }, '', '#search');
                if (actualSearchBar?.value.trim()) executeSearchLogic(actualSearchBar.value.toLowerCase().trim());
                setTimeout(() => actualSearchBar?.focus(), 100);
            });
        };

        /* PLAYLIST SYNC */
        window.syncPlaylistData = function () {
            const custom = window.masterPool.filter(p => p.isImported || String(p.id).startsWith('user-') || String(p.id).startsWith('imported-'));
            localStorage.setItem('beatZen_importedPlaylists', JSON.stringify(custom));
            if (window.location.hash === '#playlists') displayPlaylists(true);
        };

        /* SONG CONTEXT MENU */
        let selectedSongForModal = null;
        window.openSongMenu = (song, triggerEvent) => {
            selectedSongForModal = song;
            const modal = document.getElementById('playlist-modal');
            const content = modal.querySelector('.timer-popup-content');
            document.getElementById('modal-song-title').innerText = song.title;
            window.backToModalMain();

            /* ── Position the dropdown near the three-dot button ── */
            const MENU_W = 260;
            const PADDING = 16; // min gap from screen edges (16 keeps menu clear of scrollbar gutter)
            // The navbar is position:fixed at the top of the viewport
            const _fsPlayerOpen = !!document.getElementById('main-player')?.classList.contains('maximized');
            // Below 768px the navbar moves to the BOTTOM of the screen
            const _isMobileNav = window.matchMedia('(max-width: 768px)').matches;
            const _rawNavH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')) || 70;
            const NAV_H = (_fsPlayerOpen || _isMobileNav) ? 0 : _rawNavH;
            const TOP_SAFE = _fsPlayerOpen ? 6 : (NAV_H + 6);
            // Same idea at the bottom
            const _mobileNavStack = (_fsPlayerOpen || !_isMobileNav) ? 0 : _rawNavH;
            const PLAYER_H = _fsPlayerOpen ? 0 : ((parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--player-height')) || 120) + _mobileNavStack);
            const BOTTOM_SAFE = _fsPlayerOpen ? 6 : (PLAYER_H + 6);

            /* Capture button element synchronously */
            const _triggerBtn = triggerEvent ? (triggerEvent.currentTarget || triggerEvent.target) : null;
            // Also remember a stable lookup so we can re-resolve the button
            const _songId = song && song.id != null ? String(song.id) : null;

            function resolveTriggerBtn() {
                // FIX: previously always preferred the same-songId list-row lookup
                if (_triggerBtn && _triggerBtn.isConnected) return _triggerBtn;
                if (_songId) {
                    const row = document.querySelector(`.song-item[data-song-id="${CSS.escape(_songId)}"]`);
                    const liveBtn = row && row.querySelector('.song-menu-btn');
                    if (liveBtn && liveBtn.isConnected) return liveBtn;
                }
                return _triggerBtn; // last resort — may be detached
            }

            function positionMenu() {
                const btn = resolveTriggerBtn();
                if (!btn) return;
                const rect = btn.getBoundingClientRect();
                // A detached/invisible node reports an all-zero rect
                if (!btn.isConnected || (rect.top === 0 && rect.bottom === 0 && rect.left === 0 && rect.right === 0)) {
                    return;
                }
                // Use clientWidth/clientHeight
                const vw = document.documentElement.clientWidth;
                const vh = document.documentElement.clientHeight;

                // The button's own anchor point (its vertical center) is what the menu
                const btnCenter = rect.top + rect.height / 2;
                if (btnCenter < NAV_H || btnCenter > vh - PLAYER_H) {
                    window.closePlaylistModal();
                    return;
                }

                // Measure actual rendered dimensions
                content.style.position = 'fixed';
                content.style.visibility = 'hidden';
                content.style.top = '0px';
                content.style.left = '0px';
                content.style.maxWidth = (vw - PADDING * 2) + 'px';
                const actualH = content.offsetHeight || 320;
                const actualW = content.offsetWidth || MENU_W;
                content.style.visibility = '';

                // Prefer below button, flip above if not enough space below
                let top = rect.bottom + 6;
                if (top + actualH > vh - PADDING) {
                    top = rect.top - actualH - 6;
                }
                // Clamp below the fixed navbar / above the fixed player bar
                if (top < TOP_SAFE) top = TOP_SAFE;
                if (top + actualH > vh - BOTTOM_SAFE) {
                    top = Math.max(TOP_SAFE, vh - BOTTOM_SAFE - actualH);
                }

                // Horizontal: align right edge to button
                let left = rect.right - actualW;
                if (left < PADDING) left = PADDING;
                if (left + actualW > vw - PADDING) left = vw - actualW - PADDING;

                content.style.top = top + 'px';
                content.style.left = left + 'px';
                content.style.margin = '0';
                content.style.maxHeight = (vh - top - BOTTOM_SAFE) + 'px';
                content.style.maxWidth = (vw - PADDING * 2) + 'px';
                content.style.overflowY = 'auto';
            }

            modal.style.display = 'flex';
            modal.classList.add('visible');
            // Position after display so dimensions are measurable
            requestAnimationFrame(() => positionMenu());

            // Reposition on scroll so menu tracks the button
            let _scrollRaf = null;
            function onScroll() {
                if (_scrollRaf) return;
                _scrollRaf = requestAnimationFrame(() => {
                    _scrollRaf = null;
                    positionMenu();
                });
            }
            window.addEventListener('scroll', onScroll, { passive: true });

            /* ── Close on outside click (transparent overlay or outside content) ── */
            function onOutsideClick(e) {
                if (!content.contains(e.target)) {
                    window.closePlaylistModal();
                }
            }
            /* Also close when clicking the transparent overlay background directly */
            modal.onclick = (e) => { if (e.target === modal) window.closePlaylistModal(); };
            /* Use setTimeout so this click doesn't immediately trigger close */
            setTimeout(() => document.addEventListener('click', onOutsideClick), 0);

            /* ── Close on Escape ── */
            function onEscape(e) {
                if (e.key === 'Escape') window.closePlaylistModal();
            }
            document.addEventListener('keydown', onEscape);

            /* ── Store cleanup refs on modal for closePlaylistModal to remove ── */
            modal._bzCleanup = () => {
                window.removeEventListener('scroll', onScroll);
                document.removeEventListener('click', onOutsideClick);
                document.removeEventListener('keydown', onEscape);
                if (_scrollRaf) { cancelAnimationFrame(_scrollRaf); _scrollRaf = null; }
                modal._bzCleanup = null;
            };

            // Wire up "Song Info" button
            const songInfoBtn = document.getElementById('modal-song-info-btn');
            if (songInfoBtn) {
                const fresh = songInfoBtn.cloneNode(true);
                songInfoBtn.parentNode.replaceChild(fresh, songInfoBtn);
                fresh.onclick = () => {
                    window.closePlaylistModal();
                    window.openSongInfoPanel(selectedSongForModal);
                };
            }

            // Wire up "Share Song Card" button
            const shareSongBtn = document.getElementById('modal-share-song-btn');
            if (shareSongBtn) {
                const fresh = shareSongBtn.cloneNode(true);
                shareSongBtn.parentNode.replaceChild(fresh, shareSongBtn);
                fresh.onclick = () => {
                    window.closePlaylistModal();
                    if (typeof window.openShareSongModal === 'function') {
                        window.openShareSongModal(selectedSongForModal);
                    }
                };
            }

            // Wire up "Copy Song Link" button
            const copyLinkBtn = document.getElementById('modal-copy-link-btn');
            if (copyLinkBtn) {
                const fresh = copyLinkBtn.cloneNode(true);
                copyLinkBtn.parentNode.replaceChild(fresh, copyLinkBtn);
                fresh.onclick = () => {
                    window.closePlaylistModal();
                    const s = selectedSongForModal;
                    if (!s) return;
                    const songLink = `${location.origin}${location.pathname}#song-${s.id}`;
                    if (navigator.clipboard) {
                        navigator.clipboard.writeText(songLink).then(() => showToast('✓ Song link copied!')).catch(() => fallbackCopy(songLink));
                    } else { fallbackCopy(songLink); }
                    function fallbackCopy(t) {
                        const ta = Object.assign(document.createElement('textarea'), { value: t });
                        Object.assign(ta.style, { position: 'fixed', opacity: '0' });
                        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
                        showToast('✓ Song link copied!');
                    }
                };
            }

            // Wire up Play Next button each time menu opens
            const playNextBtn = document.getElementById('modal-play-next-btn');
            if (playNextBtn) {
                // Clone to remove old listeners
                const fresh = playNextBtn.cloneNode(true);
                playNextBtn.parentNode.replaceChild(fresh, playNextBtn);
                fresh.onclick = () => {
                    if (!selectedSongForModal) return;
                    // If nothing is playing yet, just play the song directly
                    if (!window.playingAlbum) {
                        // Find the album that owns this song
                        const songData = window.allSongsMap.get(String(selectedSongForModal.id));
                        if (songData?.album) {
                            window.playingAlbum = window.resolveData(songData.album, songData.album.type || 'Movie');
                            window.playSong(0);
                        }
                        window.closePlaylistModal();
                        return;
                    }
                    // Insert the song right after the currently playing index
                    const insertAt = window.currentSongIndex + 1;
                    // Avoid duplicate adjacent songs
                    const songs = window.playingAlbum.songs;
                    const alreadyNext = songs[insertAt] && String(songs[insertAt].id) === String(selectedSongForModal.id);
                    if (!alreadyNext) {
                        songs.splice(insertAt, 0, selectedSongForModal);
                        // Rebuild map so new position is tracked
                        window.rebuildMasterMap();
                    }
                    window.closePlaylistModal();
                    // Refresh queue overlay if it's open
                    if (typeof window.renderFullscreenQueue === 'function') {
                        window.renderFullscreenQueue();
                    }
                    // Show toast feedback
                    showToast(`"${selectedSongForModal.title}" will play next`);
                };
            }

            // Wire up Add to End of Queue button each time menu opens
            const addEndBtn = document.getElementById('modal-add-end-btn');
            if (addEndBtn) {
                const freshEnd = addEndBtn.cloneNode(true);
                addEndBtn.parentNode.replaceChild(freshEnd, addEndBtn);
                freshEnd.onclick = () => {
                    if (!selectedSongForModal) return;
                    if (!window.playingAlbum) {
                        // Nothing playing — start the song
                        const songData = window.allSongsMap.get(String(selectedSongForModal.id));
                        if (songData?.album) {
                            window.playingAlbum = window.resolveData(songData.album, songData.album.type || 'Movie');
                            window.playSong(0);
                        }
                        window.closePlaylistModal();
                        return;
                    }
                    const songs = window.playingAlbum.songs;
                    // Avoid exact duplicate at the very end
                    const lastSong = songs[songs.length - 1];
                    const alreadyLast = lastSong && String(lastSong.id) === String(selectedSongForModal.id);
                    if (!alreadyLast) {
                        songs.push(selectedSongForModal);
                        window.rebuildMasterMap();
                    }
                    window.closePlaylistModal();
                    if (typeof window.renderFullscreenQueue === 'function') {
                        window.renderFullscreenQueue();
                    }
                    showToast(`"${selectedSongForModal.title}" added to end of queue`);
                };
            }

            // Remove from Playlist: only visible when inside a user/imported
            const removeFromPlBtn = document.getElementById('modal-remove-from-playlist-btn');
            if (removeFromPlBtn) {
                const freshRfp = removeFromPlBtn.cloneNode(true);
                removeFromPlBtn.parentNode.replaceChild(freshRfp, removeFromPlBtn);

                const _curAlbum = window.currentAlbum;
                const _isUserPl = _curAlbum &&
                    _curAlbum.type === 'Playlist' &&
                    (String(_curAlbum.id).startsWith('user-') ||
                        String(_curAlbum.id).startsWith('imported-') ||
                        _curAlbum._isFavourites);

                freshRfp.style.display = _isUserPl ? 'flex' : 'none';

                freshRfp.onclick = () => {
                    if (!selectedSongForModal || !_curAlbum) return;
                    window.closePlaylistModal();

                    const _songTitle = selectedSongForModal.title || 'Song';
                    const _plName = _curAlbum.name || _curAlbum.title || 'Playlist';

                    // Splice song from masterPool entry
                    const _poolEntry = (window.masterPool || []).find(function (p) {
                        return String(p.id) === String(_curAlbum.id);
                    });
                    if (_poolEntry && Array.isArray(_poolEntry.songs)) {
                        var _pi = _poolEntry.songs.findIndex(function (s) {
                            return String(s.id) === String(selectedSongForModal.id);
                        });
                        if (_pi !== -1) { _poolEntry.songs.splice(_pi, 1); }
                    }
                    // Also splice from currentAlbum.songs
                    if (Array.isArray(_curAlbum.songs)) {
                        var _ci = _curAlbum.songs.findIndex(function (s) {
                            return String(s.id) === String(selectedSongForModal.id);
                        });
                        if (_ci !== -1) { _curAlbum.songs.splice(_ci, 1); }
                    }

                    // Persist to localStorage
                    if (typeof window.syncPlaylistData === 'function') {
                        window.syncPlaylistData();
                    }

                    // Refresh album view so the removed song row disappears
                    if (typeof window.selectAlbum === 'function') {
                        window.selectAlbum(_curAlbum, true);
                    }

                    showToast('"' + _songTitle + '" removed from ' + _plName);
                };
            }

        };

        // ADVANCED PATTERN MATCHING ENGINE
        window.matchSongAdvanced = (function () {
            const MIN_THRESHOLD = 0.55;

            function normalize(str) {
                if (!str) return '';
                return str.toLowerCase()
                    .replace(/[''`]/g, "'")
                    .replace(/[^a-z0-9 ']/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            }

            function bigrams(str) {
                const s = normalize(str).replace(/\s/g, '');
                const bg = new Set();
                for (let i = 0; i < s.length - 1; i++) bg.add(s[i] + s[i + 1]);
                return bg;
            }

            function diceSimilarity(a, b) {
                const bgA = bigrams(a), bgB = bigrams(b);
                if (!bgA.size || !bgB.size) return 0;
                let inter = 0;
                bgA.forEach(g => { if (bgB.has(g)) inter++; });
                return (2 * inter) / (bgA.size + bgB.size);
            }

            function tokenSubset(query, candidate) {
                const qTokens = normalize(query).split(' ').filter(Boolean);
                const cNorm = normalize(candidate);
                return qTokens.length > 0 && qTokens.every(t => cNorm.includes(t));
            }

            return function matchSong(titleQuery, artistQuery, idQuery) {
                let best = null, bestScore = 0;
                const normTitle = normalize(titleQuery || '');
                const normArtist = normalize(artistQuery || '');

                window.allSongsMap.forEach((entry, songId) => {
                    const song = entry;
                    const album = entry.album;
                    let score = 0;

                    // 1. Exact ID
                    if (idQuery && String(idQuery) === songId) {
                        score = 1.00;
                    }
                    // 2. Exact title + artist
                    else if (normTitle && normalize(song.title) === normTitle &&
                        normArtist && normalize(song.artist) === normArtist) {
                        score = 0.95;
                    }
                    // 3. Normalized title only
                    else if (normTitle && normalize(song.title) === normTitle) {
                        score = 0.85;
                    }
                    // 4. Bigram similarity (title + artist combined)
                    else {
                        const queryStr = normTitle + (normArtist ? ' ' + normArtist : '');
                        const candStr = normalize(song.title) + ' ' + normalize(song.artist || '');
                        const sim = diceSimilarity(queryStr, candStr);
                        if (sim >= 0.65) {
                            score = sim * 0.90; // scale down slightly vs exact matches
                        }
                        // 5. Token subset fallback
                        else if (normTitle && tokenSubset(normTitle, song.title)) {
                            score = 0.60;
                        }
                    }

                    if (score > bestScore) {
                        bestScore = score;
                        best = { song, album, score };
                    }
                });

                return best && bestScore >= MIN_THRESHOLD ? best : null;
            };
        })();

        document.getElementById('confirm-create-btn')?.addEventListener('click', () => {
            const nameInput = document.getElementById('new-playlist-name');
            const name = nameInput.value.trim();
            if (!name) { document.getElementById('new-playlist-name')?.focus(); return; }
            // Create a shallow copy of the selected song — don't share references
            const songCopy = selectedSongForModal ? { ...selectedSongForModal } : null;
            const pl = {
                id: 'user-' + Date.now(),
                name,
                title: name,
                albumCover: "https://res.cloudinary.com/beatzenapp/image/upload/v1782654641/Logo_kmpfjf.jpg",
                songs: songCopy ? [songCopy] : [],
                type: "Playlist",
                isImported: true
            };
            window.masterPool.push(pl);
            window.syncPlaylistData();
            window.closePlaylistModal();
            showToast(`✓ Playlist "${name}" created`);
        });

        window.showAddToPlaylistUI = () => {
            const listContainer = document.getElementById('existing-playlists-list');
            const saved = JSON.parse(localStorage.getItem('beatZen_importedPlaylists') || '[]');
            document.getElementById('modal-main-options').style.display = 'none';
            document.getElementById('modal-list-ui').style.display = 'block';
            listContainer.innerHTML = saved.length
                ? ''
                : '<p style="text-align:center;padding:10px;font-size:0.8rem;opacity:0.6;">No playlists created yet.</p>';
            saved.forEach(pl => {
                const div = document.createElement('div');
                div.style = "display:flex;justify-content:space-between;align-items:center;padding:10px;border-bottom:1px solid rgba(255,255,255,0.05);";
                div.innerHTML = `<span style="font-size:0.9rem;color:white;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;">${_bzEscapeHTML(pl.name)}</span><button data-pl-id="${pl.id}" style="background:#2575fc;border:none;color:white;padding:5px 12px;border-radius:5px;font-size:0.8rem;cursor:pointer;">Add</button>`;
                div.querySelector('button').addEventListener('click', () => window.addSongToPlaylistID(pl.id));
                listContainer.appendChild(div);
            });
        };

        window.addSongToPlaylistID = (id) => {
            const target = window.masterPool.find(p => String(p.id) === String(id));
            if (target) {
                const alreadyIn = target.songs.some(s => String(s.id || s) === String(selectedSongForModal.id));
                if (alreadyIn) {
                    bzAlert("info", "Already Added", "This song is already in this playlist.");
                } else {
                    // Push a SHALLOW COPY so mutations on this playlist's song object
                    target.songs.push({ ...selectedSongForModal });
                    window.rebuildMasterMap();
                    window.syncPlaylistData();
                    showToast(`✓ Added to "${target.name}"`);

                    // Record 'add_playlist' signal
                    try {
                        const BZ_SIGNALS_KEY = 'beatZen_signals';
                        let signals = [];
                        try { signals = JSON.parse(localStorage.getItem(BZ_SIGNALS_KEY) || '[]'); } catch (_) { /* ignore */ }
                        signals.unshift({ id: String(selectedSongForModal.id), signal: 'add_playlist', ts: Date.now() });
                        signals = signals.slice(0, 500);
                        localStorage.setItem(BZ_SIGNALS_KEY, JSON.stringify(signals));
                    } catch (_apErr) { /* silent — never break playlist save */ }
                }
            }
            window.closePlaylistModal();
        };

        window.showCreatePlaylistUI = () => {
            window.closePlaylistModal();
            bzInput('playlist', 'New Playlist', 'Enter playlist name...', (name) => {
                const songCopy = selectedSongForModal ? { ...selectedSongForModal } : null;
                const pl = {
                    id: 'user-' + Date.now(), name, title: name,
                    albumCover: 'https://res.cloudinary.com/beatzenapp/image/upload/v1782654641/Logo_kmpfjf.jpg',
                    songs: songCopy ? [songCopy] : [], type: 'Playlist', isImported: true
                };
                window.masterPool.push(pl);
                window.syncPlaylistData();
                showToast(`✓ Playlist "${name}" created`);
            });
        };
        window.backToModalMain = () => {
            document.getElementById('modal-main-options').style.display = 'block';
            document.getElementById('modal-create-ui').style.display = 'none';
            document.getElementById('modal-list-ui').style.display = 'none';
            document.getElementById('new-playlist-name').value = '';
            // Inject extra buttons if not present
            if (!document.getElementById('modal-song-info-btn')) {
                const mainOpts = document.getElementById('modal-main-options');
                if (mainOpts) {
                    // Share Song Card
                    const shareBtn = document.createElement('button');
                    shareBtn.id = 'modal-share-song-btn';
                    shareBtn.innerHTML = '<i class="fas fa-share-nodes"></i> Share Song Card';
                    mainOpts.appendChild(shareBtn);

                    // Copy Song Link
                    const copyBtn = document.createElement('button');
                    copyBtn.id = 'modal-copy-link-btn';
                    copyBtn.innerHTML = '<i class="fas fa-link"></i> Copy Song Link';
                    mainOpts.appendChild(copyBtn);

                    // Song Info
                    const infoBtn = document.createElement('button');
                    infoBtn.id = 'modal-song-info-btn';
                    infoBtn.innerHTML = '<i class="fas fa-info-circle"></i> Song Info';
                    mainOpts.appendChild(infoBtn);
                }
            }
        };
        // SONG INFO PANEL — uses sheet data only (no external fetch)
        window.openSongInfoPanel = function (song) {
            // Remove existing panel if any
            const existing = document.getElementById('bz-song-info-overlay');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = 'bz-song-info-overlay';
            overlay.className = 'bz-song-info-overlay';
            overlay.innerHTML = `
                <div class="bz-song-info-panel" id="bz-song-info-panel">
                    <div class="bz-si-header">
                        <span class="bz-si-title">Song Info</span>
                        <button class="bz-si-close" id="bz-si-close-btn" aria-label="Close"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="bz-si-body" id="bz-si-body"></div>
                </div>`;
            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add('visible'));

            document.getElementById('bz-si-close-btn').onclick = () => {
                overlay.classList.remove('visible');
                setTimeout(() => overlay.remove(), 280);
            };
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('visible');
                    setTimeout(() => overlay.remove(), 280);
                }
            });

            // Always use sheet data — songTitle and movieTitle from Google Sheet
            const albumData = window.allSongsMap?.get(String(song.id))?.album || song._sourceAlbum || window.playingAlbum || {};
            const data = {
                trackName: song.title || '—',
                artistName: song.artist || '—',
                albumName: albumData.title || albumData.name || '—',
                duration: song.duration || '—',
                releaseDate: albumData.year ? String(albumData.year) : '—',
                artwork: albumData.imageUrl || albumData.albumCover || ''
            };

            const body = document.getElementById('bz-si-body');
            if (!body) return;
            const rows = [
                { icon: 'fa-music', label: 'Track', value: data.trackName },
                { icon: 'fa-microphone-alt', label: 'Artist', value: data.artistName },
                { icon: 'fa-compact-disc', label: 'Album', value: data.albumName },
                { icon: 'fa-calendar-alt', label: 'Released', value: data.releaseDate },
                { icon: 'fa-clock', label: 'Duration', value: data.duration },
            ];
            body.innerHTML = `
                ${data.artwork ? `<div class="bz-si-artwork-wrap"><img src="${data.artwork}" class="bz-si-artwork" alt="Album Art"></div>` : ''}
                <div class="bz-si-rows">
                    ${rows.map(r => `
                        <div class="bz-si-row">
                            <div class="bz-si-row-icon"><i class="fas ${r.icon}"></i></div>
                            <div class="bz-si-row-content">
                                <span class="bz-si-row-label">${r.label}</span>
                                <span class="bz-si-row-value">${r.value}</span>
                            </div>
                        </div>`).join('')}
                </div>
            `;
        };

        window.closePlaylistModal = () => {
            const m = document.getElementById('playlist-modal');
            m.style.display = 'none';
            m.classList.remove('visible');
            /* Remove scroll / outside-click / escape listeners */
            if (typeof m._bzCleanup === 'function') m._bzCleanup();
        };

        // FAVOURITES ENGINE
        (function initFavouritesEngine() {
            const BZ_FAV_KEY = 'beatZen_favourites';
            const BZ_FAV_PLAYLIST_ID = 'bz-favourites-playlist';
            const BZ_FAV_HEART_IMG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjZjQzZjVlIi8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjYmUxMjNjIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjUxMiIgaGVpZ2h0PSI1MTIiIGZpbGw9InVybCgjZykiLz48cGF0aCB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxMjgsMTM2KSBzY2FsZSgwLjUpIiBkPSJNNDcuNiAzMDAuNEwyMjguMyA0NjkuMWM3LjUgNyAxNy40IDEwLjkgMjcuNyAxMC45czIwLjItMy45IDI3LjctMTAuOUw0NjQuNCAzMDAuNGMzMC40LTI4LjMgNDcuNi02OCA0Ny42LTEwOS41di01LjhjMC02OS45LTUwLjUtMTI5LjUtMTE5LjQtMTQxQzM0NyAzNi41IDMwMC42IDUxLjQgMjY4IDg0TDI1NiA5NiAyNDQgODRjLTMyLjYtMzIuNi03OS00Ny41LTEyNC42LTM5LjlDNTAuNSA1NS42IDAgMTE1LjIgMCAxODUuMXY1LjhjMCA0MS41IDE3LjIgODEuMiA0Ny42IDEwOS41eiIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjkyKSIvPjwvc3ZnPg==';

            function sanitizeHTML(str) {
                const d = document.createElement('div');
                d.textContent = String(str ?? '');
                return d.innerHTML;
            }

            /* ── Storage helpers ── */
            function loadFavourites() {
                try { return JSON.parse(localStorage.getItem(BZ_FAV_KEY) || '[]'); } catch (_) { return []; }
            }
            function saveFavourites(list) {
                localStorage.setItem(BZ_FAV_KEY, JSON.stringify(list));
            }
            function isFavourite(songId) {
                return loadFavourites().some(s => String(s.id || s) === String(songId));
            }

            /* ── Sync playlist into masterPool + localStorage ── */
            function syncFavouritesPlaylist() {
                const favs = loadFavourites();
                if (!window.masterPool) return;

                // Remove any stale instance
                let idx;
                while ((idx = window.masterPool.findIndex(p => p.id === BZ_FAV_PLAYLIST_ID)) !== -1) {
                    window.masterPool.splice(idx, 1);
                }

                try {
                    const saved = JSON.parse(localStorage.getItem('beatZen_importedPlaylists') || '[]');
                    const filtered = saved.filter(p => p.id !== BZ_FAV_PLAYLIST_ID);

                    if (favs.length === 0) {
                        localStorage.setItem('beatZen_importedPlaylists', JSON.stringify(filtered));
                        _refreshPlaylistsView();
                        return;
                    }

                    const favPlaylist = {
                        id: BZ_FAV_PLAYLIST_ID,
                        name: 'Favourites',
                        title: 'Favourites',
                        albumCover: BZ_FAV_HEART_IMG,
                        imageUrl: BZ_FAV_HEART_IMG,
                        songs: favs.map(s => ({ ...s })),
                        type: 'Playlist',
                        isImported: true,
                        _isFavourites: true
                    };

                    // Insert at front of Playlist section in masterPool
                    const firstPLIdx = window.masterPool.findIndex(p => p.type === 'Playlist');
                    if (firstPLIdx >= 0) {
                        window.masterPool.splice(firstPLIdx, 0, favPlaylist);
                    } else {
                        window.masterPool.unshift(favPlaylist);
                    }

                    // Persist to localStorage at position 0
                    filtered.unshift(favPlaylist);
                    localStorage.setItem('beatZen_importedPlaylists', JSON.stringify(filtered));
                } catch (_) { }

                _refreshPlaylistsView();
            }

            function _refreshPlaylistsView() {
                if (typeof window.syncPlaylistData === 'function') window.syncPlaylistData();
                setTimeout(() => {
                    if (typeof window.displayPlaylists === 'function') {
                        const view = window.lastActiveView || '';
                        const onPlaylists = view === 'playlists' ||
                            document.getElementById('playlists-view')?.classList.contains('active') ||
                            document.getElementById('playlists-container')?.closest('.view')?.classList.contains('active');
                        if (onPlaylists) window.displayPlaylists(true);
                    }
                }, 80);
            }

            /* ── Core actions ── */
            function addFavourite(song) {
                const favs = loadFavourites();
                if (favs.some(s => String(s.id || s) === String(song.id))) return;
                favs.unshift({ ...song });
                saveFavourites(favs);
                syncFavouritesPlaylist();
                _showFavToast(song.title, true);
                // Instantly push to cloud (if signed in & auto-sync on, or manual)
                setTimeout(() => { try { window.bzSilentUpload?.(); } catch (_) { } }, 200);
            }

            function removeFavourite(songId) {
                const favs = loadFavourites();
                const i = favs.findIndex(s => String(s.id || s) === String(songId));
                if (i === -1) return;
                const removed = favs[i];
                favs.splice(i, 1);
                saveFavourites(favs);
                syncFavouritesPlaylist();
                _showFavToast(removed.title || 'Song', false);
                // Instantly push to cloud (if signed in & auto-sync on, or manual)
                setTimeout(() => { try { window.bzSilentUpload?.(); } catch (_) { } }, 200);
            }

            function toggleFavourite(song) {
                if (isFavourite(song.id)) {
                    removeFavourite(song.id);
                } else {
                    addFavourite(song);
                }
                // Refresh queue if open
                if (typeof window.renderFullscreenQueue === 'function') window.renderFullscreenQueue();
            }

            /* ── Toast ── */
            function _showFavToast(songTitle, isAdded) {
                const container = document.getElementById('toast-container');
                if (!container) return;
                container.querySelector('.bz-fav-toast')?.remove();

                const toast = document.createElement('div');
                toast.className = 'bz-fav-toast';
                toast.innerHTML = `
                    <div class="bz-fav-toast-icon"><i class="fas fa-heart"></i></div>
                    <div class="bz-fav-toast-text">
                        <span class="bz-fav-toast-label">${isAdded ? 'Added to Favourites' : 'Removed from Favourites'}</span>
                        <span class="bz-fav-toast-song">${sanitizeHTML(songTitle || 'Song')}</span>
                    </div>`;

                container.appendChild(toast);
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    toast.style.opacity = '1';
                    toast.style.transform = 'translateY(0) scale(1)';
                }));

                const timer = setTimeout(() => {
                    toast.style.opacity = '0';
                    toast.style.transform = 'translateY(8px) scale(0.96)';
                    setTimeout(() => toast.remove(), 300);
                }, 3500);

                toast.addEventListener('click', () => {
                    clearTimeout(timer);
                    toast.style.opacity = '0';
                    toast.style.transform = 'translateY(8px) scale(0.96)';
                    setTimeout(() => toast.remove(), 280);
                }, { once: true });
            }

            /* ── Modal button wiring ── */
            function updateFavModalBtn(song) {
                const btn = document.getElementById('modal-fav-btn');
                if (!btn) return;
                if (song) btn._bzSongData = song;
                const songData = btn._bzSongData || window._bzMenuSong;
                if (!songData || !songData.id) return;
                const label = document.getElementById('modal-fav-btn-label');
                const icon = btn.querySelector('i');
                const favd = isFavourite(songData.id);
                if (label) label.textContent = favd ? 'Remove from Favourites' : 'Add to Favourites';
                if (icon) icon.className = (favd ? 'fas' : 'far') + ' fa-heart bz-fav-modal-icon';
                btn.classList.toggle('bz-fav-modal-btn--active', favd);
            }

            function wireFavModalBtn() {
                const btn = document.getElementById('modal-fav-btn');
                if (!btn || btn._bzWired) return;
                btn._bzWired = true;
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const songData = btn._bzSongData || window._bzMenuSong;
                    if (!songData || !songData.id) return;
                    toggleFavourite(songData);
                    updateFavModalBtn(songData);
                    setTimeout(() => {
                        if (typeof window.closePlaylistModal === 'function') window.closePlaylistModal();
                    }, 120);
                });
            }

            // Patch openSongMenu to capture song and refresh button
            function patchOpenSongMenuForFav() {
                if (window._bzFavMenuPatched) return;
                if (!window.openSongMenu) return;
                const _orig = window.openSongMenu;
                window.openSongMenu = function (song, triggerEvent) {
                    window._bzMenuSong = song;
                    const result = _orig.apply(this, arguments);
                    setTimeout(() => updateFavModalBtn(song), 0);
                    return result;
                };
                window._bzFavMenuPatched = true;
            }

            // MutationObserver safety net
            function watchModalForFav() {
                const modal = document.getElementById('playlist-modal');
                if (!modal) return;
                const obs = new MutationObserver(() => {
                    const isVisible = modal.style.display === 'flex' || modal.classList.contains('visible');
                    if (isVisible && window._bzMenuSong) updateFavModalBtn(window._bzMenuSong);
                });
                obs.observe(modal, { attributes: true, attributeFilter: ['style', 'class'] });
            }

            /* ── Boot ── */
            wireFavModalBtn();
            watchModalForFav();
            patchOpenSongMenuForFav();
            setTimeout(() => { wireFavModalBtn(); patchOpenSongMenuForFav(); }, 100);

            // Sync on load so Favourites playlist survives refresh
            setTimeout(() => syncFavouritesPlaylist(), 600);

            /* ── Expose globals (used by beatzen-pro.js queue rows) ── */
            window.bzIsFavourite = isFavourite;
            window.bzAddFavourite = addFavourite;
            window.bzRemoveFavourite = removeFavourite;
            window.bzToggleFavourite = toggleFavourite;
            window.bzSyncFavouritesPlaylist = syncFavouritesPlaylist;
            window.bzUpdateFavModalBtn = updateFavModalBtn;
        })();

        // POSITION RESTORE
        window.applySavedTime = function () {
            // Parse position
            let saved = NaN, savedSongId = '', savedDur = NaN;
            try {
                const raw = localStorage.getItem('beatZen_lastPosition');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === 'object' && 'id' in parsed) {
                        saved = parseFloat(parsed.t);
                        savedSongId = String(parsed.id || '');
                        savedDur = parseFloat(parsed.d);
                    } else {
                        saved = parseFloat(raw);
                    }
                }
            } catch (_) {
                saved = parseFloat(localStorage.getItem('beatZen_lastPosition') || '');
            }

            const _fmtQ = (s) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

            // FIX: resolve the song-id match up front
            let songMismatch = false;
            if (savedSongId) {
                const currentSongId = String(
                    window.playingAlbum?.songs?.[window.currentSongIndex]?.id ?? ''
                );
                if (currentSongId && currentSongId !== savedSongId) {
                    localStorage.removeItem('beatZen_lastPosition');
                    songMismatch = true;
                }
            }

            // FIX: paint duration independently of the saved<=2 time gate below
            if (!songMismatch && isFinite(savedDur) && savedDur > 0) {
                document.querySelectorAll('#duration, #bz-lyrics-duration').forEach(el => el.textContent = _fmtQ(savedDur));
            }

            // FIX (critical): every early-return path below MUST set _restoreApplied
            if (songMismatch || !saved || isNaN(saved) || saved <= 2) {
                audioPlayer._restoreApplied = true;
                return;
            }

            // Paint saved current-time + progress immediately from payload
            if (isFinite(savedDur) && savedDur > 0) {
                document.querySelectorAll('#current-time, #bz-lyrics-current-time').forEach(el => el.textContent = _fmtQ(saved));
                const pct = Math.min(100, (saved / savedDur) * 100);
                document.querySelectorAll('#progress, #bz-lyrics-progress').forEach(el => el.style.width = `${pct}%`);
            }

            if (audioPlayer._restoreApplied) return;

            let retries = 0;
            const MAX_RETRIES = 5;
            // FIX (refresh-restarts-from-0 bug): the 800ms last-resort fallback
            let _secondChanceArmed = false;

            // Seeking reliably requires readyState >= 2 (HAVE_CURRENT_DATA)
            function _seekReady() {
                return isFinite(audioPlayer.duration) && audioPlayer.duration > 0
                    && audioPlayer.readyState >= 2;
            }

            function doSeek() {
                if (audioPlayer._restoreApplied) return;

                const dur = audioPlayer.duration;
                if (!isFinite(dur) || dur <= 0) {
                    // Duration not yet known
                    return;
                }

                // FIX: only latch _restoreApplied
                const wasRisky = !_seekReady();
                if (!wasRisky) audioPlayer._restoreApplied = true;

                // Clean up all listeners we registered
                if (audioPlayer._restoreCPHandler) {
                    audioPlayer.removeEventListener('canplay', audioPlayer._restoreCPHandler);
                    audioPlayer.removeEventListener('loadedmetadata', audioPlayer._restoreCPHandler);
                    audioPlayer._restoreCPHandler = null;
                }

                const safe = Math.min(saved, dur - 1);
                audioPlayer.currentTime = safe;

                // Confirm the seek landed — iOS sometimes resets to 0 after first seek
                function confirmSeek() {
                    if (Math.abs(audioPlayer.currentTime - safe) > 2 && retries < MAX_RETRIES) {
                        retries++;
                        audioPlayer.currentTime = safe;
                        // Wait for next seeked event to re-confirm
                        audioPlayer.addEventListener('seeked', confirmSeek, { once: true });
                    } else if (Math.abs(audioPlayer.currentTime - safe) > 2) {
                        if (wasRisky && !_secondChanceArmed && !audioPlayer._restoreApplied) {
                            // FIX: this attempt fired before the browser had enough data buffered
                            _secondChanceArmed = true;
                            retries = 0;
                            armSecondChanceRetry();
                        } else {
                            // FIX: retries (and any second chance) exhausted and the seek
                            audioPlayer._restoreApplied = true;
                            console.warn('Beat Zen: position restore seek did not land after', MAX_RETRIES, 'retries — keeping last displayed position');
                        }
                    } else {
                        // Seek confirmed — update UI to match actual position
                        audioPlayer._restoreApplied = true;
                        const actual = audioPlayer.currentTime;
                        const d = audioPlayer.duration;
                        if (isFinite(d) && d > 0) {
                            document.querySelectorAll('#progress, #bz-lyrics-progress').forEach(el => el.style.width = `${(actual / d) * 100}%`);
                            document.querySelectorAll('#current-time, #bz-lyrics-current-time').forEach(el => el.textContent = formatTime(actual));
                            /* FIX: also update duration — was previously left as 0:00 / --:-- */
                            document.querySelectorAll('#duration, #bz-lyrics-duration').forEach(el => el.textContent = formatTime(d));
                        }
                    }
                }
                audioPlayer.addEventListener('seeked', confirmSeek, { once: true });

                // Also update UI immediately as optimistic feedback
                if (isFinite(dur) && dur > 0) {
                    document.querySelectorAll('#progress, #bz-lyrics-progress').forEach(el => el.style.width = `${(safe / dur) * 100}%`);
                    document.querySelectorAll('#current-time, #bz-lyrics-current-time').forEach(el => el.textContent = formatTime(safe));
                    /* FIX: paint duration immediately so it never shows 0:00 */
                    document.querySelectorAll('#duration, #bz-lyrics-duration').forEach(el => el.textContent = formatTime(dur));
                }
            }

            // FIX: the "second chance" retry path for a risky attempt that never
            function armSecondChanceRetry() {
                function onCleanReady() {
                    if (audioPlayer._restoreApplied) return;
                    if (_seekReady()) {
                        audioPlayer.removeEventListener('canplaythrough', onCleanReady);
                        audioPlayer.removeEventListener('progress', onCleanReady);
                        doSeek();
                    }
                }
                audioPlayer.addEventListener('canplaythrough', onCleanReady);
                audioPlayer.addEventListener('progress', onCleanReady);
                setTimeout(() => {
                    if (audioPlayer._restoreApplied) return;
                    audioPlayer.removeEventListener('canplaythrough', onCleanReady);
                    audioPlayer.removeEventListener('progress', onCleanReady);
                    audioPlayer._restoreApplied = true;
                }, 5000);
            }

            // INSTANT RESTORE: Try immediately
            if (_seekReady()) {
                doSeek();
                return;
            }

            // Early fallback at 50ms
            setTimeout(() => {
                if (!audioPlayer._restoreApplied && _seekReady()) {
                    doSeek();
                }
            }, 50);

            // Also wait for audio events as a belt-and-suspenders path.
            function onReady() {
                if (audioPlayer._restoreApplied) return;
                if (_seekReady()) {
                    doSeek();
                }
            }

            // Clean up any stale handlers from previous calls
            if (audioPlayer._restoreCPHandler) {
                audioPlayer.removeEventListener('canplay', audioPlayer._restoreCPHandler);
                audioPlayer.removeEventListener('loadedmetadata', audioPlayer._restoreCPHandler);
            }
            audioPlayer._restoreCPHandler = onReady;
            audioPlayer.addEventListener('canplay', onReady, { once: true });
            audioPlayer.addEventListener('loadedmetadata', onReady, { once: true });
            // 'progress' fires repeatedly as more of the stream buffers in
            function onProgress() {
                if (audioPlayer._restoreApplied) return;
                if (_seekReady()) {
                    audioPlayer.removeEventListener('progress', onProgress);
                    doSeek();
                }
            }
            audioPlayer.addEventListener('progress', onProgress);

            // Final safety net: reduced from 4000ms to 800ms so the bar never sits
            clearTimeout(audioPlayer._restoreTimeout);
            audioPlayer._restoreTimeout = setTimeout(() => {
                if (audioPlayer._restoreApplied) return;
                audioPlayer.removeEventListener('progress', onProgress);
                if (isFinite(audioPlayer.duration) && audioPlayer.duration > 0) {
                    // Last resort
                    doSeek();
                } else {
                    // FIX: duration never became available
                    audioPlayer._restoreApplied = true;
                    if (audioPlayer._restoreCPHandler) {
                        audioPlayer.removeEventListener('canplay', audioPlayer._restoreCPHandler);
                        audioPlayer.removeEventListener('loadedmetadata', audioPlayer._restoreCPHandler);
                        audioPlayer._restoreCPHandler = null;
                    }
                }
            }, 800);
        };

        /* REAL-TIME ENGINE — handled by syncProgressBar (ontimeupdate above) */

        /* ROUTING */
        function handleDeepLinking(navFromOverride) {
            const hash = window.location.hash;

            // Auth guard
            if (window.bzIsAuthenticated === false) { showBzAuthGate(); return; }
            if (window.bzIsAuthenticated === undefined && !localStorage.getItem('beatZen_session_uid')) {
                // FIX: see _bzGetAuthReadyPromise comment near bzNavGuard
                _bzGetAuthReadyPromise().then(function () {
                    if (!window.bzIsAuthenticated) { showBzAuthGate(); return; }
                    handleDeepLinking(navFromOverride); // retry now Firebase has resolved
                });
                return;
            }
            // ─────────────────────────────────────────────────────────────────

            // FIX: Premium gating — Home/Search/Playlists/Settings/Updates
            // (and album deep-links, which live under Home) require an active
            // premium subscription; only Profile and Premium stay reachable.
            if (!bzIsPremiumUser() && hash !== '#profile' && hash !== '#premium') {
                displayPremium(true);
                return;
            }

            /* ── Album deep-link: #album-{id} ── */
            if (hash.startsWith('#album-')) {
                const albumId = hash.replace('#album-', '').split('/')[0]; // strip /song- suffix if present
                if (!albumId) { displayHome(true); return; }

                // Resolve which nav tab to highlight when restoring an album view
                const resolvedNavFrom = navFromOverride || history.state?.navFrom || 'home';

                /* masterPool may not be ready yet on cold boot — retry with back-off */
                function tryOpen(attemptsLeft) {
                    const found = window.masterPool?.find(a =>
                        String(a.id || a.name || a.title) === String(albumId)
                    );
                    if (found) {
                        const type = found.type || 'Movie';
                        const resolved = window.resolveData ? window.resolveData(found, type) : found;
                        window.selectAlbum(resolved, true, resolvedNavFrom);
                    } else if (attemptsLeft > 0) {
                        setTimeout(() => tryOpen(attemptsLeft - 1), 250);
                    } else {
                        // masterPool never contains smart playlists
                        const smart = typeof window.bzGetSmartPlaylist === 'function'
                            ? window.bzGetSmartPlaylist(albumId)
                            : null;
                        if (smart) {
                            const smartType = smart.type || 'Playlist';
                            const smartResolved = window.resolveData
                                ? window.resolveData(smart, smartType)
                                : smart;
                            window.selectAlbum(smartResolved, true, resolvedNavFrom);
                        } else {
                            /* Album not found anywhere — fall back to home silently */
                            displayHome(true);
                        }
                    }
                }
                tryOpen(8); // up to 8 × 250ms = 2s of retries
                return;
            }

            if (hash === '#playlists') displayPlaylists(true);
            else if (hash === '#artists') displayArtists(true);
            else if (hash === '#about' || hash === '#settings') displaySettings(true);
            else if (hash === '#updates') displayUpdates(true);
            else if (hash === '#premium') displayPremium(true);
            else if (hash === '#profile') displayProfile(true);
            else if (hash === '#search') {
                hideAllViews();
                searchContainer?.classList.remove('hidden');
                if (searchResultsContainer) searchResultsContainer.style.display = 'block';
            }
            else displayHome(true);
        }

        /* BOOT */
        // Guard: both popstate AND hashchange fire on back-navigation. Without
        let _popstateHandled = false;

        window.onpopstate = (event) => {
            // FIX Bug 3: every popstate corresponds to one back/forward step
            window._bzSpaNavDepth = Math.max(0, window._bzSpaNavDepth - 1);
            /* Signal to the hashchange listener that this navigation is already */
            _popstateHandled = true;
            // Wrap in try/finally so EVERY early-return path
            try {
                // FIX Issue 5: Reset _popstateHandled synchronously at the END
                const hash = window.location.hash;
                const state = event.state || {};
                const mp = document.getElementById('main-player');
                if (mp?.classList.contains('maximized') && hash !== '#player') {
                    // toggleMaximize is a startApp() closure
                    if (window._bzToggleMaximize) window._bzToggleMaximize(true);
                    return;
                }

                // FIX: Back-gesturing out of the Admin Dashboard's user list
                const _adminEl = document.getElementById('bz-admin-dashboard-container');
                if (_adminEl && _adminEl.style.display !== 'none' && hash !== '#admin') {
                    if (typeof _bzAdminStopUserListListener === 'function') _bzAdminStopUserListListener();
                    if (typeof _bzAdminStopUserDetailListener === 'function') _bzAdminStopUserDetailListener();
                }

                // FIX: When the user presses Back from an album view
                if (albumViewContainer.style.display !== 'none') {
                    // We are navigating back from album view
                    const callerView = state.navFrom || state.view || 'home';
                    if (typeof state.scrollY === 'number') {
                        window.scrollPositions[callerView] = state.scrollY;
                        localStorage.setItem('beatZen_scroll_' + callerView, String(state.scrollY));
                    }
                }

                // Auth guard for back-navigation
                const _guardedHashes = ['#home', '#playlists', '#artists', '#search', '#settings', '#about', '#profile', '#premium', ''];
                if (_guardedHashes.some(h => hash === h || (!hash && h === ''))) {
                    const _auth = window.bzIsAuthenticated;
                    const _uid = localStorage.getItem('beatZen_session_uid');
                    if (_auth === false) { showBzAuthGate(); return; }
                    if (_auth === undefined && !_uid) {
                        // Firebase not yet resolved and no cached session
                        _bzGetAuthReadyPromise().then(function () {
                            if (!window.bzIsAuthenticated) showBzAuthGate();
                        });
                        return;
                    }
                    // _auth === true, or _auth undefined but cached UID present → allow
                }

                // FIX: Premium gating applies to back/forward navigation the
                // same way it does to nav-link clicks and direct hash links.
                if (!bzIsPremiumUser() && hash !== '#profile' && hash !== '#premium') {
                    displayPremium(true);
                    return;
                }

                if (!hash || hash === '#home') {
                    // If state carries a scrollY
                    if (typeof state.scrollY === 'number') {
                        window.scrollPositions['home'] = state.scrollY;
                        localStorage.setItem('beatZen_scroll_home', String(state.scrollY));
                    }
                    displayHome(true);
                }
                else if (hash === '#playlists') {
                    // If state carries a scrollY
                    if (typeof state.scrollY === 'number') {
                        window.scrollPositions['playlists'] = state.scrollY;
                        localStorage.setItem('beatZen_scroll_playlists', String(state.scrollY));
                    }
                    displayPlaylists(true);
                }
                else if (hash === '#artists') displayArtists(true);
                else if (hash === '#about' || hash === '#settings') displaySettings(true);
                else if (hash === '#updates') displayUpdates(true);
                else if (hash === '#premium') displayPremium(true);
                else if (hash === '#profile') displayProfile(true);
                else if (hash === '#search') { hideAllViews(); searchContainer?.classList.remove('hidden'); if (searchResultsContainer) searchResultsContainer.style.display = 'block'; }
                else if (hash.startsWith('#album-')) handleDeepLinking(state.navFrom);
            } finally {
                // FIX: always reset, even when an early return fires
                _popstateHandled = false;
            }
        };
        window.addEventListener('hashchange', () => {
            if (_popstateHandled) return; // popstate already handling this transition
            handleDeepLinking();
        });
        window.addEventListener('scroll', () => {
            if (albumViewContainer.style.display === 'none') {
                const id = window.lastActiveView || 'home';
                window.scrollPositions[id] = window.scrollY;
                localStorage.setItem(`beatZen_scroll_${id}`, window.scrollY);
                // FIX Bug F: keep the current history entry's scrollY up-to-date via
                try {
                    if (history.state && history.state.view === id) {
                        history.replaceState(
                            Object.assign({}, history.state, { scrollY: window.scrollY }),
                            '', window.location.hash
                        );
                    }
                } catch (_) { /* replaceState can throw on some browser edge cases */ }
            } else if (window.currentAlbum && window.currentAlbum.id != null) {
                // FIX: the album/song-list view's scroll was never saved at all
                window._bzSetAlbumScroll(window.currentAlbum.id, window.scrollY);
            }
        }, { passive: true });

        setTimeout(() => {
            const hash = window.location.hash;
            const extra = JSON.parse(localStorage.getItem('beatZen_importedPlaylists') || '[]');
            extra.forEach(pl => { if (!window.masterPool.some(m => String(m.id) === String(pl.id))) window.masterPool.push(pl); });
            if (typeof customGenreData !== 'undefined') {
                Object.values(customGenreData).flat().forEach(item => { if (!window.masterPool.find(m => String(m.id) === String(item.id))) window.masterPool.push(item); });
            }
            // NOTE: Last-played song restore is handled exclusively

            // Auth-gated boot view restore — ALL views require sign-in.
            bzNavGuard(function _restoreBootView() {
                var _bh = window.location.hash; // re-read — may differ after async tick
                var persistedView = localStorage.getItem('beatZen_activeView');

                // FIX: Premium gating applies on cold boot too — only Profile
                // and Premium stay reachable for a user without an active
                // subscription; everything else bounces to the Premium screen.
                var _wantsProfile = persistedView === 'profile' || _bh === '#profile';
                var _wantsPremium = persistedView === 'premium' || _bh === '#premium';
                if (!bzIsPremiumUser() && !_wantsProfile && !_wantsPremium) {
                    displayPremium(true);
                    return;
                }

                if (_bh.startsWith('#album-')) {
                    handleDeepLinking();
                } else if (persistedView === 'playlists') {
                    displayPlaylists(true);
                } else if (persistedView === 'search') {
                    hideAllViews();
                    searchContainer?.classList.remove('hidden');
                    if (searchResultsContainer) searchResultsContainer.style.display = 'block';
                    updateNav('search');
                } else if (persistedView === 'settings') {
                    // FIX: 'settings' was never handled here
                    displaySettings(true);
                } else if (persistedView === 'updates') {
                    displayUpdates(true);
                } else if (persistedView === 'premium') {
                    displayPremium(true);
                } else if (persistedView === 'profile') {
                    displayProfile(true);
                } else if (_bh === '#playlists') {
                    displayPlaylists(true);
                } else if (_bh === '#artists') {
                    displayArtists(true);
                } else if (_bh === '#settings' || _bh === '#about') {
                    displaySettings(true);
                } else if (_bh === '#updates') {
                    displayUpdates(true);
                } else if (_bh === '#premium') {
                    displayPremium(true);
                } else if (_bh === '#profile') {
                    displayProfile(true);
                } else {
                    /* Home is always the safe default — no cache, settings, unknown hash */
                    displayHome(true);
                }

                // FIX Bug 4: removed the redundant window.scrollTo here.
            });
        }, 0);

    } // end startApp()

    // SMART DATA LOADER

    /** Launch app once data is ready */
    /* Notify helper */
    function _bootToast(msg, delay) {
        setTimeout(() => { if (typeof showToast === 'function') showToast(msg, 5000); }, delay || 0);
    }

    // New-content diff helper
    function _bzFindNewAlbums(oldData, newData) {
        if (!oldData || !newData) return { albums: [], songCount: 0 };
        // Build a flat Set of every album id present in the cached (old) data
        const oldIds = new Set();
        Object.values(oldData).forEach(function (arr) {
            if (!Array.isArray(arr)) return;
            arr.forEach(function (a) { if (a && a.id != null) oldIds.add(String(a.id)); });
        });
        const newAlbums = [];
        let songCount = 0;
        Object.values(newData).forEach(function (arr) {
            if (!Array.isArray(arr)) return;
            arr.forEach(function (a) {
                if (!a || a.id == null) return;
                if (!oldIds.has(String(a.id))) {
                    newAlbums.push(a);
                    songCount += Array.isArray(a.songs) ? a.songs.length : 0;
                }
            });
        });
        return { albums: newAlbums, songCount };
    }

    function launchWhenReady(data, fromCache) {
        window.customYearAlbumsData = sanitizeSheetData(data);
        window._bzDataVersion = Date.now().toString();

        var _skipAnim = (function () {
            try {
                const ov = document.getElementById('bz-loader-overlay');
                return ov && ov.querySelector('.bz-loader-ring') &&
                    ov.querySelector('.bz-loader-ring').style.opacity === '0';
            } catch (_) { return false; }
        })();

        function _doHide() {
            if (_skipAnim) {
                const ov = document.getElementById('bz-loader-overlay');
                if (ov) ov.style.transition = 'none';
            }
            loaderHide();
        }

        // Unified "ready to reveal" wait
        function _waitForReadyThenHide() {
            var _attempts = 0;
            // Max wait: 2.5s (150 × ~16ms rAF ticks). ─ Deep-link tryOpen()
            var _maxAttempts = 150; // 150 × ~16ms ≈ 2.5s max

            // Reuses the same synchronous "looks signed in" signal bzNavGuard uses
            var _likelySignedIn = _bzLikelySignedIn();

            function _check() {
                var ysc = document.getElementById('year-sections-container');
                var rawHasCards = ysc && ysc.querySelector('.album-card') && ysc.dataset.bzScrollReady === '1';
                var gate = document.getElementById('bz-auth-gate');
                var rawGateVisible = gate && gate.classList.contains('bz-gate-visible');

                // _stillResolvingGuestPath is true only when: • html still carries
                var _stillResolvingGuestPath = !_likelySignedIn &&
                    document.documentElement.classList.contains('bz-guest') &&
                    window.bzIsAuthenticated === undefined;

                var hasCards = rawHasCards && !_stillResolvingGuestPath;
                // Don't let the gate's CSS pre-render count as "ready"
                var gateVisible = rawGateVisible && !(_likelySignedIn && _stillResolvingGuestPath);
                // On an album deep-link reload (#album-...)
                var albumContainer = document.getElementById('album-view-container');
                var albumReady = albumContainer && albumContainer.style.display !== 'none' &&
                    albumContainer.dataset.bzScrollReady === '1' &&
                    (albumContainer.querySelector('.song-item') || albumContainer.querySelector('.bz-empty')) &&
                    !_stillResolvingGuestPath;
                if (hasCards || gateVisible || albumReady || _attempts >= _maxAttempts) {
                    requestAnimationFrame(_doHide);
                } else {
                    _attempts++;
                    // Poll every animation frame (~16ms) instead of every 50ms
                    requestAnimationFrame(_check);
                }
            }
            _check();
        }

        if (fromCache) {
            startApp();
            // startApp queues a setTimeout(0) for the boot view restore. We queue
            setTimeout(_waitForReadyThenHide, 0);
        } else {
            requestAnimationFrame(function () {
                startApp();
                requestAnimationFrame(function () {
                    setTimeout(_waitForReadyThenHide, 0);
                });
            });
        }
    }

    // BOOT: always show the full logo + dots splash on every load FIX
    (function boot() {
        let launched = false;

        var cached = getCachedSheetData();
        var fromCache = !!cached;

        // No artificial minimum delay

        // Auth-ready promise

        // Sheets data promise
        var sheetsPromise;

        /* Background refresh helper */
        function _bgRefresh(currentCached) {
            fetch(BEATZEN_SHEET_URL, { cache: 'no-store' })
                .then(function (r) {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.json();
                })
                .then(function (freshData) {
                    const diff = _bzFindNewAlbums(currentCached, freshData);
                    setCachedSheetData(freshData);
                    // Only update live app data if something actually changed
                    if (diff.albums.length > 0) {
                        window.customYearAlbumsData = sanitizeSheetData(freshData);
                        window._bzDataVersion = Date.now().toString();
                        if (typeof window.bzOnSheetDataRefresh === 'function') {
                            window.bzOnSheetDataRefresh(freshData);
                        }
                        const names = diff.albums
                            .map(function (a) { return a.title || a.name || ''; })
                            .filter(Boolean);
                        const MAX = 3;
                        let label;
                        if (names.length === 0) {
                            label = diff.albums.length + ' new album' + (diff.albums.length > 1 ? 's' : '');
                        } else if (names.length <= MAX) {
                            label = names.join(', ');
                        } else {
                            label = names.slice(0, MAX).join(', ') + ' +' + (names.length - MAX) + ' more';
                        }
                        const songWord = diff.songCount === 1 ? 'song' : 'songs';
                        _bootToast('✦ New: ' + label + ' (' + diff.songCount + ' ' + songWord + ')', 400);
                    }
                })
                .catch(function (err) {
                    console.warn('Beat Zen: Background refresh failed (using cache).', err);
                });
        }

        if (cached) {
            /* ── FAST PATH: cache hit → launch instantly ── */
            sheetsPromise = Promise.resolve(cached);
        } else {
            /* ── COLD PATH: no cache → fetch now with no-store to skip GAS cache ── */
            sheetsPromise = fetch(BEATZEN_SHEET_URL, { cache: 'no-store' })
                .then(function (r) {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.json();
                })
                .then(function (data) {
                    setCachedSheetData(data);
                    return data;
                });
        }

        /* ── Gate: wait for song data only — no artificial minimum ── */
        sheetsPromise
            .then(function (data) {
                if (launched) return;
                launched = true;
                launchWhenReady(data, fromCache);
            })
            .catch(function (err) {
                // FIX: previously this called loaderHide() WITHOUT calling startApp()
                console.error('Beat Zen: Boot failed.', err);
                if (!launched) {
                    launched = true;
                    var _staleData = getCachedSheetData();
                    if (_staleData) {
                        // Use stale cache — app boots normally, fresh data loads next time
                        var _el = document.getElementById('bz-loader-status');
                        if (_el) _el.textContent = 'Using saved data — music loads now';
                        launchWhenReady(_staleData, true);
                        _bootToast('Offline or slow connection — loaded from saved data', 600);
                    } else {
                        // Truly no data — show error and a retry button in the loader
                        var el = document.getElementById('bz-loader-status');
                        if (el) el.textContent = 'No connection — check your network and tap Retry';
                        var _sw = document.querySelector('.bz-loader-status-wrap');
                        if (_sw && !document.getElementById('bz-boot-retry-btn')) {
                            var _rb = document.createElement('button');
                            _rb.id = 'bz-boot-retry-btn';
                            _rb.textContent = 'Retry';
                            _rb.style.cssText = 'margin-top:12px;padding:9px 28px;border-radius:20px;border:none;background:linear-gradient(135deg,#7c3aed,#2575fc);color:#fff;font-size:0.85rem;font-weight:700;cursor:pointer;';
                            _rb.onclick = function () { window.location.reload(); };
                            _sw.appendChild(_rb);
                        }
                    }
                }
            });

        /* ── Hard safety net — loader ALWAYS hides even if everything fails ──── */
        setTimeout(function () {
            if (launched) return;
            // FIX: previously called only loaderHide() here
            console.warn('Beat Zen: boot safety timeout — forcing launch.');
            launched = true;
            var _stale = getCachedSheetData();
            if (_stale) {
                // Stale cache available
                launchWhenReady(_stale, true);
                _bootToast('Slow connection — loaded from saved data', 400);
            } else {
                // No cache, no data — show retry UI; don't call startApp with empty data
                var el = document.getElementById('bz-loader-status');
                if (el) el.textContent = 'Could not connect — tap Retry to try again';
                var _sw = document.querySelector('.bz-loader-status-wrap');
                if (_sw && !document.getElementById('bz-boot-retry-btn')) {
                    var _rb = document.createElement('button');
                    _rb.id = 'bz-boot-retry-btn';
                    _rb.textContent = 'Retry';
                    _rb.style.cssText = 'margin-top:12px;padding:9px 28px;border-radius:20px;border:none;background:linear-gradient(135deg,#7c3aed,#2575fc);color:#fff;font-size:0.85rem;font-weight:700;cursor:pointer;';
                    _rb.onclick = function () { window.location.reload(); };
                    _sw.appendChild(_rb);
                }
            }
        }, 12000);

        // Slow network detection
        var _fetchStart = Date.now();
        var _slowBannerTimer = null;
        var _slowDetected = false;

        // Show in-splash banner after 3s if still loading
        _slowBannerTimer = setTimeout(function () {
            if (launched) return;
            _slowDetected = true;
            var banner = document.getElementById('bz-slow-net-banner');
            if (banner) banner.classList.add('bz-slow-net-visible');
            var status = document.getElementById('bz-loader-status');
            if (status) status.textContent = 'Still loading… this may take a moment';
        }, 3000);

        // After launch, show floating toast if fetch took longer than 2s
        sheetsPromise.then(function () {
            clearTimeout(_slowBannerTimer);
            var elapsed = Date.now() - _fetchStart;
            if (elapsed > 2000) {
                _slowDetected = true;
                // Show floating toast 500ms after app becomes visible
                setTimeout(function () {
                    var toast = document.getElementById('bz-slow-net-toast');
                    if (!toast) return;
                    toast.style.display = 'flex';
                    requestAnimationFrame(function () {
                        requestAnimationFrame(function () {
                            toast.classList.add('bz-snt-show');
                        });
                    });
                    // Auto-dismiss after 6s
                    setTimeout(function () {
                        toast.classList.remove('bz-snt-show');
                        setTimeout(function () { toast.style.display = 'none'; }, 350);
                    }, 6000);
                }, 1700);
            }
        }).catch(function () { clearTimeout(_slowBannerTimer); });

        // Wire dismiss button for the floating toast
        var _toastClose = document.getElementById('bz-slow-net-toast-close');
        if (_toastClose) {
            _toastClose.addEventListener('click', function () {
                var toast = document.getElementById('bz-slow-net-toast');
                if (!toast) return;
                toast.classList.remove('bz-snt-show');
                setTimeout(function () { toast.style.display = 'none'; }, 350);
            });
        }

        // Offline / online detection
        window._bzOffline = !navigator.onLine;

        function _bzShowOfflineToast() {
            window._bzOffline = true;
            var t = document.getElementById('bz-offline-toast');
            if (!t) return;
            t.style.display = 'flex';
            requestAnimationFrame(function () {
                requestAnimationFrame(function () { t.classList.add('bz-snt-show'); });
            });
        }

        function _bzHideOfflineToast() {
            var t = document.getElementById('bz-offline-toast');
            if (!t) return;
            t.classList.remove('bz-snt-show');
            setTimeout(function () { t.style.display = 'none'; }, 350);
        }

        function _bzShowOnlineToast() {
            window._bzOffline = false;
            _bzHideOfflineToast();
            var t = document.getElementById('bz-online-toast');
            if (!t) return;
            t.style.display = 'flex';
            requestAnimationFrame(function () {
                requestAnimationFrame(function () { t.classList.add('bz-snt-show'); });
            });
            // Auto-dismiss after 4s
            setTimeout(function () {
                t.classList.remove('bz-snt-show');
                setTimeout(function () { t.style.display = 'none'; }, 350);
            }, 4000);
        }

        // FIX (mobile): a single 'offline' event from the OS network stack
        var _bzOfflineConfirmTimer = null;
        function _bzShowOfflineToastDebounced() {
            clearTimeout(_bzOfflineConfirmTimer);
            _bzOfflineConfirmTimer = setTimeout(function () {
                if (!navigator.onLine) _bzShowOfflineToast();
            }, 2500);
        }
        window.addEventListener('offline', _bzShowOfflineToastDebounced);
        window.addEventListener('online', function () {
            clearTimeout(_bzOfflineConfirmTimer);
            _bzShowOnlineToast();
        });

        // Show immediately if already offline on page load
        if (!navigator.onLine) _bzShowOfflineToast();

        // Wire dismiss buttons
        var _offlineClose = document.getElementById('bz-offline-toast-close');
        if (_offlineClose) _offlineClose.addEventListener('click', _bzHideOfflineToast);

        var _onlineClose = document.getElementById('bz-online-toast-close');
        if (_onlineClose) {
            _onlineClose.addEventListener('click', function () {
                var t = document.getElementById('bz-online-toast');
                if (!t) return;
                t.classList.remove('bz-snt-show');
                setTimeout(function () { t.style.display = 'none'; }, 350);
            });
        }
    })();

})();

/* sanitizeSheetData is defined inside the IIFE above */


// BEAT ZEN

const BeatZenButtons = {

    // HTML
    generateActionBarHTML: function (album, isPlaying) {
        const playBtnIcon = isPlaying ? 'fa-pause' : 'fa-play';
        const playBtnText = isPlaying ? 'Pause' : 'Play All';

        return `
            <div class="album-actions">
                <button id="album-sync-play" class="action-btn main-play">
                    <i class="fas ${playBtnIcon}"></i> <span>${playBtnText}</span>
                </button>

                <button id="share-status" class="action-btn secondary" title="Share to Status">
                    <i class="fas fa-share-nodes"></i>
                </button>
            </div>
        `;
    },

    // Logic
    initEventListeners: function (album, playAllCallback, toggleCallback) {

        // Play
        const syncBtn = document.getElementById('album-sync-play');
        if (syncBtn) {
            syncBtn.onclick = () => {
                const isThisAlbumActive = (window.playingAlbum && String(window.playingAlbum.id) === String(album.id));

                if (isThisAlbumActive) {
                    toggleCallback();
                } else {
                    playAllCallback();
                }
                // Reset
                syncBtn.blur();
            };
        }

        // Share
        const shareBtn = document.getElementById('share-status');
        if (shareBtn) {
            shareBtn.onclick = async () => {
                const albumUrl = `${window.location.origin}${window.location.pathname}#album-${album.id}`;
                if (navigator.share) {
                    try {
                        await navigator.share({ title: `BeatZen — ${album.title}`, url: albumUrl });
                    } catch (err) { }
                } else {
                    try {
                        await navigator.clipboard.writeText(albumUrl);
                        showToast('✓ Album link copied!');
                    } catch (_) {
                        const ta = Object.assign(document.createElement('textarea'), { value: albumUrl });
                        Object.assign(ta.style, { position: 'fixed', opacity: '0' });
                        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
                        showToast('✓ Album link copied!');
                    }
                }
                shareBtn.blur();
            };
        }
    },

    // Sync
    updateSyncButtonUI: function (isPaused) {
        const syncBtn = document.getElementById('album-sync-play');
        if (syncBtn) {
            const icon = syncBtn.querySelector('i');
            const span = syncBtn.querySelector('span');

            if (icon && span) {
                // Icons
                icon.className = isPaused ? 'fas fa-play' : 'fas fa-pause';
                span.textContent = isPaused ? 'Play All' : 'Pause';
            }
        }
    }
};

// BEAT ZEN

(function () {
    "use strict";

    // CORE CONFIGURATION
    const CONFIG = {
        BOOT_DELAY: 400,        // Sync with main script indexing
        SEEK_HANDSHAKE: 700,    // Wait for mobile audio buffer
        SWIPE_LIMIT: 60         // Gesture sensitivity
    };

    const state = {
        isMobile: () => window.innerWidth <= 768,
        restored: false,
        restoring: false, // true while a _tryRestoreSession retry chain is in flight
        startX: 0,
        startY: 0
    };

    /********************************/
    /* MOBILE RECOVERY ENGINE       */
    /********************************/

    /* FIX: true while the sign-in/sign-up gate is covering the app — a
       "couldn't restore session" toast on top of that screen is confusing,
       since the user hasn't picked anything yet. */
    function _bzAuthGateVisible() {
        const gate = document.getElementById('bz-auth-gate');
        return !!(gate && gate.classList.contains('bz-gate-visible'));
    }

    /* Internal retry helper */
    function _tryRestoreSession(attemptsLeft) {
        const savedSong = localStorage.getItem('lastPlayedSong');
        const audio = document.getElementById('audio-player');
        const mainPlayer = document.getElementById('main-player');

        // FIX (root cause): nothing was ever saved — new install, guest
        // browsing, or a signed-out user. There is no session to restore,
        // so this is NOT a failure. Previously this fell through to the
        // "not ready" branch below, burned through every retry (since a
        // missing key never becomes present), and then fired a false
        // "couldn't restore your last session" toast — which is why it was
        // showing up even before anyone had signed up or signed in.
        if (!savedSong) {
            state.restored = true;
            window._bzAutoPlayAfterRestore = false;
            if (typeof updatePlayPauseIcon === 'function') updatePlayPauseIcon();
            window.isShuffling = localStorage.getItem('beatZen_shuffle') === 'true';
            window.repeatMode = parseInt(localStorage.getItem('beatZen_repeat_mode') || '0', 10);
            if (![0, 1, 2].includes(window.repeatMode)) window.repeatMode = 0;
            window.isLooping = window.repeatMode === 2;
            if (window.syncPlaybackModesUI) window.syncPlaybackModesUI();
            return; // Nothing to restore — stay silent, no toast.
        }

        // All three must be ready: audio element, saved data, and the app engine
        if (!audio || !window.masterPool || !window.masterPool.length ||
            !window.playSong || !window.resolveData) {
            if (attemptsLeft > 0) {
                setTimeout(() => _tryRestoreSession(attemptsLeft - 1), 300);
            } else {
                console.warn("Beat Zen: masterPool/playSong not ready after max retries — restore aborted");
                // FIX: without this, every togglePlayback() click while stuck
                state.restored = true;
                if (window.syncPlaybackModesUI) window.syncPlaybackModesUI();
                // FIX (critical): a failed restore must NOT leave
                window._bzAutoPlayAfterRestore = false;
                if (typeof updatePlayPauseIcon === 'function') updatePlayPauseIcon();
                // FIX: don't surface a playback toast over the sign-in/sign-up gate
                if (!_bzAuthGateVisible() && typeof showToast === 'function') showToast("Couldn't restore your last session — pick a song to start playing.");
            }
            return;
        }

        try {
            const data = JSON.parse(savedSong);
            const { albumId, songIndex, songId, type } = data;

            // 1. Re-link to master data pool. Match against all three raw
            const obj = window.masterPool.find(a =>
                String(a.id || '') === String(albumId) ||
                String(a.name || '') === String(albumId) ||
                String(a.title || '') === String(albumId)
            );

            // Album not yet in masterPool — Sheets data may still be loading. Retry.
            if (!obj) {
                if (attemptsLeft > 0) {
                    setTimeout(() => _tryRestoreSession(attemptsLeft - 1), 300);
                    return;
                }

                // Out of masterPool retries — try the smart-playlist resolver first.
                const smart = typeof window.bzGetSmartPlaylist === 'function'
                    ? window.bzGetSmartPlaylist(albumId)
                    : null;

                if (smart) {
                    // Smart playlist found
                    const smartType = smart.type || 'Playlist';
                    const hydrated = window.resolveData
                        ? window.resolveData(smart, smartType)
                        : smart;

                    if (hydrated) {
                        window.playingAlbum = hydrated;
                        let resolvedIndex = -1;
                        if (songId) {
                            resolvedIndex = hydrated.songs.findIndex(s => String(s.id) === String(songId));
                        }
                        if (resolvedIndex < 0) {
                            const safeIndex = Math.max(0, parseInt(songIndex) || 0);
                            resolvedIndex = (hydrated.songs && hydrated.songs[safeIndex]) ? safeIndex : 0;
                        }
                        window.currentSongIndex = resolvedIndex;
                        window.playSong(window.currentSongIndex, false);

                        state.restored = true;
                        if (window.syncPlaybackModesUI) window.syncPlaybackModesUI();
                        return;
                    }
                }

                // Neither masterPool nor smart-playlist resolved the albumId
                console.warn("Beat Zen: Album not found after max retries:", albumId);
                // FIX: same as above
                state.restored = true;
                if (window.syncPlaybackModesUI) window.syncPlaybackModesUI();
                // FIX (critical): this is the exact failure mode that follows a live
                window._bzAutoPlayAfterRestore = false;
                if (typeof updatePlayPauseIcon === 'function') updatePlayPauseIcon();
                // FIX: don't surface a playback toast over the sign-in/sign-up gate
                if (!_bzAuthGateVisible() && typeof showToast === 'function') showToast("Couldn't restore your last session — pick a song to start playing.");
                return;
            }

            // 2. Rehydrate playing state — resolveData builds full song objects
            const hydrated = window.resolveData(obj, type || obj.type || 'Movie');

            if (!hydrated) {
                console.warn("Beat Zen: resolveData returned null for", albumId);
                if (attemptsLeft > 0) {
                    setTimeout(() => _tryRestoreSession(attemptsLeft - 1), 300);
                } else {
                    // FIX: same as above
                    state.restored = true;
                    if (window.syncPlaybackModesUI) window.syncPlaybackModesUI();
                    window._bzAutoPlayAfterRestore = false;
                    if (typeof updatePlayPauseIcon === 'function') updatePlayPauseIcon();
                    // FIX: don't surface a playback toast over the sign-in/sign-up gate
                    if (!_bzAuthGateVisible() && typeof showToast === 'function') showToast("Couldn't restore your last session — pick a song to start playing.");
                }
                return;
            }

            // 3. Set global state BEFORE calling playSong so UI reads are always
            window.playingAlbum = hydrated;
            let resolvedIndex = -1;
            if (songId) {
                resolvedIndex = hydrated.songs.findIndex(s => String(s.id) === String(songId));
            }
            if (resolvedIndex < 0) {
                const safeIndex = Math.max(0, parseInt(songIndex) || 0);
                resolvedIndex = (hydrated.songs && hydrated.songs[safeIndex]) ? safeIndex : 0;
            }
            window.currentSongIndex = resolvedIndex;

            // 4. Populate player bar without autoplaying.
            window.playSong(window.currentSongIndex, false);

            // 4b. Force progress bar UI update once audio metadata is available.
            (function syncRestoredPosition() {
                const _audio = document.getElementById('audio-player');
                if (!_audio) return;

                // Fix: Robust restore repaint
                const _fmt = (s) => isNaN(s) ? '0:00' : `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

                // Is a position restore pending for the song that was just loaded?
                let _restorePending = false;
                try {
                    const _raw = localStorage.getItem('beatZen_lastPosition');
                    if (_raw) {
                        const _parsed = JSON.parse(_raw);
                        const _t = (_parsed && typeof _parsed === 'object') ? parseFloat(_parsed.t) : parseFloat(_raw);
                        if (isFinite(_t) && _t > 2) {
                            const _savedId = (_parsed && typeof _parsed === 'object') ? String(_parsed.id || '') : '';
                            const _curId = String(window.playingAlbum?.songs?.[window.currentSongIndex]?.id ?? '');
                            _restorePending = !_savedId || !_curId || _savedId === _curId;
                        }
                    }
                } catch (_) { /* malformed payload — treat as nothing pending */ }

                function _repaintBar() {
                    // Hold off while a restore seek is still pending
                    if (_restorePending && !_audio._restoreApplied) return false;
                    const cur = _audio.currentTime, dur = _audio.duration;
                    if (!isFinite(dur) || dur <= 0) return false; // not ready yet
                    const pct = (cur / dur) * 100;
                    document.querySelectorAll('#progress, #bz-lyrics-progress').forEach(el => el.style.width = `${pct}%`);
                    document.querySelectorAll('#current-time, #bz-lyrics-current-time').forEach(el => el.textContent = _fmt(cur));
                    document.querySelectorAll('#duration, #bz-lyrics-duration').forEach(el => el.textContent = _fmt(dur));
                    return true; // success
                }

                // Try immediately in case readyState
                if (_repaintBar()) return; // done — no polling needed

                // Polling loop: retry every 100 ms for up to 8 000 ms
                let _pollTicks = 0;
                const _pollMax = 80; // 80 × 100 ms = 8 000 ms
                const _pollTimer = setInterval(() => {
                    _pollTicks++;
                    if (_repaintBar() || _pollTicks >= _pollMax) {
                        _stop();
                    }
                }, 100);

                // Belt-and-suspenders: also repaint on audio events. Only stop
                function _eventRepaint() {
                    if (_repaintBar()) _stop();
                }
                function _stop() {
                    clearInterval(_pollTimer);
                    _audio.removeEventListener('seeked', _eventRepaint);
                    _audio.removeEventListener('loadedmetadata', _eventRepaint);
                    _audio.removeEventListener('canplay', _eventRepaint);
                    _audio.removeEventListener('durationchange', _eventRepaint);
                }
                _audio.addEventListener('seeked', _eventRepaint);
                _audio.addEventListener('loadedmetadata', _eventRepaint);
                _audio.addEventListener('canplay', _eventRepaint);
                _audio.addEventListener('durationchange', _eventRepaint);
            })();

            // 5. Activate song-row highlight for the restored song so the album view
            window._highlightActive = true;
            if (typeof window.updateActiveSongHighlight === 'function') {
                window.updateActiveSongHighlight();
            }

            // 6. Force Home View — never boot into maximized player
            if (mainPlayer) {
                mainPlayer.classList.remove('maximized');
                document.body.style.overflow = '';
                if (window.location.hash === '#player') {
                    history.replaceState(null, null, ' ');
                }
            }

            // Mark as restored — prevents the fallback doRestore() timer re-running
            state.restored = true;

        } catch (e) {
            console.error("Beat Zen: Recovery Error", e);
            // FIX: an unexpected exception mid-restore must not leave controls
            state.restored = true;
            window._bzAutoPlayAfterRestore = false;
            if (typeof updatePlayPauseIcon === 'function') updatePlayPauseIcon();
        }

        // Always restore Playback Modes (Shuffle/Loop) regardless of song
        window.isShuffling = localStorage.getItem('beatZen_shuffle') === 'true';
        window.repeatMode = parseInt(localStorage.getItem('beatZen_repeat_mode') || '0', 10);
        if (![0, 1, 2].includes(window.repeatMode)) window.repeatMode = 0;
        window.isLooping = window.repeatMode === 2;
        if (window.syncPlaybackModesUI) window.syncPlaybackModesUI();
    }

    // FIX: Expose state object + reset hook so auth.js can clear the restore
    window._bzMobileState = state;
    window._bzResetRestoredState = function () {
        state.restored = false;
    };

    window.restoreMobileSession = function () {
        // If the fallback timer already restored successfully
        if (state.restored) {
            window.isShuffling = localStorage.getItem('beatZen_shuffle') === 'true';
            window.repeatMode = parseInt(localStorage.getItem('beatZen_repeat_mode') || '0', 10);
            if (![0, 1, 2].includes(window.repeatMode)) window.repeatMode = 0;
            window.isLooping = window.repeatMode === 2;
            if (window.syncPlaybackModesUI) window.syncPlaybackModesUI();
            return;
        }
        // A retry chain from an earlier call
        if (state.restoring) return;
        state.restoring = true;

        // Called from startApp()
        window._bzRestoreOnReady = false;

        /* On desktop, still restore last-played song + sync UI */
        if (!state.isMobile()) {
            _tryRestoreSession(20); // up to 20 x 300ms = 6s of retries on desktop
            return;
        }

        _tryRestoreSession(25); // up to 25 x 300ms = 7.5s of retries on mobile
    };

    /********************************/
    /* MOBILE GESTURE ENGINE        */
    /********************************/
    const initGestures = () => {
        const area = document.getElementById('main-player');
        if (!area) return;

        let _touchOnButton = false;

        area.addEventListener('touchstart', (e) => {
            state.startX = e.changedTouches[0].screenX;
            state.startY = e.changedTouches[0].screenY;
            // Guard: record if the touch started on a button/interactive element
            const target = e.target;
            _touchOnButton = !!(target && (
                target.tagName === 'BUTTON' ||
                target.closest('button') ||
                target.tagName === 'INPUT' ||
                target.tagName === 'A'
            ));
        }, { passive: true });

        area.addEventListener('touchend', (e) => {
            const dx = state.startX - e.changedTouches[0].screenX;
            const dy = state.startY - e.changedTouches[0].screenY;

            // Detect horizontal swipe skip. Guard 1: horizontal distance must exceed
            const isHorizontalSwipe = Math.abs(dx) > CONFIG.SWIPE_LIMIT && Math.abs(dx) >= 2 * Math.abs(dy);
            const isScrubbing = !!(window._bzScrubbing); // set by progress bar touchstart handler
            if (isHorizontalSwipe && !isScrubbing && !_touchOnButton) {
                if ("vibrate" in navigator) navigator.vibrate(15);
                // Guard: playNextSong / playPrevSong are defined inside startApp().
                if (dx > 0 && typeof window.playNextSong === 'function') window.playNextSong();
                if (dx < 0 && typeof window.playPrevSong === 'function') window.playPrevSong();
            }

        }, { passive: true });
    };

    /********************************/
    /* MOBILE BOOTSTRAP             */
    /********************************/
    const initMobileApp = () => {
        // Dynamic Viewport Height Fix
        const syncVH = () => {
            let vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };

        syncVH();
        window.addEventListener('resize', syncVH);

        // Setup Features
        initGestures();

        // Boot Recovery:
        const doRestore = () => {
            setTimeout(() => {
                // Only run the fallback retry loop if startApp hasn't already
                if (!state.restored && typeof window.restoreMobileSession === 'function') {
                    window.restoreMobileSession();
                }
            }, CONFIG.BOOT_DELAY);
        };

        if (document.readyState === 'complete') {
            doRestore();
        } else {
            window.addEventListener('load', doRestore);
        }
    };

    initMobileApp();

})();
// BEAT ZEN
(function () {
    const $ = id => document.getElementById(id);

    let scrollTopBtn, yearJumpBar, yearJumpInner;

    function initRefs() {
        scrollTopBtn = $('bz-scroll-top-btn');
        yearJumpBar = $('bz-year-jump-bar');
        yearJumpInner = $('bz-year-jump-inner');
    }

    /* ── Detect whether the Home view is active ── */
    function isHomeActive() {
        const ysc = $('year-sections-container');
        if (!ysc) return false;
        return ysc.style.display !== 'none' && !ysc.classList.contains('hidden');
    }

    // Resolve which element the scroll-to-top button should act
    function getActiveScrollEl() {
        const queueOv = $('bz-queue-fullscreen');
        if (queueOv && queueOv.classList.contains('active')) {
            return queueOv.querySelector('.bz-queue-body');
        }
        const lyricsOv = $('bz-lyrics-fullscreen');
        if (lyricsOv && lyricsOv.classList.contains('active')) {
            return lyricsOv.querySelector('.bz-lyrics-body');
        }
        return null; // null → window/document is the scroller
    }

    function currentScrollTop(el) {
        return el ? el.scrollTop : window.scrollY;
    }

    /* ── Spacer: push main content down by bar height when bar is visible ── */
    function updateMainPadding(visible) {
        const main = document.querySelector('main.main-content');
        if (!main) return;
        if (visible) {
            const barH = yearJumpBar.offsetHeight || 0;
            main.style.paddingTop = barH + 'px';
        } else {
            main.style.paddingTop = '';
        }
    }

    /* ── Build the year jump pill buttons once data is available ── */
    let jumpBarBuilt = false;
    let _pillScrolling = false;
    let _pillScrollTimer = null;

    function buildYearJumpBar() {
        if (jumpBarBuilt) return;
        const years = Object.keys(window.customYearAlbumsData || {}).sort().reverse();
        if (!years.length) return;
        jumpBarBuilt = true;
        yearJumpInner.innerHTML = '';
        years.forEach(year => {
            const btn = document.createElement('button');
            btn.className = 'bz-year-jump-pill';
            btn.textContent = year;
            btn.setAttribute('aria-label', 'Jump to ' + year);
            btn.addEventListener('click', () => {
                // FIX Issue 1: Always call displayHome(false, year) directly.
                if (!isHomeActive()) {
                    if (typeof window.displayHome === 'function') {
                        window.displayHome(false, year);
                    }
                } else {
                    scrollToYear(year);
                }
                setActiveJumpPill(btn);
                _pillScrolling = true;
                clearTimeout(_pillScrollTimer);
                _pillScrollTimer = setTimeout(() => { _pillScrolling = false; }, 900);
            });
            yearJumpInner.appendChild(btn);
        });
    }

    function getTotalFixedOffset() {
        // Below 768px the navbar lives at the bottom of the screen
        const isMobileNav = window.matchMedia('(max-width: 768px)').matches;
        const navH = isMobileNav ? 0 : (document.querySelector('.navbar') || { offsetHeight: 70 }).offsetHeight;
        const topbarH = isMobileNav ? (document.getElementById('bz-mobile-topbar')?.offsetHeight || 0) : 0;
        const barH = (yearJumpBar && isHomeActive()) ? (yearJumpBar.offsetHeight || 0) : 0;
        return navH + topbarH + barH + 8;
    }

    function scrollToYear(year) {
        const el = $('year-sec-' + year);
        if (!el) return;
        const offset = getTotalFixedOffset();
        const top = el.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
    }

    function setActiveJumpPill(activeBtn) {
        yearJumpInner.querySelectorAll('.bz-year-jump-pill').forEach(b => b.classList.remove('active'));
        if (activeBtn) activeBtn.classList.add('active');
    }

    /* ── Show / hide bar & scroll button ── */
    function syncVisibility() {
        const home = isHomeActive();
        yearJumpBar.style.display = home ? 'flex' : 'none'; /* year-jump pills stay Home-only */
        updateMainPadding(home);
        if (home) highlightVisibleYear();   /* refresh active pill whenever Home re-appears */

        const overlayEl = getActiveScrollEl();
        // overlay raises z-index above the fullscreen overlay + drops the bottom
        scrollTopBtn.classList.toggle('bz-scroll-top-btn--overlay', !!overlayEl);
        scrollTopBtn.style.display = currentScrollTop(overlayEl) > 300 ? 'flex' : 'none';
    }

    /* ── Highlight the pill that matches the currently visible year ── */
    function highlightVisibleYear() {
        if (!isHomeActive() || _pillScrolling) return;
        const pills = yearJumpInner.querySelectorAll('.bz-year-jump-pill');
        if (!pills.length) return;
        const offset = getTotalFixedOffset();
        let current = null;
        document.querySelectorAll('.year-section').forEach(sec => {
            if (sec.getBoundingClientRect().top <= offset) current = sec.id.replace('year-sec-', '');
        });
        pills.forEach(p => p.classList.toggle('active', p.textContent === current));
        const activePill = yearJumpInner.querySelector('.bz-year-jump-pill.active');
        if (activePill) {
            const pillLeft = activePill.offsetLeft;
            const pillW = activePill.offsetWidth;
            const barW = yearJumpInner.offsetWidth;
            yearJumpInner.scrollTo({ left: pillLeft - barW / 2 + pillW / 2, behavior: 'smooth' });
        }
    }

    /* ── Scroll listener ── */
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            syncVisibility();
            highlightVisibleYear();   /* keep active pill in sync while scrolling */
            ticking = false;
        });
    }, { passive: true });

    /* ── Scroll-to-top click ── */
    function bindScrollTopBtn() {
        if (!scrollTopBtn) return;
        scrollTopBtn.addEventListener('click', () => {
            const overlayEl = getActiveScrollEl();
            if (overlayEl) {
                overlayEl.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }

    // Keep the button in sync while scrolling inside the Queue / Lyrics
    function bindOverlayScrollListeners() {
        const queueBody = document.querySelector('.bz-queue-body');
        const lyricsBody = document.querySelector('.bz-lyrics-body');
        [queueBody, lyricsBody].forEach(el => {
            if (!el) return;
            el.addEventListener('scroll', () => {
                if (ticking) return;
                ticking = true;
                requestAnimationFrame(() => { syncVisibility(); ticking = false; });
            }, { passive: true });
        });
    }

    // Watch for tab switches, and for the Queue / Lyrics overlays opening
    function observeViewTabs() {
        const ysc = $('year-sections-container');
        const pc = $('playlists-container');
        const queueOv = $('bz-queue-fullscreen');
        const lyricsOv = $('bz-lyrics-fullscreen');
        const onTabChange = () => { buildYearJumpBar(); syncVisibility(); };
        if (ysc) new MutationObserver(onTabChange).observe(ysc, { attributes: true, attributeFilter: ['style', 'class'] });
        if (pc) new MutationObserver(onTabChange).observe(pc, { attributes: true, attributeFilter: ['style', 'class'] });
        if (queueOv) new MutationObserver(onTabChange).observe(queueOv, { attributes: true, attributeFilter: ['class'] });
        if (lyricsOv) new MutationObserver(onTabChange).observe(lyricsOv, { attributes: true, attributeFilter: ['class'] });
    }

    /* ── Poll until data is ready ── */
    function waitForData() {
        if (window.customYearAlbumsData && Object.keys(window.customYearAlbumsData).length) {
            buildYearJumpBar();
            syncVisibility();
        } else {
            setTimeout(waitForData, 300);
        }
    }

    function init() {
        initRefs();
        bindScrollTopBtn();
        bindOverlayScrollListeners();
        observeViewTabs();
        waitForData();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
// AUTH GATE WIRING (moved from index.html inline <script>) Connects
(function () {
    // Gate buttons trigger sign-in flows directly
    document.addEventListener('DOMContentLoaded', function () {

        // "Sign Up with Username" → show the signup form inside Settings without
        const signupBtn = document.getElementById('bz-gate-signup-btn');
        if (signupBtn) signupBtn.addEventListener('click', function () {
            // Ensure settings container is rendered
            if (typeof window.displaySettings === 'function') window.displaySettings(true);
            setTimeout(() => {
                const btn = document.getElementById('bz-show-signup-btn');
                if (btn) btn.click();
                // Show settings container underneath the gate so form is accessible
                const gate = document.getElementById('bz-auth-gate');
                if (gate) gate.classList.remove('bz-gate-visible');
            }, 120);
        });

        // "Sign In with Username" → show the signin form inside Settings without
        const signinBtn = document.getElementById('bz-gate-signin-btn');
        if (signinBtn) signinBtn.addEventListener('click', function () {
            if (typeof window.displaySettings === 'function') window.displaySettings(true);
            setTimeout(() => {
                const btn = document.getElementById('bz-show-signin-btn');
                if (btn) btn.click();
                const gate = document.getElementById('bz-auth-gate');
                if (gate) gate.classList.remove('bz-gate-visible');
            }, 120);
        });

        // Legacy text-link fallback
        const signinLink = document.getElementById('bz-gate-signin-link');
        if (signinLink) signinLink.addEventListener('click', function () {
            if (typeof window.displaySettings === 'function') window.displaySettings(true);
            setTimeout(() => {
                const btn = document.getElementById('bz-show-signin-btn');
                if (btn) btn.click();
                const gate = document.getElementById('bz-auth-gate');
                if (gate) gate.classList.remove('bz-gate-visible');
            }, 120);
        });


    });
})();

// FULLSCREEN HELPER
(function _bzRegisterFullscreenHelper() {
    var _bzFsHandler = null; // reference to the pending next-gesture handler

    /* ── Pull-to-refresh / overscroll lock ───────────────────────────────── */
    var _scrollLockActive = false;
    function _onTouchMove(e) {
        if (window.scrollY <= 0 && e.touches && e.touches.length === 1) {
            e.preventDefault();
        }
    }
    window._bzApplyFullscreenScrollLock = function (enable) {
        if (enable && !_scrollLockActive) {
            _scrollLockActive = true;
            document.documentElement.style.overscrollBehavior = 'none';
            document.body.style.overscrollBehavior = 'none';
            document.addEventListener('touchmove', _onTouchMove, { passive: false });
        } else if (!enable && _scrollLockActive) {
            _scrollLockActive = false;
            document.documentElement.style.overscrollBehavior = '';
            document.body.style.overscrollBehavior = '';
            document.removeEventListener('touchmove', _onTouchMove);
        }
    };

    /* ── Cancel any pending next-gesture listener ────────────────────────── */
    window._bzCancelFullscreenOnGesture = function () {
        if (_bzFsHandler) {
            ['click', 'touchstart'].forEach(function (ev) {
                document.removeEventListener(ev, _bzFsHandler, { capture: true });
            });
            _bzFsHandler = null;
        }
    };

    /* ── Attach next-gesture listener ────────────────────────────────────── */
    window._bzAttachFullscreenOnGesture = function () {
        if (_bzFsHandler) return; // already waiting
        if (!document.documentElement.requestFullscreen) return;

        _bzFsHandler = function () {
            _bzFsHandler = null;
            ['click', 'touchstart'].forEach(function (ev) {
                document.removeEventListener(ev, arguments.callee, { capture: true });
            });
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen({ navigationUI: 'hide' })
                    .then(function () { window._bzApplyFullscreenScrollLock(true); })
                    .catch(function () { });
            }
        };

        ['click', 'touchstart'].forEach(function (ev) {
            document.addEventListener(ev, _bzFsHandler, { capture: true, once: true, passive: true });
        });
    };

    /* Release scroll lock / cleanup when user exits fullscreen via browser */
    document.addEventListener('fullscreenchange', function () {
        if (!document.fullscreenElement) {
            window._bzCancelFullscreenOnGesture();
            window._bzApplyFullscreenScrollLock(false);
        } else {
            window._bzApplyFullscreenScrollLock(true);
        }
    });

    // Fullscreen Mode setting removed
    try { localStorage.removeItem('beatZen_fullscreenMode'); } catch (_) { }
})();


// ═══════════════════════════════════════════════════════════════════
function bzTogglePw(inputId, btn) {
    var inp = document.getElementById(inputId);
    if (!inp) return;
    var show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    var icon = btn.querySelector('i');
    if (icon) icon.className = show ? 'fas fa-eye-slash' : 'fas fa-eye';
}

// FEATURE: Status Bar Tinting
(function bzStatusBarTint() {
    const metaTag = document.getElementById('bz-theme-color');
    if (!metaTag) return;

    function readBgColor() {
        // Use --bg-color if present, fall back to a safe dark default
        const raw = getComputedStyle(document.documentElement)
            .getPropertyValue('--bg-color').trim();
        return raw || '#1a1a1a';
    }

    function applyTint() {
        metaTag.setAttribute('content', readBgColor());
    }

    // Apply once on load
    applyTint();

    // Re-apply whenever dark-mode or theme class changes on <body> / <html>
    const observer = new MutationObserver(applyTint);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });

    // Also expose so other code can trigger a manual refresh if needed
    window.bzUpdateThemeColor = applyTint;
})();

// MERGED FROM: playlists.js

/* ── HISTORY KEY (must match script.js) ── */
const BZ_HISTORY_KEY = 'beatZen_history_auto';
const BZ_SIGNALS_KEY = 'beatZen_signals';

/* ── SEEDED RNG ── */
function getTodaySeed() {
    const d = new Date();
    return parseInt(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`);
}
function seededShuffle(arr, seed) {
    const a = [...arr]; let s = seed;
    for (let i = a.length - 1; i > 0; i--) {
        s = ((s * 1664525) + 1013904223) & 0xffffffff;
        const j = Math.abs(s) % (i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/* ── FULL SONG POOL ── */
function getAllSongIds() {
    const seen = new Set(), pool = [];
    const data = window.customYearAlbumsData || {};
    Object.values(data).forEach(albums =>
        albums.forEach(album =>
            (album.songs || []).forEach(song => {
                if (song.id && !seen.has(song.id)) { seen.add(song.id); pool.push(song.id); }
            })
        )
    );
    return pool;
}

/* ── GET ALL ALBUMS FLAT ── */
function getAllAlbums() {
    const albums = [];
    const data = window.customYearAlbumsData || {};
    Object.values(data).forEach(yearAlbums => albums.push(...yearAlbums));
    return albums;
}

/* ── LOAD PLAY HISTORY ── */
function loadPlayHistory() {
    try { return JSON.parse(localStorage.getItem(BZ_HISTORY_KEY) || '[]'); } catch (_) { return []; }
}

/* ── LOAD BEHAVIOR SIGNALS ── */
function loadSignals() {
    try { return JSON.parse(localStorage.getItem(BZ_SIGNALS_KEY) || '[]'); } catch (_) { return []; }
}

/* ── BUILD SIGNAL SCORE MAP ── */
function buildSignalScores() {
    const WEIGHTS = { replay: 5, full_play: 2, add_playlist: 3, search_after: 2, skip_early: -4 };
    const scores = {};
    loadSignals().forEach(s => {
        const id = String(s.id || '');
        if (!id) return;
        const w = WEIGHTS[s.signal] || 0;
        scores[id] = (scores[id] || 0) + w;
    });
    return scores;
}

/* ── SONG PLAY COUNTS from history ── */
function getSongPlayCounts() {
    const counts = {};
    loadPlayHistory().forEach(e => {
        const id = String(e.id || '');
        if (id) counts[id] = (counts[id] || 0) + 1;
    });
    return counts;
}

/* ── ALBUM PLAY COUNTS ── */
function getAlbumPlayCounts() {
    const songCounts = getSongPlayCounts();
    const albumCounts = {};
    getAllAlbums().forEach(album => {
        const total = (album.songs || []).reduce((s, song) => s + (songCounts[song.id] || 0), 0);
        if (total > 0) albumCounts[album.id] = { album, count: total };
    });
    return albumCounts;
}

/* ── GET COVER FROM SONG IDs ── */
function getCoverFromSongs(songIds, usedCovers) {
    const map = window.allSongsMap;
    if (!map) return '';
    const freq = {};
    for (const id of songIds) {
        const entry = map.get(String(id));
        const url = entry?.album?.imageUrl || entry?.imageUrl;
        if (url) freq[url] = (freq[url] || 0) + 1;
    }
    const ranked = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    if (!usedCovers) return ranked[0] || '';
    for (const url of ranked) {
        if (!usedCovers.has(url)) { usedCovers.add(url); return url; }
    }
    return ranked[0] || '';
}

/* ── ms UNTIL MIDNIGHT ── */
function msUntilMidnight() {
    const now = new Date();
    const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
    return midnight - now;
}

// SECTION 0

/* Colour ramp for year badges — cycles through warm/cool palette */
const BZ_YEAR_COLORS = [
    '#7c3aed', '#2575fc', '#10b981', '#f59e0b',
    '#ef4444', '#06b6d4', '#ec4899', '#8b5cf6',
    '#3b82f6', '#14b8a6', '#f97316', '#6366f1'
];
function getYearColor(year) {
    const idx = Math.abs(parseInt(year) || 0) % BZ_YEAR_COLORS.length;
    return BZ_YEAR_COLORS[idx];
}

/* Build the Infinite Play playlist — all songs, all years, newest first */
function buildInfinitePlay() {
    const data = window.customYearAlbumsData || {};
    const years = Object.keys(data).map(Number).filter(Boolean).sort((a, b) => b - a);
    const seen = new Set();
    const songIds = [];

    // Collect 4 distinct covers
    const collageCovers = [];
    years.forEach(year => {
        let addedFromThisYear = false;
        (data[String(year)] || []).forEach(album => {
            const img = album.imageUrl || album.albumCover || '';
            if (!addedFromThisYear && img && !collageCovers.includes(img) && collageCovers.length < 4) {
                collageCovers.push(img);
                addedFromThisYear = true;
            }
            (album.songs || []).forEach(song => {
                const id = String(song.id || '');
                if (id && !seen.has(id)) { seen.add(id); songIds.push(id); }
            });
        });
    });

    return {
        id: 'bz-infinite-play',
        name: 'Infinite Play',
        desc: 'Every song · every year',
        icon: 'fa-infinity',
        color: '#7c3aed',
        songs: songIds,
        cover: collageCovers[0] || '',
        _collageCovers: collageCovers.length >= 2 ? collageCovers : null,
        _isInfinitPlay: true
    };
}

/* Build one playlist per year */
function buildYearPlaylists() {
    const data = window.customYearAlbumsData || {};
    const years = Object.keys(data).map(Number).filter(Boolean).sort((a, b) => b - a);

    return years.map(year => {
        const albums = data[String(year)] || [];
        const seen = new Set();
        const songIds = [];
        const collageCovers = [];

        albums.forEach(album => {
            const img = album.imageUrl || album.albumCover || '';
            if (img && !collageCovers.includes(img) && collageCovers.length < 4) {
                collageCovers.push(img);
            }
            (album.songs || []).forEach(song => {
                const id = String(song.id || '');
                if (id && !seen.has(id)) { seen.add(id); songIds.push(id); }
            });
        });

        if (!songIds.length) return null;

        return {
            id: `bz-year-${year}`,
            name: String(year),
            desc: `All songs from ${year}`,
            icon: 'fa-calendar',
            color: getYearColor(year),
            songs: songIds,
            cover: collageCovers[0] || '',
            _collageCovers: collageCovers.length >= 2 ? collageCovers : null,
            _yearLabel: String(year)
        };
    }).filter(Boolean);
}

/* Build Beat Zen Universe heading element */
/* Render the Beat Zen Universe section into a given container */
function renderBeatZenUniverseSection(container) {
    container.innerHTML = '';

    const sec = document.createElement('div');
    sec.id = 'bzp-universe-section';
    sec.className = 'bzp-section';

    sec.appendChild(makeHeading('fa-infinity', 'Beat Zen Universe', 'Your complete collection · all years · all albums'));

    const infinitePlay = buildInfinitePlay();
    const yearPlaylists = buildYearPlaylists();

    const cards = [];
    if (infinitePlay.songs.length) cards.push(makePlaylistCard(infinitePlay, 'Playlist'));
    yearPlaylists.forEach(yp => cards.push(makePlaylistCard(yp, 'Playlist')));

    if (cards.length) {
        sec.appendChild(makeRow(cards));
    } else {
        /* No songs yet — show empty state */
        const empty = document.createElement('p');
        empty.style.cssText = 'color:rgba(255,255,255,0.35);font-size:0.82rem;padding:4px 16px 16px;';
        empty.textContent = 'Add songs to your Google Sheet to see them here.';
        sec.appendChild(empty);
    }

    container.appendChild(sec);
}

/* Expose for script.js's displayPlaylists to call */
window.bzRenderUniverseSection = renderBeatZenUniverseSection;

// SECTION 1 — PLAYLISTS MADE FOR YOU (signal-powered)

function buildMadeForYou() {
    const seed = getTodaySeed();
    const allIds = getAllSongIds();
    const history = loadPlayHistory();
    const counts = getSongPlayCounts();
    const signals = loadSignals();
    const scores = buildSignalScores();

    const likedIds = Object.entries(scores)
        .filter(([, s]) => s > 0)
        .sort((a, b) => b[1] - a[1])
        .map(x => x[0]);

    const skippedSet = new Set(
        Object.entries(scores).filter(([, s]) => s < 0).map(x => x[0])
    );

    const playedSet = new Set(Object.keys(counts));
    const neverPlayed = allIds.filter(id => !playedSet.has(id) && !skippedSet.has(id));
    const playedSorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(x => x[0]);

    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const weekCounts = {};
    history.filter(e => new Date(e.playedAt || 0).getTime() >= weekAgo)
        .forEach(e => { const id = String(e.id || ''); if (id) weekCounts[id] = (weekCounts[id] || 0) + 1; });
    const weekSorted = Object.entries(weekCounts).sort((a, b) => b[1] - a[1]).map(x => x[0]);

    const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;
    const monthCounts = {};
    history.filter(e => new Date(e.playedAt || 0).getTime() >= monthAgo)
        .forEach(e => { const id = String(e.id || ''); if (id) monthCounts[id] = (monthCounts[id] || 0) + 1; });
    const monthSorted = Object.entries(monthCounts).sort((a, b) => b[1] - a[1]).map(x => x[0]);

    const recentSeen = new Set(), recentSongs = [];
    history.slice(0, 200).forEach(e => {
        const id = String(e.id || '');
        if (id && !recentSeen.has(id)) { recentSeen.add(id); recentSongs.push(id); }
    });

    const usedCovers = new Set();

    const quickBase = [...new Set([...likedIds.slice(0, 4), ...recentSongs])].filter(id => !skippedSet.has(id));
    const quickPicks = (quickBase.length >= 7 ? quickBase : seededShuffle(allIds, seed).filter(id => !skippedSet.has(id))).slice(0, 7);

    const weeklyMix = [...new Set([...weekSorted, ...seededShuffle(allIds, seed)])]
        .filter(id => !skippedSet.has(id)).slice(0, 40);

    const dailyTop = likedIds.length ? likedIds.slice(0, 20) : playedSorted.slice(0, 20);
    const dailyNew = seededShuffle(neverPlayed, seed).slice(0, 30);
    const dailyMix = [...new Set([...dailyTop, ...dailyNew])].slice(0, 50);

    // REPEAT REWIND: use dedicated qualifying-plays store
    let rrPlaysList = [];
    try { rrPlaysList = JSON.parse(localStorage.getItem('beatZen_rr_plays') || '[]'); } catch (_) { }
    const rrCounts = {};
    rrPlaysList.forEach(e => {
        const id = String(e.id || '');
        if (id) rrCounts[id] = (rrCounts[id] || 0) + 1;
    });
    /* Sort by qualifying-play count descending */
    const repeatRewind = Object.entries(rrCounts)
        .filter(([id, cnt]) => cnt >= 3 && !skippedSet.has(id))
        .sort((a, b) => {
            if (b[1] !== a[1]) return b[1] - a[1];
            const tsA = rrPlaysList.find(e => String(e.id) === a[0])?.ts || 0;
            const tsB = rrPlaysList.find(e => String(e.id) === b[0])?.ts || 0;
            return tsB - tsA;
        })
        .map(([id]) => id);
    /* When no songs qualify, show EMPTY playlist */
    const repeatFinal = repeatRewind.length ? repeatRewind : [];


    const hiddenGems = seededShuffle(neverPlayed, seed ^ 12345).slice(0, 50);

    const listenAgainPl = buildListenAgainPlaylist(usedCovers);

    const playlists = [
        { id: 'bz-daily-mix', name: 'Daily Mix', icon: 'fa-sliders', color: '#3b82f6', desc: 'Favourites + new discoveries', songs: dailyMix, cover: getCoverFromSongs(dailyMix, usedCovers) },
        { id: 'bz-repeat-rewind', name: 'Repeat Rewind', icon: 'fa-rotate-left', color: '#10b981', desc: 'Songs you replayed upto 3+ times', songs: repeatFinal, cover: getCoverFromSongs(repeatFinal, usedCovers) },
        { id: 'bz-hidden-gems', name: 'Hidden Gems', icon: 'fa-gem', color: '#ec4899', desc: 'Great songs you haven\'t heard yet', songs: hiddenGems, cover: getCoverFromSongs(hiddenGems, usedCovers) },
    ];

    if (listenAgainPl) playlists.unshift(listenAgainPl);

    return playlists;
}

// SECTION 3 — RECOMMENDED FOR TODAY (refreshes daily at 12am)

let _recToday_seed = null, _recToday_cache = null;

function buildRecommendedForToday() {
    const seed = getTodaySeed();
    if (_recToday_seed === seed && _recToday_cache) return _recToday_cache;
    const counts = getSongPlayCounts();
    const scores = buildSignalScores();
    const albums = getAllAlbums();

    const albumScores = albums.map(album => {
        const plays = (album.songs || []).reduce((s, song) => s + (counts[song.id] || 0), 0);
        const signal = (album.songs || []).reduce((s, song) => s + (scores[String(song.id)] || 0), 0);
        return { album, total: plays + signal };
    });

    // Only recommend albums the user has never opened or played
    const neverPlayed = albumScores.filter(x => x.total === 0).map(x => x.album);
    const shuffled = seededShuffle(neverPlayed, seed);

    const seenCovers = new Set(), result = [];
    for (const a of shuffled) {
        const cover = a.imageUrl || a.albumCover || '';
        if (seenCovers.has(cover) && cover) continue;
        if (cover) seenCovers.add(cover);
        result.push(a);
        if (result.length >= 10) break;
    }

    _recToday_seed = seed;
    _recToday_cache = result;
    return result;
}

/* ── Time-ago helper for Listen Again badges ── */
function timeAgo(isoString) {
    if (!isoString) return '';
    const diff = Date.now() - new Date(isoString).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return `${Math.floor(d / 7)}w ago`;
}

/* ── Build Listen Again: recent unique songs from play history ── */
function buildListenAgain() {
    /* Default ON: disabled only when user explicitly set it to 'false' */
    const historyEnabled = localStorage.getItem('beatzen_history') !== 'false';
    if (!historyEnabled) return [];
    let list = [];
    try { list = JSON.parse(localStorage.getItem(BZ_HISTORY_KEY) || '[]'); } catch (e) { list = []; }

    const seen = new Set(), result = [];
    for (const entry of list) {
        const id = String(entry.id || '');
        if (id && !seen.has(id)) { seen.add(id); result.push(entry); }
        if (result.length >= 20) break;
    }
    return result;
}

/* Build Listen Again as a smart playlist for Playlists Made for You */
function buildListenAgainPlaylist(usedCovers) {
    /* Default ON: disabled only when user explicitly set it to 'false' */
    const historyEnabled = localStorage.getItem('beatzen_history') !== 'false';
    if (!historyEnabled) return null;
    let list = [];
    try { list = JSON.parse(localStorage.getItem(BZ_HISTORY_KEY) || '[]'); } catch (e) { list = []; }

    const seen = new Set(), songIds = [];
    for (const entry of list) {
        const id = String(entry.id || '');
        if (id && !seen.has(id)) { seen.add(id); songIds.push(id); }
        if (songIds.length >= 30) break;
    }

    if (!songIds.length) return null;

    return {
        id: 'bz-listen-again',
        name: 'Recently Played',
        icon: 'fa-clock-rotate-left',
        color: '#06b6d4',
        desc: 'Your recently played songs',
        songs: songIds,
        cover: getCoverFromSongs(songIds, usedCovers)
    };
}


// CARD CLICK HANDLER

function handlePlaylistsCardClick(item, type) {
    const songs = item.songs || [];
    if (!songs.length) {
        // bz-repeat-rewind: fall through to selectAlbum so the album view
        if (item.id !== 'bz-repeat-rewind' && item.type !== 'artist' && item.type !== 'hero') {
            if (window.bzAlert) bzAlert('warning', 'Empty Playlist', 'No songs found.');
            return;
        }
        // bz-repeat-rewind with 0 songs: intentional fall-through below
    }

    const normalized = {
        ...item,
        imageUrl: item.imageUrl || item.cover || item.albumCover || '',
        albumCover: item.albumCover || item.cover || item.imageUrl || ''
    };

    const resolvedType = type || 'Playlist';
    const navOverride = 'playlists';

    if (typeof window.resolveData === 'function') {
        const resolved = window.resolveData(normalized, resolvedType);
        if (resolved && typeof window.selectAlbum === 'function') {
            window.selectAlbum(resolved, false, navOverride);
        }
    } else if (typeof window.playSong === 'function') {
        if (typeof window.currentQueue !== 'undefined') {
            window.currentQueue = songs;
            window.currentQueueIndex = 0;
        }
        window.playSong(songs[0]);
    }
}

function handlePlaylistsCardPlay(item, type) {
    const songs = item.songs || [];
    if (!songs.length) return;

    const normalized = {
        ...item,
        imageUrl: item.imageUrl || item.cover || item.albumCover || '',
        albumCover: item.albumCover || item.cover || item.imageUrl || ''
    };

    const isThisActive = window.playingAlbum && String(window.playingAlbum.id) === String(normalized.id || normalized.name);

    if (isThisActive) {
        if (typeof window.togglePlayback === 'function') window.togglePlayback();
        return;
    }

    if (typeof window.resolveData === 'function') {
        const resolved = window.resolveData(normalized, type || 'Playlist');
        if (!resolved) return;
        window.playingAlbum = resolved;
        window._highlightActive = true;
        if (typeof window.playSong === 'function') {
            window.playSong(0);
            setTimeout(() => {
                if (typeof window.updateActiveSongHighlight === 'function') window.updateActiveSongHighlight();
                window.bzSyncPlaylistsPlayBtns && window.bzSyncPlaylistsPlayBtns();
            }, 120);
        }
    } else if (typeof window.playSong === 'function') {
        window.playSong(songs[0]);
    }
}

/* ── Sync all explore play buttons to reflect current playback state ── */
window.bzSyncPlaylistsPlayBtns = function () {
    const audioEl = document.getElementById('audio-player');
    const isPlaying = audioEl && !audioEl.paused;
    const activeAlbumId = window.playingAlbum ? String(window.playingAlbum.id) : null;
    const activeSong = window.playingAlbum?.songs?.[window.currentSongIndex];
    const activeSongId = activeSong ? String(activeSong.id) : null;

    /* Sync card playing state via CSS class only */
    document.querySelectorAll('.bzp-card').forEach(card => {
        const cardId = String(card.dataset.bzId || '');
        const isAlbumMatch = activeAlbumId && cardId && cardId === activeAlbumId;
        const isSongMatch = activeSongId && cardId && cardId === activeSongId && card.classList.contains('bzp-la-card');
        const isActive = isAlbumMatch || isSongMatch;

        if (isActive && isPlaying) {
            card.classList.add('bzp-card--playing');
        } else {
            card.classList.remove('bzp-card--playing');
        }
    });

    document.querySelectorAll('.bzp-la-card').forEach(card => {
        const cardId = String(card.dataset.bzId || '');
        if (activeSongId && cardId === activeSongId) {
            card.classList.add('bzp-la-card--active');
        } else {
            card.classList.remove('bzp-la-card--active');
        }
    });
};

// UI BUILDERS

/* Section heading with FA icon */
function makeHeading(icon, title, subtitle) {
    const wrap = document.createElement('div');
    wrap.className = 'bzp-section-head';
    wrap.innerHTML = `
        <div class="bzp-section-title-row">
            <span class="bzp-section-icon"><i class="fas ${icon}"></i></span>
            <div>
                <div class="bzp-section-title">${title}</div>
                ${subtitle ? `<div class="bzp-section-sub">${subtitle}</div>` : ''}
            </div>
        </div>`;
    return wrap;
}

/* ── Build a 2×2 collage cover div ── */
function makeCollageCover(urls) {
    const cols = [...urls];
    while (cols.length < 4) cols.push(cols[cols.length - 1] || '');
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;flex-wrap:wrap;width:100%;height:100%;';
    cols.slice(0, 4).forEach(u => {
        const img = document.createElement('img');
        img.src = u; img.alt = ''; img.loading = 'lazy';
        img.style.cssText = 'width:50%;height:50%;object-fit:cover;display:block;flex-shrink:0;';
        img.onerror = () => { img.style.background = 'rgba(124,58,237,0.3)'; img.src = ''; };
        div.appendChild(img);
    });
    return div;
}

// THREE-DOT MENU FOR SMART PLAYLIST CARDS

/* Global dropdown — single instance, repositioned on each open */
let _bzCardMenuDropdown = null;
let _bzCardMenuCloseHandler = null;

function _bzGetOrCreateDropdown() {
    if (_bzCardMenuDropdown && document.body.contains(_bzCardMenuDropdown)) return _bzCardMenuDropdown;
    const d = document.createElement('div');
    d.id = 'bzp-card-menu-dropdown';
    d.className = 'bzp-card-menu-dropdown';
    d.style.display = 'none';
    document.body.appendChild(d);
    _bzCardMenuDropdown = d;
    return d;
}

function _bzCloseCardMenu() {
    if (_bzCardMenuDropdown) _bzCardMenuDropdown.style.display = 'none';
    if (_bzCardMenuCloseHandler) {
        document.removeEventListener('click', _bzCardMenuCloseHandler, true);
        _bzCardMenuCloseHandler = null;
    }
}

function _bzShowPlaylistCardMenu(triggerBtn, item) {
    _bzCloseCardMenu();
    const dropdown = _bzGetOrCreateDropdown();

    /* Check if already saved */
    const savedKey = 'beatZen_importedPlaylists';
    const savedList = JSON.parse(localStorage.getItem(savedKey) || '[]');
    const originalId = String(item.id || item.name || '');
    const savedId = 'user-saved-' + originalId;
    const isAlreadySaved = savedList.some(pl => String(pl.id) === savedId || pl._originalSmartId === originalId);

    dropdown.innerHTML = `
        <button class="bzp-card-menu-item" id="_bzMenuSave">
            <i class="fas ${isAlreadySaved ? 'fa-check-circle' : 'fa-bookmark'}" style="color:${isAlreadySaved ? '#1db954' : '#a78bfa'};font-size:0.9rem;width:16px;text-align:center;"></i>
            <span>${isAlreadySaved ? 'Saved to Your Playlists' : 'Save this playlist'}</span>
        </button>`;

    /* Position dropdown near the trigger button */
    const rect = triggerBtn.getBoundingClientRect();
    dropdown.style.display = 'block';
    const ddW = 200;
    const ddH = 52;
    let left = rect.right - ddW;
    let top = rect.bottom + 6;
    if (left < 8) left = 8;
    if (top + ddH > window.innerHeight - 8) top = rect.top - ddH - 6;
    dropdown.style.left = left + 'px';
    dropdown.style.top = top + 'px';

    /* Wire up actions */
    if (!isAlreadySaved) {
        dropdown.querySelector('#_bzMenuSave').addEventListener('click', (e) => {
            e.stopPropagation();
            _bzCloseCardMenu();
            _bzSaveSmartPlaylist(item);
        });
    }

    /* Close on outside click */
    _bzCardMenuCloseHandler = (e) => {
        if (!dropdown.contains(e.target) && e.target !== triggerBtn) {
            _bzCloseCardMenu();
        }
    };
    setTimeout(() => {
        document.addEventListener('click', _bzCardMenuCloseHandler, true);
    }, 0);
}

/* Save a smart playlist to "Your Playlists" */
function _bzSaveSmartPlaylist(item) {
    const savedKey = 'beatZen_importedPlaylists';
    const savedList = JSON.parse(localStorage.getItem(savedKey) || '[]');
    const originalId = String(item.id || item.name || '');
    const savedId = 'user-saved-' + originalId;

    /* Guard: already saved */
    if (savedList.some(pl => String(pl.id) === savedId || pl._originalSmartId === originalId)) {
        if (typeof showToast === 'function') showToast('Already in Your Playlists');
        return;
    }

    /* Resolve song IDs */
    const songs = (item.songs || []).map(s => String(s));

    const pl = {
        id: savedId,
        name: item.name,
        type: 'Playlist',
        isImported: true,
        songs,
        albumCover: item.cover || item.albumCover || item.imageUrl || '',
        desc: item.desc || ('Saved from ' + item.name),
        _savedFrom: 'smart',
        _originalSmartId: originalId
    };

    savedList.push(pl);
    localStorage.setItem(savedKey, JSON.stringify(savedList));

    /* Add to live masterPool so "Your Playlists" updates without reload */
    if (window.masterPool && !window.masterPool.some(m => String(m.id) === savedId)) {
        window.masterPool.push(pl);
    }

    /* Refresh Playlists tab if it is currently visible and no album card */
    const _bzAlbumView = document.getElementById('album-view-container');
    const _bzAlbumOpen = _bzAlbumView && _bzAlbumView.style.display !== 'none';
    if (!_bzAlbumOpen && window.lastActiveView === 'playlists' && typeof window.displayPlaylists === 'function') {
        window.displayPlaylists(true);
    }

    if (typeof showToast === 'function') showToast(`✓ "${item.name}" added to Your Playlists`);
}

// Standard playlist card
function makePlaylistCard(item, type) {
    const card = document.createElement('div');
    card.className = 'bzp-card';
    card.dataset.bzId = String(item.id || item.name || '');

    const coverWrap = document.createElement('div');
    coverWrap.className = 'bzp-card-cover';

    /* ── Cover: collage > single image > gradient ── */
    if (item._collageCovers && item._collageCovers.length >= 2) {
        coverWrap.appendChild(makeCollageCover(item._collageCovers));
    } else if (item.cover || item.albumCover || item.imageUrl) {
        const img = document.createElement('img');
        img.src = item.cover || item.albumCover || item.imageUrl;
        img.alt = item.name;
        img.loading = 'lazy';
        img.onerror = () => { img.remove(); coverWrap.appendChild(makeGradientCover(item)); };
        coverWrap.appendChild(img);
    } else {
        coverWrap.appendChild(makeGradientCover(item));
    }

    /* Play button overlay removed */



    const info = document.createElement('div');
    info.className = 'bzp-card-info';

    const countLabel = (item.songs || []).length + ' songs';
    info.innerHTML = `
        <div class="bzp-card-name">${item.name}</div>
        <div class="bzp-card-meta">${countLabel}</div>`;

    card.appendChild(coverWrap);
    card.appendChild(info);
    card.addEventListener('click', () => handlePlaylistsCardClick(item, type));
    return card;
}

/* Gradient cover fallback with icon */
function makeGradientCover(item) {
    const div = document.createElement('div');
    div.className = 'bzp-card-gradient';
    const color = item.color || '#6d28d9';
    div.style.background = `linear-gradient(135deg, ${color}cc, ${color}44)`;
    div.innerHTML = `<i class="fas ${item.icon || 'fa-music'}"></i>`;
    return div;
}

/* Album card for Recommended / Listen Again */
function makeAlbumCard(album) {
    const card = document.createElement('div');
    card.className = 'bzp-card bzp-album-card';
    card.dataset.bzId = String(album.id || album.name || '');
    const coverWrap = document.createElement('div');
    coverWrap.className = 'bzp-card-cover';

    if (album.imageUrl || album.albumCover) {
        const img = document.createElement('img');
        img.src = album.imageUrl || album.albumCover;
        img.alt = album.title || album.name;
        img.loading = 'lazy';
        coverWrap.appendChild(img);
    } else {
        const ph = document.createElement('div');
        ph.className = 'bzp-card-gradient';
        ph.innerHTML = '<i class="fas fa-compact-disc"></i>';
        coverWrap.appendChild(ph);
    }

    const info = document.createElement('div');
    info.className = 'bzp-card-info';

    const title = album.title || album.name || 'Unknown';
    const year = album.year ? `· ${album.year}` : '';
    const songCount = (album.songs || []).length;
    info.innerHTML = `
        <div class="bzp-card-name">${title}</div>
        <div class="bzp-card-meta">${songCount} songs ${year}</div>`;

    // FIX Issue 9: declare item BEFORE the play-button listener
    const item = {
        id: album.id,
        name: title,
        songs: (album.songs || []).map(s => s.id || s),
        albumCover: album.imageUrl || album.albumCover
    };

    /* Play button overlay removed */

    card.appendChild(coverWrap);
    card.appendChild(info);

    card.addEventListener('click', () => handlePlaylistsCardClick(item, 'Movie'));
    return card;
}

function makeListenAgainCard(entry) {
    const card = document.createElement('div');
    card.className = 'bzp-card bzp-la-card';
    card.dataset.bzId = String(entry.id || '');

    const cover = entry._coverUrl || entry.albumCover || '';
    const title = entry.title || 'Unknown';
    const source = entry.albumTitle || entry.sourceName || '';
    const artist = entry.artist || '';
    const ago = timeAgo(entry.playedAt);
    const dur = entry.duration || '';

    let sourceLabel = '';
    let movieLabel = '';
    const pid = entry.playingAlbumId ? String(entry.playingAlbumId) : '';

    if (entry.isAutoMix) {
        sourceLabel = '\u2736 Auto-Mix';
        movieLabel = entry.autoMixMovieName || entry.albumTitle || source || '';
    } else if (pid && BZ_SMART_PLAYLIST_NAMES[pid]) {
        sourceLabel = `playlists - ${BZ_SMART_PLAYLIST_NAMES[pid]}`;
        movieLabel = entry.albumTitle || source || '';
    } else if (entry.sourceView === 'Playlists' && entry.sourceName) {
        sourceLabel = `playlists - ${entry.sourceName}`;
        movieLabel = entry.albumTitle || source || '';
    } else if (entry.sourceView === 'Home') {
        sourceLabel = 'home';
        movieLabel = entry.albumTitle || source || '';
    } else if (pid && window.masterPool) {
        const found = window.masterPool.find(a => String(a.id || a.name || a.title) === pid);
        if (found) {
            const t = String(found.type || '').toLowerCase();
            const isPlaylist = t === 'playlist' || t === 'explore' || t === 'collection';
            sourceLabel = isPlaylist ? `playlists - ${found.name || found.title || ''}` : 'home';
            movieLabel = entry.albumTitle || source || '';
        }
    }
    if (!sourceLabel) sourceLabel = source || artist;

    const coverWrap = document.createElement('div');
    coverWrap.className = 'bzp-card-cover bzp-la-cover';

    if (cover) {
        const img = document.createElement('img');
        img.src = cover; img.alt = title; img.loading = 'lazy';
        img.onerror = () => { img.remove(); const ph = document.createElement('div'); ph.className = 'bzp-card-gradient'; ph.innerHTML = '<i class="fas fa-music"></i>'; coverWrap.prepend(ph); };
        coverWrap.appendChild(img);
    } else {
        const ph = document.createElement('div');
        ph.className = 'bzp-card-gradient';
        ph.style.background = 'linear-gradient(135deg,#6d28d9cc,#3b82f644)';
        ph.innerHTML = '<i class="fas fa-music"></i>';
        coverWrap.appendChild(ph);
    }

    if (ago) {
        const badge = document.createElement('div');
        badge.className = 'bzp-la-badge';
        badge.textContent = ago;
        coverWrap.appendChild(badge);
    }

    /* Play button overlay removed */

    const info = document.createElement('div');
    info.className = 'bzp-card-info bzp-la-info';
    const sourceClass = entry.isAutoMix ? 'bzp-la-source bzp-la-automix-source' : 'bzp-la-source';
    info.innerHTML = `
        <div class="bzp-la-song-name">${title}</div>
        <div class="${sourceClass}">${sourceLabel}</div>
        ${movieLabel && movieLabel !== sourceLabel ? `<div class="bzp-la-movie">${movieLabel}</div>` : ''}`;

    card.appendChild(coverWrap);
    card.appendChild(info);
    card.addEventListener('click', () => _bzPlayHistoryEntry(entry));
    return card;
}

/* ── Smart playlist name map (id → display name) ── */
const BZ_SMART_PLAYLIST_NAMES = {
    'bz-quick-picks': 'Quick Picks',
    'bz-weekly-mix': 'Weekly Mix',
    'bz-daily-mix': 'Daily Mix',
    'bz-repeat-rewind': 'Repeat Rewind',
    'bz-hidden-gems': 'Hidden Gems',
    'bz-listen-again': 'Recently Played',
    'bz-infinite-play': 'Infinite Play'
};

/* ── Add year playlist IDs to the smart name map dynamically ── */
function syncYearPlaylistNames() {
    const data = window.customYearAlbumsData || {};
    Object.keys(data).forEach(year => {
        BZ_SMART_PLAYLIST_NAMES[`bz-year-${year}`] = String(year);
    });
}

/* ── Rebuild and find a smart playlist by id ── */
function _getSmartPlaylistById(id) {
    if (id === 'bz-listen-again') return buildListenAgainPlaylist();
    if (id === 'bz-infinite-play') return buildInfinitePlay();
    if (id && id.startsWith('bz-year-')) {
        const year = id.replace('bz-year-', '');
        return buildYearPlaylists().find(yp => yp.id === id) || null;
    }
    return buildMadeForYou().find(pl => pl.id === id) || null;
}
// Expose so the hash-navigation tryOpen in script.js can resolve smart
window.bzGetSmartPlaylist = _getSmartPlaylistById;

/* Play a history entry */
function _bzPlayHistoryEntry(entry) {
    if (typeof window.resolveData !== 'function' || typeof window.selectAlbum !== 'function') return;
    const canonical = window.allSongsMap?.get(String(entry.id));
    if (!canonical?.album) return;

    let targetRaw = null;
    let targetType = 'Movie';
    let navTab = 'home';

    if (entry.isAutoMix && entry.autoMixAlbumId) {
        const amId = String(entry.autoMixAlbumId);
        const amRaw = window.masterPool?.find(a =>
            String(a.id || a.name || a.title) === amId
        ) || canonical.album;
        const amType = entry.autoMixAlbumType || amRaw?.type || 'Movie';
        const amData = window.resolveData(amRaw, amType);
        if (amData) {
            window.currentAlbum = amData;
            window.lastActiveView = 'home';
            window._highlightActive = false;
            window.selectAlbum(amData, true, 'home', false);
            const targetSongId = String(entry.id);
            setTimeout(() => {
                const idx2 = (amData.songs || []).findIndex(x => String(x.id) === targetSongId);
                if (idx2 >= 0) {
                    const tSong = amData.songs[idx2];
                    const tCanonical = window.allSongsMap?.get(targetSongId);
                    const tSource = tCanonical?.album || amRaw;
                    const tCover = tSource?.imageUrl || tSource?.albumCover || amData.imageUrl || '';
                    const titleEl = document.getElementById('player-song-title');
                    const artistEl = document.getElementById('player-song-artist');
                    const coverEl = document.getElementById('player-album-cover');
                    if (titleEl && tSong?.title) titleEl.textContent = tSong.title;
                    if (artistEl && tSong?.artist !== undefined) artistEl.textContent = tSong.artist || '';
                    if (coverEl && tCover) coverEl.src = tCover;
                    // FIX Issue 20: do NOT set document.title directly with ⏸ symbol
                    if (typeof window.updateDynamicTitle === 'function') window.updateDynamicTitle();
                }
                const container = document.getElementById('album-view-container') || document.querySelector('.album-view');
                if (container) {
                    const row = container.querySelector('.song-item[data-song-id="' + targetSongId + '"]');
                    if (row) {
                        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        row.classList.add('bz-history-target');
                        row.addEventListener('animationend', () => row.classList.remove('bz-history-target'), { once: true });
                    }
                }
            }, 120);
            return;
        }
    }

    if (entry.playingAlbumId) {
        const pid = String(entry.playingAlbumId);

        if (BZ_SMART_PLAYLIST_NAMES[pid]) {
            targetRaw = _getSmartPlaylistById(pid);
            targetType = 'Playlist';
            navTab = 'playlists';
        }

        if (!targetRaw && window.masterPool) {
            targetRaw = window.masterPool.find(a =>
                String(a.id || a.name || a.title) === pid
            );
            if (targetRaw) {
                targetType = entry.playingAlbumType || targetRaw.type || 'Movie';
                const t = String(targetType).toLowerCase();
                navTab = (t === 'playlist' || t === 'explore' || t === 'collection' || t === 'artist')
                    ? 'playlists' : 'home';
            }
        }
    }

    if (!targetRaw && entry.sourceView === 'Playlists' && entry.sourceName && window.masterPool) {
        targetRaw = window.masterPool.find(a =>
            (a.name || a.title || '') === entry.sourceName &&
            (a.type === 'Playlist' || a.type === 'Explore' || a.type === 'Collection')
        );
        if (targetRaw) {
            targetType = targetRaw.type || 'Playlist';
            navTab = 'playlists';
        }
    }

    if (!targetRaw) {
        targetRaw = canonical.album;
        targetType = canonical.album.type || 'Movie';
        navTab = 'home';
    }

    const data = window.resolveData(targetRaw, targetType);
    if (!data) return;

    window.currentAlbum = data;
    window.lastActiveView = navTab;
    window._highlightActive = false;
    window.selectAlbum(data, true, navTab, false);

    const targetSongId = String(entry.id);
    setTimeout(() => {
        const idx = (data.songs || []).findIndex(x => String(x.id) === targetSongId);
        if (idx >= 0) {
            const targetSong = data.songs[idx];
            const canonical = window.allSongsMap?.get(targetSongId);
            const sourceAlbum = canonical?.album || targetSong?._sourceAlbum || data;
            const coverUrl = sourceAlbum?.imageUrl || sourceAlbum?.albumCover || data.imageUrl || '';
            const titleEl = document.getElementById('player-song-title');
            const artistEl = document.getElementById('player-song-artist');
            const coverEl = document.getElementById('player-album-cover');
            if (titleEl && targetSong?.title) titleEl.textContent = targetSong.title;
            if (artistEl && targetSong?.artist !== undefined) artistEl.textContent = targetSong.artist || '';
            if (coverEl && coverUrl) coverEl.src = coverUrl;
            // FIX Issue 20: delegate tab title to updateDynamicTitle
            if (typeof window.updateDynamicTitle === 'function') window.updateDynamicTitle();
        }
        const container = document.getElementById('album-view-container') || document.querySelector('.album-view');
        if (container) {
            const row = container.querySelector(`.song-item[data-song-id="${targetSongId}"]`);
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                row.classList.add('bz-history-target');
                row.addEventListener('animationend', () => row.classList.remove('bz-history-target'), { once: true });
            }
        }
    }, 120);
}

/* ── Prepend a new song card to the left of the Listen Again row ── */
window.bzPrependListenAgainPLPL = function (entry) {
    let row = document.getElementById('bzp-la-row');

    if (!row) {
        const container = document.getElementById('bz-smart-playlists-wrap')
            || document.getElementById('playlists-container');
        if (container) {
            const laRow = makeRow([]);
            laRow.id = 'bzp-la-row';
            const section = makeSection(
                makeHeading('fa-clock-rotate-left', 'Listen Again', 'Your recently played songs'),
                laRow
            );
            section.id = 'bzp-la-section';
            container.appendChild(section);
            row = laRow;
        }
    }

    if (row) {
        const old = row.querySelector(`.bzp-la-card[data-bz-id="${CSS.escape(String(entry.id || ''))}"]`);
        if (old) old.remove();
        const card = makeListenAgainCard(entry);
        row.insertBefore(card, row.firstChild);
        // no horizontal scroll — grid layout, no scrollTo needed
    }

    const mfyRow = document.getElementById('bzp-mfy-row');
    if (!mfyRow) return;

    const pl = buildListenAgainPlaylist();
    if (!pl) return;

    const existingCard = mfyRow.querySelector('.bzp-card[data-bz-id="bz-listen-again"]');
    if (existingCard) {
        const meta = existingCard.querySelector('.bzp-card-meta');
        if (meta) meta.textContent = pl.songs.length + ' songs';
    } else {
        const newCard = makePlaylistCard(pl, 'Playlist');
        mfyRow.insertBefore(newCard, mfyRow.firstChild);
        // no horizontal scroll — grid layout, no scrollTo needed
    }
};

/* Remove Recently Played card from MFY + entire Listen Again section */
window.bzRemoveListenAgainPlaylist = function () {
    const mfyRow = document.getElementById('bzp-mfy-row');
    if (mfyRow) {
        const card = mfyRow.querySelector('.bzp-card[data-bz-id="bz-listen-again"]');
        if (card) {
            card.style.transition = 'opacity 0.25s, transform 0.25s';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.92)';
            setTimeout(() => card.remove(), 260);
        }
    }

    const laSection = document.getElementById('bzp-la-section');
    if (laSection) {
        laSection.style.transition = 'opacity 0.25s';
        laSection.style.opacity = '0';
        setTimeout(() => laSection.remove(), 260);
    } else {
        const laRow = document.getElementById('bzp-la-row');
        if (laRow) {
            const sec = laRow.closest('.bzp-section');
            if (sec) {
                sec.style.transition = 'opacity 0.25s';
                sec.style.opacity = '0';
                setTimeout(() => sec.remove(), 260);
            }
        }
    }
};

/* Wrapping grid row — matches home layout */
function makeRow(cards) {
    const row = document.createElement('div');
    row.className = 'bzp-row';
    cards.forEach(c => row.appendChild(c));
    return row;
}

/* Full section wrapper */
function makeSection(headingEl, rowEl) {
    const sec = document.createElement('div');
    sec.className = 'bzp-section';
    sec.appendChild(headingEl);
    sec.appendChild(rowEl);
    return sec;
}

// Custom always-visible horizontal scrollbar
function attachCustomScrollbar(parentEl, row) {
    const track = document.createElement('div');
    track.className = 'bzp-hscroll-track';
    const thumb = document.createElement('div');
    thumb.className = 'bzp-hscroll-thumb';
    track.appendChild(thumb);
    parentEl.appendChild(track);

    function update() {
        const scrollable = row.scrollWidth - row.clientWidth > 4;
        track.style.display = scrollable ? '' : 'none';
        if (!scrollable) return;
        const trackW = track.clientWidth;
        const thumbW = Math.max(30, (row.clientWidth / row.scrollWidth) * trackW);
        const maxLeft = trackW - thumbW;
        const ratio = row.scrollLeft / (row.scrollWidth - row.clientWidth);
        thumb.style.width = thumbW + 'px';
        thumb.style.transform = `translateX(${ratio * maxLeft}px)`;
    }

    row.addEventListener('scroll', update, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(update).observe(row);
    } else {
        window.addEventListener('resize', update);
    }

    /* Layout may not be settled on the very first paint */
    requestAnimationFrame(update);
}

// MAIN RENDER

// SECTION — ARTISTS COLLECTIONS Songs are resolved dynamically

function buildArtistsSection() {
    if (typeof customArtistsData === 'undefined') return null;

    const allCategories = Object.entries(customArtistsData);
    if (!allCategories.length) return null;

    const map = window.allSongsMap;

    // Normalize a string for loose matching:
    function norm(s) {
        return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Resolve all songs from allSongsMap whose artist field
    function songsForArtist(artistName) {
        if (!map) return [];
        const needle = norm(artistName);
        const results = [];
        map.forEach(function (entry) {
            const songArtist = norm(entry.artist || '');
            if (songArtist === needle || songArtist.includes(needle)) {
                results.push(entry);
            }
        });
        /* Sort: newest first (song id usually starts with year) */
        results.sort(function (a, b) {
            return String(b.id || '').localeCompare(String(a.id || ''));
        });
        return results;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'bzp-section';
    wrapper.id = 'bzp-artists-section';

    wrapper.appendChild(makeHeading(
        'fa-microphone-lines',
        'Artists',
        'Browse songs by your favourite artists'
    ));

    // Flatten every category into one list of cards
    const seenArtists = new Set();
    const allCards = [];
    allCategories.forEach(function (entry) {
        const artists = entry[1];
        if (!artists || !artists.length) return;

        artists.forEach(function (artist) {
            const key = artist.id || norm(artist.name);
            if (seenArtists.has(key)) return;
            seenArtists.add(key);

            const resolvedSongs = songsForArtist(artist.name);
            const artistItem = {
                id: artist.id,
                name: artist.name,
                title: artist.name,
                imageUrl: artist.imageUrl || '',
                albumCover: artist.imageUrl || '',
                cover: artist.imageUrl || '',
                icon: 'fa-microphone-lines',
                color: '#a855f7',
                type: 'artist',
                songs: resolvedSongs
            };
            allCards.push(makePlaylistCard(artistItem, 'Artist'));
        });
    });

    // Single horizontally-scrolling row (left → right) for all artists.
    const row = makeRow(allCards);
    row.classList.add('bzp-artists-row');
    wrapper.appendChild(row);
    attachCustomScrollbar(wrapper, row);

    return wrapper;
}

// SECTION — HEROES COLLECTIONS Matches Artists' behaviour exactly

function buildHeroesSection() {
    if (typeof customHeroesData === 'undefined') return null;

    const allCategories = Object.entries(customHeroesData);
    if (!allCategories.length) return null;

    const map = window.allSongsMap;

    function norm(s) {
        return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Pull the actor/hero value off a song entry
    function actorFieldOf(entry) {
        if (!entry) return '';
        const album = entry.album || {};
        const direct = album.actors || album.actor || album.Actors || album.Actor ||
            album.hero || album.heroes || album.Hero || album.Heroes ||
            album.cast || album.Cast || album.starring || album.Starring ||
            entry.actor || entry.actors || entry.Actor || entry.Actors ||
            entry.hero || entry.heroes || entry.Hero || entry.Heroes ||
            entry.cast || entry.Cast || entry.starring || entry.Starring;
        if (direct) return Array.isArray(direct) ? direct.join(', ') : direct;
        // Fallback: scan every key on the entry AND its album for one whose name
        for (const src of [entry, album]) {
            for (const k in src) {
                if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
                const kl = k.toLowerCase();
                if (kl.includes('actor') || kl.includes('hero') || kl.includes('cast')) {
                    const v = src[k];
                    if (v) return Array.isArray(v) ? v.join(', ') : v;
                }
            }
        }
        return '';
    }

    // Resolve all songs from allSongsMap whose actor field contains
    function songsForHero(heroName) {
        if (!map) return [];
        const needle = norm(heroName);
        if (!needle) return [];
        const seen = new Set();
        const results = [];
        map.forEach(function (entry) {
            const raw = actorFieldOf(entry);
            if (!raw) return;
            const parts = String(raw).split(/[,/&]| and /i);
            const isMatch = parts.some(function (part) {
                const songActor = norm(part);
                return songActor && (songActor === needle || songActor.includes(needle) || needle.includes(songActor));
            });
            const id = String(entry.id || '');
            if (isMatch && !seen.has(id)) {
                seen.add(id);
                results.push(entry);
            }
        });
        results.sort(function (a, b) {
            return String(b.id || '').localeCompare(String(a.id || ''));
        });
        return results;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'bzp-section';
    wrapper.id = 'bzp-heroes-section';

    wrapper.appendChild(makeHeading(
        'fa-star',
        'Heroes',
        'Browse songs by your favourite heroes'
    ));

    const allHeroes = allCategories.reduce(function (acc, entry) {
        const heroes = entry[1];
        if (heroes && heroes.length) acc.push.apply(acc, heroes);
        return acc;
    }, []);

    // Dedupe — same hero listed under two categories shouldn't produce two
    const seenHeroes = new Set();
    const dedupedHeroes = allHeroes.filter(function (hero) {
        const key = hero.id || norm(hero.name);
        if (seenHeroes.has(key)) return false;
        seenHeroes.add(key);
        return true;
    });

    const cards = dedupedHeroes.map(function (hero) {
        const resolvedSongs = songsForHero(hero.name);
        const heroItem = {
            id: hero.id,
            name: hero.name,
            title: hero.name,
            imageUrl: hero.imageUrl || '',
            albumCover: hero.imageUrl || '',
            cover: hero.imageUrl || '',
            icon: 'fa-star',
            color: '#f59e0b',
            type: 'hero',
            songs: resolvedSongs
        };
        return makePlaylistCard(heroItem, 'Hero');
    });

    // Single horizontally-scrolling row (left → right)
    const row = makeRow(cards);
    row.classList.add('bzp-heroes-row');
    wrapper.appendChild(row);
    attachCustomScrollbar(wrapper, row);

    // Exposed so executeSearchLogic (script.js) can resolve real hero song
    window.bzResolveHeroSongs = songsForHero;

    return wrapper;
}

function renderPlaylistsNew(container) {
    container.innerHTML = '';

    /* ── Keep year-playlist name sync (needed by Beat Zen Universe below) ── */
    syncYearPlaylistNames();

    /* ── 3. RECOMMENDED FOR TODAY ── */
    const recommended = buildRecommendedForToday();
    if (recommended.length) {
        const recRow = makeRow(recommended.map(a => makeAlbumCard(a)));
        const recSection = makeSection(
            makeHeading('fa-compass', 'Recommended for Today', 'Refreshes daily at midnight'),
            recRow
        );
        recSection.id = 'bzp-rec-section';
        container.appendChild(recSection);
    }

    /* ── 4. BEAT ZEN UNIVERSE — after Recommended for Today ── */
    const universeWrap = document.createElement('div');
    universeWrap.id = 'bzp-universe-wrap';
    container.appendChild(universeWrap);
    renderBeatZenUniverseSection(universeWrap);

    /* ── 5. ARTISTS COLLECTIONS ── */
    const artistsSection = buildArtistsSection();
    if (artistsSection) container.appendChild(artistsSection);

    /* ── 5b. HEROES COLLECTIONS ── */
    const heroesSection = buildHeroesSection();
    if (heroesSection) container.appendChild(heroesSection);

    /* ── 6. LISTEN AGAIN (last) ── */
    const listenAgain = buildListenAgain();  // returns [] when disabled OR empty

    if (listenAgain.length) {
        /* User has history AND songs played -- show the cards row */
        const laRow = makeRow(listenAgain.map(e => makeListenAgainCard(e)));
        laRow.id = 'bzp-la-row';
        const laSection = makeSection(
            makeHeading('fa-clock-rotate-left', 'Listen Again', 'Your recently played songs'),
            laRow
        );
        laSection.id = 'bzp-la-section';
        container.appendChild(laSection);

    }
    // If there's no listening history yet

    scheduleMidnightRefresh(container);
}

/* ── Midnight auto-refresh — fires for ALL sections ── */
let _midnightTimer = null;
function scheduleMidnightRefresh(container) {
    if (_midnightTimer) clearTimeout(_midnightTimer);
    _midnightTimer = setTimeout(() => {
        _recToday_seed = null;
        _recToday_cache = null;

        const expContainer = document.getElementById('bz-smart-playlists-wrap') || document.getElementById('playlists-container');
        if (expContainer && typeof window.displayPlaylists === 'function') {
            window.displayPlaylists();
        } else if (expContainer && typeof window._bzPlaylistsRender === 'function') {
            window._bzPlaylistsRender(expContainer);
        }
        scheduleMidnightRefresh(expContainer || container);
    }, msUntilMidnight());
}

// KEEP COMPATIBILITY with script.js's displayPlaylists()

const customGenreData = {};
const dailyPlaylistSlots = [];
window.dailyPlaylistGroups = [];

function buildRecapData() { return []; }
function buildDailyPlaylists() { return []; }

window.renderPlaylists = function () {
    const wrap = document.getElementById('bz-smart-playlists-wrap');
    const container = wrap || document.getElementById('playlists-container');
    if (container) renderPlaylistsNew(container);
};

// LIVE SYNC

/* Hook registered by script.js's background fetch callback */
window.bzOnSheetDataRefresh = function (freshData) {
    const sanitize = typeof window.sanitizeSheetData === 'function'
        ? window.sanitizeSheetData
        : (d => d);
    const sanitized = sanitize(freshData);

    const oldCount = _bzCountSongs(window.customYearAlbumsData);
    const newCount = _bzCountSongs(sanitized);

    if (newCount !== oldCount) {
        window.customYearAlbumsData = sanitized;
        if (typeof window.rebuildMasterMap === 'function') window.rebuildMasterMap();
        _bzRefreshUniverseSection();

        // FIX Issue 19: also rebuild the Home grid when new albums arrive
        window._bzDataVersion = Date.now().toString();
        if (window.lastActiveView === 'home' && typeof window.displayHome === 'function') {
            try { window.displayHome(true); } catch (_) { /* never interrupt playback */ }
        }

        // Change 4: bust the dyn-updates cache so new albums immediately
        if (typeof window._bzResetDynCache === 'function') {
            window._bzResetDynCache();
        }

        const diff = newCount - oldCount;
        _bzShowLiveSyncToast(diff > 0 ? `✓ +${diff} new song${diff !== 1 ? 's' : ''} added` : '✓ Songs updated — playlists refreshed');
    }
    /* No toast when nothing changed — silent background sync */
};

function _bzCountSongs(data) {
    if (!data || typeof data !== 'object') return 0;
    return Object.values(data).flat().reduce((s, a) => s + (Array.isArray(a && a.songs) ? a.songs.length : 0), 0);
}

function _bzRefreshUniverseSection() {
    const wrap = document.getElementById('bzp-universe-wrap');
    if (wrap) {
        renderBeatZenUniverseSection(wrap);
    }
}

/* Minimal toast that works without access to script.js's internal */
function _bzShowLiveSyncToast(msg) {
    /* Try the app's own showToast first */
    if (typeof showToast === 'function') { showToast(msg); return; }
    /* Fallback: inject into #toast-container if present */
    const tc = document.getElementById('toast-container');
    if (!tc) return;
    const t = document.createElement('div');
    t.style.cssText = [
        'background:rgba(30,30,50,0.96)',
        'color:#fff',
        'padding:10px 18px',
        'border-radius:24px',
        'font-size:0.83rem',
        'box-shadow:0 4px 20px rgba(0,0,0,0.4)',
        'pointer-events:none',
        'opacity:0',
        'transition:opacity 0.25s'
    ].join(';');
    t.textContent = msg;
    tc.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; });
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3500);
}

// Background polling
(function () {
    const POLL_MS = 5 * 60 * 1000; /* 5 minutes */
    let _pollTimer = null;

    async function poll() {
        const url = window.BEATZEN_SHEET_URL;
        if (!url) return;
        try {
            const res = await fetch(url);
            if (!res.ok) return;
            const data = await res.json();
            if (typeof window.bzOnSheetDataRefresh === 'function') {
                window.bzOnSheetDataRefresh(data);
            }
        } catch (_) { /* silent — never interrupt playback */ }
        _pollTimer = setTimeout(poll, POLL_MS);
    }

    // Start live-sync polling. Called by auth.js when a user signs
    window.bzStartLiveSync = function () {
        if (_pollTimer !== null) return; // already running
        /* First poll 60 seconds after sign-in — let the app fully settle first */
        _pollTimer = setTimeout(poll, 60 * 1000);
    };

    /** Stop live-sync polling.  Called by auth.js when the user signs out. */
    window.bzStopLiveSync = function () {
        if (_pollTimer !== null) {
            clearTimeout(_pollTimer);
            _pollTimer = null;
        }
    };
})();

// INJECTED STYLES
(function injectStyles() {
    if (document.getElementById('bzp-styles')) return;
    const s = document.createElement('style');
    s.id = 'bzp-styles';
    s.textContent = `
/* ── Container ── */
#playlists-container, .playlists-container {
    padding: 12px 0 120px;
    overflow-y: auto;
}

/* ── Section ── */
.bzp-section { margin: 1.25rem 0 32px; }

/* ── Section heading ── */
.bzp-section-head { padding: 0 0 12px 0; }
.bzp-section-title-row { display: flex; align-items: center; }
.bzp-section-icon { display: none; }
.bzp-section-title {
    font-size: 1.8rem;
    font-weight: 800;
    color: var(--text, #fff);
    letter-spacing: -0.2px;
    line-height: 1.2;
    margin: 0 0 0.45rem 16px;
}
.bzp-section-sub { display: none; }

@media (max-width: 767px) {
    .bzp-section-title { font-size: 1.4rem; margin-left: 14px; }
}
@media (max-width: 480px) {
    .bzp-section-title { font-size: 1.4rem; margin-left: 14px; }
}

/* ════════════════════════════════════════════════
   (Universe section now uses standard .bzp-section-head / .bzp-section-title styles)
════════════════════════════════════════════════ */

/* ── Wrapping grid row — matches home #year-sections-container layout ── */
.bzp-row {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 10px;
    padding: 4px 16px 16px 16px;
    overflow-x: visible;
    overflow-y: visible;
}

@media (max-width: 767px) {
    .bzp-row {
        grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
        gap: 8px;
        padding: 4px 14px 14px 14px;
    }
}
@media (max-width: 480px) {
    .bzp-row {
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        padding: 4px 12px 14px 12px;
    }
}
@media (max-width: 360px) {
    .bzp-row {
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        padding: 4px 10px 12px 10px;
    }
}

/* ── Playlist / Album card ── */
.bzp-card {
    position: relative;
    z-index: 1;
    flex: unset;
    width: 100%;
    min-width: 0;
    cursor: pointer;
    border-radius: 14px;
    overflow: hidden;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    transition: background 0.18s, border-color 0.18s, box-shadow 0.18s;
}
/* FIX: the card used to grow via transform: scale(1.04) on hover. Since
   transform doesn't affect layout, the enlarged box physically spilled past
   its own grid cell into the neighbouring card's space — and because the
   hover background is almost fully transparent (9% white), whatever sat
   underneath in that overlap (the next card's image) showed straight
   through it, looking like "another image" behind the hovered card.
   Fix: never resize the outer card at all — only the image inside
   .bzp-card-cover zooms now (below), and that's safely clipped by
   .bzp-card-cover's own overflow:hidden, so it can never bleed into a
   neighbour. The card itself now just gets a border/shadow "lift" instead,
   which gives hover feedback without ever changing its box size.
   z-index is kept as a second line of defence in case any future hover
   effect (e.g. box-shadow blur) needs to render above a neighbour. */
.bzp-card:hover, .bzp-card:active {
    background: rgba(255,255,255,0.09);
    border-color: rgba(255,255,255,0.18);
    box-shadow: 0 6px 18px rgba(0,0,0,0.35);
    z-index: 20;
}
.bzp-card-cover {
    width: 100%;
    height: auto;
    aspect-ratio: 1 / 1;
    position: relative;
    overflow: hidden;
}
.bzp-card-cover img {
    width: 100%; height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.3s;
}
/* Image zoom stays fully inside .bzp-card-cover's own clip — cannot bleed
   into a neighbouring card no matter how the row is laid out. */
.bzp-card:hover .bzp-card-cover img { transform: scale(1.06); }

.bzp-card-gradient {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    font-size: 2.2rem;
    color: rgba(255,255,255,0.40);
    background: linear-gradient(135deg, rgba(109,40,217,0.8), rgba(59,130,246,0.5));
}

/* Active / playing card highlight */
.bzp-card--playing,
.bzp-la-card--active {
    border-color: #1db954 !important;
    background: transparent !important;
    box-shadow: 0 0 0 2px #1db954;
}
.bzp-la-card--active .bzp-la-song-name { color: inherit; }


.bzp-card-info { padding: 8px 10px 10px; display: flex; flex-direction: column; align-items: center; text-align: center; }
.bzp-card-name {
    font-size: 0.86rem;
    font-weight: 700;
    color: var(--text, #fff);
    text-align: center;
    white-space: normal;
    overflow: hidden;
    max-height: calc(1.35em * 2);
    line-height: 1.35;
    word-break: break-word;
}
.bzp-card-meta {
    font-size: 0.70rem;
    color: rgba(255,255,255,0.42);
    margin-top: 3px;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

@media (max-width: 480px) {
    .bzp-card-name { font-size: 0.76rem; }
    .bzp-card-meta { font-size: 0.64rem; }
}

/* ── Listen Again insight cards ── */
.bzp-la-card { flex: unset; width: 100%; min-width: 0; background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.10); }
.bzp-la-cover { width: 100%; height: auto; aspect-ratio: 1 / 1; position: relative; }
.bzp-la-badge {
    position: absolute;
    bottom: 7px; left: 8px;
    background: rgba(0,0,0,0.72);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    color: rgba(255,255,255,0.82);
    font-size: 0.60rem;
    font-weight: 600;
    letter-spacing: 0.3px;
    padding: 2px 7px;
    border-radius: 20px;
    white-space: nowrap;
    pointer-events: none;
    z-index: 2;
}
.bzp-la-info { padding: 8px 10px 10px; align-items: flex-start; text-align: left; }
.bzp-la-song-name {
    font-size: 0.83rem;
    font-weight: 700;
    color: #fff;
    line-height: 1.3;
    max-height: calc(1.3em * 2);
    overflow: hidden;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
}
.bzp-la-source {
    font-size: 0.68rem;
    color: rgba(255,255,255,0.45);
    margin-top: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
}
.bzp-la-movie {
    font-size: 0.63rem;
    color: rgba(255,255,255,0.28);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
}
.bzp-la-dur {
    font-size: 0.62rem;
    color: rgba(255,255,255,0.30);
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
}
.bzp-la-dur i { font-size: 0.55rem; }

@media (max-width: 480px) {
    .bzp-la-song-name { font-size: 0.75rem; }
}
    `;
    document.head.appendChild(s);
})();

// INIT
document.addEventListener('DOMContentLoaded', () => {
    /* Pre-expose so script.js's displayPlaylists can call it */
    window._bzPlaylistsRender = renderPlaylistsNew;
    /* Sync year names into the smart-playlist name map */
    syncYearPlaylistNames();
});

// MERGED FROM: artists.js

const customArtistsData = {
    "Male Artists": [
        { id: "anirudh", name: "Anirudh Ravichander", imageUrl: "" },
        { id: "dsp", name: "Devi Sri Prasad", imageUrl: "" },
        { id: "thaman", name: "Thaman S", imageUrl: "" },
        { id: "sid-sriram", name: "Sid Sriram", imageUrl: "" },
        { id: "armaan-malik", name: "Armaan Malik", imageUrl: "" },
        { id: "arijit-singh", name: "Arijit Singh", imageUrl: "" },
        { id: "javed-ali", name: "Javed Ali", imageUrl: "" },
        { id: "karthik", name: "Karthik", imageUrl: "" },
        { id: "nakash-aziz", name: "Nakash Aziz", imageUrl: "" },
        { id: "anurag-kulkarni", name: "Anurag Kulkarni", imageUrl: "" },
        { id: "revanth", name: "Revanth", imageUrl: "" },
        { id: "rahul-sipligunj", name: "Rahul Sipligunj", imageUrl: "" },
        { id: "ram-miriyala", name: "Ram Miriyala", imageUrl: "" },
        { id: "hema-chandra", name: "Hema Chandra", imageUrl: "" },
        { id: "keeravaani", name: "MM Keeravaani", imageUrl: "" },
        { id: "sreerama-chandra", name: "Sreerama Chandra", imageUrl: "" },
        { id: "vishal-mishra", name: "Vishal Mishra", imageUrl: "" },
        { id: "spb", name: "S.P. Balasubrahmanyam", imageUrl: "" },
        { id: "mano", name: "Mano", imageUrl: "" }
    ],
    "Female Artists": [
        { id: "shreya-ghoshal", name: "Shreya Ghoshal", imageUrl: "" },
        { id: "mangli", name: "Mangli", imageUrl: "" },
        { id: "chinmayi", name: "Chinmayi Sripada", imageUrl: "" },
        { id: "ramya-behara", name: "Ramya Behara", imageUrl: "" },
        { id: "geetha-madhuri", name: "Geetha Madhuri", imageUrl: "" },
        { id: "sahithi-chaganti", name: "Sahithi Chaganti", imageUrl: "" },
        { id: "haripriya", name: "Haripriya", imageUrl: "" },
        { id: "indravathi-chauhan", name: "Indravathi Chauhan", imageUrl: "" },
        { id: "sameera-bharadwaj", name: "Sameera Bharadwaj", imageUrl: "" },
        { id: "kanakavva", name: "Kanakavva", imageUrl: "" },
        { id: "madhu-priya", name: "Madhu Priya", imageUrl: "" }
    ]
};

// HEROES COLLECTIONS DATA

const customHeroesData = {
    "Legends": [
        { id: "chiranjeevi", name: "Chiranjeevi", imageUrl: "" },
        { id: "nagarjuna", name: "Nagarjuna", imageUrl: "" },
        { id: "venkatesh", name: "Venkatesh", imageUrl: "" },
        { id: "balakrishna", name: "Balakrishna", imageUrl: "" },
        { id: "mohan-babu", name: "Mohan Babu", imageUrl: "" },
        { id: "rajasekhar", name: "Rajasekhar", imageUrl: "" }
    ],
    "Superstars": [
        { id: "mahesh-babu", name: "Mahesh Babu", imageUrl: "" },
        { id: "prabhas", name: "Prabhas", imageUrl: "" },
        { id: "allu-arjun", name: "Allu Arjun", imageUrl: "" },
        { id: "jr-ntr", name: "Jr NTR", imageUrl: "" },
        { id: "ram-charan", name: "Ram Charan", imageUrl: "" },
        { id: "pawan-kalyan", name: "Pawan Kalyan", imageUrl: "" },
        { id: "ravi-teja", name: "Ravi Teja", imageUrl: "" },
        { id: "gopichand", name: "Gopichand", imageUrl: "" }
    ],
    "Young & New Gen": [
        { id: "nani", name: "Nani", imageUrl: "" },
        { id: "vijay-deverakonda", name: "Vijay Deverakonda", imageUrl: "" },
        { id: "nithiin", name: "Nithiin", imageUrl: "" },
        { id: "sharwanand", name: "Sharwanand", imageUrl: "" },
        { id: "naga-chaitanya", name: "Naga Chaitanya", imageUrl: "" },
        { id: "akhil-akkineni", name: "Akhil Akkineni", imageUrl: "" },
        { id: "sai-dharam-tej", name: "Sai Dharam Tej", imageUrl: "" },
        { id: "varun-tej", name: "Varun Tej", imageUrl: "" },
        { id: "ram-pothineni", name: "Ram Pothineni", imageUrl: "" },
        { id: "rana-daggubati", name: "Rana Daggubati", imageUrl: "" },
        { id: "nikhil-siddhartha", name: "Nikhil Siddhartha", imageUrl: "" },
        { id: "vishwak-sen", name: "Vishwak Sen", imageUrl: "" },
        { id: "sudheer-babu", name: "Sudheer Babu", imageUrl: "" },
        { id: "adivi-sesh", name: "Adivi Sesh", imageUrl: "" },
        { id: "sundeep-kishan", name: "Sundeep Kishan", imageUrl: "" },
        { id: "kalyan-ram", name: "Kalyan Ram", imageUrl: "" },
        { id: "bellamkonda-sreenivas", name: "Bellamkonda Sreenivas", imageUrl: "" },
        { id: "allari-naresh", name: "Allari Naresh", imageUrl: "" },
        { id: "raj-tarun", name: "Raj Tarun", imageUrl: "" },
        { id: "teja-sajja", name: "Teja Sajja", imageUrl: "" }
    ]
};

// MERGED FROM: beatzen-pro.js

document.addEventListener("DOMContentLoaded", () => {

    // SECTION 0 — Local utilities
    function sanitizeHTML(str) {
        const d = document.createElement('div');
        d.textContent = String(str ?? '');
        return d.innerHTML;
    }

    function formatDuration(val) {
        if (!val && val !== 0) return '0:00';
        const str = String(val).trim();
        // Already a m:ss or h:mm:ss string — pass through unchanged
        if (/^\d+:\d{2}(:\d{2})?$/.test(str)) return str;
        // Raw seconds number — convert
        const s = parseInt(str) || 0;
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    // SECTION 1
    if (window._bzAutoMixStartIndex === undefined) window._bzAutoMixStartIndex = -1;

    // Helpers to read / write the boundary
    function getAutoMixBoundary() { return window._bzAutoMixStartIndex ?? -1; }
    function setAutoMixBoundary(idx) { window._bzAutoMixStartIndex = idx; }
    function clearAutoMixBoundary() { window._bzAutoMixStartIndex = -1; }

    // SECTION 2 — DOM refs
    const overlay = document.getElementById('bz-queue-fullscreen');
    const queueList = document.getElementById('bz-queue-list');
    const queueStats = document.getElementById('bz-queue-stats');
    const queueBody = document.querySelector('.bz-queue-body');
    const emptyState = document.getElementById('bz-empty-state');
    const activeContainer = document.getElementById('bz-queue-active-container');
    const openBtn = document.getElementById('bz-queue-open-btn');
    const openBtnMini = document.getElementById('bz-queue-mini-btn');
    const closeBtn = document.getElementById('bz-queue-close');
    const clearBtn = document.getElementById('bz-queue-clear');
    const audioPlayer = document.getElementById('audio-player');

    let dragSrcIndex = null;
    let dragOverIndex = null;

    // Edge auto-scroll while dragging inside the queue body
    const EDGE_ZONE = 80;   // px from edge where scrolling kicks in
    const SCROLL_MAX = 18;  // max px scrolled per animation frame
    let _autoScrollRAF = null;

    function _startAutoScroll(clientY) {
        if (!queueBody) return;
        const rect = queueBody.getBoundingClientRect();
        const distTop = clientY - rect.top;
        const distBottom = rect.bottom - clientY;

        let speed = 0;
        if (distTop < EDGE_ZONE && distTop >= 0) {
            // Near top — scroll up; closer to edge = faster
            speed = -SCROLL_MAX * (1 - distTop / EDGE_ZONE);
        } else if (distBottom < EDGE_ZONE && distBottom >= 0) {
            // Near bottom — scroll down
            speed = SCROLL_MAX * (1 - distBottom / EDGE_ZONE);
        }

        if (speed !== 0) {
            queueBody.scrollTop += speed;
            _autoScrollRAF = requestAnimationFrame(() => _startAutoScroll(clientY));
        } else {
            _stopAutoScroll();
        }
    }

    function _stopAutoScroll() {
        if (_autoScrollRAF !== null) {
            cancelAnimationFrame(_autoScrollRAF);
            _autoScrollRAF = null;
        }
    }

    // Track cursor Y during drag via dragover on the whole overlay so we get
    function _onOverlayDragOver(e) {
        if (dragSrcIndex === null) return; // not our drag
        e.preventDefault();
        _stopAutoScroll();
        _autoScrollRAF = requestAnimationFrame(() => _startAutoScroll(e.clientY));
    }

    function _onOverlayDragEnd() {
        _stopAutoScroll();
        overlay.removeEventListener('dragover', _onOverlayDragOver);
        overlay.removeEventListener('dragend', _onOverlayDragEnd);
        overlay.removeEventListener('drop', _onOverlayDragEnd);
    }

    // SECTION 3 — Open / Close
    function openQueue() {
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        renderFullscreenQueue();
        // Push a history entry so the browser back gesture / Escape key pops
        history.pushState({ bzQueue: true }, '', window.location.href);
    }
    let _closingFromPopstate = false;
    function closeQueue(fromPopstate = false) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        // If closed by button/Escape (not by popstate)
        if (!fromPopstate) {
            _closingFromPopstate = true;
            history.back();
        }
    }

    // QUEUE PERSISTENCE
    const QUEUE_KEY = 'beatZen_queueState';
    const QUEUE_MAX_AGE = 86400000; // 24 h

    function saveQueueState() {
        try {
            if (!window.playingAlbum?.songs?.length) return;
            const mainAlbumId = String(
                window.playingAlbum.id ||
                window.playingAlbum.name ||
                window.playingAlbum.title || ''
            );
            if (!mainAlbumId) return;

            const entries = window.playingAlbum.songs.map(s => {
                const entry = {
                    id: String(s.id || ''),
                    src: String(
                        s._sourceAlbum?.id ||
                        s._sourceAlbum?.name ||
                        s._sourceAlbum?.title ||
                        mainAlbumId
                    )
                };
                if (s._autoMix) entry.am = 1;
                return entry;
            });

            // Also persist the current song index + playback position
            const _ci = window.currentSongIndex ?? 0;
            const _ct = (audioPlayer && !isNaN(audioPlayer.currentTime) && audioPlayer.currentTime > 2)
                ? audioPlayer.currentTime : 0;
            const _sid = String(window.playingAlbum.songs[_ci]?.id ?? '');

            localStorage.setItem(QUEUE_KEY, JSON.stringify({
                albumId: mainAlbumId,
                entries,
                boundary: getAutoMixBoundary(),
                savedAt: Date.now(),
                currentSongId: _sid,
                currentTime: _ct
            }));
        } catch (_) { /* quota full or private browsing — silently skip */ }
    }

    function restoreQueueState() {
        try {
            const raw = localStorage.getItem(QUEUE_KEY);
            if (!raw || !window.playingAlbum || !window.masterPool?.length) return;

            const saved = JSON.parse(raw);
            const mainAlbumId = String(
                window.playingAlbum.id ||
                window.playingAlbum.name ||
                window.playingAlbum.title || ''
            );

            // Guard: stale save from a different album or past the 24-h window.
            const _restoredSongId = String(window.playingAlbum.songs?.[window.currentSongIndex]?.id ?? '');
            const _wasAutoMixSourceOfCurrent = Array.isArray(saved.entries) && saved.entries.some(e =>
                String(e.id) === _restoredSongId && e.am && String(e.src || saved.albumId) === mainAlbumId
            );
            if (saved.albumId !== mainAlbumId && !_wasAutoMixSourceOfCurrent) return;
            if (Date.now() - (saved.savedAt || 0) > QUEUE_MAX_AGE) {
                localStorage.removeItem(QUEUE_KEY);
                return;
            }

            const savedEntries = saved.entries || [];
            const currentSongs = window.playingAlbum.songs;

            // Nothing to do if order + length are identical
            const savedIds = savedEntries.map(e => String(e.id));
            const currentIds = currentSongs.map(s => String(s.id));
            if (
                savedIds.length === currentIds.length &&
                savedIds.every((id, i) => id === currentIds[i])
            ) return;

            // Build fast lookup for currently loaded songs
            const currentMap = new Map(currentSongs.map(s => [String(s.id), s]));
            // Cache resolved albums so we call resolveData at most once per source
            const albumCache = new Map([[mainAlbumId, window.playingAlbum]]);

            const newSongs = [];
            for (const entry of savedEntries) {
                const sid = String(entry.id || '');
                if (!sid) continue;

                // Fast-path: song already in the loaded album
                if (currentMap.has(sid)) {
                    newSongs.push(currentMap.get(sid));
                    continue;
                }

                // Slow-path: song came from a different source (auto-mix) — re-hydrate
                const srcId = entry.src || mainAlbumId;
                if (!albumCache.has(srcId) && window.resolveData) {
                    const rawAlbum = window.masterPool.find(a =>
                        String(a.id || a.name || a.title || '') === srcId
                    );
                    if (rawAlbum) {
                        const h = window.resolveData(rawAlbum, rawAlbum.type || 'Movie');
                        if (h) albumCache.set(srcId, h);
                    }
                }
                const srcAlbum = albumCache.get(srcId);
                if (!srcAlbum) continue;

                const song = srcAlbum.songs?.find(s => String(s.id) === sid);
                if (!song) continue;

                const cloned = { ...song };
                if (entry.am) {
                    cloned._autoMix = true;
                    cloned._sourceAlbum = srcAlbum;
                }
                newSongs.push(cloned);
            }

            if (newSongs.length > 0) {
                window.playingAlbum.songs = newSongs;
                if (saved.boundary > 0) window._bzAutoMixStartIndex = saved.boundary;

                // FIX Issue 6: After rebuilding the queue
                const _restoreSongId = String(
                    window.playingAlbum.songs[window.currentSongIndex]?.id ?? ''
                );
                if (_restoreSongId) {
                    const _newIdx = newSongs.findIndex(s => String(s.id) === _restoreSongId);
                    if (_newIdx >= 0) window.currentSongIndex = _newIdx;
                }

                // FIX (critical): sets _restoreApplied
                if (window.applySavedTime && audioPlayer && !audioPlayer._restoreApplied) {
                    window.applySavedTime();
                }
            }
        } catch (e) {
            console.warn('BZ: restoreQueueState failed', e);
        }
    }

    // SECTION 4 — Clear confirm popup
    function showClearConfirm() {
        const songs = window.playingAlbum?.songs || [];
        const ci = window.currentSongIndex || 0;
        const upNextCount = songs.length - (ci + 1);
        if (upNextCount <= 0) return;

        dismissClearConfirm();

        const popup = document.createElement('div');
        popup.id = 'bz-clear-popup';
        popup.className = 'bz-clear-popup';
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-modal', 'true');
        popup.innerHTML = `
            <div class="bz-popup-box">
                <div class="bz-popup-icon"><i class="fas fa-trash-can"></i></div>
                <h3 class="bz-popup-title">Clear Up Next?</h3>
                <p class="bz-popup-body">
                    This will remove
                    <strong>${upNextCount} upcoming song${upNextCount !== 1 ? 's' : ''}</strong>
                    from the queue, including any Auto-Mix songs.<br>
                    <span class="bz-popup-note">
                        <i class="fas fa-circle-check"></i>
                        Now Playing will keep playing.
                    </span>
                </p>
                <div class="bz-popup-actions">
                    <button class="bz-popup-cancel" id="bz-popup-cancel">Keep Queue</button>
                    <button class="bz-popup-ok" id="bz-popup-ok">
                        <i class="fas fa-trash"></i> Clear All
                    </button>
                </div>
            </div>`;

        document.body.appendChild(popup);
        requestAnimationFrame(() => popup.classList.add('visible'));
        setTimeout(() => document.getElementById('bz-popup-cancel')?.focus(), 50);

        document.getElementById('bz-popup-cancel').addEventListener('click', dismissClearConfirm);
        document.getElementById('bz-popup-ok').addEventListener('click', () => {
            executeClearUpNext(); dismissClearConfirm();
        });
        popup.addEventListener('click', (e) => { if (e.target === popup) dismissClearConfirm(); });
        popup._keyHandler = (e) => { if (e.key === 'Escape') dismissClearConfirm(); };
        document.addEventListener('keydown', popup._keyHandler);
    }

    function dismissClearConfirm() {
        const popup = document.getElementById('bz-clear-popup');
        if (!popup) return;
        if (popup._keyHandler) document.removeEventListener('keydown', popup._keyHandler);
        popup.classList.remove('visible');
        setTimeout(() => popup.remove(), 300);
    }

    function executeClearUpNext() {
        if (!window.playingAlbum) return;
        const ci = window.currentSongIndex || 0;
        window.playingAlbum.songs.splice(ci + 1);
        clearAutoMixBoundary();
        saveQueueState();          // persist cleared state
        renderFullscreenQueue();
    }

    // Remove only AutoMix-flagged songs from the queue tail
    function removeAutoMixSongsFromQueue() {
        if (!window.playingAlbum?.songs) return;
        const ci = window.currentSongIndex || 0;
        // Keep current song and any manually-queued (non-_autoMix) songs
        window.playingAlbum.songs = window.playingAlbum.songs.filter(
            (s, idx) => idx <= ci || !s._autoMix
        );
        clearAutoMixBoundary();
        if (typeof saveQueueState === 'function') saveQueueState();
    }

    // SECTION 5 — Per-item remove
    function removeSongAt(realIdx) {
        if (!window.playingAlbum?.songs) return;
        const ci = window.currentSongIndex || 0;
        if (realIdx <= ci) return;
        window.playingAlbum.songs.splice(realIdx, 1);
        // Adjust boundary
        const bnd = getAutoMixBoundary();
        if (bnd > 0 && realIdx < bnd) setAutoMixBoundary(bnd - 1);
        else if (bnd > 0 && realIdx === bnd && window.playingAlbum.songs.length <= bnd) clearAutoMixBoundary();
        saveQueueState();          // persist after removal
        renderFullscreenQueue();
    }

    // SECTION 6 — Jump to song
    function jumpToSong(realIdx) {
        if (!window.playSong) return;
        window.playSong(realIdx);
        setTimeout(renderFullscreenQueue, 80);
    }

    // SECTION 7 — Album cover helper
    function getCoverForSong(song) {
        if (!song) return '';
        const songId = String(song.id || '');
        const canon = window.allSongsMap?.get(songId)?.album;
        // FIX Issue 2: prefer _sourceAlbum
        return canon?.imageUrl || canon?.albumCover
            || song._sourceAlbum?.imageUrl || song._sourceAlbum?.albumCover
            || window.playingAlbum?.imageUrl || window.playingAlbum?.albumCover || '';
    }

    function getCurrentAlbumCover() {
        const ci = window.currentSongIndex ?? 0;
        return getCoverForSong(window.playingAlbum?.songs?.[ci]);
    }

    // SECTION 7b

    // Candidate button ID / selector lists — ordered by likelihood
    const _PREV_SELECTORS = ['#prev-btn', '#prev-song-btn', '#prevBtn', '#player-prev',
        '.prev-btn', '[data-action="prev"]', 'button.prev',
        '#back-btn', '#backward-btn'];
    const _NEXT_SELECTORS = ['#next-btn', '#next-song-btn', '#nextBtn', '#player-next',
        '.next-btn', '[data-action="next"]', 'button.next',
        '#forward-btn', '#skip-btn'];
    const _PLAY_SELECTORS = ['#play-pause-btn', '#play-btn', '#pause-btn', '#playPauseBtn',
        '#player-play', '#player-playpause', '.play-pause-btn',
        '[data-action="play-pause"]', '[data-action="toggle-play"]',
        'button.play-pause', '#togglePlay', '#play-pause'];

    function _clickFirst(selectors) {
        for (const sel of selectors) {
            try {
                const el = document.querySelector(sel);
                if (el) { el.click(); return true; }
            } catch (_) { }
        }
        return false;
    }

    function _bzPrevSong() {
        if (typeof window.playPrevSong === 'function') { window.playPrevSong(); return; }
        if (typeof window.prevSong === 'function') { window.prevSong(); return; }
        if (typeof window.playPrev === 'function') { window.playPrev(); return; }
        if (typeof window.skipPrev === 'function') { window.skipPrev(); return; }
        // Fallback: click the main player's prev button
        if (!_clickFirst(_PREV_SELECTORS)) {
            // Last resort: decrement index and playSong
            if (typeof window.playSong === 'function' && window.currentSongIndex > 0) {
                window.playSong(window.currentSongIndex - 1);
            }
        }
    }

    function _bzNextSong() {
        if (typeof window.playNextSong === 'function') { window.playNextSong(); return; }
        if (typeof window.nextSong === 'function') { window.nextSong(); return; }
        if (typeof window.playNext === 'function') { window.playNext(); return; }
        if (typeof window.skipNext === 'function') { window.skipNext(); return; }
        if (typeof window.skipForward === 'function') { window.skipForward(); return; }
        // Fallback: click the main player's next button
        if (!_clickFirst(_NEXT_SELECTORS)) {
            const songs = window.playingAlbum?.songs || [];
            const ci = window.currentSongIndex ?? 0;
            if (typeof window.playSong === 'function' && ci < songs.length - 1) {
                window.playSong(ci + 1);
            }
        }
    }

    function _bzTogglePlay() {
        if (typeof window.togglePlayback === 'function') { window.togglePlayback(); return; }
        if (typeof window.togglePlay === 'function') { window.togglePlay(); return; }
        if (typeof window.playPause === 'function') { window.playPause(); return; }
        if (typeof window.togglePause === 'function') { window.togglePause(); return; }
        // Fallback: click the main player's play/pause button
        if (!_clickFirst(_PLAY_SELECTORS) && audioPlayer) {
            // Last resort: directly toggle the audio element
            if (audioPlayer.paused) { audioPlayer.play().catch(() => { }); }
            else { window._bzMarkExplicitPause?.(); audioPlayer.pause(); }
        }
    }

    // SECTION 8 — Now Playing card
    function renderNowPlaying(songs, ci) {
        if (ci < 0 || ci >= songs.length) { activeContainer.innerHTML = ''; return; }
        const cur = songs[ci];
        const cover = getCurrentAlbumCover();
        const isPlaying = audioPlayer ? !audioPlayer.paused : false;
        const favd = isFavourite(cur.id);

        activeContainer.innerHTML = `
            <div class="bz-q-item bz-now-card" style="cursor:default;">
                <img class="bz-q-img" src="${sanitizeHTML(cover)}"
                     onerror="this.style.background='rgba(255,255,255,0.06)'">
                <div class="bz-q-info">
                    <span class="bz-q-title">${sanitizeHTML(cur.title)}</span>
                    <span class="bz-q-artist">${sanitizeHTML(cur.artist || 'Unknown')}</span>
                </div>
                <div class="bz-q-now-controls">
                    <button class="bz-q-action-btn bz-q-fav-btn bz-q-now-fav-btn${favd ? ' bz-q-fav-btn--active' : ''}"
                            id="bz-q-now-fav-btn"
                            title="${favd ? 'Remove from Favourites' : 'Add to Favourites'}">
                        <i class="${favd ? 'fas fa-heart' : 'far fa-heart'}"></i>
                    </button>
                    <button class="bz-q-ctrl-btn" id="bz-q-prev-btn" title="Previous">
                        <i class="fas fa-backward-step"></i>
                    </button>
                    <button class="bz-q-ctrl-btn bz-q-playpause" id="bz-q-pp-btn" title="${isPlaying ? 'Pause' : 'Play'}">
                        <i class="fas ${isPlaying ? 'fa-pause' : 'fa-play'}"></i>
                    </button>
                    <button class="bz-q-ctrl-btn" id="bz-q-next-btn" title="Next">
                        <i class="fas fa-forward-step"></i>
                    </button>
                </div>
            </div>`;

        activeContainer.querySelector('#bz-q-now-fav-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavourite(cur);
        });
        activeContainer.querySelector('#bz-q-prev-btn').addEventListener('click', () => {
            _bzPrevSong(); setTimeout(renderFullscreenQueue, 80);
        });
        activeContainer.querySelector('#bz-q-pp-btn').addEventListener('click', () => {
            _bzTogglePlay(); setTimeout(renderFullscreenQueue, 80);
        });
        activeContainer.querySelector('#bz-q-next-btn').addEventListener('click', () => {
            _bzNextSong(); setTimeout(renderFullscreenQueue, 80);
        });
    }

    // Favourite Toast
    function isFavourite(songId) { return window.bzIsFavourite ? window.bzIsFavourite(songId) : false; }
    function toggleFavourite(song) { if (window.bzToggleFavourite) window.bzToggleFavourite(song); renderFullscreenQueue(); }

    // SECTION 9 — Build one queue row element
    function buildQueueRow(song, realIdx, isAutoMix) {
        const cover = getCoverForSong(song);
        const row = document.createElement('div');
        row.className = 'bz-q-item draggable' + (isAutoMix ? ' bz-q-item--automix' : '');
        row.draggable = true;
        row.dataset.idx = realIdx;
        if (isAutoMix) row.dataset.automix = 'true';

        const favd = isFavourite(song.id);

        row.innerHTML = `
            <div class="bz-q-drag" title="Drag to reorder"><i class="fas fa-grip-lines"></i></div>
            <div class="bz-q-img-wrap">
                <img class="bz-q-img" src="${sanitizeHTML(cover)}"
                     onerror="this.style.background='rgba(255,255,255,0.06)'">
            </div>
            <div class="bz-q-info">
                <span class="bz-q-title">${sanitizeHTML(song.title)}</span>
                <span class="bz-q-artist">${sanitizeHTML(song.artist || 'Unknown')}</span>
            </div>
            <div class="bz-q-actions">
                <span class="bz-q-dur">${formatDuration(song.duration)}</span>
                <button class="bz-q-action-btn bz-q-menu-btn" data-action="menu" title="More options">
                    <i class="fas fa-ellipsis-vertical"></i>
                </button>
                <div class="bz-q-menu" draggable="false">
                    <button class="bz-q-menu-item" data-action="favourite">
                        <i class="${favd ? 'fas fa-heart' : 'far fa-heart'}"></i>
                        <span>${favd ? 'Remove from Favourites' : 'Add to Favourites'}</span>
                    </button>
                    <button class="bz-q-menu-item" data-action="play">
                        <i class="fas fa-play"></i>
                        <span>Play now</span>
                    </button>
                    <button class="bz-q-menu-item danger" data-action="remove">
                        <i class="fas fa-xmark"></i>
                        <span>Remove from queue</span>
                    </button>
                </div>
            </div>`;

        // Click row → play
        row.addEventListener('click', (e) => {
            if (e.target.closest('.bz-q-actions') || e.target.closest('.bz-q-drag')) return;
            jumpToSong(realIdx);
        });

        const menuBtn = row.querySelector('[data-action="menu"]');
        const menu = row.querySelector('.bz-q-menu');

        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = menu.classList.contains('open');
            document.querySelectorAll('.bz-q-menu.open').forEach(m => m.classList.remove('open'));
            menu.classList.toggle('open', !isOpen);
        });

        document.addEventListener('click', () => menu.classList.remove('open'));

        row.querySelector('[data-action="favourite"]').addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.remove('open');
            toggleFavourite(song);
        });

        row.querySelector('[data-action="play"]').addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.remove('open');
            jumpToSong(realIdx);
        });

        row.querySelector('[data-action="remove"]').addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.remove('open');
            row.style.transition = 'opacity 0.18s, transform 0.18s';
            row.style.opacity = '0';
            row.style.transform = 'translateX(18px)';
            setTimeout(() => removeSongAt(parseInt(row.dataset.idx)), 190);
        });

        row.addEventListener('touchstart', () => row.classList.add('touch-active'), { passive: true });
        row.addEventListener('touchend', () => setTimeout(() => row.classList.remove('touch-active'), 2200), { passive: true });

        // Drag & Drop
        let _rafDragPending = false;

        row.addEventListener('dragstart', (e) => {
            dragSrcIndex = realIdx;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(realIdx)); // required for Firefox

            // Attach overlay-level dragover so auto-scroll works even
            overlay.addEventListener('dragover', _onOverlayDragOver);
            overlay.addEventListener('dragend', _onOverlayDragEnd);
            overlay.addEventListener('drop', _onOverlayDragEnd);

            // Build a custom ghost so title + artist are never clipped
            const ghost = document.createElement('div');
            ghost.style.cssText = [
                'position:fixed',
                'top:-9999px',
                'left:-9999px',
                `width:${Math.min(row.offsetWidth, 420)}px`,
                'display:flex',
                'align-items:center',
                'padding:10px 14px 10px 10px',
                'gap:14px',
                'background:rgba(15,12,32,0.96)',
                'border:1.5px solid rgba(124,58,237,0.60)',
                'border-radius:14px',
                'box-shadow:0 8px 32px rgba(0,0,0,0.65)',
                'pointer-events:none',
                'z-index:99999',
                'box-sizing:border-box',
            ].join(';');

            // Thumbnail
            const img = document.createElement('img');
            img.src = cover;
            img.style.cssText = 'width:46px;height:46px;min-width:46px;border-radius:8px;object-fit:cover;flex-shrink:0;';
            img.onerror = () => { img.style.background = 'rgba(255,255,255,0.08)'; img.removeAttribute('src'); };
            ghost.appendChild(img);

            // Text block — no overflow clipping
            const info = document.createElement('div');
            info.style.cssText = 'display:flex;flex-direction:column;gap:4px;min-width:0;flex:1;overflow:hidden;';

            const titleEl = document.createElement('span');
            titleEl.textContent = song.title || '';
            titleEl.style.cssText = 'font-weight:700;font-size:0.90rem;color:#f1f0ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;';

            const artistEl = document.createElement('span');
            artistEl.textContent = song.artist || 'Unknown';
            artistEl.style.cssText = 'font-size:0.78rem;color:rgba(255,255,255,0.55);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;';

            info.appendChild(titleEl);
            info.appendChild(artistEl);
            ghost.appendChild(info);

            document.body.appendChild(ghost);
            // Offset so cursor is near the thumb, not at the corner
            e.dataTransfer.setDragImage(ghost, 26, ghost.offsetHeight / 2);
            // Remove ghost after browser captures the image (next frame)
            requestAnimationFrame(() => {
                if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
            });

            // Mark source row as placeholder AFTER browser snapshots ghost
            requestAnimationFrame(() => row.classList.add('dragging'));
        });

        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (_rafDragPending) return; // skip if a frame is already queued
            _rafDragPending = true;
            requestAnimationFrame(() => {
                _rafDragPending = false;
                if (dragOverIndex !== realIdx) {
                    dragOverIndex = realIdx;
                    queueList.querySelectorAll('.bz-q-item').forEach(el => el.classList.remove('drag-target'));
                    row.classList.add('drag-target');
                }
            });
        });

        row.addEventListener('dragleave', (e) => {
            // Only remove if we actually left this row (not a child element)
            if (!row.contains(e.relatedTarget)) {
                row.classList.remove('drag-target');
            }
        });

        row.addEventListener('drop', (e) => {
            e.preventDefault();
            _rafDragPending = false;
            _stopAutoScroll();

            // Clear all visual drag states immediately so nothing looks stuck
            queueList.querySelectorAll('.bz-q-item').forEach(el =>
                el.classList.remove('drag-target', 'dragging', 'drag-over')
            );

            if (dragSrcIndex !== null && dragSrcIndex !== realIdx) {
                const arr = window.playingAlbum.songs;
                // Capture the playing song ID BEFORE splice so we can re-find it after
                const playingSongId = String(arr[window.currentSongIndex ?? -1]?.id ?? '');
                const [moved] = arr.splice(dragSrcIndex, 1);
                const target = dragSrcIndex < realIdx ? realIdx - 1 : realIdx;
                arr.splice(target, 0, moved);
                // Recalculate currentSongIndex
                if (playingSongId) {
                    const newIdx = arr.findIndex(s => String(s.id) === playingSongId);
                    if (newIdx >= 0) window.currentSongIndex = newIdx;
                }
                // Keep automix boundary accurate after drag
                const bnd = getAutoMixBoundary();
                if (bnd > 0) {
                    const src = dragSrcIndex, dst = target;
                    // Dragged from user → automix section
                    if (src < bnd && dst >= bnd) setAutoMixBoundary(bnd - 1);
                    // Dragged from automix → user section
                    else if (src >= bnd && dst < bnd) setAutoMixBoundary(bnd + 1);
                }

                // Smooth settle: fade list out → rebuild → fade back in.
                queueList.style.transition = 'opacity 0.13s ease';
                queueList.style.opacity = '0';
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        renderFullscreenQueue();
                        requestAnimationFrame(() => {
                            queueList.style.opacity = '1';
                            setTimeout(() => { queueList.style.transition = ''; }, 160);
                        });
                    });
                });
            }

            dragSrcIndex = null; dragOverIndex = null;
        });

        row.addEventListener('dragend', () => {
            _rafDragPending = false;
            _stopAutoScroll();
            dragSrcIndex = null; dragOverIndex = null;
            // Clean up visual states; if drop already rebuilt the DOM
            queueList.querySelectorAll('.bz-q-item').forEach(el =>
                el.classList.remove('dragging', 'drag-target', 'drag-over')
            );
            // Always restore visibility
            queueList.style.opacity = '1';
            queueList.style.transition = '';
        });

        return row;
    }

    // SECTION 10 — Render Up Next list (with Auto-Mix divider)
    function renderUpNext(songs, ci) {
        queueList.innerHTML = '';

        const upNext = songs.slice(ci + 1);
        const automixOn = localStorage.getItem('beatzen_automix') === 'true';

        if (upNext.length === 0 && !automixOn) {
            emptyState.style.display = 'none';
            queueBody.style.opacity = '1';

            // ── End of Queue card — invite user to start Auto-Mix ──
            const eoqCard = document.createElement('div');
            eoqCard.className = 'bz-end-of-queue-card';
            eoqCard.innerHTML = `
                <div class="bz-eoq-icon-wrap">
                    <i class="fas fa-music bz-eoq-icon"></i>
                    <div class="bz-eoq-icon-ring"></div>
                </div>
                <div class="bz-eoq-text-group">
                    <div class="bz-eoq-title">That's the end of the queue</div>
                    <div class="bz-eoq-sub">Let Auto-Mix keep the music going with songs matched to your taste</div>
                </div>
                <button class="bz-eoq-btn" id="bz-eoq-start-automix">
                    <i class="fas fa-wand-magic-sparkles"></i>Start Auto-Mix
                </button>`;
            queueList.appendChild(eoqCard);

            document.getElementById('bz-eoq-start-automix')?.addEventListener('click', () => {
                const toggle = document.getElementById('automix-toggle');
                if (toggle && !toggle.checked) {
                    toggle.checked = true;
                    toggle.dispatchEvent(new Event('change'));
                } else if (typeof window.bzTriggerAutoMix === 'function') {
                    window.bzTriggerAutoMix();
                }
                renderFullscreenQueue();
            });
            return;
        }
        emptyState.style.display = 'none';
        queueBody.style.opacity = '1';

        // Shuffle-active notice: explains why order looks different Only shown
        if (window.isShuffling && upNext.length > 0) {
            const shuffleNote = document.createElement('div');
            shuffleNote.className = 'bz-shuffle-notice';
            shuffleNote.innerHTML = `
                <i class="fas fa-shuffle bz-shuffle-notice-icon"></i>
                <span>Shuffle is on — songs are playing in random order</span>`;
            queueList.appendChild(shuffleNote);
        }

        const bnd = getAutoMixBoundary(); // absolute index in songs[]

        upNext.forEach((song, idx) => {
            const realIdx = ci + 1 + idx;
            const isAutoMix = automixOn && bnd > 0 && realIdx >= bnd;

            // ── Insert the "Auto-Mix" divider exactly once at the boundary ──
            if (automixOn && bnd > 0 && realIdx === bnd) {
                const divider = document.createElement('div');
                divider.className = 'bz-automix-divider';
                divider.innerHTML = `
                    <div class="bz-automix-divider-line"></div>
                    <div class="bz-automix-divider-label">
                        <i class="fas fa-wand-magic-sparkles"></i>
                        Auto-Mix
                    </div>
                    <div class="bz-automix-divider-line"></div>`;
                queueList.appendChild(divider);
            }

            queueList.appendChild(buildQueueRow(song, realIdx, isAutoMix));
        });

        // If automix is ON but boundary not set yet, show a hint
        if (automixOn && bnd <= 0 && upNext.length === 0) {
            const hint = document.createElement('div');
            hint.className = 'bz-upnext-empty';
            hint.innerHTML = `<i class="fas fa-wand-magic-sparkles" style="margin-right:6px;color:#2575fc;"></i>Auto-Mix will fill your queue shortly…`;
            queueList.appendChild(hint);
        }
    }

    // SECTION 10b — Header AutoMix toggle (injected once into title-group)
    function ensureHeaderAutoMixToggle() {
        if (document.getElementById('bz-header-automix-wrap')) return;

        const titleGroup = document.querySelector('.bz-queue-title-group');
        if (!titleGroup) return;

        // Title-group: heading only
        titleGroup.style.display = '';
        titleGroup.style.alignItems = '';
        titleGroup.style.gap = '';
        titleGroup.style.position = '';

        // Wire the Back button (replaces close button in top-right)
        const backBtn = document.getElementById('bz-queue-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => closeQueue());
        }

        // ── Shuffle toggle pill ───────────────────────────────────────────────
        const shuffleWrap = document.createElement('div');
        shuffleWrap.id = 'bz-header-shuffle-wrap';
        shuffleWrap.className = 'bz-header-shuffle-wrap';
        shuffleWrap.innerHTML = `
            <span class="bz-header-shuf-label">
                <i class="fas fa-shuffle"></i>Shuffle
            </span>
            <label class="bz-header-shuffle-toggle" title="Toggle Shuffle">
                <input type="checkbox" id="bz-header-shuffle-toggle">
                <span class="bz-header-shuf-slider"></span>
            </label>`;

        // ── Auto-Mix toggle pill ──────────────────────────────────────────────
        const wrap = document.createElement('div');
        wrap.id = 'bz-header-automix-wrap';
        wrap.className = 'bz-header-automix-wrap';
        wrap.innerHTML = `
            <span class="bz-header-am-label">
                <i class="fas fa-wand-magic-sparkles"></i>Auto-Mix
            </span>
            <label class="bz-header-automix-toggle" title="Toggle Auto-Mix">
                <input type="checkbox" id="bz-header-automix-toggle">
                <span class="bz-header-am-slider"></span>
            </label>`;

        // 3-dot menu button + dropdown, placed in the actions bar (top-right)
        const actionsBar = document.querySelector('.bz-queue-actions');

        const menuBtn = document.createElement('button');
        menuBtn.id = 'bz-queue-menu-btn';
        menuBtn.className = 'bz-queue-menu-btn';
        menuBtn.title = 'Queue options';
        menuBtn.innerHTML = '<i class="fas fa-ellipsis-vertical"></i>';

        const menu = document.createElement('div');
        menu.id = 'bz-queue-menu';
        menu.className = 'bz-queue-menu bz-queue-menu--right';

        // Pull the existing Save / Clear buttons into the dropdown
        const saveBtn = document.getElementById('bz-queue-save');
        const clearBtn = document.getElementById('bz-queue-clear');

        menu.appendChild(shuffleWrap);
        menu.appendChild(wrap);
        if (saveBtn) menu.appendChild(saveBtn);
        if (clearBtn) menu.appendChild(clearBtn);

        // Wrap menuBtn + menu together
        const menuWrap = document.createElement('div');
        menuWrap.id = 'bz-queue-menu-wrap';
        menuWrap.style.cssText = 'display:flex;align-items:center;';
        menuWrap.appendChild(menuBtn);
        // Append menu directly to body so it's never clipped by any ancestor's
        document.body.appendChild(menu);

        if (actionsBar) {
            actionsBar.appendChild(menuWrap);
        }

        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = menu.classList.contains('open');
            if (!isOpen) {
                // Position the fixed menu flush with the right edge of the button
                const rect = menuBtn.getBoundingClientRect();
                menu.style.top = (rect.bottom + 8) + 'px';
                menu.style.right = (window.innerWidth - rect.right) + 'px';
                menu.style.left = 'auto';
            }
            menu.classList.toggle('open');
        });
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && e.target !== menuBtn) {
                menu.classList.remove('open');
            }
        });
        // Keep the menu open after interacting with the toggles inside it
        [shuffleWrap, wrap].forEach(el => el.addEventListener('click', (e) => e.stopPropagation()));

        // "Now Playing" label and the "Song X of Y" stats badge:
        const statsEl = document.getElementById('bz-queue-stats');
        const nowPlayingLabel = document.querySelector('.bz-now-playing .bz-label');
        if (statsEl && nowPlayingLabel) {
            let headerRow = document.getElementById('bz-now-playing-header');
            if (!headerRow) {
                headerRow = document.createElement('div');
                headerRow.id = 'bz-now-playing-header';
                headerRow.className = 'bz-now-playing-header';
                nowPlayingLabel.before(headerRow);
                headerRow.appendChild(nowPlayingLabel);
            }
            nowPlayingLabel.classList.add('bz-queue-pos-badge', 'bz-now-playing-badge');
            statsEl.classList.add('bz-queue-pos-badge');
            headerRow.appendChild(statsEl);
        }


        // ── Wire Shuffle toggle ───────────────────────────────────────────────
        const shuffleToggleEl = document.getElementById('bz-header-shuffle-toggle');
        if (shuffleToggleEl) {
            shuffleToggleEl.checked = !!window.isShuffling;
            shuffleToggleEl.addEventListener('change', () => {
                // Delegate to the existing toggleShuffle() so all logic runs
                if (typeof window.toggleShuffle === 'function') {
                    window.toggleShuffle();
                } else {
                    // Fallback: mirror the shuffle btn click
                    const sBtn = document.getElementById('shuffle-btn');
                    if (sBtn) sBtn.click();
                }
                // Re-sync the checkbox to the true state after toggleShuffle runs
                setTimeout(() => {
                    shuffleToggleEl.checked = !!window.isShuffling;
                    syncHeaderShuffleToggle();
                }, 50);
            });
        }

        // ── Wire Auto-Mix toggle ──────────────────────────────────────────────
        const toggleEl = document.getElementById('bz-header-automix-toggle');
        if (!toggleEl) return;

        // Set initial state from storage
        toggleEl.checked = localStorage.getItem('beatzen_automix') === 'true';

        toggleEl.addEventListener('change', () => {
            const isOn = toggleEl.checked;
            localStorage.setItem('beatzen_automix', String(isOn));

            // Sync the settings-page toggle (no re-dispatch to avoid loop)
            const settingsToggle = document.getElementById('automix-toggle');
            if (settingsToggle && settingsToggle.checked !== isOn) {
                settingsToggle.checked = isOn;
            }

            if (isOn) {
                // Every toggle-on = fresh new mix (clear session used IDs)
                _amUsedIds.clear();
                clearAutoMixBoundary();
                if (typeof window.bzTriggerAutoMix === 'function') {
                    window.bzTriggerAutoMix();
                }
                if (typeof window.showToast === 'function') {
                    window.showToast('Auto Mix enabled — queue will fill with your top songs');
                }
            } else {
                // OFF: stop engine + remove all AutoMix songs from queue immediately
                stopAutoMixTimer();
                removeAutoMixSongsFromQueue();
                if (typeof window.showToast === 'function') {
                    window.showToast('Auto Mix disabled');
                }
            }
            renderFullscreenQueue();
        });
    }

    function syncHeaderShuffleToggle() {
        const el = document.getElementById('bz-header-shuffle-toggle');
        if (!el) return;
        el.checked = !!window.isShuffling;
        const wrap = document.getElementById('bz-header-shuffle-wrap');
        if (wrap) wrap.classList.toggle('bz-header-shuffle-wrap--active', !!window.isShuffling);
    }

    function syncHeaderAutoMixToggle() {
        const el = document.getElementById('bz-header-automix-toggle');
        if (el) el.checked = localStorage.getItem('beatzen_automix') === 'true';
    }

    // SECTION 11 — Main render
    function renderFullscreenQueue() {
        const songs = window.playingAlbum?.songs || [];
        const ci = window.currentSongIndex ?? -1;
        const automixOn = localStorage.getItem('beatzen_automix') === 'true';
        const bnd = getAutoMixBoundary();

        // Ensure header toggle is present and synced every render
        ensureHeaderAutoMixToggle();
        syncHeaderAutoMixToggle();
        syncHeaderShuffleToggle();

        // ── Stats bar: "Song X of Y" — shuffle state shown via toggle pill ──
        const currentPosition = ci >= 0 ? ci + 1 : 0;
        // Only count non-AutoMix songs in the position denominator
        const regularSongsCount = (bnd > 0) ? bnd : songs.length;

        // True when the currently-playing song is an auto-mix injected song
        const isPlayingAutoMixSong = bnd > 0 && ci >= bnd;

        let statsHtml = '';
        if (currentPosition > 0 && songs.length > 0 && !isPlayingAutoMixSong) {
            statsHtml = `<span class="bz-queue-pos-badge">Song <strong>${currentPosition}</strong> <span class="bz-q-pos-sep">of</span> <strong>${regularSongsCount}</strong></span>`;
        } else if (songs.length > 0 && !isPlayingAutoMixSong) {
            statsHtml = `<span class="bz-queue-pos-badge">${regularSongsCount} song${regularSongsCount !== 1 ? 's' : ''}</span>`;
        }

        queueStats.style.display = '';
        queueStats.innerHTML = statsHtml;

        // ── Now Playing + Up Next always visible regardless of AutoMix state ──
        const nowPlayingSection = document.querySelector('.bz-now-playing');
        const queueBodySection = document.querySelector('.bz-queue-body');
        if (nowPlayingSection) nowPlayingSection.style.display = '';
        if (queueBodySection) queueBodySection.style.display = '';

        renderNowPlaying(songs, ci);
        renderUpNext(songs, ci);
    }

    // SECTION 12 — Hook playSong for live queue updates
    let _playSongPatched = false;
    function patchPlaySong() {
        if (_playSongPatched || !window.playSong) return;
        const original = window.playSong;
        window.playSong = async function (...args) {
            const result = await original.apply(this, args);
            if (overlay.classList.contains('active')) {
                setTimeout(renderFullscreenQueue, 70);
            }
            return result;
        };
        _playSongPatched = true;
    }
    // FIX Issues 3 & 7: patch immediately at parse time so the restore
    patchPlaySong();
    // Retry after brief delays in case script.js hasn't defined playSong
    setTimeout(patchPlaySong, 50);
    setTimeout(patchPlaySong, 400);
    setTimeout(patchPlaySong, 1400);

    // POST-RESTORE: highlight + queue
    (function ensureRestoredHighlight() {
        const deadline = Date.now() + 9000;
        function check() {
            if (window.playingAlbum && window.currentSongIndex >= 0) {
                restoreQueueState();           // rebuild extended queue from localStorage
                if (!window._highlightActive) {
                    window._highlightActive = true;
                    if (typeof window.updateActiveSongHighlight === 'function') {
                        window.updateActiveSongHighlight();
                    }
                }
                return;
            }
            if (Date.now() < deadline) setTimeout(check, 350);
        }
        setTimeout(check, 350);
    }());

    // Save queue right before the page unloads
    window.addEventListener('beforeunload', saveQueueState);

    // Also save position on pause and every 10 s while playing so a crash
    if (audioPlayer) {
        audioPlayer.addEventListener('pause', saveQueueState);
        let _autoSaveTimer = null;
        audioPlayer.addEventListener('play', () => {
            clearInterval(_autoSaveTimer);
            _autoSaveTimer = setInterval(saveQueueState, 10000);
        });
        audioPlayer.addEventListener('pause', () => clearInterval(_autoSaveTimer));
        audioPlayer.addEventListener('ended', () => clearInterval(_autoSaveTimer));
    }

    // ADAPTIVE IMAGE LAZY LOADING
    const BZ_PLACEHOLDER =
        'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 ' +
        'width=%221%22 height=%221%22%3E%3C/svg%3E';

    const _imgObserver = ('IntersectionObserver' in window)
        ? new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const img = entry.target;
                const realSrc = img.dataset.bzLazySrc;
                if (!realSrc) { obs.unobserve(img); return; }

                // Pre-load in background, then swap to avoid layout jump
                const loader = new Image();
                loader.onload = () => {
                    img.src = realSrc;
                    img.removeAttribute('data-bz-lazy-src');
                    img.classList.add('bz-lazy-loaded');
                };
                loader.onerror = () => {
                    // Keep placeholder on error — don't break layout
                    img.removeAttribute('data-bz-lazy-src');
                    img.classList.add('bz-lazy-error');
                };
                loader.src = realSrc;
                obs.unobserve(img);
            });
        }, { rootMargin: '300px 0px', threshold: 0.01 })
        : null;

    function upgradeLazyImg(img) {
        if (!_imgObserver) return;               // no IntersectionObserver support → native loading="lazy" takes over
        if (img.dataset.bzLazySrc) return;       // already upgraded
        if (!img.src || img.src === BZ_PLACEHOLDER) return;
        if (img.complete && img.naturalWidth > 0) return; // already loaded

        img.dataset.bzLazySrc = img.src;
        img.src = BZ_PLACEHOLDER;
        _imgObserver.observe(img);
    }

    // Watch for any new img[loading="lazy"] added anywhere in the DOM
    new MutationObserver(mutations => {
        mutations.forEach(m => {
            m.addedNodes.forEach(node => {
                if (node.nodeType !== 1) return;
                if (node.tagName === 'IMG' && node.getAttribute('loading') === 'lazy') {
                    upgradeLazyImg(node);
                }
                node.querySelectorAll?.('img[loading="lazy"]').forEach(upgradeLazyImg);
            });
        });
    }).observe(document.body || document.documentElement, { childList: true, subtree: true });

    // Also upgrade any already-present images on first load
    document.querySelectorAll('img[loading="lazy"]').forEach(upgradeLazyImg);

    // Audio events — sync play/pause icon in queue
    if (audioPlayer) {
        ['play', 'pause'].forEach(evt =>
            audioPlayer.addEventListener(evt, () => {
                if (overlay.classList.contains('active')) {
                    const songs = window.playingAlbum?.songs || [];
                    const ci = window.currentSongIndex ?? -1;
                    renderNowPlaying(songs, ci);
                }
            })
        );
    }

    // NOTE: "Add to Favourites" modal wiring is handled entirely

    // SECTION 13 — Event listeners
    openBtn?.addEventListener('click', openQueue);
    openBtnMini?.addEventListener('click', openQueue);
    // FIX: touchend shortcut for #bz-queue-open-btn so it opens instantly
    if (openBtn && !openBtn._bzTouchWired) {
        openBtn._bzTouchWired = true;
        let _queueTouchStartY = 0;
        openBtn.addEventListener('touchstart', (e) => {
            _queueTouchStartY = e.touches[0].clientY;
        }, { passive: true });
        openBtn.addEventListener('touchend', (e) => {
            if (!e.cancelable) return;
            if (Math.abs(e.changedTouches[0].clientY - _queueTouchStartY) > 8) return;
            e.preventDefault();
            e.stopPropagation();
            openQueue();
        }, { passive: false });
    }
    if (openBtnMini && !openBtnMini._bzTouchWired) {
        openBtnMini._bzTouchWired = true;
        let _queueMiniTouchStartY = 0;
        openBtnMini.addEventListener('touchstart', (e) => {
            _queueMiniTouchStartY = e.touches[0].clientY;
        }, { passive: true });
        openBtnMini.addEventListener('touchend', (e) => {
            if (!e.cancelable) return;
            if (Math.abs(e.changedTouches[0].clientY - _queueMiniTouchStartY) > 8) return;
            e.preventDefault();
            e.stopPropagation();
            openQueue();
        }, { passive: false });
    }
    closeBtn?.addEventListener('click', closeQueue);
    clearBtn?.addEventListener('click', showClearConfirm);

    // ── Save Queue as Playlist ──
    const saveQueueBtn = document.getElementById('bz-queue-save');
    if (saveQueueBtn) {
        saveQueueBtn.addEventListener('click', () => {
            const songs = window.playingAlbum?.songs || [];
            if (!songs.length) {
                window.bzAlert('info', 'Queue is Empty', 'Add some songs to the queue first.');
                return;
            }
            window.bzInput('playlist', 'Save Queue as Playlist', 'Enter playlist name…', (name) => {
                if (!name) return;
                // Build playlist using the correct format
                const id = 'user-' + Date.now();
                const playlist = {
                    id,
                    name,
                    title: name,
                    albumCover: 'https://res.cloudinary.com/beatzenapp/image/upload/v1782654641/Logo_kmpfjf.jpg',
                    songs: songs.map(s => ({
                        id: s.id,
                        title: s.title,
                        artist: s.artist,
                        url: s.url,  // FIX: was src — audioPlayer reads song.url to set src
                        imageUrl: s._sourceAlbum?.imageUrl || s.album?.imageUrl || '',
                        duration: s.duration || ''
                    })),
                    type: 'Playlist',
                    isImported: true,
                    createdAt: Date.now()
                };
                // Save to the correct key
                try {
                    const raw = localStorage.getItem('beatZen_importedPlaylists');
                    const list = raw ? JSON.parse(raw) : [];
                    list.push(playlist);
                    localStorage.setItem('beatZen_importedPlaylists', JSON.stringify(list));
                    // Inject into masterPool immediately so no page reload is needed
                    if (!window.masterPool.some(m => String(m.id) === String(playlist.id))) {
                        window.masterPool.push(playlist);
                    }
                    // Rebuild the live song map and re-render Playlists tab
                    if (typeof window.rebuildMasterMap === 'function') window.rebuildMasterMap();
                    if (typeof window.syncPlaylistData === 'function') window.syncPlaylistData();
                } catch (err) {
                    window.bzAlert('danger', 'Save Failed', 'Could not save the playlist. Please try again.');
                    return;
                }
                window.bzAlert('success', 'Playlist Saved!', `"​${name}" was saved with ${songs.length} song${songs.length !== 1 ? 's' : ''}.`);
            });
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('active')) {
            e.preventDefault(); // prevent browser back on Escape
            closeQueue();
        }
    });
    overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeQueue(); });

    // Intercept popstate: if the queue is open
    window.addEventListener('popstate', (e) => {
        // FIX Issue 17: when closeQueue() called history.back() we get
        if (_closingFromPopstate) {
            _closingFromPopstate = false;
            e.stopImmediatePropagation();
            return;
        }
        if (overlay.classList.contains('active')) {
            e.stopImmediatePropagation();
            closeQueue(true); // fromPopstate=true — don't call history.back() again
            return;
        }
    }, true); // capture phase — runs BEFORE script.js window.onpopstate

    // SECTION 14 — Expose globals
    window.renderFullscreenQueue = renderFullscreenQueue;
    window.bzOpenQueue = openQueue;
    window.bzCloseQueue = closeQueue;


    // AUTO-MIX LOADING INDICATOR — shown in queue list during injection
    let _amLoadingEl = null;

    function showAutoMixLoading() {
        // Only show if queue overlay is open; otherwise it's invisible anyway
        if (!overlay.classList.contains('active')) return;
        hideAutoMixLoading(); // remove stale instance
        _amLoadingEl = document.createElement('div');
        _amLoadingEl.id = 'bz-automix-loading';
        _amLoadingEl.className = 'bz-automix-loading';
        _amLoadingEl.innerHTML = `
            <div class="bz-aml-header">
                <div class="bz-aml-dots">
                    <span></span><span></span><span></span>
                </div>
                <span class="bz-aml-text">
                    <i class="fas fa-wand-magic-sparkles"></i>
                    Finding songs for Auto-Mix…
                </span>
            </div>
            <div class="bz-aml-skeletons">
                <div class="bz-aml-skeleton-row">
                    <div class="bz-aml-skel-thumb"></div>
                    <div class="bz-aml-skel-lines">
                        <div class="bz-aml-skel-line bz-aml-skel-title"></div>
                        <div class="bz-aml-skel-line bz-aml-skel-artist"></div>
                    </div>
                </div>
                <div class="bz-aml-skeleton-row">
                    <div class="bz-aml-skel-thumb"></div>
                    <div class="bz-aml-skel-lines">
                        <div class="bz-aml-skel-line bz-aml-skel-title" style="width:55%"></div>
                        <div class="bz-aml-skel-line bz-aml-skel-artist" style="width:38%"></div>
                    </div>
                </div>
                <div class="bz-aml-skeleton-row">
                    <div class="bz-aml-skel-thumb"></div>
                    <div class="bz-aml-skel-lines">
                        <div class="bz-aml-skel-line bz-aml-skel-title" style="width:70%"></div>
                        <div class="bz-aml-skel-line bz-aml-skel-artist" style="width:45%"></div>
                    </div>
                </div>
            </div>`;
        queueList.appendChild(_amLoadingEl);
        _amLoadingEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function hideAutoMixLoading() {
        if (_amLoadingEl) { _amLoadingEl.remove(); _amLoadingEl = null; }
        const stale = document.getElementById('bz-automix-loading');
        if (stale) stale.remove();
    }

    // AUTO-MIX ENGINE — Endless playback with history-aware scoring

    const AUTOMIX_CHECK_MS = 6000;        // check interval while playing
    const AUTOMIX_LOW_THRESHOLD = 8;      // refill when <8 automix songs remain ahead
    const AUTOMIX_BATCH_SIZE = 20;        // always 20 songs — initial trigger
    const AUTOMIX_REFILL_SIZE = 20;       // always 20 songs — on refill / last song
    const AUTOMIX_MAX_AHEAD = 50;         // max automix songs allowed ahead (raised so 20 always fits)

    let automixTimer = null;
    let automixInjecting = false;

    // Session-level used-song tracker
    let _amUsedIds = new Set();
    window._bzAmUsedIds = _amUsedIds; // exposed for queue-switch reset in script.js

    function stopAutoMixTimer() {
        if (automixTimer) { clearTimeout(automixTimer); automixTimer = null; }
    }

    function scheduleAutoMixCheck() {
        stopAutoMixTimer();
        automixTimer = setTimeout(() => {
            if (localStorage.getItem('beatzen_automix') === 'true') {
                maybeRefillAutoMix();
            }
            scheduleAutoMixCheck();
        }, AUTOMIX_CHECK_MS);
    }

    // How many automix songs are left ahead of now
    function countAutoMixRemaining() {
        const ci = window.currentSongIndex || 0;
        const bnd = getAutoMixBoundary();
        if (bnd <= 0) return 0;
        const songs = window.playingAlbum?.songs || [];
        return Math.max(0, songs.length - Math.max(bnd, ci + 1));
    }

    // Decide whether to refill
    function maybeRefillAutoMix() {
        if (!window.playingAlbum) return;
        const remaining = countAutoMixRemaining();
        // Refill whenever below threshold OR completely empty (last song played)
        if (remaining < AUTOMIX_LOW_THRESHOLD) {
            injectAutoMixSongs(AUTOMIX_REFILL_SIZE);
        }
    }

    // SCORING ENGINE
    function buildSongScores() {
        let histList = [];
        try { histList = JSON.parse(localStorage.getItem('beatZen_history_auto') || '[]'); } catch (_) { }

        // Build frequency maps from history
        const artistFreq = {};
        const albumFreq = {};
        histList.forEach((entry, i) => {
            const decay = 1 / (1 + i * 0.08); // recent entries score higher
            const artist = (entry.artist || '').toLowerCase().trim();
            const albumId = String(entry.albumId || '');
            if (artist) artistFreq[artist] = (artistFreq[artist] || 0) + decay;
            if (albumId) albumFreq[albumId] = (albumFreq[albumId] || 0) + decay;
        });

        // Now score every song in masterPool
        const allSongs = [];
        const scores = {};

        (window.masterPool || []).forEach(album => {
            const albumId = String(album.id || '');
            const albumScore = (albumFreq[albumId] || 0) * 3
                + (album.playCount || 0) * 0.2
                + (album.views || 0) * 0.05;

            (album.songs || []).forEach(song => {
                const sId = String(song.id || '');
                const artist = (song.artist || '').toLowerCase().trim();
                const artScore = (artistFreq[artist] || 0) * 5;
                const sngScore = (song.views || 0) * 0.08 + (song.likes || 0) * 0.04;

                // Strong random jitter: 0–2.5 range ensures even low-scored songs
                const jitter = Math.random() * 2.5;

                scores[sId] = artScore + albumScore + sngScore + jitter;
                allSongs.push(song);
            });
        });

        return { allSongs, scores };
    }

    // Weighted-random pick: returns `count` songs from scored candidates
    function weightedPick(candidates, scores, count) {
        if (!candidates.length) return [];
        // Assign a random key = rand^(1/weight)
        const keyed = candidates.map(s => {
            const w = Math.max(scores[String(s.id || '')] || 0, 0.01);
            return { song: s, key: Math.pow(Math.random(), 1 / w) };
        });
        keyed.sort((a, b) => b.key - a.key);
        return keyed.slice(0, count).map(k => k.song);
    }

    // INJECT — appends `count` auto-mix songs at the END of the queue.
    function injectAutoMixSongs(count) {
        if (automixInjecting) return;
        if (!window.masterPool?.length) {
            setTimeout(() => {
                if (localStorage.getItem('beatzen_automix') === 'true') injectAutoMixSongs(count);
            }, 3000);
            return;
        }
        if (!window.playingAlbum) return;

        // Count already-queued automix songs ahead; don't stack beyond cap
        const amRemain = countAutoMixRemaining();
        if (amRemain >= AUTOMIX_MAX_AHEAD) return;

        showAutoMixLoading();
        automixInjecting = true;

        try {
            const songs = window.playingAlbum.songs;
            const bnd = getAutoMixBoundary();

            // Always inject exactly `count` songs (not capped below count)
            const injectCount = count;

            // IDs already in the current queue (hard de-duplicate)
            const inQueue = new Set(songs.map(s => String(s.id || '')));

            const { allSongs, scores } = buildSongScores();

            // Filter out: in-queue AND already used this session
            let candidates = allSongs.filter(s => {
                const sid = String(s.id || '');
                return !inQueue.has(sid) && !_amUsedIds.has(sid);
            });

            // If pool is nearly exhausted, reset session-used so we can cycle again
            if (candidates.length < injectCount) {
                _amUsedIds.clear();
                candidates = allSongs.filter(s => !inQueue.has(String(s.id || '')));
            }

            const picks = weightedPick(candidates, scores, injectCount);

            if (!picks.length) {
                hideAutoMixLoading();
                automixInjecting = false;
                return;
            }

            picks.forEach(s => _amUsedIds.add(String(s.id || '')));

            const clonedPicks = picks.map(s => {
                const canonical = window.allSongsMap?.get(String(s.id || ''));
                return {
                    ...s,
                    _autoMix: true,
                    _sourceAlbum: s._sourceAlbum || canonical?.album || null
                };
            });

            // Set boundary at first inject
            if (bnd <= 0) setAutoMixBoundary(songs.length);

            // If shuffle mode is active
            if (window.isShuffling) {
                for (let i = clonedPicks.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [clonedPicks[i], clonedPicks[j]] = [clonedPicks[j], clonedPicks[i]];
                }
            }

            songs.push(...clonedPicks);

            // FIX: Shuffle Logic
            if (window.isShuffling && Array.isArray(window._bzOriginalQueue)) {
                if (window._bzOriginalAutoMixBoundary === undefined ||
                    window._bzOriginalAutoMixBoundary < 0) {
                    // First AutoMix inject while shuffled: record boundary as the position
                    const _ci = window.currentSongIndex || 0;
                    window._bzOriginalAutoMixBoundary =
                        _ci + 1 + window._bzOriginalQueue.length;
                }
                window._bzOriginalQueue.push(...clonedPicks);
            }

            // Release flag BEFORE re-render so re-render doesn't re-trigger inject
            automixInjecting = false;
            saveQueueState();      // persist newly-injected auto-mix songs

            setTimeout(() => {
                hideAutoMixLoading();
                if (typeof window.renderFullscreenQueue === 'function') window.renderFullscreenQueue();
            }, 60);

        } catch (e) {
            hideAutoMixLoading();
            automixInjecting = false;
            throw e;
        }
    }

    // Audio event hooks
    if (audioPlayer) {
        audioPlayer.addEventListener('play', scheduleAutoMixCheck);
        audioPlayer.addEventListener('pause', stopAutoMixTimer);
        audioPlayer.addEventListener('ended', () => {
            if (localStorage.getItem('beatzen_automix') === 'true') {
                // Immediate check on every song end so 20 songs always stay ahead
                maybeRefillAutoMix();
            }
            scheduleAutoMixCheck();
        });
    }

    // Public trigger
    window.bzTriggerAutoMix = function () {
        if (localStorage.getItem('beatzen_automix') !== 'true') return;
        // Clear used set + boundary so the new batch is genuinely fresh
        _amUsedIds.clear();
        clearAutoMixBoundary();
        if (overlay.classList.contains('active')) showAutoMixLoading();
        setTimeout(() => injectAutoMixSongs(AUTOMIX_BATCH_SIZE), 200);
        // Sync header toggle in case called from settings
        syncHeaderAutoMixToggle();
        syncHeaderShuffleToggle();
    };

    // When AutoMix is turned OFF
    window.bzClearAutoMix = function () {
        stopAutoMixTimer();
        removeAutoMixSongsFromQueue();
        syncHeaderAutoMixToggle();
        syncHeaderShuffleToggle();
        renderFullscreenQueue();
    };

    // Sync header toggle whenever settings toggle changes
    function patchSettingsAutoMixToggle() {
        const settingsToggle = document.getElementById('automix-toggle');
        if (!settingsToggle || settingsToggle._bzPatched) return;
        settingsToggle._bzPatched = true;
        settingsToggle.addEventListener('change', () => {
            // Keep header toggle in sync (settings is source of truth here)
            syncHeaderAutoMixToggle();
            // When toggled OFF from settings panel, also clear AutoMix queue songs
            if (!settingsToggle.checked) {
                stopAutoMixTimer();
                removeAutoMixSongsFromQueue();
            }
            renderFullscreenQueue();
        });
    }
    // Try immediately and again after script.js initialises
    patchSettingsAutoMixToggle();
    setTimeout(patchSettingsAutoMixToggle, 600);
    setTimeout(patchSettingsAutoMixToggle, 1500);

});

// SETTINGS PAGE
(function bzSettingsColorFix() {

    const PURPLE = '#a78bfa';          // soft purple matching the nav gradient
    const PURPLE_GLOW = 'rgba(167,139,250,0.18)';

    // Inject a <style> block that re-declares --primary-color only inside
    const styleId = 'bz-settings-color-fix';
    if (!document.getElementById(styleId)) {
        const s = document.createElement('style');
        s.id = styleId;
        s.textContent = `
            /* Override orange primary on settings section heads */
            .settings-section-title,
            .settings-section-label,
            .settings-category,
            .settings-category-label,
            .settings-group-label,
            .settings-group-title,
            .settings-heading,
            .settings-section-header,
            .settings-category-header,
            .settings-group-header,
            [class*="settings-section-head"],
            [class*="settings-group-head"] {
                --primary-color: ${PURPLE} !important;
                color: ${PURPLE} !important;
            }
            .settings-section-title i,  .settings-section-title svg,
            .settings-section-label i,  .settings-section-label svg,
            .settings-category i,       .settings-category svg,
            .settings-category-label i, .settings-category-label svg,
            .settings-group-label i,    .settings-group-label svg,
            .settings-heading i,        .settings-heading svg,
            .settings-section-header i, .settings-section-header svg,
            .settings-category-header i,.settings-category-header svg,
            [class*="settings-section-head"] i,
            [class*="settings-section-head"] svg {
                color: ${PURPLE} !important;
            }
            /* Nav: active settings tab icon */
            .nav-item.active i, .nav-item.active span,
            .nav-tab.active i,  .nav-tab.active span {
                /* Only override if the item is the Settings tab.
                   We can't easily scope by data-tab here, so we use
                   the JS DOM walk below instead.                      */
            }
        `;
        (document.head || document.documentElement).appendChild(s);
    }

    /* ── DOM walk: find and fix settings section header elements ── */
    function fixSettingsColors() {

        /* 1. Fix section header labels that contain known text content */
        const SECTION_KEYWORDS = ['account', 'data', 'privacy', 'cloud', 'sync',
            'playback', 'appearance', 'notifications', 'about', 'general',
            'audio', 'display', 'theme', 'language', 'storage', 'network'];

        // Common patterns: small-caps uppercase label elements
        const candidates = document.querySelectorAll(
            '.settings-section-title, .settings-section-label, ' +
            '.settings-category, .settings-category-label, ' +
            '.settings-group-label, .settings-group-title, ' +
            '.settings-heading, .settings-section-header, ' +
            '.settings-category-header, .settings-group-header, ' +
            '[class*="settings-section-head"], [class*="settings-group-head"]'
        );

        candidates.forEach(el => {
            el.style.setProperty('color', PURPLE, 'important');
            el.style.setProperty('--primary-color', PURPLE, 'important');
            el.querySelectorAll('i, svg').forEach(icon => {
                icon.style.setProperty('color', PURPLE, 'important');
            });
        });

        // 2. Fallback: any element whose text is an all-caps section label
        document.querySelectorAll(
            '#settings *, #settings-page *, [data-page="settings"] *, ' +
            '.settings-page *, [id*="settings"] *'
        ).forEach(el => {
            if (el.children.length > 3) return;           // skip container elements
            const text = (el.textContent || '').trim().toLowerCase();
            const isKeyword = SECTION_KEYWORDS.some(k => text.includes(k));
            if (!isKeyword) return;

            // Only touch elements that are visually label-like
            const cs = window.getComputedStyle(el);
            const fs = parseFloat(cs.fontSize) || 16;
            if (fs > 18) return;                          // skip large headings

            // Check if the current color is in the orange range (hue 20–50)
            const colorStr = cs.color;
            const rgb = colorStr.match(/\d+/g);
            if (!rgb || rgb.length < 3) return;
            const [r, g, b] = rgb.map(Number);
            // Simple orange detector: R >> G > B
            if (r > 180 && g > 100 && g < 200 && b < 80) {
                el.style.setProperty('color', PURPLE, 'important');
                el.querySelectorAll('i, svg').forEach(icon => {
                    icon.style.setProperty('color', PURPLE, 'important');
                });
            }
        });

        /* 3. Fix the active nav tab if it's the Settings tab ── */
        document.querySelectorAll(
            'nav .nav-item, nav .nav-tab, .bottom-nav .nav-item, ' +
            '.navbar .nav-item, [class*="nav-item"], [class*="nav-tab"]'
        ).forEach(el => {
            if (!el.classList.contains('active')) return;
            const text = (el.textContent || '').toLowerCase();
            if (!text.includes('setting')) return;
            el.style.setProperty('color', PURPLE, 'important');
            el.querySelectorAll('i, svg, span').forEach(child => {
                child.style.setProperty('color', PURPLE, 'important');
            });
        });
    }

    /* Run on load and whenever the DOM changes (e.g. tab navigation) */
    function scheduleFixSettings() {
        fixSettingsColors();
        setTimeout(fixSettingsColors, 300);
        setTimeout(fixSettingsColors, 800);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleFixSettings);
    } else {
        scheduleFixSettings();
    }

    /* MutationObserver: catch settings page being injected on tab switch */
    new MutationObserver(() => {
        // Only re-run if settings-related elements are visible
        const settingsVisible =
            document.querySelector('#settings, #settings-page, [data-page="settings"], .settings-page');
        if (settingsVisible) fixSettingsColors();
    }).observe(document.body || document.documentElement, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['class', 'data-page', 'style']
    });

    /* Also re-run whenever hash changes (SPA navigation) */
    window.addEventListener('hashchange', () => {
        if (location.hash.includes('setting')) {
            setTimeout(fixSettingsColors, 100);
            setTimeout(fixSettingsColors, 400);
        }
    });

}());

// MERGED FROM: share.js

(function () {
    "use strict";

    // THEMES — plain color names
    const THEMES = [
        {
            id: 'red', label: 'Red',
            bg: ['#1a0000', '#2d0000', '#0d0000'],
            orb1: 'rgba(220,38,38,0.92)', orb2: 'rgba(185,28,28,0.70)', orb3: 'rgba(239,68,68,0.45)',
            accent: '#f87171', accentAlt: '#fca5a5',
            cardBg: 'rgba(35,4,4,0.75)', cardBorder: 'rgba(220,38,38,0.40)',
            pillBg: 'rgba(220,38,38,0.15)', pillBorder: 'rgba(220,38,38,0.40)',
            coverGlow: 'rgba(220,38,38,0.70)', num: '#fca5a5',
            geomColor: 'rgba(220,38,38,0.18)', geomStroke: 'rgba(248,113,113,0.32)',
        },
        {
            id: 'blue', label: 'Blue',
            bg: ['#000d2e', '#00071a', '#000410'],
            orb1: 'rgba(29,78,216,0.92)', orb2: 'rgba(37,99,235,0.72)', orb3: 'rgba(59,130,246,0.48)',
            accent: '#60a5fa', accentAlt: '#93c5fd',
            cardBg: 'rgba(0,6,28,0.75)', cardBorder: 'rgba(37,99,235,0.40)',
            pillBg: 'rgba(37,99,235,0.15)', pillBorder: 'rgba(37,99,235,0.40)',
            coverGlow: 'rgba(37,99,235,0.70)', num: '#93c5fd',
            geomColor: 'rgba(37,99,235,0.18)', geomStroke: 'rgba(96,165,250,0.32)',
        },
        {
            id: 'green', label: 'Green',
            bg: ['#001a08', '#002e12', '#00110a'],
            orb1: 'rgba(22,163,74,0.92)', orb2: 'rgba(21,128,61,0.72)', orb3: 'rgba(34,197,94,0.48)',
            accent: '#4ade80', accentAlt: '#86efac',
            cardBg: 'rgba(0,18,8,0.75)', cardBorder: 'rgba(22,163,74,0.40)',
            pillBg: 'rgba(22,163,74,0.15)', pillBorder: 'rgba(22,163,74,0.40)',
            coverGlow: 'rgba(22,163,74,0.68)', num: '#86efac',
            geomColor: 'rgba(22,163,74,0.18)', geomStroke: 'rgba(74,222,128,0.32)',
        },
        {
            id: 'yellow', label: 'Yellow',
            bg: ['#1a1300', '#2a1f00', '#0d0900'],
            orb1: 'rgba(202,138,4,0.92)', orb2: 'rgba(234,179,8,0.72)', orb3: 'rgba(250,204,21,0.48)',
            accent: '#fde047', accentAlt: '#fef08a',
            cardBg: 'rgba(22,14,0,0.75)', cardBorder: 'rgba(202,138,4,0.40)',
            pillBg: 'rgba(202,138,4,0.15)', pillBorder: 'rgba(202,138,4,0.40)',
            coverGlow: 'rgba(202,138,4,0.68)', num: '#fef08a',
            geomColor: 'rgba(202,138,4,0.18)', geomStroke: 'rgba(253,224,71,0.32)',
        },
        {
            id: 'orange', label: 'Orange',
            bg: ['#1a0800', '#2d1000', '#0d0400'],
            orb1: 'rgba(194,65,12,0.92)', orb2: 'rgba(234,88,12,0.72)', orb3: 'rgba(249,115,22,0.48)',
            accent: '#fb923c', accentAlt: '#fdba74',
            cardBg: 'rgba(26,7,0,0.75)', cardBorder: 'rgba(194,65,12,0.40)',
            pillBg: 'rgba(194,65,12,0.15)', pillBorder: 'rgba(194,65,12,0.40)',
            coverGlow: 'rgba(194,65,12,0.68)', num: '#fdba74',
            geomColor: 'rgba(194,65,12,0.18)', geomStroke: 'rgba(251,146,60,0.32)',
        },
        {
            id: 'purple', label: 'Purple',
            bg: ['#0f0030', '#1a0045', '#08001a'],
            orb1: 'rgba(109,40,217,0.92)', orb2: 'rgba(124,58,237,0.72)', orb3: 'rgba(167,139,250,0.48)',
            accent: '#c084fc', accentAlt: '#a78bfa',
            cardBg: 'rgba(12,0,35,0.75)', cardBorder: 'rgba(109,40,217,0.40)',
            pillBg: 'rgba(109,40,217,0.15)', pillBorder: 'rgba(109,40,217,0.40)',
            coverGlow: 'rgba(109,40,217,0.70)', num: '#d8b4fe',
            geomColor: 'rgba(109,40,217,0.18)', geomStroke: 'rgba(192,132,252,0.32)',
        },
        {
            id: 'pink', label: 'Pink',
            bg: ['#1a0014', '#2d0020', '#0d000c'],
            orb1: 'rgba(219,39,119,0.92)', orb2: 'rgba(236,72,153,0.72)', orb3: 'rgba(244,114,182,0.48)',
            accent: '#f472b6', accentAlt: '#f9a8d4',
            cardBg: 'rgba(28,0,18,0.75)', cardBorder: 'rgba(219,39,119,0.40)',
            pillBg: 'rgba(219,39,119,0.15)', pillBorder: 'rgba(219,39,119,0.40)',
            coverGlow: 'rgba(219,39,119,0.70)', num: '#f9a8d4',
            geomColor: 'rgba(219,39,119,0.18)', geomStroke: 'rgba(244,114,182,0.32)',
        },
        {
            id: 'black', label: 'Black',
            bg: ['#000000', '#070707', '#0e0e0e'],
            orb1: 'rgba(50,50,50,0.88)', orb2: 'rgba(35,35,35,0.72)', orb3: 'rgba(70,70,70,0.45)',
            accent: '#a3a3a3', accentAlt: '#d4d4d4',
            cardBg: 'rgba(10,10,10,0.92)', cardBorder: 'rgba(90,90,90,0.32)',
            pillBg: 'rgba(80,80,80,0.14)', pillBorder: 'rgba(80,80,80,0.30)',
            coverGlow: 'rgba(55,55,55,0.52)', num: '#d4d4d4',
            geomColor: 'rgba(55,55,55,0.15)', geomStroke: 'rgba(163,163,163,0.24)',
        },
        {
            id: 'brown', label: 'Brown',
            bg: ['#1a0c00', '#2d1800', '#0d0700'],
            orb1: 'rgba(146,64,14,0.92)', orb2: 'rgba(180,83,9,0.72)', orb3: 'rgba(217,119,6,0.48)',
            accent: '#d97706', accentAlt: '#f59e0b',
            cardBg: 'rgba(22,9,0,0.75)', cardBorder: 'rgba(146,64,14,0.40)',
            pillBg: 'rgba(146,64,14,0.15)', pillBorder: 'rgba(146,64,14,0.40)',
            coverGlow: 'rgba(146,64,14,0.68)', num: '#fbbf24',
            geomColor: 'rgba(146,64,14,0.18)', geomStroke: 'rgba(217,119,6,0.32)',
        },
    ];

    const RATIOS = [
        { id: '916', label: '9:16', w: 1080, h: 1920 },
        { id: '169', label: '16:9', w: 1920, h: 1080 },
    ];

    let currentThemeId = 'glow';
    let currentRatioId = '916';
    let currentAlbum = null;
    let offscreenCanvas = null;
    let lastBlob = null;
    let _shareHistoryPushed = false;

    // Render epoch guard
    let renderEpoch = 0;

    // currentMode: 'album' for song/album cards, else artist/playlist grid
    let currentMode = 'album';
    let currentStreakCount = 0;

    // AUTO THEME — pick the best-matching style from cover art
    function hexToRgb(hex) {
        const h = String(hex || '').replace('#', '');
        return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
    }
    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;
        const d = max - min;
        if (d !== 0) {
            s = d / (1 - Math.abs(2 * l - 1));
            switch (max) {
                case r: h = ((g - b) / d) % 6; break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h *= 60; if (h < 0) h += 360;
        }
        return [h, s, l];
    }
    function hueDist(a, b) {
        const d = Math.abs(a - b) % 360;
        return Math.min(d, 360 - d);
    }
    function loadImgEl(src) {
        return new Promise((res, rej) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => res(img);
            img.onerror = rej;
            img.src = src;
        });
    }
    // Samples the cover art and returns the theme whose accent color best
    async function pickThemeForCover(url) {
        if (!url) return null;
        try {
            const img = await loadImgEl(url);
            const c = document.createElement('canvas');
            c.width = 16; c.height = 16;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, 16, 16);
            const data = ctx.getImageData(0, 0, 16, 16).data;

            const votes = new Map(THEMES.filter(t => t.id !== 'black').map(t => [t.id, 0]));
            let vibrantWeight = 0, totalWeight = 0;

            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] < 10) continue;
                const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
                totalWeight++;
                // Skip near-black / near-white / washed-out pixels
                if (s < 0.15 || l < 0.08 || l > 0.92) continue;

                const weight = s; // more saturated pixels count more
                vibrantWeight += weight;

                let bestId = null, bestD = Infinity;
                for (const t of THEMES) {
                    if (t.id === 'black') continue;
                    const [tr, tg, tb] = hexToRgb(t.accent);
                    const [th] = rgbToHsl(tr, tg, tb);
                    const d = hueDist(h, th);
                    if (d < bestD) { bestD = d; bestId = t.id; }
                }
                if (bestId) votes.set(bestId, votes.get(bestId) + weight);
            }

            if (!totalWeight || vibrantWeight / totalWeight < 0.06) {
                return THEMES.find(t => t.id === 'black') || null;
            }

            let bestId = null, bestVotes = -1;
            for (const [id, v] of votes) {
                if (v > bestVotes) { bestVotes = v; bestId = id; }
            }
            return THEMES.find(t => t.id === bestId) || null;
        } catch (_) { return null; }
    }
    /* Auto-selects currentThemeId based on cover art */
    async function autoPickTheme(coverUrl) {
        const t = await pickThemeForCover(coverUrl);
        if (t) currentThemeId = t.id;
    }

    // CANVAS UTILITIES
    const esc = s => String(s || '');
    const shareUrl = () => currentMode === 'streak'
        ? `${location.origin}${location.pathname}`
        : `${location.origin}${location.pathname}#album-${currentAlbum?.id || ''}`;
    const safeFile = () => currentMode === 'streak'
        ? `streak_${currentStreakCount}`
        : (currentAlbum?.title || 'beatzen').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const buildMeta = a => [a.year, a.songs?.length ? `${a.songs.length} songs` : null, a.type].filter(Boolean).join(' · ');

    function roundRect(ctx, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
    }

    function fitText(ctx, text, maxW) {
        let t = esc(text);
        while (ctx.measureText(t).width > maxW && t.length > 2) t = t.slice(0, -1);
        if (t !== esc(text)) t = t.slice(0, -1) + '…';
        return t;
    }

    function wrapText(ctx, text, x, y, maxW, lineH) {
        const words = esc(text).split(' ');
        let line = '', ty = y;
        for (let i = 0; i < words.length; i++) {
            const test = line ? line + ' ' + words[i] : words[i];
            if (ctx.measureText(test).width > maxW && line) {
                ctx.fillText(line, x, ty); line = words[i]; ty += lineH;
            } else { line = test; }
        }
        if (line) ctx.fillText(line, x, ty);
        return ty + lineH - y;
    }

    // Greedy word-wrap capped at maxLines
    function wrapTextLines(ctx, text, maxW, maxLines) {
        const words = esc(text).split(' ');
        const lines = [];
        let line = '';
        for (let i = 0; i < words.length; i++) {
            const test = line ? line + ' ' + words[i] : words[i];
            if (ctx.measureText(test).width > maxW && line) {
                lines.push(line); line = words[i];
            } else { line = test; }
        }
        if (line) lines.push(line);
        if (lines.length > maxLines) {
            const extra = lines.slice(maxLines - 1).join(' ');
            lines.length = maxLines - 1;
            lines.push(fitText(ctx, extra, maxW));
        }
        return lines;
    }

    function loadImage(src) {
        return new Promise(resolve => {
            if (!src) return resolve(null);
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = src;
        });
    }

    // Flat full-bleed background
    function drawBackground(ctx, CW, CH, theme) {
        ctx.fillStyle = theme.bg[1];
        ctx.fillRect(0, 0, CW, CH);
    }

    /* ─── Decorative geometric arcs — removed ─── */
    function drawGeomAccent(ctx, CW, CH, theme) { /* intentionally empty */ }

    /* ─── Cover image with glow ─── */
    async function drawCover(ctx, cx, cy, sz, album, theme, showBorder = true) {
        const img = await loadImage(album.imageUrl || album.albumCover || '');
        const hG = ctx.createRadialGradient(cx + sz / 2, cy + sz / 2, sz * 0.2, cx + sz / 2, cy + sz / 2, sz * 0.9);
        hG.addColorStop(0, theme.coverGlow); hG.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save(); ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = hG; ctx.fillRect(cx - sz * .4, cy - sz * .4, sz * 1.8, sz * 1.8); ctx.restore();
        ctx.save(); roundRect(ctx, cx, cy, sz, sz, sz * 0.08); ctx.clip();
        if (img) {
            const scale = Math.max(sz / img.width, sz / img.height);
            const dw = img.width * scale, dh = img.height * scale;
            ctx.drawImage(img, cx + (sz - dw) / 2, cy + (sz - dh) / 2, dw, dh);
        }
        else { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(cx, cy, sz, sz); }
        ctx.restore();
        if (showBorder) {
            ctx.save(); roundRect(ctx, cx, cy, sz, sz, sz * 0.08);
            ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
        }
    }

    /* ─── Song pill row ─── */
    function drawPill(ctx, x, y, w, h, theme, num, name, dur, fs) {
        const r = Math.round(h * 0.28);
        const sans = `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif`;
        ctx.save(); roundRect(ctx, x, y, w, h, r);
        ctx.fillStyle = theme.pillBg; ctx.fill();
        ctx.strokeStyle = theme.pillBorder; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
        const mid = y + h / 2;
        ctx.save();
        ctx.font = `bold ${Math.round(12 * fs)}px ${sans}`; ctx.fillStyle = theme.num;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(String(num), x + Math.round(13 * fs), mid); ctx.restore();
        ctx.save();
        ctx.font = `400 ${Math.round(11 * fs)}px ${sans}`; ctx.fillStyle = 'rgba(255,255,255,0.38)';
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        const ds = esc(dur); ctx.fillText(ds, x + w - Math.round(13 * fs), mid);
        const dw = ctx.measureText(ds).width; ctx.restore();
        const nx = x + Math.round(30 * fs);
        const nmw = w - Math.round(30 * fs) - dw - Math.round(24 * fs);
        ctx.save();
        ctx.font = `500 ${Math.round(13 * fs)}px ${sans}`; ctx.fillStyle = 'rgba(255,255,255,0.90)';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.beginPath(); ctx.rect(nx, y, nmw, h); ctx.clip();
        ctx.fillText(fitText(ctx, name, nmw), nx, mid); ctx.restore();
    }

    function drawMore(ctx, cx, y, n, fs) {
        ctx.save();
        ctx.font = `400 ${Math.round(12 * fs)}px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.30)';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`+ ${n} more song${n > 1 ? 's' : ''}`, cx, y); ctx.restore();
    }

    /* ─── BeatZen brand (bottom only) ─── */
    function drawBrand(ctx, x, y, theme, fs, align) {
        align = align || 'left';
        const sans = `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif`;
        const iconR = Math.round(9 * fs);
        const iconX = align === 'right' ? x - iconR : x + iconR;
        ctx.save();
        ctx.beginPath(); ctx.arc(iconX, y, iconR, 0, Math.PI * 2);
        ctx.fillStyle = theme.accent; ctx.fill(); ctx.restore();
        ctx.save();
        ctx.font = `bold ${Math.round(10 * fs)}px ${sans}`;
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('♪', iconX, y + Math.round(0.5 * fs)); ctx.restore();
        ctx.save();
        ctx.font = `700 ${Math.round(13 * fs)}px ${sans}`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = align === 'right' ? 'right' : 'left';
        ctx.textBaseline = 'middle';
        ctx.letterSpacing = `${Math.round(1 * fs)}px`;
        const wordX = align === 'right' ? x - iconR * 2 - Math.round(5 * fs) : x + iconR * 2 + Math.round(5 * fs);
        ctx.fillText('BEATZEN', wordX, y);
        ctx.letterSpacing = '0px'; ctx.restore();
    }

    // BeatZen brand block width
    function brandBlockWidth(ctx, fs) {
        const sans = `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif`;
        const iconR = Math.round(9 * fs);
        ctx.save();
        ctx.font = `700 ${Math.round(13 * fs)}px ${sans}`;
        ctx.letterSpacing = `${Math.round(1 * fs)}px`;
        const textW = ctx.measureText('BEATZEN').width;
        ctx.restore();
        return iconR * 2 + Math.round(5 * fs) + textW;
    }

    // Inline promo bullets
    function getInlineBulletsMetrics(ctx, bullets, maxW, fs) {
        const sans = `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif`;
        if (!bullets.length) return { lineH: 0, rowGap: 0, dotR: 0, textIndent: 0, wrapped: [], blockH: 0, bulletFS: 0 };

        const cleaned = bullets.map(esc);
        let bulletFS = Math.round(15 * fs);
        const minFS = Math.max(1, Math.round(5 * fs));

        ctx.save();
        const fitsOneLine = size => {
            ctx.font = `700 ${size}px ${sans}`;
            const indent = Math.round(12 * (size / 11));
            const availW = Math.max(10, maxW - indent);
            return cleaned.every(b => ctx.measureText(b).width <= availW);
        };
        while (bulletFS > minFS && !fitsOneLine(bulletFS)) bulletFS--;
        ctx.restore();

        const scale = bulletFS / 11;
        const lineH = Math.round(14 * scale);
        const rowGap = Math.round(6 * scale);
        const dotR = Math.round(2.3 * scale);
        const textIndent = Math.round(12 * scale);
        const wrapped = cleaned.map(b => [b]); // always exactly one line per bullet
        const totalLines = wrapped.length;
        const blockH = totalLines * lineH + Math.max(0, wrapped.length - 1) * rowGap;
        return { lineH, rowGap, dotR, textIndent, wrapped, blockH, bulletFS };
    }

    function drawInlineBullets(ctx, x, y, maxW, theme, fs, align) {
        align = align || 'left';
        const bullets = getPromoBullets();
        if (!bullets.length) return 0;
        const sans = `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif`;
        const m = getInlineBulletsMetrics(ctx, bullets, maxW, fs);
        if (!m.blockH) return 0;
        const lx = align === 'right' ? x - maxW : x;
        ctx.save();
        ctx.font = `700 ${m.bulletFS}px ${sans}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        let ty = y + m.lineH / 2;
        m.wrapped.forEach(lines => {
            lines.forEach((line, i) => {
                if (i === 0) {
                    ctx.save();
                    ctx.fillStyle = theme.accent;
                    ctx.beginPath(); ctx.arc(lx + m.dotR, ty, m.dotR, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                }
                ctx.fillStyle = theme.num || theme.accentAlt;
                ctx.fillText(line, lx + m.textIndent, ty);
                ty += m.lineH;
            });
            ty += m.rowGap;
        });
        ctx.restore();
        return m.blockH;
    }

    // Word-wrap measuring pass (no drawing)
    function wrapLines(ctx, text, maxW) {
        const words = esc(text).split(' ');
        const lines = [];
        let line = '';
        for (let i = 0; i < words.length; i++) {
            const test = line ? line + ' ' + words[i] : words[i];
            if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = words[i]; }
            else { line = test; }
        }
        if (line) lines.push(line);
        return lines;
    }

    // Promo footer bullets
    function getPromoBullets() {
        return Array.isArray(window.BZ_PROMO_BULLETS) ? window.BZ_PROMO_BULLETS.filter(Boolean) : [];
    }

    // Promo footer metrics
    function getPromoFooterMetrics(ctx, CW, CH) {
        const bullets = getPromoBullets();
        if (!bullets.length) return { boxH: 0, footprint: 0 };
        const sans = `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif`;
        const FS = Math.min(CW, CH) / 300;
        const M = Math.round(16 * FS);           // gap from card's outer edge to the box
        const padX = Math.round(15 * FS);
        const padY = Math.round(10 * FS);
        const textIndent = Math.round(13 * FS);  // dot + gap before bullet text
        const lineH = Math.round(14 * FS);
        const rowGap = Math.round(5 * FS);       // gap between separate bullets
        const boxW = CW - M * 2;
        const maxTextW = boxW - padX * 2 - textIndent;

        ctx.save();
        ctx.font = `700 ${Math.round(11.5 * FS)}px ${sans}`;
        const wrapped = bullets.map(b => wrapLines(ctx, b, maxTextW));
        ctx.restore();

        const totalLines = wrapped.reduce((s, l) => s + l.length, 0);
        const boxH = padY * 2 + totalLines * lineH + Math.max(0, wrapped.length - 1) * rowGap;
        return { FS, M, padX, padY, textIndent, lineH, rowGap, boxW, boxH, wrapped, footprint: M + boxH };
    }

    // Promo footer
    function drawPromoFooter(ctx, CW, CH, theme) {
        const m = getPromoFooterMetrics(ctx, CW, CH);
        if (!m.boxH) return;
        const sans = `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif`;
        const { FS, M, padX, padY, textIndent, lineH, rowGap, boxW, boxH, wrapped } = m;
        const boxX = M;
        const boxY = CH - M - boxH;
        const R = Math.round(12 * FS);
        const dotR = Math.round(2.4 * FS);

        /* Themed glass background, same recipe as the song-pill rows */
        ctx.save();
        roundRect(ctx, boxX, boxY, boxW, boxH, R);
        const fillG = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxH);
        fillG.addColorStop(0, theme.cardBg);
        fillG.addColorStop(1, 'rgba(0,0,0,0.85)');
        ctx.fillStyle = fillG; ctx.fill();
        ctx.restore();

        // Bullets — accent dot + theme-tinted text
        ctx.save();
        ctx.font = `700 ${Math.round(11.5 * FS)}px ${sans}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        let ty = boxY + padY + lineH / 2;
        wrapped.forEach(lines => {
            lines.forEach((line, i) => {
                const lx = boxX + padX;
                if (i === 0) {
                    ctx.save();
                    ctx.fillStyle = theme.accent;
                    ctx.beginPath(); ctx.arc(lx + dotR, ty, dotR, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                }
                ctx.fillStyle = theme.num || theme.accentAlt;
                ctx.fillText(line, lx + textIndent, ty);
                ty += lineH;
            });
            ty += rowGap;
        });
        ctx.restore();
    }

    // BEATZEN SONG CARD
    const BZ_BRAND = {
        bgTop: '#050507',
        bgMid: '#0b0609',
        bgLow: '#180006',
        bgBottom: '#240006',
        accent: '#FF4F5E',
        accentAlt: '#FF6673',
        white: '#FFFFFF',
        gray: '#B8B8B8',
    };

    function bzSans() {
        return `"Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    }

    // Loads the Poppins weights the card needs before drawing so canvas text
    async function bzEnsureFonts() {
        if (!document.fonts || !document.fonts.load) return;
        try {
            await Promise.all([
                document.fonts.load('500 16px Poppins'),
                document.fonts.load('600 16px Poppins'),
                document.fonts.load('700 16px Poppins'),
                document.fonts.load('800 16px Poppins'),
                // Solid-style Font Awesome webfont
                document.fonts.load('900 32px "Font Awesome 6 Free"'),
            ]);
            if (document.fonts.ready) await document.fonts.ready;
        } catch (_) { /* best-effort — falls back to the system sans stack */ }
    }

    // Shrinks font size
    function bzFitFontSize(ctx, text, maxW, sans, weight, startFS, minFS, startLS) {
        let fs = startFS;
        let ls = startLS || 0;
        const lsStep = ls > 0 ? ls / Math.max(1, startFS - minFS) : 0;
        ctx.font = `${weight} ${fs}px ${sans}`;
        if (ls) ctx.letterSpacing = `${ls}px`;
        while (fs > minFS && ctx.measureText(text).width > maxW) {
            fs -= 1;
            ls = Math.max(0, ls - lsStep);
            ctx.font = `${weight} ${fs}px ${sans}`;
            ctx.letterSpacing = ls ? `${ls}px` : '0px';
        }
        return { fs, ls: Math.round(ls) };
    }

    // Word-wraps an uppercase title onto at most 2 balanced lines
    function bzTitleLines(ctx, text, maxW, sans, startFS, minFS) {
        const words = String(text || '').toUpperCase().split(/\s+/).filter(Boolean);
        if (!words.length) return { fs: startFS, lines: [''] };
        for (let fs = startFS; fs >= minFS; fs--) {
            ctx.font = `800 ${fs}px ${sans}`;
            const full = words.join(' ');
            if (ctx.measureText(full).width <= maxW) return { fs, lines: [full] };
            let best = null;
            for (let i = 1; i < words.length; i++) {
                const l1 = words.slice(0, i).join(' ');
                const l2 = words.slice(i).join(' ');
                const w1 = ctx.measureText(l1).width, w2 = ctx.measureText(l2).width;
                if (w1 <= maxW && w2 <= maxW) {
                    const diff = Math.abs(w1 - w2);
                    if (!best || diff < best.diff) best = { l1, l2, diff };
                }
            }
            if (best) return { fs, lines: [best.l1, best.l2] };
        }
        ctx.font = `800 ${minFS}px ${sans}`;
        return { fs: minFS, lines: [fitText(ctx, words.join(' '), maxW)] };
    }

    // Converts a theme's hex accent color to an rgba() string at the given
    function bzRgba(hex, a) {
        const [r, g, b] = hexToRgb(hex);
        return `rgba(${r},${g},${b},${a})`;
    }

    // Dark-to-theme-color background + subtle glow orbs + dotted corner
    function bzDrawBackground(ctx, CW, CH, theme) {
        const g = ctx.createLinearGradient(0, 0, 0, CH);
        g.addColorStop(0, theme.bg[2]);
        g.addColorStop(0.55, theme.bg[1]);
        g.addColorStop(1, theme.bg[0]);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, CW, CH);

        const orbs = [
            { x: CW * 1.02, y: CH * 0.07, r: CW * 0.42, a: 0.16 },
            { x: -CW * 0.10, y: CH * 0.36, r: CW * 0.28, a: 0.09 },
            { x: -CW * 0.08, y: CH * 0.91, r: CW * 0.42, a: 0.17 },
            { x: CW * 1.06, y: CH * 0.80, r: CW * 0.22, a: 0.22 },
        ];
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        orbs.forEach(o => {
            const rg = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
            rg.addColorStop(0, bzRgba(theme.accent, o.a));
            rg.addColorStop(1, bzRgba(theme.accent, 0));
            ctx.fillStyle = rg;
            ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
        });
        ctx.restore();
    }

    function bzDrawDotGrid(ctx, originX, originY, w, h, corner, theme) {
        const step = Math.max(6, w / 10);
        const r = step * 0.10;
        const cols = Math.round(w / step);
        const rows = Math.round(h / step);
        ctx.save();
        ctx.fillStyle = bzRgba(theme.accent, 0.9);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const fade = 1 - Math.max(col / cols, row / rows);
                const a = Math.max(0, Math.min(1, fade)) * 0.65;
                if (a < 0.05) continue;
                const x = corner === 'tl' ? originX + col * step + step / 2 : originX - col * step - step / 2;
                const y = originY + row * step + step / 2;
                ctx.globalAlpha = a;
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.restore();
    }


    // Cover-fit artwork
    async function bzDrawArtwork(ctx, x, y, w, h, album, r, showBorder = false) {
        const img = await loadImage(album.imageUrl || album.albumCover || '');
        ctx.save();
        roundRect(ctx, x, y, w, h, r);
        ctx.clip();
        if (img) {
            const scale = Math.max(w / img.width, h / img.height);
            const dw = img.width * scale, dh = img.height * scale;
            ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillRect(x, y, w, h);
        }
        ctx.restore();
        if (showBorder) {
            ctx.save();
            roundRect(ctx, x, y, w, h, r);
            ctx.strokeStyle = 'rgba(255,255,255,0.14)';
            ctx.lineWidth = 1.4;
            ctx.stroke();
            ctx.restore();
        }
    }

    // Simple line-style icons, drawn as vector paths
    function bzIconNote(ctx, cx, cy, s, color) {
        ctx.save();
        ctx.strokeStyle = color; ctx.fillStyle = color;
        ctx.lineWidth = s * 0.10; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const stemX = cx + s * 0.18, stemTop = cy - s * 0.42, stemBot = cy + s * 0.30;
        ctx.beginPath(); ctx.moveTo(stemX, stemTop); ctx.lineTo(stemX, stemBot); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(stemX - s * 0.17, stemBot + s * 0.02, s * 0.17, s * 0.13, -0.35, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(stemX, stemTop);
        ctx.quadraticCurveTo(stemX + s * 0.30, stemTop + s * 0.06, stemX + s * 0.04, stemTop + s * 0.28);
        ctx.stroke();
        ctx.restore();
    }

    function bzIconMic(ctx, cx, cy, s, color) {
        ctx.save();
        ctx.strokeStyle = color; ctx.fillStyle = color;
        ctx.lineWidth = s * 0.09; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        roundRect(ctx, cx - s * 0.16, cy - s * 0.46, s * 0.32, s * 0.50, s * 0.16);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy - s * 0.02, s * 0.30, Math.PI * 0.15, Math.PI - Math.PI * 0.15);
        ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.28); ctx.lineTo(cx, cy + s * 0.46); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - s * 0.18, cy + s * 0.46); ctx.lineTo(cx + s * 0.18, cy + s * 0.46); ctx.stroke();
        ctx.restore();
    }

    function bzIconCalendar(ctx, cx, cy, s, color) {
        ctx.save();
        ctx.strokeStyle = color; ctx.lineWidth = s * 0.09; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        const w = s * 0.78, h = s * 0.68, x = cx - w / 2, y = cy - h / 2 + s * 0.06;
        roundRect(ctx, x, y, w, h, s * 0.10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y + h * 0.32); ctx.lineTo(x + w, y + h * 0.32); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + w * 0.26, y - s * 0.08); ctx.lineTo(x + w * 0.26, y + s * 0.10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + w * 0.74, y - s * 0.08); ctx.lineTo(x + w * 0.74, y + s * 0.10); ctx.stroke();
        ctx.restore();
    }

    function bzIconAlbumTag(ctx, cx, cy, s, color) {
        ctx.save();
        ctx.strokeStyle = color; ctx.lineWidth = s * 0.11; ctx.lineJoin = 'round';
        const w = s * 0.86, h = s * 0.66;
        roundRect(ctx, cx - w / 2, cy - h / 2, w, h, s * 0.12); ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(cx - w * 0.18, cy, s * 0.09, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + w * 0.18, cy, s * 0.09, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    function bzIconPlay(ctx, cx, cy, s, color) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.28, cy - s * 0.38);
        ctx.lineTo(cx - s * 0.28, cy + s * 0.38);
        ctx.lineTo(cx + s * 0.36, cy);
        ctx.closePath(); ctx.fill();
        ctx.restore();
    }

    function bzIconPlaylist(ctx, cx, cy, s, color) {
        ctx.save();
        ctx.strokeStyle = color; ctx.fillStyle = color;
        ctx.lineWidth = s * 0.08;
        ctx.beginPath(); ctx.arc(cx, cy, s * 0.40, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, s * 0.09, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = s * 0.07; ctx.lineCap = 'round';
        const nx = cx + s * 0.30, ny = cy + s * 0.26;
        ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx, ny - s * 0.22); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(nx - s * 0.06, ny + s * 0.02, s * 0.075, s * 0.055, -0.3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    function bzIconChat(ctx, cx, cy, s, color) {
        ctx.save();
        ctx.strokeStyle = color; ctx.lineWidth = s * 0.08; ctx.lineJoin = 'round';
        const w = s * 0.62, h = s * 0.42;
        roundRect(ctx, cx - w * 0.06, cy - h * 0.85, w, h, s * 0.10); ctx.stroke();
        roundRect(ctx, cx - w * 0.66, cy - h * 0.05, w, h, s * 0.10); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.40, cy + h * 0.35);
        ctx.lineTo(cx - w * 0.50, cy + h * 0.56);
        ctx.lineTo(cx - w * 0.20, cy + h * 0.35);
        ctx.closePath(); ctx.fillStyle = color; ctx.fill();
        ctx.restore();
    }

    function bzIconShare(ctx, cx, cy, s, color) {
        const k = s / 24;
        const px = vx => cx + (vx - 12) * k;
        const py = vy => cy + (vy - 12) * k;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.2 * k; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(px(8.59), py(13.51)); ctx.lineTo(px(15.42), py(17.49)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px(15.41), py(6.51)); ctx.lineTo(px(8.59), py(10.49)); ctx.stroke();
        [[18, 5], [6, 12], [18, 19]].forEach(([vx, vy]) => {
            ctx.beginPath(); ctx.arc(px(vx), py(vy), 3 * k, 0, Math.PI * 2); ctx.stroke();
        });
        ctx.restore();
    }

    function bzIconDevices(ctx, cx, cy, s, color) {
        ctx.save();
        ctx.strokeStyle = color; ctx.lineWidth = s * 0.075; ctx.lineJoin = 'round';
        const mw = s * 0.78, mh = s * 0.52;
        const mx = cx - mw * 0.56, my = cy - mh * 0.62;
        roundRect(ctx, mx, my, mw, mh, s * 0.06); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mx + mw * 0.5, my + mh); ctx.lineTo(mx + mw * 0.5, my + mh + s * 0.12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mx + mw * 0.30, my + mh + s * 0.12); ctx.lineTo(mx + mw * 0.70, my + mh + s * 0.12); ctx.stroke();
        const pw = s * 0.26, ph = s * 0.40;
        const px = cx + mw * 0.10, py = cy - ph * 0.10;
        roundRect(ctx, px, py, pw, ph, s * 0.05);
        ctx.stroke();
        ctx.restore();
    }

    // Flame icon
    function bzIconFlame(ctx, cx, cy, s, color) {
        ctx.save();
        ctx.font = `900 ${Math.round(s)}px "Font Awesome 6 Free"`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Font Awesome glyphs sit a touch high of true vertical-middle
        ctx.fillText('\uf06d', cx, cy + s * 0.04);
        ctx.restore();
    }

    // Streak share card's single fixed theme
    const STREAK_THEME = {
        bg: ['#0a0e14', '#141d29', '#2c3e50'],
        accent: '#f39c12',
        accentAlt: '#e74c3c',
    };

    // STREAK SHARE CARD
    async function drawStreakCard(count, ratio) {
        const DPR = 2;
        const CW = ratio.w / DPR;
        const CH = ratio.h / DPR;
        const canvas = document.createElement('canvas');
        canvas.width = ratio.w; canvas.height = ratio.h;
        const ctx = canvas.getContext('2d');
        ctx.scale(DPR, DPR);

        const isLandscape = CW > CH;
        const theme = STREAK_THEME;
        await bzEnsureFonts();
        const sans = bzSans();
        const cx = CW / 2;

        bzDrawBackground(ctx, CW, CH, theme);

        const FS = (isLandscape ? CH : CW) / 300;
        const BRAND_FS = FS * (isLandscape ? 1.3 : 1.05);
        const BRAND_ICON_R = Math.round(9 * BRAND_FS);
        const BRAND_ROW_H = BRAND_ICON_R * 2;
        const LOGO_GAP = Math.round(CH * (isLandscape ? 0.04 : 0.03));

        const TOP_PAD = Math.round(CH * (isLandscape ? 0.10 : 0.07));
        const BOTTOM_PAD = Math.round(CH * 0.05);
        const bandH = CH - TOP_PAD - BOTTOM_PAD;

        const drawBadge = (bcx, bcy, r) => {
            ctx.save();
            const grad = ctx.createLinearGradient(bcx - r, bcy - r, bcx + r, bcy + r);
            grad.addColorStop(0, theme.accent);
            grad.addColorStop(1, theme.accentAlt);
            ctx.shadowColor = bzRgba(theme.accent, 0.55);
            ctx.shadowBlur = r * 0.55;
            ctx.beginPath(); ctx.arc(bcx, bcy, r, 0, Math.PI * 2);
            ctx.fillStyle = grad; ctx.fill();
            ctx.restore();
            bzIconFlame(ctx, bcx, bcy, r * 0.93, '#ffffff');
        };

        if (!isLandscape) {
            // PORTRAIT (9:16)
            const badgeR = Math.round(CW * 0.19);
            const GAP1 = Math.round(CH * 0.045);
            const numFS = Math.round(CW * 0.30);
            const numCapH = numFS * 0.80;
            const GAP2 = Math.round(numFS * 0.22);
            const labelFS = Math.max(15, Math.round(numFS * 0.17));

            const contentH = badgeR * 2 + GAP1 + numCapH + GAP2 + labelFS;
            const by = TOP_PAD + Math.max(0, (bandH - BRAND_ROW_H - LOGO_GAP - contentH) / 2);

            const brandW = brandBlockWidth(ctx, BRAND_FS);
            drawBrand(ctx, cx - brandW / 2, by + BRAND_ICON_R, theme, BRAND_FS, 'left');

            let y = by + BRAND_ROW_H + LOGO_GAP;
            const badgeCY = y + badgeR;
            drawBadge(cx, badgeCY, badgeR);

            const numBaselineY = badgeCY + badgeR + GAP1 + numCapH;
            ctx.save();
            ctx.font = `800 ${numFS}px ${sans}`;
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
            ctx.fillText(String(count), cx, numBaselineY);
            ctx.restore();

            ctx.save();
            ctx.font = `700 ${labelFS}px ${sans}`;
            ctx.fillStyle = theme.accent;
            ctx.letterSpacing = `${Math.round(labelFS * 0.28)}px`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('DAY STREAK', cx, numBaselineY + GAP2 + labelFS / 2);
            ctx.letterSpacing = '0px';
            ctx.restore();
        } else {
            // LANDSCAPE (16:9)
            const SIDE_PAD_L = Math.round(CW * 0.07);
            const colGap = Math.round(36 * FS);
            const badgeR = Math.round(Math.min(CH * 0.30, CW * 0.14));
            const badgeX = SIDE_PAD_L;
            const rightX = badgeX + badgeR * 2 + colGap;

            const numFS = Math.round(CH * 0.30);
            const numCapH = numFS * 0.80;
            const GAPc = Math.round(numFS * 0.15);
            const labelFS = Math.max(16, Math.round(numFS * 0.17));

            const leftColH = badgeR * 2;
            const rightColH = numCapH + GAPc + labelFS;
            const contentH = Math.max(leftColH, rightColH);
            const blockH = BRAND_ROW_H + LOGO_GAP + contentH;
            const by = TOP_PAD + Math.max(0, (bandH - blockH) / 2);

            const brandCX = badgeX + badgeR;
            const brandW = brandBlockWidth(ctx, BRAND_FS);
            drawBrand(ctx, brandCX - brandW / 2, by + BRAND_ICON_R, theme, BRAND_FS, 'left');

            const y = by + BRAND_ROW_H + LOGO_GAP;
            const badgeCY = y + (contentH - leftColH) / 2 + badgeR;
            drawBadge(brandCX, badgeCY, badgeR);

            const ry = y + (contentH - rightColH) / 2;
            const numBaselineY = ry + numCapH;
            ctx.save();
            ctx.font = `800 ${numFS}px ${sans}`;
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
            ctx.fillText(String(count), rightX, numBaselineY);
            ctx.restore();

            ctx.save();
            ctx.font = `700 ${labelFS}px ${sans}`;
            ctx.fillStyle = theme.accent;
            ctx.letterSpacing = `${Math.round(labelFS * 0.28)}px`;
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText('DAY STREAK', rightX, numBaselineY + GAPc + labelFS / 2);
            ctx.letterSpacing = '0px';
            ctx.restore();
        }

        return canvas;
    }

    // MASTER DRAW CARD
    async function drawCard(album, theme, ratio) {
        const DPR = 2;
        const CW = ratio.w / DPR;
        const CH = ratio.h / DPR;
        const canvas = document.createElement('canvas');
        canvas.width = ratio.w; canvas.height = ratio.h;
        const ctx = canvas.getContext('2d');
        ctx.scale(DPR, DPR);

        const isLandscape = CW > CH;
        const isSingleSong = !!album._isSingleSong;
        const sans = `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif`;

        drawBackground(ctx, CW, CH, theme);
        drawGeomAccent(ctx, CW, CH, theme);

        // SINGLE SONG
        if (isSingleSong && !isLandscape) {
            await bzEnsureFonts();
            const songSans = bzSans();
            const cx = CW / 2;
            const FS = CW / 290;

            // Rich gradient + glow-orb backdrop
            bzDrawBackground(ctx, CW, CH, theme);

            const promoM = getPromoFooterMetrics(ctx, CW, CH);
            const BOTTOM_PAD = promoM.boxH ? promoM.footprint + Math.round(16 * FS) : Math.round(CH * 0.06);
            const TOP_PAD = Math.round(CH * 0.06);
            const bandH = CH - TOP_PAD - BOTTOM_PAD;

            // Symmetric side margin
            const SIDE_PAD = Math.round(CW * 0.07);
            const CONTENT_MAXW = CW - SIDE_PAD * 2;

            const BRAND_FS = FS * 1.05;
            const brandW = brandBlockWidth(ctx, BRAND_FS);
            const BRAND_ICON_R = Math.round(9 * BRAND_FS);
            const BRAND_ROW_H = BRAND_ICON_R * 2;

            const COVER_SZ = Math.round(CW * 0.62);
            const coverR = Math.round(22 * FS);

            // One shared vertical rhythm
            const GAP = Math.round(26 * FS);
            const GAP_HALF = Math.round(GAP * 0.5);

            // Movie/album name
            const hasMovie = !!album._albumName;
            const MOVIE_FS = Math.round(13 * FS);
            const MOVIE_LINE_H = Math.round(MOVIE_FS * 1.3);
            let movieLines = [];
            if (hasMovie) {
                ctx.save();
                ctx.font = `700 ${MOVIE_FS}px ${songSans}`;
                ctx.letterSpacing = `${Math.round(2 * FS)}px`;
                movieLines = wrapTextLines(ctx, String(album._albumName).toUpperCase(), CONTENT_MAXW, 2);
                ctx.restore();
            }
            const MOVIE_H = hasMovie ? movieLines.length * MOVIE_LINE_H : 0;

            // Title — single line only, however long the song title is: the font
            const TITLE_MAXW = CONTENT_MAXW;
            const upperTitle = String(album.title || '').toUpperCase();
            // Font size is FIXED, not shrink-to-fit: it's derived
            const TITLE_SIZE_REF = 'KANNEPETTARO KANNU KOTTARO';
            const titleFit = bzFitFontSize(ctx, TITLE_SIZE_REF, TITLE_MAXW, songSans, 800, Math.round(32 * FS), Math.round(4.5 * FS));
            ctx.font = `800 ${titleFit.fs}px ${songSans}`;
            const titleText = fitText(ctx, upperTitle, TITLE_MAXW);
            const TITLE_H = Math.round(titleFit.fs * 1.25);

            // Artist — same shrink-to-fit treatment
            const hasArtist = !!album._artistName;
            const ARTIST_ICON_S = Math.round(17 * FS);
            const ARTIST_ROW_GAP = Math.round(8 * FS);
            const ARTIST_MAXW = CONTENT_MAXW - ARTIST_ICON_S - ARTIST_ROW_GAP;
            // Same fixed-size treatment as the title above
            const ARTIST_SIZE_REF = 'K. S. Chithra, S. P. Balasubrahmanyam';
            const artistFit = hasArtist
                ? bzFitFontSize(ctx, ARTIST_SIZE_REF, ARTIST_MAXW, songSans, 600, Math.round(15 * FS), Math.round(4.5 * FS))
                : null;
            const ARTIST_H = hasArtist ? Math.round(22 * FS) : 0;

            const META_H = Math.round(20 * FS);

            const blockH = BRAND_ROW_H + GAP + (hasMovie ? MOVIE_H + GAP : 0) + COVER_SZ + GAP + TITLE_H + (hasArtist ? GAP_HALF + ARTIST_H : 0) + GAP_HALF + META_H;
            const slack = Math.max(0, bandH - blockH);
            let y = TOP_PAD + slack / 2;

            /* BeatZen logo — centered, directly above the album artwork */
            drawBrand(ctx, (CW - brandW) / 2, y + BRAND_ICON_R, theme, BRAND_FS, 'left');
            y += BRAND_ROW_H + GAP;

            if (hasMovie) {
                ctx.save();
                ctx.font = `700 ${MOVIE_FS}px ${songSans}`;
                ctx.letterSpacing = `${Math.round(2 * FS)}px`;
                ctx.fillStyle = theme.accent;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                movieLines.forEach((line, i) => ctx.fillText(line, cx, y + MOVIE_LINE_H * (i + 0.5)));
                ctx.restore();
                y += MOVIE_H + GAP;
            }

            const coverX = cx - COVER_SZ / 2;
            // Ambient screen-blend halo behind the artwork
            ctx.save(); ctx.globalCompositeOperation = 'screen';
            const hG = ctx.createRadialGradient(
                coverX + COVER_SZ / 2, y + COVER_SZ / 2, COVER_SZ * 0.2,
                coverX + COVER_SZ / 2, y + COVER_SZ / 2, COVER_SZ * 0.9
            );
            hG.addColorStop(0, bzRgba(theme.accent, 0.35)); hG.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = hG;
            ctx.fillRect(coverX - COVER_SZ * 0.3, y - COVER_SZ * 0.3, COVER_SZ * 1.6, COVER_SZ * 1.6);
            ctx.restore();
            await bzDrawArtwork(ctx, coverX, y, COVER_SZ, COVER_SZ, album, coverR);
            y += COVER_SZ + GAP;


            /* Title — single line, centered */
            ctx.save();
            ctx.font = `800 ${titleFit.fs}px ${songSans}`; ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(titleText, cx, y + TITLE_H / 2);
            ctx.restore();
            y += TITLE_H;

            if (hasArtist) {
                y += GAP_HALF;
                const fs = artistFit.fs;
                const iconS = ARTIST_ICON_S;
                const gap = ARTIST_ROW_GAP;
                ctx.save();
                ctx.font = `600 ${fs}px ${songSans}`;
                const txt = fitText(ctx, album._artistName, ARTIST_MAXW);
                const textW = ctx.measureText(txt).width;
                ctx.restore();
                const rowX = cx - (iconS + gap + textW) / 2;
                const midY = y + ARTIST_H / 2;
                bzIconMic(ctx, rowX + iconS / 2, midY, iconS, theme.accent);
                ctx.save();
                ctx.font = `600 ${fs}px ${songSans}`; ctx.fillStyle = 'rgba(255,255,255,0.78)';
                ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.fillText(txt, rowX + iconS + gap, midY);
                ctx.restore();
                y += ARTIST_H;
            }

            y += GAP_HALF;

            {
                const items = [];
                if (album.year) items.push({ icon: bzIconCalendar, text: String(album.year) });
                if (album._language) items.push({ icon: bzIconNote, text: album._language });
                if (items.length) {
                    const fs = Math.round(12 * FS);
                    const iconS = Math.round(13 * FS);
                    ctx.save();
                    ctx.font = `500 ${fs}px ${songSans}`;
                    const widths = items.map(it => iconS + 6 * FS + ctx.measureText(it.text).width);
                    ctx.restore();
                    const sepGap = Math.round(20 * FS);
                    const sepR = Math.round(2 * FS);
                    const totalW = widths.reduce((a, b) => a + b, 0) + (items.length > 1 ? sepGap * (items.length - 1) : 0);
                    let ix = cx - totalW / 2;
                    const midY = y + META_H / 2;
                    items.forEach((it, i) => {
                        it.icon(ctx, ix + iconS / 2, midY, iconS, theme.num);
                        ctx.save();
                        ctx.font = `500 ${fs}px ${songSans}`;
                        ctx.fillStyle = 'rgba(255,255,255,0.55)';
                        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                        ctx.fillText(it.text, ix + iconS + 6 * FS, midY);
                        ctx.restore();
                        ix += widths[i] + sepGap;
                        if (i < items.length - 1) {
                            /* Filled dot separator — no stroked divider line */
                            ctx.save();
                            ctx.fillStyle = 'rgba(255,255,255,0.32)';
                            ctx.beginPath(); ctx.arc(ix - sepGap / 2, midY, sepR, 0, Math.PI * 2); ctx.fill();
                            ctx.restore();
                        }
                    });
                }
            }

            drawPromoFooter(ctx, CW, CH, theme);
            return canvas;
        }

        // SINGLE SONG
        if (isSingleSong && isLandscape) {
            await bzEnsureFonts();
            const songSans = bzSans();
            const cx = CW / 2;
            const FS = CH / 300;

            // Rich gradient + glow-orb backdrop
            bzDrawBackground(ctx, CW, CH, theme);

            const promoM = getPromoFooterMetrics(ctx, CW, CH);
            const BOTTOM_PAD = promoM.boxH ? promoM.footprint + Math.round(14 * FS) : Math.round(CH * 0.07);
            const TOP_PAD = Math.round(CH * 0.06);
            const bandH = CH - TOP_PAD - BOTTOM_PAD;

            const BRAND_FS = FS * 0.95;
            const brandW = brandBlockWidth(ctx, BRAND_FS);
            const BRAND_ICON_R = Math.round(9 * BRAND_FS);
            const BRAND_ROW_H = BRAND_ICON_R * 2;
            const LOGO_GAP = Math.round(CH * 0.03);

            // Cover + content block is now LEFT-ALIGNED with small
            const SIDE_PAD_L = Math.round(CW * 0.055);
            const SIDE_PAD_R = Math.round(CW * 0.05);
            const COVER_SZ = Math.round(Math.min(CH * 0.62, CW * 0.30));
            const coverR = Math.round(20 * FS);
            const colGap = Math.round(36 * FS);
            const RIGHT_COL_W = CW - SIDE_PAD_L - SIDE_PAD_R - COVER_SZ - colGap;

            // Movie/album name
            const hasMovie = !!album._albumName;
            const MOVIE_FS = Math.round(15 * FS);
            const MOVIE_LINE_H = Math.round(MOVIE_FS * 1.3);
            const MOVIE_GAP = Math.round(12 * FS);
            let movieLines = [];
            if (hasMovie) {
                ctx.save();
                ctx.font = `700 ${MOVIE_FS}px ${songSans}`;
                ctx.letterSpacing = `${Math.round(1.5 * FS)}px`;
                movieLines = wrapTextLines(ctx, String(album._albumName).toUpperCase(), RIGHT_COL_W, 2);
                ctx.restore();
            }
            const MOVIE_H = hasMovie ? movieLines.length * MOVIE_LINE_H : 0;

            // Title — single line only: shrink-to-fit down to a small floor
            const TITLE_MAXW = RIGHT_COL_W;
            const upperTitle = String(album.title || '').toUpperCase();
            // Font size is FIXED, not shrink-to-fit: it's derived
            const TITLE_SIZE_REF = 'KANNEPETTARO KANNU KOTTARO';
            const titleFit = bzFitFontSize(ctx, TITLE_SIZE_REF, TITLE_MAXW, songSans, 800, Math.round(34 * FS), Math.round(12 * FS));
            ctx.font = `800 ${titleFit.fs}px ${songSans}`;
            const titleText = fitText(ctx, upperTitle, TITLE_MAXW);
            const TITLE_H = Math.round(titleFit.fs * 1.2);

            const hasArtist = !!album._artistName;
            const ARTIST_GAP = hasArtist ? Math.round(16 * FS) : 0;
            const ARTIST_H = hasArtist ? Math.round(24 * FS) : 0;
            const ARTIST_ICON_S = Math.round(18 * FS);
            const ARTIST_ICON_GAP = Math.round(8 * FS);
            const ARTIST_MAXW = RIGHT_COL_W - ARTIST_ICON_S - ARTIST_ICON_GAP;
            // Artist/credit line
            const ARTIST_SIZE_REF = 'K. S. Chithra, S. P. Balasubrahmanyam';
            const artistFit = hasArtist
                ? bzFitFontSize(ctx, ARTIST_SIZE_REF, ARTIST_MAXW, songSans, 600, Math.round(16 * FS), Math.round(11 * FS))
                : null;

            const META_GAP = Math.round(26 * FS);
            const META_H = Math.round(20 * FS);
            const rightColH = (hasMovie ? MOVIE_H + MOVIE_GAP : 0) + TITLE_H + ARTIST_GAP + ARTIST_H + META_GAP + META_H;

            const coverX = SIDE_PAD_L;
            const rightX = coverX + COVER_SZ + colGap;

            const leftColH = COVER_SZ;
            const contentH = Math.max(leftColH, rightColH);
            const blockH = BRAND_ROW_H + LOGO_GAP + contentH;
            const slack = Math.max(0, bandH - blockH);
            let by = TOP_PAD + slack / 2;

            // BeatZen logo
            const brandCX = coverX + COVER_SZ / 2;
            drawBrand(ctx, brandCX - brandW / 2, by + BRAND_ICON_R, theme, BRAND_FS, 'left');
            const y = by + BRAND_ROW_H + LOGO_GAP;

            const coverY = y + (contentH - leftColH) / 2;

            // Ambient screen-blend halo behind the artwork
            ctx.save(); ctx.globalCompositeOperation = 'screen';
            const hG = ctx.createRadialGradient(
                coverX + COVER_SZ / 2, coverY + COVER_SZ / 2, COVER_SZ * 0.2,
                coverX + COVER_SZ / 2, coverY + COVER_SZ / 2, COVER_SZ * 0.9
            );
            hG.addColorStop(0, bzRgba(theme.accent, 0.35)); hG.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = hG;
            ctx.fillRect(coverX - COVER_SZ * 0.3, coverY - COVER_SZ * 0.3, COVER_SZ * 1.6, COVER_SZ * 1.6);
            ctx.restore();
            await bzDrawArtwork(ctx, coverX, coverY, COVER_SZ, COVER_SZ, album, coverR);

            let ry = y + (contentH - rightColH) / 2;

            // Movie/album name
            if (hasMovie) {
                ctx.save();
                ctx.font = `700 ${MOVIE_FS}px ${songSans}`;
                ctx.letterSpacing = `${Math.round(1.5 * FS)}px`;
                ctx.fillStyle = theme.accent;
                ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                movieLines.forEach((line, i) => ctx.fillText(line, rightX, ry + MOVIE_LINE_H * (i + 0.5)));
                ctx.restore();
                ry += MOVIE_H + MOVIE_GAP;
            }

            /* Title — single line */
            ctx.save();
            ctx.font = `800 ${titleFit.fs}px ${songSans}`; ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(titleText, rightX, ry + TITLE_H / 2);
            ctx.restore();
            ry += TITLE_H;

            if (hasArtist) {
                ry += ARTIST_GAP;
                const midY = ry + ARTIST_H / 2;
                bzIconMic(ctx, rightX + ARTIST_ICON_S / 2, midY, ARTIST_ICON_S, theme.accent);
                ctx.save();
                ctx.font = `600 ${artistFit.fs}px ${songSans}`; ctx.fillStyle = 'rgba(255,255,255,0.78)';
                ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.fillText(fitText(ctx, album._artistName, ARTIST_MAXW), rightX + ARTIST_ICON_S + ARTIST_ICON_GAP, midY);
                ctx.restore();
                ry += ARTIST_H;
            }

            ry += META_GAP;

            {
                const items = [];
                if (album.year) items.push({ icon: bzIconCalendar, text: String(album.year) });
                if (album._language) items.push({ icon: bzIconNote, text: album._language });
                if (items.length) {
                    const fs = Math.round(12 * FS);
                    const iconS = Math.round(14 * FS);
                    const sepGap = Math.round(20 * FS);
                    const sepR = Math.round(2 * FS);
                    const midY = ry + META_H / 2;
                    let ix = rightX;
                    items.forEach((it, i) => {
                        it.icon(ctx, ix + iconS / 2, midY, iconS, theme.num);
                        ctx.save();
                        ctx.font = `500 ${fs}px ${songSans}`;
                        ctx.fillStyle = 'rgba(255,255,255,0.55)';
                        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                        ctx.fillText(it.text, ix + iconS + 6 * FS, midY);
                        ctx.restore();
                        const w = iconS + 6 * FS + ctx.measureText(it.text).width;
                        ix += w + sepGap;
                        if (i < items.length - 1) {
                            /* Filled dot separator — no stroked divider line */
                            ctx.save();
                            ctx.fillStyle = 'rgba(255,255,255,0.32)';
                            ctx.beginPath(); ctx.arc(ix - sepGap / 2, midY, sepR, 0, Math.PI * 2); ctx.fill();
                            ctx.restore();
                        }
                    });
                }
            }

            drawPromoFooter(ctx, CW, CH, theme);
            return canvas;
        }

        // ALBUM — PORTRAIT (9:16) Top-center logo + max 3 songs + "+N more".
        if (!isLandscape) {
            const MAX_SONGS = 3;
            const PAD = Math.round(CW * 0.060);
            const FS = CW / 290;
            const songs = album.songs || [];
            const preview = songs.slice(0, MAX_SONGS);
            const more = songs.length > MAX_SONGS ? songs.length - MAX_SONGS : 0;
            const nShow = preview.length;

            /* logo row — top center */
            const BRAND_FS = FS * 0.95;
            const brandW = brandBlockWidth(ctx, BRAND_FS);
            const BRAND_ICON_R = Math.round(9 * BRAND_FS);
            const BRAND_ROW_H = BRAND_ICON_R * 2;
            const BRAND_GAP = Math.round(16 * FS); // gap: logo row → cover

            /* fixed row heights */
            const COVER_GAP = Math.round(14 * FS);
            const TITLE_H = Math.round(30 * FS);
            const META_H = Math.round(20 * FS);
            const DIV_H = Math.round(12 * FS);
            const MORE_H = more > 0 ? Math.round(28 * FS) : 0; // "+N more" row
            const PILL_GAP = Math.round(6 * FS);

            // Reserve the promo box's real height (+ a small gap) instead of a fixed
            const promoM = getPromoFooterMetrics(ctx, CW, CH);
            const BOTTOM_PAD = promoM.boxH
                ? promoM.footprint + 2   // flat 2px gap above the promo box
                : Math.round(CH * 0.025);
            const TOP_PAD = Math.round(CH * 0.02);

            // Total band height (top pad to promo footer)
            const bandH = CH - TOP_PAD - BOTTOM_PAD;
            const availH = bandH - BRAND_ROW_H - BRAND_GAP - COVER_GAP - TITLE_H - META_H - DIV_H - MORE_H;

            // pill height: fixed 3 slots
            const PILL_H = Math.min(46, Math.max(30,
                Math.floor((availH * 0.46) / Math.max(1, nShow + (nShow - 1) * 0.13))
            ));
            const allPillsH = nShow * PILL_H + Math.max(0, nShow - 1) * PILL_GAP;

            /* cover — fill remaining space, max 56% width (was 62%) */
            const COVER_SZ = Math.min(
                Math.round(CW * 0.56),
                Math.max(Math.round(CW * 0.34), availH - allPillsH - COVER_GAP)
            );

            // Anchor the block's bottom edge exactly at the 2px buffer above
            const blockH = BRAND_ROW_H + BRAND_GAP + COVER_SZ + COVER_GAP
                + TITLE_H + META_H + DIV_H + allPillsH + MORE_H;
            const slack = Math.max(0, bandH - blockH);
            let y = TOP_PAD + slack / 2;

            /* logo — centered on the card */
            drawBrand(ctx, (CW - brandW) / 2, y + BRAND_ICON_R, theme, BRAND_FS, 'left');
            y += BRAND_ROW_H + BRAND_GAP;

            /* cover — horizontally centered, bigger */
            const coverX = (CW - COVER_SZ) / 2;
            await drawCover(ctx, coverX, y, COVER_SZ, album, theme);
            y += COVER_SZ + COVER_GAP;

            /* album title */
            ctx.save();
            ctx.font = `800 ${Math.round(20 * FS)}px ${sans}`; ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.70)'; ctx.shadowBlur = 12;
            ctx.fillText(fitText(ctx, album.title, CW - PAD * 2), CW / 2, y + Math.round(12 * FS));
            ctx.shadowBlur = 0; ctx.restore();
            y += TITLE_H;

            /* meta */
            ctx.save();
            ctx.font = `400 ${Math.round(12 * FS)}px ${sans}`; ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(fitText(ctx, buildMeta(album), CW - PAD * 2), CW / 2, y + Math.round(8 * FS));
            ctx.restore();
            y += META_H;

            /* divider */
            ctx.save();
            const dg = ctx.createLinearGradient(PAD, 0, CW - PAD, 0);
            dg.addColorStop(0, 'rgba(255,255,255,0)');
            dg.addColorStop(0.5, theme.accent);
            dg.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.strokeStyle = dg; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(CW - PAD, y); ctx.stroke();
            ctx.restore();
            y += DIV_H;

            /* max 3 song pills */
            for (let i = 0; i < nShow; i++) {
                drawPill(ctx, PAD, y, CW - PAD * 2, PILL_H, theme, i + 1, preview[i].title, preview[i].duration, FS);
                y += PILL_H + PILL_GAP;
            }

            /* "+N more songs" — remaining-track count, centered below list */
            if (more > 0) {
                y += Math.round(4 * FS);
                ctx.save();
                ctx.font = `500 ${Math.round(13 * FS)}px ${sans}`;
                ctx.fillStyle = 'rgba(255,255,255,0.45)';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(`+ ${more} more songs`, CW / 2, y + Math.round(10 * FS));
                ctx.restore();
            }

            drawPromoFooter(ctx, CW, CH, theme);
            return canvas;
        }

        // ALBUM — LANDSCAPE (16:9) Max 3 songs + "+N more". Fewer rows means
        const MAX_SONGS_L = 3;
        const PAD = Math.round(CW * 0.048);
        const FS = CH / 300;
        const songs = album.songs || [];
        const preview = songs.slice(0, MAX_SONGS_L);
        const more = songs.length > MAX_SONGS_L ? songs.length - MAX_SONGS_L : 0;
        const nShow = preview.length;

        // Reserve real space for the themed promo box at the bottom of the card
        const promoM = getPromoFooterMetrics(ctx, CW, CH);
        const TOP_RESERVE = Math.round(CH * 0.08);
        const BOTTOM_RESERVE = promoM.boxH
            ? promoM.footprint + Math.round(10 * FS)
            : Math.round(CH * 0.06);
        const availCH = CH - TOP_RESERVE - BOTTOM_RESERVE;

        /* left column */
        const LEFT_W = CW * 0.42;
        const RIGHT_X = LEFT_W + Math.round(PAD * 0.6);
        const RIGHT_W = CW - RIGHT_X - PAD;

        // cover — 62% of left col (was 70%)
        const COVER_SZ = Math.round(Math.min(LEFT_W * 0.62, CH * 0.54));
        const coverX = (LEFT_W - COVER_SZ) / 2;
        const BRAND_FS = FS * 0.88;
        const BRAND_GAP = Math.round(CH * 0.03);
        const BRAND_ROW_H = Math.round(18 * BRAND_FS); // approx visual height of the brand row
        const LEFT_BLOCK_H = COVER_SZ + BRAND_GAP + BRAND_ROW_H;
        const coverY = TOP_RESERVE + Math.max(0, (availCH - LEFT_BLOCK_H) / 2);
        await drawCover(ctx, coverX, coverY, COVER_SZ, album, theme);

        /* brand — left col, below cover, centered as part of the same block */
        drawBrand(ctx, coverX, coverY + COVER_SZ + BRAND_GAP + BRAND_ROW_H / 2, theme, BRAND_FS, 'left');

        /* right column layout */
        const TITLE_H = Math.round(30 * FS);
        const META_H = Math.round(22 * FS);
        const DIV_H = Math.round(14 * FS);
        const MORE_H = more > 0 ? Math.round(26 * FS) : 0;
        const PILL_GAP = Math.round(Math.max(4, CH * 0.010));

        // pill height: up to 3 slots
        const rightAvailH = availCH - TITLE_H - META_H - DIV_H - MORE_H;
        const PILL_H = Math.max(1, Math.min(Math.round(CH * 0.13),
            Math.floor((rightAvailH - (nShow - 1) * PILL_GAP) / Math.max(1, nShow))
        ));
        // row text scales with the taller pill too
        const PILL_FS = FS * Math.min(1.35, Math.max(1, PILL_H / Math.round(CH * 0.078)));
        const allPillsH = nShow * PILL_H + Math.max(0, nShow - 1) * PILL_GAP;
        const blockH = TITLE_H + META_H + DIV_H + allPillsH + MORE_H;

        /* vertically center right block within the reserved band */
        let ry = TOP_RESERVE + Math.max(0, (availCH - blockH) / 2);

        /* album title */
        ctx.save();
        ctx.font = `800 ${Math.round(20 * FS)}px ${sans}`; ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 10;
        ctx.fillText(fitText(ctx, album.title, RIGHT_W), RIGHT_X, ry);
        ctx.shadowBlur = 0; ctx.restore();
        ry += TITLE_H;

        /* meta */
        ctx.save();
        ctx.font = `400 ${Math.round(13 * FS)}px ${sans}`; ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(fitText(ctx, buildMeta(album), RIGHT_W), RIGHT_X, ry);
        ctx.restore();
        ry += META_H;

        /* divider */
        ctx.save();
        const ldg = ctx.createLinearGradient(RIGHT_X, 0, RIGHT_X + RIGHT_W, 0);
        ldg.addColorStop(0, theme.accent); ldg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = ldg; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(RIGHT_X, ry); ctx.lineTo(RIGHT_X + RIGHT_W, ry); ctx.stroke();
        ctx.restore();
        ry += DIV_H;

        /* max 3 song pills, drawn with the scaled-up row text */
        for (let i = 0; i < nShow; i++) {
            drawPill(ctx, RIGHT_X, ry, RIGHT_W, PILL_H, theme, i + 1, preview[i].title, preview[i].duration, PILL_FS);
            ry += PILL_H + PILL_GAP;
        }

        /* "+N more songs" — remaining-track count, centered in right panel */
        if (more > 0) {
            ry += Math.round(4 * FS);
            ctx.save();
            ctx.font = `500 ${Math.round(13 * PILL_FS)}px ${sans}`;
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(`+ ${more} more songs`, RIGHT_X + RIGHT_W / 2, ry + Math.round(10 * FS));
            ctx.restore();
        }

        drawPromoFooter(ctx, CW, CH, theme);
        return canvas;
    }

    // BLOB CACHE
    function getBlob() {
        if (lastBlob) return Promise.resolve(lastBlob);
        if (!offscreenCanvas) return Promise.resolve(null);
        return new Promise(r => offscreenCanvas.toBlob(b => { lastBlob = b; r(b); }, 'image/png', 1.0));
    }

    // MODAL SHELL
    function injectModalShell() {
        if (document.getElementById('bz-share-overlay')) return;

        const tTabs = THEMES.map(t =>
            `<button class="bz-style-tab${t.id === currentThemeId ? ' active' : ''}" data-style="${t.id}">${t.label}</button>`
        ).join('');
        const rTabs = RATIOS.map(r =>
            `<button class="bz-ratio-tab${r.id === currentRatioId ? ' active' : ''}" data-ratio="${r.id}">${r.label}</button>`
        ).join('');

        const SVG_COPY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
        const SVG_SAVE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
        const SVG_MORE = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="12" r="2.2" fill="currentColor"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><circle cx="19" cy="12" r="2.2" fill="currentColor"/></svg>`;
        const SVG_CLOSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        const SVG_SHARE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;

        const ACTIONS_HTML = `
          <div class="bz-share-actions" id="bz-share-actions">
            <button class="bz-action-btn bz-btn-copy" id="bz-btn-copy">
              ${SVG_COPY}<span>Copy Image</span>
            </button>
            <button class="bz-action-btn bz-btn-save" id="bz-btn-save">
              ${SVG_SAVE}<span>Save</span>
            </button>
            <button class="bz-action-btn bz-btn-more" id="bz-btn-more">
              ${SVG_MORE}<span>More</span>
            </button>
          </div>`;

        document.body.insertAdjacentHTML('beforeend', `
        <div id="bz-share-overlay">
          <div class="bz-share-modal">
            <div class="bz-share-header">
              <div class="bz-share-header-title">
                ${SVG_SHARE}
                <span>Share Album</span>
              </div>
              <button class="bz-share-close" id="bz-share-close" title="Close">
                ${SVG_CLOSE}
              </button>
            </div>
            <div class="bz-share-body">
              <div class="bz-controls-panel">
                <div class="bz-style-section" id="bz-style-section">
                  <div class="bz-section-label">Style</div>
                  <div class="bz-style-tabs" id="bz-style-tabs">${tTabs}</div>
                </div>
                <div class="bz-section-label">Format</div>
                <div class="bz-ratio-tabs" id="bz-ratio-tabs">${rTabs}</div>
                <div class="bz-desktop-actions">${ACTIONS_HTML}</div>
              </div>
              <div class="bz-preview-panel">
                <div id="bz-card-stage"></div>
              </div>
            </div>
            <div class="bz-mobile-footer">${ACTIONS_HTML.replace(/id="bz-share-actions"/, 'id="bz-share-actions-mobile"').replace(/id="bz-btn-copy"/, 'id="bz-btn-copy-m"').replace(/id="bz-btn-save"/, 'id="bz-btn-save-m"').replace(/id="bz-btn-more"/, 'id="bz-btn-more-m"')}</div>
          </div>
        </div>
        <div id="bz-share-toast"></div>`);

        document.getElementById('bz-share-close').onclick = closeShareModal;
        document.getElementById('bz-share-overlay').onclick = e => {
            if (e.target.id === 'bz-share-overlay') closeShareModal();
        };

        document.getElementById('bz-style-tabs').addEventListener('click', e => {
            const b = e.target.closest('.bz-style-tab'); if (!b) return;
            document.querySelectorAll('.bz-style-tab').forEach(t => t.classList.remove('active'));
            b.classList.add('active');
            currentThemeId = b.dataset.style;
            offscreenCanvas = null; lastBlob = null;
            triggerRender();
        });

        document.getElementById('bz-ratio-tabs').addEventListener('click', e => {
            const b = e.target.closest('.bz-ratio-tab'); if (!b) return;
            document.querySelectorAll('.bz-ratio-tab').forEach(t => t.classList.remove('active'));
            b.classList.add('active');
            currentRatioId = b.dataset.ratio;
            offscreenCanvas = null; lastBlob = null;
            triggerRender();
        });

        const wireBtns = (copyId, saveId, moreId) => {
            document.getElementById(copyId)?.addEventListener('click', handleCopyImage);
            document.getElementById(saveId)?.addEventListener('click', handleSave);
            document.getElementById(moreId)?.addEventListener('click', handleMore);
        };
        wireBtns('bz-btn-copy', 'bz-btn-save', 'bz-btn-more');
        wireBtns('bz-btn-copy-m', 'bz-btn-save-m', 'bz-btn-more-m');
    }

    function triggerRender() {
        // New epoch for THIS render request
        const epoch = ++renderEpoch;
        if (currentMode === 'streak') {
            renderStreakPreview(currentStreakCount, RATIOS.find(r => r.id === currentRatioId) || RATIOS[0], epoch);
            return;
        }
        renderPreview(
            currentAlbum,
            THEMES.find(t => t.id === currentThemeId) || THEMES[0],
            RATIOS.find(r => r.id === currentRatioId) || RATIOS[0],
            epoch
        );
    }

    async function renderStreakPreview(count, ratio, epoch) {
        const stage = document.getElementById('bz-card-stage');
        if (!stage) return;
        stage.innerHTML = '<div class="bz-generating"><div class="bz-spinner"></div><span>Crafting your card…</span></div>';
        try {
            const canvas = await drawStreakCard(count, ratio);
            // A newer render was triggered while this one was still loading
            if (epoch !== renderEpoch) return;
            offscreenCanvas = canvas;
            lastBlob = null;
            const pi = document.createElement('img');
            pi.src = offscreenCanvas.toDataURL('image/png');
            pi.style.cssText = 'display:block;border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,0.80);max-width:100%;max-height:100%;width:auto;height:auto;';
            stage.innerHTML = '';
            stage.appendChild(pi);
        } catch (e) {
            if (epoch !== renderEpoch) return; // superseded — ignore the stale failure too
            console.error('BeatZen streak card draw failed', e);
            stage.innerHTML = '<p style="color:rgba(255,255,255,.38);font-size:13px;padding:28px 0;text-align:center;">Could not render card.</p>';
        }
    }

    async function renderPreview(album, theme, ratio, epoch) {
        const stage = document.getElementById('bz-card-stage');
        if (!stage) return;
        stage.innerHTML = '<div class="bz-generating"><div class="bz-spinner"></div><span>Crafting your card…</span></div>';
        try {
            const canvas = await drawCard(album, theme, ratio);
            // A newer render was triggered
            if (epoch !== renderEpoch) return;
            offscreenCanvas = canvas;
            lastBlob = null;
            const pi = document.createElement('img');
            pi.src = offscreenCanvas.toDataURL('image/png');
            pi.style.cssText = 'display:block;border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,0.80);max-width:100%;max-height:100%;width:auto;height:auto;';
            stage.innerHTML = '';
            stage.appendChild(pi);
        } catch (e) {
            if (epoch !== renderEpoch) return; // superseded — ignore the stale failure too
            console.error('BeatZen share draw failed', e);
            stage.innerHTML = '<p style="color:rgba(255,255,255,.38);font-size:13px;padding:28px 0;text-align:center;">Could not render card.</p>';
        }
    }

    // BUTTON STATE HELPERS
    function setBtnState(id, loading, label) {
        [id, id + '-m'].forEach(bid => {
            const b = document.getElementById(bid); if (!b) return;
            b.disabled = loading;
            const sp = b.querySelector('span');
            if (loading) { b._saved = sp?.textContent; if (sp) sp.textContent = label || '…'; }
            else { if (sp && b._saved != null) sp.textContent = b._saved; b._saved = null; }
        });
    }

    function showToast(msg) {
        if (typeof window.showToast === 'function') { window.showToast(msg); return; }
        const t = document.getElementById('bz-share-toast');
        if (t) { t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }
    }

    // ACTION HANDLERS
    async function handleSave() {
        setBtnState('bz-btn-save', true, 'Saving…');
        const blob = await getBlob();
        if (blob) {
            const url = URL.createObjectURL(blob);
            const a = Object.assign(document.createElement('a'), { href: url, download: `beatzen_${safeFile()}.png` });
            document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
            showToast('✓ Image saved!');
        } else { showToast('Nothing to save yet.'); }
        setBtnState('bz-btn-save', false);
    }

    async function handleMore() {
        setBtnState('bz-btn-more', true, '…');
        const blob = await getBlob();
        if (navigator.share) {
            const payload = {
                title: currentMode === 'streak'
                    ? `My BeatZen streak — ${currentStreakCount} day${currentStreakCount === 1 ? '' : 's'}!`
                    : `BeatZen — ${currentAlbum?.title || ''}`,
                url: shareUrl(),
            };
            if (blob) {
                const f = new File([blob], `beatzen_${safeFile()}.png`, { type: 'image/png' });
                if (navigator.canShare?.({ files: [f] })) payload.files = [f];
            }
            try { await navigator.share(payload); } catch (e) {
                if (e.name !== 'AbortError') { try { await navigator.share({ title: payload.title, url: payload.url }); } catch (_) { } }
            }
        } else if (blob && window.ClipboardItem && navigator.clipboard?.write) {
            try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); showToast('✓ Image copied!'); }
            catch (_) { await handleSave(); }
        } else { await handleSave(); }
        setBtnState('bz-btn-more', false);
    }

    async function handleCopyImage() {
        setBtnState('bz-btn-copy', true, 'Copying…');
        const blob = await getBlob();
        if (blob && window.ClipboardItem && navigator.clipboard?.write) {
            try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); showToast('✓ Image copied!'); }
            catch (_) { await handleSave(); showToast('✓ Image saved (clipboard unavailable)'); }
        } else if (blob) {
            await handleSave(); showToast('✓ Image saved (clipboard unavailable)');
        } else { showToast('Nothing to copy yet.'); }
        setBtnState('bz-btn-copy', false);
    }

    // OPEN / CLOSE
    function closeShareModal(fromPop) {
        document.getElementById('bz-share-overlay')?.classList.remove('active');
        document.body.style.overflow = '';
        if (_shareHistoryPushed) {
            _shareHistoryPushed = false;
            if (!fromPop) history.back();
        }
    }
    window.bzCloseShareModal = closeShareModal;

    // If the share card is opened while the fullscreen player is open
    function pushShareHistoryIfFullscreen() {
        _shareHistoryPushed = false;
        if (document.getElementById('main-player')?.classList.contains('maximized')) {
            history.pushState({ view: 'share-overlay' }, '', window.location.hash || '#player');
            _shareHistoryPushed = true;
        }
    }

    // Capture-phase listener runs before the app's main popstate handler
    window.addEventListener('popstate', function (e) {
        const ov = document.getElementById('bz-share-overlay');
        if (_shareHistoryPushed && ov && ov.classList.contains('active')) {
            closeShareModal(true);
            e.stopImmediatePropagation();
        }
    }, true);

    window.openShareModal = async function (album) {
        currentMode = 'album';
        currentAlbum = album || window.currentAlbum;
        offscreenCanvas = null; lastBlob = null;
        if (!currentAlbum) return;
        await autoPickTheme(currentAlbum.imageUrl || currentAlbum.albumCover);
        injectModalShell();
        const styleSection = document.getElementById('bz-style-section');
        if (styleSection) styleSection.classList.remove('bz-style-hidden');
        const headerSpan = document.querySelector('#bz-share-overlay .bz-share-header-title span');
        if (headerSpan) headerSpan.textContent = 'Share Album';
        document.getElementById('bz-share-overlay').classList.add('active');
        document.body.style.overflow = 'hidden';
        document.querySelectorAll('.bz-style-tab').forEach(t => t.classList.toggle('active', t.dataset.style === currentThemeId));
        document.querySelectorAll('.bz-ratio-tab').forEach(t => t.classList.toggle('active', t.dataset.ratio === currentRatioId));
        pushShareHistoryIfFullscreen();
        triggerRender();
    };

    window.openShareSongModal = async function (song) {
        if (!song) return;
        currentMode = 'album';

        const albumData = window.allSongsMap?.get(String(song.id))?.album
            || song._sourceAlbum
            || window.playingAlbum
            || {};

        const singleSongAlbum = {
            id: song.id,
            title: song.title || 'Unknown Song',
            name: song.title || 'Unknown Song',
            songs: [{ title: song.title, duration: song.duration }],
            imageUrl: albumData.imageUrl || albumData.albumCover || '',
            albumCover: albumData.imageUrl || albumData.albumCover || '',
            year: albumData.year || '',
            type: 'Song',
            _isSingleSong: true,
            _artistName: song.artist || '',
            _albumName: albumData.title || albumData.name || '',
            _language: song.language || albumData.language || song.lang || albumData.lang || '',
        };

        currentAlbum = singleSongAlbum;
        offscreenCanvas = null; lastBlob = null;

        await autoPickTheme(singleSongAlbum.imageUrl || singleSongAlbum.albumCover);

        injectModalShell();
        const styleSection = document.getElementById('bz-style-section');
        if (styleSection) styleSection.classList.remove('bz-style-hidden');

        const headerSpan = document.querySelector('#bz-share-overlay .bz-share-header-title span');
        if (headerSpan) headerSpan.textContent = 'Share Song';

        document.getElementById('bz-share-overlay').classList.add('active');
        document.body.style.overflow = 'hidden';
        document.querySelectorAll('.bz-style-tab').forEach(t => t.classList.toggle('active', t.dataset.style === currentThemeId));
        document.querySelectorAll('.bz-ratio-tab').forEach(t => t.classList.toggle('active', t.dataset.ratio === currentRatioId));
        pushShareHistoryIfFullscreen();
        triggerRender();
    };

    // Profile page "Share Streak" button
    window.openShareStreakModal = async function (count) {
        currentMode = 'streak';
        currentStreakCount = Number(count) || 0;
        offscreenCanvas = null; lastBlob = null;

        injectModalShell();
        const styleSection = document.getElementById('bz-style-section');
        if (styleSection) styleSection.classList.add('bz-style-hidden');

        const headerSpan = document.querySelector('#bz-share-overlay .bz-share-header-title span');
        if (headerSpan) headerSpan.textContent = 'Share Streak';

        document.getElementById('bz-share-overlay').classList.add('active');
        document.body.style.overflow = 'hidden';
        document.querySelectorAll('.bz-ratio-tab').forEach(t => t.classList.toggle('active', t.dataset.ratio === currentRatioId));
        pushShareHistoryIfFullscreen();
        triggerRender();
    };

    // WIRE UP
    function wireShareButton() {
        const root = document.getElementById('album-view-container') || document.body;
        root.addEventListener('click', e => {
            if (!e.target.closest('.share-album-btn')) return;
            e.stopPropagation(); window.openShareModal(window.currentAlbum);
        });
        document.addEventListener('click', e => {
            if (!e.target.closest('#share-status')) return;
            e.stopPropagation(); window.openShareModal(window.playingAlbum || window.currentAlbum);
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireShareButton);
    else wireShareButton();

})();

// PLAYLIST SECTION NAV BAR
(function () {
    'use strict';

    /* ── DOM refs ── */
    var navBar, navInner, pills;

    function initRefs() {
        navBar = document.getElementById('bz-playlist-nav-bar');
        navInner = document.getElementById('bz-playlist-nav-inner');
        pills = navInner ? Array.from(navInner.querySelectorAll('.bz-playlist-nav-pill')) : [];
    }

    /* ── Is the Playlists tab currently the visible view? ── */
    function isPlaylistsActive() {
        var pc = document.getElementById('playlists-container');
        if (!pc) return false;
        return pc.style.display !== 'none' && !pc.classList.contains('hidden');
    }

    // Total fixed header height (navbar + this bar when visible) Below 768px
    function getOffset() {
        var isMobileNav = window.matchMedia('(max-width: 768px)').matches;
        var navH = isMobileNav ? 0 : (document.querySelector('.navbar') || { offsetHeight: 70 }).offsetHeight;
        var barH = (navBar && isPlaylistsActive()) ? (navBar.offsetHeight || 0) : 0;
        return navH + barH + 8;
    }

    /* ── Push <main> down by bar height so content isn't hidden under it ── */
    /* ── Show / hide bar; toggle padding class on playlists-container ── */
    var _barCurrentlyVisible = false;

    function syncVisibility() {
        if (!navBar) return;
        var on = isPlaylistsActive();
        if (on === _barCurrentlyVisible) return;
        _barCurrentlyVisible = on;
        navBar.style.display = on ? 'flex' : 'none';
        var pc = document.getElementById('playlists-container');
        if (pc) pc.classList.toggle('bzp-nav-visible', on);
        if (on) highlightVisible();
    }

    /* ── Stamp stable IDs on freshly rendered sections ── */
    // "Your Playlists" and "Recommended for Today" now get their ids set
    function stampSectionIds() {
        var pc = document.getElementById('playlists-container');
        if (!pc) return;
        var yourSec = pc.querySelector('.dp-section');
        if (yourSec && !yourSec.id) yourSec.id = 'bzp-your-playlists';
        // bzp-rec-section, bzp-universe-wrap, bzp-artists-section
    }

    /* ── Every pill's collection, in nav-bar order ── */
    var PILL_TARGETS = ['bzp-your-playlists', 'bzp-mfy-section', 'bzp-rec-section', 'bzp-universe-wrap', 'bzp-artists-section', 'bzp-heroes-section', 'bzp-la-section'];

    // Does this target section actually have anything in it? A pill
    function targetHasContent(id) {
        var el = document.getElementById(id);
        return !!(el && el.querySelector('.bzp-card'));
    }

    // Hide/show pills to match reality: "Your Playlists" before the user has
    function updateNavPillVisibility() {
        pills.forEach(function (p) {
            var target = p.getAttribute('data-target');
            p.style.display = targetHasContent(target) ? '' : 'none';
        });
    }

    /* ── Smooth-scroll to a target section ── */
    function scrollToSection(targetId) {
        stampSectionIds();
        var el = document.getElementById(targetId);
        if (!el) return;
        var offset = getOffset();
        var top = el.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }

    /* ── Set the active pill ── */
    function setActive(pill) {
        pills.forEach(function (p) { p.classList.remove('active'); });
        if (pill) {
            pill.classList.add('active');
            /* Auto-scroll the pill into view inside the inner scroller */
            var pillLeft = pill.offsetLeft;
            var pillW = pill.offsetWidth;
            var barW = navInner ? navInner.offsetWidth : 0;
            if (navInner) navInner.scrollTo({ left: pillLeft - barW / 2 + pillW / 2, behavior: 'smooth' });
        }
    }

    /* ── Highlight whichever section is closest to the top of viewport ── */
    var _scrolling = false;
    var _scrollTimer = null;

    function highlightVisible() {
        if (!isPlaylistsActive() || _scrolling) return;
        stampSectionIds();
        updateNavPillVisibility();
        var offset = getOffset();
        var current = null;
        PILL_TARGETS.forEach(function (id) {
            if (!targetHasContent(id)) return; // skip collections that weren't created
            var el = document.getElementById(id);
            if (el && el.getBoundingClientRect().top <= offset + 30) current = id;
        });
        pills.forEach(function (p) {
            p.classList.toggle('active', p.getAttribute('data-target') === current);
        });
        /* Auto-scroll active pill into view */
        var activePill = navInner ? navInner.querySelector('.bz-playlist-nav-pill.active') : null;
        if (activePill && navInner) {
            var pillLeft = activePill.offsetLeft;
            var pillW = activePill.offsetWidth;
            var barW = navInner.offsetWidth;
            navInner.scrollTo({ left: pillLeft - barW / 2 + pillW / 2, behavior: 'smooth' });
        }
    }

    /* ── Wire pill clicks ── */
    function bindPills() {
        pills.forEach(function (pill) {
            pill.addEventListener('click', function () {
                var target = pill.getAttribute('data-target');
                setActive(pill);
                _scrolling = true;
                clearTimeout(_scrollTimer);
                _scrollTimer = setTimeout(function () { _scrolling = false; }, 900);
                scrollToSection(target);
            });
        });
    }

    /* ── Scroll listener ── */
    var _ticking = false;
    window.addEventListener('scroll', function () {
        if (_ticking) return;
        _ticking = true;
        requestAnimationFrame(function () {
            highlightVisible();
            _ticking = false;
        });
    }, { passive: true });

    /* ── Watch playlists-container for tab switches and re-renders ── */
    function observePlaylistsTab() {
        var pc = document.getElementById('playlists-container');
        if (!pc) return;

        /* Show/hide bar when display style changes (tab switch) */
        new MutationObserver(function () {
            syncVisibility();
        }).observe(pc, { attributes: true, attributeFilter: ['style', 'class'] });

        /* Re-stamp IDs whenever content is re-rendered (childList) */
        new MutationObserver(function () {
            if (isPlaylistsActive()) {
                setTimeout(function () {
                    stampSectionIds();
                    highlightVisible();
                }, 60);
            }
        }).observe(pc, { childList: true, subtree: false });
    }

    /* ── Init ── */
    function init() {
        initRefs();
        bindPills();
        observePlaylistsTab();
        syncVisibility();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

// Scripts extracted from index.html inline <script> blocks

/* ── Extracted inline script block ── */
function toggleAboutDetails() {
    const details = document.getElementById('about-details');
    const label = document.getElementById('know-more-label');
    const icon = document.getElementById('know-more-icon');
    const isOpen = details.classList.contains('stg-about-details--open');
    if (isOpen) {
        details.classList.remove('stg-about-details--open');
        label.textContent = 'Know More';
        icon.style.transform = 'rotate(0deg)';
    } else {
        details.classList.add('stg-about-details--open');
        label.textContent = 'Show Less';
        icon.style.transform = 'rotate(180deg)';
    }
}

function toggleContactDetails() {
    const details = document.getElementById('contact-details');
    const label = document.getElementById('contact-us-label');
    const icon = document.getElementById('contact-us-icon');
    const isOpen = details.classList.contains('stg-about-details--open');
    if (isOpen) {
        details.classList.remove('stg-about-details--open');
        label.textContent = 'Contact Us';
        icon.style.transform = 'rotate(0deg)';
    } else {
        details.classList.add('stg-about-details--open');
        label.textContent = 'Show Less';
        icon.style.transform = 'rotate(180deg)';
    }
}

/* ── Extracted inline script block ── */
(function () {
    var _bzAllowed = ['beatzen.in', 'www.beatzen.in', 'beatzen.app', 'www.beatzen.app',
        'mr-ruthwik.github.io' /* GitHub Pages test deployment — remove once no longer needed */];
    var _onAllowed = _bzAllowed.indexOf(location.hostname) !== -1;

    // 1. Register service worker FIX: register with relative paths
    if ('serviceWorker' in navigator && _onAllowed) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('notifications-control.js', { scope: './' })
                .catch(function (err) { console.warn('Beat Zen SW:', err); });
        });
    }

    // APP INSTALL

    var _isAndroid = /android/i.test(navigator.userAgent);
    var _isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    var _isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    var _isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;

    // Persisted forever once set
    var _wasInstalled = false;
    try { _wasInstalled = localStorage.getItem('bz_app_installed') === '1'; } catch (_) { }

    /* Heuristic-confirmation flag, used only on the non-Android (PWA) path. */
    var _assumedInstalled = false;
    try { _assumedInstalled = localStorage.getItem('bz_assumed_installed') === '1'; } catch (_) { }

    var _nudgeDismissed = false;
    var _deferred = null;      /* beforeinstallprompt — desktop/PWA path only */
    var _bipTimer = null;
    var _hasLiveCheck = 'getInstalledRelatedApps' in navigator;
    var _currentlyInstalled = null;
    var _pollInterval = null;
    var _POLL_MS = 1000;

    // Snapshot of whatever description text was showing right before the row
    var _installedDescSaved = null;

    // FIREBASE INSTALL TRACKING
    var FIRESTORE_INSTALLS_COLLECTION = 'beatzen_installs';

    function _bzGetDeviceId() {
        try {
            var id = localStorage.getItem('bz_device_id');
            if (!id) {
                id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
                localStorage.setItem('bz_device_id', id);
            }
            return id;
        } catch (_) {
            return 'dev_unknown';
        }
    }
    var _bzDeviceId = _bzGetDeviceId();

    // script.js runs BEFORE the Firebase SDK / auth.js in this page's
    function _bzWaitForAuthReady(cb) {
        var tries = 0;
        (function poll() {
            if (window.bzAuthReady) { window.bzAuthReady.then(function () { cb(); }); return; }
            if (++tries > 200) { cb(); return; }
            setTimeout(poll, 50);
        })();
    }

    // Merges fields onto this device's entry at
    function _bzWriteInstallStatus(fields) {
        _bzWaitForAuthReady(function () {
            try {
                if (typeof db === 'undefined' || typeof auth === 'undefined' || !auth.currentUser) return;
                var deviceFields = Object.assign({
                    platform: navigator.platform || '',
                    userAgent: navigator.userAgent || ''
                }, fields);
                var nested = { devices: {}, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
                nested.devices[_bzDeviceId] = deviceFields;
                db.collection(FIRESTORE_INSTALLS_COLLECTION).doc(auth.currentUser.uid)
                    .set(nested, { merge: true })
                    .catch(function (err) { console.warn('[BeatZen] install-status Firestore write failed:', err && err.message); });
            } catch (err) {
                console.warn('[BeatZen] install-status Firestore write skipped:', err && err.message);
            }
        });
    }

    /* Reads this device's last-known status back from Firestore. */
    function _bzReadInstallStatus(cb) {
        _bzWaitForAuthReady(function () {
            try {
                if (typeof db === 'undefined' || typeof auth === 'undefined' || !auth.currentUser) { cb(null); return; }
                db.collection(FIRESTORE_INSTALLS_COLLECTION).doc(auth.currentUser.uid).get()
                    .then(function (snap) {
                        var data = snap && snap.exists ? snap.data() : null;
                        cb((data && data.devices && data.devices[_bzDeviceId]) || null);
                    })
                    .catch(function (err) {
                        console.warn('[BeatZen] install-status Firestore read failed:', err && err.message);
                        cb(null);
                    });
            } catch (err) { cb(null); }
        });
    }

    function _persist(flag) {
        try {
            if (flag) localStorage.setItem('bz_app_installed', '1');
            else localStorage.removeItem('bz_app_installed');
        } catch (_) { }
        _wasInstalled = flag;
    }

    function _persistAssumed(flag) {
        try {
            if (flag) localStorage.setItem('bz_assumed_installed', '1');
            else localStorage.removeItem('bz_assumed_installed');
        } catch (_) { }
        _assumedInstalled = flag;
    }

    // Button default appearance, platform-appropriate.
    function _defaultInstallButtonHTML() {
        if (_isIOS && _isSafari) return '<i class="fas fa-circle-info"></i> How';
        return '<i class="fas fa-plus"></i> Install';
    }
    function _resetInstallButton(btn) {
        if (!btn) return;
        btn.disabled = false;
        btn.classList.remove('bz-dl-progress');
        btn.style.removeProperty('--bz-dl-pct');
        btn.innerHTML = _defaultInstallButtonHTML();
    }

    // Installed: the settings row drops the button entirely and shows
    function _showInstalledState() {
        if (typeof _hideNudgeForce === 'function') _hideNudgeForce();
        else _hideNudge();

        var titleEl = document.getElementById('bz-install-setting-title');
        var descEl = document.getElementById('bz-install-setting-desc');
        var iconEl = document.getElementById('bz-install-setting-icon');
        var iconI = iconEl ? iconEl.querySelector('i') : null;
        var btn = document.getElementById('bz-settings-install-btn');

        // Save whatever description was showing (generic / iOS Safari copy)
        if (descEl && _installedDescSaved === null) _installedDescSaved = descEl.textContent;

        if (titleEl) titleEl.textContent = 'App Installed';
        if (descEl) descEl.textContent = 'Beat Zen is installed on this device';
        if (iconEl) { iconEl.classList.remove('stg-icon--blue'); iconEl.classList.add('stg-icon--green'); }
        if (iconI) { iconI.classList.remove('fa-download'); iconI.classList.add('fa-check'); }
        if (btn) btn.style.display = 'none';
    }

    // Not installed
    function _showInstallState() {
        var installItem = document.getElementById('bz-install-setting-item');
        if (installItem) installItem.style.display = '';

        var titleEl = document.getElementById('bz-install-setting-title');
        var descEl = document.getElementById('bz-install-setting-desc');
        var iconEl = document.getElementById('bz-install-setting-icon');
        var iconI = iconEl ? iconEl.querySelector('i') : null;
        var btn = document.getElementById('bz-settings-install-btn');

        if (titleEl) titleEl.textContent = 'Install Beat Zen';
        if (descEl && _installedDescSaved !== null) {
            descEl.textContent = _installedDescSaved;
            _installedDescSaved = null;
        }
        if (iconEl) { iconEl.classList.remove('stg-icon--green'); iconEl.classList.add('stg-icon--blue'); }
        if (iconI) { iconI.classList.remove('fa-check'); iconI.classList.add('fa-download'); }
        if (btn) { btn.style.display = ''; _resetInstallButton(btn); }

        if (!_nudgeDismissed) _showNudge();
    }

    /* ── Nudge banner helpers ── */
    function _showNudge() {
        if (_isStandalone || _nudgeDismissed) return;
        var nudge = document.getElementById('bz-install-nudge');
        if (!nudge) return;
        nudge.classList.add('bz-nudge-visible');
    }

    function _hideNudge() {
        var nudge = document.getElementById('bz-install-nudge');
        if (!nudge) return;
        nudge.style.animation = 'none';
        nudge.style.opacity = '0';
        nudge.style.transform = 'translateX(-50%) translateY(20px)';
        nudge.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        setTimeout(function () {
            nudge.classList.remove('bz-nudge-visible');
            nudge.style.cssText = ''; /* reset inline so CSS class re-applies cleanly next time */
        }, 260);
    }

    /* ── Force-hide nudge instantly (no transition, no race) ── */
    function _hideNudgeForce() {
        _nudgeDismissed = true; /* prevent it re-showing from _tick() */
        var nudge = document.getElementById('bz-install-nudge');
        if (!nudge) return;
        nudge.style.cssText = 'display:none !important;';
        nudge.classList.remove('bz-nudge-visible');
    }

    /* ── iOS manual steps banner ── */
    function _showIOSBanner() {
        var b = document.getElementById('bz-ios-banner');
        if (b) b.classList.add('visible');
    }

    // LIVE INSTALL / UNINSTALL DETECTION — shared by Android and Desktop.

    function _resolveInstalled() {
        var _liveStandalone = window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;
        if (_liveStandalone) return Promise.resolve(true);

        if (_hasLiveCheck) {
            // Authoritative when available: reflects real install/uninstall state
            return navigator.getInstalledRelatedApps()
                .then(function (apps) { return !!(apps && apps.length > 0); })
                .catch(function () { return _assumedInstalled || _wasInstalled; });
        }
        // No live signal exists on this browser at all
        return Promise.resolve(_assumedInstalled || _wasInstalled);
    }

    (function _bzWatchDisplayMode() {
        var mql = window.matchMedia('(display-mode: standalone)');
        var _onChange = function () {
            _currentlyInstalled = null;
            _tick();
        };
        if (mql.addEventListener) mql.addEventListener('change', _onChange);
        else if (mql.addListener) mql.addListener(_onChange);
    })();

    function _tick() {
        _resolveInstalled().then(function (installed) {
            if (installed === _currentlyInstalled) return;
            _currentlyInstalled = installed;
            if (installed) {
                _persist(true);
                _showInstalledState();
                _bzWriteInstallStatus({ installed: true, installedAt: firebase.firestore.FieldValue.serverTimestamp() });
            } else {
                _persist(false);
                _showInstallState();
                _bzWriteInstallStatus({ installed: false, uninstalledAt: firebase.firestore.FieldValue.serverTimestamp() });
            }
        });
    }

    function _startPolling() {
        if (_pollInterval) return;
        _pollInterval = setInterval(_tick, _POLL_MS);
    }
    function _stopPolling() {
        if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
    }

    function _showInstallUnavailableHint(sBtn, nBtn) {
        function flash(msg, icon) {
            [sBtn, nBtn].forEach(function (btn) {
                if (!btn) return;
                var original = btn.innerHTML;
                btn.innerHTML = icon + msg;
                setTimeout(function () { btn.innerHTML = original; }, 2600);
            });
        }
        if (_isIOS && !_isSafari) {
            flash('Open in Safari to install', '<i class="fas fa-circle-info"></i> ');
            return;
        }
        if (_hasLiveCheck) {
            _persist(true);
            _persistAssumed(true);
            _currentlyInstalled = true;
            _showInstalledState();
            _bzWriteInstallStatus({ installed: true, installedAt: firebase.firestore.FieldValue.serverTimestamp() });
            return;
        }
        flash('Not ready yet — try again shortly', '<i class="fas fa-circle-info"></i> ');
    }

    // Name kept for minimal diff
    function _triggerDesktopInstall() {
        var sBtn = document.getElementById('bz-settings-install-btn');
        var nBtn = document.getElementById('bz-nudge-install-btn');

        _bzWriteInstallStatus({
            clicked: true,
            clickedAt: firebase.firestore.FieldValue.serverTimestamp(),
            promptAvailable: !!_deferred,
            method: 'pwa'
        });

        if (!_deferred) {
            _showInstallUnavailableHint(sBtn, nBtn);
            return;
        }

        if (sBtn) { sBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:6px;"></i>Waiting for confirmation…'; sBtn.disabled = true; }
        if (nBtn) { nBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:6px;"></i>Waiting for confirmation…'; nBtn.disabled = true; }

        var deferredPrompt = _deferred;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function (r) {
            _deferred = null;
            if (r.outcome === 'accepted') {
                var doneIcon = '<i class="fas fa-check-circle" style="margin-right:6px;color:#1db954;"></i>';
                if (sBtn) sBtn.innerHTML = doneIcon + 'Installed!';
                if (nBtn) nBtn.innerHTML = doneIcon + 'Installed!';
                _bzWriteInstallStatus({ installed: true, installedAt: firebase.firestore.FieldValue.serverTimestamp(), method: 'pwa' });
                try { localStorage.setItem('bz_just_installed', '1'); } catch (_) { }
                _persist(true);
                _currentlyInstalled = true;
                _hideNudgeForce();

                if (_isAndroid) {
                    // No browser exposes a way for a page to hand itself off
                    setTimeout(function () {
                        var descEl = document.getElementById('bz-install-setting-desc');
                        if (descEl) descEl.textContent = 'Installed — tap the Beat Zen icon on your home screen to open it';
                        var ndesc = document.getElementById('bz-nudge-desc');
                        if (ndesc) ndesc.textContent = 'Installed — tap the Beat Zen icon on your home screen to open it';
                    }, 700);
                } else {
                    // Desktop Chrome/Edge open the installed app in its own
                    setTimeout(function () {
                        try { window.close(); } catch (_) { }
                        location.reload();
                    }, 900);
                }
            } else {
                if (sBtn) { sBtn.innerHTML = '<i class="fas fa-plus"></i> Install'; sBtn.disabled = false; }
                if (nBtn) { nBtn.innerHTML = '<i class="fas fa-plus"></i> Install'; nBtn.disabled = false; }
            }
        });
    }

    // One button, one flow
    function _triggerInstall() {
        _triggerDesktopInstall();
    }

    // Post-reload: if bz_just_installed flag is set, land on Home
    function _checkJustInstalled() {
        try {
            if (localStorage.getItem('bz_just_installed') !== '1') return;
            localStorage.removeItem('bz_just_installed');
        } catch (_) { return; }

        var _tries = 0;
        var _maxTries = 120;

        function _goHome() {
            _tries++;
            if (typeof window.displayHome === 'function') {
                window.displayHome(true);
                return;
            }
            var homeLink = document.getElementById('home-link');
            if (homeLink) { homeLink.click(); return; }
            if (_tries < _maxTries) setTimeout(_goHome, 35);
        }

        setTimeout(_goHome, 300);
    }

    // Initial state + wiring
    function _applyInitialState() {
        if (_isStandalone) {
            _persist(true);
            _currentlyInstalled = true;
            _showInstalledState();
        } else if (_wasInstalled) {
            // Optimistic paint from the persisted flag
            _currentlyInstalled = true;
            _showInstalledState();
            if (_hasLiveCheck) {
                navigator.getInstalledRelatedApps().then(function (apps) {
                    if (!(apps && apps.length > 0)) {
                        _persistAssumed(false);
                        _persist(false);
                        _currentlyInstalled = false;
                        _showInstallState();
                        _bzWriteInstallStatus({ installed: false, uninstalledAt: firebase.firestore.FieldValue.serverTimestamp() });
                    }
                }).catch(function () { });
            }
        } else {
            _currentlyInstalled = false;
            _showInstallState();
            _bzReadInstallStatus(function (deviceData) {
                if (deviceData && deviceData.installed && _currentlyInstalled === false) {
                    _persist(true);
                    _currentlyInstalled = true;
                    _showInstalledState();
                }
            });
            if (_hasLiveCheck) {
                // Some browsers never fire beforeinstallprompt at all once the PWA
                _bipTimer = setTimeout(function () {
                    if (!_deferred && _currentlyInstalled === false) {
                        _persist(true);
                        _persistAssumed(true);
                        _currentlyInstalled = true;
                        _showInstalledState();
                    }
                }, 3000);
            }
        }

        /* Wire the settings Install button (non-iOS-Safari) */
        if (!_isIOS || !_isSafari) {
            var btn = document.getElementById('bz-settings-install-btn');
            if (btn && !btn._bzWired) {
                btn._bzWired = true;
                btn.onclick = _triggerInstall;
            }
        }

        // iOS Safari: show manual instructions instead of any button action
        if (_isIOS && _isSafari && !(_isStandalone || _wasInstalled)) {
            var desc = document.getElementById('bz-install-setting-desc');
            if (desc) desc.textContent = 'Tap Share → "Add to Home Screen" in Safari';
            var btn2 = document.getElementById('bz-settings-install-btn');
            if (btn2) {
                btn2.innerHTML = '<i class="fas fa-circle-info"></i> How';
                btn2.onclick = _showIOSBanner;
            }
            var ndesc = document.getElementById('bz-nudge-desc');
            if (ndesc) ndesc.textContent = 'Tap Share → "Add to Home Screen" in Safari';
            var nBtn2 = document.getElementById('bz-nudge-install-btn');
            if (nBtn2) {
                nBtn2.innerHTML = '<i class="fas fa-circle-info"></i> How';
                nBtn2.onclick = function () { _showIOSBanner(); _hideNudge(); };
            }
        }

        /* Wire the nudge install button */
        var nBtn = document.getElementById('bz-nudge-install-btn');
        if (nBtn && !nBtn._bzWired && !(_isIOS && _isSafari)) {
            nBtn._bzWired = true;
            nBtn.onclick = function () { _triggerInstall(); };
        }

        /* Wire the nudge close button */
        var nClose = document.getElementById('bz-nudge-close-btn');
        if (nClose && !nClose._bzWired) {
            nClose._bzWired = true;
            nClose.onclick = function () {
                _nudgeDismissed = true;
                _hideNudge();
            };
        }

        // Live-check poll
        _startPolling();
        _tick();

        _checkJustInstalled();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _applyInitialState);
    } else {
        _applyInitialState();
    }

    /* Pause polling while tab is hidden; resume + immediate tick on return. */
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
            _startPolling();
            _tick();
        } else {
            _stopPolling();
        }
    });

    window.addEventListener('focus', function () {
        _tick();
    });

    // beforeinstallprompt: capture + preventDefault so Chrome's own
    window.addEventListener('beforeinstallprompt', function (e) {
        clearTimeout(_bipTimer);
        _bipTimer = null;
        e.preventDefault();
        _deferred = e;

        if (_assumedInstalled) _persistAssumed(false);
        if (_wasInstalled) {
            _persist(false);
            _currentlyInstalled = false;
            _showInstallState();
        }

        var btn = document.getElementById('bz-settings-install-btn');
        if (btn && !btn._bzWired) {
            btn._bzWired = true;
            btn.onclick = _triggerInstall;
        }
        var nBtn = document.getElementById('bz-nudge-install-btn');
        if (nBtn && !nBtn._bzWired) {
            nBtn._bzWired = true;
            nBtn.onclick = function () { _triggerInstall(); };
        }

        if (_hasLiveCheck) return;
        if (_isStandalone || _wasInstalled) return;
        _currentlyInstalled = false;
        _showInstallState();
    });

    // Fires on every platform now that install goes through the native
    window.addEventListener('appinstalled', function () {
        _persist(true);
        _deferred = null;
        _currentlyInstalled = true;
        _hideNudgeForce();
        _showInstalledState();
        _bzWriteInstallStatus({ installed: true, installedAt: firebase.firestore.FieldValue.serverTimestamp(), method: 'pwa' });
    });
})();
// LYRICS VIEWER
(function () {
    const overlay = document.getElementById('bz-lyrics-fullscreen');
    const backBtn = document.getElementById('bz-lyrics-back-btn');
    const subtitleEl = document.getElementById('bz-lyrics-subtitle');
    const stateEl = document.getElementById('bz-lyrics-state');
    const stateIcon = document.getElementById('bz-lyrics-state-icon');
    const stateText = document.getElementById('bz-lyrics-state-text');
    const retryBtn = document.getElementById('bz-lyrics-retry-btn');
    const contentEl = document.getElementById('bz-lyrics-content');
    const fsMenuBtn = document.getElementById('fs-menu-btn');
    if (!overlay || !contentEl || !stateEl || !fsMenuBtn) return; // markup/button missing — bail safely

    // Community Lyrics Fallback elements
    const communityEl = document.getElementById('bz-lyrics-community');
    const communityQueryEl = document.getElementById('bz-lyrics-community-query');
    const communityCopyBtn = document.getElementById('bz-lyrics-community-copy-btn');
    const addBtn = document.getElementById('bz-lyrics-add-btn');
    const addForm = document.getElementById('bz-lyrics-add-form');
    const addTextarea = document.getElementById('bz-lyrics-add-textarea');
    const addError = document.getElementById('bz-lyrics-add-error');
    const addCancelBtn = document.getElementById('bz-lyrics-add-cancel-btn');
    const addSaveBtn = document.getElementById('bz-lyrics-add-save-btn');
    const COMMUNITY_LYRICS_COLLECTION = 'beatzen_community_lyrics';
    const LYRICS_MAX_LENGTH = 8000;

    // Right-side "now playing" panel (desktop only)
    const sideCoverEl = document.getElementById('bz-lyrics-side-cover');
    const sideMovieEl = document.getElementById('bz-lyrics-side-movie');
    const sideTitleEl = document.getElementById('bz-lyrics-side-title');
    const sideArtistEl = document.getElementById('bz-lyrics-side-artist');
    const sidePrevBtn = document.getElementById('bz-lyrics-prev-btn');
    const sidePPBtn = document.getElementById('bz-lyrics-pp-btn');
    const sideNextBtn = document.getElementById('bz-lyrics-next-btn');

    const audioPlayer = document.getElementById('audio-player');
    const _cache = new Map();  // "artist::title" -> parsed lyrics result
    let _reqToken = 0;         // guards a slow fetch resolving after the song has changed
    let _activeSong = null;
    let _syncedLines = null;   // [{ t: seconds, text }] when the source has time-synced lyrics
    let _activeLineIdx = -1;

    /* ── helpers ── */
    function _norm(s) { return String(s || '').trim(); }
    function _cacheKey(artist, title) { return (artist + '::' + title).toLowerCase(); }

    // Resolves a song's real movie/album name
    function _bzResolveMovieName(song) {
        const songIdStr = String(song?.id || '');
        const isMovieType = (a) => !!a && String(a.type || '').toLowerCase() === 'movie';
        // 1) allSongsMap's canonical album
        const canonicalAlbum = songIdStr ? window.allSongsMap?.get(songIdStr)?.album : null;
        // 2) song._sourceAlbum, but only if it's itself movie-typed
        const taggedSource = song?._sourceAlbum;
        // 3) window.playingAlbum, but again only if it's actually a movie
        const sourceAlbum = canonicalAlbum
            || (isMovieType(taggedSource) ? taggedSource : null)
            || (isMovieType(window.playingAlbum) ? window.playingAlbum : null);
        return sourceAlbum?.title || sourceAlbum?.name || 'Single';
    }

    // Fill the desktop side panel (cover art + title/artist + play state).
    function _updateSidePanel(song) {
        if (sideCoverEl) {
            const mainCover = document.getElementById('player-album-cover');
            sideCoverEl.src = mainCover?.src || '';
        }
        if (sideMovieEl) sideMovieEl.textContent = _bzResolveMovieName(song);
        if (sideTitleEl) sideTitleEl.textContent = _norm(song?.title);
        if (sideArtistEl) sideArtistEl.textContent = _norm(song?.artist);
        if (sidePPBtn) {
            const paused = !audioPlayer || audioPlayer.paused;
            sidePPBtn.innerHTML = paused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
        }
    }

    // Mini-player transport controls
    function _bzLyricsPrev() {
        if (typeof window.playPrevSong === 'function') { window.playPrevSong(); return; }
        document.getElementById('prev-btn')?.click();
    }
    function _bzLyricsNext() {
        if (typeof window.playNextSong === 'function') { window.playNextSong(); return; }
        document.getElementById('next-btn')?.click();
    }
    function _bzLyricsTogglePlay() {
        if (typeof window.togglePlayback === 'function') { window.togglePlayback(); return; }
        document.getElementById('play-pause-btn')?.click();
    }
    sidePrevBtn?.addEventListener('click', _bzLyricsPrev);
    sideNextBtn?.addEventListener('click', _bzLyricsNext);
    sidePPBtn?.addEventListener('click', _bzLyricsTogglePlay);

    // Resolve whichever song is actually playing right now
    function _bzLyricsCurrentSong() {
        let song = window.playingAlbum?.songs?.[window.currentSongIndex] || null;
        if (!song && audioPlayer?.src && window.allSongsMap) {
            try {
                const decoded = decodeURIComponent(audioPlayer.src);
                for (const [, mapped] of window.allSongsMap) {
                    if (mapped?.url && (mapped.url === audioPlayer.src || decodeURIComponent(mapped.url) === decoded)) {
                        song = mapped;
                        break;
                    }
                }
            } catch (_) { /* ignore */ }
        }
        return song;
    }

    /* Parse standard [mm:ss.xx] LRC timestamp lines into sorted {t, text} */
    function _parseLRC(lrc) {
        if (!lrc) return null;
        const lines = [];
        const re = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;
        lrc.split('\n').forEach(raw => {
            const line = raw.replace(/\s+$/, '');
            let m, last = 0;
            const stamps = [];
            re.lastIndex = 0;
            while ((m = re.exec(line))) {
                const mins = parseInt(m[1], 10);
                const secs = parseInt(m[2], 10);
                const ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
                stamps.push(mins * 60 + secs + ms / 1000);
                last = re.lastIndex;
            }
            if (!stamps.length) return;
            const text = line.slice(last).trim();
            stamps.forEach(t => lines.push({ t, text }));
        });
        if (!lines.length) return null;
        lines.sort((a, b) => a.t - b.t);
        return lines;
    }

    async function _fetchJSON(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    }

    // Try LRCLIB's search endpoint first
    async function _fetchLyrics(artist, title, songId) {
        try {
            const url = 'https://lrclib.net/api/search?track_name=' + encodeURIComponent(title) +
                '&artist_name=' + encodeURIComponent(artist);
            const results = await _fetchJSON(url);
            if (Array.isArray(results) && results.length) {
                const norm = s => _norm(s).toLowerCase();
                const exact = results.find(r => norm(r.trackName) === norm(title) && norm(r.artistName) === norm(artist));
                const pick = exact || results[0];
                if (pick && (pick.plainLyrics || pick.syncedLyrics || pick.instrumental)) {
                    return {
                        plain: pick.plainLyrics || null,
                        synced: _parseLRC(pick.syncedLyrics),
                        instrumental: !!pick.instrumental,
                        source: 'lrclib'
                    };
                }
            }
        } catch (_) { /* fall through to next provider */ }

        try {
            const url = 'https://api.lyrics.ovh/v1/' + encodeURIComponent(artist) + '/' + encodeURIComponent(title);
            const data = await _fetchJSON(url);
            if (data && data.lyrics) {
                return { plain: data.lyrics.replace(/\r\n/g, '\n').trim(), synced: null, instrumental: false, source: 'lyricsovh' };
            }
        } catch (_) { /* fall through to community lyrics */ }

        // 3) Community lyrics (Firestore)
        try {
            if (typeof db !== 'undefined' && songId) {
                const snap = await db.collection(COMMUNITY_LYRICS_COLLECTION).doc(songId).get();
                if (snap.exists) {
                    const data = snap.data() || {};
                    if (data.lyrics) {
                        return {
                            plain: String(data.lyrics),
                            synced: null,
                            instrumental: false,
                            source: 'community',
                            addedBy: data.addedBy || 'Anonymous'
                        };
                    }
                }
            }
        } catch (_) { /* Firestore lookup failed — fall through to "not found" */ }

        return null;
    }

    // UI states
    function _showState(icon, text, showRetry, isNotFound) {
        contentEl.style.display = 'none';
        contentEl.classList.remove('bz-lyrics-synced');
        stateEl.style.display = 'flex';
        if (stateIcon) stateIcon.className = icon;
        if (stateText) stateText.textContent = text;
        if (retryBtn) retryBtn.style.display = showRetry ? 'inline-flex' : 'none';
        if (isNotFound) {
            _populateCommunitySection();
        } else if (communityEl) {
            communityEl.style.display = 'none';
        }
    }

    // Fills + reveals the Community Lyrics Fallback block for whichever song
    function _populateCommunitySection() {
        if (!communityEl) return;
        const song = _activeSong;
        const title = _norm(song?.title);
        const movieName = _bzResolveMovieName(song);
        const query = [title, movieName].filter(Boolean).join(' - ') + ' lyrics';

        if (communityQueryEl) communityQueryEl.textContent = query;
        communityEl.style.display = 'block';

        if (addForm) addForm.style.display = 'none';
        if (addBtn) addBtn.style.display = 'flex';
        if (addTextarea) addTextarea.value = '';
        if (addError) addError.textContent = '';
        if (addSaveBtn) { addSaveBtn.disabled = false; addSaveBtn.innerHTML = '<i class="fas fa-check"></i> Save'; }
    }

    // Best-effort display name for "addedBy"
    function _bzCurrentDisplayName() {
        try {
            return localStorage.getItem('beatzen_displayUsername')
                || localStorage.getItem('beatzen_fullName')
                || (typeof auth !== 'undefined' && auth.currentUser &&
                    (auth.currentUser.displayName || auth.currentUser.email?.split('@')[0]))
                || 'Anonymous';
        } catch (_) { return 'Anonymous'; }
    }

    // Copy the Google search text to the clipboard
    communityCopyBtn?.addEventListener('click', async () => {
        const text = communityQueryEl?.textContent || '';
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch (_) {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            } catch (_copyErr) { return; }
        }
        const original = communityCopyBtn.innerHTML;
        communityCopyBtn.innerHTML = '<i class="fas fa-check"></i>';
        communityCopyBtn.classList.add('bz-lyrics-community-copy-btn--done');
        setTimeout(() => {
            communityCopyBtn.innerHTML = original;
            communityCopyBtn.classList.remove('bz-lyrics-community-copy-btn--done');
        }, 1500);
    });

    /* ── Add Lyrics — reveal / cancel the textarea form ── */
    addBtn?.addEventListener('click', () => {
        addBtn.style.display = 'none';
        if (addForm) addForm.style.display = 'flex';
        addTextarea?.focus();
    });
    addCancelBtn?.addEventListener('click', () => {
        if (addForm) addForm.style.display = 'none';
        if (addBtn) addBtn.style.display = 'flex';
        if (addTextarea) addTextarea.value = '';
        if (addError) addError.textContent = '';
    });

    // Save community lyrics
    addSaveBtn?.addEventListener('click', async () => {
        const raw = (addTextarea?.value || '').trim();
        if (addError) addError.textContent = '';

        if (!raw) { if (addError) addError.textContent = 'Please enter the lyrics before saving.'; return; }
        if (raw.length > LYRICS_MAX_LENGTH) {
            if (addError) addError.textContent = `Lyrics must be ${LYRICS_MAX_LENGTH} characters or fewer.`;
            return;
        }

        const song = _activeSong;
        const songId = song?.id != null ? String(song.id) : '';
        if (!songId) { if (addError) addError.textContent = "Couldn't identify this song. Try again."; return; }
        if (typeof db === 'undefined') { if (addError) addError.textContent = 'Saving is unavailable right now.'; return; }

        const artist = _norm(song?.artist);
        const title = _norm(song?.title);
        const movieName = _bzResolveMovieName(song);
        const addedBy = _bzCurrentDisplayName();

        addSaveBtn.disabled = true;
        addSaveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';

        try {
            await db.collection(COMMUNITY_LYRICS_COLLECTION).doc(songId).set({
                lyrics: raw,
                addedBy,
                songTitle: title,
                movieName,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            const result = { plain: raw, synced: null, instrumental: false, source: 'community', addedBy };
            _cache.set(_cacheKey(artist, title), result);
            _renderLyrics(result); // instantly shows the lyrics + "Added by …" — no refetch needed
        } catch (err) {
            // Log the real Firebase error code/message
            console.warn('[BeatZen Lyrics] Failed to save community lyrics:', err?.code, err?.message, err);

            let msg = "Couldn't save lyrics. Try again.";
            if (err?.code === 'permission-denied') {
                // By far the most common cause: Firestore's security rules don't
                msg = "Saving isn't allowed yet — add a Firestore rule for the "
                    + COMMUNITY_LYRICS_COLLECTION + " collection.";
            } else if (err?.code === 'unavailable' || err?.code === 'network-request-failed') {
                msg = "Couldn't reach the server. Check your connection and try again.";
            } else if (err?.code === 'unauthenticated') {
                msg = "You need to be signed in to save lyrics.";
            } else if (err?.message) {
                msg = "Couldn't save lyrics: " + err.message;
            }
            if (addError) addError.textContent = msg;
            addSaveBtn.disabled = false;
            addSaveBtn.innerHTML = '<i class="fas fa-check"></i> Save';
        }
    });

    function _renderLyrics(result) {
        _syncedLines = null;
        _activeLineIdx = -1;
        stateEl.style.display = 'none';
        contentEl.style.display = 'block';
        contentEl.classList.remove('bz-lyrics-synced');
        contentEl.innerHTML = '';

        if (result.instrumental && !result.plain && !result.synced) {
            const p = document.createElement('p');
            p.className = 'bz-lyrics-line bz-lyrics-muted';
            p.textContent = '🎵 This track is instrumental — no lyrics to show.';
            contentEl.appendChild(p);
            return;
        }

        if (result.synced && result.synced.length) {
            _syncedLines = result.synced;
            contentEl.classList.add('bz-lyrics-synced');
            const frag = document.createDocumentFragment();
            result.synced.forEach((line, i) => {
                const p = document.createElement('p');
                p.className = 'bz-lyrics-line';
                p.dataset.idx = String(i);
                p.textContent = line.text || '\u266A';
                frag.appendChild(p);
            });
            contentEl.appendChild(frag);
            return;
        }

        const text = (result.plain || '').trim();
        if (!text) {
            _showState('fas fa-music', 'No lyrics found for this song.', true, true);
            return;
        }
        text.split('\n').forEach(l => {
            const p = document.createElement('p');
            p.className = 'bz-lyrics-line';
            p.textContent = l.trim() ? l : '\u00A0';
            contentEl.appendChild(p);
        });

        // Community-submitted lyrics carry an attribution line at the bottom.
        if (result.source === 'community' && result.addedBy) {
            const attribution = document.createElement('p');
            attribution.className = 'bz-lyrics-line bz-lyrics-community-attribution';
            attribution.textContent = 'Added by ' + result.addedBy;
            contentEl.appendChild(attribution);
        }
    }

    async function _loadFor(song) {
        const token = ++_reqToken;
        const artist = _norm(song?.artist);
        const title = _norm(song?.title);
        if (subtitleEl) subtitleEl.textContent = [title, artist].filter(Boolean).join(' — ') || 'Now Playing';

        if (!title) { _showState('fas fa-triangle-exclamation', "Couldn't identify this song.", false); return; }

        const key = _cacheKey(artist, title);
        if (_cache.has(key)) { _renderLyrics(_cache.get(key)); return; }

        _showState('fas fa-spinner fa-spin', 'Fetching lyrics…', false);
        try {
            const songId = song?.id != null ? String(song.id) : '';
            const result = await _fetchLyrics(artist, title, songId);
            if (token !== _reqToken) return; // song changed while this fetch was in flight
            if (!result) { _showState('fas fa-music', 'No lyrics found for this song.', true, true); return; }
            _cache.set(key, result);
            _renderLyrics(result);
        } catch (_) {
            if (token !== _reqToken) return;
            _showState('fas fa-wifi', "Couldn't load lyrics. Check your connection.", true);
        }
    }

    /* synced-lyrics highlighting, tracked against the real <audio> element */
    function _onTimeUpdate() {
        if (!_syncedLines || !overlay.classList.contains('active')) return;
        const t = audioPlayer.currentTime || 0;
        let idx = -1;
        for (let i = 0; i < _syncedLines.length; i++) {
            if (_syncedLines[i].t <= t) idx = i; else break;
        }
        if (idx === _activeLineIdx) return;
        _activeLineIdx = idx;
        const prevActive = contentEl.querySelector('.bz-lyrics-line.active');
        if (prevActive) prevActive.classList.remove('active');
        if (idx >= 0) {
            const line = contentEl.querySelector('.bz-lyrics-line[data-idx="' + idx + '"]');
            if (line) {
                line.classList.add('active');
                line.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
        }
    }
    audioPlayer?.addEventListener('timeupdate', _onTimeUpdate);

    // keep the side panel + lyrics in sync whenever the track actually
    function _onTrackMaybeChanged() {
        if (!overlay.classList.contains('active')) return;
        const song = _bzLyricsCurrentSong();
        if (!song) return;
        const changed = !_activeSong || String(song.id) !== String(_activeSong.id) ||
            _norm(song.title) !== _norm(_activeSong.title) || _norm(song.artist) !== _norm(_activeSong.artist);
        if (changed) {
            _activeSong = song;
            _updateSidePanel(song);
            _loadFor(song);
        } else {
            // Same song, but playback (re)started — refresh the play/pause icon.
            _updateSidePanel(song);
        }
    }
    audioPlayer?.addEventListener('loadstart', _onTrackMaybeChanged);
    audioPlayer?.addEventListener('play', _onTrackMaybeChanged);

    // tap/click a synced line to jump playback straight to that moment
    function _onLyricsLineClick(e) {
        if (!_syncedLines || !audioPlayer) return;
        const lineEl = e.target.closest('.bz-lyrics-line[data-idx]');
        if (!lineEl || !contentEl.contains(lineEl)) return;
        const idx = parseInt(lineEl.dataset.idx, 10);
        const line = _syncedLines[idx];
        if (!line || !isFinite(line.t)) return;

        audioPlayer.currentTime = line.t;
        if (audioPlayer.paused) {
            // audioPlayer.onplay (wired elsewhere in this file) takes care
            audioPlayer.play().catch(() => { /* e.g. blocked until a user gesture — already have one here, so rare */ });
        }

        // Reflect the tap instantly instead of waiting for the next timeupdate
        _activeLineIdx = idx;
        const prevActive = contentEl.querySelector('.bz-lyrics-line.active');
        if (prevActive) prevActive.classList.remove('active');
        lineEl.classList.add('active');
    }
    contentEl.addEventListener('click', _onLyricsLineClick);

    /* open / close */
    let _closingFromPopstate = false;
    function openLyrics(song) {
        _activeSong = song;
        _updateSidePanel(song);
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        history.pushState({ bzLyrics: true }, '', window.location.href);
        _loadFor(song);
    }
    function closeLyrics(fromPopstate) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        if (!fromPopstate) {
            _closingFromPopstate = true;
            history.back();
        }
    }
    window.bzOpenLyrics = openLyrics;
    window.bzCloseLyrics = () => closeLyrics(false); // exposed for the Shift+L keyboard-shortcut toggle

    backBtn?.addEventListener('click', () => closeLyrics(false));
    retryBtn?.addEventListener('click', () => { if (_activeSong) _loadFor(_activeSong); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLyrics(false); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('active')) { e.preventDefault(); closeLyrics(false); }
    });
    // Intercept popstate while open (capture phase) so the browser/gesture
    window.addEventListener('popstate', (e) => {
        if (_closingFromPopstate) { _closingFromPopstate = false; e.stopImmediatePropagation(); return; }
        if (overlay.classList.contains('active')) { e.stopImmediatePropagation(); closeLyrics(true); }
    }, true);

    // wire "Show Lyrics" into the fullscreen player's three-dot menu
    function _injectLyricsRow() {
        const opts = document.getElementById('modal-main-options');
        if (!opts) return;
        opts.querySelectorAll('.bz-fs-lyrics-btn').forEach(b => b.remove());
        const song = _bzLyricsCurrentSong();
        if (!song) return; // nothing playing — the existing handler already toasts about this
        const btn = document.createElement('button');
        btn.className = 'bz-fs-nav-btn bz-fs-lyrics-btn';
        btn.innerHTML = '<i class="fas fa-align-left"></i> Show Lyrics';
        btn.onclick = () => {
            if (typeof window.closePlaylistModal === 'function') window.closePlaylistModal();
            setTimeout(() => openLyrics(song), 160); // let the menu-close animation finish
        };
        opts.appendChild(btn);
    }
    function _onFsMenuOpen() { setTimeout(_injectLyricsRow, 0); }
    fsMenuBtn.addEventListener('click', _onFsMenuOpen);
    fsMenuBtn.addEventListener('touchend', _onFsMenuOpen, { passive: true });

    // Fullscreen player's dedicated Lyrics icon (beside Share)
    const fsLyricsBtn = document.getElementById('fs-lyrics-btn');
    function _onFsLyricsBtn() {
        const song = _bzLyricsCurrentSong();
        if (!song) return; // nothing playing — mirror the menu row's silent no-op
        openLyrics(song);
    }
    fsLyricsBtn?.addEventListener('click', _onFsLyricsBtn);
})();
// BEAT ZEN
(function () {
    'use strict';

    // Left-to-right order matches the <a> tags inside .nav-links
    const NAV_ORDER = ['home-link', 'search-link', 'playlists-link', 'premium-link', 'settings-link', 'updates-link'];
    const SWIPE_MIN_DX = 60; // same sensitivity as CONFIG.SWIPE_LIMIT used by the player's own

    function isMobileNav() {
        return window.matchMedia('(max-width: 768px)').matches;
    }

    function currentTabIndex() {
        const activeContent = document.querySelector('.nav-link-content.active');
        const link = activeContent && activeContent.closest('a');
        if (!link) return -1;
        return NAV_ORDER.indexOf(link.id);
    }

    // Walk up from the touch target looking for a horizontally-scrollable
    function hasScrollableXAncestor(el, boundary) {
        let node = el;
        while (node && node !== boundary) {
            if (node.nodeType === 1 && node.scrollWidth > node.clientWidth + 2) {
                const overflowX = getComputedStyle(node).overflowX;
                if (overflowX === 'auto' || overflowX === 'scroll') return true;
            }
            node = node.parentElement;
        }
        return false;
    }

    function initTabSwipe() {
        const main = document.querySelector('main.main-content');
        if (!main) return;

        let startX = 0, startY = 0, tracking = false;

        main.addEventListener('touchstart', (e) => {
            if (!isMobileNav() || e.touches.length !== 1) { tracking = false; return; }
            const target = e.target;
            // Step aside for: buttons/selects/links
            const alwaysExcluded = target.closest && target.closest('button, select, .song-item');
            // Text fields (e.g. the Search tab's auto-focused search bar)
            const textField = target.closest && target.closest('input, textarea');
            const textFieldFocused = textField && document.activeElement === textField;
            if (alwaysExcluded || textFieldFocused || hasScrollableXAncestor(target, main)) { tracking = false; return; }
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            tracking = true;
        }, { passive: true });

        main.addEventListener('touchend', (e) => {
            if (!tracking) return;
            tracking = false;
            const dx = e.changedTouches[0].clientX - startX;
            const dy = Math.abs(e.changedTouches[0].clientY - startY);
            // Same horizontal-dominance guard as the player's own swipe gesture
            if (Math.abs(dx) <= SWIPE_MIN_DX || Math.abs(dx) < 2 * dy) return;

            const idx = currentTabIndex();
            if (idx === -1) return;
            // Swipe left
            const nextIdx = dx < 0 ? idx + 1 : idx - 1;
            if (nextIdx < 0 || nextIdx >= NAV_ORDER.length) return; // no wrap-around at the ends

            const nextLink = document.getElementById(NAV_ORDER[nextIdx]);
            if (nextLink) {
                if ('vibrate' in navigator) navigator.vibrate(10);
                nextLink.click();
            }
        }, { passive: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTabSwipe);
    } else {
        initTabSwipe();
    }
})();

// BEAT ZEN
(function initDailyStreak() {
    'use strict';
    const STREAK_KEY = 'beatZen_streak';

    // IST calendar-day key (e.g. "2026-08-29")
    function todayKey(d) {
        d = d || new Date();
        try {
            return new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Kolkata',
                year: 'numeric', month: '2-digit', day: '2-digit'
            }).format(d); // -> "2026-08-29", already in Y-M-D order
        } catch (_) {
            // Fallback for the rare environment without Intl timeZone
            const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
            const y = ist.getUTCFullYear();
            const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
            const day = String(ist.getUTCDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }
    }

    // Whole calendar days between two "YYYY-MM-DD" keys
    function daysBetween(fromKey, toKey) {
        const [fy, fm, fd] = fromKey.split('-').map(Number);
        const [ty, tm, td] = toKey.split('-').map(Number);
        const from = new Date(fy, fm - 1, fd);
        const to = new Date(ty, tm - 1, td);
        return Math.round((to - from) / 86400000);
    }

    function loadStreak() {
        try {
            const raw = localStorage.getItem(STREAK_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (data && typeof data.count === 'number' && typeof data.lastOpen === 'string') return data;
        } catch (_) { /* corrupted value — treat as no history */ }
        return null;
    }

    function saveStreak(data) {
        try { localStorage.setItem(STREAK_KEY, JSON.stringify(data)); } catch (_) { /* storage unavailable — non-fatal */ }
    }

    // Brings the stored streak up to date for "today"
    function updateStreakForToday() {
        const today = todayKey();
        const existing = loadStreak();

        if (!existing) {
            const fresh = { count: 1, lastOpen: today };
            saveStreak(fresh);
            return fresh;
        }

        const gap = daysBetween(existing.lastOpen, today);
        if (gap <= 0) return existing; // already counted today (or clock moved backwards)
        if (gap === 1) {
            const extended = { count: existing.count + 1, lastOpen: today };
            saveStreak(extended);
            return extended;
        }
        // gap > 1 — at least one full calendar day was skipped entirely.
        const reset = { count: 1, lastOpen: today };
        saveStreak(reset);
        return reset;
    }

    function renderStreak(data) {
        const countEl = document.getElementById('bz-profile-streak-count');
        if (countEl) countEl.textContent = String(data.count);
    }

    const initial = updateStreakForToday();
    renderStreak(initial);

    // Exposed so displayProfile() can re-paint the card with the latest
    window.bzRefreshStreakCard = function () {
        renderStreak(loadStreak() || initial);
    };

    // "Share Streak" button, beside the count on the same line
    function wireStreakShareButton() {
        const btn = document.getElementById('bz-streak-share-btn');
        if (!btn || btn._bzWired) return;
        btn._bzWired = true;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const data = loadStreak() || initial;
            if (typeof window.openShareStreakModal === 'function') {
                window.openShareStreakModal(data.count);
            }
        });
    }
    wireStreakShareButton();
    // The button lives on the (static, always-in-DOM) Profile page markup
    if (!document.getElementById('bz-streak-share-btn')) {
        document.addEventListener('DOMContentLoaded', wireStreakShareButton);
    }
})();
