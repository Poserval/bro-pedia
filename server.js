const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// === ПОДКЛЮЧЕНИЕ К POSTGRESQL ===
// Render сам даёт переменную окружения DATABASE_URL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Создаём таблицу для кэша (если нет)
async function initDB() {
    const query = `
        CREATE TABLE IF NOT EXISTS cache (
            key TEXT PRIMARY KEY,
            answer TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    await pool.query(query);
    console.log('✅ Таблица cache готова');
}
initDB();

// === ФУНКЦИИ РАБОТЫ С КЭШЕМ ===
async function getCache(key) {
    const res = await pool.query('SELECT answer FROM cache WHERE key = $1', [key]);
    return res.rows[0]?.answer || null;
}

async function setCache(key, answer) {
    const query = `
        INSERT INTO cache (key, answer, created_at) 
        VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET answer = $2, created_at = NOW()
    `;
    await pool.query(query, [key, answer]);
}

async function getCacheStats() {
    const res = await pool.query(`
        SELECT 
            COUNT(*) as total_answers,
            SUM(LENGTH(answer)) as total_bytes
        FROM cache
    `);
    const totalBytes = parseInt(res.rows[0]?.total_bytes || 0);
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
    return {
        total_answers: parseInt(res.rows[0]?.total_answers || 0),
        total_mb: totalMB
    };
}

// === ОСТАЛЬНЫЕ ФУНКЦИИ (searchWikipedia, askDeepSeek, replaceVagueNumbers и т.д.) ===
// Они остаются без изменений, я их не трогаю
// ... (вставь сюда все функции из предыдущей версии)

// === ОБРАБОТЧИК КРАТКОГО ОТВЕТА ===
app.post('/api/ask', async (req, res) => {
    const { question } = req.body;
    if (!question) {
        return res.status(400).json({ error: 'Вопрос не задан, братан' });
    }
    
    const cacheKey = `short_${question}`;
    
    // Проверяем кэш в БД
    const cached = await getCache(cacheKey);
    if (cached) {
        console.log('📦 Из кэша (PostgreSQL)');
        return res.json({ answer: cached });
    }
    
    // Ищем в Википедии
    const wikiResult = await searchWikipedia(question);
    
    if (!wikiResult.found) {
        // ... обработка не найденного
        return res.json({ answer: notFoundHtml });
    }
    
    const answer = await askDeepSeek(question, wikiResult.data.extract, 'short');
    
    // Сохраняем в БД
    await setCache(cacheKey, answer);
    console.log('💾 Сохранено в PostgreSQL');
    
    res.json({ answer, title: wikiResult.data.title });
});

// === ОБРАБОТЧИК ПОЛНОГО ОТВЕТА ===
app.post('/api/ask/full', async (req, res) => {
    const { question } = req.body;
    const cacheKey = `full_${question}`;
    
    const cached = await getCache(cacheKey);
    if (cached) {
        return res.json({ answer: cached });
    }
    
    // ... получение полной статьи
    const answer = await askDeepSeek(question, fullArticle, 'full');
    await setCache(cacheKey, answer);
    
    res.json({ answer });
});

// === АДМИН-ПАНЕЛЬ (со статистикой кэша) ===
const ADMIN_SECRET = 'bropedia2025'; // Замени на свой пароль

app.get(`/admin/cache/${ADMIN_SECRET}`, async (req, res) => {
    const stats = await getCacheStats();
    res.json(stats);
});

// === РАЗДАЧА СТАТИКИ ===
app.use(express.static('.'));

app.listen(PORT, () => {
    console.log(`🔥 Bro-педия с PostgreSQL на порту ${PORT}`);
});
