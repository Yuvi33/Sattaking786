const { bypassCloudflare } = require('./utils/cloudflare-bypass');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');

const TARGET_URL = 'https://satta-king-fast.com/';
const DATA_FILE = path.join(__dirname, '..', 'data', 'results.json');
const HISTORICAL_DIR = path.join(__dirname, '..', 'data', 'historical');

const GAMES = [
  { name: 'DESAWAR', timing: '05:00 AM' },
  { name: 'FARIDABAD', timing: '06:00 PM' },
  { name: 'GHAZIABAD', timing: '09:25 PM' },
  { name: 'GALI', timing: '11:25 PM' }
];

function extractResults(html) {
  const $ = cheerio.load(html);
  const results = {
    timestamp: new Date().toISOString(),
    date: new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' }),
    time: new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' }),
    games: []
  };

  const pageTitle = $('title').text();
  console.log(`📄 Page Title extracted: "${pageTitle}"`);

  if (pageTitle.includes("Just a moment") || pageTitle.includes("Attention Required")) {
    console.error("❌ ERROR: Cloudflare block still active. Cannot extract results.");
    return results;
  }

  // Search all table rows and divs that might contain the game
  $('tr, div').each((index, element) => {
    const rowText = $(element).text().toUpperCase();
    
    GAMES.forEach(game => {
      if (rowText.includes(game.name)) {
        const alreadyAdded = results.games.find(g => g.name === game.name);
        if (!alreadyAdded) {
          let resultFound = '--';
          
          // Look for a 2-digit number in the children
          $(element).find('td, span, div, a').each((i, child) => {
            const childText = $(child).text().trim();
            // Match exactly 2 digits (like 56, 13, 89)
            if (/^\d{2}$/.test(childText)) {
              resultFound = childText;
              return false; // break loop
            }
          });

          // If still not found, try the whole row text
          if (resultFound === '--') {
            const match = rowText.match(/\b(\d{2})\b/);
            if (match && match[1]) {
              resultFound = match[1];
            }
          }

          if (resultFound !== '--') {
            console.log(`✅ Found ${game.name}: ${resultFound}`);
            results.games.push({
              name: game.name,
              timing: game.timing,
              result: resultFound,
              timestamp: new Date().toISOString()
            });
          }
        }
      }
    });
  });

  if (results.games.length === 0) {
    console.log("⚠️ No games found. The website HTML structure might have changed.");
  }

  return results;
}

async function saveResults(results) {
  try {
    await fs.ensureDir(path.dirname(DATA_FILE));
    await fs.ensureDir(HISTORICAL_DIR);

    await fs.writeJson(DATA_FILE, results, { spaces: 2 });

    const date = new Date();
    const monthYear = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    const historicalFile = path.join(HISTORICAL_DIR, `${monthYear}.json`);

    let historicalData = [];
    if (await fs.pathExists(historicalFile)) {
      historicalData = await fs.readJson(historicalFile);
    }

    const today = date.getDate();
    const existingIndex = historicalData.findIndex(item => item.date === today);
    if (existingIndex >= 0) {
      historicalData[existingIndex] = { date: today, ...results };
    } else {
      historicalData.push({ date: today, ...results });
    }

    historicalData.sort((a, b) => a.date - b.date);
    await fs.writeJson(historicalFile, historicalData, { spaces: 2 });
    console.log('✅ Results saved successfully');
  } catch (error) {
    console.error('❌ Error saving results:', error);
  }
}

async function runScraper() {
  console.log('🚀 Starting Satta King scraper...');
  
  try {
    const html = await bypassCloudflare(TARGET_URL);
    const results = extractResults(html);
    
    await saveResults(results);
    
    console.log(`✅ Scraping completed! Extracted ${results.games.length} games.`);
    return results;
  } catch (error) {
    console.error('❌ Scraping failed:', error);
    throw error;
  }
}

if (require.main === module) {
  runScraper()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runScraper, extractResults, saveResults };
