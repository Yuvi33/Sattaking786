const CONFIG = {
    dataFile: '../data/results.json',
    historicalDir: '../data/historical',
    refreshInterval: 300000,
    apiEndpoint: 'https://api.allorigins.win/raw?url='
};

let liveResults = [];
let historicalData = [];

const elements = {
    liveResults: document.getElementById('liveResults'),
    historicalData: document.getElementById('historicalData'),
    lastUpdated: document.getElementById('lastUpdated')
};

async function fetchLatestResults() {
    try {
        const response = await fetch(CONFIG.dataFile);
        if (response.ok) return await response.json();
        
        const githubUrl = 'https://raw.githubusercontent.com/Yuvi33/Sattaking786/main/data/results.json';
        const proxyUrl = CONFIG.apiEndpoint + encodeURIComponent(githubUrl);
        const githubResponse = await fetch(proxyUrl);
        if (!githubResponse.ok) throw new Error('Failed to fetch');
        return await githubResponse.json();
    } catch (error) {
        console.error('Fetch error:', error);
        return { games: [] };
    }
}

async function fetchHistoricalData() {
    try {
        const date = new Date();
        const monthYear = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        const localPath = `${CONFIG.historicalDir}/${monthYear}.json`;
        const response = await fetch(localPath);
        if (response.ok) return await response.json();
        
        const githubUrl = `https://raw.githubusercontent.com/Yuvi33/Sattaking786/main/data/historical/${monthYear}.json`;
        const proxyUrl = CONFIG.apiEndpoint + encodeURIComponent(githubUrl);
        const githubResponse = await fetch(proxyUrl);
        if (!githubResponse.ok) throw new Error('Failed to fetch history');
        return await githubResponse.json();
    } catch (error) {
        console.error('History fetch error:', error);
        return [];
    }
}

function renderLiveResults(results) {
    elements.liveResults.innerHTML = '';
    if (!results || !results.games || results.games.length === 0) {
        elements.liveResults.innerHTML = '<div class="loading">No live results available. Waiting for next scrape...</div>';
        return;
    }
    
    results.games.forEach(game => {
        const card = document.createElement('div');
        card.className = 'result-card';
        
        card.innerHTML = `
            <h3>${game.name}</h3>
            <div class="timing">${game.timing}</div>
            <div class="result-side-by-side">
                <div class="result-box old">
                    <span class="result-label">Yesterday</span>
                    <span class="result-number">${game.oldResult || '--'}</span>
                </div>
                <div class="result-box new">
                    <span class="result-label">Today</span>
                    <span class="result-number">${game.newResult || '--'}</span>
                </div>
            </div>
            <div style="font-size: 0.8rem; opacity: 0.8; margin-top: 15px;">
                Updated: ${new Date(game.timestamp).toLocaleTimeString()}
            </div>
        `;
        elements.liveResults.appendChild(card);
    });
}

function renderHistoricalData(historical) {
    elements.historicalData.innerHTML = '';
    if (!historical || historical.length === 0) {
        elements.historicalData.innerHTML = '<tr><td colspan="5" class="loading">No historical data available</td></tr>';
        return;
    }
    
    historical.sort((a, b) => b.date - a.date);
    
    historical.forEach(item => {
        const row = document.createElement('tr');
        const getRes = (name) => item.games?.find(g => g.name === name)?.newResult || '--';
        
        row.innerHTML = `
            <td>${item.date}</td>
            <td>${getRes('DESAWAR')}</td>
            <td>${getRes('FARIDABAD')}</td>
            <td>${getRes('GHAZIABAD')}</td>
            <td>${getRes('GALI')}</td>
        `;
        elements.historicalData.appendChild(row);
    });
}

function updateLastUpdated() {
    const now = new Date();
    elements.lastUpdated.textContent = `Last updated: ${now.toLocaleString()}`;
}

async function init() {
    try {
        const [latestResults, historical] = await Promise.all([
            fetchLatestResults(),
            fetchHistoricalData()
        ]);
        
        liveResults = latestResults;
        historicalData = historical;
        
        renderLiveResults(latestResults);
        renderHistoricalData(historical);
        updateLastUpdated();
        
        setInterval(async () => {
            const [freshResults, freshHistorical] = await Promise.all([
                fetchLatestResults(),
                fetchHistoricalData()
            ]);
            renderLiveResults(freshResults);
            renderHistoricalData(freshHistorical);
            updateLastUpdated();
        }, CONFIG.refreshInterval);
        
    } catch (error) {
        elements.liveResults.innerHTML = '<div class="loading">Failed to load data.</div>';
    }
}

document.addEventListener('DOMContentLoaded', init);
