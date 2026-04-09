const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Кэш для кратких и полных ответов
const cache = new Map();

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
    for (const rule of rules) {
        result = result.replace(rule.from, rule.to);
    }
    return result;
}

// === ОСНОВНОЙ ИСТОЧНИК (обычная Википедия) ===
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
        console.error('Primary source error:', e.message);
        return { found: false, suggestions: [], error: true };
    }
}

// === РЕЗЕРВНЫЙ ИСТОЧНИК (Wikimedia Enterprise API) ===
async function searchEnterpriseAPI(query) {
    const enterpriseKey = process.env.WIKI_ENTERPRISE_KEY;
    if (!enterpriseKey) {
        console.log('Enterprise API key not set');
        return null;
    }
    
    try {
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
                data: {
                    title: data.title || query,
                    extract: data.extract,
                    fullText: data.html || data.extract
                },
                source: 'enterprise'
            };
        }
        return null;
    } catch (error) {
        console.error('Enterprise API fetch error:', error.message);
        return null;
    }
}

// === УМНЫЙ ПОИСК С ЦЕПОЧКОЙ ИСТОЧНИКОВ ===
async function getArticleInfo(question) {
    // 1. Пробуем основной источник
    const wikiResult = await searchWikipedia(question);
    if (wikiResult.found) return wikiResult;
    if (wikiResult.error) {
        console.log('Primary source failed, trying backup...');
    }
    
    // 2. Пробуем резервный источник (Enterprise API)
    const enterpriseResult = await searchEnterpriseAPI(question);
    if (enterpriseResult && enterpriseResult.found) {
        return { found: true, data: enterpriseResult.data, source: 'enterprise' };
    }
    
    // 3. Если есть предложения от основного источника — возвращаем их
    if (wikiResult.suggestions && wikiResult.suggestions.length > 0) {
        return { found: false, suggestions: wikiResult.suggestions };
    }
    
    // 4. Совсем ничего не нашли
    return { found: false, suggestions: [] };
}

// === ПОЛУЧЕНИЕ ПОЛНОЙ СТАТЬИ ===
async function getFullArticle(title) {
    // Сначала пробуем Enterprise API
    const enterpriseResult = await searchEnterpriseAPI(title);
    if (enterpriseResult && enterpriseResult.found && enterpriseResult.data.fullText) {
        let cleanText = enterpriseResult.data.fullText
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/\[\d+\]/g, '')
            .trim();
        return cleanText.length > 5000 ? cleanText.substring(0, 5000) + '...' : cleanText;
    }
    
    // Если не получилось — пробуем обычную Википедию
    try {
        const url = `https://ru.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title)}`;
        const response = await fetch(url);
        if (!response.ok) return null;
        
        const html = await response.text();
        let cleanText = html
            .replace(/<style[^>]*>.*?<\/style>/gis, '')
            .replace(/<script[^>]*>.*?<\/script>/gis, '')
            .replace(/<ref[^>]*>.*?<\/ref>/gis, '')
            .replace(/<a[^>]*href="\/wiki\/[^:"]*"[^>]*>/g, '')
            .replace(/<\/a>/g, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/\[\d+\]/g, '')
            .replace(/Примечания|Ссылки|Литература|Источники[^.]*\./gi, '')
            .trim();
        
        return cleanText.length > 5000 ? cleanText.substring(0, 5000) + '...' : cleanText;
    } catch (e) {
        console.error('Full article error:', e.message);
        return null;
    }
}

