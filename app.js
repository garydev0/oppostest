import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const CEO_EMAIL = "gerardlopezgarcia1@gmail.com";

// Paràmetres Oficials d'Examen Mossos d'Esquadra
const EXAM_QUESTIONS_COUNT = 30;
const EXAM_DURATION_SECONDS = 35 * 60; // 35 minuts

// Configuració oficial del teu projecte Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAK8r_-CMw1626LIFnrn9NcVkIcvYv2Elo",
    authDomain: "oppostest.firebaseapp.com",
    projectId: "oppostest",
    storageBucket: "oppostest.firebasestorage.app",
    messagingSenderId: "738546966243",
    appId: "1:738546966243:web:58b4277287a97d6e036fd6",
    measurementId: "G-XT9FSLFHSB"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let currentUser = null;

// Temari Oficial (20 temes)
const TOPICS = {
    A: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'],
    B: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'],
    C: ['c1', 'c2', 'c3', 'c4', 'c5']
};
const ALL_FILES = [...TOPICS.A, ...TOPICS.B, ...TOPICS.C];

// Caché en memòria per velocitat instantània
const questionCache = {};
let allUsersCache = [];
let currentUploadTargetCode = null;
let currentManagedTopicCode = null;
let currentManagedQuestions = [];

// Dades del Perfil i Estadístiques de l'opositor
let userStats = JSON.parse(localStorage.getItem('oppostest_pro_stats')) || {
    displayName: 'Opositor',
    avatar: '👮‍♂️',
    goal: 'Futura Promoció Mossos d\'Esquadra',
    xp: 0,
    dailyStreak: 0,
    lastStudyDate: null,
    bestStreak: 0,
    failedQuestions: [],
    savedQuestions: [],    // Preguntes guardades amb estrella ⭐
    simulacreHistory: [],  // Historial dels últims simulacres
    topicScores: {},
    freeProTrialsUsed: 0,
    unlockedExams: 0,
    redeemedFriend: false,
    banned: false
};

// Assegurar compatibilitat amb perfils ja creats
if (!Array.isArray(userStats.failedQuestions)) userStats.failedQuestions = [];
if (!Array.isArray(userStats.savedQuestions)) userStats.savedQuestions = [];
if (!Array.isArray(userStats.simulacreHistory)) userStats.simulacreHistory = [];

let quizState = {
    mode: 'study',
    topicCode: null,
    originTab: 'tab-learn',
    title: '',
    questions: [],
    currentIndex: 0,
    correct: 0,
    wrong: 0,
    blank: 0,
    streak: 0,
    userAnswers: [],
    simulacreAnswers: [],
    simulacreDoubts: [],
    timerInterval: null,
    secondsLeft: 0
};

// ==========================================
// PANTALLA DE CÀRREGA INICIAL (SPLASH SCREEN)
// ==========================================
function updateSplashProgress(percent, text) {
    const bar = document.getElementById('splash-bar-fill');
    const status = document.getElementById('splash-status');
    if (bar) bar.style.width = `${percent}%`;
    if (status && text) status.textContent = text;
}

function showSplashLoader(text = 'Carregant...') {
    const splash = document.getElementById('splash-screen');
    if (splash) {
        splash.style.opacity = '1';
        splash.classList.remove('hidden');
        updateSplashProgress(40, text);
    }
}

function hideSplashLoader() {
    const splash = document.getElementById('splash-screen');
    if (!splash) return;
    updateSplashProgress(100, 'Tot a punt!');
    setTimeout(() => {
        splash.style.opacity = '0';
        setTimeout(() => splash.classList.add('hidden'), 320);
    }, 180);
}

// ==========================================
// SISTEMA DE MODALS I TOASTS PERSONALITZATS
// ==========================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3400);
}

function showModal({ icon = '💡', title, text, html = null, showInput = false, placeholder = '', confirmText = 'Acceptar', cancelText = 'Cancel·lar', onConfirm }) {
    const overlay = document.getElementById('modal-overlay');
    document.getElementById('modal-icon').textContent = icon;
    document.getElementById('modal-title').textContent = title;

    const textEl = document.getElementById('modal-text');
    if (html) {
        textEl.innerHTML = html;
    } else {
        textEl.textContent = text || '';
    }

    const inputEl = document.getElementById('modal-input');
    inputEl.value = '';
    if (showInput) {
        inputEl.placeholder = placeholder;
        inputEl.classList.remove('hidden');
    } else {
        inputEl.classList.add('hidden');
    }

    const cancelBtn = document.getElementById('modal-cancel');
    const confirmBtn = document.getElementById('modal-confirm');

    if (cancelText) {
        cancelBtn.textContent = cancelText;
        cancelBtn.classList.remove('hidden');
    } else {
        cancelBtn.classList.add('hidden');
    }
    confirmBtn.textContent = confirmText;

    overlay.classList.remove('hidden');

    cancelBtn.onclick = () => overlay.classList.add('hidden');
    confirmBtn.onclick = () => {
        const val = inputEl.value.trim();
        overlay.classList.add('hidden');
        if (onConfirm) onConfirm(val);
    };
}

// ==========================================
// INICIALITZACIÓ RÀPIDA DES DE FIRESTORE
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    updateSplashProgress(20, 'Preparant tauler i estadístiques...');
    renderTopicNodes();
    updateStatsUI();
    initFirebaseListeners();
    initKeyboardShortcuts();

    updateSplashProgress(55, 'Sincronitzant els 20 temes des del núvol...');
    await fetchQuestionsFromCodes(ALL_FILES);

    updateSplashProgress(85, 'Comprovant esdeveniments i alertes...');
    await Promise.all([loadGlobalAlert(), loadLiveEventBanner()]);

    hideSplashLoader();
});

// GESTIÓ ESTRICTA DEL COLOR ACTIU DE LES PESTANYES
function openView(viewId, activeTabId) {
    const allViews = [
        'view-learn', 'view-simulacre-hub', 'view-errors-hub',
        'view-ranking', 'view-profile', 'view-ceo', 'view-quiz', 'view-results'
    ];
    allViews.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    const targetView = document.getElementById(viewId);
    if (targetView) targetView.classList.remove('hidden');

    document.querySelectorAll('.duo-nav-item').forEach(btn => {
        btn.classList.remove('active');
        btn.blur(); // Evita que es quedi marcat en prémer i cancel·lar
    });

    const targetTab = document.getElementById(activeTabId);
    if (targetTab) targetTab.classList.add('active');
}

function isUserPro() {
    if (currentUser?.email === CEO_EMAIL) return true;
    if (userStats.unlockedExams === true) return true;
    if (typeof userStats.unlockedExams === 'number' && userStats.unlockedExams >= 3) return true;
    return false;
}

function getInvitesCount(unlockedVal) {
    if (typeof unlockedVal === 'number') return unlockedVal >= 900 ? 0 : unlockedVal;
    return 0;
}

function getTodayStr() {
    return new Date().toISOString().split('T')[0];
}

function getYesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
}

function recordDailyStudy() {
    const today = getTodayStr();
    const yesterday = getYesterdayStr();

    if (userStats.lastStudyDate === today) return;
    if (userStats.lastStudyDate === yesterday) {
        userStats.dailyStreak = (userStats.dailyStreak || 0) + 1;
        showToast(`🔥 Ratxa diària augmentada a ${userStats.dailyStreak} dies!`, 'success');
    } else {
        userStats.dailyStreak = 1;
    }
    userStats.lastStudyDate = today;
}

function renderTopicNodes() {
    ['A', 'B', 'C'].forEach(ambit => {
        const container = document.getElementById(`nodes-${ambit}`);
        if (!container) return;
        container.innerHTML = '';
        TOPICS[ambit].forEach(code => {
            const score = userStats.topicScores?.[code];
            let colorClass = '';
            let gradeText = 'Pendent';

            if (score !== undefined) {
                gradeText = `Nota: ${score.toFixed(1)}`;
                if (score < 5) colorClass = 'node-red';
                else if (score < 7) colorClass = 'node-yellow';
                else if (score < 9) colorClass = 'node-green';
                else colorClass = 'node-gold';
            }

            const btn = document.createElement('button');
            btn.className = `node-btn ${colorClass}`;
            btn.innerHTML = `
                <div class="node-circle">${code.toUpperCase()}</div>
                <span>Tema ${code.toUpperCase()}</span>
                <span class="node-grade">${gradeText}</span>
            `;
            btn.onclick = () => startTopic(code);
            container.appendChild(btn);
        });
    });
}

