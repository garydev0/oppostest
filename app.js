import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const CEO_EMAIL = "gerardlopezgarcia1@gmail.com";

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

// Temari Oficial
const TOPICS = {
    A: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'],
    B: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'],
    C: ['c1', 'c2', 'c3', 'c4', 'c5']
};
const ALL_FILES = [...TOPICS.A, ...TOPICS.B, ...TOPICS.C];

// Memòria cau per estalviar lectures de Firestore
const questionCache = {};

// Estadístiques de l'opositor
let userStats = JSON.parse(localStorage.getItem('oppostest_pro_stats')) || {
    xp: 0,
    dailyStreak: 0,
    lastStudyDate: null,
    bestStreak: 0,
    failedQuestions: [],
    topicScores: {}, // Ex: { a1: 8.5, b2: 4.0 }
    freeProTrialsUsed: 0,
    unlockedExams: 0, // Si és true o >= 3 amics convidats -> Usuari PRO
    redeemedFriend: false
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

function showModal({ icon = '💡', title, text, showInput = false, placeholder = '', confirmText = 'Acceptar', cancelText = 'Cancel·lar', onConfirm }) {
    const overlay = document.getElementById('modal-overlay');
    document.getElementById('modal-icon').textContent = icon;
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-text').textContent = text;

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
// INICIALITZACIÓ I RATXA DIÀRIA
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    checkUrlReferral();
    renderTopicNodes();
    updateStatsUI();
    initFirebaseListeners();
    loadGlobalAlert();
    loadLiveEventBanner();
    initKeyboardShortcuts();
});

function isUserPro() {
    if (currentUser?.email === CEO_EMAIL) return true;
    if (userStats.unlockedExams === true) return true;
    if (typeof userStats.unlockedExams === 'number' && userStats.unlockedExams >= 3) return true;
    return false;
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

    const proBadge = document.getElementById('ui-pro-badge');
    const proSideBtn = document.getElementById('btn-pro-sidebar');
    if (isUserPro()) {
        proBadge.textContent = '💎 PRO ACTIU';
        proBadge.classList.add('is-pro');
        proSideBtn.classList.add('hidden');
    } else {
        const count = typeof userStats.unlockedExams === 'number' ? userStats.unlockedExams : 0;
        proBadge.textContent = `GRATIS (${count}/3 amics)`;
        proBadge.classList.remove('is-pro');
        proSideBtn.classList.remove('hidden');
    }
}

