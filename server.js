const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Кэш для кратких и полных ответов
const cache = new Map();

// === ФУНКЦИЯ ОБРАБОТКИ РАСПЛЫВЧАТЫХ ЧИСЕЛ ===
function replaceVagueNumbers(text) {
    const rules = [
        { from: /\b(очень много|много|куча|уйма)\b/gi, to: 'чуть меньше чем до хрена' },
        { from: /\b(почти всё|почти все|почти весь)\b/gi, to: 'чуть меньше чем до хрена' },
        { from: /\b(ничего не осталось|остался ни с чем|ноль)\b/gi, to: 'чуть меньше чем с ничего' },
        { from: /\b(миллионы|тысячи|сотни)\b(?!\s*цифр|\s*чисел)/gi, to: 'до хрена' },
        { from: /\b(очень мало|мало|немного)\b/gi, to: 'чуть больше чем до хрена' }
    ];
    
    let result = text;
    for (const rule of rules) {
        result = result.replace(rule.from, rule.to);
    }
    return result;
}

// === ПОИСК В ВИКИПЕДИИ С ПРЕДЛОЖЕНИЕМ ВАРИАНТОВ ===
async function searchWikipedia(query) {
    try {
        // Прямой поиск статьи
        const url = `https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
        const response = await fetch(url);
        
        if (response.status === 404) {
            // Поиск похожих
            const searchUrl = `https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
            const searchRes = await fetch(searchUrl);
            const searchData = await searchRes.json();
            
            if (searchData.query && searchData.query.search.length > 0) {
                const suggestions = searchData.query.search.slice(0, 3).map(s => s.title);
                return { found: false, suggestions };
            }
            return { found: false, suggestions: [] };
        }
        
        if (!response.ok) return { found: false, suggestions: [] };
        const data = await response.json();
        return { found: true, data };
    } catch (e) {
        console.error('Wikipedia error:', e.message);
        return { found: false, suggestions: [] };
    }
}