function updateStatsUI() {
    document.getElementById('ui-daily-streak').textContent = userStats.dailyStreak || 0;
    document.getElementById('ui-best-survival').textContent = userStats.bestStreak || 0;
    document.getElementById('ui-xp').textContent = userStats.xp || 0;

    const errCount = (userStats.failedQuestions || []).length;
    const savedCount = (userStats.savedQuestions || []).length;
    document.getElementById('ui-errors').textContent = errCount;
    document.getElementById('ui-saved').textContent = savedCount;
    document.getElementById('sidebar-error-count').textContent = errCount;

    document.getElementById('ui-user-avatar').textContent = userStats.avatar || '👮‍♂️';
    document.getElementById('ui-user-name').textContent = userStats.displayName || 'Convidat';

    const proBadge = document.getElementById('ui-pro-badge');
    const proSideBtn = document.getElementById('btn-pro-sidebar');
    if (isUserPro()) {
        proBadge.textContent = '💎 PRO';
        proBadge.classList.add('is-pro');
        proSideBtn.classList.add('hidden');
    } else {
        const count = getInvitesCount(userStats.unlockedExams);
        proBadge.textContent = `GRATIS (${count}/3)`;
        proBadge.classList.remove('is-pro');
        proSideBtn.classList.remove('hidden');
    }
}

async function saveStats() {
    localStorage.setItem('oppostest_pro_stats', JSON.stringify(userStats));
    updateStatsUI();
    renderTopicNodes();

    if (currentUser && !userStats.banned) {
        try {
            await setDoc(doc(db, "users", currentUser.uid), {
                email: currentUser.email,
                displayName: userStats.displayName || currentUser.displayName || currentUser.email.split('@')[0],
                avatar: userStats.avatar || '👮‍♂️',
                goal: userStats.goal || 'Futura Promoció Mossos',
                xp: userStats.xp,
                dailyStreak: userStats.dailyStreak,
                lastStudyDate: userStats.lastStudyDate,
                bestStreak: userStats.bestStreak,
                failedQuestions: userStats.failedQuestions || [],
                savedQuestions: userStats.savedQuestions || [],
                simulacreHistory: userStats.simulacreHistory || [],
                topicScores: userStats.topicScores || {},
                unlockedExams: userStats.unlockedExams,
                updatedAt: Date.now()
            }, { merge: true });
        } catch (e) {
            console.warn("Error desant a Firestore:", e);
        }
    }
}

// ==========================================
// PANTALLA DE PERFIL I DESGLOSSAMENT PER ÀMBITS
// ==========================================
function calcAmbitAverage(codesArray) {
    const scores = userStats.topicScores || {};
    const valid = codesArray.map(c => scores[c]).filter(v => v !== undefined);
    if (!valid.length) return 'Pendent';
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
    return `${avg.toFixed(1)} / 10 (${valid.length}/${codesArray.length} temes)`;
}

function renderProfileView() {
    document.getElementById('profile-big-avatar').textContent = userStats.avatar || '👮‍♂️';
    document.getElementById('profile-display-title').textContent = userStats.displayName || 'Opositor';
    document.getElementById('profile-email-subtitle').textContent = currentUser ? currentUser.email : 'Mode Local (Inicia sessió amb Google per guardar al núvol)';

    document.getElementById('profile-name-input').value = userStats.displayName || '';
    document.getElementById('profile-goal-input').value = userStats.goal || '';

    document.querySelectorAll('.avatar-opt').forEach(btn => {
        btn.classList.toggle('selected', btn.textContent.trim() === (userStats.avatar || '👮‍♂️'));
    });

    const scoresObj = userStats.topicScores || {};
    const keys = Object.keys(scoresObj);
    const avg = keys.length > 0 ? (keys.reduce((a, k) => a + scoresObj[k], 0) / keys.length).toFixed(2) : '0.00';
    const passed = keys.filter(k => scoresObj[k] >= 5).length;

    document.getElementById('prof-stat-pro').textContent = isUserPro() ? '💎 PRO ACTIU' : 'PLA GRATUÏT';
    document.getElementById('prof-stat-invites').textContent = `${getInvitesCount(userStats.unlockedExams)} / 3 amics`;
    document.getElementById('prof-stat-avg').textContent = avg;
    document.getElementById('prof-stat-passed').textContent = `${passed} / 20 temes`;

    document.getElementById('prof-avg-a').textContent = calcAmbitAverage(TOPICS.A);
    document.getElementById('prof-avg-b').textContent = calcAmbitAverage(TOPICS.B);
    document.getElementById('prof-avg-c').textContent = calcAmbitAverage(TOPICS.C);

    const profAuthBtn = document.getElementById('profile-auth-btn');
    profAuthBtn.textContent = currentUser ? '🚪 TANCAR SESSIÓ' : '👤 INICIAR SESSIÓ AMB GOOGLE';
}

function selectProfileAvatar(emoji) {
    userStats.avatar = emoji;
    document.getElementById('profile-big-avatar').textContent = emoji;
    document.querySelectorAll('.avatar-opt').forEach(btn => {
        btn.classList.toggle('selected', btn.textContent.trim() === emoji);
    });
}

async function saveUserProfileData() {
    const newName = document.getElementById('profile-name-input').value.trim();
    const newGoal = document.getElementById('profile-goal-input').value.trim();

    if (!newName) {
        showToast('El nom públic no pot estar buit!', 'error');
        return;
    }

    userStats.displayName = newName;
    userStats.goal = newGoal || 'Futura Promoció Mossos d\'Esquadra';

    await saveStats();
    renderProfileView();
    showToast('✅ Perfil actualitzat correctament!', 'success');
}

async function forceReloadQuestionBanks() {
    showSplashLoader('Sincronitzant els 20 temes amb Firestore...');
    ALL_FILES.forEach(code => clearLocalBankCache(code));
    await fetchQuestionsFromCodes(ALL_FILES, true);
    hideSplashLoader();
    showToast('✅ Temari actualitzat des del núvol!', 'success');
}

// ==========================================
// AUTENTICACIÓ, BLOQUEIG BAN I PERFIL CEO (PC I MÒBIL)
// ==========================================
function initFirebaseListeners() {
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        const authBtn = document.getElementById('btn-auth-trigger');
        const ceoTab = document.getElementById('tab-ceo');
        const ceoTopBtn = document.getElementById('ui-ceo-top-btn');
        const refInput = document.getElementById('my-ref-code');

        if (user) {
            authBtn.textContent = "TANCAR SESSIÓ";
            refInput.value = user.uid;

            if (user.email.toLowerCase() === CEO_EMAIL.toLowerCase()) {
                ceoTab.classList.remove('hidden');
                ceoTopBtn.classList.remove('hidden');
            } else {
                ceoTab.classList.add('hidden');
                ceoTopBtn.classList.add('hidden');
            }

            const snap = await getDoc(doc(db, "users", user.uid));
            if (snap.exists()) {
                const data = snap.data();

                if (data.banned === true && user.email.toLowerCase() !== CEO_EMAIL.toLowerCase()) {
                    userStats.banned = true;
                    document.getElementById('ban-screen').classList.remove('hidden');
                    return;
                } else {
                    userStats.banned = false;
                    document.getElementById('ban-screen').classList.add('hidden');
                }

                userStats.displayName = data.displayName || user.displayName || user.email.split('@')[0];
                userStats.avatar = data.avatar || userStats.avatar || '👮‍♂️';
                userStats.goal = data.goal || userStats.goal || 'Futura Promoció Mossos';
                userStats.xp = Math.max(userStats.xp, data.xp || 0);
                userStats.dailyStreak = Math.max(userStats.dailyStreak, data.dailyStreak || 0);
                userStats.lastStudyDate = data.lastStudyDate || userStats.lastStudyDate;
                userStats.bestStreak = Math.max(userStats.bestStreak, data.bestStreak || 0);
                userStats.failedQuestions = data.failedQuestions || userStats.failedQuestions || [];
                userStats.savedQuestions = data.savedQuestions || userStats.savedQuestions || [];
                userStats.simulacreHistory = data.simulacreHistory || userStats.simulacreHistory || [];
                userStats.topicScores = { ...userStats.topicScores, ...(data.topicScores || {}) };
                userStats.unlockedExams = data.unlockedExams ?? userStats.unlockedExams;
                updateStatsUI();
                renderTopicNodes();
                renderProfileView();
            } else {
                userStats.displayName = user.displayName || user.email.split('@')[0];
                await saveStats();
                renderProfileView();
            }
        } else {
            document.getElementById('ban-screen').classList.add('hidden');
            authBtn.textContent = "👤 ENTRAR AMB GOOGLE";
            refInput.value = "Inicia sessió per tenir codi";
            ceoTab.classList.add('hidden');
            ceoTopBtn.classList.add('hidden');
            updateStatsUI();
            renderProfileView();
        }
    });
}

