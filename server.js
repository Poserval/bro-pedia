const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Простая база в памяти (потом заменим на SQLite)
const cache = new Map();

// Функция получения инфы из Википедии
async function getWikipediaInfo(question) {
    // Пробуем найти статью на русском
    const searchUrl = `https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(question)}`;
    
    try {
        const response = await fetch(searchUrl);
        
        if (response.status === 404) {
            // Не нашли статью — пробуем поиск
            const searchResponse = await fetch(`https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(question)}&format=json&origin=*`);
            const searchData = await searchResponse.json();
            
            if (searchData.query.search.length > 0) {
                const title = searchData.query.search[0].title;
                const articleResponse = await fetch(`https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
                return await articleResponse.json();
            }
            return null;
        }
        
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error('Википедия ошибка:', error.message);
        return null;
    }
}

// Функция переработки в пацанский стиль (через DeepSeek)
async function makeItBro(question, wikiText) {
    // Пока заглушка — следующий шаг подключим DeepSeek
    return `<p><strong>${question}</strong> — тема серьёзная, братан.</p>
             <p>${wikiText.substring(0, 500)}...</p>
             <p>А вообще, ты краш, что интересуешься. Скоро здесь будет полный пересказ по понятиям, с пацанским сленгом и без скукоты.</p>
             <p><span class="mention" data-name="Википедия">Википедия</span> — наша база, но мы делаем свою игру.</p>`;
}

app.post('/api/ask', async (req, res) => {
    const { question } = req.body;
    
    if (!question) {
        return res.status(400).json({ error: 'Вопрос не задан, братан' });
    }
    
    console.log(`[${new Date().toISOString()}] Вопрос: ${question}`);
    
    // Проверяем кэш
    if (cache.has(question)) {
        console.log('Из кэша');
        return res.json({ answer: cache.get(question) });
    }
    
    // Идём в Википедию
    const wikiData = await getWikipediaInfo(question);
    
    let answer;
    if (wikiData && wikiData.extract) {
        // Нашли инфу — перерабатываем
        answer = await makeItBro(question, wikiData.extract);
    } else {
        // Не нашли — вежливо сообщаем
        answer = `<p>Слушай, бро. Про <strong>${question}</strong> я даже в Википедии не нашёл нормальной инфы.</p>
                  <p>Может, ты перепутал название? Или это слишком редкая тема. Попробуй спросить что-то другое, а я пока поищу глубже.</p>
                  <p>Ты всё равно краш, что тестишь эту хрень 🤝</p>`;
    }
    
    // Сохраняем в кэш
    cache.set(question, answer);
    
    res.json({ answer });
});

app.listen(PORT, () => {
    console.log(`🔥 Bro-педия работает на порту ${PORT}`);
});
