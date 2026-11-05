import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const CEO_EMAIL = "gerardlopezgarcia1@gmail.com";

// Paràmetres Oficials d'Examen Mossos d'Esquadra
const EXAM_QUESTIONS_COUNT = 30; // 10 Àmbit A + 10 Àmbit B + 10 Àmbit C
const EXAM_DURATION_SECONDS = 35 * 60; // 35 minuts

// ==========================================
// MOTOR D'EMOJIS D'IPHONE (APPLE iOS) PER A WINDOWS I ANDROID
// ==========================================
const IS_APPLE_NATIVE = /Mac|iPod|iPhone|iPad/.test(navigator.platform) || (/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream);
const FE0F_ICONS = new Set(['2764', '23f1', '2699', '2620', '1f6e1', '270d', '1f5d1', '26a0', '1f441']);
let emojiObserver = null;

function applyAppleEmojis(root = document.body) {
    if (IS_APPLE_NATIVE || !window.twemoji || !root) return;
    if (emojiObserver) emojiObserver.disconnect();
    try {
        window.twemoji.parse(root, {
            className: 'apple-emoji',
            callback: (icon) => {
                const fileCode = FE0F_ICONS.has(icon) ? `${icon}-fe0f` : icon;
                return `https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.0.1/img/apple/64/${fileCode}.png`;
            },
            attributes: (rawText, iconId) => ({
                loading: 'lazy',
                onerror: `if(!this.dataset.retry){this.dataset.retry='1';this.src='https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.0.1/img/apple/64/${iconId}-fe0f.png';}else{this.onerror=null;this.src='https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${iconId}.svg';}`
            })
        });
    } catch (e) {}
    if (emojiObserver) {
        emojiObserver.observe(document.body, { childList: true, subtree: true });
    }
}

function initAppleEmojiEngine() {
    if (IS_APPLE_NATIVE) return;
    applyAppleEmojis(document.body);
    let scheduled = false;
    emojiObserver = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            applyAppleEmojis(document.body);
        });
    });
    emojiObserver.observe(document.body, { childList: true, subtree: true });
}

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

// Títols Oficials dels 20 Temes de la Guia d'Estudi Mossos d'Esquadra
const TOPIC_NAMES = {
    a1: "Història de Catalunya I",
    a2: "Història de Catalunya II",
    a3: "Àmbit sociolingüístic",
    a4: "Marc geogràfic i organització territorial",
    a5: "Canvis socials, culturals i demogràfics",
    a6: "Marc econòmic i laboral",
    a7: "Tecnologies de la informació",
    b1: "L'Estatut d'autonomia de Catalunya",
    b2: "Les institucions polítiques de Catalunya",
    b3: "L'ordenament jurídic i l'Administració",
    b4: "La Constitució espanyola i l'Estat",
    b5: "Drets humans i drets fonamentals",
    b6: "La Unió Europea i les seves institucions",
    b7: "L'Administració de justícia",
    b8: "El Departament d'Interior i Seguretat Pública",
    c1: "Les forces i cossos de seguretat",
    c2: "La Llei de la Policia de la Generalitat",
    c3: "El codi deontològic policial",
    c4: "Àmbit penal i processal penal",
    c5: "Seguretat ciutadana i policia administrativa"
};

const TOPICS = {
    A: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'],
    B: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'],
    C: ['c1', 'c2', 'c3', 'c4', 'c5']
};
const ALL_FILES = [...TOPICS.A, ...TOPICS.B, ...TOPICS.C];

const CURIOSITIES = [
    "Abans de ser comissària en cap, Sílvia Catà era la cap de la Regió Policial de Girona, i va entrar al cos el 1998?",
    "El Cos de Mossos d'Esquadra és la força policial civil més antiga d'Europa en actiu, fundada el 1719 a Valls per Pere Anton Veciana?",
    "L'Institut de Seguretat Pública de Catalunya (ISPC), on es formen els aspirants a mosso/a, es troba a Mollet del Vallès?",
    "En l'examen oficial de coneixements tens 35 minuts per respondre 30 preguntes, i cada resposta errònia resta 1/3 del valor d'un encert?",
    "Les espardenyes de vetes blaves formen part de la gala històrica dels Mossos d'Esquadra des del segle XVIII?"
];
let currentCuriosityIdx = 0;

