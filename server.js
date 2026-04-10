const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const app = express();
const PORT = process.env.PORT || 3000;

// === НАСТРОЙКА CORS ===
const allowedOrigins = ['https://poserval.github.io', 'http://localhost:3000', 'https://bro-pedia.onrender.com'];
app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            return callback(new Error('CORS policy'), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// === ПОДКЛЮЧЕНИЕ К POSTGRESQL ===
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initDB() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS cache (
            key TEXT PRIMARY KEY,
            answer TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('✅ Таблица cache готова');
}
initDB();

async function getCache(key) {
    const res = await pool.query('SELECT answer FROM cache WHERE key = $1', [key]);
    return res.rows[0]?.answer || null;
}

async function setCache(key, answer) {
    await pool.query(`
        INSERT INTO cache (key, answer, created_at) 
        VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET answer = $2, created_at = NOW()
    `, [key, answer]);
}

async function getCacheStats() {
    const res = await pool.query(`
        SELECT COUNT(*) as total_answers, SUM(LENGTH(answer)) as total_bytes FROM cache
    `);
    const totalBytes = parseInt(res.rows[0]?.total_bytes || 0);
    return {
        total_answers: parseInt(res.rows[0]?.total_answers || 0),
        total_mb: (totalBytes / (1024 * 1024)).toFixed(2)
    };
}

// === ОБРАБОТКА РАСПЛЫВЧАТЫХ ЧИСЕЛ ===
function replaceVagueNumbers(text) {
    const rules = [
        { from: /\b(очень много|много|куча|уйма)\b/gi, to: 'чуть меньше чем до хрена' },
        { from: /\b(почти всё|почти все|почти весь)\b/gi, to: 'чуть меньше чем до хрена' },
        { from: /\b(ничего не осталось|остался ни с чем|ноль)\b/gi, to: 'чуть меньше чем с ничего' },
        { from: /\b(миллионы|тысячи|сотни)\b(?!\s*цифр|\s*чисел)/gi, to: 'до хрена' },
        { from: /\b(очень мало|мало|немного)\b/gi, to: 'чуть больше чем до хрена' }
    ];
    let result = text;
    for (const rule of rules) result = result.replace(rule.from, rule.to);
    return result;
}

// === СЛОВАРЬ СИНОНИМОВ (ручные исправления) ===
const synonyms = {
    "ир маг": "Ип Ман",
    "ип ман": "Ип Ман",
    "шредингер": "Шрёдингер",
    "сталин": "Иосиф Сталин",
    "путин": "Владимир Путин",
    "зеленский": "Владимир Зеленский",
    "чебурашка": "Чебурашка",
    "крокодил гена": "Крокодил Гена",
    "шредингера кот": "Шрёдингер"
};

// === НЕЧЁТКОЕ СРАВНЕНИЕ (Levenshtein distance) ===
function levenshteinDistance(a, b) {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
            const cost = a[i-1] === b[j-1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i-1] + 1,
                matrix[j-1][i] + 1,
                matrix[j-1][i-1] + cost
            );
        }
    }
    return matrix[b.length][a.length];
}

function findSimilarQuestion(question, candidates) {
    const normalized = question.toLowerCase().trim();
    let bestMatch = null;
    let bestScore = 2;
    for (const candidate of candidates) {
        const distance = levenshteinDistance(normalized, candidate.toLowerCase());
        if (distance < bestScore) {
            bestScore = distance;
            bestMatch = candidate;
        }
    }
    return bestMatch;
}

