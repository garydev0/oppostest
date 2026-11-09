import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const CEO_EMAIL = "gerardlopezgarcia1@gmail.com";
const EXAM_QUESTIONS_COUNT = 30;
const EXAM_DURATION_SECONDS = 35 * 60;
const MAX_LIVES = 5;

// ==========================================
// 1. MOTOR D'EMOJIS D'IPHONE (EXCLOENT EL PANEL CEO + ZERO ICONES TRENCADES)
// ==========================================
const IS_APPLE_NATIVE = /Mac|iPod|iPhone|iPad/.test(navigator.platform) || (/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream);
let emojiObserver = null;

// Captura global d'errors d'imatge per assegurar que MAI surti cap icona trencada
window.addEventListener('error', (e) => {
    const img = e.target;
    if (!img || img.tagName !== 'IMG' || !img.classList.contains('apple-emoji')) return;

    const currentSrc = img.getAttribute('src') || '';
    if (!img.dataset.step) {
        img.dataset.step = '1';
        // Pas 1: Prova la variant amb selector -fe0f d'Apple
        img.src = currentSrc.replace(/\.png$/, '-fe0f.png');
    } else if (img.dataset.step === '1') {
        img.dataset.step = '2';
        // Pas 2: Si tampoc existeix amb -fe0f, restaura el caràcter original net sense trencar res
        const textNode = document.createTextNode(img.alt || '');
        img.replaceWith(textNode);
    }
}, true);

function parseNodeWithAppleEmojis(node) {
    if (!node || !window.twemoji) return;
    if (node.closest && node.closest('.no-apple-emoji')) return;
    window.twemoji.parse(node, {
        className: 'apple-emoji',
        callback: (icon) => `https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.0.1/img/apple/64/${icon}.png`
    });
}

function applyAppleEmojis() {
    if (IS_APPLE_NATIVE || !window.twemoji) return;
    if (emojiObserver) emojiObserver.disconnect();
    try {
        // Parseja totes les seccions de l'usuari EXCEPTE el Panel CEO (.no-apple-emoji)
        document.querySelectorAll('.duo-sidebar, .duo-topbar, #view-learn, #view-temari, #view-simulacre-hub, #view-errors-hub, #view-ranking, #view-profile, #view-quiz, #view-results, #ios-reward-overlay, #modal-overlay, #toast-container').forEach(el => {
            parseNodeWithAppleEmojis(el);
        });
    } catch (e) {}
    if (emojiObserver) {
        emojiObserver.observe(document.body, { childList: true, subtree: true });
    }
}

function initAppleEmojiEngine() {
    if (IS_APPLE_NATIVE) return;
    applyAppleEmojis();
    let scheduled = false;
    emojiObserver = new MutationObserver((mutations) => {
        // Ignora canvis dins del Panel CEO perquè sigui 100% instantani i estable
        const onlyCeo = mutations.every(m => m.target.closest && m.target.closest('.no-apple-emoji'));
        if (onlyCeo || scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            applyAppleEmojis();
        });
    });
    emojiObserver.observe(document.body, { childList: true, subtree: true });
}

// ==========================================
// 2. SINTETITZADOR D'ÀUDIO ESTIL iOS
// ==========================================
let audioCtx = null;

function playIosSound(type = 'correct') {
    if (userStats.soundEnabled === false) return;
    try {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            audioCtx = new AudioContextClass();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const now = audioCtx.currentTime;

        if (type === 'correct') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, now);
            osc.frequency.setValueAtTime(880, now + 0.085);
            gain.gain.setValueAtTime(0.11, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.33);
        } else if (type === 'wrong') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(170, now);
            osc.frequency.exponentialRampToValueAtTime(110, now + 0.16);
            gain.gain.setValueAtTime(0.13, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.19);
        } else if (type === 'reward') {
            [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + idx * 0.065);
                gain.gain.setValueAtTime(0.09, now + idx * 0.065);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.065 + 0.45);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now + idx * 0.065);
                osc.stop(now + idx * 0.065 + 0.46);
            });
        }
    } catch (e) {}
}

function toggleSound() {
    userStats.soundEnabled = !userStats.soundEnabled;
    updateStatsUI();
    if (userStats.soundEnabled) playIosSound('correct');
    saveStats();
}

// ==========================================
// 3. CONFIGURACIÓ FIREBASE I DADES
// ==========================================
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

const questionCache = {};
let allUsersCache = [];
let currentUploadTargetCode = null;
let currentManagedTopicCode = null;
let currentManagedQuestions = [];
let recommendedTopicCode = 'a1';

let userStats = JSON.parse(localStorage.getItem('oppostest_pro_stats')) || {
    displayName: 'Opositor',
    avatar: '👮',
    goal: 'Promoció Mossos d\'Esquadra',
    xp: 0,
    lives: MAX_LIVES,
    shields: 1,
    soundEnabled: true,
    dailyStreak: 0,
    lastStudyDate: null,
    lastWelcomePopupDate: null,
    todayDate: null,
    todayQuestionsCount: 0,
    todayErrorsFixed: 0,
    todayHighGradeDone: 0,
    todayChestClaimed: false,
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

if (typeof userStats.lives !== 'number') userStats.lives = MAX_LIVES;
if (typeof userStats.shields !== 'number') userStats.shields = 1;
if (typeof userStats.soundEnabled !== 'boolean') userStats.soundEnabled = true;
if (userStats.avatar === '👮‍♂️' || userStats.avatar === '👮‍♀️') userStats.avatar = '👮';
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
// 4. LES 5 FINESTRES EMERGENTS D'ASSOLIMENTS ESTIL iOS
// ==========================================
function animateRollingCounter(el, targetNum, prefix = '+', suffix = ' XP') {
    el.classList.remove('hidden');
    let current = 0;
    const step = Math.max(1, Math.ceil(targetNum / 22));
    const interval = setInterval(() => {
        current += step;
        if (current >= targetNum) {
            current = targetNum;
            clearInterval(interval);
        }
        el.textContent = `${prefix}${current}${suffix}`;
    }, 24);
}

function triggerIosRewardPopup({ badge = 'ASSOLIMENT', icon = '🔥', title, rollingTarget = null, rollingPrefix = '+', rollingSuffix = ' XP', html = '', primaryText = 'Continuar', secondaryText = null, onPrimary = null, onSecondary = null }) {
    playIosSound('reward');
    const overlay = document.getElementById('ios-reward-overlay');
    document.getElementById('reward-badge').textContent = badge;
    document.getElementById('reward-icon').textContent = icon;
    document.getElementById('reward-title').textContent = title;
    document.getElementById('reward-body').innerHTML = html;

    const counterEl = document.getElementById('reward-counter');
    if (rollingTarget !== null) {
        animateRollingCounter(counterEl, rollingTarget, rollingPrefix, rollingSuffix);
    } else {
        counterEl.classList.add('hidden');
    }

    const pBtn = document.getElementById('reward-primary-btn');
    const sBtn = document.getElementById('reward-secondary-btn');
    pBtn.textContent = primaryText;

    if (secondaryText) {
        sBtn.textContent = secondaryText;
        sBtn.classList.remove('hidden');
    } else {
        sBtn.classList.add('hidden');
    }

    overlay.classList.remove('hidden');

    pBtn.onclick = () => {
        overlay.classList.add('hidden');
        if (onPrimary) onPrimary();
    };
    sBtn.onclick = () => {
        overlay.classList.add('hidden');
        if (onSecondary) onSecondary();
    };
}

function showDailyStreakPopup() {
    const days = ['Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds', 'Dg'];
    const todayIdx = (new Date().getDay() + 6) % 7;
    const dotsHtml = days.map((d, i) => `<div class="day-dot ${i <= todayIdx ? 'active' : ''}">${i === todayIdx ? '🔥' : d}</div>`).join('');

    triggerIosRewardPopup({
        badge: 'RATXA DIÀRIA',
        icon: '🔥',
        title: `${userStats.dailyStreak || 1} dies seguits!`,
        rollingTarget: userStats.dailyStreak || 1,
        rollingPrefix: '',
        rollingSuffix: ' dies 🔥',
        html: `Completa les 3 missions d'avui per obrir el cofre.<div class="week-days-row">${dotsHtml}</div>`,
        primaryText: 'Entrenar ara'
    });
}

function claimDailyChest() {
    checkResetTodayCounters();
    if (userStats.todayChestClaimed) {
        showToast('Ja has obert el cofre d\'avui!', 'info');
        return;
    }
    const m1Done = (userStats.todayQuestionsCount || 0) >= 25;
    const m2Done = (userStats.todayErrorsFixed || 0) >= 3;
    const m3Done = (userStats.todayHighGradeDone || 0) >= 1;

    if (!m1Done || !m2Done || !m3Done) {
        showToast('Completa les 3 missions d\'avui per obrir el cofre!', 'info');
        return;
    }

    userStats.todayChestClaimed = true;
    userStats.xp += 100;
    userStats.shields = (userStats.shields || 0) + 1;
    userStats.lives = MAX_LIVES;
    saveStats();

    triggerIosRewardPopup({
        badge: 'COFRE DIARI OBERT',
        icon: '🎁',
        title: 'Missions Completades!',
        rollingTarget: 100,
        rollingPrefix: '+',
        rollingSuffix: ' XP ⚡',
        html: 'Has guanyat <b>+1 Escut de Ratxa</b> i hem recarregat les teves <b>5 vides ❤️</b>.',
        primaryText: 'Genial!'
    });
}

function openLivesModal() {
    if (isUserPro()) {
        triggerIosRewardPopup({
            badge: 'OPPOSTEST PRO',
            icon: '💎',
            title: 'Vides Infinites Actives',
            html: 'Tens el mode PRO actiu: pots entrenar sense límit d\'errors.',
            primaryText: 'Continuar'
        });
        return;
    }

    const errCount = (userStats.failedQuestions || []).length;
    triggerIosRewardPopup({
        badge: `${userStats.lives} / ${MAX_LIVES} VIDES`,
        icon: userStats.lives === 0 ? '💔' : '❤️',
        title: userStats.lives === 0 ? 'T\'has quedat sense vides!' : `Tens ${userStats.lives} vides`,
        html: errCount > 0
            ? `Cada pregunta que corregeixis a <b>Repàs</b> et retorna <b>+1 vida ❤️</b> gratis.`
            : `Si et quedes a 0 vides, pots recarregar-les gratis repassant errors o activar PRO.`,
        primaryText: errCount > 0 ? '🧠 Recuperar a Repàs' : '💎 Vides Infinites PRO',
        secondaryText: 'Tancar',
        onPrimary: () => {
            if (errCount > 0) switchTab('errors');
            else openProModal();
        }
    });
}

// ==========================================
// 5. ALGORITME DE PREGUNTES NO VISTES I RANGS
// ==========================================
function getQuestionKey(q) {
    return (q.question || '').trim().slice(0, 90);
}

function markQuestionAsSeen(q) {
    const key = getQuestionKey(q);
    if (key && !userStats.seenQuestions.includes(key)) {
        userStats.seenQuestions.push(key);
    }
}

function selectQuestionsPrioritizingUnseen(pool, count) {
    const seenSet = new Set(userStats.seenQuestions || []);
    const unseen = [];
    const seen = [];
    pool.forEach(q => {
        if (seenSet.has(getQuestionKey(q))) seen.push(q);
        else unseen.push(q);
    });
    return [...shuffle(unseen), ...shuffle(seen)].slice(0, count);
}

function calculatePoliceRank(xp) {
    const ranks = [
        { name: 'Aspirant', icon: '🔰', min: 0, next: 500 },
        { name: 'Alumne ISPC', icon: '📘', min: 500, next: 1500 },
        { name: 'Mosso/a', icon: '👮', min: 1500, next: 3500 },
        { name: 'Caporal/a', icon: '🏅', min: 3500, next: 7000 },
        { name: 'Sergent/a', icon: '⭐', min: 7000, next: 12000 },
        { name: 'Sotsinspector/a', icon: '🌟', min: 12000, next: 20000 },
        { name: 'Inspector/a', icon: '🦅', min: 20000, next: 35000 },
        { name: 'Comissari/ària', icon: '👑', min: 35000, next: 100000 }
    ];
    let current = ranks[0];
    for (const r of ranks) {
        if (xp >= r.min) current = r;
    }
    return current;
}

// ==========================================
// 6. SPLASH, MODALS I TOASTS
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
        setTimeout(() => {
            splash.classList.add('hidden');
            checkWelcomeDailyPopup();
        }, 300);
    }, 150);
}