const questionCache = {};
let allUsersCache = [];
let currentUploadTargetCode = null;
let currentManagedTopicCode = null;
let currentManagedQuestions = [];
let recommendedTopicCode = 'a1';

let userStats = JSON.parse(localStorage.getItem('oppostest_pro_stats')) || {
    displayName: 'Opositor',
    avatar: '👮‍♂️',
    goal: 'Escriu per què vols ser mosso/a: t\'ho recordarem aquí els dies que costi. ✍️',
    xp: 0,
    dailyStreak: 0,
    lastStudyDate: null,
    todayDate: null,
    todayQuestionsCount: 0,
    lastActivity: null,
    bestStreak: 0,
    seenQuestions: [],
    failedQuestions: [],
    savedQuestions: [],
    simulacreHistory: [],
    topicScores: {},
    freeProTrialsUsed: 0,
    unlockedExams: 0,
    redeemedFriend: false,
    banned: false
};

if (!Array.isArray(userStats.seenQuestions)) userStats.seenQuestions = [];
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
// ALGORITME DE PRIORITAT A PREGUNTES NO VISTES
// ==========================================
function getQuestionKey(q) {
    return (q.question || '').trim().slice(0, 90);
}

function markQuestionAsSeen(q) {
    const key = getQuestionKey(q);
    if (!key) return;
    if (!userStats.seenQuestions.includes(key)) {
        userStats.seenQuestions.push(key);
    }
}

function selectQuestionsPrioritizingUnseen(pool, count) {
    const seenSet = new Set(userStats.seenQuestions || []);
    const unseen = [];
    const seen = [];

    pool.forEach(q => {
        if (seenSet.has(getQuestionKey(q))) {
            seen.push(q);
        } else {
            unseen.push(q);
        }
    });

    const prioritized = [...shuffle(unseen), ...shuffle(seen)];
    return prioritized.slice(0, count);
}

// ==========================================
// PANTALLA DE CÀRREGA INICIAL
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
// INICIALITZACIÓ (ESPERA TEMARI + NOTÍCIES 3CATINFO + EMOJIS iOS)
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    initAppleEmojiEngine();
    updateSplashProgress(15, 'Preparant tauler i estadístiques...');
    initFirebaseListeners();
    initKeyboardShortcuts();

    updateSplashProgress(45, 'Sincronitzant els 20 temes des del núvol...');
    await fetchQuestionsFromCodes(ALL_FILES);

    renderTopicNodes();
    updateStatsUI();

    updateSplashProgress(78, 'Carregant últimes notícies d\'actualitat de 3CatInfo...');
    await Promise.all([
        load3CatInfoNews(),
        loadGlobalAlert(),
        loadLiveEventBanner()
    ]);

    hideSplashLoader();
});

// ==========================================
// NOTÍCIES ESPECÍFIQUES DE 3CATINFO ARTICLE PER ARTICLE
// ==========================================
function fetchWithTimeout(url, ms = 4200) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

function normalize3CatArticleUrl(rawUrl) {
    if (!rawUrl) return "https://www.3cat.cat/3catinfo/";
    return rawUrl
        .trim()
        .replace("http://", "https://")
        .replace("https://www.ccma.cat/324/", "https://www.3cat.cat/3catinfo/");
}

function parseRssXmlItems(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    const nodes = Array.from(xmlDoc.querySelectorAll("item"));
    if (!nodes.length) throw new Error("Cap article XML");

    return nodes.slice(0, 12).map(node => {
        const rawTitle = node.querySelector("title")?.textContent || "";
        const rawLink = node.querySelector("link")?.textContent || node.querySelector("guid")?.textContent || "";
        const rawDate = node.querySelector("pubDate")?.textContent || "";
        return {
            title: rawTitle.replace(/<!\[CDATA\[|\]\]>/g, "").trim(),
            link: normalize3CatArticleUrl(rawLink),
            time: formatNewsTime(rawDate)
        };
    }).filter(item => item.title && item.link.includes("/noticia/"));
}

