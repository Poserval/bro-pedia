const questionInput = document.getElementById('questionInput');
const askButton = document.getElementById('askButton');
const answerContainer = document.getElementById('answerContainer');

// Определяем адрес бэкенда
const BACKEND_URL = 'https://bro-pedia.onrender.com';

let currentQuestion = '';
let currentTitle = '';
let loadingInterval = null;
let startTime = null;

askButton.addEventListener('click', askQuestion);
questionInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') askQuestion();
});

// === АДМИН-КНОПКА (только для тебя, через секретный URL) ===
const ADMIN_SECRET_KEY = 'bropedia2025'; // Секретный ключ — замени на свой

// Проверяем URL-параметр
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('admin') === ADMIN_SECRET_KEY) {
    localStorage.setItem('admin_mode', 'true');
    // Убираем параметр из URL, чтобы не светить
    window.history.replaceState({}, document.title, window.location.pathname);
}

// Показываем кнопку, если режим админа включён
if (localStorage.getItem('admin_mode') === 'true') {
    const adminBtn = document.getElementById('adminButton');
    if (adminBtn) adminBtn.style.display = 'flex';
}

// Функция для ручного включения (через консоль)
window.enableAdminMode = () => {
    localStorage.setItem('admin_mode', 'true');
    document.getElementById('adminButton').style.display = 'flex';
    alert('Режим админа включен! Жми на 🔧');
};

// Функция выхода из админки
window.logoutAdmin = () => {
    localStorage.removeItem('admin_mode');
    document.getElementById('adminButton').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'none';
    alert('Вы вышли из админки');
};

// Функция загрузки данных в админ-панель
async function loadAdminData() {
    const adminContent = document.getElementById('adminContent');
    if (!adminContent) return;
    
    adminContent.innerHTML = '<div class="loading">Загрузка...</div>';
    
    try {
        const [balanceRes, cacheRes] = await Promise.all([
            fetch(`${BACKEND_URL}/api/balance`),
            fetch(`${BACKEND_URL}/admin/cache/bropedia2025`)
        ]);
        
        const balance = await balanceRes.json();
        const cacheStats = await cacheRes.json();
        
        const balanceCNY = balance.cny || 0;
        const isLow = balanceCNY < 1;
        
        const html = `
            <div style="margin-bottom: 16px; padding: 12px; background: ${isLow ? '#ffebee' : '#e8f0fe'}; border-radius: 12px;">
                <div style="font-size: 13px; color: #5f6368;">💰 Баланс DeepSeek</div>
                <div style="font-size: 24px; font-weight: bold; color: ${isLow ? '#d32f2f' : '#1a73e8'};">
                    ${balanceCNY.toFixed(2)} CNY
                </div>
                <div style="font-size: 12px; color: #5f6368;">
                    ≈ $${balance.usd || '?'} / ${balance.rub || '?'} ₽
                </div>
                ${isLow ? '<div style="margin-top: 8px; color: #d32f2f; font-size: 12px;">⚠️ Баланс ниже 1 CNY! Пора пополнять.</div>' : ''}
            </div>
            
            <div style="margin-bottom: 16px; padding: 12px; background: #f1f3f4; border-radius: 12px;">
                <div style="font-size: 13px; color: #5f6368;">💾 Кэш (PostgreSQL)</div>
                <div style="font-size: 20px; font-weight: bold;">${cacheStats.total_answers || 0} ответов</div>
                <div style="font-size: 12px; color: #5f6368;">Занято: ${cacheStats.total_mb || 0} МБ</div>
            </div>
            
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button id="adminTopUpBtn" style="background: #1a73e8; color: white; border: none; padding: 8px 12px; border-radius: 20px; cursor: pointer; font-size: 12px;">💰 Пополнить</button>
                <button id="adminRefreshBtn" style="background: #5f6368; color: white; border: none; padding: 8px 12px; border-radius: 20px; cursor: pointer; font-size: 12px;">🔄 Обновить</button>
                <button id="adminLogoutBtn" style="background: #d32f2f; color: white; border: none; padding: 8px 12px; border-radius: 20px; cursor: pointer; font-size: 12px;">🚪 Выйти</button>
            </div>
        `;
        
        adminContent.innerHTML = html;
        
        // Назначаем обработчики кнопок внутри панели
        document.getElementById('adminTopUpBtn')?.addEventListener('click', () => {
            window.open('https://platform.deepseek.com/top_up', '_blank');
        });
        
        document.getElementById('adminRefreshBtn')?.addEventListener('click', () => {
            loadAdminData(); // Обновляем данные, не закрывая панель
        });
        
        document.getElementById('adminLogoutBtn')?.addEventListener('click', () => {
            logoutAdmin();
        });
        
    } catch (error) {
        adminContent.innerHTML = '<div style="color: red;">Ошибка загрузки данных</div>';
    }
}

// Открыть/закрыть админ-панель
const adminButton = document.getElementById('adminButton');
const adminPanel = document.getElementById('adminPanel');
const closeAdminBtn = document.getElementById('closeAdminBtn');

adminButton?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (adminPanel.style.display === 'block') {
        adminPanel.style.display = 'none';
    } else {
        adminPanel.style.display = 'block';
        loadAdminData();
    }
});

closeAdminBtn?.addEventListener('click', () => {
    adminPanel.style.display = 'none';
});

// Закрыть админку при клике вне её
document.addEventListener('click', (e) => {
    if (adminPanel && adminPanel.style.display === 'block') {
        if (!adminPanel.contains(e.target) && !adminButton.contains(e.target)) {
            adminPanel.style.display = 'none';
        }
    }
});

// === ФУНКЦИИ ЗАГРУЗКИ И ОТВЕТОВ ===
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
    
    // Обработка кликабельных имён
    document.querySelectorAll('.mention').forEach(el => {
        el.addEventListener('click', () => {
            const name = el.getAttribute('data-name');
            if (name) {
                questionInput.value = name;
                askQuestion();
            }
        });
    });
    
    // Обработка предложений
    document.querySelectorAll('.suggestion').forEach(el => {
        el.addEventListener('click', () => {
            const suggestion = el.getAttribute('data-name');
            if (suggestion) {
                askSuggestion(suggestion);
            }
        });
    });
    
    // Кнопка "Подробнее"
    if (showFullButton && currentTitle) {
        const button = document.createElement('button');
        button.textContent = '📖 Подробнее';
        button.style.cssText = 'margin-top: 20px; padding: 10px 20px; background: #1a73e8; color: white; border: none; border-radius: 24px; cursor: pointer; font-size: 16px; transition: background 0.2s;';
        button.onmouseover = () => button.style.background = '#1557b0';
        button.onmouseout = () => button.style.background = '#1a73e8';
        button.onclick = askFull;
        answerContainer.appendChild(button);
    }
}