// === УМНЫЙ ПОИСК ===
async function smartSearch(query) {
    const lowerQuery = query.toLowerCase().trim();
    if (synonyms[lowerQuery]) {
        console.log(`🔁 Синоним: "${query}" → "${synonyms[lowerQuery]}"`);
        return { found: true, query: synonyms[lowerQuery], method: 'synonym' };
    }
    
    try {
        const url = `https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
        const response = await fetch(url);
        if (response.status !== 404 && response.ok) {
            return { found: true, query: query, method: 'exact' };
        }
    } catch(e) { console.log('Wikipedia exact error:', e.message); }
    
    try {
        const searchUrl = `https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        
        if (searchData.query && searchData.query.search && searchData.query.search.length > 0) {
            const suggestions = searchData.query.search.slice(0, 5).map(s => s.title);
            for (const s of suggestions) {
                if (s.toLowerCase() === query.toLowerCase()) {
                    return { found: true, query: s, method: 'exact' };
                }
            }
            const similar = findSimilarQuestion(query, suggestions);
            if (similar) {
                console.log(`🔍 Нечёткое совпадение: "${query}" → "${similar}"`);
                return { found: true, query: similar, method: 'fuzzy' };
            }
            return { found: false, suggestions: suggestions };
        }
    } catch(e) { console.log('Wikipedia search error:', e.message); }
    
    return { found: false, suggestions: [] };
}

async function searchWikipedia(query) {
    try {
        const url = `https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
        const response = await fetch(url);
        if (response.status === 404) {
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
        return { found: true, data, source: 'wiki' };
    } catch (e) {
        console.error('Wikipedia error:', e.message);
        return { found: false, suggestions: [], error: true };
    }
}

async function askDeepSeek(question, context, mode = 'short') {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return fallbackResponse(question, context, mode);
    
    const systemPromptShort = `Ты — дружелюбный тинейджер-пересказчик для сайта "Bro-педия". 
Перескажи информацию максимально коротко, 3-5 предложений, в пацанском стиле.
Правила:
- Никаких оскорблений и мата. Сленг: кекс, краш, хайп, имба, крипово, рофл.
- НИКОГДА не упоминай источники информации.
- Важные имена оберни в HTML: <span class="mention" data-name="Имя">Имя</span>
- Обращайся к пользователю как "братан", "кекс", "бро".`;

    const systemPromptFull = `Ты — дружелюбный тинейджер-пересказчик. Перескажи информацию ПОЛНОСТЬЮ, 10-15 предложений, в пацанском стиле.`;
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
                    { role: 'user', content: `Вопрос: ${question}\nИнформация: ${context.substring(0, 3000)}` }
                ],
                temperature: 0.8,
                max_tokens: mode === 'short' ? 500 : 1500
            })
        });
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data = await response.json();
        let answer = data.choices[0].message.content;
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
                <p>🤝 Жми "Подробнее" — там полная версия!</p>`;
    } else {
        return `<p><strong>${question}</strong> — разложил по понятиям.</p>
                <p>${context}</p>
                <p>🔥 Надеюсь, теперь ясно!</p>`;
    }
}

