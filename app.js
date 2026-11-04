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
    topicScores: {},
    freeProTrialsUsed: 0,
    unlockedExams: 0,
    redeemedFriend: false,
    banned: false
};

let quizState = {
    mode: 'study',
    topicCode: null,
    title: '',
    questions: [],
    currentIndex: 0,
    correct: 0,
    wrong: 0,
    blank: 0,
    streak: 0,
    userAnswers: [],
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
// INICIALITZACIÓ RÀPIDA AMB PRE-CÀRREGA EN PARAL·LEL
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    updateSplashProgress(20, 'Preparant tauler i estadístiques...');
    renderTopicNodes();
    updateStatsUI();
    initFirebaseListeners();
    initKeyboardShortcuts();

    updateSplashProgress(55, 'Carregant els 20 temes oficials en memòria...');
    // Pre-carreguem tots els temes en paral·lel perquè Simulacre sigui instantani!
    await fetchQuestionsFromCodes(ALL_FILES);

    updateSplashProgress(85, 'Sincronitzant esdeveniments i alertes...');
    await Promise.all([loadGlobalAlert(), loadLiveEventBanner()]);

    hideSplashLoader();
});

function setActiveNav(buttonId) {
    document.querySelectorAll('.duo-nav-item').forEach(b => b.classList.remove('active'));
    const target = document.getElementById(buttonId);
    if (target) target.classList.add('active');
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
    document.getElementById('ui-errors').textContent = errCount;
    document.getElementById('sidebar-error-count').textContent = errCount;

    document.getElementById('ui-user-avatar').textContent = userStats.avatar || '👮‍♂️';
    document.getElementById('ui-user-name').textContent = userStats.displayName || 'Convidat';

    const proBadge = document.getElementById('ui-pro-badge');
    const proSideBtn = document.getElementById('btn-pro-sidebar');
    if (isUserPro()) {
        proBadge.textContent = '💎 PRO ACTIU';
        proBadge.classList.add('is-pro');
        proSideBtn.classList.add('hidden');
    } else {
        const count = getInvitesCount(userStats.unlockedExams);
        proBadge.textContent = `GRATIS (${count}/3 amics)`;
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
                failedQuestions: userStats.failedQuestions,
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
// GESTIÓ DE LA PANTALLA DE PERFIL D'USUARI
// ==========================================
function renderProfileView() {
    document.getElementById('profile-big-avatar').textContent = userStats.avatar || '👮‍♂️';
    document.getElementById('profile-display-title').textContent = userStats.displayName || 'Opositor';
    document.getElementById('profile-email-subtitle').textContent = currentUser ? currentUser.email : 'Mode Local (Inicia sessió amb Google per guardar al núvol)';

    document.getElementById('profile-name-input').value = userStats.displayName || '';
    document.getElementById('profile-goal-input').value = userStats.goal || '';

    document.querySelectorAll('.avatar-opt').forEach(btn => {
        btn.classList.toggle('selected', btn.textContent.trim() === (userStats.avatar || '👮‍♂️'));
    });

    // Estadístiques de l'expedient
    const scoresObj = userStats.topicScores || {};
    const keys = Object.keys(scoresObj);
    const avg = keys.length > 0 ? (keys.reduce((a, k) => a + scoresObj[k], 0) / keys.length).toFixed(2) : '0.00';
    const passed = keys.filter(k => scoresObj[k] >= 5).length;

    document.getElementById('prof-stat-pro').textContent = isUserPro() ? '💎 PRO ACTIU' : 'PLA GRATUÏT';
    document.getElementById('prof-stat-invites').textContent = `${getInvitesCount(userStats.unlockedExams)} / 3 amics`;
    document.getElementById('prof-stat-avg').textContent = avg;
    document.getElementById('prof-stat-passed').textContent = `${passed} / 20 temes`;
    document.getElementById('prof-stat-xp').textContent = `${userStats.xp || 0} XP ⚡`;
    document.getElementById('prof-stat-streak').textContent = `${userStats.dailyStreak || 0} dies 🔥`;

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
    showSplashLoader('Sincronitzant els 20 temes amb el núvol...');
    ALL_FILES.forEach(code => clearLocalBankCache(code));
    await fetchQuestionsFromCodes(ALL_FILES, true);
    hideSplashLoader();
    showToast('✅ Temari actualitzat a l\'última versió!', 'success');
}

// ==========================================
// AUTENTICACIÓ, BLOQUEIG BAN I PERFIL CEO
// ==========================================
function initFirebaseListeners() {
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        const authBtn = document.getElementById('btn-auth-trigger');
        const ceoTab = document.getElementById('tab-ceo');
        const refInput = document.getElementById('my-ref-code');

        if (user) {
            authBtn.textContent = "TANCAR SESSIÓ";
            refInput.value = user.uid;

            if (user.email === CEO_EMAIL) {
                ceoTab.classList.remove('hidden');
            } else {
                ceoTab.classList.add('hidden');
            }

            const snap = await getDoc(doc(db, "users", user.uid));
            if (snap.exists()) {
                const data = snap.data();

                if (data.banned === true && user.email !== CEO_EMAIL) {
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
                userStats.failedQuestions = data.failedQuestions || userStats.failedQuestions;
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
        text: 'Pots desbloquejar tots els Simulacres Oficials i el Top Fallades convidant 3 companys d\'oposició a la pestanya "Lliga i PRO".',
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
// CÀRREGA EN PARAL·LEL ULTRA-RÀPIDA (ZERO BLOQUEJOS)
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
    // 1. Intenta llegir el fitxer local primer si és ràpid, o Firestore si s'ha pujat
    try {
        const bankSnap = await getDoc(doc(db, "mossos_custom_questions", `bank_${code}`));
        if (bankSnap.exists() && Array.isArray(bankSnap.data().questions)) {
            loaded = bankSnap.data().questions;
        }
    } catch (e) {}

    if (loaded.length === 0) {
        try {
            const res = await fetch(`preguntas-${code}.json`);
            if (res.ok) loaded = await res.json();
        } catch (e) {}
    }

    if (loaded.length > 0) {
        questionCache[code] = loaded;
        try { localStorage.setItem(localBankKey, JSON.stringify(loaded)); } catch (e) {}
    }
    return loaded;
}

async function fetchQuestionsFromCodes(codes, forceRefresh = false) {
    // Executa totes les descàrregues ALHORA en paral·lel (10x més ràpid)
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
// SECCIONS SIMULACRE I ERRORS
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

function openSimulacreSection() {
    setActiveNav('tab-simulacre');
    checkProAccessOrTrial(async () => {
        const q = await fetchQuestionsFromCodes(ALL_FILES);
        if (!q.length) return showToast('No s\'han pogut carregar les preguntes.', 'error');
        initQuiz('simulacre', '⏱️ SIMULACRE OFICIAL (30 preg · 35 min)', shuffle(q).slice(0, EXAM_QUESTIONS_COUNT), EXAM_DURATION_SECONDS, null, 'tab-simulacre');
    });
}

function openErrorsSection() {
    clearInterval(quizState.timerInterval);
    setActiveNav('tab-errors');
    hideAllViews();
    document.getElementById('view-errors-hub').classList.remove('hidden');

    const count = (userStats.failedQuestions || []).length;
    const titleEl = document.getElementById('errors-hub-title');
    const descEl = document.getElementById('errors-hub-desc');
    const btnEl = document.getElementById('btn-start-errors-now');

    if (count === 0) {
        titleEl.textContent = '🎉 Tens 0 Errors Pendents!';
        descEl.textContent = 'Tens tot el temari net! Continua fent tests per temes o simulacres; qualsevol pregunta que fallis es guardarà aquí automàticament.';
        btnEl.textContent = 'TORNAR A ENTRENAR';
        btnEl.onclick = () => switchTab('learn');
    } else {
        titleEl.textContent = `🧠 Tens ${count} preguntes pendents de repàs`;
        descEl.textContent = 'Entrena exclusivament les preguntes que has fallat. Cada vegada que n\'encertis una, s\'eliminarà d\'aquesta llista.';
        btnEl.textContent = `REPASSAR ${count} ERRORS ARA →`;
        btnEl.onclick = () => launchErrorsQuiz();
    }
}

function launchErrorsQuiz() {
    if (!userStats.failedQuestions.length) return;
    initQuiz('errors', '🧠 REPÀS D\'ERRORS', shuffle(userStats.failedQuestions), 0, null, 'tab-errors');
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
// MOTOR DEL TEST (30 PREGUNTES / 35 MINUTS)
// ==========================================
function initQuiz(mode, title, questions, timerSeconds = 0, topicCode = null, navId = 'tab-learn') {
    clearInterval(quizState.timerInterval);
    setActiveNav(navId);

    quizState = {
        mode, topicCode, title, questions,
        currentIndex: 0, correct: 0, wrong: 0, blank: 0, streak: 0,
        userAnswers: [], timerInterval: null, secondsLeft: timerSeconds
    };

    hideAllViews();
    document.getElementById('view-quiz').classList.remove('hidden');
    document.getElementById('quiz-badge').textContent = title;

    const timerEl = document.getElementById('quiz-timer');
    if (mode === 'simulacre') {
        timerEl.classList.remove('hidden');
        startTimer();
    } else {
        timerEl.classList.add('hidden');
    }

    renderQuestion();
}

function startTimer() {
    updateTimerText();
    quizState.timerInterval = setInterval(() => {
        quizState.secondsLeft--;
        updateTimerText();
        if (quizState.secondsLeft <= 0) {
            clearInterval(quizState.timerInterval);
            showToast('⏰ Temps de 35 minuts esgotat!', 'error');
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

    const pct = quizState.mode === 'survival' ? 100 : (quizState.currentIndex / quizState.questions.length) * 100;
    document.getElementById('quiz-progress-bar').style.width = `${pct}%`;

    document.getElementById('question-text').textContent = q.question;
    document.getElementById('feedback-content').classList.add('hidden');
    document.getElementById('btn-next').classList.add('hidden');

    const skipBtn = document.getElementById('btn-skip');
    quizState.mode === 'simulacre' ? skipBtn.classList.remove('hidden') : skipBtn.classList.add('hidden');

    const container = document.getElementById('options-container');
    container.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D'];

    q.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'duo-opt';
        btn.innerHTML = `<span class="opt-key">${letters[i]}</span> <span>${opt}</span>`;
        btn.onclick = () => selectAnswer(opt, btn);
        container.appendChild(btn);
    });
}

async function selectAnswer(selected, btn) {
    const q = quizState.questions[quizState.currentIndex];
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

    if (quizState.mode === 'simulacre') {
        nextQuestion();
        return;
    }

    document.querySelectorAll('.duo-opt').forEach(b => {
        b.disabled = true;
        const txt = b.querySelector('span:last-child').textContent.trim();
        if (txt === q.correctAnswer.trim()) b.classList.add('correct');
    });
    if (!isCorrect) btn.classList.add('wrong');

    document.getElementById('btn-skip').classList.add('hidden');
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

function skipQuestion() {
    const q = quizState.questions[quizState.currentIndex];
    quizState.blank++;
    quizState.userAnswers.push({ question: q, selected: null, isCorrect: false });
    nextQuestion();
}

function nextQuestion() {
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

    const total = quizState.mode === 'survival' ? (quizState.correct + quizState.wrong) : quizState.questions.length;
    const net = Math.max(0, quizState.correct - (quizState.wrong / 3));
    const gradeNum = total > 0 ? (net / total) * 10 : 0;

    if (quizState.topicCode) {
        userStats.topicScores = userStats.topicScores || {};
        userStats.topicScores[quizState.topicCode] = gradeNum;
    }

    saveStats();

    hideAllViews();
    document.getElementById('view-results').classList.remove('hidden');
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
    if (currentUser?.email !== CEO_EMAIL) return;
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
                    <span class="bank-status">${isOnline ? `☁️ ${qCount} preg.` : '📁 Sense pujar'}</span>
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

function renderManagedTopicQuestions(questionsArray) {
    const listEl = document.getElementById('ceo-topic-questions-list');
    listEl.innerHTML = '';

    if (!questionsArray.length) {
        listEl.innerHTML = '<p class="muted-sm">Aquest tema no té preguntes actualment.</p>';
        return;
    }

    questionsArray.forEach((q, idx) => {
        const item = document.createElement('div');
        item.className = 'q-edit-item';
        item.innerHTML = `
            <div>
                <strong>${idx + 1}. ${q.question}</strong>
                <div class="muted-sm mt-2">✅ Correcta: <b>${q.correctAnswer}</b></div>
            </div>
            <button class="btn-3d btn-red btn-sm" onclick="deleteSingleQuestionFromTopic(${idx})">🗑️</button>
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

async function deleteSingleQuestionFromTopic(indexInArray) {
    const code = currentManagedTopicCode;
    currentManagedQuestions.splice(indexInArray, 1);
    await setDoc(doc(db, "mossos_custom_questions", `bank_${code}`), {
        topic: code,
        questions: currentManagedQuestions,
        updatedAt: Date.now()
    });
    clearLocalBankCache(code);
    renderManagedTopicQuestions(currentManagedQuestions);
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

async function ceoMigrateAllJson() {
    if (currentUser?.email !== CEO_EMAIL) return;
    showModal({
        icon: '🚀',
        title: 'Sincronitzar els 20 JSON locals a Firestore?',
        text: 'Es llegiran preguntas-a1.json fins a c5.json de la carpeta del projecte i es pujaran al núvol.',
        confirmText: 'Sincronitzar Ara',
        onConfirm: async () => {
            showSplashLoader('Pujant els 20 temes a Firestore...');
            let count = 0;
            for (const code of ALL_FILES) {
                try {
                    const res = await fetch(`preguntas-${code}.json`);
                    if (res.ok) {
                        const data = await res.json();
                        await setDoc(doc(db, "mossos_custom_questions", `bank_${code}`), {
                            topic: code,
                            questions: data,
                            updatedAt: Date.now()
                        });
                        clearLocalBankCache(code);
                        count++;
                        updateSplashProgress(Math.round((count / 20) * 100), `Pujant Tema ${code.toUpperCase()} (${count}/20)...`);
                    }
                } catch (e) {}
            }
            hideSplashLoader();
            showToast(`✅ ${count}/20 temes pujats a Firestore!`, 'success');
            ceoLoadBanksStatus();
        }
    });
}

// ==========================================
// PANEL CEO: CRM D'USUARIS, DETALLS, PRO I BANEIG
// ==========================================
async function ceoLoadUsers() {
    if (currentUser?.email !== CEO_EMAIL) return;
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
                <div class="u-stat-box"><small>Errors Pendents</small><strong>❤️ ${(u.failedQuestions || []).length} preguntes</strong></div>
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
// NAVEGACIÓ ENTRE VISTES
// ==========================================
function hideAllViews() {
    ['view-learn', 'view-errors-hub', 'view-ranking', 'view-profile', 'view-ceo', 'view-quiz', 'view-results'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
}

function switchTab(tab) {
    clearInterval(quizState.timerInterval);
    hideAllViews();

    if (tab === 'learn') {
        setActiveNav('tab-learn');
        document.getElementById('view-learn').classList.remove('hidden');
        renderTopicNodes();
    } else if (tab === 'ranking') {
        setActiveNav('tab-ranking');
        document.getElementById('view-ranking').classList.remove('hidden');
        loadRanking();
    } else if (tab === 'profile') {
        setActiveNav('tab-profile');
        document.getElementById('view-profile').classList.remove('hidden');
        renderProfileView();
    } else if (tab === 'ceo' && currentUser?.email === CEO_EMAIL) {
        setActiveNav('tab-ceo');
        document.getElementById('view-ceo').classList.remove('hidden');
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
    switchTab, openSimulacreSection, openErrorsSection, launchErrorsQuiz, startSurvival,
    startCommunityFailures, startAmbit, startTopic, startLiveEvent, skipQuestion,
    nextQuestion, confirmExitQuiz, handleAuthClick, forceSignOut, openProModal,
    copyReferralLink, redeemFriendCode, loadRanking, reportCurrentQuestion,
    selectProfileAvatar, saveUserProfileData, forceReloadQuestionBanks,
    ceoMigrateAllJson, ceoLoadBanksStatus, triggerUploadJson, handleJsonFileUpload,
    ceoDeleteBank, ceoDownloadBackup, openTopicManager, closeTopicManager,
    filterTopicQuestions, deleteSingleQuestionFromTopic, openAddQuestionToCurrentTopic,
    ceoSaveAlert, ceoClearAlert, ceoSaveEvent, ceoClearEvent, ceoLoadReports,
    ceoDeleteReport, ceoLoadUsers, ceoFilterUsers, ceoInspectUser, ceoTogglePro,
    ceoToggleBan, ceoDeleteUserAccount
});