async function forceSignOut() {
    await signOut(auth);
    document.getElementById('ban-screen').classList.add('hidden');
    switchTab('learn');
}

async function handleAuthClick() {
    if (currentUser) {
        showModal({
            icon: '👋',
            title: 'Tancar sessió?',
            text: 'El teu progrés està sincronitzat al núvol.',
            confirmText: 'Sortir',
            onConfirm: async () => {
                await signOut(auth);
                switchTab('learn');
                showToast('Sessió tancada correctament');
            }
        });
    } else {
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
            showToast('Sessió iniciada!', 'success');
        } catch (e) {
            showToast('No s\'ha pogut iniciar sessió', 'error');
        }
    }
}

// ==========================================
// SISTEMA DE REFERITS I DESBLOQUEIG PRO
// ==========================================
function openProModal() {
    if (isUserPro()) {
        showModal({
            icon: '💎',
            title: 'Tens Oppostest PRO Actiu!',
            text: 'Gaudeix d\'accés il·limitat a tots els Simulacres Oficials (30 preguntes, 35 minuts) i al Top Fallades de Catalunya.',
            cancelText: null,
            confirmText: 'Genial!'
        });
        return;
    }
    showModal({
        icon: '💎',
        title: 'Desbloqueja el Mode PRO Gratis',
        text: 'Pots desbloquejar tots els Simulacres Oficials i el Top Fallades convidant 3 companys d\'oposició a la pestanya "Lliga".',
        confirmText: 'Anar a Convidar Amics',
        onConfirm: () => switchTab('ranking')
    });
}

function copyReferralLink() {
    if (!currentUser) {
        showToast('Inicia sessió amb Google primer per obtenir el teu codi!', 'error');
        return;
    }
    navigator.clipboard.writeText(currentUser.uid);
    showToast(`Codi (${currentUser.uid}) copiat al porta-retalls!`, 'success');
}

async function redeemFriendCode() {
    if (!currentUser) {
        showToast('Inicia sessió amb Google abans de validar un codi!', 'error');
        return;
    }
    if (userStats.redeemedFriend) {
        showToast('Ja has validat el codi d\'un amic anteriorment.', 'error');
        return;
    }
    const friendUid = document.getElementById('friend-code-input').value.trim();
    if (!friendUid || friendUid === currentUser.uid) {
        showToast('Introdueix un codi d\'amic vàlid (diferent del teu).', 'error');
        return;
    }

    try {
        const friendRef = doc(db, "users", friendUid);
        const snap = await getDoc(friendRef);
        if (!snap.exists()) {
            showToast('No existeix cap usuari amb aquest codi.', 'error');
            return;
        }
        const friendData = snap.data();
        const currentCount = typeof friendData.unlockedExams === 'number' ? friendData.unlockedExams : (friendData.unlockedExams === true ? 3 : 0);
        const newCount = currentCount + 1;

        await updateDoc(friendRef, { unlockedExams: newCount });

        userStats.redeemedFriend = true;
        userStats.xp += 50;
        await saveStats();
        showToast('🎉 Codi validat! El teu amic suma +1 invitació i tu guanyes +50 XP!', 'success');
    } catch (e) {
        showToast('Error validant el codi.', 'error');
    }
}

// ==========================================
// CÀRREGA EN PARAL·LEL DES DE FIRESTORE
// ==========================================
async function loadSingleTopicCode(code, forceRefresh = false) {
    if (!forceRefresh && questionCache[code] && questionCache[code].length > 0) {
        return questionCache[code];
    }

    const localBankKey = `oppostest_bank_${code}`;
    if (!forceRefresh) {
        const cachedLocal = localStorage.getItem(localBankKey);
        if (cachedLocal) {
            try {
                const parsed = JSON.parse(cachedLocal);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    questionCache[code] = parsed;
                    return parsed;
                }
            } catch (e) {}
        }
    }

    let loaded = [];
    try {
        const bankSnap = await getDoc(doc(db, "mossos_custom_questions", `bank_${code}`));
        if (bankSnap.exists() && Array.isArray(bankSnap.data().questions)) {
            loaded = bankSnap.data().questions;
        }
    } catch (e) {}

    if (loaded.length > 0) {
        questionCache[code] = loaded;
        try { localStorage.setItem(localBankKey, JSON.stringify(loaded)); } catch (e) {}
    }
    return loaded;
}

async function fetchQuestionsFromCodes(codes, forceRefresh = false) {
    const results = await Promise.all(codes.map(code => loadSingleTopicCode(code, forceRefresh)));
    return results.flat();
}