// === ЗАПРОС К DEEPSEEK (без упоминаний источников) ===
async function askDeepSeek(question, context, mode = 'short') {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        return fallbackResponse(question, context, mode);
    }
    
    const systemPromptShort = `Ты — дружелюбный тинейджер-пересказчик для сайта "Bro-педия". 
Твоя задача: пересказать информацию максимально коротко, 3-5 предложений, в пацанском стиле.
Правила:
- Никаких оскорблений и мата. Сленг можно: кекс, краш, хайп, имба, крипово, рофл.
- НИКОГДА не упоминай никакие источники информации. Не говори "согласно данным", "как сказано в источниках", "по информации из сети". Просто пересказывай как есть.
- Если пользователь спросит откуда ты знаешь — отвечай "Я просто шарою, бро, по жизни".
- Важные имена оберни в HTML: <span class="mention" data-name="Имя">Имя</span>
- Если есть точные цифры — оставляй их. Если расплывчатое "много" или "мало" — заменяй на "чуть меньше чем до хрена" и т.д.
- Обращайся к пользователю как "братан", "кекс", "бро".
- Будь живым и дружелюбным, используй эмодзи 🔥🤝😎`;

    const systemPromptFull = `Ты — дружелюбный тинейджер-пересказчик для сайта "Bro-педия". 
Твоя задача: пересказать информацию ПОЛНОСТЬЮ, но в пацанском стиле. 10-15 предложений.
Правила:
- Никаких оскорблений и мата. Сленг можно: кекс, краш, хайп, имба.
- НИКОГДА не упоминай никакие источники информации. Не говори "согласно данным", "как сказано в источниках", "по информации из сети". Просто пересказывай как есть.
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
    
    const articleInfo = await getArticleInfo(question);
    
    if (!articleInfo.found) {
        if (articleInfo.suggestions && articleInfo.suggestions.length > 0) {
            const suggestionsHtml = `<p>Слушай, бро. Про <strong>${question}</strong> я точняк не нашёл.</p>
                                      <p>Может, ты имел в виду:</p>
                                      <ul>${articleInfo.suggestions.map(s => `<li><span class="suggestion" data-name="${s}">${s}</span></li>`).join('')}</ul>
                                      <p>Ткни на вариант — и я расскажу!</p>`;
            return res.json({ answer: suggestionsHtml });
        } else {
            const notFoundHtml = `<p>Братан, я перерыл всё, но про <strong>${question}</strong> нигде нет инфы.</p>
                                  <p>Попробуй спросить что-то другое или перефразируй. Ты всё равно краш! 🤝</p>`;
            return res.json({ answer: notFoundHtml });
        }
    }
    
    const wikiData = articleInfo.data;
    let fullText = wikiData.extract || '';
    fullText = replaceVagueNumbers(fullText);
    
    const answer = await askDeepSeek(question, fullText, 'short');
    cache.set(cacheKey, answer);
    res.json({ answer, title: wikiData.title });
});

// === ОБРАБОТЧИК ПОЛНОГО ОТВЕТА ===
app.post('/api/ask/full', async (req, res) => {
    const { question, title } = req.body;
    console.log(`[${new Date().toISOString()}] Полный: ${question}`);
    
    const cacheKey = `full_${question}`;
    if (cache.has(cacheKey)) {
        console.log('Из кэша (полный)');
        return res.json({ answer: cache.get(cacheKey) });
    }
    
    let fullArticle = await getFullArticle(title);
    if (!fullArticle) {
        const articleInfo = await getArticleInfo(question);
        fullArticle = articleInfo.found ? articleInfo.data.extract : 'Информация временно недоступна, братан. Попробуй позже.';
    }
    
    fullArticle = replaceVagueNumbers(fullArticle);
    const answer = await askDeepSeek(question, fullArticle, 'full');
    cache.set(cacheKey, answer);
    res.json({ answer });
});

// === ОБРАБОТЧИК ДЛЯ ПРЕДЛОЖЕНИЙ ===
app.post('/api/ask/suggestion', async (req, res) => {
    const { suggestion } = req.body;
    const articleInfo = await getArticleInfo(suggestion);
    
    if (articleInfo.found) {
        const answer = await askDeepSeek(suggestion, articleInfo.data.extract, 'short');
        res.json({ answer, title: articleInfo.data.title });
    } else {
        res.json({ answer: `<p>Бро, с <strong>${suggestion}</strong> тоже ничего не вышло. Попробуй что-то ещё.</p>` });
    }
});

// === РАЗДАЧА СТАТИКИ ===
app.use(express.static('.'));

// === КОНТРОЛЬ БАЛАНСА DEEPSEEK ===
async function getDeepSeekBalance() {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return { error: 'API ключ не найден' };
    
    try {
        const response = await fetch('https://api.deepseek.com/user/balance', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        
        if (!response.ok) {
            return { error: `Ошибка: ${response.status}` };
        }
        
        const data = await response.json();
        
        // Баланс в CNY
        const balanceCNY = parseFloat(data.balance_infos?.[0]?.total_balance || 0);
        const grantedCNY = parseFloat(data.balance_infos?.[0]?.granted_balance || 0);
        const toppedUpCNY = parseFloat(data.balance_infos?.[0]?.topped_up_balance || 0);
        
        // Конвертируем в USD и рубли (примерно)
        const usdRate = 0.14; // 1 CNY ≈ 0.14 USD
        const rubRate = 12.5;  // 1 CNY ≈ 12.5 RUB
        
        return {
            success: true,
            cny: balanceCNY,
            usd: Math.round(balanceCNY * usdRate * 100) / 100,
            rub: Math.round(balanceCNY * rubRate),
            granted_cny: grantedCNY,
            topped_up_cny: toppedUpCNY,
            is_low: balanceCNY < 15 // меньше 15 юаней (~$2) — пора пополнять
        };
    } catch (error) {
        console.error('Balance check error:', error.message);
        return { error: error.message };
    }
}

// === АДМИН-СТРАНИЦА ДЛЯ ПРОВЕРКИ БАЛАНСА ===
// Секретный адрес: /admin/balance_XXX (XXX заменишь на свой код)
// Чтобы никто случайно не зашёл
const ADMIN_SECRET = '46852'; // Секретный код

app.get(`/admin/balance/${ADMIN_SECRET}`, async (req, res) => {
    const balance = await getDeepSeekBalance();
    
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Bro-педия | Админ-панель</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
            background: #0d1117;
            color: #c9d1d9;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .container {
            max-width: 600px;
            width: 100%;
            background: #161b22;
            border-radius: 16px;
            padding: 30px;
            border: 1px solid #30363d;
        }
        h1 {
            font-size: 28px;
            margin-bottom: 20px;
            color: #1a73e8;
            font-family: 'Press Start 2P', monospace;
            text-align: center;
        }
        .balance-card {
            background: #0d1117;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
            border: 1px solid #30363d;
        }
        .balance-amount {
            font-size: 48px;
            font-weight: bold;
            color: #58a6ff;
        }
        .balance-currency {
            font-size: 20px;
            color: #8b949e;
        }
        .row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #21262d;
        }
        .label { color: #8b949e; }
        .value { font-weight: bold; }
        .warning {
            background: #3b2e1e;
            border: 1px solid #f0883e;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
            text-align: center;
        }
        .success {
            background: #1a3a2a;
            border: 1px solid #3fb950;
        }
        button {
            background: #1a73e8;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 24px;
            font-size: 16px;
            cursor: pointer;
            width: 100%;
            margin-top: 20px;
        }
        button:hover { background: #1557b0; }
        .footer {
            text-align: center;
            margin-top: 20px;
            font-size: 12px;
            color: #8b949e;
        }
        .refresh-time {
            text-align: center;
            font-size: 12px;
            color: #8b949e;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 Bro-педия<br><span style="font-size: 14px;">Админ-панель</span></h1>
        
        ${balance.error ? `
            <div class="warning">
                ❌ Ошибка: ${balance.error}
            </div>
        ` : `
            <div class="balance-card">
                <div class="balance-amount">${balance.cny.toFixed(2)} <span class="balance-currency">CNY</span></div>
                <div style="margin-top: 5px;">≈ $${balance.usd} / ${balance.rub} ₽</div>
            </div>
            
            <div class="row">
                <span class="label">💰 Выданный баланс</span>
                <span class="value">${balance.granted_cny.toFixed(2)} CNY</span>
            </div>
            <div class="row">
                <span class="label">💳 Пополненный баланс</span>
                <span class="value">${balance.topped_up_cny.toFixed(2)} CNY</span>
            </div>
            <div class="row">
                <span class="label">📅 Последняя проверка</span>
                <span class="value">${new Date().toLocaleString('ru-RU')}</span>
            </div>
            
            ${balance.is_low ? `
                <div class="warning">
                    ⚠️ ВНИМАНИЕ! Баланс ниже 1 CNY (~$0.15).<br>
                    <strong>Пора пополнить счёт в DeepSeek!</strong>
                </div>
            ` : `
                <div class="warning success">
                    ✅ Баланс в норме. Меньше 1 CNY — тогда пополняй.
                </div>
            `}
        `}
        
        <button onclick="location.reload()">🔄 Обновить баланс</button>
        <div class="refresh-time">Секретный адрес — храни в тайне</div>
        <div class="footer">
            <a href="https://platform.deepseek.com/top_up" target="_blank" style="color: #58a6ff;">➡️ Пополнить DeepSeek</a>
        </div>
    </div>
</body>
</html>
    `;
    
    res.send(html);
});

// === (ОПЦИОНАЛЬНО) API-ЭНДПОИНТ ДЛЯ ПРОВЕРКИ БАЛАНСА (JSON) ===
app.get('/api/balance', async (req, res) => {
    const balance = await getDeepSeekBalance();
    res.json(balance);
});

console.log(`🔐 Админ-панель: https://bro-pedia.onrender.com/admin/balance/${ADMIN_SECRET}`);

// === ЗАПУСК ===
app.listen(PORT, () => {
    console.log(`🔥 Bro-педия 2.0 на порту ${PORT}`);
});
