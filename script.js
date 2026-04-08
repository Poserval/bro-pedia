const questionInput = document.getElementById('questionInput');
const askButton = document.getElementById('askButton');
const answerContainer = document.getElementById('answerContainer');

const BACKEND_URL = 'https://bro-pedia.onrender.com';

let currentQuestion = '';
let currentTitle = '';

askButton.addEventListener('click', askQuestion);
questionInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') askQuestion();
});

async function askQuestion() {
    const question = questionInput.value.trim();
    if (!question) return;
    
    currentQuestion = question;
    answerContainer.innerHTML = '<div class="loading">Думаю, братан...</div>';
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/ask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: question })
        });
        
        if (!response.ok) throw new Error('Ошибка сервера');
        
        const data = await response.json();
        currentTitle = data.title || '';
        displayAnswer(data.answer, true);
    } catch (error) {
        answerContainer.innerHTML = '<div class="loading">Ошибка, братан. Сервер ещё не проснулся. Попробуй через минуту.</div>';
    }
}

async function askFull() {
    answerContainer.innerHTML = '<div class="loading">Гружу подробности, бро...</div>';
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/ask/full`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: currentQuestion, title: currentTitle })
        });
        
        if (!response.ok) throw new Error('Ошибка сервера');
        
        const data = await response.json();
        displayAnswer(data.answer, false);
    } catch (error) {
        answerContainer.innerHTML = '<div class="loading">Ошибка, братан. Попробуй позже.</div>';
    }
}

async function askSuggestion(suggestion) {
    answerContainer.innerHTML = '<div class="loading">Понял, сейчас гляну...</div>';
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/ask/suggestion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ suggestion: suggestion })
        });
        
        if (!response.ok) throw new Error('Ошибка сервера');
        
        const data = await response.json();
        currentTitle = data.title || '';
        displayAnswer(data.answer, true);
    } catch (error) {
        answerContainer.innerHTML = '<div class="loading">Ошибка, братан. Попробуй позже.</div>';
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
    
    // Обработка предложений (если Википедия не нашла)
    document.querySelectorAll('.suggestion').forEach(el => {
        el.addEventListener('click', () => {
            const suggestion = el.getAttribute('data-name');
            if (suggestion) {
                askSuggestion(suggestion);
            }
        });
    });
    
    // Добавляем кнопку "Подробнее", если это краткий ответ и есть полная версия
    if (showFullButton && currentTitle) {
        const button = document.createElement('button');
        button.textContent = '📖 Подробнее';
        button.style.cssText = 'margin-top: 20px; padding: 10px 20px; background: #1a73e8; color: white; border: none; border-radius: 24px; cursor: pointer; font-size: 16px;';
        button.onclick = askFull;
        answerContainer.appendChild(button);
    }
}