function clearLocalBankCache(code) {
    delete questionCache[code];
    localStorage.removeItem(`oppostest_bank_${code}`);
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ==========================================
// SALA DE SIMULACRES, CONFIGURADOR A MIDA I REPÀS
// ==========================================
function checkProAccessOrTrial(callback) {
    if (isUserPro()) {
        callback();
        return;
    }
    if ((userStats.freeProTrialsUsed || 0) < 1) {
        showModal({
            icon: '🎁',
            title: 'Prova Gratuïta de Mode PRO',
            text: 'Aquest és un mode exclusiu PRO. Et regalem 1 examen oficial de prova gratuït!',
            confirmText: 'Començar Prova Gratis',
            onConfirm: () => {
                userStats.freeProTrialsUsed = 1;
                saveStats();
                callback();
            }
        });
    } else {
        openProModal();
    }
}

function renderSimulacreHub() {
    const listEl = document.getElementById('simulacre-history-list');
    const badgeEl = document.getElementById('sim-avg-badge');
    const history = userStats.simulacreHistory || [];

    if (!history.length) {
        badgeEl.textContent = 'Mitjana: 0.00';
        listEl.innerHTML = '<p class="muted-sm">Encara no has completat cap Simulacre Oficial.</p>';
        return;
    }

    const avg = (history.reduce((a, b) => a + Number(b.grade), 0) / history.length).toFixed(2);
    badgeEl.textContent = `Mitjana: ${avg}`;
    listEl.innerHTML = '';

    history.slice(0, 10).forEach(h => {
        const isPass = Number(h.grade) >= 5;
        const row = document.createElement('div');
        row.className = 'rank-row';
        row.innerHTML = `
            <div>
                <strong>${isPass ? '✅ APTE' : '❌ NO APTE'} · Nota: ${h.grade}</strong><br>
                <small class="muted-sm">${h.date} · ✅ ${h.ok} · ❌ ${h.ko} · ⚪ ${h.blank}</small>
            </div>
            <span class="tag-pill">${h.grade}/10</span>
        `;
        listEl.appendChild(row);
    });
}

function launchOfficialSimulacre() {
    checkProAccessOrTrial(async () => {
        const q = await fetchQuestionsFromCodes(ALL_FILES);
        if (!q.length) return showToast('No s\'han pogut carregar les preguntes.', 'error');
        initQuiz('simulacre', '⏱️ SIMULACRE OFICIAL (30 preg · 35 min)', shuffle(q).slice(0, EXAM_QUESTIONS_COUNT), EXAM_DURATION_SECONDS, null, 'tab-simulacre');
    });
}

// Configurador de Test a Mida (estil mossosquiz.cat)
function openCustomTestModal() {
    showModal({
        icon: '⚙️',
        title: 'Configurador de Test a Mida',
        html: `
            <div style="text-align:left;">
                <label class="form-label">1. Selecciona el Bloc o Àmbit:</label>
                <select id="custom-ambit-sel" class="duo-input">
                    <option value="ALL">Tots els Àmbits (A + B + C)</option>
                    <option value="A">Només Àmbit A (Coneixements de l'entorn)</option>
                    <option value="B">Només Àmbit B (Institucional)</option>
                    <option value="C">Només Àmbit C (Seguretat i Policia)</option>
                </select>
                <label class="form-label mt-2">2. Nombre de preguntes:</label>
                <select id="custom-count-sel" class="duo-input">
                    <option value="10">10 preguntes (Ràpid)</option>
                    <option value="20" selected>20 preguntes (Estàndard)</option>
                    <option value="30">30 preguntes (Format Examen)</option>
                    <option value="50">50 preguntes (Intensiu)</option>
                </select>
                <label class="form-label mt-2">3. Mode de correcció:</label>
                <select id="custom-mode-sel" class="duo-input">
                    <option value="study">Correcció al moment (Mode Estudi)</option>
                    <option value="simulacre">Correcció al final i navegable (Mode Examen)</option>
                </select>
            </div>
        `,
        confirmText: 'Començar Test a Mida',
        onConfirm: async () => {
            const ambitVal = document.getElementById('custom-ambit-sel').value;
            const countVal = parseInt(document.getElementById('custom-count-sel').value, 10);
            const modeVal = document.getElementById('custom-mode-sel').value;

            const codes = ambitVal === 'ALL' ? ALL_FILES : TOPICS[ambitVal];
            const q = await fetchQuestionsFromCodes(codes);
            if (!q.length) return showToast('No hi ha preguntes disponibles.', 'error');

            const selected = shuffle(q).slice(0, countVal);
            const timer = modeVal === 'simulacre' ? countVal * 70 : 0;
            initQuiz(modeVal, `⚙️ TEST A MIDA (${countVal} preg)`, selected, timer, null, 'tab-learn');
        }
    });
}

function renderErrorsHub() {
    const errCount = (userStats.failedQuestions || []).length;
    const savedCount = (userStats.savedQuestions || []).length;

    const errTitle = document.getElementById('errors-hub-title');
    const errBtn = document.getElementById('btn-start-errors-now');
    if (errCount === 0) {
        errTitle.textContent = '🎉 0 Errors Pendents!';
        errBtn.textContent = 'CAP ERROR PER REPASSAR';
        errBtn.disabled = true;
    } else {
        errTitle.textContent = `🧠 ${errCount} Errors Pendents`;
        errBtn.textContent = `REPASSAR ${errCount} ERRORS ARA →`;
        errBtn.disabled = false;
    }

    const savTitle = document.getElementById('saved-hub-title');
    const savBtn = document.getElementById('btn-start-saved-now');
    if (savedCount === 0) {
        savTitle.textContent = '⭐ 0 Preguntes Guardades';
        savBtn.textContent = 'PREM "☆ GUARDAR" EN QUALSEVOL TEST';
        savBtn.disabled = true;
    } else {
        savTitle.textContent = `⭐ ${savedCount} Preguntes Guardades`;
        savBtn.textContent = `REPASSAR ${savedCount} GUARDADES ARA →`;
        savBtn.disabled = false;
    }
}

function launchErrorsQuiz() {
    if (!userStats.failedQuestions.length) return;
    initQuiz('errors', '🧠 REPÀS D\'ERRORS', shuffle(userStats.failedQuestions), 0, null, 'tab-errors');
}

function launchSavedQuiz() {
    if (!userStats.savedQuestions.length) return;
    initQuiz('study', '⭐ PREGUNTES GUARDADES', shuffle(userStats.savedQuestions), 0, null, 'tab-errors');
}

async function startTopic(code) {
    const q = await fetchQuestionsFromCodes([code]);
    if (!q.length) return showToast(`No hi ha preguntes disponibles al Tema ${code.toUpperCase()}`, 'error');
    initQuiz('study', `TEMA ${code.toUpperCase()}`, shuffle(q).slice(0, 20), 0, code, 'tab-learn');
}

async function startAmbit(letter) {
    const q = await fetchQuestionsFromCodes(TOPICS[letter]);
    if (!q.length) return;
    initQuiz('study', `ÀMBIT ${letter}`, shuffle(q).slice(0, 25), 0, null, 'tab-learn');
}

async function startSurvival() {
    const q = await fetchQuestionsFromCodes(ALL_FILES);
    if (!q.length) return;
    initQuiz('survival', '🔥 MODE SUPERVIVÈNCIA', shuffle(q), 0, null, 'tab-learn');
}

function startCommunityFailures() {
    checkProAccessOrTrial(async () => {
        try {
            const snap = await getDoc(doc(db, "metrics", "top_failed"));
            if (snap.exists() && Array.isArray(snap.data().questions) && snap.data().questions.length >= 5) {
                initQuiz('study', '☠️ TOP FALLADES CATALUNYA', shuffle(snap.data().questions).slice(0, 25), 0, null, 'tab-learn');
                return;
            }
        } catch (e) {}
        const q = await fetchQuestionsFromCodes(ALL_FILES);
        initQuiz('study', '☠️ TOP FALLADES CATALUNYA', shuffle(q).slice(0, 25), 0, null, 'tab-learn');
    });
}

// ==========================================
// MOTOR DEL TEST + NAVEGADOR D'EXAMEN + GUARDAR PREGUNTA ⭐
// ==========================================
function initQuiz(mode, title, questions, timerSeconds = 0, topicCode = null, originTab = 'tab-learn') {
    clearInterval(quizState.timerInterval);

    quizState = {
        mode, topicCode, originTab, title, questions,
        currentIndex: 0, correct: 0, wrong: 0, blank: 0, streak: 0,
        userAnswers: [],
        simulacreAnswers: new Array(questions.length).fill(null),
        simulacreDoubts: new Array(questions.length).fill(false),
        timerInterval: null, secondsLeft: timerSeconds
    };

    openView('view-quiz', originTab);
    document.getElementById('quiz-badge').textContent = title;

    const timerEl = document.getElementById('quiz-timer');
    const simNavPanel = document.getElementById('simulacre-nav-panel');
    const simControls = document.getElementById('simulacre-controls');
    const studyControls = document.getElementById('study-controls');

    if (mode === 'simulacre') {
        timerEl.classList.remove('hidden');
        simNavPanel.classList.remove('hidden');
        simControls.classList.remove('hidden');
        studyControls.classList.add('hidden');
        startTimer();
        renderSimulacreGrid();
    } else {
        timerEl.classList.add('hidden');
        simNavPanel.classList.add('hidden');
        simControls.classList.add('hidden');
        studyControls.classList.remove('hidden');
    }

    renderQuestion();
}

function toggleSaveCurrentQuestion() {
    const q = quizState.questions[quizState.currentIndex];
    if (!q) return;
    const idx = userStats.savedQuestions.findIndex(item => item.question === q.question);
    if (idx >= 0) {
        userStats.savedQuestions.splice(idx, 1);
        showToast('Pregunta eliminada de Guardades');
    } else {
        userStats.savedQuestions.push(q);
        showToast('⭐ Pregunta guardada al teu repàs!', 'success');
    }
    saveStats();
    updateStarButtonState();
}

function updateStarButtonState() {
    const q = quizState.questions[quizState.currentIndex];
    const starBtn = document.getElementById('btn-save-star');
    if (!q || !starBtn) return;
    const isSaved = userStats.savedQuestions.some(item => item.question === q.question);
    starBtn.textContent = isSaved ? '⭐ Guardada' : '☆ Guardar';
    starBtn.classList.toggle('saved', isSaved);
}

function renderSimulacreGrid() {
    if (quizState.mode !== 'simulacre') return;
    const grid = document.getElementById('simulacre-nav-grid');
    grid.innerHTML = '';

    quizState.questions.forEach((_, idx) => {
        const btn = document.createElement('button');
        const isCurrent = idx === quizState.currentIndex;
        const isAnswered = quizState.simulacreAnswers[idx] !== null;
        const isDoubt = quizState.simulacreDoubts[idx];

        let cls = 'sim-q-pill';
        if (isDoubt) cls += ' doubt';
        else if (isAnswered) cls += ' answered';
        if (isCurrent) cls += ' current';

        btn.className = cls;
        btn.textContent = idx + 1;
        btn.onclick = () => jumpToQuestion(idx);
        grid.appendChild(btn);
    });
}

function jumpToQuestion(index) {
    if (index < 0 || index >= quizState.questions.length) return;
    quizState.currentIndex = index;
    renderQuestion();
}

function prevQuestion() {
    if (quizState.currentIndex > 0) {
        quizState.currentIndex--;
        renderQuestion();
    }
}

function toggleDoubtCurrent() {
    if (quizState.mode !== 'simulacre') return;
    const idx = quizState.currentIndex;
    quizState.simulacreDoubts[idx] = !quizState.simulacreDoubts[idx];
    renderSimulacreGrid();
    renderQuestion();
}

function clearCurrentAnswer() {
    if (quizState.mode !== 'simulacre') return;
    quizState.simulacreAnswers[quizState.currentIndex] = null;
    renderSimulacreGrid();
    renderQuestion();
}

function startTimer() {
    updateTimerText();
    quizState.timerInterval = setInterval(() => {
        quizState.secondsLeft--;
        updateTimerText();
        if (quizState.secondsLeft <= 0) {
            clearInterval(quizState.timerInterval);
            showToast('⏰ Temps esgotat!', 'error');
            finishQuiz();
        }
    }, 1000);
}

function updateTimerText() {
    const m = Math.floor(quizState.secondsLeft / 60).toString().padStart(2, '0');
    const s = (quizState.secondsLeft % 60).toString().padStart(2, '0');
    document.getElementById('quiz-timer').textContent = `${m}:${s}`;
}

function renderQuestion() {
    const q = quizState.questions[quizState.currentIndex];
    const total = quizState.mode === 'survival' ? '∞' : quizState.questions.length;
    document.getElementById('quiz-counter').textContent = `${quizState.currentIndex + 1}/${total}`;

    let pct = 100;
    if (quizState.mode === 'simulacre') {
        const answeredCount = quizState.simulacreAnswers.filter(a => a !== null).length;
        pct = (answeredCount / quizState.questions.length) * 100;
    } else if (quizState.mode !== 'survival') {
        pct = (quizState.currentIndex / quizState.questions.length) * 100;
    }
    document.getElementById('quiz-progress-bar').style.width = `${pct}%`;

    document.getElementById('question-text').textContent = `${quizState.currentIndex + 1}. ${q.question}`;
    document.getElementById('feedback-content').classList.add('hidden');
    document.getElementById('btn-next').classList.add('hidden');
    updateStarButtonState();

    if (quizState.mode === 'simulacre') {
        document.getElementById('btn-prev-q').disabled = quizState.currentIndex === 0;
        const doubtBtn = document.getElementById('btn-doubt-q');
        doubtBtn.textContent = quizState.simulacreDoubts[quizState.currentIndex] ? '🟡 Amb Dubte' : '❓ Dubte';
        renderSimulacreGrid();
    }

    const container = document.getElementById('options-container');
    container.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D'];
    const currentSimSelection = quizState.simulacreAnswers[quizState.currentIndex];

    q.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'duo-opt';
        if (quizState.mode === 'simulacre' && currentSimSelection === opt) {
            btn.classList.add('selected-sim');
        }
        btn.innerHTML = `<span class="opt-key">${letters[i]}</span> <span>${opt}</span>`;
        btn.onclick = () => selectAnswer(opt, btn);
        container.appendChild(btn);
    });
}

