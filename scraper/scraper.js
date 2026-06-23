const { bypassCloudflare } = require('./utils/cloudflare-bypass');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');

const TARGET_URL = 'https://satta-king-fast.com/';

const DATA_FILE = path.join(__dirname, '..', 'public', 'data', 'results.json');
const HISTORICAL_DIR = path.join(__dirname, '..', 'public', 'data', 'historical');

const GAMES = [
  { name: 'DESAWAR',    timing: '05:00 AM' },
  { name: 'FARIDABAD',  timing: '06:00 PM' },
  { name: 'GHAZIABAD',  timing: '09:25 PM' },
  { name: 'GALI',       timing: '11:25 PM' }
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

  if (pageTitle.includes('Just a moment') || pageTitle.includes('Attention Required')) {
    console.error('❌ ERROR: Cloudflare block still active.');
    return results;
  }

  const pageText = $('body').text().replace(/\s+/g, ' ').toUpperCase();

  GAMES.forEach(game => {
    const alreadyAdded = results.games.find(g => g.name === game.name);
    if (alreadyAdded) return;

    const escapedTiming = game.timing.replace(':', '\\:').replace(/\s+/g, '\\s*');
    const regex = new RegExp(
      `${game.name}\\s*AT\\s*${escapedTiming}.*?\\b(\\d{2}|XX)\\b.*?\\b(\\d{2}|XX)\\b`,
      'i'
    );
    const match = pageText.match(regex);

    if (match) {
      const oldResult = match[1];
      const newResult = match[2];

      console.log(`✅ Found Official ${game.name} (${game.timing}): Old=${oldResult}, New=${newResult}`);
      results.games.push({
        name:      game.name,
        timing:    game.timing,
        result:    newResult,
        oldResult: oldResult,
        newResult: newResult,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log(`⚠️  Could not find exact match for ${game.name} at ${game.timing}`);
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
    const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000)); // UTC + 5:30

    const today = istTime.getUTCDate();                                  // e.g. 23
    const month = String(istTime.getUTCMonth() + 1).padStart(2, '0');   // e.g. "06"
    const year  = istTime.getUTCFullYear();                              // e.g. 2026

    const monthYear     = `${year}-${month}`;
    const historicalFile = path.join(HISTORICAL_DIR, `${monthYear}.json`);

    let historicalData = [];
    if (await fs.pathExists(historicalFile)) {
      historicalData = await fs.readJson(historicalFile);
    }

    // 🧹 CLEANUP: Normalize ALL date fields using the ISO timestamp.
    //    Old records may have been saved with ambiguous string dates like
    //    "23/6/2026" (D/M/YYYY — Indian format) or "6/23/2026" (M/D/YYYY).
    //    Parsing parts[1] from either format gives the wrong answer for one of them.
    //    The ISO timestamp ("2026-06-23T...Z") is always unambiguous, so we
    //    derive the day from it using the same IST offset math used for `today`.
    historicalData = historicalData.map(item => {
      let dayNum;

      if (item.timestamp) {
        // Source of truth: ISO 8601 timestamp → convert to IST → extract day
        const tsDate  = new Date(item.timestamp);
        const istDate = new Date(tsDate.getTime() + (5.5 * 60 * 60 * 1000));
        dayNum = istDate.getUTCDate();
      } else {
        // Fallback for records that somehow have no timestamp (already a number)
        dayNum = parseInt(item.date, 10);
      }

      if (isNaN(dayNum)) dayNum = 0;

      return {
        date:      dayNum,
        timestamp: item.timestamp,
        games:     item.games
      };
    });

    // 🛡️ DUPLICATE FIX: Remove ANY existing entries for today before re-adding
    historicalData = historicalData.filter(item => Number(item.date) !== Number(today));

    // Add today's fresh result
    historicalData.push({
      date:      Number(today),
      timestamp: results.timestamp,
      games:     results.games
    });

    // Keep entries sorted by day
    historicalData.sort((a, b) => Number(a.date) - Number(b.date));

    await fs.writeJson(historicalFile, historicalData, { spaces: 2 });
    console.log(`✅ Results saved for ${monthYear}-${today}. (Duplicates removed & data cleaned)`);
  } catch (error) {
    console.error('❌ Error saving results:', error);
  }
}

async function runScraper() {
  console.log('🚀 Starting Satta King scraper...');
  try {
    const html    = await bypassCloudflare(TARGET_URL);
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