async function fetch3CatArticlesFromSources() {
    const officialRssUrl = "https://api.ccma.cat/noticies?_format=rss&origen=frontal&frontal=n324-portada-noticia&version=2.0";

    const cached = sessionStorage.getItem('oppostest_3cat_news_v2');
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.ts < 10 * 60 * 1000 && parsed.items?.length > 0) {
                return parsed.items;
            }
        } catch (e) {}
    }

    const viaRss2Json = async () => {
        const res = await fetchWithTimeout(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(officialRssUrl)}`);
        if (!res.ok) throw new Error("rss2json ko");
        const data = await res.json();
        if (!data.items || !data.items.length) throw new Error("rss2json buit");
        const list = data.items.slice(0, 12).map(item => ({
            title: (item.title || "").trim(),
            link: normalize3CatArticleUrl(item.link || item.guid),
            time: formatNewsTime(item.pubDate)
        })).filter(i => i.title);
        if (!list.length) throw new Error("cap titular");
        return list;
    };

    const viaDirectXml = async () => {
        const res = await fetchWithTimeout(officialRssUrl);
        if (!res.ok) throw new Error("direct ko");
        const list = parseRssXmlItems(await res.text());
        if (!list.length) throw new Error("direct buit");
        return list;
    };

    const viaCorsProxy = async () => {
        const res = await fetchWithTimeout(`https://corsproxy.io/?${encodeURIComponent(officialRssUrl)}`);
        if (!res.ok) throw new Error("corsproxy ko");
        const list = parseRssXmlItems(await res.text());
        if (!list.length) throw new Error("corsproxy buit");
        return list;
    };

    const viaAllOrigins = async () => {
        const res = await fetchWithTimeout(`https://api.allorigins.win/raw?url=${encodeURIComponent(officialRssUrl)}`);
        if (!res.ok) throw new Error("allorigins ko");
        const list = parseRssXmlItems(await res.text());
        if (!list.length) throw new Error("allorigins buit");
        return list;
    };

    const items = await Promise.any([viaRss2Json(), viaDirectXml(), viaCorsProxy(), viaAllOrigins()]);
    sessionStorage.setItem('oppostest_3cat_news_v2', JSON.stringify({ ts: Date.now(), items }));
    return items;
}

async function load3CatInfoNews() {
    const track = document.getElementById('news-carousel-track');
    if (!track) return;

    let items = [];
    try {
        items = await fetch3CatArticlesFromSources();
    } catch (e) {
        console.warn("Usant articles de reserva de 3CatInfo:", e);
    }

    if (!items || items.length === 0) {
        items = [
            {
                title: "El president d'Adif dimiteix hores després del nomenament de Cuerpo al capdavant de Transports",
                link: "https://www.3cat.cat/3catinfo/el-president-dadif-dimiteix-hores-despres-del-nomenament-de-cuerpo-al-capdavant-de-transports/noticia/3437955/",
                time: "Avui · 20:12"
            },
            {
                title: "El Departament d'Interior reforça el desplegament operatiu dels Mossos d'Esquadra a Catalunya",
                link: "https://www.3cat.cat/3catinfo/societat/",
                time: "Avui · 19:45"
            },
            {
                title: "El Parlament de Catalunya debat les noves mesures institucionals i pressupostàries de la legislatura",
                link: "https://www.3cat.cat/3catinfo/politica/",
                time: "Avui · 18:30"
            },
            {
                title: "La Unió Europea aprova el nou marc regulador de seguretat i cooperació policial transfronterera",
                link: "https://www.3cat.cat/3catinfo/mon/",
                time: "Avui · 17:15"
            }
        ];
    }

    track.innerHTML = '';
    items.forEach(news => {
        const a = document.createElement('a');
        a.className = 'mq-news-card';
        a.href = news.link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.innerHTML = `
            <h4>${news.title}</h4>
            <div class="mq-news-foot">
                <span>${news.time}</span>
                <span>Llegeix-la ↗</span>
            </div>
        `;
        track.appendChild(a);
    });
}

