// Configuration
const CONFIG = {
    dataFile: '../data/results.json',
    historicalDir: '../data/historical',
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
 * Fetches latest results from GitHub repository
 */
async function fetchLatestResults() {
    try {
        // Try to fetch from local file first (for local development)
        const response = await fetch(CONFIG.dataFile);
        if (response.ok) {
            return await response.json();
        }
        
        // If local file fails, fetch from GitHub raw URL
        const githubUrl = 'https://raw.githubusercontent.com/Yuvi33/sattaking786/main/data/results.json';
        const proxyUrl = CONFIG.apiEndpoint + encodeURIComponent(githubUrl);
        
        const githubResponse = await fetch(proxyUrl);
        if (!githubResponse.ok) {
            throw new Error('Failed to fetch data');
        }
        
        return await githubResponse.json();
    } catch (error) {
        console.error('Error fetching latest results:', error);
        
        // Return mock data for demonstration
        return {
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' }),
            time: new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' }),
            games: [
                { name: 'DESAWAR', timing: '05:00 AM', result: '--' },
                { name: 'FARIDABAD', timing: '06:00 PM', result: '--' },
                { name: 'GHAZIABAD', timing: '09:25 PM', result: '--' },
                { name: 'GALI', timing: '11:25 PM', result: '--' }
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
        
        // Try to fetch from local file first
        const localPath = `${CONFIG.historicalDir}/${monthYear}.json`;
        const response = await fetch(localPath);
        if (response.ok) {
            return await response.json();
        }
        
        // If local file fails, fetch from GitHub
        const githubUrl = `https://raw.githubusercontent.com/yourusername/satta-king-results/main/data/historical/${monthYear}.json`;
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
        elements.liveResults.innerHTML = '<div class="loading">No live results available</div>';
        return;
    }
    
    results.games.forEach(game => {
        const card = document.createElement('div');
        card.className = 'result-card';
        
        card.innerHTML = `
            <h3>${game.name}</h3>
            <div class="timing">${game.timing}</div>
            <div class="result-number">${game.result}</div>
            <div style="font-size: 0.8rem; opacity: 0.8;">
                Last updated: ${new Date(game.timestamp).toLocaleTimeString()}
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
        row.innerHTML = `
            <td>${item.date}</td>
            <td>${item.games.find(g => g.name === 'DESAWAR')?.result || '--'}</td>
            <td>${item.games.find(g => g.name === 'FARIDABAD')?.result || '--'}</td>
            <td>${item.games.find(g => g.name === 'GHAZIABAD')?.result || '--'}</td>
            <td>${item.games.find(g => g.name === 'GALI')?.result || '--'}</td>
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
