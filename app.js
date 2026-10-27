import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const CEO_EMAIL = "gerardlopezgarcia1@gmail.com";

// Tu configuració real de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAK8r_-CMw1626LIFnrn9NcVkIcvYv2Elo",
    authDomain: "oppostest.firebaseapp.com",
    projectId: "oppostest",
    storageBucket: "oppostest.firebasestorage.app",
    messagingSenderId: "738546966243",
    appId: "1:738546966243:web:58b4277287a97d6e036fd6",
    measurementId: "G-XT9FSLFHSB"
};

let auth = null;
let db = null;
let currentUser = null;
const firebaseReady = true;

if (firebaseReady) {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
}

// Temari Oficial
const TOPICS = {
    A: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'],
    B: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'],
    C: ['c1', 'c2', 'c3', 'c4', 'c5']
};
const ALL_FILES = [...TOPICS.A, ...TOPICS.B, ...TOPICS.C];

// Dades de l'usuari
let userStats = JSON.parse(localStorage.getItem('oppostest_duo_stats')) || {
    xp: 0,
    bestStreak: 0,
    failedQuestions: [],
    unlockedExams: false
};

// Estat del Test
let quizState = {
    mode: 'study',
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

// INICIALITZACIÓ
document.addEventListener('DOMContentLoaded', () => {
    renderTopicNodes();
    updateStatsUI();
    if (firebaseReady) {
        initFirebaseListeners();
        loadGlobalAlert();
    }
});

function renderTopicNodes() {
    ['A', 'B', 'C'].forEach(ambit => {
        const container = document.getElementById(`nodes-${ambit}`);
        container.innerHTML = '';
        TOPICS[ambit].forEach(code => {
            const btn = document.createElement('button');
            btn.className = 'node-btn';
            btn.innerHTML = `
                <div class="node-circle">${code.toUpperCase()}</div>
                <span>Tema ${code.toUpperCase()}</span>
            `;
            btn.onclick = () => startTopic(code);
            container.appendChild(btn);
        });
    });
}

function updateStatsUI() {
    document.getElementById('ui-streak').textContent = userStats.bestStreak || 0;
    document.getElementById('ui-xp').textContent = userStats.xp || 0;
    document.getElementById('ui-errors').textContent = (userStats.failedQuestions || []).length;
    document.getElementById('sidebar-error-count').textContent = (userStats.failedQuestions || []).length;
}

async function saveStats() {
    localStorage.setItem('oppostest_duo_stats', JSON.stringify(userStats));
    updateStatsUI();
    if (firebaseReady && currentUser) {
        try {
            await setDoc(doc(db, "users", currentUser.uid), {
                email: currentUser.email,
                displayName: currentUser.displayName || currentUser.email.split('@')[0],
                xp: userStats.xp,
                bestStreak: userStats.bestStreak,
                failedQuestions: userStats.failedQuestions,
                unlockedExams: userStats.unlockedExams || false,
                updatedAt: Date.now()
            }, { merge: true });
        } catch (e) {
            console.warn("Error sincronitzant amb Firestore:", e);
        }
    }
}

// AUTENTICACIÓ I PERFIL CEO
function initFirebaseListeners() {
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        const authBtn = document.getElementById('btn-auth-trigger');
        const userTag = document.getElementById('ui-user-tag');
        const ceoTab = document.getElementById('tab-ceo');

        if (user) {
            authBtn.textContent = "SORTIR";
            userTag.textContent = user.displayName || user.email;

            // Comprovar si és el CEO (gerardlopezgarcia1@gmail.com)
            if (user.email === CEO_EMAIL) {
                ceoTab.classList.remove('hidden');
            } else {
                ceoTab.classList.add('hidden');
            }

            // Carregar dades de /users/{uid}
            const snap = await getDoc(doc(db, "users", user.uid));
            if (snap.exists()) {
                const data = snap.data();
                userStats.xp = Math.max(userStats.xp, data.xp || 0);
                userStats.bestStreak = Math.max(userStats.bestStreak, data.bestStreak || 0);
                userStats.failedQuestions = data.failedQuestions || userStats.failedQuestions;
                userStats.unlockedExams = data.unlockedExams || false;
                updateStatsUI();
            } else {
                await saveStats();
            }
        } else {
            authBtn.textContent = "👤 ENTRAR";
            userTag.textContent = "Convidat";
            ceoTab.classList.add('hidden');
        }
    });
}