function formatNewsTime(pubDateStr) {
    if (!pubDateStr) return "Avui · 3CatInfo";
    const d = new Date(pubDateStr.replace(/-/g, '/'));
    const parsed = isNaN(d.getTime()) ? new Date(pubDateStr) : d;
    if (isNaN(parsed.getTime())) return "Avui · 3CatInfo";

    const now = new Date();
    const isToday = parsed.toDateString() === now.toDateString();
    const hh = parsed.getHours().toString().padStart(2, '0');
    const mm = parsed.getMinutes().toString().padStart(2, '0');
    return isToday ? `Avui · ${hh}:${mm}` : `${parsed.getDate()}/${parsed.getMonth() + 1} · ${hh}:${mm}`;
}

function scrollNewsCarousel(direction) {
    const track = document.getElementById('news-carousel-track');
    if (!track) return;
    const scrollAmount = track.clientWidth * 0.75;
    track.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
}

// ==========================================
// BENTO DASHBOARD
// ==========================================
function calculatePoliceRank(xp) {
    const ranks = [
        { name: 'Aspirant', min: 0, next: 500, nextName: 'Alumne/a ISPC' },
        { name: 'Alumne/a ISPC', min: 500, next: 1500, nextName: 'Mosso/a' },
        { name: 'Mosso/a', min: 1500, next: 3500, nextName: 'Caporal/a' },
        { name: 'Caporal/a', min: 3500, next: 7000, nextName: 'Sergent/a' },
        { name: 'Sergent/a', min: 7000, next: 12000, nextName: 'Sotsinspector/a' },
        { name: 'Sotsinspector/a', min: 12000, next: 20000, nextName: 'Inspector/a' },
        { name: 'Inspector/a', min: 20000, next: 35000, nextName: 'Intendent/a' },
        { name: 'Comissari/ària', min: 35000, next: 100000, nextName: 'Màxim Rang' }
    ];
    let current = ranks[0];
    for (const r of ranks) {
        if (xp >= r.min) current = r;
    }
    const pct = Math.min(100, Math.round(((xp - current.min) / (current.next - current.min)) * 100));
    const missing = Math.max(0, current.next - xp);
    return { ...current, pct, missing };
}

function updateBentoDashboard() {
    const scores = userStats.topicScores || {};
    let chosenCode = ALL_FILES.find(c => scores[c] === undefined) || ALL_FILES[0];
    if (Object.keys(scores).length === ALL_FILES.length) {
        chosenCode = ALL_FILES.reduce((lowest, c) => (scores[c] < scores[lowest] ? c : lowest), ALL_FILES[0]);
    }
    recommendedTopicCode = chosenCode;

    document.getElementById('mq-prop-code').textContent = `AVUI ET PROPOSEM · TEMA ${chosenCode.toUpperCase()}`;
    document.getElementById('mq-prop-title').textContent = TOPIC_NAMES[chosenCode] || `Tema ${chosenCode.toUpperCase()}`;
    document.getElementById('mq-prop-status').textContent = scores[chosenCode] === undefined
        ? "Encara no l'has treballat · Prioritat preguntes noves"
        : `Última nota: ${scores[chosenCode].toFixed(1)} · Continua practicant preguntes no vistes`;

    const rInfo = calculatePoliceRank(userStats.xp || 0);
    document.getElementById('mq-rank-name').textContent = rInfo.name;
    document.getElementById('mq-rank-bar').style.width = `${rInfo.pct}%`;
    document.getElementById('mq-rank-next').textContent = `${rInfo.missing} XP per a ${rInfo.nextName}`;

    const today = getTodayStr();
    if (userStats.todayDate !== today) {
        userStats.todayDate = today;
        userStats.todayQuestionsCount = 0;
    }
    const doneToday = userStats.todayQuestionsCount || 0;
    const leftToday = Math.max(0, 100 - doneToday);
    document.getElementById('mq-today-count').textContent = doneToday;
    document.getElementById('mq-today-bar').style.width = `${Math.min(100, doneToday)}%`;
    document.getElementById('mq-today-left').textContent = leftToday === 0
        ? "🎉 Objectiu diari de 100 preguntes superat!"
        : `En falten ${leftToday} per l'objectiu d'avui`;

    let totalBankQuestions = 0;
    ALL_FILES.forEach(c => { totalBankQuestions += (questionCache[c]?.length || 0); });
    const seenCount = (userStats.seenQuestions || []).length;
    const seenPct = totalBankQuestions > 0 ? Math.min(100, Math.round((seenCount / totalBankQuestions) * 100)) : 0;
    const workedTopics = Object.keys(scores).length;

    document.getElementById('mq-prog-headline').textContent = seenPct > 0 ? `${seenPct}% completat` : 'Comencem!';
    document.getElementById('mq-prog-seen').textContent = `● Temari vist: ${seenCount} de ${totalBankQuestions || '...'} preg. (${seenPct}%)`;
    document.getElementById('mq-prog-topics').textContent = `● Temes treballats: ${workedTopics} de 20`;

    if (userStats.lastActivity && userStats.lastActivity.grade !== undefined) {
        document.getElementById('mq-last-grade').textContent = userStats.lastActivity.grade;
        document.getElementById('mq-last-topic').textContent = userStats.lastActivity.topic;
        document.getElementById('mq-last-time').textContent = userStats.lastActivity.dateStr || 'Completat recentment';
    }

    document.getElementById('mq-why-text').textContent = userStats.goal || "Escriu per què vols ser mosso/a: t'ho recordarem aquí els dies que costi. ✍️";
}

