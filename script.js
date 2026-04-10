const questionInput = document.getElementById('questionInput');
const askButton = document.getElementById('askButton');
const answerContainer = document.getElementById('answerContainer');

// Определяем адрес бэкенда
const BACKEND_URL = 'https://bro-pedia.onrender.com';

let currentQuestion = '';
let currentTitle = '';
let loadingInterval = null;
let startTime = null;

// === АДМИН-ПАНЕЛЬ (только для сайта) ===
const ADMIN_PASSWORD = 'bropedia2025';

// Проверяем, открыто ли приложение в WebView (APK)
function isWebView() {
    const userAgent = navigator.userAgent.toLowerCase();
    return userAgent.includes('wv') || userAgent.includes('android webview');
}

// Показываем иконку админки только в браузере (не в APK)
if (!isWebView() && localStorage.getItem('admin_logged_in') === 'true') {
    const adminIcon = document.getElementById('adminIcon');
    if (adminIcon) adminIcon.style.display = 'flex';
}

// Функция проверки баланса DeepSeek
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

// Функция проверки кэша
async function checkCache() {
    try {
        const response = await fetch(`${BACKEND_URL}/admin/cache/${ADMIN_PASSWORD}`);
        const data = await response.json();
        alert(`Кэш: ${data.total_answers} ответов, ${data.total_mb} MB`);
    } catch (error) {
        alert('Ошибка при проверке кэша');
    }
}

// Функция входа в админку
async function checkAdminPassword(password) {
    if (password === ADMIN_PASSWORD) {
        localStorage.setItem('admin_logged_in', 'true');
        const adminIcon = document.getElementById('adminIcon');
        if (adminIcon) adminIcon.style.display = 'flex';
        document.getElementById('adminModal').style.display = 'none';
        alert('Добро пожаловать в админку, командир!');
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

// === ОСНОВНАЯ ЛОГИКА ПРИЛОЖЕНИЯ ===
askButton.addEventListener('click', askQuestion);
questionInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') askQuestion();
});

function showLoading() {
    startTime = Date.now();
    
    const steps = ['🔍 Ищу в закромах...', '🤔 Думаю как по понятиям...', '✍️ Нанизываю слоган...', '✨ Почти готово...'];
    let stepIndex = 0;
    
    answerContainer.innerHTML = `
        <div class="loading-container">
            <div class="loading-spinner"></div>
            <div class="loading-text">${steps[0]}</div>
            <div class="loading-timer">0 сек</div>
        </div>
    `;
    
    loadingInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const timerEl = document.querySelector('.loading-timer');
        if (timerEl) timerEl.textContent = `${elapsed} сек`;
        
        if (elapsed > 3 && stepIndex < steps.length - 1) {
            stepIndex++;
            const stepText = document.querySelector('.loading-text');
            if (stepText) stepText.textContent = steps[stepIndex];
        }
        
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
                <div style="color: #d32f2f; margin-bottom: 10px;">⚠️ Что-то пошло не так, братан</div>
                <div style="color: #5f6368;">Сервер ещё не проснулся. Попробуй через минуту.</div>
                <button onclick="location.reload()" style="margin-top: 15px; padding: 8px 16px; background: #1a73e8; color: white; border: none; border-radius: 20px; cursor: pointer;">🔄 Обновить</button>
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
}

// === PWA: РЕГИСТРАЦИЯ SERVICE WORKER ===
if ('serviceWorker' in navigator && !isWebView()) {
    navigator.serviceWorker.register('/sw.js').then(reg => {
        console.log('✅ SW registered:', reg);
    }).catch(err => {
        console.log('❌ SW error:', err);
    });
}
