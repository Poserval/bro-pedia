const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- Твои функции (getWikipediaInfo, makeItBro) остаются без изменений ---
// (Весь код, который ты писал между ними, трогать не нужно)
// ... 
// ...

// --- Это ОБРАБОТЧИК API. Он должен быть ДО раздачи статики ---
app.post('/api/ask', async (req, res) => {
    // ... весь код обработчика ...
});

// --- А вот ЭТУ СТРОКУ мы ПЕРЕМЕСТИЛИ СЮДА, в самый низ ---
app.use(express.static('.'));

// --- Запуск сервера ---
app.listen(PORT, () => {
    console.log(`🔥 Bro-педия работает на порту ${PORT}`);
});
