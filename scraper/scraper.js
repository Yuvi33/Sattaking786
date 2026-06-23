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
    date: new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' }),
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

    // 🛡️ BULLETPROOF IST DATE EXTRACTOR
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const dayStr = parts.find(p => p.type === 'day').value;
    const today = parseInt(dayStr, 10); // Forces it to be a number like 23
    
    const monthYear = `${year}-${month}`;
    const historicalFile = path.join(HISTORICAL_DIR, `${monthYear}.json`);

    let historicalData = [];
    if (await fs.pathExists(historicalFile)) {
      historicalData = await fs.readJson(historicalFile);
    }

    // 🧹 CLEANUP: Force all historical dates to be numbers (fixes the "6" bug)
    historicalData = historicalData.map(item => {
        let d = parseInt(item.date, 10);
        if (isNaN(d) && typeof item.date === 'string' && item.date.includes('/')) {
            const p = item.date.split('/');
            d = parseInt(p[1], 10); // Get day from M/D/YYYY
        }
        if (isNaN(d)) d = 0; 
        return { ...item, date: d };
    });

    // 🛡️ PERMANENT DUPLICATE FIX: Remove ANY existing entries for today's date
    historicalData = historicalData.filter(item => item.date !== today);
    
    // Add today's fresh result
    historicalData.push({
        date: today,
        timestamp: results.timestamp,
        games: results.games
    });

    // Sort by date
    historicalData.sort((a, b) => a.date - b.date);

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