function checkWelcomeDailyPopup() {
    const today = getTodayStr();
    if (userStats.lastWelcomePopupDate !== today) {
        userStats.lastWelcomePopupDate = today;
        saveStats();
        setTimeout(() => showDailyStreakPopup(), 350);
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
}

function showModal({ icon = '💡', title, text, html = null, showInput = false, placeholder = '', confirmText = 'Acceptar', cancelText = 'Cancel·lar', onConfirm }) {
    const overlay = document.getElementById('modal-overlay');
    document.getElementById('modal-icon').textContent = icon;
    document.getElementById('modal-title').textContent = title;

    const textEl = document.getElementById('modal-text');
    if (html) textEl.innerHTML = html;
    else textEl.textContent = text || '';

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
// 7. INICIALITZACIÓ I NOTÍCIES 3CATINFO
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    initAppleEmojiEngine();
    updateSplashProgress(20, 'Preparant tauler...');
    initFirebaseListeners();
    initKeyboardShortcuts();

    updateSplashProgress(50, 'Sincronitzant temari...');
    await fetchQuestionsFromCodes(ALL_FILES);

    renderTopicNodes();
    updateStatsUI();

    updateSplashProgress(80, 'Carregant 3CatInfo...');
    await Promise.all([
        load3CatInfoNews(),
        loadGlobalAlert(),
        loadLiveEventBanner()
    ]);

    hideSplashLoader();
});

function fetchWithTimeout(url, ms = 4200) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

function normalize3CatArticleUrl(rawUrl) {
    if (!rawUrl) return "https://www.3cat.cat/3catinfo/";
    return rawUrl.trim().replace("http://", "https://").replace("https://www.ccma.cat/324/", "https://www.3cat.cat/3catinfo/");
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
            if (Date.now() - parsed.ts < 10 * 60 * 1000 && parsed.items?.length > 0) return parsed.items;
        } catch (e) {}
    }

    const viaRss2Json = async () => {
        const res = await fetchWithTimeout(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(officialRssUrl)}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const list = (data.items || []).slice(0, 12).map(item => ({
            title: (item.title || "").trim(),
            link: normalize3CatArticleUrl(item.link || item.guid),
            time: formatNewsTime(item.pubDate)
        })).filter(i => i.title);
        if (!list.length) throw new Error();
        return list;
    };

    const viaCorsProxy = async () => {
        const res = await fetchWithTimeout(`https://corsproxy.io/?${encodeURIComponent(officialRssUrl)}`);
        if (!res.ok) throw new Error();
        return parseRssXmlItems(await res.text());
    };

    const viaAllOrigins = async () => {
        const res = await fetchWithTimeout(`https://api.allorigins.win/raw?url=${encodeURIComponent(officialRssUrl)}`);
        if (!res.ok) throw new Error();
        return parseRssXmlItems(await res.text());
    };

    const items = await Promise.any([viaRss2Json(), viaCorsProxy(), viaAllOrigins()]);
    sessionStorage.setItem('oppostest_3cat_news_v2', JSON.stringify({ ts: Date.now(), items }));
    return items;
}