// === API ДЛЯ ПОЛУЧЕНИЯ БАЛАНСА DEEPSEEK ===
async function getDeepSeekBalance() {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return { error: 'API ключ не найден' };
    
    try {
        const response = await fetch('https://api.deepseek.com/user/balance', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        
        if (!response.ok) return { error: `Ошибка: ${response.status}` };
        
        const data = await response.json();
        const balanceCNY = parseFloat(data.balance_infos?.[0]?.total_balance || 0);
        const usdRate = 0.14;
        const rubRate = 12.5;
        
        return {
            cny: balanceCNY,
            usd: Math.round(balanceCNY * usdRate * 100) / 100,
            rub: Math.round(balanceCNY * rubRate),
            is_low: balanceCNY < 1
        };
    } catch (error) {
        console.error('Balance error:', error.message);
        return { error: error.message };
    }
}

// === ОБРАБОТЧИК КРАТКОГО ОТВЕТА ===
app.post('/api/ask', async (req, res) => {
    let { question } = req.body;
    console.log(`[${new Date().toISOString()}] Оригинал: ${question}`);
    
    if (!question) return res.status(400).json({ error: 'Вопрос не задан, братан' });
    
    const smartResult = await smartSearch(question);
    let searchQuery = smartResult.found ? smartResult.query : question;
    
    if (smartResult.found && smartResult.query !== question) {
        console.log(`🧠 Умный поиск: "${question}" → "${searchQuery}" (${smartResult.method})`);
    }
    
    const cacheKey = `short_${question}`;
    const cached = await getCache(cacheKey);
    if (cached) {
        console.log('📦 Из кэша');
        return res.json({ answer: cached });
    }
    
    const wikiResult = await searchWikipedia(searchQuery);
    
    if (!wikiResult.found) {
        const suggestions = smartResult.suggestions || wikiResult.suggestions || [];
        if (suggestions.length > 0) {
            const suggestionsHtml = `<p>Слушай, бро. Про <strong>${question}</strong> я точняк не нашёл.</p>
                                      <p>Может, ты имел в виду:</p>
                                      <ul>${suggestions.slice(0, 5).map(s => `<li><span class="suggestion" data-name="${s}">${s}</span></li>`).join('')}</ul>
                                      <p>Ткни на вариант — и я расскажу!</p>`;
            return res.json({ answer: suggestionsHtml });
        } else {
            return res.json({ answer: `<p>Братан, я перерыл всё, но про <strong>${question}</strong> нигде нет инфы. Попробуй спросить что-то другое. 🤝</p>` });
        }
    }
    
    const wikiData = wikiResult.data;
    let fullText = wikiData.extract || '';
    fullText = replaceVagueNumbers(fullText);
    
    const answer = await askDeepSeek(question, fullText, 'short');
    await setCache(cacheKey, answer);
    console.log('💾 Сохранено в PostgreSQL');
    
    res.json({ answer, title: wikiData.title });
});

// === ОБРАБОТЧИК ПОЛНОГО ОТВЕТА ===
app.post('/api/ask/full', async (req, res) => {
    const { question, title } = req.body;
    console.log(`[${new Date().toISOString()}] Полный: ${question}`);
    
    const cacheKey = `full_${question}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json({ answer: cached });
    
    let fullArticle = null;
    try {
        const url = `https://ru.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title || question)}`;
        const response = await fetch(url);
        if (response.ok) {
            const html = await response.text();
            fullArticle = html
                .replace(/<style[^>]*>.*?<\/style>/gis, '')
                .replace(/<script[^>]*>.*?<\/script>/gis, '')
                .replace(/<ref[^>]*>.*?<\/ref>/gis, '')
                .replace(/<a[^>]*href="\/wiki\/[^:"]*"[^>]*>/g, '')
                .replace(/<\/a>/g, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .replace(/\[\d+\]/g, '')
                .substring(0, 5000);
        }
    } catch (e) { console.error('Full article error:', e.message); }
    
    if (!fullArticle) {
        const wikiResult = await searchWikipedia(question);
        fullArticle = wikiResult.found ? wikiResult.data.extract : 'Информация временно недоступна.';
    }
    
    fullArticle = replaceVagueNumbers(fullArticle);
    const answer = await askDeepSeek(question, fullArticle, 'full');
    await setCache(cacheKey, answer);
    res.json({ answer });
});

// === ОБРАБОТЧИК ДЛЯ ПРЕДЛОЖЕНИЙ ===
app.post('/api/ask/suggestion', async (req, res) => {
    const { suggestion } = req.body;
    const wikiResult = await searchWikipedia(suggestion);
    if (wikiResult.found) {
        const fullText = replaceVagueNumbers(wikiResult.data.extract || '');
        const answer = await askDeepSeek(suggestion, fullText, 'short');
        await setCache(`short_${suggestion}`, answer);
        res.json({ answer, title: wikiResult.data.title });
    } else {
        res.json({ answer: `<p>Бро, с <strong>${suggestion}</strong> тоже ничего не вышло. Попробуй что-то ещё.</p>` });
    }
});

// === API ДЛЯ БАЛАНСА ===
app.get('/api/balance', async (req, res) => {
    const balance = await getDeepSeekBalance();
    res.json(balance);
});

// === АДМИН-ПАНЕЛЬ (статистика кэша) ===
const ADMIN_SECRET = 'bropedia2025';
app.get(`/admin/cache/${ADMIN_SECRET}`, async (req, res) => {
    const stats = await getCacheStats();
    res.json(stats);
});

// === РАЗДАЧА СТАТИКИ ===
app.use(express.static('.'));

// === ЗАПУСК СЕРВЕРА ===
app.listen(PORT, () => {
    console.log(`🔥 Bro-педия с PostgreSQL и умным поиском на порту ${PORT}`);
});
