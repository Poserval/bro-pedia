const questionInput = document.getElementById('questionInput');
const askButton = document.getElementById('askButton');
const answerContainer = document.getElementById('answerContainer');

const BACKEND_URL = 'https://bro-pedia.onrender.com';

let currentQuestion = '';
let currentTitle = '';
let loadingInterval = null;
let startTime = null;

// === ОПРЕДЕЛЕНИЕ WEBVIEW (APK) И СКРЫТИЕ АДМИНКИ ===
function isWebView() {
    const userAgent = navigator.userAgent.toLowerCase();
    return userAgent.includes('wv') || userAgent.includes('android webview');
}

// Если это WebView (APK), вешаем класс на body для скрытия админки через CSS
if (isWebView()) {
    document.body.classList.add('webview');
}

// === УМНЫЕ КНОПКИ: ИСТОРИЯ ПОСЛЕДНИХ УНИКАЛЬНЫХ ЗАПРОСОВ ===
const DEFAULT_QUESTIONS = [
    "Ип Ман",
    "Чебурашка",
    "DeepSeek",
    "Успенский"
];

function getQuestionsHistory() {
    const stored = localStorage.getItem("questionsHistory");
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch(e) { console.log("Parse error", e); }
    }
    return [...DEFAULT_QUESTIONS];
}

function saveQuestionsHistory(history) {
    localStorage.setItem("questionsHistory", JSON.stringify(history.slice(0, 4)));
}

function updateButtons(history) {
    const btns = document.querySelectorAll('.sample-btn');
    for (let i = 0; i < btns.length && i < history.length; i++) {
        btns[i].textContent = history[i];
    }
}

function addQuestionToHistory(question) {
    if (!question || question.trim() === "") return;
    let history = getQuestionsHistory();
    // Удаляем этот вопрос, если он уже был в списке
    history = history.filter(q => q !== question);
    // Добавляем в конец (как самый свежий)
    history.push(question);
    // Оставляем только 4 последних
    if (history.length > 4) history = history.slice(-4);
    saveQuestionsHistory(history);
    updateButtons(history);
}

// Инициализация кнопок при загрузке
function initButtons() {
    const history = getQuestionsHistory();
    updateButtons(history);
}

// === АДМИН-ПАНЕЛЬ ===
const ADMIN_PASSWORD = 'bropedia2025';

// Показываем иконку админки только в браузере (не в APK)
if (!isWebView() && localStorage.getItem('admin_logged_in') === 'true') {
    const adminIcon = document.getElementById('adminIcon');
    if (adminIcon) adminIcon.style.display = 'flex';
}

async function checkBalance() {
    try {
        const response = await fetch(`${BACKEND_URL}/admin/balance/${ADMIN_PASSWORD}`);
        const data = await response.json();
        if (data.balance_cny !== undefined) {
            alert(`Баланс DeepSeek: ${data.balance_cny} CNY (≈ $${data.balance_usd})\n${data.is_low ? '⚠️ Пора пополнять!' : '✅ ОК'}`);
        } else {
            alert(`Ошибка: ${data.error}`);
        }
    } catch (error) {
        alert('Ошибка при проверке баланса');
    }
}

async function checkCache() {
    try {
        const response = await fetch(`${BACKEND_URL}/admin/cache/${ADMIN_PASSWORD}`);
        const data = await response.json();
        alert(`Кэш: ${data.total_answers} ответов, ${data.total_mb} MB`);
    } catch (error) {
        alert('Ошибка при проверке кэша');
    }
}

async function checkAdminPassword(password) {
    if (password === ADMIN_PASSWORD) {
        localStorage.setItem('admin_logged_in', 'true');
        document.getElementById('adminModal').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'block';
        return true;
    } else {
        alert('Неверный пароль, командир!');
        return false;
    }
}

// Обработчики админ-модалки
const adminIcon = document.getElementById('adminIcon');
const adminModal = document.getElementById('adminModal');
const adminLoginBtn = document.getElementById('adminLoginBtn');
const adminCloseBtn = document.getElementById('adminCloseBtn');
const adminPasswordInput = document.getElementById('adminPassword');

if (adminIcon) {
    adminIcon.addEventListener('click', () => {
        if (adminModal) adminModal.style.display = 'flex';
    });
}

if (adminLoginBtn) {
    adminLoginBtn.addEventListener('click', () => {
        const pwd = adminPasswordInput?.value || '';
        checkAdminPassword(pwd);
    });
}

if (adminCloseBtn) {
    adminCloseBtn.addEventListener('click', () => {
        if (adminModal) adminModal.style.display = 'none';
    });
}

if (adminPasswordInput) {
    adminPasswordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            checkAdminPassword(adminPasswordInput.value);
        }
    });
}

// Кнопки админ-панели
const checkBalanceBtn = document.getElementById('checkBalanceBtn');
if (checkBalanceBtn) checkBalanceBtn.addEventListener('click', checkBalance);

const checkCacheBtn = document.getElementById('checkCacheBtn');
if (checkCacheBtn) checkCacheBtn.addEventListener('click', checkCache);