async function selectAnswer(selected, btn) {
    const q = quizState.questions[quizState.currentIndex];

    if (quizState.mode === 'simulacre') {
        if (quizState.simulacreAnswers[quizState.currentIndex] === selected) {
            quizState.simulacreAnswers[quizState.currentIndex] = null;
        } else {
            quizState.simulacreAnswers[quizState.currentIndex] = selected;
        }
        renderQuestion();
        return;
    }

    const isCorrect = selected.trim() === q.correctAnswer.trim();
    quizState.userAnswers.push({ question: q, selected, isCorrect });

    if (isCorrect) {
        quizState.correct++;
        quizState.streak++;
        userStats.xp += 10;
        if (quizState.mode === 'survival' && quizState.streak > userStats.bestStreak) {
            userStats.bestStreak = quizState.streak;
        }
        if (quizState.mode === 'errors') {
            userStats.failedQuestions = userStats.failedQuestions.filter(item => item.question !== q.question);
        }
    } else {
        quizState.wrong++;
        if (!userStats.failedQuestions.some(item => item.question === q.question)) {
            userStats.failedQuestions.push(q);
        }
        recordCommunityFailure(q);
    }

    document.querySelectorAll('.duo-opt').forEach(b => {
        b.disabled = true;
        const txt = b.querySelector('span:last-child').textContent.trim();
        if (txt === q.correctAnswer.trim()) b.classList.add('correct');
    });
    if (!isCorrect) btn.classList.add('wrong');

    const fb = document.getElementById('feedback-content');
    fb.classList.remove('hidden');
    document.getElementById('feedback-title').textContent = isCorrect ? '✅ Resposta Correcta! (+10 XP)' : '❌ Resposta Incorrecta';
    document.getElementById('feedback-explanation').textContent = q.explanation || '';

    const nextBtn = document.getElementById('btn-next');
    nextBtn.classList.remove('hidden');
    if (quizState.mode === 'survival' && !isCorrect) {
        nextBtn.textContent = 'VEURE RESULTAT';
        nextBtn.onclick = finishQuiz;
    } else {
        nextBtn.textContent = 'CONTINUAR (Enter)';
        nextBtn.onclick = nextQuestion;
    }
}

function confirmFinishSimulacre() {
    const answered = quizState.simulacreAnswers.filter(a => a !== null).length;
    const blanks = quizState.questions.length - answered;
    const doubts = quizState.simulacreDoubts.filter(Boolean).length;

    showModal({
        icon: '📝',
        title: 'Vols entregar i corregir l\'examen?',
        html: `
            <div class="user-detail-grid">
                <div class="u-stat-box"><small>Contestades</small><strong>✅ ${answered}</strong></div>
                <div class="u-stat-box"><small>En blanc</small><strong>⚪ ${blanks}</strong></div>
            </div>
            ${doubts > 0 ? `<p style="color:var(--gold); font-weight:800;">⚠️ Encara tens ${doubts} pregunta(es) marcada amb dubte.</p>` : ''}
        `,
        confirmText: 'Corregir Examen Ara',
        cancelText: 'Seguir Revisant',
        onConfirm: () => finishQuiz()
    });
}

async function recordCommunityFailure(questionObj) {
    if (!currentUser) return;
    try {
        const ref = doc(db, "metrics", "top_failed");
        const snap = await getDoc(ref);
        let list = snap.exists() ? (snap.data().questions || []) : [];
        if (!list.some(item => item.question === questionObj.question)) {
            list.unshift(questionObj);
            if (list.length > 60) list = list.slice(0, 60);
            await setDoc(ref, { questions: list, updatedAt: Date.now() }, { merge: true });
        }
    } catch (e) {}
}

function nextQuestion() {
    if (quizState.mode === 'simulacre') {
        if (quizState.currentIndex < quizState.questions.length - 1) {
            quizState.currentIndex++;
            renderQuestion();
        } else {
            confirmFinishSimulacre();
        }
        return;
    }

    quizState.currentIndex++;
    if (quizState.currentIndex >= quizState.questions.length) {
        finishQuiz();
    } else {
        renderQuestion();
    }
}

function finishQuiz() {
    clearInterval(quizState.timerInterval);
    recordDailyStudy();

    if (quizState.mode === 'simulacre') {
        quizState.correct = 0;
        quizState.wrong = 0;
        quizState.blank = 0;
        quizState.userAnswers = [];

        quizState.questions.forEach((q, idx) => {
            const chosen = quizState.simulacreAnswers[idx];
            if (chosen === null) {
                quizState.blank++;
                quizState.userAnswers.push({ question: q, selected: null, isCorrect: false });
            } else {
                const isOk = chosen.trim() === q.correctAnswer.trim();
                if (isOk) {
                    quizState.correct++;
                    userStats.xp += 10;
                } else {
                    quizState.wrong++;
                    if (!userStats.failedQuestions.some(item => item.question === q.question)) {
                        userStats.failedQuestions.push(q);
                    }
                    recordCommunityFailure(q);
                }
                quizState.userAnswers.push({ question: q, selected: chosen, isCorrect: isOk });
            }
        });
    }

    const total = quizState.mode === 'survival' ? (quizState.correct + quizState.wrong) : quizState.questions.length;
    const net = Math.max(0, quizState.correct - (quizState.wrong / 3));
    const gradeNum = total > 0 ? (net / total) * 10 : 0;

    if (quizState.topicCode) {
        userStats.topicScores = userStats.topicScores || {};
        userStats.topicScores[quizState.topicCode] = gradeNum;
    }

    if (quizState.mode === 'simulacre') {
        userStats.simulacreHistory = userStats.simulacreHistory || [];
        userStats.simulacreHistory.unshift({
            date: new Date().toLocaleDateString('ca-ES'),
            grade: gradeNum.toFixed(2),
            ok: quizState.correct,
            ko: quizState.wrong,
            blank: quizState.blank
        });
        if (userStats.simulacreHistory.length > 20) userStats.simulacreHistory.pop();
    }

    saveStats();

    openView('view-results', quizState.originTab);
    document.getElementById('res-mode-title').textContent = quizState.title;
    document.getElementById('res-score').textContent = quizState.mode === 'survival' ? `${quizState.correct}🔥` : gradeNum.toFixed(2);
    document.getElementById('res-ok').textContent = quizState.correct;
    document.getElementById('res-ko').textContent = quizState.wrong;
    document.getElementById('res-blank').textContent = quizState.blank;

    const rev = document.getElementById('review-container');
    rev.innerHTML = '';
    quizState.userAnswers.filter(a => !a.isCorrect).forEach((item) => {
        const d = document.createElement('div');
        d.className = 'rank-row';
        d.style.flexDirection = 'column';
        d.style.alignItems = 'flex-start';
        d.innerHTML = `
            <p><strong>${item.question.question}</strong></p>
            <small style="color:var(--red)">La teva: ${item.selected || 'En blanc'}</small>
            <small style="color:var(--green)">Correcta: ${item.question.correctAnswer}</small>
            <small style="color:var(--muted)">💡 ${item.question.explanation || ''}</small>
        `;
        rev.appendChild(d);
    });
}

