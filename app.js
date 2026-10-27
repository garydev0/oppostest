// Llista oficial dels 20 arxius JSON
const TOPICS = {
    A: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'],
    B: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'],
    C: ['c1', 'c2', 'c3', 'c4', 'c5']
};

const ALL_FILES = [...TOPICS.A, ...TOPICS.B, ...TOPICS.C];

// Estat actual del test
let quizState = {
    mode: 'study', // 'study' | 'simulacre' | 'survival' | 'errors'
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

// Dades d'usuari (LocalStorage + preparat per sincronitzar amb Firebase al Pas 2)
let userStats = JSON.parse(localStorage.getItem('oppostest_stats')) || {
    bestStreak: 0,
    totalAnswered: 0,
    failedQuestions: [] // Guarda objectes de preguntes fallades
};

// Inicialització
document.addEventListener('DOMContentLoaded', () => {
    renderTopicsGrid();
    updateStatsUI();
});

function saveStats() {
    localStorage.setItem('oppostest_stats', JSON.stringify(userStats));
    updateStatsUI();
}

function updateStatsUI() {
    document.getElementById('stat-streak').textContent = userStats.bestStreak;
    document.getElementById('stat-answered').textContent = userStats.totalAnswered;
    document.getElementById('stat-errors').textContent = userStats.failedQuestions.length;
    document.getElementById('nav-error-badge').textContent = userStats.failedQuestions.length;
}

function renderTopicsGrid() {
    const container = document.getElementById('topics-container');
    container.innerHTML = '';
    ALL_FILES.forEach(code => {
        const btn = document.createElement('button');
        btn.className = 'topic-btn';
        btn.textContent = `Tema ${code.toUpperCase()}`;
        btn.onclick = () => startTopic(code);
        container.appendChild(btn);
    });
}

// Càrrega d'arxius JSON
async function fetchQuestionsFromCodes(codes) {
    try {
        const promises = codes.map(code =>
            fetch(`preguntas-${code}.json`).then(res => {
                if (!res.ok) throw new Error(`No s'ha trobat preguntas-${code}.json`);
                return res.json();
            })
        );
        const results = await Promise.all(promises);
        return results.flat();
    } catch (error) {
        alert(`Error carregant els arxius JSON: ${error.message}\n\nImportant: Obre el projecte amb l'extensió "Live Server" de VS Code perquè el navegador permeti llegir els JSON locals.`);
        return [];
    }
}

function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

// INICIADORS DE MODES
async function startTopic(code) {
    const all = await fetchQuestionsFromCodes([code]);
    if (!all.length) return;
    const selected = shuffleArray(all).slice(0, 20);
    initQuiz('study', `Tema ${code.toUpperCase()}`, selected);
}

async function startAmbit(ambitLetter) {
    const all = await fetchQuestionsFromCodes(TOPICS[ambitLetter]);
    if (!all.length) return;
    const selected = shuffleArray(all).slice(0, 25);
    initQuiz('study', `Àmbit ${ambitLetter}`, selected);
}

async function startSimulacre() {
    const all = await fetchQuestionsFromCodes(ALL_FILES);
    if (!all.length) return;
    const selected = shuffleArray(all).slice(0, 35);
    initQuiz('simulacre', 'Simulacre Oficial (35 min)', selected, 35 * 60);
}

async function startSurvival() {
    const all = await fetchQuestionsFromCodes(ALL_FILES);
    if (!all.length) return;
    const selected = shuffleArray(all);
    initQuiz('survival', '🔥 Mode Supervivència', selected);
}

function startErrorsMode() {
    if (userStats.failedQuestions.length === 0) {
        alert('No tens cap pregunta pendent de repàs! Fes algun test primer.');
        return;
    }
    const selected = shuffleArray(userStats.failedQuestions);
    initQuiz('errors', '🧠 Repàs de Fallades', selected);
}

// MOTOR DEL TEST
function initQuiz(mode, title, questions, timerSeconds = 0) {
    clearInterval(quizState.timerInterval);
    quizState = {
        mode,
        title,
        questions,
        currentIndex: 0,
        correct: 0,
        wrong: 0,
        blank: 0,
        streak: 0,
        userAnswers: [],
        timerInterval: null,
        secondsLeft: timerSeconds
    };

    document.getElementById('view-dashboard').classList.add('hidden');
    document.getElementById('view-results').classList.add('hidden');
    document.getElementById('view-quiz').classList.remove('hidden');

    document.getElementById('quiz-mode-title').textContent = title;
    document.getElementById('total-q-num').textContent = mode === 'survival' ? '∞' : questions.length;

    const timerEl = document.getElementById('quiz-timer');
    if (mode === 'simulacre') {
        timerEl.classList.remove('hidden');
        startTimer();
    } else {
        timerEl.classList.add('hidden');
    }

    renderCurrentQuestion();
}

function startTimer() {
    updateTimerDisplay();
    quizState.timerInterval = setInterval(() => {
        quizState.secondsLeft--;
        updateTimerDisplay();
        if (quizState.secondsLeft <= 0) {
            clearInterval(quizState.timerInterval);
            alert('Temps esgotat! Es calcula la nota amb les respostes actuals.');
            finishQuiz();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const mins = Math.floor(quizState.secondsLeft / 60).toString().padStart(2, '0');
    const secs = (quizState.secondsLeft % 60).toString().padStart(2, '0');
    document.getElementById('quiz-timer').textContent = `${mins}:${secs}`;
}

function renderCurrentQuestion() {
    const q = quizState.questions[quizState.currentIndex];
    document.getElementById('current-q-num').textContent = quizState.currentIndex + 1;

    const pct = quizState.mode === 'survival'
        ? 100
        : ((quizState.currentIndex) / quizState.questions.length) * 100;
    document.getElementById('progress-bar-fill').style.width = `${pct}%`;

    document.getElementById('question-text').textContent = q.question;
    document.getElementById('explanation-box').classList.add('hidden');
    document.getElementById('btn-next').classList.add('hidden');

    // En simulacre es permet deixar en blanc
    const skipBtn = document.getElementById('btn-skip');
    if (quizState.mode === 'simulacre') {
        skipBtn.classList.remove('hidden');
    } else {
        skipBtn.classList.add('hidden');
    }

    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D'];

    q.options.forEach((optText, idx) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = `<span class="option-letter">${letters[idx]}</span> <span>${optText}</span>`;
        btn.onclick = () => handleAnswer(optText, btn);
        optionsContainer.appendChild(btn);
    });
}

function handleAnswer(selectedOption, clickedBtn) {
    const q = quizState.questions[quizState.currentIndex];
    const isCorrect = selectedOption.trim() === q.correctAnswer.trim();

    quizState.userAnswers.push({
        question: q,
        selected: selectedOption,
        isCorrect
    });

    // Estadístiques i gestió d'errors
    userStats.totalAnswered++;
    if (isCorrect) {
        quizState.correct++;
        quizState.streak++;
        if (quizState.mode === 'survival' && quizState.streak > userStats.bestStreak) {
            userStats.bestStreak = quizState.streak;
        }
        // Si encerta en mode repàs d'errors, l'eliminem de la llista de fallades
        if (quizState.mode === 'errors') {
            userStats.failedQuestions = userStats.failedQuestions.filter(item => item.question !== q.question);
        }
    } else {
        quizState.wrong++;
        saveFailedQuestion(q);
    }
    saveStats();

    // Comportament segons el mode elegit
    if (quizState.mode === 'simulacre') {
        // En simulacre no mostrem si ha encertat o fallat fins al final
        nextQuestion();
        return;
    }

    // Bloquejar botons i mostrar verds/vermells (Mode Estudi, Supervivència i Errors)
    const allButtons = document.querySelectorAll('.option-btn');
    allButtons.forEach(btn => {
        btn.disabled = true;
        const text = btn.querySelector('span:last-child').textContent.trim();
        if (text === q.correctAnswer.trim()) {
            btn.classList.add('correct');
        }
    });

    if (!isCorrect) {
        clickedBtn.classList.add('wrong');
    }

    const expBox = document.getElementById('explanation-box');
    const feedbackStatus = document.getElementById('feedback-status');
    feedbackStatus.textContent = isCorrect ? '✅ Resposta Correcta!' : '❌ Resposta Incorrecta';
    feedbackStatus.style.color = isCorrect ? 'var(--success)' : 'var(--danger)';
    document.getElementById('explanation-text').textContent = q.explanation || 'Sense explicació addicional.';
    expBox.classList.remove('hidden');

    const nextBtn = document.getElementById('btn-next');
    nextBtn.classList.remove('hidden');

    if (quizState.mode === 'survival' && !isCorrect) {
        nextBtn.textContent = 'Veure resultat final (Fi de ratxa) →';
        nextBtn.onclick = finishQuiz;
    } else {
        nextBtn.textContent = 'Següent pregunta →';
        nextBtn.onclick = nextQuestion;
    }
}

function skipQuestion() {
    const q = quizState.questions[quizState.currentIndex];
    quizState.blank++;
    quizState.userAnswers.push({
        question: q,
        selected: null,
        isCorrect: false
    });
    nextQuestion();
}

function nextQuestion() {
    quizState.currentIndex++;
    if (quizState.currentIndex >= quizState.questions.length) {
        finishQuiz();
    } else {
        renderCurrentQuestion();
    }
}

function saveFailedQuestion(questionObj) {
    const exists = userStats.failedQuestions.some(item => item.question === questionObj.question);
    if (!exists) {
        userStats.failedQuestions.push(questionObj);
    }
}

function finishQuiz() {
    clearInterval(quizState.timerInterval);
    document.getElementById('view-quiz').classList.add('hidden');
    document.getElementById('view-results').classList.remove('hidden');

    const total = quizState.mode === 'survival'
        ? (quizState.correct + quizState.wrong)
        : quizState.questions.length;

    // Fórmula oficial d'oposició: (Encerts - (Errades / 3)) sobre 10
    const netPoints = Math.max(0, quizState.correct - (quizState.wrong / 3));
    const finalGrade = total > 0 ? ((netPoints / total) * 10).toFixed(2) : '0.00';

    document.getElementById('results-title').textContent = `${quizState.title} - Finalitzat`;
    document.getElementById('final-score').textContent = quizState.mode === 'survival'
        ? `${quizState.correct} 🔥`
        : finalGrade;

    document.getElementById('res-correct').textContent = quizState.correct;
    document.getElementById('res-wrong').textContent = quizState.wrong;
    document.getElementById('res-blank').textContent = quizState.blank;

    // Mostrar revisió detallada d'errors i preguntes en blanc
    const reviewContainer = document.getElementById('review-container');
    reviewContainer.innerHTML = '';

    quizState.userAnswers.forEach((item, idx) => {
        if (!item.isCorrect) {
            const div = document.createElement('div');
            div.className = 'review-item';
            div.innerHTML = `
                <p><strong>${idx + 1}. ${item.question.question}</strong></p>
                <p style="color: var(--danger); margin-top:6px;">La teva resposta: ${item.selected || 'En blanc'}</p>
                <p style="color: var(--success); font-weight:600;">Correcta: ${item.question.correctAnswer}</p>
                <p style="color: var(--text-muted); font-size:0.9rem; margin-top:6px;">💡 ${item.question.explanation || ''}</p>
            `;
            reviewContainer.appendChild(div);
        }
    });
}

function showDashboard() {
    clearInterval(quizState.timerInterval);
    document.getElementById('view-quiz').classList.add('hidden');
    document.getElementById('view-results').classList.add('hidden');
    document.getElementById('view-dashboard').classList.remove('hidden');
    updateStatsUI();
}

function confirmExitQuiz() {
    if (confirm('Segur que vols sortir del test actual? Es perdrà el progrés d\'aquesta partida.')) {
        showDashboard();
    }
}