async function load3CatInfoNews() {
    const track = document.getElementById('news-carousel-track');
    if (!track) return;
    let items = [];
    try { items = await fetch3CatArticlesFromSources(); } catch (e) {}

    if (!items || items.length === 0) {
        items = [
            { title: "El president d'Adif dimiteix hores després del nomenament de Cuerpo al capdavant de Transports", link: "https://www.3cat.cat/3catinfo/el-president-dadif-dimiteix-hores-despres-del-nomenament-de-cuerpo-al-capdavant-de-transports/noticia/3437955/", time: "Avui" },
            { title: "El Departament d'Interior reforça el desplegament operatiu dels Mossos d'Esquadra a Catalunya", link: "https://www.3cat.cat/3catinfo/societat/", time: "Avui" },
            { title: "El Parlament de Catalunya debat les noves mesures institucionals de la legislatura", link: "https://www.3cat.cat/3catinfo/politica/", time: "Avui" },
            { title: "La Unió Europea aprova el nou marc regulador de seguretat i cooperació policial", link: "https://www.3cat.cat/3catinfo/mon/", time: "Avui" }
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
                <span>Llegir ↗</span>
            </div>
        `;
        track.appendChild(a);
    });
}

function formatNewsTime(pubDateStr) {
    if (!pubDateStr) return "Avui";
    const d = new Date(pubDateStr.replace(/-/g, '/'));
    const parsed = isNaN(d.getTime()) ? new Date(pubDateStr) : d;
    if (isNaN(parsed.getTime())) return "Avui";
    const hh = parsed.getHours().toString().padStart(2, '0');
    const mm = parsed.getMinutes().toString().padStart(2, '0');
    return `Avui · ${hh}:${mm}`;
}

function scrollNewsCarousel(direction) {
    const track = document.getElementById('news-carousel-track');
    if (track) track.scrollBy({ left: direction * (track.clientWidth * 0.75), behavior: 'smooth' });
}

// ==========================================
// 8. ACTUALITZACIÓ D'INTERFÍCIE D'INICI I MISSIONS
// ==========================================
function checkResetTodayCounters() {
    const today = getTodayStr();
    if (userStats.todayDate !== today) {
        userStats.todayDate = today;
        userStats.todayQuestionsCount = 0;
        userStats.todayErrorsFixed = 0;
        userStats.todayHighGradeDone = 0;
        userStats.todayChestClaimed = false;
    }
}

function updateHomeDashboard() {
    checkResetTodayCounters();
    const scores = userStats.topicScores || {};
    let chosenCode = ALL_FILES.find(c => scores[c] === undefined) || ALL_FILES[0];
    if (Object.keys(scores).length === ALL_FILES.length) {
        chosenCode = ALL_FILES.reduce((lowest, c) => (scores[c] < scores[lowest] ? c : lowest), ALL_FILES[0]);
    }
    recommendedTopicCode = chosenCode;

    const seenSet = new Set(userStats.seenQuestions || []);
    const topicQs = questionCache[chosenCode] || [];
    const seenInTopic = topicQs.filter(q => seenSet.has(getQuestionKey(q))).length;
    const pctSeen = topicQs.length > 0 ? Math.round((seenInTopic / topicQs.length) * 100) : 0;

    const offset = 264 - (264 * pctSeen) / 100;
    const ringEl = document.getElementById('home-ring-fill');
    if (ringEl) ringEl.style.strokeDashoffset = offset;

    document.getElementById('home-topic-code').textContent = chosenCode.toUpperCase();
    document.getElementById('home-topic-pct').textContent = `${pctSeen}%`;
    document.getElementById('home-topic-title').textContent = TOPIC_NAMES[chosenCode] || `Tema ${chosenCode.toUpperCase()}`;
    document.getElementById('home-topic-sub').textContent = scores[chosenCode] !== undefined
        ? `Nota: ${scores[chosenCode].toFixed(1)} · ${seenInTopic}/${topicQs.length} vistes`
        : `${seenInTopic}/${topicQs.length} vistes`;

    const rInfo = calculatePoliceRank(userStats.xp || 0);
    document.getElementById('home-rank-pill').textContent = `${rInfo.icon} ${rInfo.name}`;
    document.getElementById('home-shield-pill').textContent = `🔰 ${userStats.shields || 0} escuts`;

    const qDone = Math.min(25, userStats.todayQuestionsCount || 0);
    const eDone = Math.min(3, userStats.todayErrorsFixed || 0);
    const gDone = Math.min(1, userStats.todayHighGradeDone || 0);

    document.getElementById('m1-text').textContent = `${qDone}/25`;
    document.getElementById('m1-bar').style.width = `${(qDone / 25) * 100}%`;

    document.getElementById('m2-text').textContent = `${eDone}/3`;
    document.getElementById('m2-bar').style.width = `${(eDone / 3) * 100}%`;

    document.getElementById('m3-text').textContent = `${gDone}/1`;
    document.getElementById('m3-bar').style.width = `${gDone * 100}%`;

    const chestBtn = document.getElementById('btn-claim-chest');
    const chestTxt = document.getElementById('chest-btn-text');
    if (userStats.todayChestClaimed) {
        chestBtn.classList.remove('ready');
        chestTxt.textContent = 'Obert ✓';
    } else if (qDone >= 25 && eDone >= 3 && gDone >= 1) {
        chestBtn.classList.add('ready');
        chestTxt.textContent = 'Obrir!';
    } else {
        chestBtn.classList.remove('ready');
        chestTxt.textContent = 'Cofre';
    }
}

function startRecommendedTopic() {
    startTopic(recommendedTopicCode, 'tab-learn');
}

// ==========================================
// 9. TEMARI I NAVEGACIÓ
// ==========================================
function filterTemariAmbit(ambit) {
    ['ALL', 'A', 'B', 'C'].forEach(k => {
        const b = document.getElementById(`flt-${k}`);
        if (b) {
            b.className = k === ambit ? 'btn-3d btn-blue btn-sm' : 'btn-3d btn-gray btn-sm';
        }
    });
    ['A', 'B', 'C'].forEach(letter => {
        const block = document.getElementById(`temari-block-${letter}`);
        if (block) block.classList.toggle('hidden', ambit !== 'ALL' && ambit !== letter);
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
            const scoreLabel = lastScore !== undefined ? `Nota: ${lastScore.toFixed(1)}` : 'Pendent';

            const btn = document.createElement('button');
            btn.className = 'topic-clean-card';
            btn.innerHTML = `
                <div class="tc-top">
                    <span class="tc-badge">${code.toUpperCase()}</span>
                    <span class="tc-grade">${scoreLabel}</span>
                </div>
                <div class="tc-title">${TOPIC_NAMES[code] || `Tema ${code.toUpperCase()}`}</div>
                <div class="tc-progress-row">
                    <div class="mq-mini-bar"><div class="mq-mini-fill" style="width:${pctSeen}%"></div></div>
                    <div class="tc-progress-meta">
                        <span>${seenInTopic}/${totalQ}</span>
                        <span>${pctSeen}%</span>
                    </div>
                </div>
            `;
            btn.onclick = () => startTopic(code, 'tab-temari');
            container.appendChild(btn);
        });
    });
}

function openView(viewId, activeTabId) {
    const allViews = [
        'view-learn', 'view-temari', 'view-simulacre-hub', 'view-errors-hub',
        'view-ranking', 'view-profile', 'view-ceo', 'view-quiz', 'view-results'
    ];
    allViews.forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById(viewId)?.classList.remove('hidden');

    document.querySelectorAll('.duo-nav-item').forEach(btn => {
        btn.classList.remove('active');
        btn.blur();
    });
    document.getElementById(activeTabId)?.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function returnAfterResults() {
    const tabMap = { 'tab-temari': 'temari', 'tab-simulacre': 'simulacre', 'tab-errors': 'errors' };
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
    } else if ((userStats.dailyStreak || 0) > 0 && (userStats.shields || 0) > 0) {
        userStats.shields--;
        showToast('🔰 Escut utilitzat! Has salvat la teva ratxa diària.', 'success');
    } else {
        userStats.dailyStreak = 1;
    }
    userStats.lastStudyDate = today;
}

function updateStatsUI() {
    document.getElementById('ui-daily-streak').textContent = userStats.dailyStreak || 0;
    document.getElementById('ui-best-survival').textContent = userStats.bestStreak || 0;
    document.getElementById('ui-xp').textContent = userStats.xp || 0;
    document.getElementById('ui-lives').textContent = isUserPro() ? '∞' : userStats.lives;
    document.getElementById('btn-sound-toggle').textContent = userStats.soundEnabled ? '🔔' : '🔕';

    const errCount = (userStats.failedQuestions || []).length;
    document.getElementById('sidebar-error-count').textContent = errCount;
    document.getElementById('ui-user-avatar').textContent = userStats.avatar || '👮';
    document.getElementById('ui-user-name').textContent = userStats.displayName || 'Convidat';

    const proBadge = document.getElementById('ui-pro-badge');
    const proSideBtn = document.getElementById('btn-pro-sidebar');
    if (isUserPro()) {
        proBadge.textContent = '💎 PRO';
        proBadge.classList.add('is-pro');
        proSideBtn.classList.add('hidden');
    } else {
        proBadge.textContent = `GRATIS (${getInvitesCount(userStats.unlockedExams)}/3)`;
        proBadge.classList.remove('is-pro');
        proSideBtn.classList.remove('hidden');
    }

    updateHomeDashboard();
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
                avatar: userStats.avatar || '👮',
                goal: userStats.goal || '',
                xp: userStats.xp,
                lives: userStats.lives,
                shields: userStats.shields || 0,
                dailyStreak: userStats.dailyStreak,
                lastStudyDate: userStats.lastStudyDate,
                todayDate: userStats.todayDate,
                todayQuestionsCount: userStats.todayQuestionsCount || 0,
                todayErrorsFixed: userStats.todayErrorsFixed || 0,
                todayHighGradeDone: userStats.todayHighGradeDone || 0,
                todayChestClaimed: userStats.todayChestClaimed || false,
                bestStreak: userStats.bestStreak,
                seenQuestions: (userStats.seenQuestions || []).slice(-1500),
                failedQuestions: userStats.failedQuestions || [],
                savedQuestions: userStats.savedQuestions || [],
                simulacreHistory: userStats.simulacreHistory || [],
                topicScores: userStats.topicScores || {},
                unlockedExams: userStats.unlockedExams,
                updatedAt: Date.now()
            }, { merge: true });
        } catch (e) {}
    }
}

// ==========================================
// 10. PERFIL I AUTENTICACIÓ
// ==========================================
function calcAmbitAverage(codesArray) {
    const scores = userStats.topicScores || {};
    const valid = codesArray.map(c => scores[c]).filter(v => v !== undefined);
    if (!valid.length) return 'Pendent';
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
    return `${avg.toFixed(1)} / 10`;
}

function renderProfileView() {
    document.getElementById('profile-big-avatar').textContent = userStats.avatar || '👮';
    document.getElementById('profile-display-title').textContent = userStats.displayName || 'Opositor';
    document.getElementById('profile-email-subtitle').textContent = currentUser ? currentUser.email : 'Convidat';

    document.getElementById('profile-name-input').value = userStats.displayName || '';
    document.getElementById('profile-goal-input').value = userStats.goal || '';

    document.querySelectorAll('.avatar-opt').forEach(btn => {
        const btnEmoji = btn.dataset.emoji || btn.querySelector('img')?.alt || btn.textContent.trim();
        btn.classList.toggle('selected', btnEmoji === (userStats.avatar || '👮'));
    });

    const scoresObj = userStats.topicScores || {};
    const keys = Object.keys(scoresObj);
    const avg = keys.length > 0 ? (keys.reduce((a, k) => a + scoresObj[k], 0) / keys.length).toFixed(2) : '0.00';
    const passed = keys.filter(k => scoresObj[k] >= 5).length;

    document.getElementById('prof-stat-pro').textContent = isUserPro() ? '💎 PRO' : 'GRATIS';
    document.getElementById('prof-stat-seen-count').textContent = `${(userStats.seenQuestions || []).length}`;
    document.getElementById('prof-stat-avg').textContent = avg;
    document.getElementById('prof-stat-passed').textContent = `${passed} / 20`;

    document.getElementById('prof-avg-a').textContent = calcAmbitAverage(TOPICS.A);
    document.getElementById('prof-avg-b').textContent = calcAmbitAverage(TOPICS.B);
    document.getElementById('prof-avg-c').textContent = calcAmbitAverage(TOPICS.C);

    document.getElementById('profile-auth-btn').textContent = currentUser ? '🚪 Tancar Sessió' : '👤 Entrar amb Google';
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
    if (!newName) return showToast('Escriu un nom vàlid', 'error');

    userStats.displayName = newName;
    userStats.goal = newGoal || 'Promoció Mossos';
    await saveStats();
    renderProfileView();
    showToast('✅ Guardat!', 'success');
}

function resetSeenQuestionsHistory() {
    showModal({
        icon: '♻️',
        title: 'Reiniciar preguntes vistes?',
        text: 'Es posarà a zero el comptador de preguntes vistes.',
        confirmText: 'Reiniciar',
        onConfirm: async () => {
            userStats.seenQuestions = [];
            await saveStats();
            renderProfileView();
            showToast('Reiniciat!', 'success');
        }
    });
}

async function forceReloadQuestionBanks() {
    showSplashLoader('Sincronitzant...');
    ALL_FILES.forEach(code => clearLocalBankCache(code));
    await fetchQuestionsFromCodes(ALL_FILES, true);
    renderTopicNodes();
    updateStatsUI();
    hideSplashLoader();
    showToast('✅ Sincronitzat!', 'success');
}

function initFirebaseListeners() {
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        const authBtn = document.getElementById('btn-auth-trigger');
        const ceoTab = document.getElementById('tab-ceo');
        const ceoTopBtn = document.getElementById('ui-ceo-top-btn');
        const refInput = document.getElementById('my-ref-code');

        if (user) {
            authBtn.textContent = "Sortir";
            refInput.value = user.uid;

            const isCeo = user.email.toLowerCase() === CEO_EMAIL.toLowerCase();
            ceoTab.classList.toggle('hidden', !isCeo);
            ceoTopBtn.classList.toggle('hidden', !isCeo);

            const snap = await getDoc(doc(db, "users", user.uid));
            if (snap.exists()) {
                const data = snap.data();
                if (data.banned === true && !isCeo) {
                    userStats.banned = true;
                    document.getElementById('ban-screen').classList.remove('hidden');
                    return;
                } else {
                    userStats.banned = false;
                    document.getElementById('ban-screen').classList.add('hidden');
                }

                userStats.displayName = data.displayName || user.displayName || user.email.split('@')[0];
                userStats.avatar = (data.avatar === '👮‍♂️' || data.avatar === '👮‍♀️') ? '👮' : (data.avatar || userStats.avatar || '👮');
                userStats.goal = data.goal || userStats.goal;
                userStats.xp = Math.max(userStats.xp, data.xp || 0);
                userStats.lives = data.lives ?? userStats.lives;
                userStats.shields = data.shields ?? userStats.shields;
                userStats.dailyStreak = Math.max(userStats.dailyStreak, data.dailyStreak || 0);
                userStats.lastStudyDate = data.lastStudyDate || userStats.lastStudyDate;
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
            authBtn.textContent = "👤 Entrar";
            refInput.value = "Inicia sessió";
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
            text: 'El teu progrés està guardat al núvol.',
            confirmText: 'Sortir',
            onConfirm: async () => {
                await signOut(auth);
                switchTab('learn');
                showToast('Sessió tancada');
            }
        });
    } else {
        try {
            await signInWithPopup(auth, new GoogleAuthProvider());
            showToast('Benvingut!', 'success');
        } catch (e) {
            showToast('Error iniciant sessió', 'error');
        }
    }
}

function openProModal() {
    if (isUserPro()) {
        triggerIosRewardPopup({
            badge: 'SUBSCRIPCIÓ ACTIVA',
            icon: '💎',
            title: 'Ets Usuari PRO!',
            html: 'Tens Vides Infinites, Simulacres il·limitats i Top Fallades.',
            primaryText: 'Genial!'
        });
        return;
    }
    triggerIosRewardPopup({
        badge: 'OPPOSTEST PRO',
        icon: '💎',
        title: 'Desbloqueja PRO Gratis',
        html: 'Convida <b>3 amics</b> a la pestanya Lliga i aconsegueix <b>Vides Infinites</b> i Simulacres il·limitats.',
        primaryText: 'Convidar Amics',
        secondaryText: 'Tancar',
        onPrimary: () => switchTab('ranking')
    });
}

function copyReferralLink() {
    if (!currentUser) return showToast('Inicia sessió primer!', 'error');
    navigator.clipboard.writeText(currentUser.uid);
    showToast('Codi copiat!', 'success');
}

async function redeemFriendCode() {
    if (!currentUser) return showToast('Inicia sessió primer!', 'error');
    if (userStats.redeemedFriend) return showToast('Ja has validat un codi abans.', 'error');
    const friendUid = document.getElementById('friend-code-input').value.trim();
    if (!friendUid || friendUid === currentUser.uid) return showToast('Codi no vàlid.', 'error');

    try {
        const friendRef = doc(db, "users", friendUid);
        const snap = await getDoc(friendRef);
        if (!snap.exists()) return showToast('Codi inexistent.', 'error');
        const friendData = snap.data();
        const currentCount = typeof friendData.unlockedExams === 'number' ? friendData.unlockedExams : (friendData.unlockedExams === true ? 3 : 0);
        await updateDoc(friendRef, { unlockedExams: currentCount + 1 });

        userStats.redeemedFriend = true;
        userStats.xp += 50;
        await saveStats();
        triggerIosRewardPopup({
            badge: 'CODI VALIDAT',
            icon: '🎉',
            title: 'Amic vinculat!',
            rollingTarget: 50,
            html: 'El teu company suma +1 invitació PRO.',
            primaryText: 'Continuar'
        });
    } catch (e) {
        showToast('Error validant.', 'error');
    }
}

// ==========================================
// 11. CÀRREGA DE PREGUNTES I GENERADORS
// ==========================================
async function loadSingleTopicCode(code, forceRefresh = false) {
    if (!forceRefresh && questionCache[code]?.length > 0) return questionCache[code];
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

async function buildWeightedSimulacreQuestions() {
    const [poolA, poolB, poolC] = await Promise.all([
        fetchQuestionsFromCodes(TOPICS.A),
        fetchQuestionsFromCodes(TOPICS.B),
        fetchQuestionsFromCodes(TOPICS.C)
    ]);
    return shuffle([
        ...selectQuestionsPrioritizingUnseen(poolA, 10),
        ...selectQuestionsPrioritizingUnseen(poolB, 10),
        ...selectQuestionsPrioritizingUnseen(poolC, 10)
    ]);
}

function checkLivesBeforeStudy(callback) {
    if (isUserPro() || userStats.lives > 0) {
        callback();
    } else {
        openLivesModal();
    }
}

function checkProAccessOrTrial(callback) {
    if (isUserPro()) {
        callback();
        return;
    }
    if ((userStats.freeProTrialsUsed || 0) < 1) {
        showModal({
            icon: '🎁',
            title: 'Prova Gratuïta PRO',
            text: 'Tens 1 partida de prova gratuïta disponible.',
            confirmText: 'Començar',
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
        listEl.innerHTML = '<p class="muted-sm">Sense simulacres registrats.</p>';
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
                <strong>${isPass ? '✅ APTE' : '❌ NO APTE'} · ${h.grade}</strong><br>
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
        if (!weightedQuestions.length) return showToast('Error carregant.', 'error');
        initQuiz('simulacre', '⏱️ SIMULACRE OFICIAL', weightedQuestions, EXAM_DURATION_SECONDS, null, 'tab-simulacre');
    });
}

function openCustomTestModal() {
    showModal({
        icon: '⚙️',
        title: 'Test a mida',
        html: `
            <div style="text-align:left;">
                <label class="form-label">Àmbit</label>
                <select id="custom-ambit-sel" class="duo-input">
                    <option value="ALL">Tots (A + B + C)</option>
                    <option value="A">Àmbit A</option>
                    <option value="B">Àmbit B</option>
                    <option value="C">Àmbit C</option>
                </select>
                <label class="form-label mt-2">Preguntes</label>
                <select id="custom-count-sel" class="duo-input">
                    <option value="10">10 preguntes</option>
                    <option value="20" selected>20 preguntes</option>
                    <option value="30">30 preguntes</option>
                    <option value="50">50 preguntes</option>
                </select>
                <label class="form-label mt-2">Mode</label>
                <select id="custom-mode-sel" class="duo-input">
                    <option value="study">Estudi</option>
                    <option value="simulacre">Examen</option>
                </select>
            </div>
        `,
        confirmText: 'Començar',
        onConfirm: async () => {
            const ambitVal = document.getElementById('custom-ambit-sel').value;
            const countVal = parseInt(document.getElementById('custom-count-sel').value, 10);
            const modeVal = document.getElementById('custom-mode-sel').value;

            checkLivesBeforeStudy(async () => {
                const codes = ambitVal === 'ALL' ? ALL_FILES : TOPICS[ambitVal];
                const q = await fetchQuestionsFromCodes(codes);
                if (!q.length) return;
                const selected = selectQuestionsPrioritizingUnseen(q, countVal);
                const timer = modeVal === 'simulacre' ? countVal * 70 : 0;
                initQuiz(modeVal, `⚙️ TEST (${countVal})`, selected, timer, null, 'tab-learn');
            });
        }
    });
}

function renderErrorsHub() {
    const errCount = (userStats.failedQuestions || []).length;
    const savedCount = (userStats.savedQuestions || []).length;

    document.getElementById('errors-hub-title').textContent = `${errCount} Errors`;
    const errBtn = document.getElementById('btn-start-errors-now');
    errBtn.disabled = errCount === 0;
    errBtn.textContent = errCount === 0 ? 'Net!' : 'Repassar';

    document.getElementById('saved-hub-title').textContent = `${savedCount} Guardades`;
    const savBtn = document.getElementById('btn-start-saved-now');
    savBtn.disabled = savedCount === 0;
    savBtn.textContent = savedCount === 0 ? 'Buit' : 'Repassar';
}

function launchErrorsQuiz() {
    if (!userStats.failedQuestions.length) return;
    initQuiz('errors', '🧠 REPÀS', shuffle(userStats.failedQuestions), 0, null, 'tab-errors');
}

function launchSavedQuiz() {
    if (!userStats.savedQuestions.length) return;
    initQuiz('study', '⭐ GUARDADES', shuffle(userStats.savedQuestions), 0, null, 'tab-errors');
}

async function startTopic(code, originTab = 'tab-temari') {
    checkLivesBeforeStudy(async () => {
        const q = await fetchQuestionsFromCodes([code]);
        if (!q.length) return showToast('Tema buit', 'error');
        initQuiz('study', `TEMA ${code.toUpperCase()}`, selectQuestionsPrioritizingUnseen(q, 20), 0, code, originTab);
    });
}

async function startAmbit(letter) {
    checkLivesBeforeStudy(async () => {
        const q = await fetchQuestionsFromCodes(TOPICS[letter]);
        if (!q.length) return;
        initQuiz('study', `ÀMBIT ${letter}`, selectQuestionsPrioritizingUnseen(q, 25), 0, null, 'tab-temari');
    });
}

async function startSurvival() {
    checkLivesBeforeStudy(async () => {
        const q = await fetchQuestionsFromCodes(ALL_FILES);
        if (!q.length) return;
        initQuiz('survival', '🔥 SUPERVIVÈNCIA', selectQuestionsPrioritizingUnseen(q, q.length), 0, null, 'tab-learn');
    });
}

function startCommunityFailures() {
    checkProAccessOrTrial(async () => {
        try {
            const snap = await getDoc(doc(db, "metrics", "top_failed"));
            if (snap.exists() && snap.data().questions?.length >= 5) {
                initQuiz('study', '☠️ TOP FALLADES', selectQuestionsPrioritizingUnseen(snap.data().questions, 25), 0, null, 'tab-learn');
                return;
            }
        } catch (e) {}
        const q = await fetchQuestionsFromCodes(ALL_FILES);
        initQuiz('study', '☠️ TOP FALLADES', selectQuestionsPrioritizingUnseen(q, 25), 0, null, 'tab-learn');
    });
}

// ==========================================
// 12. MOTOR DEL TEST, VIDES I SONS
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

    const isSim = mode === 'simulacre';
    document.getElementById('quiz-timer').classList.toggle('hidden', !isSim);
    document.getElementById('simulacre-nav-panel').classList.toggle('hidden', !isSim);
    document.getElementById('simulacre-controls').classList.toggle('hidden', !isSim);
    document.getElementById('study-controls').classList.toggle('hidden', isSim);

    if (isSim) {
        startTimer();
        renderSimulacreGrid();
    }
    renderQuestion();
}

function toggleSaveCurrentQuestion() {
    const q = quizState.questions[quizState.currentIndex];
    if (!q) return;
    const idx = userStats.savedQuestions.findIndex(item => item.question === q.question);
    if (idx >= 0) {
        userStats.savedQuestions.splice(idx, 1);
    } else {
        userStats.savedQuestions.push(q);
        playIosSound('correct');
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
        let cls = 'sim-q-pill';
        if (quizState.simulacreDoubts[idx]) cls += ' doubt';
        else if (quizState.simulacreAnswers[idx] !== null) cls += ' answered';
        if (idx === quizState.currentIndex) cls += ' current';

        btn.className = cls;
        btn.textContent = idx + 1;
        btn.onclick = () => jumpToQuestion(idx);
        grid.appendChild(btn);
    });
}

function jumpToQuestion(index) {
    if (index >= 0 && index < quizState.questions.length) {
        quizState.currentIndex = index;
        renderQuestion();
    }
}

function prevQuestion() {
    if (quizState.currentIndex > 0) {
        quizState.currentIndex--;
        renderQuestion();
    }
}

function toggleDoubtCurrent() {
    if (quizState.mode !== 'simulacre') return;
    quizState.simulacreDoubts[quizState.currentIndex] = !quizState.simulacreDoubts[quizState.currentIndex];
    renderQuestion();
}

function clearCurrentAnswer() {
    if (quizState.mode !== 'simulacre') return;
    quizState.simulacreAnswers[quizState.currentIndex] = null;
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
        document.getElementById('btn-doubt-q').textContent = quizState.simulacreDoubts[quizState.currentIndex] ? '🟡 Dubte' : '❓ Dubte';
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

function addXpAndCheckRankUp(amount) {
    const oldRank = calculatePoliceRank(userStats.xp || 0).name;
    userStats.xp = (userStats.xp || 0) + amount;
    const newRankObj = calculatePoliceRank(userStats.xp);

    if (newRankObj.name !== oldRank) {
        setTimeout(() => {
            triggerIosRewardPopup({
                badge: 'ASCENS DE RANG',
                icon: newRankObj.icon,
                title: `Nou Rang: ${newRankObj.name}!`,
                rollingTarget: userStats.xp,
                rollingPrefix: '',
                rollingSuffix: ' XP',
                html: 'Has pujat de divisió policial gràcies al teu entrenament.',
                primaryText: 'Continuar'
            });
        }, 400);
    }
}

async function selectAnswer(selected, btn) {
    const q = quizState.questions[quizState.currentIndex];

    if (quizState.mode === 'simulacre') {
        quizState.simulacreAnswers[quizState.currentIndex] =
            quizState.simulacreAnswers[quizState.currentIndex] === selected ? null : selected;
        renderQuestion();
        return;
    }

    checkResetTodayCounters();
    markQuestionAsSeen(q);
    userStats.todayQuestionsCount = (userStats.todayQuestionsCount || 0) + 1;

    const isCorrect = selected.trim() === q.correctAnswer.trim();
    quizState.userAnswers.push({ question: q, selected, isCorrect });

    if (isCorrect) {
        playIosSound('correct');
        quizState.correct++;
        quizState.streak++;
        addXpAndCheckRankUp(10);

        if (quizState.mode === 'survival' && quizState.streak > userStats.bestStreak) {
            userStats.bestStreak = quizState.streak;
        }
        if (quizState.mode === 'errors') {
            userStats.failedQuestions = userStats.failedQuestions.filter(item => item.question !== q.question);
            userStats.todayErrorsFixed = (userStats.todayErrorsFixed || 0) + 1;
            if (!isUserPro() && userStats.lives < MAX_LIVES) {
                userStats.lives++;
                showToast('❤️ +1 Vida recuperada!', 'success');
            }
        }
    } else {
        playIosSound('wrong');
        quizState.wrong++;
        if (!userStats.failedQuestions.some(item => item.question === q.question)) {
            userStats.failedQuestions.push(q);
        }
        if (quizState.mode !== 'errors' && !isUserPro()) {
            userStats.lives = Math.max(0, userStats.lives - 1);
        }
        recordCommunityFailure(q);
    }

    updateStatsUI();

    document.querySelectorAll('.duo-opt').forEach(b => {
        b.disabled = true;
        const optVal = (b.dataset.optionValue || b.querySelector('span:last-child').textContent).trim();
        if (optVal === q.correctAnswer.trim()) b.classList.add('correct');
    });
    if (!isCorrect) btn.classList.add('wrong');

    const fb = document.getElementById('feedback-content');
    fb.classList.remove('hidden');
    document.getElementById('feedback-title').textContent = isCorrect ? '✅ Correcte! (+10 XP)' : '❌ Incorrecte';
    document.getElementById('feedback-explanation').textContent = q.explanation || '';

    const nextBtn = document.getElementById('btn-next');
    nextBtn.classList.remove('hidden');

    if (!isUserPro() && userStats.lives === 0 && quizState.mode !== 'errors') {
        nextBtn.textContent = 'Resultat';
        nextBtn.onclick = () => {
            finishQuiz();
            setTimeout(() => openLivesModal(), 350);
        };
    } else if (quizState.mode === 'survival' && !isCorrect) {
        nextBtn.textContent = 'Resultat';
        nextBtn.onclick = finishQuiz;
    } else {
        nextBtn.textContent = 'Continuar';
        nextBtn.onclick = nextQuestion;
    }
}

function confirmFinishSimulacre() {
    const answered = quizState.simulacreAnswers.filter(a => a !== null).length;
    const blanks = quizState.questions.length - answered;
    const doubts = quizState.simulacreDoubts.filter(Boolean).length;

    showModal({
        icon: '📝',
        title: 'Entregar examen?',
        html: `
            <div class="user-detail-grid">
                <div class="u-stat-box"><small>Contestades</small><strong>✅ ${answered}</strong></div>
                <div class="u-stat-box"><small>En blanc</small><strong>⚪ ${blanks}</strong></div>
            </div>
            ${doubts > 0 ? `<p style="color:var(--gold); font-weight:800;">⚠️ ${doubts} amb dubte</p>` : ''}
        `,
        confirmText: 'Entregar',
        cancelText: 'Revisar',
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
    checkResetTodayCounters();

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
                userStats.todayQuestionsCount = (userStats.todayQuestionsCount || 0) + 1;
                const isOk = chosen.trim() === q.correctAnswer.trim();
                if (isOk) {
                    quizState.correct++;
                    addXpAndCheckRankUp(10);
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

    if (gradeNum >= 8 && total >= 5) {
        userStats.todayHighGradeDone = 1;
    }

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

    if (quizState.mode !== 'survival' && total >= 5 && quizState.wrong === 0 && quizState.blank === 0) {
        addXpAndCheckRankUp(30);
        setTimeout(() => {
            triggerIosRewardPopup({
                badge: 'INTERVENCIÓ IMPECABLE',
                icon: '🏆',
                title: 'Test Perfecte (10/10)!',
                rollingTarget: 30,
                html: 'Has encertat totes les preguntes sense cap errada. Bonificació extra!',
                primaryText: 'Continuar'
            });
        }, 250);
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
// 13. LLIGA SETMANAL PER DIVISIONS
// ==========================================
function reportCurrentQuestion() {
    const q = quizState.questions[quizState.currentIndex];
    showModal({
        icon: '🚩',
        title: 'Reportar Pregunta',
        text: 'Descriu l\'error detectat:',
        showInput: true,
        placeholder: 'Motiu...',
        confirmText: 'Enviar',
        onConfirm: async (reason) => {
            if (!reason) return;
            await addDoc(collection(db, "reports"), {
                question: q.question,
                reason,
                user: currentUser?.email || 'Anònim',
                createdAt: Date.now()
            });
            showToast('Report enviat!', 'success');
        }
    });
}

async function loadRanking() {
    const rInfo = calculatePoliceRank(userStats.xp || 0);
    document.getElementById('league-div-icon').textContent = rInfo.icon;
    document.getElementById('league-div-name').textContent = `Divisió ${rInfo.name}`;

    const list = document.getElementById('ranking-list');
    list.innerHTML = '<p class="muted-sm">Carregant...</p>';
    try {
        const q = query(collection(db, "users"), orderBy("xp", "desc"), limit(20));
        const snap = await getDocs(q);
        list.innerHTML = '';
        let pos = 1;
        const totalDocs = snap.size;

        snap.forEach(d => {
            const u = d.data();
            if (u.banned) return;
            const row = document.createElement('div');
            row.className = 'rank-row';
            const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `#${pos}`;
            const isPro = u.unlockedExams === true || u.unlockedExams >= 3;
            const uRank = calculatePoliceRank(u.xp || 0);
            const cleanAvatar = (u.avatar === '👮‍♂️' || u.avatar === '👮‍♀️') ? '👮' : (u.avatar || '👮');

            row.innerHTML = `
                <span>${medal} ${cleanAvatar} ${u.displayName || 'Opositor'} <small class="muted-sm">(${uRank.name})</small> ${isPro ? '💎' : ''}</span>
                <span>🔥 ${u.dailyStreak || 0}d · ⚡ ${u.xp || 0} XP</span>
            `;
            list.appendChild(row);

            if (pos === 5) {
                const upDiv = document.createElement('div');
                upDiv.className = 'zone-divider zone-up';
                upDiv.textContent = '🔼 ZONA D\'ASCENS SETMANAL (TOP 5)';
                list.appendChild(upDiv);
            }
            if (totalDocs >= 10 && pos === totalDocs - 3) {
                const downDiv = document.createElement('div');
                downDiv.className = 'zone-divider zone-down';
                downDiv.textContent = '🔽 ZONA DE DESCENS';
                list.appendChild(downDiv);
            }
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
    initQuiz('simulacre', '🔴 SIMULACRE EN VIU', weightedQuestions, EXAM_DURATION_SECONDS, null, 'tab-simulacre');
}

// ==========================================
// 14. PANEL CEO 100% FUNCIONAL (TAULA + CERCADOR GLOBAL + PUJADA MASSIVA)
// ==========================================
async function ceoLoadBanksStatus() {
    if (currentUser?.email.toLowerCase() !== CEO_EMAIL.toLowerCase()) return;
    const grid = document.getElementById('ceo-banks-grid');
    grid.innerHTML = '<p class="muted-sm">Consultando Firestore...</p>';

    try {
        const snap = await getDocs(collection(db, "mossos_custom_questions"));
        const firestoreMap = {};
        snap.forEach(d => {
            if (d.id.startsWith('bank_')) firestoreMap[d.id.replace('bank_', '')] = d.data();
        });

        grid.innerHTML = '';
        let totalQuestionsInCloud = 0;

        ALL_FILES.forEach(code => {
            const bankDoc = firestoreMap[code];
            const isOnline = bankDoc && Array.isArray(bankDoc.questions);
            const qCount = isOnline ? bankDoc.questions.length : 0;
            totalQuestionsInCloud += qCount;

            if (isOnline) {
                questionCache[code] = bankDoc.questions;
            }

            const row = document.createElement('div');
            row.className = `ceo-bank-row ${isOnline ? 'online' : ''}`;
            row.innerHTML = `
                <div class="ceo-bank-info">
                    <span class="ceo-code-pill">${code.toUpperCase()}</span>
                    <strong>${TOPIC_NAMES[code] || code.toUpperCase()}</strong>
                    <span class="ceo-count-pill ${isOnline ? '' : 'empty'}">${isOnline ? `${qCount} preg.` : 'Vacío'}</span>
                </div>
                <div class="row-btns">
                    <button class="btn-3d btn-blue btn-sm" onclick="triggerUploadJson('${code}')">Subir JSON</button>
                    <button class="btn-3d btn-white btn-sm" onclick="openTopicManager('${code}')">Ver / Editar (${qCount})</button>
                    <button class="btn-3d btn-gray btn-sm" onclick="ceoDownloadBackup('${code}')">Descargar</button>
                    <button class="btn-3d btn-red btn-sm" onclick="ceoDeleteBank('${code}')">Borrar</button>
                </div>
            `;
            grid.appendChild(row);
        });

        const badge = document.getElementById('ceo-total-q-badge');
        if (badge) badge.textContent = `Total en Firestore: ${totalQuestionsInCloud} preg.`;
    } catch (e) {
        grid.innerHTML = '<p class="muted-sm">Error leyendo Firestore.</p>';
    }
}

// Cercador Global de Preguntes als 20 temes alhora
async function ceoSearchAllQuestions() {
    const term = document.getElementById('ceo-global-q-search').value.toLowerCase().trim();
    const resContainer = document.getElementById('ceo-global-q-results');
    resContainer.innerHTML = '';

    if (term.length < 3) return;

    await fetchQuestionsFromCodes(ALL_FILES);
    const matches = [];

    for (const code of ALL_FILES) {
        const list = questionCache[code] || [];
        list.forEach((q, idx) => {
            if ((q.question || '').toLowerCase().includes(term) || (q.correctAnswer || '').toLowerCase().includes(term)) {
                matches.push({ code, idx, q });
            }
        });
        if (matches.length >= 25) break;
    }

    if (!matches.length) {
        resContainer.innerHTML = '<p class="muted-sm">Sin coincidencias.</p>';
        return;
    }

    matches.slice(0, 20).forEach(m => {
        const div = document.createElement('div');
        div.className = 'admin-row';
        div.innerHTML = `
            <div>
                <span class="ceo-code-pill">${m.code.toUpperCase()}</span>
                <strong>${m.q.question}</strong><br>
                <small class="muted-sm">Correcta: <b>${m.q.correctAnswer}</b></small>
            </div>
            <div class="row-btns">
                <button class="btn-3d btn-blue btn-sm" onclick="openEditQuestionModal('${m.code}', ${m.idx})">Editar</button>
            </div>
        `;
        resContainer.appendChild(div);
    });
}

function triggerUploadJson(code) {
    currentUploadTargetCode = code;
    const uploader = document.getElementById('ceo-file-uploader');
    uploader.value = '';
    uploader.click();
}

function triggerBulkUpload() {
    const uploader = document.getElementById('ceo-bulk-uploader');
    uploader.value = '';
    uploader.click();
}

async function handleBulkJsonUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    let uploaded = 0;
    for (const file of files) {
        const match = file.name.toLowerCase().match(/([abc][1-8])/);
        if (!match) continue;
        const code = match[1];
        if (!ALL_FILES.includes(code)) continue;

        try {
            const parsed = JSON.parse(await file.text());
            if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].question) {
                await setDoc(doc(db, "mossos_custom_questions", `bank_${code}`), {
                    topic: code,
                    questions: parsed,
                    updatedAt: Date.now()
                });
                clearLocalBankCache(code);
                questionCache[code] = parsed;
                uploaded++;
            }
        } catch (e) {}
    }

    renderTopicNodes();
    ceoLoadBanksStatus();
    showToast(`${uploaded} archivos JSON actualizados en Firestore`, 'success');
}

