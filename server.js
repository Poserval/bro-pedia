const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.')); // отдаем нашу HTML/CSS/JS

// Заглушка для DeepSeek — пока отвечаем тестово, но уже живой маршрут
app.post('/api/ask', async (req, res) => {
    const { question } = req.body;
    
    if (!question) {
        return res.status(400).json({ error: 'Вопрос не задан, братан' });
    }
    
    console.log(`Вопрос: ${question}`);
    
    // ВРЕМЕННАЯ ЗАГЛУШКА — следующим шагом подключим реальный DeepSeek
    const mockAnswer = `
        <p>Слушай, кекс. <strong>${question}</strong> — это тема, которую мы переработаем по-настоящему, как только я подключу DeepSeek API.</p>
        <p>А пока — ты краш, что тестишь. Скоро здесь будут живые ответы по понятиям, с <span class="mention" data-name="Википедия">Википедией</span> и пацанским сленгом.</p>
        <p>Осталось чуть-чуть, командир.</p>
    `;
    
    res.json({ answer: mockAnswer });
});

app.listen(PORT, () => {
    console.log(`Бро-педия работает на порту ${PORT}`);
});
