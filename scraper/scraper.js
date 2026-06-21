const { bypassCloudflare } = require('./utils/cloudflare-bypass');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');

const TARGET_URL = 'https://satta-king-fast.com/';
const DATA_FILE = path.join(__dirname, '..', 'data', 'results.json');
const HISTORICAL_DIR = path.join(__dirname, '..', 'data', 'historical');

// Target games with their timings
const GAMES = [
  { name: 'DESAWAR', timing: '05:00 AM' },
  { name: 'FARIDABAD', timing: '06:00 PM' },
  { name: 'GHAZIABAD', timing: '09:25 PM' },
  { name: 'GALI', timing: '11:25 PM' }
];

/**
 * Extracts results for target games from HTML
 */
function extractResults(html) {
  const $ = cheerio.load(html);
  const results = {
    timestamp: new Date().toISOString(),
    date: new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' }),
    time: new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' }),
    games: []
  };

  GAMES.forEach(game => {
    // Find row containing the game name
    const gameRow = $(`tr:contains(${game.name})`).filter((index, element) => {
      const text = $(element).text();
      return text.includes(game.name + 'at') || text.includes(game.name + ' at');
    });

    if (gameRow.length > 0) {
      // Extract result number
      const resultTd = gameRow.find('td').filter((index, element) => {
        const text = $(element).text().trim();
        return /^\d+$/.test(text);
      }).first();

      if (resultTd.length > 0) {
        results.games.push({
          name: game.name,
          timing: game.timing,
          result: resultTd.text().trim(),
          timestamp: new Date().toISOString()
        });
      }
    }
  });

  return results;
}

/**
 * Saves results to JSON files
 */
async function saveResults(results) {
  try {
    // Ensure directories exist
    await fs.ensureDir(path.dirname(DATA_FILE));
    await fs.ensureDir(HISTORICAL_DIR);

    // Save latest results
    await fs.writeJson(DATA_FILE, results, { spaces: 2 });

    // Update historical data (by month)
    const date = new Date();
    const monthYear = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    const historicalFile = path.join(HISTORICAL_DIR, `${monthYear}.json`);

    let historicalData = [];
    if (await fs.pathExists(historicalFile)) {
      historicalData = await fs.readJson(historicalFile);
    }

    // Add or update today's result
    const today = date.getDate();
    const existingIndex = historicalData.findIndex(item => item.date === today);
    if (existingIndex >= 0) {
      historicalData[existingIndex] = { date: today, ...results };
    } else {
      historicalData.push({ date: today, ...results });
    }

    // Sort by date
    historicalData.sort((a, b) => a.date - b.date);

    await fs.writeJson(historicalFile, historicalData, { spaces: 2 });
    console.log('✅ Results saved successfully');
  } catch (error) {
    console.error('❌ Error saving results:', error);
  }
}

/**
 * Main scraper function
 */
async function runScraper() {
  console.log('🚀 Starting Satta King scraper...');
  
  try {
    console.log('⏳ Bypassing Cloudflare protection...');
    const html = await bypassCloudflare(TARGET_URL);
    
    console.log('📊 Extracting results...');
    const results = extractResults(html);
    
    await saveResults(results);
    
    console.log('✅ Scraping completed successfully!');
    console.log(`📈 Total games extracted: ${results.games.length}`);
    
    return results;
  } catch (error) {
    console.error('❌ Scraping failed:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  runScraper()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runScraper, extractResults, saveResults };
