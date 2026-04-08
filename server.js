const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Инициализация клиента DeepSeek (совместим с OpenAI SDK)
const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com'
});

// Кэш
const cache = new Map();

// Функция поиска в Википедии (оставляем как есть)
async function getWikipediaInfo(question) {
    try {
        const url = `https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(question)}`;
        const response = await fetch(url);
        
        if (response.status === 404) {
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

// Функция переработки текста через DeepSeek (пацанский стиль)
async function makeItBro(question, wikiText) {
    const systemPrompt = `Ты — дружелюбный тинейджер-пересказчик для сайта "Bro-педия". 
Твоя задача: пересказать статью из Википедии в пацанском стиле для молодёжи.

Правила:
1. Никаких оскорблений и мата. Дружеский сленг можно: кекс, краш, хайп, имба, крипово, рофл, зашквар (без жести).
2. Ответ должен быть информативным, 5-10 предложений, все ключевые факты из статьи.
3. Важные имена других персонажей/авторов оберни в HTML: <span class="mention" data-name="Имя">Имя</span>
4. Обращайся к пользователю как "братан", "кекс", "бро", "командир" (на выбор).
5. Ответ должен быть живым, как будто старший брат объясняет младшему.
6. Используй эмодзи где уместно (🤝, 🔥, 😎), но не перебарщивай.`;

    const userPrompt = `Вопрос пользователя: "${question}"
Текст из Википедии:
${wikiText.substring(0, 3000)}  // Ограничиваем длину, чтобы не перегружать

Перескажи это в пацанском стиле, добавь кликабельные имена.`;

    try {
        const response = await client.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.8,
            max_tokens: 1000
        });
        
        return response.choices[0].message.content;
    } catch (error) {
        console.error('DeepSeek API error:', error);
        // Fallback: возвращаем сырой текст из Википедии
        const shortText = wikiText.length > 600 ? wikiText.substring(0, 600) + '...' : wikiText;
        return `<p><strong>${question}</strong> — тема серьёзная, братан.</p>
                 <p>${shortText}</p>
                 <p><em>DeepSeek временно не отвечает, поэтому это сырой текст из Википедии. Скоро починим! 🤝</em></p>`;
    }
}

// Обработчик API
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
            answer = await makeItBro(question, wikiData.extract);
        } else {
            answer = `<p>Слушай, бро. Про <strong>${question}</strong> я ничего не нашёл в Википедии.</p>
                      <p>Попробуй перефразировать или спроси что-то другое. Ты всё равно краш! 🤝</p>`;
        }
        
        cache.set(question, answer);
        res.json({ answer });
    } catch (error) {
        console.error('Ошибка в обработчике:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Раздача статики
app.use(express.static('.'));

// Запуск
app.listen(PORT, () => {
    console.log(`🔥 Bro-педия работает на порту ${PORT}`);
});