function startRecommendedTopic() {
    startTopic(recommendedTopicCode, 'tab-learn');
}

function nextCuriosity() {
    currentCuriosityIdx = (currentCuriosityIdx + 1) % CURIOSITIES.length;
    document.getElementById('mq-curiosity-text').textContent = CURIOSITIES[currentCuriosityIdx];
}

function editPersonalWhy() {
    showModal({
        icon: '💌',
        title: 'El teu per què',
        text: 'Escriu el motiu pel qual vols entrar al Cos de Mossos d\'Esquadra. Es mostrarà a la teva pantalla principal per motivar-te cada dia:',
        showInput: true,
        placeholder: 'Ex: Vull aconseguir la meva plaça a la propera convocatòria...',
        confirmText: 'Guardar Motivació',
        onConfirm: (val) => {
            if (!val) return;
            userStats.goal = val;
            saveStats();
            showToast('Motivació personal guardada!', 'success');
        }
    });
}

// ==========================================
// PESTANYA SEPARADA DE TEMARI I FILTRE D'ÀMBITS
// ==========================================
function filterTemariAmbit(ambit) {
    ['A', 'B', 'C'].forEach(letter => {
        const block = document.getElementById(`temari-block-${letter}`);
        if (!block) return;
        if (ambit === 'ALL' || ambit === letter) {
            block.classList.remove('hidden');
        } else {
            block.classList.add('hidden');
        }
    });
}

function renderTopicNodes() {
    const seenSet = new Set(userStats.seenQuestions || []);

    ['A', 'B', 'C'].forEach(ambit => {
        const container = document.getElementById(`nodes-${ambit}`);
        if (!container) return;
        container.innerHTML = '';

        TOPICS[ambit].forEach(code => {
            const topicQs = questionCache[code] || [];
            const totalQ = topicQs.length;
            const seenInTopic = topicQs.filter(q => seenSet.has(getQuestionKey(q))).length;
            const pctSeen = totalQ > 0 ? Math.round((seenInTopic / totalQ) * 100) : 0;

            const lastScore = userStats.topicScores?.[code];
            const scoreLabel = lastScore !== undefined ? `Última nota: ${lastScore.toFixed(1)}` : 'Encara no fet';

            const btn = document.createElement('button');
            btn.className = 'topic-clean-card';
            btn.innerHTML = `
                <div class="tc-top">
                    <span class="tc-badge">TEMA ${code.toUpperCase()}</span>
                    <span class="tc-grade">${scoreLabel}</span>
                </div>
                <div class="tc-title">${TOPIC_NAMES[code] || `Tema ${code.toUpperCase()}`}</div>
                <div class="tc-progress-row">
                    <div class="mq-mini-bar"><div class="mq-mini-fill" style="width:${pctSeen}%"></div></div>
                    <div class="tc-progress-meta">
                        <span>${seenInTopic} / ${totalQ} vistes</span>
                        <span>${pctSeen}%</span>
                    </div>
                </div>
            `;
            btn.onclick = () => startTopic(code, 'tab-temari');
            container.appendChild(btn);
        });
    });
}

