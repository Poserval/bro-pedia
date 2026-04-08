const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Разрешаем всё для простоты (временно)
app.use(cors());
app.use(express.json());

// Простой кэш
const cache = new Map();

// Функция поиска в Википедии
async function getWikipediaInfo(question) {
    try {
        const url = `https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(question)}`;
        const response = await fetch(url);
        
        if (response.status === 404) {
            // Пробуем поискать
            const searchUrl = `https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(question)}&format=json&origin=*`;
            const searchRes = await fetch(searchUrl);
            const searchData = await searchRes.json();
            
            if (searchData.query && searchData.query.search.length > 0) {
                const title = searchData.query.search[0].title;
                const articleRes = await fetch(`https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
                return await articleRes.json();
            }
            return null;
        }
        
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        console.error('Wikipedia error:', e.message);
        return null;
    }
}

// Временный ответ (потом заменим на DeepSeek)
function makeItBro(question, wikiText) {
    const shortText = wikiText.length > 600 ? wikiText.substring(0, 600) + '...' : wikiText;
    return `<p><strong>${question}</strong> — тема серьёзная, братан.</p>
             <p>${shortText}</p>
             <p><em>Скоро здесь будет полный пересказ по понятиям, с пацанским сленгом и кликабельными именами. А пока — ты краш, что тестишь! 🤝</em></p>`;
}

// ===== ЭТОТ БЛОК САМЫЙ ВАЖНЫЙ =====
// Обработчик API. Должен быть строго таким.
app.post('/api/ask', async (req, res) => {
    const { question } = req.body;
    
    console.log(`[${new Date().toISOString()}] Вопрос: ${question}`);
    
    if (!question) {
        return res.status(400).json({ error: 'Вопрос не задан, братан' });
    }
    
    // Проверяем кэш
    if (cache.has(question)) {
        console.log('Из кэша');
        return res.json({ answer: cache.get(question) });
    }
    
    try {
        const wikiData = await getWikipediaInfo(question);
        
        let answer;
        if (wikiData && wikiData.extract) {
            answer = makeItBro(question, wikiData.extract);
        } else {
            answer = `<p>Слушай, бро. Про <strong>${question}</strong> я ничего не нашёл в Википедии.</p>
                      <p>Попробуй перефразировать или спроси что-то другое. Ты всё равно краш! 🤝</p>`;
        }
        
        cache.set(question, answer);
        res.json({ answer });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});
// ===== КОНЕЦ ВАЖНОГО БЛОКА =====

// Раздаём статику (HTML, CSS, JS)
app.use(express.static('.'));

// Запускаем сервер
app.listen(PORT, () => {
    console.log(`🔥 Bro-педия работает на порту ${PORT}`);
    console.log(`✅ API доступен по адресу: https://bro-pedia.onrender.com/api/ask`);
});
