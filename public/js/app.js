// Configuration
const CONFIG = {
    dataFile: './data/results.json', // Now looks inside public/data/
    historicalDir: './data/historical',
    refreshInterval: 300000, // 5 minutes
    apiEndpoint: 'https://api.allorigins.win/raw?url=' // CORS proxy
};

// State management
let liveResults = [];
let historicalData = [];

// DOM elements
const elements = {
    liveResults: document.getElementById('liveResults'),
    historicalData: document.getElementById('historicalData'),
    lastUpdated: document.getElementById('lastUpdated')
};

/**
 * Fetches latest results
 */
async function fetchLatestResults() {
    try {
        // Try to fetch from local/live file first
        const response = await fetch(CONFIG.dataFile);
        if (response.ok) {
            return await response.json();
        }
        
        // If local file fails, fetch from GitHub raw URL
        const githubUrl = 'https://raw.githubusercontent.com/Yuvi33/Sattaking786/main/public/data/results.json';
        const proxyUrl = CONFIG.apiEndpoint + encodeURIComponent(githubUrl);
        
        const githubResponse = await fetch(proxyUrl);
        if (!githubResponse.ok) {
            throw new Error('Failed to fetch data');
        }
        
        return await githubResponse.json();
    } catch (error) {
        console.error('Error fetching latest results:', error);
        
        // Return mock data if fetch fails
        return {
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' }),
            time: new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' }),
            games: [
                { name: 'DESAWAR', timing: '05:00 AM', newResult: '--', oldResult: '--' },
                { name: 'FARIDABAD', timing: '06:00 PM', newResult: '--', oldResult: '--' },
                { name: 'GHAZIABAD', timing: '09:25 PM', newResult: '--', oldResult: '--' },
                { name: 'GALI', timing: '11:25 PM', newResult: '--', oldResult: '--' }
            ]
        };
    }
}

/**
 * Fetches historical data for the current month
 */
async function fetchHistoricalData() {
    try {
        const date = new Date();
        const monthYear = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        
        // Try local/live file first
        const localPath = `${CONFIG.historicalDir}/${monthYear}.json`;
        const response = await fetch(localPath);
        if (response.ok) {
            return await response.json();
        }
        
        // Fallback to GitHub
        const githubUrl = `https://raw.githubusercontent.com/Yuvi33/Sattaking786/main/public/data/historical/${monthYear}.json`;
        const proxyUrl = CONFIG.apiEndpoint + encodeURIComponent(githubUrl);
        
        const githubResponse = await fetch(proxyUrl);
        if (!githubResponse.ok) {
            throw new Error('Failed to fetch historical data');
        }
        
        return await githubResponse.json();
    } catch (error) {
        console.error('Error fetching historical data:', error);
        return [];
    }
}

/**
 * Renders live results to the DOM
 */
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

/**
 * Renders historical data to the table
 */
function renderHistoricalData(historical) {
    elements.historicalData.innerHTML = '';
    
    if (!historical || historical.length === 0) {
        elements.historicalData.innerHTML = '<tr><td colspan="5" class="loading">No historical data available</td></tr>';
        return;
    }
    
    // Sort by date descending (most recent first)
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

/**
 * Updates the last updated timestamp
 */
function updateLastUpdated() {
    const now = new Date();
    elements.lastUpdated.textContent = `Last updated: ${now.toLocaleString()}`;
}

/**
 * Initializes the application
 */
async function init() {
    console.log('🚀 Initializing Satta King Results app...');
    
    try {
        // Fetch initial data
        const [latestResults, historical] = await Promise.all([
            fetchLatestResults(),
            fetchHistoricalData()
        ]);
        
        liveResults = latestResults;
        historicalData = historical;
        
        // Render data
        renderLiveResults(latestResults);
        renderHistoricalData(historical);
        updateLastUpdated();
        
        console.log('✅ App initialized successfully');
        
        // Set up auto-refresh
        setInterval(async () => {
            console.log('🔄 Refreshing data...');
            const [freshResults, freshHistorical] = await Promise.all([
                fetchLatestResults(),
                fetchHistoricalData()
            ]);
            
            liveResults = freshResults;
            historicalData = freshHistorical;
            
            renderLiveResults(freshResults);
            renderHistoricalData(freshHistorical);
            updateLastUpdated();
        }, CONFIG.refreshInterval);
        
    } catch (error) {
        console.error('❌ Initialization failed:', error);
        elements.liveResults.innerHTML = '<div class="loading">Failed to load data. Please try again later.</div>';
    }
}

// Start the application when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