async function handleAuthClick() {
    if (!firebaseReady) {
        alert("Enganxa primer les teves claus firebaseConfig a les primeres línies d'app.js!");
        return;
    }
    if (currentUser) {
        await signOut(auth);
        switchTab('learn');
    } else {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    }
}

// CÀRREGA DE PREGUNTES (JSON locals + /mossos_custom_questions de Firestore)
async function fetchQuestionsFromCodes(codes) {
    try {
        const promises = codes.map(code =>
            fetch(`preguntas-${code}.json`).then(r => r.ok ? r.json() : [])
        );
        const results = await Promise.all(promises);
        let combined = results.flat();

        // Afegir preguntes creades des del Panel CEO
        if (firebaseReady) {
            try {
                const snap = await getDocs(collection(db, "mossos_custom_questions"));
                snap.forEach(d => combined.push(d.data()));
            } catch (e) {}
        }
        return combined;
    } catch (e) {
        alert("Obre la web amb Live Server o GitHub Pages per carregar els arxius JSON.");
        return [];
    }
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// MODES D'ENTRENAMENT
async function startTopic(code) {
    const q = await fetchQuestionsFromCodes([code]);
    if (!q.length) return;
    initQuiz('study', `TEMA ${code.toUpperCase()}`, shuffle(q).slice(0, 20));
}

async function startAmbit(letter) {
    const q = await fetchQuestionsFromCodes(TOPICS[letter]);
    if (!q.length) return;
    initQuiz('study', `ÀMBIT ${letter}`, shuffle(q).slice(0, 25));
}

async function startSimulacre() {
    const q = await fetchQuestionsFromCodes(ALL_FILES);
    if (!q.length) return;
    initQuiz('simulacre', 'SIMULACRE OFICIAL', shuffle(q).slice(0, 35), 35 * 60);
}

async function startSurvival() {
    const q = await fetchQuestionsFromCodes(ALL_FILES);
    if (!q.length) return;
    initQuiz('survival', '🔥 SUPERVIVÈNCIA', shuffle(q));
}

function startErrorsMode() {
    if (!userStats.failedQuestions.length) {
        alert("No tens cap error pendent! 🎉");
        return;
    }
    initQuiz('errors', '🧠 REPÀS D\'ERRORS', shuffle(userStats.failedQuestions));
}

function initQuiz(mode, title, questions, timerSeconds = 0) {
    clearInterval(quizState.timerInterval);
    quizState = {
        mode, title, questions,
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

function selectAnswer(selected, btn) {
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
    }
    saveStats();

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
    document.getElementById('feedback-title').textContent = isCorrect ? '✅ Correcte! (+10 XP)' : '❌ Incorrecte';
    document.getElementById('feedback-explanation').textContent = q.explanation || '';

    const nextBtn = document.getElementById('btn-next');
    nextBtn.classList.remove('hidden');
    if (quizState.mode === 'survival' && !isCorrect) {
        nextBtn.textContent = 'VEURE RESULTAT';
        nextBtn.onclick = finishQuiz;
    } else {
        nextBtn.textContent = 'CONTINUAR';
        nextBtn.onclick = nextQuestion;
    }
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
    hideAllViews();
    document.getElementById('view-results').classList.remove('hidden');

    const total = quizState.mode === 'survival' ? (quizState.correct + quizState.wrong) : quizState.questions.length;
    const net = Math.max(0, quizState.correct - (quizState.wrong / 3));
    const grade = total > 0 ? ((net / total) * 10).toFixed(2) : '0.00';

    document.getElementById('res-score').textContent = quizState.mode === 'survival' ? `${quizState.correct}🔥` : grade;
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
        `;
        rev.appendChild(d);
    });
}

// REPORTAR ERROR (/reports)
async function reportCurrentQuestion() {
    const q = quizState.questions[quizState.currentIndex];
    const reason = prompt("Quin error has vist en aquesta pregunta?");
    if (!reason) return;
    if (firebaseReady) {
        await addDoc(collection(db, "reports"), {
            question: q.question,
            reason,
            createdAt: Date.now()
        });
        alert("Gràcies! L'administrador revisarà la pregunta.");
    }
}

// RÀNQUING (/users)
async function loadRanking() {
    const list = document.getElementById('ranking-list');
    if (!firebaseReady) {
        list.innerHTML = '<p>Connecta el teu firebaseConfig per veure el rànquing en temps real.</p>';
        return;
    }
    list.innerHTML = 'Carregant...';
    const q = query(collection(db, "users"), orderBy("xp", "desc"), limit(20));
    const snap = await getDocs(q);
    list.innerHTML = '';
    let pos = 1;
    snap.forEach(d => {
        const u = d.data();
        const row = document.createElement('div');
        row.className = 'rank-row';
        row.innerHTML = `<span>#${pos++} ${u.displayName || 'Opositor'}</span> <span>⚡ ${u.xp || 0} XP</span>`;
        list.appendChild(row);
    });
}