function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        const quizVisible = !document.getElementById('view-quiz').classList.contains('hidden');
        if (!quizVisible) return;

        if (quizState.mode === 'simulacre') {
            if (e.key === 'ArrowRight') { nextQuestion(); return; }
            if (e.key === 'ArrowLeft') { prevQuestion(); return; }
        }

        const nextBtn = document.getElementById('btn-next');
        if (e.key === 'Enter' && !nextBtn.classList.contains('hidden')) {
            nextBtn.click();
            return;
        }

        const keyMap = { '1': 0, '2': 1, '3': 2, '4': 3, 'a': 0, 'b': 1, 'c': 2, 'd': 3 };
        const idx = keyMap[e.key.toLowerCase()];
        if (idx !== undefined) {
            const buttons = document.querySelectorAll('.duo-opt');
            if (buttons[idx] && !buttons[idx].disabled) buttons[idx].click();
        }
    });
}

// ==========================================
// REPORTAR PREGUNTA, LLIGA I ESDEVENIMENTS
// ==========================================
function reportCurrentQuestion() {
    const q = quizState.questions[quizState.currentIndex];
    showModal({
        icon: '🚩',
        title: 'Reportar Error a la Pregunta',
        text: 'Explica breument quin error has detectat perquè el CEO ho revisi:',
        showInput: true,
        placeholder: 'Ex: La resposta correcta hauria de ser la B...',
        confirmText: 'Enviar Report',
        onConfirm: async (reason) => {
            if (!reason) return;
            await addDoc(collection(db, "reports"), {
                question: q.question,
                reason,
                user: currentUser?.email || 'Anònim',
                createdAt: Date.now()
            });
            showToast('Gràcies! Report enviat al Panel CEO.', 'success');
        }
    });
}

async function loadRanking() {
    const list = document.getElementById('ranking-list');
    list.innerHTML = '<p class="muted-sm">Carregant classificació...</p>';
    try {
        const q = query(collection(db, "users"), orderBy("xp", "desc"), limit(20));
        const snap = await getDocs(q);
        list.innerHTML = '';
        let pos = 1;
        snap.forEach(d => {
            const u = d.data();
            if (u.banned) return;
            const row = document.createElement('div');
            row.className = 'rank-row';
            const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `#${pos}`;
            const isPro = u.unlockedExams === true || u.unlockedExams >= 3;
            row.innerHTML = `
                <span>${medal} ${u.avatar || '👮‍♂️'} ${u.displayName || 'Opositor'} ${isPro ? '💎' : ''} <small class="muted-sm">${u.goal ? `· ${u.goal}` : ''}</small></span>
                <span>🔥 ${u.dailyStreak || 0}d · ⚡ ${u.xp || 0} XP</span>
            `;
            list.appendChild(row);
            pos++;
        });
    } catch (e) {
        list.innerHTML = '<p class="muted-sm">Error carregant la lliga.</p>';
    }
}

async function loadLiveEventBanner() {
    try {
        const snap = await getDoc(doc(db, "mossos_events", "active"));
        const banner = document.getElementById('live-event-banner');
        if (snap.exists() && snap.data().active) {
            document.getElementById('live-event-title').textContent = snap.data().title;
            document.getElementById('live-event-desc').textContent = snap.data().desc;
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }
    } catch (e) {}
}

async function startLiveEvent() {
    const q = await fetchQuestionsFromCodes(ALL_FILES);
    if (!q.length) return;
    initQuiz('simulacre', '🔴 ESDEVENIMENT OFICIAL EN VIU', shuffle(q).slice(0, EXAM_QUESTIONS_COUNT), EXAM_DURATION_SECONDS, null, 'tab-simulacre');
}

// ==========================================
// PANEL CEO: GESTOR D'ARXIUS I PREGUNTES EN FIRESTORE
// ==========================================
async function ceoLoadBanksStatus() {
    if (currentUser?.email.toLowerCase() !== CEO_EMAIL.toLowerCase()) return;
    const grid = document.getElementById('ceo-banks-grid');
    grid.innerHTML = '<p class="muted-sm">Comprovant els 20 arxius a Firestore...</p>';

    try {
        const snap = await getDocs(collection(db, "mossos_custom_questions"));
        const firestoreMap = {};
        snap.forEach(d => {
            if (d.id.startsWith('bank_')) {
                const code = d.id.replace('bank_', '');
                firestoreMap[code] = d.data();
            }
        });

        grid.innerHTML = '';
        ALL_FILES.forEach(code => {
            const bankDoc = firestoreMap[code];
            const isOnline = bankDoc && Array.isArray(bankDoc.questions);
            const qCount = isOnline ? bankDoc.questions.length : 0;

            const card = document.createElement('div');
            card.className = `bank-card ${isOnline ? 'online' : ''}`;
            card.innerHTML = `
                <div class="bank-head">
                    <strong>Tema ${code.toUpperCase()}</strong>
                    <span class="bank-status">${isOnline ? `☁️ ${qCount} preg.` : '📁 Buit'}</span>
                </div>
                <div class="bank-actions">
                    <button class="btn-3d btn-blue btn-sm" onclick="triggerUploadJson('${code}')">📤 Pujar JSON</button>
                    <button class="btn-3d btn-white btn-sm" onclick="openTopicManager('${code}')">👁️ Preguntes</button>
                    <button class="btn-3d btn-gray btn-sm" onclick="ceoDownloadBackup('${code}')">📥 Còpia</button>
                    <button class="btn-3d btn-red btn-sm" onclick="ceoDeleteBank('${code}')">🗑️ Eliminar</button>
                </div>
            `;
            grid.appendChild(card);
        });
    } catch (e) {
        grid.innerHTML = '<p class="muted-sm">Error llegint la col·lecció de Firestore.</p>';
    }
}

function triggerUploadJson(code) {
    currentUploadTargetCode = code;
    const uploader = document.getElementById('ceo-file-uploader');
    uploader.value = '';
    uploader.click();
}

async function handleJsonFileUpload(event) {
    const file = event.target.files[0];
    if (!file || !currentUploadTargetCode) return;

    const code = currentUploadTargetCode;
    try {
        const text = await file.text();
        const parsed = JSON.parse(text);

        if (!Array.isArray(parsed) || parsed.length === 0 || !parsed[0].question || !parsed[0].options) {
            showToast('El fitxer JSON no té el format correcte de preguntes.', 'error');
            return;
        }

        await setDoc(doc(db, "mossos_custom_questions", `bank_${code}`), {
            topic: code,
            questions: parsed,
            updatedAt: Date.now()
        });

        clearLocalBankCache(code);
        showToast(`✅ Tema ${code.toUpperCase()} actualitzat amb ${parsed.length} preguntes!`, 'success');
        ceoLoadBanksStatus();
    } catch (e) {
        showToast('Error llegint o pujant el fitxer JSON.', 'error');
    }
}

function ceoDeleteBank(code) {
    showModal({
        icon: '🗑️',
        title: `Eliminar Tema ${code.toUpperCase()} de Firestore?`,
        text: `S'esborrarà el document bank_${code} del núvol. Podràs tornar a pujar un JSON nou quan vulguis.`,
        confirmText: 'Sí, Eliminar',
        onConfirm: async () => {
            await deleteDoc(doc(db, "mossos_custom_questions", `bank_${code}`));
            clearLocalBankCache(code);
            showToast(`Tema ${code.toUpperCase()} eliminat de Firestore`, 'info');
            ceoLoadBanksStatus();
        }
    });
}

