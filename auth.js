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

    /* ── Central auth-state handler ─────────────────────────────────── */
    auth.onAuthStateChanged(function (user) {
        window.bzIsAuthenticated = !!user;
        var html = document.documentElement;

        if (user) {
            try { localStorage.setItem('beatZen_session_uid', user.uid); } catch (_) { }
            html.classList.remove('bz-guest');
            html.classList.add('bz-signed-in');
            ensureUserDoc(user);
            grantFreeForeverPremiumIfEligible(user);
            startUserDocListener(user.uid);

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

        auth.signInWithEmailAndPassword(email, pw).then(function () {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In'; }
        }).catch(function (err) {
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

        // Sign out (Settings account card + Profile page)
        on('bz-google-signout-btn', 'click', function () { auth.signOut(); });
        on('bz-profile-signout-btn', 'click', function () { auth.signOut(); });
    });

})();