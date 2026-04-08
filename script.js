const questionInput = document.getElementById('questionInput');
const askButton = document.getElementById('askButton');
const answerContainer = document.getElementById('answerContainer');

askButton.addEventListener('click', askQuestion);
questionInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') askQuestion();
});

async function askQuestion() {
    const question = questionInput.value.trim();
    if (!question) return;
    
    // Показываем загрузку
    answerContainer.innerHTML = '<div class="loading">Думаю, братан...</div>';
    
    // Пока бэкенда нет — используем заглушку
    // Потом заменим этот блок на реальный запрос к /api/ask
    
    setTimeout(() => {
        const mockAnswer = `Слушай, кекс. ${question} — это тема, которую мы точно переработаем. Пока бэкенд настраивается, но скоро здесь будет живой ответ по понятиям. А вообще, ты краш, что тестишь!`;
        displayAnswer(mockAnswer);
    }, 500);
    
    // Реальный код будет выглядеть так:
    /*
    try {
        const response = await fetch('/api/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: question })
        });
        const data = await response.json();
        displayAnswer(data.answer);
    } catch (error) {
        answerContainer.innerHTML = '<div class="loading">Ошибка, братан. Попробуй позже.</div>';
    }
    */
}

function displayAnswer(answerHtml) {
    answerContainer.innerHTML = answerHtml;
    
    // Навешиваем обработчики на кликабельные имена
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