async function ceoDownloadBackup(code) {
    const questions = await fetchQuestionsFromCodes([code], true);
    if (!questions.length) {
        showToast(`No hi ha preguntes al Tema ${code.toUpperCase()} per descarregar`, 'error');
        return;
    }
    const blob = new Blob([JSON.stringify(questions, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `preguntas-${code}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Còpia preguntas-${code}.json descarregada!`, 'success');
}

async function openTopicManager(code) {
    currentManagedTopicCode = code;
    document.getElementById('ceo-topic-modal-title').textContent = `Gestor de Preguntes · Tema ${code.toUpperCase()}`;
    document.getElementById('ceo-search-q').value = '';
    document.getElementById('ceo-topic-modal').classList.remove('hidden');

    const listEl = document.getElementById('ceo-topic-questions-list');
    listEl.innerHTML = '<p class="muted-sm">Carregant preguntes...</p>';

    currentManagedQuestions = await fetchQuestionsFromCodes([code], true);
    renderManagedTopicQuestions(currentManagedQuestions);
}

function closeTopicManager() {
    document.getElementById('ceo-topic-modal').classList.add('hidden');
}

// CORREGIT: Sempre esborra l'índex real encara que estiguis filtrant amb el cercador
function renderManagedTopicQuestions(questionsArray) {
    const listEl = document.getElementById('ceo-topic-questions-list');
    listEl.innerHTML = '';

    if (!questionsArray.length) {
        listEl.innerHTML = '<p class="muted-sm">No s\'han trobat preguntes.</p>';
        return;
    }

    questionsArray.forEach((q) => {
        const realIndex = currentManagedQuestions.indexOf(q);
        const item = document.createElement('div');
        item.className = 'q-edit-item';
        item.innerHTML = `
            <div>
                <strong>${realIndex + 1}. ${q.question}</strong>
                <div class="muted-sm mt-2">✅ Correcta: <b>${q.correctAnswer}</b></div>
            </div>
            <button class="btn-3d btn-red btn-sm" onclick="deleteSingleQuestionFromTopic(${realIndex})">🗑️</button>
        `;
        listEl.appendChild(item);
    });
}

function filterTopicQuestions() {
    const term = document.getElementById('ceo-search-q').value.toLowerCase().trim();
    if (!term) {
        renderManagedTopicQuestions(currentManagedQuestions);
        return;
    }
    const filtered = currentManagedQuestions.filter(q => q.question.toLowerCase().includes(term));
    renderManagedTopicQuestions(filtered);
}

async function deleteSingleQuestionFromTopic(realIndex) {
    if (realIndex < 0 || realIndex >= currentManagedQuestions.length) return;
    const code = currentManagedTopicCode;
    currentManagedQuestions.splice(realIndex, 1);
    await setDoc(doc(db, "mossos_custom_questions", `bank_${code}`), {
        topic: code,
        questions: currentManagedQuestions,
        updatedAt: Date.now()
    });
    clearLocalBankCache(code);
    filterTopicQuestions();
    ceoLoadBanksStatus();
    showToast('Pregunta eliminada del tema!', 'success');
}

function openAddQuestionToCurrentTopic() {
    const code = currentManagedTopicCode;
    closeTopicManager();
    showModal({
        icon: '➕',
        title: `Afegir Pregunta al Tema ${code.toUpperCase()}`,
        html: `
            <input id="new-q-title" class="duo-input" placeholder="Enunciat de la pregunta">
            <input id="new-q-ok" class="duo-input" placeholder="Opció Correcta">
            <input id="new-q-ko1" class="duo-input" placeholder="Opció Incorrecta 1">
            <input id="new-q-ko2" class="duo-input" placeholder="Opció Incorrecta 2">
            <input id="new-q-ko3" class="duo-input" placeholder="Opció Incorrecta 3">
            <input id="new-q-exp" class="duo-input" placeholder="Explicació oficial">
        `,
        confirmText: 'Guardar al Tema',
        onConfirm: async () => {
            const question = document.getElementById('new-q-title').value.trim();
            const o1 = document.getElementById('new-q-ok').value.trim();
            const o2 = document.getElementById('new-q-ko1').value.trim();
            const o3 = document.getElementById('new-q-ko2').value.trim();
            const o4 = document.getElementById('new-q-ko3').value.trim();
            const explanation = document.getElementById('new-q-exp').value.trim();

            if (!question || !o1 || !o2) {
                showToast('Falten dades de la pregunta', 'error');
                return;
            }
            currentManagedQuestions.unshift({
                question,
                options: shuffle([o1, o2, o3, o4].filter(Boolean)),
                correctAnswer: o1,
                explanation
            });
            await setDoc(doc(db, "mossos_custom_questions", `bank_${code}`), {
                topic: code,
                questions: currentManagedQuestions,
                updatedAt: Date.now()
            });
            clearLocalBankCache(code);
            ceoLoadBanksStatus();
            showToast(`Pregunta afegida al Tema ${code.toUpperCase()}!`, 'success');
        }
    });
}

// ==========================================
// PANEL CEO: CRM D'USUARIS, DETALLS, PRO I BANEIG
// ==========================================
async function ceoLoadUsers() {
    if (currentUser?.email.toLowerCase() !== CEO_EMAIL.toLowerCase()) return;
    const container = document.getElementById('ceo-users-list');
    container.innerHTML = '<p class="muted-sm">Carregant usuaris...</p>';
    const snap = await getDocs(collection(db, "users"));
    allUsersCache = [];
    snap.forEach(d => allUsersCache.push({ uid: d.id, ...d.data() }));
    renderCeoUsersList(allUsersCache);
}

function ceoFilterUsers() {
    const term = document.getElementById('ceo-user-search').value.toLowerCase().trim();
    if (!term) {
        renderCeoUsersList(allUsersCache);
        return;
    }
    const filtered = allUsersCache.filter(u =>
        (u.email || '').toLowerCase().includes(term) ||
        (u.displayName || '').toLowerCase().includes(term) ||
        u.uid.toLowerCase().includes(term)
    );
    renderCeoUsersList(filtered);
}

function renderCeoUsersList(usersArray) {
    const container = document.getElementById('ceo-users-list');
    container.innerHTML = '';

    usersArray.forEach(u => {
        const isPro = u.unlockedExams === true || u.unlockedExams >= 3;
        const invites = getInvitesCount(u.unlockedExams);
        const isBanned = u.banned === true;

        const div = document.createElement('div');
        div.className = 'admin-row';
        div.innerHTML = `
            <div>
                <strong>${u.avatar || '👮‍♂️'} ${u.displayName || 'Sense nom'}</strong> <small class="muted-sm">(${u.email || u.uid})</small><br>
                <small>⚡ ${u.xp || 0} XP · 🔥 ${u.dailyStreak || 0}d · 👥 Convidats: <b>${invites}</b> · ${isPro ? '💎 PRO' : 'Gratis'} ${isBanned ? '· 🚫 BANEJAT' : ''}</small>
            </div>
            <div class="row-btns">
                <button class="btn-3d btn-blue btn-sm" onclick="ceoInspectUser('${u.uid}')">🔍 Mostrar Detalls</button>
                <button class="btn-3d btn-gold btn-sm" onclick="ceoTogglePro('${u.uid}', ${!isPro})">${isPro ? 'Treure PRO' : 'Donar PRO'}</button>
                <button class="btn-3d ${isBanned ? 'btn-green' : 'btn-red'} btn-sm" onclick="ceoToggleBan('${u.uid}', ${!isBanned})">${isBanned ? 'Desbloquejar' : '🚫 Banejar'}</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function ceoInspectUser(uid) {
    const u = allUsersCache.find(item => item.uid === uid);
    if (!u) return;

    const isPro = u.unlockedExams === true || u.unlockedExams >= 3;
    const invites = getInvitesCount(u.unlockedExams);
    const isBanned = u.banned === true;
    const scoresObj = u.topicScores || {};
    const completedTopics = Object.keys(scoresObj);
    const avgScore = completedTopics.length > 0
        ? (completedTopics.reduce((acc, k) => acc + scoresObj[k], 0) / completedTopics.length).toFixed(2)
        : 'Cap test';

    const lastDate = u.updatedAt ? new Date(u.updatedAt).toLocaleString('ca-ES') : 'Desconegut';

    showModal({
        icon: u.avatar || (isBanned ? '🚫' : '👮‍♂️'),
        title: u.displayName || 'Perfil d\'Usuari',
        html: `
            <div class="muted-sm mb-2">${u.email || 'Sense correu'}<br><strong>${u.goal || ''}</strong><br><code>UID: ${u.uid}</code></div>
            <div class="user-detail-grid">
                <div class="u-stat-box"><small>Estat del Compte</small><strong>${isBanned ? '🚫 BANEJAT' : (isPro ? '💎 PRO ACTIU' : 'GRATIS')}</strong></div>
                <div class="u-stat-box"><small>Persones Convidades</small><strong>👥 ${invites} amics</strong></div>
                <div class="u-stat-box"><small>Experiència i Ratxa</small><strong>⚡ ${u.xp || 0} XP · 🔥 ${u.dailyStreak || 0} dies</strong></div>
                <div class="u-stat-box"><small>Rècord Supervivència</small><strong>🔥 ${u.bestStreak || 0} seguides</strong></div>
                <div class="u-stat-box"><small>Nota Mitjana (${completedTopics.length}/20 temes)</small><strong>📊 ${avgScore}</strong></div>
                <div class="u-stat-box"><small>Errors / Guardades</small><strong>❤️ ${(u.failedQuestions || []).length} · ⭐ ${(u.savedQuestions || []).length}</strong></div>
            </div>
            <small class="muted-sm">Última activitat: ${lastDate}</small>
            <div class="row-btns mt-3" style="justify-content:center;">
                <button class="btn-3d btn-gold btn-sm" onclick="ceoTogglePro('${u.uid}', ${!isPro}); document.getElementById('modal-overlay').classList.add('hidden');">${isPro ? 'Treure PRO' : 'Atorgar PRO'}</button>
                <button class="btn-3d ${isBanned ? 'btn-green' : 'btn-red'} btn-sm" onclick="ceoToggleBan('${u.uid}', ${!isBanned}); document.getElementById('modal-overlay').classList.add('hidden');">${isBanned ? 'Treure Ban' : 'Banejar Compte'}</button>
                <button class="btn-3d btn-gray btn-sm" onclick="ceoDeleteUserAccount('${u.uid}')">🗑️ Esborrar Usuari</button>
            </div>
        `,
        cancelText: null,
        confirmText: 'Tancar Fitxa'
    });
}

async function ceoTogglePro(uid, givePro) {
    await updateDoc(doc(db, "users", uid), { unlockedExams: givePro ? 999 : 0 });
    showToast(givePro ? '💎 PRO atorgat a l\'usuari!' : 'PRO retirat de l\'usuari', 'success');
    ceoLoadUsers();
}

async function ceoToggleBan(uid, banStatus) {
    await updateDoc(doc(db, "users", uid), { banned: banStatus });
    showToast(banStatus ? '🚫 Usuari banejat!' : '✅ Usuari desbloquejat!', banStatus ? 'error' : 'success');
    ceoLoadUsers();
}

function ceoDeleteUserAccount(uid) {
    showModal({
        icon: '⚠️',
        title: 'Esborrar perfil d\'usuari?',
        text: 'Aquesta acció eliminarà totes les estadístiques d\'aquest usuari de Firestore.',
        confirmText: 'Sí, Esborrar',
        onConfirm: async () => {
            await deleteDoc(doc(db, "users", uid));
            showToast('Usuari eliminat de Firestore', 'info');
            ceoLoadUsers();
        }
    });
}

// ==========================================
// PANEL CEO: ALERTES, ESDEVENIMENTS I REPORTS
// ==========================================
async function loadGlobalAlert() {
    try {
        const snap = await getDoc(doc(db, "admin", "global"));
        if (snap.exists() && snap.data().message) {
            document.getElementById('global-alert-text').textContent = snap.data().message;
            document.getElementById('global-alert-banner').classList.remove('hidden');
        }
    } catch (e) {}
}

async function ceoSaveAlert() {
    const msg = document.getElementById('ceo-alert-input').value.trim();
    await setDoc(doc(db, "admin", "global"), { message: msg });
    loadGlobalAlert();
    showToast('Alerta global publicada!', 'success');
}

async function ceoClearAlert() {
    await setDoc(doc(db, "admin", "global"), { message: "" });
    document.getElementById('global-alert-banner').classList.add('hidden');
    showToast('Alerta amagada');
}

async function ceoSaveEvent() {
    const title = document.getElementById('ceo-ev-title').value.trim() || 'Simulacre General de Catalunya';
    const desc = document.getElementById('ceo-ev-desc').value.trim() || '30 preguntes oficials · 35 minuts · Temps real';
    await setDoc(doc(db, "mossos_events", "active"), { active: true, title, desc });
    loadLiveEventBanner();
    showToast('🔴 Esdeveniment en Viu activat!', 'success');
}

async function ceoClearEvent() {
    await setDoc(doc(db, "mossos_events", "active"), { active: false });
    loadLiveEventBanner();
    showToast('Esdeveniment desactivat');
}

async function ceoLoadReports() {
    const container = document.getElementById('ceo-reports-list');
    container.innerHTML = 'Carregant...';
    const snap = await getDocs(collection(db, "reports"));
    container.innerHTML = '';
    if (snap.empty) {
        container.innerHTML = '<p class="muted-sm">No hi ha cap report pendent.</p>';
        return;
    }
    snap.forEach(d => {
        const r = d.data();
        const div = document.createElement('div');
        div.className = 'admin-row';
        div.innerHTML = `
            <div><strong>${r.question}</strong><br><small>${r.reason} (${r.user || ''})</small></div>
            <button class="btn-3d btn-red btn-sm" onclick="ceoDeleteReport('${d.id}')">Esborrar</button>
        `;
        container.appendChild(div);
    });
}

async function ceoDeleteReport(id) {
    await deleteDoc(doc(db, "reports", id));
    showToast('Report eliminat');
    ceoLoadReports();
}

// ==========================================
// NAVEGACIÓ ESTRICTA ENTRE PESTANYES
// ==========================================
function switchTab(tab) {
    clearInterval(quizState.timerInterval);

    if (tab === 'learn') {
        openView('view-learn', 'tab-learn');
        renderTopicNodes();
    } else if (tab === 'simulacre') {
        openView('view-simulacre-hub', 'tab-simulacre');
        renderSimulacreHub();
    } else if (tab === 'errors') {
        openView('view-errors-hub', 'tab-errors');
        renderErrorsHub();
    } else if (tab === 'ranking') {
        openView('view-ranking', 'tab-ranking');
        loadRanking();
    } else if (tab === 'profile') {
        openView('view-profile', 'tab-profile');
        renderProfileView();
    } else if (tab === 'ceo' && currentUser?.email.toLowerCase() === CEO_EMAIL.toLowerCase()) {
        openView('view-ceo', 'tab-ceo');
        ceoLoadBanksStatus();
        ceoLoadUsers();
        ceoLoadReports();
    }
}

function confirmExitQuiz() {
    showModal({
        icon: '⚠️',
        title: 'Sortir de l\'entrenament?',
        text: 'Si surts ara, perdràs el progrés d\'aquest test.',
        confirmText: 'Sí, sortir',
        cancelText: 'Continuar test',
        onConfirm: () => switchTab('learn')
    });
}

// Exposar funcions al DOM
Object.assign(window, {
    switchTab, launchOfficialSimulacre, openCustomTestModal, launchErrorsQuiz, launchSavedQuiz,
    startSurvival, startCommunityFailures, startAmbit, startTopic, startLiveEvent,
    prevQuestion, nextQuestion, jumpToQuestion, toggleDoubtCurrent, clearCurrentAnswer,
    toggleSaveCurrentQuestion, confirmFinishSimulacre, confirmExitQuiz, handleAuthClick,
    forceSignOut, openProModal, copyReferralLink, redeemFriendCode, loadRanking,
    reportCurrentQuestion, selectProfileAvatar, saveUserProfileData, forceReloadQuestionBanks,
    ceoLoadBanksStatus, triggerUploadJson, handleJsonFileUpload, ceoDeleteBank,
    ceoDownloadBackup, openTopicManager, closeTopicManager, filterTopicQuestions,
    deleteSingleQuestionFromTopic, openAddQuestionToCurrentTopic, ceoSaveAlert,
    ceoClearAlert, ceoSaveEvent, ceoClearEvent, ceoLoadReports, ceoDeleteReport,
    ceoLoadUsers, ceoFilterUsers, ceoInspectUser, ceoTogglePro, ceoToggleBan, ceoDeleteUserAccount
});