// === ПОЛУЧЕНИЕ ПОЛНОЙ СТАТЬИ (без примечаний, ссылок, литературы) ===
async function getFullArticle(title) {
    try {
        const url = `https://ru.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title)}`;
        const response = await fetch(url);
        if (!response.ok) return null;
        
        const html = await response.text();
        
        // Грубая очистка от мусора
        let cleanText = html
            .replace(/<style[^>]*>.*?<\/style>/gis, '')
            .replace(/<script[^>]*>.*?<\/script>/gis, '')
            .replace(/<ref[^>]*>.*?<\/ref>/gis, '')
            .replace(/<li[^>]*class="mw-gallery[^>]*>.*?<\/li>/gis, '')
            .replace(/<table[^>]*class="infobox[^>]*>.*?<\/table>/gis, '') // карточка отдельно
            .replace(/<a[^>]*href="\/wiki\/[^:"]*"[^>]*>/g, '')
            .replace(/<\/a>/g, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/\[\d+\]/g, '')
            .replace(/Примечания|Ссылки|Литература|Источники[^.]*\./gi, '')
            .trim();
        
        // Ограничиваем длину (около 5000 символов для полного ответа)
        return cleanText.length > 5000 ? cleanText.substring(0, 5000) + '...' : cleanText;
    } catch (e) {
        console.error('Full article error:', e.message);
        return null;
    }
}

// === ОБЩАЯ ФУНКЦИЯ ДЛЯ ЗАПРОСА К DEEPSEEK ===
async function askDeepSeek(question, context, mode = 'short') {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        return fallbackResponse(question, context, mode);
    }
    
    const systemPromptShort = `Ты — дружелюбный тинейджер-пересказчик для сайта "Bro-педия". 
Твоя задача: пересказать информацию максимально коротко, 3-5 предложений, в пацанском стиле.
Правила:
- Никаких оскорблений и мата. Сленг можно: кекс, краш, хайп, имба, крипово, рофл.
- Никогда не упоминай Википедию, DeepSeek, API, источники. Ты просто "шаришь".
- Важные имена оберни в HTML: <span class="mention" data-name="Имя">Имя</span>
- Если есть точные цифры — оставляй их. Если расплывчатое "много" или "мало" — заменяй на "чуть меньше чем до хрена" и т.д.
- Обращайся к пользователю как "братан", "кекс", "бро".
- Будь живым и дружелюбным, используй эмодзи 🔥🤝😎`;

    const systemPromptFull = `Ты — дружелюбный тинейджер-пересказчик для сайта "Bro-педия". 
Твоя задача: пересказать информацию ПОЛНОСТЬЮ, но в пацанском стиле. 10-15 предложений.
Правила:
- Никаких оскорблений и мата. Сленг можно: кекс, краш, хайп, имба.
- Никогда не упоминай Википедию, DeepSeek, API, источники.
- Важные имена оберни в HTML: <span class="mention" data-name="Имя">Имя</span>
- Если есть точные цифры — оставляй. Если расплывчатое "много" — заменяй на "чуть меньше чем до хрена".
- Убирай примечания, ссылки, литературу. Оставляй только факты и сюжет.
- Обращайся к пользователю как "братан", "кекс", "бро".`;

    const systemPrompt = mode === 'short' ? systemPromptShort : systemPromptFull;
    
    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Вопрос: ${question}\nИнформация: ${context}` }
                ],
                temperature: 0.8,
                max_tokens: mode === 'short' ? 500 : 1500
            })
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        let answer = data.choices[0].message.content;
        // Дополнительная обработка чисел на всякий случай
        answer = replaceVagueNumbers(answer);
        return answer;
    } catch (error) {
        console.error('DeepSeek error:', error.message);
        return fallbackResponse(question, context, mode);
    }
}

function fallbackResponse(question, context, mode) {
    const shortText = context.length > 600 ? context.substring(0, 600) + '...' : context;
    if (mode === 'short') {
        return `<p><strong>${question}</strong> — тема такая, братан.</p>
                <p>${shortText}</p>
                <p>🤝 Кратко, но ёмко. Жми "Подробнее" — там полная версия!</p>`;
    } else {
        return `<p><strong>${question}</strong> — разложил по понятиям.</p>
                <p>${context}</p>
                <p>🔥 Надеюсь, теперь ясно, бро!</p>`;
    }
}

// === ОБРАБОТЧИК КРАТКОГО ОТВЕТА ===
app.post('/api/ask', async (req, res) => {
    const { question } = req.body;
    console.log(`[${new Date().toISOString()}] Кратко: ${question}`);
    
    if (!question) {
        return res.status(400).json({ error: 'Вопрос не задан, братан' });
    }
    
    const cacheKey = `short_${question}`;
    if (cache.has(cacheKey)) {
        console.log('Из кэша (краткий)');
        return res.json({ answer: cache.get(cacheKey) });
    }
    
    const wikiResult = await searchWikipedia(question);
    
    if (!wikiResult.found) {
        if (wikiResult.suggestions && wikiResult.suggestions.length > 0) {
            const suggestionsHtml = `<p>Слушай, бро. Про <strong>${question}</strong> я точняк не нашёл.</p>
                                      <p>Может, ты имел в виду:</p>
                                      <ul>${wikiResult.suggestions.map(s => `<li><span class="suggestion" data-name="${s}">${s}</span></li>`).join('')}</ul>
                                      <p>Ткни на вариант — и я расскажу!</p>`;
            return res.json({ answer: suggestionsHtml });
        } else {
            const notFoundHtml = `<p>Братан, я перерыл всё, но про <strong>${question}</strong> нигде нет инфы.</p>
                                  <p>Попробуй спросить что-то другое или перефразируй. Ты всё равно краш! 🤝</p>`;
            return res.json({ answer: notFoundHtml });
        }
    }
    
    const wikiData = wikiResult.data;
    let fullText = wikiData.extract || '';
    // Обработка чисел в сыром тексте перед отправкой в DeepSeek
    fullText = replaceVagueNumbers(fullText);
    
    const answer = await askDeepSeek(question, fullText, 'short');
    cache.set(cacheKey, answer);
    res.json({ answer, title: wikiData.title });
});

// === ОБРАБОТЧИК ПОЛНОГО ОТВЕТА ===
app.post('/api/ask/full', async (req, res) => {
    const { question, title } = req.body;
    console.log(`[${new Date().toISOString()}] Полный ответ: ${question}`);
    
    const cacheKey = `full_${question}`;
    if (cache.has(cacheKey)) {
        console.log('Из кэша (полный)');
        return res.json({ answer: cache.get(cacheKey) });
    }
    
    let fullArticle = await getFullArticle(title);
    if (!fullArticle) {
        // Fallback: используем краткое описание из summary
        const wikiResult = await searchWikipedia(question);
        fullArticle = wikiResult.found ? wikiResult.data.extract : 'Информация временно недоступна.';
    }
    
    fullArticle = replaceVagueNumbers(fullArticle);
    const answer = await askDeepSeek(question, fullArticle, 'full');
    cache.set(cacheKey, answer);
    res.json({ answer });
});

// === ОБРАБОТЧИК ДЛЯ ВАРИАНТОВ ИЗ ПРЕДЛОЖЕНИЙ ===
app.post('/api/ask/suggestion', async (req, res) => {
    const { suggestion } = req.body;
    // Просто перенаправляем на обычный запрос с выбранным вариантом
    const wikiResult = await searchWikipedia(suggestion);
    if (wikiResult.found) {
        const answer = await askDeepSeek(suggestion, wikiResult.data.extract, 'short');
        res.json({ answer, title: wikiResult.data.title });
    } else {
        res.json({ answer: `<p>Бро, с <strong>${suggestion}</strong> тоже ничего не вышло. Попробуй что-то ещё.</p>` });
    }
});

app.use(express.static('.'));
app.listen(PORT, () => {
    console.log(`🔥 Bro-педия 2.0 на порту ${PORT}`);
});

// === ALTERNATIVНЫЙ ИСТОЧНИК: WIKIMEDIA ENTERPRISE API ===
async function searchEnterpriseAPI(query) {
    const enterpriseKey = process.env.WIKI_ENTERPRISE_KEY;
    if (!enterpriseKey) {
        console.log('Enterprise API ключ отсутствует');
        return null;
    }
    
    try {
        // Поиск статьи через Enterprise API
        const url = `https://enterprise.wikimedia.com/api/v1/on-demand?title=${encodeURIComponent(query)}&format=json`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${enterpriseKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            console.log(`Enterprise API error: ${response.status}`);
            return null;
        }
        
        const data = await response.json();
        
        if (data && data.extract) {
            return {
                found: true,
                title: data.title || query,
                extract: data.extract,
                fullText: data.html || data.extract
            };
        }
        return null;
    } catch (error) {
        console.error('Enterprise API fetch error:', error.message);
        return null;
    }
}
