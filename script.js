const questionInput = document.getElementById('questionInput');
const askButton = document.getElementById('askButton');
const answerContainer = document.getElementById('answerContainer');

// Определяем адрес бэкенда
// Если сайт открыт локально — стучимся на localhost, если на GitHub Pages — на Render
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://bro-pedia.onrender.com'; // Этот адрес заменишь позже на свой

askButton.addEventListener('click', askQuestion);
questionInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') askQuestion();
});

async function askQuestion() {
    const question = questionInput.value.trim();
    if (!question) return;
    
    answerContainer.innerHTML = '<div class="loading">Думаю, братан...</div>';
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/ask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: question })
        });
        
        if (!response.ok) throw new Error('Ошибка сервера');
        
        const data = await response.json();
        displayAnswer(data.answer);
    } catch (error) {
        answerContainer.innerHTML = '<div class="loading">Ошибка, братан. Бэкенд ещё не проснулся. Попробуй через минуту.</div>';
    }
}

function displayAnswer(answerHtml) {
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
}