const logoutAdminBtn = document.getElementById('logoutAdminBtn');
if (logoutAdminBtn) {
    logoutAdminBtn.addEventListener('click', () => {
        localStorage.removeItem('admin_logged_in');
        document.getElementById('adminPanel').style.display = 'none';
        const adminIcon = document.getElementById('adminIcon');
        if (adminIcon) adminIcon.style.display = 'none';
        alert('Вы вышли из админки');
    });
}

const closeAdminPanelBtn = document.getElementById('closeAdminPanelBtn');
if (closeAdminPanelBtn) {
    closeAdminPanelBtn.addEventListener('click', () => {
        document.getElementById('adminPanel').style.display = 'none';
    });
}

// === ОСНОВНАЯ ЛОГИКА ===
askButton.addEventListener('click', askQuestion);
questionInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') askQuestion();
});

// Обработка нажатий на динамические кнопки
document.querySelectorAll('.sample-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const question = btn.textContent;
        if (question) {
            questionInput.value = question;
            askQuestion();
        }
    });
});

function showLoading() {
    startTime = Date.now();
    answerContainer.innerHTML = `
        <div class="loading-container">
            <div class="loading-spinner"></div>
            <div class="loading-text">🔍 Ищу в закромах...</div>
            <div class="loading-timer">0 сек</div>
        </div>
    `;
    
    loadingInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const timerEl = document.querySelector('.loading-timer');
        if (timerEl) timerEl.textContent = `${elapsed} сек`;
        
        if (elapsed > 15) {
            const stepText = document.querySelector('.loading-text');
            if (stepText && !stepText.textContent.includes('не сплю')) {
                stepText.textContent = '🥱 Сеть тупит, но я не сплю...';
            }
        }
        if (elapsed > 25) {
            const stepText = document.querySelector('.loading-text');
            if (stepText && !stepText.textContent.includes('сложная')) {
                stepText.textContent = '🤯 Тяжёлый вопрос, но я справлюсь!';
            }
        }
    }, 1000);
}

function hideLoading() {
    if (loadingInterval) {
        clearInterval(loadingInterval);
        loadingInterval = null;
    }
}

async function askQuestion() {
    const question = questionInput.value.trim();
    if (!question) return;
    
    // Добавляем вопрос в историю кнопок
    addQuestionToHistory(question);
    
    currentQuestion = question;
    showLoading();
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/ask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: question })
        });
        
        if (!response.ok) throw new Error('Ошибка сервера');
        
        const data = await response.json();
        currentTitle = data.title || '';
        hideLoading();
        displayAnswer(data.answer, true);
    } catch (error) {
        hideLoading();
        answerContainer.innerHTML = `
            <div class="loading-container">
                <div style="color: #d32f2f;">⚠️ Что-то пошло не так, братан</div>
                <div style="color: #5f6368;">Сервер ещё не проснулся. Попробуй через минуту.</div>
                <button onclick="location.reload()">🔄 Обновить</button>
            </div>
        `;
    }
}

async function askFull() {
    showLoading();
    try {
        const response = await fetch(`${BACKEND_URL}/api/ask/full`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: currentQuestion, title: currentTitle })
        });
        if (!response.ok) throw new Error('Ошибка сервера');
        const data = await response.json();
        hideLoading();
        displayAnswer(data.answer, false);
    } catch (error) {
        hideLoading();
        answerContainer.innerHTML = '<div class="loading-container"><div style="color: #d32f2f;">Ошибка, братан. Попробуй позже.</div></div>';
    }
}

async function askSuggestion(suggestion) {
    showLoading();
    try {
        const response = await fetch(`${BACKEND_URL}/api/ask/suggestion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ suggestion: suggestion })
        });
        if (!response.ok) throw new Error('Ошибка сервера');
        const data = await response.json();
        currentTitle = data.title || '';
        hideLoading();
        displayAnswer(data.answer, true);
    } catch (error) {
        hideLoading();
        answerContainer.innerHTML = '<div class="loading-container"><div style="color: #d32f2f;">Ошибка, братан. Попробуй позже.</div></div>';
    }
}

function displayAnswer(answerHtml, showFullButton) {
    answerContainer.innerHTML = answerHtml;
    
    document.querySelectorAll('.mention').forEach(el => {
        el.addEventListener('click', () => {
            const name = el.getAttribute('data-name');
            if (name) {
                questionInput.value = name;
                askQuestion();
            }
        });
    });
    
    document.querySelectorAll('.suggestion').forEach(el => {
        el.addEventListener('click', () => {
            const suggestion = el.getAttribute('data-name');
            if (suggestion) {
                askSuggestion(suggestion);
            }
        });
    });
    
    if (showFullButton && currentTitle) {
        const button = document.createElement('button');
        button.textContent = '📖 Подробнее';
        button.className = 'more-button';
        button.onclick = askFull;
        answerContainer.appendChild(button);
    }

    // Принудительное скрытие админки в APK
if (isWebView()) {
    const ids = ['adminIcon', 'adminModal', 'adminPanel'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

// Инициализируем кнопки при загрузке страницы
initButtons();