// FUNCIONS PANEL CEO (Només gerardlopezgarcia1@gmail.com)
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
    alert("Alerta publicada!");
}

async function ceoClearAlert() {
    await setDoc(doc(db, "admin", "global"), { message: "" });
    document.getElementById('global-alert-banner').classList.add('hidden');
}

async function ceoCreateQuestion() {
    const question = document.getElementById('ceo-q-text').value.trim();
    const o1 = document.getElementById('ceo-q-opt1').value.trim();
    const o2 = document.getElementById('ceo-q-opt2').value.trim();
    const o3 = document.getElementById('ceo-q-opt3').value.trim();
    const o4 = document.getElementById('ceo-q-opt4').value.trim();
    const explanation = document.getElementById('ceo-q-exp').value.trim();

    if (!question || !o1 || !o2) return alert("Omple l'enunciat i les opcions!");
    await addDoc(collection(db, "mossos_custom_questions"), {
        question,
        options: shuffle([o1, o2, o3, o4]),
        correctAnswer: o1,
        explanation
    });
    alert("Pregunta afegida a Firestore!");
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
            <div><strong>${r.question}</strong><br><small>${r.reason}</small></div>
            <button class="btn-3d btn-red btn-sm" onclick="ceoDeleteReport('${d.id}')">Esborrar</button>
        `;
        container.appendChild(div);
    });
}

async function ceoDeleteReport(id) {
    await deleteDoc(doc(db, "reports", id));
    ceoLoadReports();
}

async function ceoLoadUsers() {
    const container = document.getElementById('ceo-users-list');
    container.innerHTML = 'Carregant...';
    const snap = await getDocs(collection(db, "users"));
    container.innerHTML = '';
    snap.forEach(d => {
        const u = d.data();
        const div = document.createElement('div');
        div.className = 'admin-row';
        div.innerHTML = `
            <span>${u.email || d.id} (⚡${u.xp || 0}) ${u.unlockedExams ? '💎 PRO' : ''}</span>
            <button class="btn-3d btn-gold btn-sm" onclick="ceoTogglePro('${d.id}', ${!u.unlockedExams})">PRO</button>
        `;
        container.appendChild(div);
    });
}

async function ceoTogglePro(uid, status) {
    await updateDoc(doc(db, "users", uid), { unlockedExams: status });
    ceoLoadUsers();
}

// NAVEGACIÓ
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
    if (confirm("Vols sortir del test?")) switchTab('learn');
}

// Exposar funcions al DOM
Object.assign(window, {
    switchTab, startSimulacre, startSurvival, startErrorsMode, startAmbit, startTopic,
    skipQuestion, nextQuestion, confirmExitQuiz, handleAuthClick, loadRanking,
    reportCurrentQuestion, ceoSaveAlert, ceoClearAlert, ceoCreateQuestion,
    ceoLoadReports, ceoDeleteReport, ceoLoadUsers, ceoTogglePro
});
