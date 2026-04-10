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

app.get('/api/balance', async (req, res) => {
    const balance = await getDeepSeekBalance();
    res.json(balance);
});