// ==========================================
// GESTIÓ ESTRICTA DEL COLOR ACTIU DE LES PESTANYES
// ==========================================
function openView(viewId, activeTabId) {
    const allViews = [
        'view-learn', 'view-temari', 'view-simulacre-hub', 'view-errors-hub',
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
        btn.blur();
    });

    const targetTab = document.getElementById(activeTabId);
    if (targetTab) targetTab.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function returnAfterResults() {
    const tabMap = {
        'tab-temari': 'temari',
        'tab-simulacre': 'simulacre',
        'tab-errors': 'errors'
    };
    switchTab(tabMap[quizState.originTab] || 'learn');
}

function isUserPro() {
    if (currentUser?.email.toLowerCase() === CEO_EMAIL.toLowerCase()) return true;
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

    updateBentoDashboard();
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
                goal: userStats.goal || '',
                xp: userStats.xp,
                dailyStreak: userStats.dailyStreak,
                lastStudyDate: userStats.lastStudyDate,
                todayDate: userStats.todayDate,
                todayQuestionsCount: userStats.todayQuestionsCount || 0,
                lastActivity: userStats.lastActivity || null,
                bestStreak: userStats.bestStreak,
                seenQuestions: (userStats.seenQuestions || []).slice(-1500),
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
        const btnEmoji = btn.dataset.emoji || btn.querySelector('img')?.alt || btn.textContent.trim();
        btn.classList.toggle('selected', btnEmoji === (userStats.avatar || '👮‍♂️'));
    });

    const scoresObj = userStats.topicScores || {};
    const keys = Object.keys(scoresObj);
    const avg = keys.length > 0 ? (keys.reduce((a, k) => a + scoresObj[k], 0) / keys.length).toFixed(2) : '0.00';
    const passed = keys.filter(k => scoresObj[k] >= 5).length;

    document.getElementById('prof-stat-pro').textContent = isUserPro() ? '💎 PRO ACTIU' : 'PLA GRATUÏT';
    document.getElementById('prof-stat-seen-count').textContent = `${(userStats.seenQuestions || []).length} preg.`;
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
        const btnEmoji = btn.dataset.emoji || btn.querySelector('img')?.alt || btn.textContent.trim();
        btn.classList.toggle('selected', btnEmoji === emoji);
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

function resetSeenQuestionsHistory() {
    showModal({
        icon: '♻️',
        title: 'Reiniciar el comptador de preguntes vistes?',
        text: 'Es posarà a zero el registre de preguntes vistes de tots els temes perquè puguis tornar a fer tot el banc com si fos nou.',
        confirmText: 'Sí, Reiniciar',
        onConfirm: async () => {
            userStats.seenQuestions = [];
            await saveStats();
            renderProfileView();
            showToast('Historial de preguntes vistes reiniciat!', 'success');
        }
    });
}

async function forceReloadQuestionBanks() {
    showSplashLoader('Sincronitzant els 20 temes amb Firestore...');
    ALL_FILES.forEach(code => clearLocalBankCache(code));
    await fetchQuestionsFromCodes(ALL_FILES, true);
    renderTopicNodes();
    updateStatsUI();
    hideSplashLoader();
    showToast('✅ Temari actualitzat des del núvol!', 'success');
}

// ==========================================
// AUTENTICACIÓ, BLOQUEIG BAN I PERFIL CEO
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
                userStats.goal = data.goal || userStats.goal;
                userStats.xp = Math.max(userStats.xp, data.xp || 0);
                userStats.dailyStreak = Math.max(userStats.dailyStreak, data.dailyStreak || 0);
                userStats.lastStudyDate = data.lastStudyDate || userStats.lastStudyDate;
                userStats.todayDate = data.todayDate || userStats.todayDate;
                userStats.todayQuestionsCount = Math.max(userStats.todayQuestionsCount || 0, data.todayQuestionsCount || 0);
                userStats.lastActivity = data.lastActivity || userStats.lastActivity;
                userStats.bestStreak = Math.max(userStats.bestStreak, data.bestStreak || 0);
                userStats.seenQuestions = Array.from(new Set([...(userStats.seenQuestions || []), ...(data.seenQuestions || [])]));
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
            text: 'Gaudeix d\'accés il·limitat a tots els Simulacres Oficials Ponderats (30 preguntes, 35 minuts) i al Top Fallades de Catalunya.',
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
// SIMULACRE PONDERAT (10 A + 10 B + 10 C) I GENERADORS AMB PRIORITAT NO VISTES
// ==========================================
async function buildWeightedSimulacreQuestions() {
    const [poolA, poolB, poolC] = await Promise.all([
        fetchQuestionsFromCodes(TOPICS.A),
        fetchQuestionsFromCodes(TOPICS.B),
        fetchQuestionsFromCodes(TOPICS.C)
    ]);

    const qA = selectQuestionsPrioritizingUnseen(poolA, 10);
    const qB = selectQuestionsPrioritizingUnseen(poolB, 10);
    const qC = selectQuestionsPrioritizingUnseen(poolC, 10);

    return shuffle([...qA, ...qB, ...qC]);
}