async function handleJsonFileUpload(event) {
    const file = event.target.files[0];
    if (!file || !currentUploadTargetCode) return;
    const code = currentUploadTargetCode;
    try {
        const parsed = JSON.parse(await file.text());
        if (!Array.isArray(parsed) || !parsed.length || !parsed[0].question) {
            return showToast('Formato JSON inválido', 'error');
        }
        await setDoc(doc(db, "mossos_custom_questions", `bank_${code}`), {
            topic: code,
            questions: parsed,
            updatedAt: Date.now()
        });
        clearLocalBankCache(code);
        await loadSingleTopicCode(code, true);
        renderTopicNodes();
        showToast(`Tema ${code.toUpperCase()} actualizado (${parsed.length} preg.)`, 'success');
        ceoLoadBanksStatus();
    } catch (e) {
        showToast('Error subiendo JSON', 'error');
    }
}

function ceoDeleteBank(code) {
    showModal({
        icon: '⚠️',
        title: `¿Eliminar Tema ${code.toUpperCase()}?`,
        text: `Se borrará bank_${code} de Firestore.`,
        confirmText: 'Eliminar',
        onConfirm: async () => {
            await deleteDoc(doc(db, "mossos_custom_questions", `bank_${code}`));
            clearLocalBankCache(code);
            ceoLoadBanksStatus();
        }
    });
}