async function saveStats() {
    localStorage.setItem('oppostest_pro_stats', JSON.stringify(userStats));
    updateStatsUI();
    renderTopicNodes();

    if (currentUser) {
        try {
            await setDoc(doc(db, "users", currentUser.uid), {
                email: currentUser.email,
                displayName: currentUser.displayName || currentUser.email.split('@')[0],
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
// AUTENTICACIÓ FIREBASE I PERFIL CEO
// ==========================================
function initFirebaseListeners() {
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        const authBtn = document.getElementById('btn-auth-trigger');
        const userTag = document.getElementById('ui-user-tag');
        const ceoTab = document.getElementById('tab-ceo');
        const refInput = document.getElementById('my-ref-code');

        if (user) {
            authBtn.textContent = "TANCAR SESSIÓ";
            userTag.textContent = user.displayName || user.email.split('@')[0];
            refInput.value = user.uid;

            if (user.email === CEO_EMAIL) {
                ceoTab.classList.remove('hidden');
            } else {
                ceoTab.classList.add('hidden');
            }

            const snap = await getDoc(doc(db, "users", user.uid));
            if (snap.exists()) {
                const data = snap.data();
                userStats.xp = Math.max(userStats.xp, data.xp || 0);
                userStats.dailyStreak = Math.max(userStats.dailyStreak, data.dailyStreak || 0);
                userStats.lastStudyDate = data.lastStudyDate || userStats.lastStudyDate;
                userStats.bestStreak = Math.max(userStats.bestStreak, data.bestStreak || 0);
                userStats.failedQuestions = data.failedQuestions || userStats.failedQuestions;
                userStats.topicScores = { ...userStats.topicScores, ...(data.topicScores || {}) };
                userStats.unlockedExams = data.unlockedExams ?? userStats.unlockedExams;
                updateStatsUI();
                renderTopicNodes();
            } else {
                await saveStats();
            }
        } else {
            authBtn.textContent = "👤 ENTRAR AMB GOOGLE";
            userTag.textContent = "Convidat";
            refInput.value = "Inicia sessió per tenir codi";
            ceoTab.classList.add('hidden');
            updateStatsUI();
        }
    });
}

async function handleAuthClick() {
    if (currentUser) {
        showModal({
            icon: '👋',
            title: 'Tancar sessió?',
            text: 'El teu progrés està guardat al núvol.',
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
            showToast('Benvingut a Oppostest!', 'success');
        } catch (e) {
            showToast('No s\'ha pogut iniciar sessió', 'error');
        }
    }
}

// ==========================================
// SISTEMA DE REFERITS I DESBLOQUEIG PRO
// ==========================================
function checkUrlReferral() {
    const params = new URLSearchParams(window.location.search);
    const refUid = params.get('ref');
    if (refUid) {
        localStorage.setItem('pending_ref_uid', refUid);
    }
}

function openProModal() {
    if (isUserPro()) {
        showModal({
            icon: '💎',
            title: 'Ja tens Oppostest PRO Actiu!',
            text: 'Tens accés il·limitat a tots els Simulacres Oficials i al Top Fallades de Catalunya.',
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
    const url = `${window.location.origin}${window.location.pathname}?ref=${currentUser.uid}`;
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
        const currentCount = typeof friendData.unlockedExams === 'number' ? friendData.unlockedExams : 0;
        const newStatus = (currentCount + 1) >= 3 ? true : (currentCount + 1);

        // Actualitza NOMÉS 'unlockedExams' per complir la teva regla exacta de Firestore!
        await updateDoc(friendRef, { unlockedExams: newStatus });

        userStats.redeemedFriend = true;
        userStats.xp += 50;
        await saveStats();
        showToast('🎉 Codi validat! El teu amic ha sumat 1 punt PRO i tu guanyes +50 XP!', 'success');
    } catch (e) {
        showToast('Error validant el codi. Revisa la connexió.', 'error');
    }
}

// ==========================================
// CÀRREGA BLINDADA DE PREGUNTES (FIRESTORE + FALLBACK JSON)
// ==========================================
async function fetchQuestionsFromCodes(codes) {
    let allQuestions = [];
    for (const code of codes) {
        if (questionCache[code]) {
            allQuestions.push(...questionCache[code]);
            continue;
        }

        let loaded = [];
        // 1. Intenta carregar el paquet blindat de Firestore (/mossos_custom_questions/bank_a1)
        try {
            const bankSnap = await getDoc(doc(db, "mossos_custom_questions", `bank_${code}`));
            if (bankSnap.exists() && Array.isArray(bankSnap.data().questions)) {
                loaded = bankSnap.data().questions;
            }
        } catch (e) {}

        // 2. Si encara no s'ha migrat, llegeix el JSON local
        if (loaded.length === 0) {
            try {
                const res = await fetch(`preguntas-${code}.json`);
                if (res.ok) loaded = await res.json();
            } catch (e) {}
        }

        questionCache[code] = loaded;
        allQuestions.push(...loaded);
    }
    return allQuestions;
}

// MIGRADOR CEO: Puja els 20 JSON a Firestore amb 1 sol clic
async function ceoMigrateAllJson() {
    if (currentUser?.email !== CEO_EMAIL) return;
    showModal({
        icon: '🚀',
        title: 'Migrar els 20 JSON a Firestore?',
        text: 'Es llegiran preguntas-a1.json fins a c5.json i es desaran a /mossos_custom_questions/bank_a1...c5.',
        confirmText: 'Iniciar Migració',
        onConfirm: async () => {
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
                        count++;
                    }
                } catch (e) {}
            }
            showToast(`✅ ${count}/20 temes migrats a Firestore amb èxit!`, 'success');
        }
    });
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
// INICIADORS DE MODES (AMB EMBUDO FREEMIUM)
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
            text: 'Aquest és un mode exclusiu PRO. Et regalem 1 partida de prova gratuïta!',
            confirmText: 'Jugar Prova Gratis',
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

async function startTopic(code) {
    const q = await fetchQuestionsFromCodes([code]);
    if (!q.length) return showToast(`No s'han trobat preguntes de ${code.toUpperCase()}`, 'error');
    initQuiz('study', `TEMA ${code.toUpperCase()}`, shuffle(q).slice(0, 20), 0, code);
}

async function startAmbit(letter) {
    const q = await fetchQuestionsFromCodes(TOPICS[letter]);
    if (!q.length) return;
    initQuiz('study', `ÀMBIT ${letter}`, shuffle(q).slice(0, 25));
}

function startSimulacre() {
    checkProAccessOrTrial(async () => {
        const q = await fetchQuestionsFromCodes(ALL_FILES);
        if (!q.length) return;
        initQuiz('simulacre', '⏱️ SIMULACRE OFICIAL', shuffle(q).slice(0, 35), 35 * 60);
    });
}

async function startSurvival() {
    const q = await fetchQuestionsFromCodes(ALL_FILES);
    if (!q.length) return;
    initQuiz('survival', '🔥 SUPERVIVÈNCIA', shuffle(q));
}

function startErrorsMode() {
    if (!userStats.failedQuestions.length) {
        showToast('No tens cap pregunta pendent de repàs! 🎉', 'success');
        return;
    }
    initQuiz('errors', '🧠 REPÀS D\'ERRORS', shuffle(userStats.failedQuestions));
}

function startCommunityFailures() {
    checkProAccessOrTrial(async () => {
        try {
            const snap = await getDoc(doc(db, "metrics", "top_failed"));
            if (snap.exists() && Array.isArray(snap.data().questions) && snap.data().questions.length >= 5) {
                initQuiz('study', '☠️ TOP FALLADES CATALUNYA', shuffle(snap.data().questions).slice(0, 25));
                return;
            }
        } catch (e) {}
        const q = await fetchQuestionsFromCodes(ALL_FILES);
        initQuiz('study', '☠️ TOP FALLADES CATALUNYA', shuffle(q).slice(0, 25));
    });
}

// ==========================================
// MOTOR DEL TEST I DRECERES DE TECLAT
// ==========================================
function initQuiz(mode, title, questions, timerSeconds = 0, topicCode = null) {
    clearInterval(quizState.timerInterval);
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

    // Guardar nota al Semàfor si és un tema específic
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
            const row = document.createElement('div');
            row.className = 'rank-row';
            const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `#${pos}`;
            row.innerHTML = `
                <span>${medal} ${u.displayName || 'Opositor'} ${u.unlockedExams ? '💎' : ''}</span>
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
    initQuiz('simulacre', '🔴 ESDEVENIMENT OFICIAL EN VIU', shuffle(q).slice(0, 35), 35 * 60);
}

// ==========================================
// FUNCIONS EXCLUSIVES PANEL CEO
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
    const desc = document.getElementById('ceo-ev-desc').value.trim() || '35 preguntes oficials · Temps real';
    await setDoc(doc(db, "mossos_events", "active"), { active: true, title, desc });
    loadLiveEventBanner();
    showToast('🔴 Esdeveniment en Viu activat!', 'success');
}

async function ceoClearEvent() {
    await setDoc(doc(db, "mossos_events", "active"), { active: false });
    loadLiveEventBanner();
    showToast('Esdeveniment desactivat');
}

async function ceoCreateQuestion() {
    const question = document.getElementById('ceo-q-text').value.trim();
    const o1 = document.getElementById('ceo-q-opt1').value.trim();
    const o2 = document.getElementById('ceo-q-opt2').value.trim();
    const o3 = document.getElementById('ceo-q-opt3').value.trim();
    const o4 = document.getElementById('ceo-q-opt4').value.trim();
    const explanation = document.getElementById('ceo-q-exp').value.trim();

    if (!question || !o1 || !o2) return showToast('Omple l\'enunciat i les opcions!', 'error');
    await addDoc(collection(db, "mossos_custom_questions"), {
        question,
        options: shuffle([o1, o2, o3, o4]),
        correctAnswer: o1,
        explanation
    });
    showToast('Pregunta guardada a Firestore!', 'success');
}

async function ceoLoadReports() {
    const container = document.getElementById('ceo-reports-list');
    container.innerHTML = 'Carregant...';
    const snap = await getDocs(collection(db, "reports"));
    container.innerHTML = '';
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

async function ceoLoadUsers() {
    const container = document.getElementById('ceo-users-list');
    container.innerHTML = 'Carregant...';
    const snap = await getDocs(collection(db, "users"));
    container.innerHTML = '';
    snap.forEach(d => {
        const u = d.data();
        const isPro = u.unlockedExams === true || u.unlockedExams >= 3;
        const div = document.createElement('div');
        div.className = 'admin-row';
        div.innerHTML = `
            <span>${u.email || d.id} (⚡${u.xp || 0}) ${isPro ? '💎 PRO' : ''}</span>
            <button class="btn-3d btn-gold btn-sm" onclick="ceoTogglePro('${d.id}', ${!isPro})">${isPro ? 'Treure PRO' : 'Donar PRO'}</button>
        `;
        container.appendChild(div);
    });
}

async function ceoTogglePro(uid, status) {
    await updateDoc(doc(db, "users", uid), { unlockedExams: status });
    showToast('Estat PRO actualitzat!', 'success');
    ceoLoadUsers();
}

// ==========================================
// NAVEGACIÓ ENTRE VISTES
// ==========================================
function hideAllViews() {
    ['view-learn', 'view-ranking', 'view-ceo', 'view-quiz', 'view-results'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
}

function switchTab(tab) {
    clearInterval(quizState.timerInterval);
    hideAllViews();
    document.querySelectorAll('.duo-nav-item').forEach(b => b.classList.remove('active'));

    if (tab === 'learn') {
        document.getElementById('view-learn').classList.remove('hidden');
        document.getElementById('tab-learn').classList.add('active');
        renderTopicNodes();
    } else if (tab === 'ranking') {
        document.getElementById('view-ranking').classList.remove('hidden');
        document.getElementById('tab-ranking').classList.add('active');
        loadRanking();
    } else if (tab === 'ceo' && currentUser?.email === CEO_EMAIL) {
        document.getElementById('view-ceo').classList.remove('hidden');
        document.getElementById('tab-ceo').classList.add('active');
        ceoLoadReports();
        ceoLoadUsers();
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
    switchTab, startSimulacre, startSurvival, startErrorsMode, startCommunityFailures,
    startAmbit, startTopic, startLiveEvent, skipQuestion, nextQuestion, confirmExitQuiz,
    handleAuthClick, openProModal, copyReferralLink, redeemFriendCode, loadRanking,
    reportCurrentQuestion, ceoMigrateAllJson, ceoSaveAlert, ceoClearAlert, ceoSaveEvent,
    ceoClearEvent, ceoCreateQuestion, ceoLoadReports, ceoDeleteReport, ceoLoadUsers, ceoTogglePro
});
