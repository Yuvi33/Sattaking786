const { bypassCloudflare } = require('./utils/cloudflare-bypass');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');

const TARGET_URL = 'https://satta-king-fast.com/';

const DATA_FILE = path.join(__dirname, '..', 'public', 'data', 'results.json');
const HISTORICAL_DIR = path.join(__dirname, '..', 'public', 'data', 'historical');

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
    time: new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' }),
    games: []
  };

  const pageTitle = $('title').text();
  console.log(`📄 Page Title extracted: "${pageTitle}"`);

  if (pageTitle.includes("Just a moment") || pageTitle.includes("Attention Required")) {
    console.error("❌ ERROR: Cloudflare block still active.");
    return results;
  }

  const pageText = $('body').text().replace(/\s+/g, ' ').toUpperCase();

  GAMES.forEach(game => {
    const alreadyAdded = results.games.find(g => g.name === game.name);
    if (alreadyAdded) return;

    const escapedTiming = game.timing.replace(':', '\\:').replace(/\s+/g, '\\s*');
    const regex = new RegExp(`${game.name}\\s*AT\\s*${escapedTiming}.*?\\b(\\d{2}|XX)\\b.*?\\b(\\d{2}|XX)\\b`, 'i');
    const match = pageText.match(regex);

    if (match) {
      const oldResult = match[1];
      const newResult = match[2];
      
      console.log(`✅ Found Official ${game.name} (${game.timing}): Old=${oldResult}, New=${newResult}`);
      results.games.push({
        name: game.name,
        timing: game.timing,
        result: newResult, 
        oldResult: oldResult,
        newResult: newResult,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log(`⚠️ Could not find exact match for ${game.name} at ${game.timing}`);
    }
  });

  return results;
}

async function saveResults(results) {
  try {
    await fs.ensureDir(path.dirname(DATA_FILE));
    await fs.ensureDir(HISTORICAL_DIR);
    await fs.writeJson(DATA_FILE, results, { spaces: 2 });

    // 🛡️ BULLETPROOF IST DATE MATH (No strings, no parsing errors)
    const now = new Date();
    const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000)); // Add 5 hours 30 mins to UTC
    
    const today = istTime.getUTCDate(); // e.g., 23
    const month = String(istTime.getUTCMonth() + 1).padStart(2, '0'); // e.g., "06"
    const year = istTime.getUTCFullYear(); // e.g., 2026
    
    const monthYear = `${year}-${month}`;
    const historicalFile = path.join(HISTORICAL_DIR, `${monthYear}.json`);

    let historicalData = [];
    if (await fs.pathExists(historicalFile)) {
      historicalData = await fs.readJson(historicalFile);
    }

    // 🧹 CLEANUP: Fix any string dates (like "6/23/2026") to be exact day numbers
    historicalData = historicalData.map(item => {
        let dayNum = item.date;
        if (typeof item.date === 'string') {
            if (item.date.includes('/')) {
                const parts = item.date.split('/');
                dayNum = parseInt(parts[1], 10); // M/D/YYYY -> parts[1] is the Day
            } else {
                dayNum = parseInt(item.date, 10);
            }
        }
        dayNum = parseInt(dayNum, 10);
        if (isNaN(dayNum)) dayNum = 0;
        return {
            date: dayNum,
            timestamp: item.timestamp,
            games: item.games
        };
    });

    // 🛡️ PERMANENT DUPLICATE FIX: Remove ANY existing entries for today's date
    historicalData = historicalData.filter(item => Number(item.date) !== Number(today));
    
    // Add today's fresh result explicitly
    historicalData.push({
        date: Number(today),
        timestamp: results.timestamp,
        games: results.games
    });

    // Sort by date
    historicalData.sort((a, b) => Number(a.date) - Number(b.date));

    await fs.writeJson(historicalFile, historicalData, { spaces: 2 });
    console.log(`✅ Results saved successfully for ${monthYear}-${today}. (Duplicates removed & data cleaned)`);
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
  runScraper().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { runScraper, extractResults, saveResults };