function checkProAccessOrTrial(callback) {
    if (isUserPro()) {
        callback();
        return;
    }
    if ((userStats.freeProTrialsUsed || 0) < 1) {
        showModal({
            icon: '🎁',
            title: 'Prova Gratuïta de Mode PRO',
            text: 'Aquest és un mode exclusiu PRO. Et regalem 1 examen oficial ponderat de prova gratuït!',
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
        const weightedQuestions = await buildWeightedSimulacreQuestions();
        if (!weightedQuestions.length) return showToast('No s\'han pogut carregar les preguntes.', 'error');
        initQuiz('simulacre', '⏱️ SIMULACRE OFICIAL PONDERAT (10A+10B+10C)', weightedQuestions, EXAM_DURATION_SECONDS, null, 'tab-simulacre');
    });
}

function openCustomTestModal() {
    showModal({
        icon: '⚙️',
        title: 'Configurador de Test a Mida',
        html: `
            <div style="text-align:left;">
                <label class="form-label">1. Selecciona el Bloc o Àmbit:</label>
                <select id="custom-ambit-sel" class="duo-input">
                    <option value="ALL">Ponderat dels 3 Àmbits (A + B + C)</option>
                    <option value="A">Només Àmbit A (Coneixements de l'entorn)</option>
                    <option value="B">Només Àmbit B (Institucional)</option>
                    <option value="C">Només Àmbit C (Seguretat i Policia)</option>
                </select>
                <label class="form-label mt-2">2. Nombre de preguntes (Prioritza no vistes):</label>
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

            const selected = selectQuestionsPrioritizingUnseen(q, countVal);
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

async function startTopic(code, originTab = 'tab-temari') {
    const q = await fetchQuestionsFromCodes([code]);
    if (!q.length) return showToast(`No hi ha preguntes disponibles al Tema ${code.toUpperCase()}`, 'error');
    const selected = selectQuestionsPrioritizingUnseen(q, 20);
    initQuiz('study', `TEMA ${code.toUpperCase()} · ${TOPIC_NAMES[code] || ''}`, selected, 0, code, originTab);
}

async function startAmbit(letter) {
    const q = await fetchQuestionsFromCodes(TOPICS[letter]);
    if (!q.length) return;
    const selected = selectQuestionsPrioritizingUnseen(q, 25);
    initQuiz('study', `ÀMBIT ${letter}`, selected, 0, null, 'tab-temari');
}

async function startSurvival() {
    const q = await fetchQuestionsFromCodes(ALL_FILES);
    if (!q.length) return;
    const selected = selectQuestionsPrioritizingUnseen(q, q.length);
    initQuiz('survival', '🔥 MODE SUPERVIVÈNCIA', selected, 0, null, 'tab-learn');
}

function startCommunityFailures() {
    checkProAccessOrTrial(async () => {
        try {
            const snap = await getDoc(doc(db, "metrics", "top_failed"));
            if (snap.exists() && Array.isArray(snap.data().questions) && snap.data().questions.length >= 5) {
                initQuiz('study', '☠️ TOP FALLADES CATALUNYA', selectQuestionsPrioritizingUnseen(snap.data().questions, 25), 0, null, 'tab-learn');
                return;
            }
        } catch (e) {}
        const q = await fetchQuestionsFromCodes(ALL_FILES);
        initQuiz('study', '☠️ TOP FALLADES CATALUNYA', selectQuestionsPrioritizingUnseen(q, 25), 0, null, 'tab-learn');
    });
}

// ==========================================
// MOTOR DEL TEST + NAVEGADOR D'EXAMEN + COMPTADOR DIARI
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
        btn.dataset.optionValue = opt;
        if (quizState.mode === 'simulacre' && currentSimSelection === opt) {
            btn.classList.add('selected-sim');
        }
        btn.innerHTML = `<span class="opt-key">${letters[i]}</span> <span>${opt}</span>`;
        btn.onclick = () => selectAnswer(opt, btn);
        container.appendChild(btn);
    });
}

function incrementTodayQuestions(amount = 1) {
    const today = getTodayStr();
    if (userStats.todayDate !== today) {
        userStats.todayDate = today;
        userStats.todayQuestionsCount = 0;
    }
    userStats.todayQuestionsCount = (userStats.todayQuestionsCount || 0) + amount;
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

    markQuestionAsSeen(q);
    incrementTodayQuestions(1);

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
        const optVal = (b.dataset.optionValue || b.querySelector('span:last-child').textContent).trim();
        if (optVal === q.correctAnswer.trim()) b.classList.add('correct');
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
                markQuestionAsSeen(q);
                incrementTodayQuestions(1);
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

    userStats.lastActivity = {
        grade: quizState.mode === 'survival' ? `${quizState.correct}🔥` : gradeNum.toFixed(2),
        topic: quizState.topicCode ? `Tema ${quizState.topicCode.toUpperCase()}` : (quizState.mode === 'simulacre' ? 'Simulacre' : 'Test'),
        dateStr: `Avui · ${new Date().toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' })}`
    };

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
                <span>${medal} ${u.avatar || '👮‍♂️'} ${u.displayName || 'Opositor'} ${isPro ? '💎' : ''}</span>
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
    const weightedQuestions = await buildWeightedSimulacreQuestions();
    if (!weightedQuestions.length) return;
    initQuiz('simulacre', '🔴 ESDEVENIMENT OFICIAL EN VIU', weightedQuestions, EXAM_DURATION_SECONDS, null, 'tab-simulacre');
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
                <small class="muted-sm">${TOPIC_NAMES[code] || ''}</small>
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
        await loadSingleTopicCode(code, true);
        renderTopicNodes();
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
    document.getElementById('ceo-topic-modal-title').textContent = `Gestor de Preguntes · Tema ${code.toUpperCase()} (${TOPIC_NAMES[code] || ''})`;
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
                <div class="u-stat-box"><small>Preguntes Vistes</small><strong>👁️ ${(u.seenQuestions || []).length} preg.</strong></div>
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
        updateBentoDashboard();
    } else if (tab === 'temari') {
        openView('view-temari', 'tab-temari');
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
        onConfirm: () => returnAfterResults()
    });
}

// Exposar funcions al DOM
Object.assign(window, {
    switchTab, filterTemariAmbit, returnAfterResults, startRecommendedTopic, nextCuriosity,
    editPersonalWhy, scrollNewsCarousel, launchOfficialSimulacre, openCustomTestModal,
    launchErrorsQuiz, launchSavedQuiz, startSurvival, startCommunityFailures, startAmbit,
    startTopic, startLiveEvent, prevQuestion, nextQuestion, jumpToQuestion,
    toggleDoubtCurrent, clearCurrentAnswer, toggleSaveCurrentQuestion,
    confirmFinishSimulacre, confirmExitQuiz, handleAuthClick, forceSignOut, openProModal,
    copyReferralLink, redeemFriendCode, loadRanking, reportCurrentQuestion,
    selectProfileAvatar, saveUserProfileData, resetSeenQuestionsHistory,
    forceReloadQuestionBanks, ceoLoadBanksStatus, triggerUploadJson, handleJsonFileUpload,
    ceoDeleteBank, ceoDownloadBackup, openTopicManager, closeTopicManager,
    filterTopicQuestions, deleteSingleQuestionFromTopic, openAddQuestionToCurrentTopic,
    ceoSaveAlert, ceoClearAlert, ceoSaveEvent, ceoClearEvent, ceoLoadReports,
    ceoDeleteReport, ceoLoadUsers, ceoFilterUsers, ceoInspectUser,
    ceoTogglePro, ceoToggleBan, ceoDeleteUserAccount
});