async function ceoDownloadBackup(code) {
    const questions = await fetchQuestionsFromCodes([code], true);
    if (!questions.length) return showToast('Tema vacío', 'error');
    const blob = new Blob([JSON.stringify(questions, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `preguntas-${code}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

async function openTopicManager(code) {
    currentManagedTopicCode = code;
    document.getElementById('ceo-topic-modal-title').textContent = `Tema ${code.toUpperCase()} · ${TOPIC_NAMES[code] || ''}`;
    document.getElementById('ceo-search-q').value = '';
    document.getElementById('ceo-topic-modal').classList.remove('hidden');

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
        listEl.innerHTML = '<p class="muted-sm">Sin preguntas.</p>';
        return;
    }

    questionsArray.forEach((q) => {
        const realIndex = currentManagedQuestions.indexOf(q);
        const item = document.createElement('div');
        item.className = 'q-edit-item';
        item.innerHTML = `
            <div>
                <strong>${realIndex + 1}. ${q.question}</strong>
                <div class="muted-sm mt-2">Correcta: <b>${q.correctAnswer}</b></div>
            </div>
            <div class="row-btns">
                <button class="btn-3d btn-blue btn-sm" onclick="openEditQuestionModal('${currentManagedTopicCode}', ${realIndex})">Editar</button>
                <button class="btn-3d btn-red btn-sm" onclick="deleteSingleQuestionFromTopic(${realIndex})">Borrar</button>
            </div>
        `;
        listEl.appendChild(item);
    });
}

async function openEditQuestionModal(code, realIndex) {
    closeTopicManager();
    const list = await fetchQuestionsFromCodes([code], false);
    const q = list[realIndex];
    if (!q) return;

    const wrongOpts = (q.options || []).filter(o => o.trim() !== q.correctAnswer.trim());

    showModal({
        icon: '📝',
        title: `Editar Pregunta (${code.toUpperCase()})`,
        html: `
            <input id="edit-q-title" class="duo-input" placeholder="Enunciado">
            <input id="edit-q-ok" class="duo-input" placeholder="Respuesta Correcta">
            <input id="edit-q-ko1" class="duo-input" placeholder="Incorrecta 1">
            <input id="edit-q-ko2" class="duo-input" placeholder="Incorrecta 2">
            <input id="edit-q-ko3" class="duo-input" placeholder="Incorrecta 3">
            <input id="edit-q-exp" class="duo-input" placeholder="Explicación">
        `,
        confirmText: 'Guardar',
        onConfirm: async () => {
            const newQuestion = document.getElementById('edit-q-title').value.trim();
            const o1 = document.getElementById('edit-q-ok').value.trim();
            const o2 = document.getElementById('edit-q-ko1').value.trim();
            const o3 = document.getElementById('edit-q-ko2').value.trim();
            const o4 = document.getElementById('edit-q-ko3').value.trim();
            const exp = document.getElementById('edit-q-exp').value.trim();

            if (!newQuestion || !o1) return showToast('Faltan datos', 'error');

            list[realIndex] = {
                question: newQuestion,
                options: shuffle([o1, o2, o3, o4].filter(Boolean)),
                correctAnswer: o1,
                explanation: exp
            };

            await setDoc(doc(db, "mossos_custom_questions", `bank_${code}`), {
                topic: code,
                questions: list,
                updatedAt: Date.now()
            });
            clearLocalBankCache(code);
            await loadSingleTopicCode(code, true);
            ceoLoadBanksStatus();
            showToast('Pregunta actualizada', 'success');
        }
    });

    setTimeout(() => {
        document.getElementById('edit-q-title').value = q.question || '';
        document.getElementById('edit-q-ok').value = q.correctAnswer || '';
        document.getElementById('edit-q-ko1').value = wrongOpts[0] || '';
        document.getElementById('edit-q-ko2').value = wrongOpts[1] || '';
        document.getElementById('edit-q-ko3').value = wrongOpts[2] || '';
        document.getElementById('edit-q-exp').value = q.explanation || '';
    }, 40);
}

async function ceoEditReportedQuestion(encodedQuestion) {
    const targetQ = decodeURIComponent(encodedQuestion).trim();
    await fetchQuestionsFromCodes(ALL_FILES);

    for (const code of ALL_FILES) {
        const list = questionCache[code] || [];
        const idx = list.findIndex(item => item.question.trim() === targetQ);
        if (idx >= 0) {
            openEditQuestionModal(code, idx);
            return;
        }
    }
    showToast('Pregunta no encontrada en los bancos.', 'error');
}

function filterTopicQuestions() {
    const term = document.getElementById('ceo-search-q').value.toLowerCase().trim();
    if (!term) return renderManagedTopicQuestions(currentManagedQuestions);
    renderManagedTopicQuestions(currentManagedQuestions.filter(q => q.question.toLowerCase().includes(term)));
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
    showToast('Pregunta eliminada', 'success');
}

function openAddQuestionToCurrentTopic() {
    const code = currentManagedTopicCode;
    closeTopicManager();
    showModal({
        icon: '➕',
        title: `Nueva Pregunta (${code.toUpperCase()})`,
        html: `
            <input id="new-q-title" class="duo-input" placeholder="Enunciado">
            <input id="new-q-ok" class="duo-input" placeholder="Correcta">
            <input id="new-q-ko1" class="duo-input" placeholder="Incorrecta 1">
            <input id="new-q-ko2" class="duo-input" placeholder="Incorrecta 2">
            <input id="new-q-ko3" class="duo-input" placeholder="Incorrecta 3">
            <input id="new-q-exp" class="duo-input" placeholder="Explicación">
        `,
        confirmText: 'Guardar',
        onConfirm: async () => {
            const question = document.getElementById('new-q-title').value.trim();
            const o1 = document.getElementById('new-q-ok').value.trim();
            const o2 = document.getElementById('new-q-ko1').value.trim();
            const o3 = document.getElementById('new-q-ko2').value.trim();
            const o4 = document.getElementById('new-q-ko3').value.trim();
            const explanation = document.getElementById('new-q-exp').value.trim();

            if (!question || !o1 || !o2) return showToast('Faltan datos', 'error');
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
            showToast('Guardada', 'success');
        }
    });
}

async function ceoLoadUsers() {
    if (currentUser?.email.toLowerCase() !== CEO_EMAIL.toLowerCase()) return;
    const container = document.getElementById('ceo-users-list');
    container.innerHTML = '<p class="muted-sm">Cargando...</p>';
    const snap = await getDocs(collection(db, "users"));
    allUsersCache = [];
    snap.forEach(d => allUsersCache.push({ uid: d.id, ...d.data() }));
    renderCeoUsersList(allUsersCache);
}

function ceoFilterUsers() {
    const term = document.getElementById('ceo-user-search').value.toLowerCase().trim();
    if (!term) return renderCeoUsersList(allUsersCache);
    renderCeoUsersList(allUsersCache.filter(u =>
        (u.email || '').toLowerCase().includes(term) ||
        (u.displayName || '').toLowerCase().includes(term) ||
        u.uid.toLowerCase().includes(term)
    ));
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
                <strong>${u.displayName || 'Usuario'}</strong> <small class="muted-sm">(${u.email || u.uid})</small><br>
                <small>${u.xp || 0} XP · Racha: ${u.dailyStreak || 0}d · Invitados: <b>${invites}</b> · ${isPro ? 'PRO' : 'Gratis'} ${isBanned ? '· BANEADO' : ''}</small>
            </div>
            <div class="row-btns">
                <button class="btn-3d btn-blue btn-sm" onclick="ceoInspectUser('${u.uid}')">Detalles</button>
                <button class="btn-3d btn-gold btn-sm" onclick="ceoTogglePro('${u.uid}', ${!isPro})">${isPro ? 'Quitar PRO' : 'Dar PRO'}</button>
                <button class="btn-3d ${isBanned ? 'btn-green' : 'btn-red'} btn-sm" onclick="ceoToggleBan('${u.uid}', ${!isBanned})">${isBanned ? 'Desbloquear' : 'Banear'}</button>
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
        : '0.00';

    showModal({
        icon: '👤',
        title: u.displayName || 'Usuario',
        html: `
            <div class="muted-sm mb-2">${u.email || ''}<br><code>${u.uid}</code></div>
            <div class="user-detail-grid">
                <div class="u-stat-box"><small>Estado</small><strong>${isBanned ? 'BANEADO' : (isPro ? 'PRO' : 'GRATIS')}</strong></div>
                <div class="u-stat-box"><small>Invitados</small><strong>${invites}</strong></div>
                <div class="u-stat-box"><small>XP y Racha</small><strong>${u.xp || 0} XP · ${u.dailyStreak || 0}d</strong></div>
                <div class="u-stat-box"><small>Vistas</small><strong>${(u.seenQuestions || []).length}</strong></div>
                <div class="u-stat-box"><small>Media (${completedTopics.length}/20)</small><strong>${avgScore}</strong></div>
                <div class="u-stat-box"><small>Errores / Guardadas</small><strong>${(u.failedQuestions || []).length} / ${(u.savedQuestions || []).length}</strong></div>
            </div>
            <div class="row-btns mt-3" style="justify-content:center;">
                <button class="btn-3d btn-gray btn-sm" onclick="ceoDeleteUserAccount('${u.uid}')">Borrar Usuario</button>
            </div>
        `,
        cancelText: null,
        confirmText: 'Cerrar'
    });
}

async function ceoTogglePro(uid, givePro) {
    await updateDoc(doc(db, "users", uid), { unlockedExams: givePro ? 999 : 0 });
    ceoLoadUsers();
}

async function ceoToggleBan(uid, banStatus) {
    await updateDoc(doc(db, "users", uid), { banned: banStatus });
    ceoLoadUsers();
}

function ceoDeleteUserAccount(uid) {
    showModal({
        icon: '⚠️',
        title: '¿Borrar usuario?',
        text: 'Se eliminarán sus datos de Firestore.',
        confirmText: 'Borrar',
        onConfirm: async () => {
            await deleteDoc(doc(db, "users", uid));
            ceoLoadUsers();
        }
    });
}

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
    showToast('Alerta publicada', 'success');
}

async function ceoClearAlert() {
    await setDoc(doc(db, "admin", "global"), { message: "" });
    document.getElementById('global-alert-banner').classList.add('hidden');
}

async function ceoSaveEvent() {
    const title = document.getElementById('ceo-ev-title').value.trim() || 'Simulacre Oficial';
    const desc = document.getElementById('ceo-ev-desc').value.trim() || '30 preg · 35 min';
    await setDoc(doc(db, "mossos_events", "active"), { active: true, title, desc });
    loadLiveEventBanner();
    showToast('Evento activado', 'success');
}

async function ceoClearEvent() {
    await setDoc(doc(db, "mossos_events", "active"), { active: false });
    loadLiveEventBanner();
}

async function ceoLoadReports() {
    const container = document.getElementById('ceo-reports-list');
    container.innerHTML = 'Cargando...';
    const snap = await getDocs(collection(db, "reports"));
    container.innerHTML = '';
    if (snap.empty) {
        container.innerHTML = '<p class="muted-sm">0 reportes pendientes.</p>';
        return;
    }
    snap.forEach(d => {
        const r = d.data();
        const encodedQ = encodeURIComponent(r.question || '');
        const div = document.createElement('div');
        div.className = 'admin-row';
        div.innerHTML = `
            <div><strong>${r.question}</strong><br><small>${r.reason} (${r.user || ''})</small></div>
            <div class="row-btns">
                <button class="btn-3d btn-blue btn-sm" onclick="ceoEditReportedQuestion('${encodedQ}')">Editar Pregunta</button>
                <button class="btn-3d btn-red btn-sm" onclick="ceoDeleteReport('${d.id}')">Borrar</button>
            </div>
        `;
        container.appendChild(div);
    });
}

async function ceoDeleteReport(id) {
    await deleteDoc(doc(db, "reports", id));
    ceoLoadReports();
}

function switchTab(tab) {
    clearInterval(quizState.timerInterval);

    if (tab === 'learn') {
        openView('view-learn', 'tab-learn');
        updateHomeDashboard();
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
        title: 'Sortir del test?',
        text: 'Es perdrà el progrés actual.',
        confirmText: 'Sortir',
        cancelText: 'Continuar',
        onConfirm: () => returnAfterResults()
    });
}

Object.assign(window, {
    switchTab, filterTemariAmbit, returnAfterResults, startRecommendedTopic,
    scrollNewsCarousel, launchOfficialSimulacre, openCustomTestModal,
    launchErrorsQuiz, launchSavedQuiz, startSurvival, startCommunityFailures,
    startAmbit, startTopic, startLiveEvent, prevQuestion, nextQuestion,
    jumpToQuestion, toggleDoubtCurrent, clearCurrentAnswer, toggleSaveCurrentQuestion,
    confirmFinishSimulacre, confirmExitQuiz, handleAuthClick, forceSignOut,
    openProModal, openLivesModal, showDailyStreakPopup, claimDailyChest, toggleSound,
    copyReferralLink, redeemFriendCode, loadRanking, reportCurrentQuestion,
    selectProfileAvatar, saveUserProfileData, resetSeenQuestionsHistory,
    forceReloadQuestionBanks, ceoLoadBanksStatus, ceoSearchAllQuestions,
    triggerUploadJson, triggerBulkUpload, handleBulkJsonUpload, handleJsonFileUpload,
    ceoDeleteBank, ceoDownloadBackup, openTopicManager, closeTopicManager,
    openEditQuestionModal, ceoEditReportedQuestion, filterTopicQuestions,
    deleteSingleQuestionFromTopic, openAddQuestionToCurrentTopic, ceoSaveAlert,
    ceoClearAlert, ceoSaveEvent, ceoClearEvent, ceoLoadReports, ceoDeleteReport,
    ceoLoadUsers, ceoFilterUsers, ceoInspectUser, ceoTogglePro, ceoToggleBan, ceoDeleteUserAccount
});
