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
    throw new Error('Cloudflare block detected.');
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
        name: game.name, timing: game.timing, result: newResult, 
        oldResult: oldResult, newResult: newResult, timestamp: new Date().toISOString()
      });
    }
  });

  return results;
}

async function saveResults(results) {
  // 🚨 CRITICAL DATA PROTECTION: Never save empty data!
  if (!results.games || results.games.length === 0) {
    throw new Error('No games extracted. Triggering retry to protect existing data...');
  }

  await fs.ensureDir(path.dirname(DATA_FILE));
  await fs.ensureDir(HISTORICAL_DIR);

  // 🧠 TIME-AWARE SMART RETRY LOGIC
  const now = new Date();
  const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  const istTotalMinutes = istTime.getUTCHours() * 60 + istTime.getUTCMinutes();

  const GAME_TIMES = {
    'DESAWAR': 5 * 60,         // 5:00 AM
    'FARIDABAD': 18 * 60,      // 6:00 PM
    'GHAZIABAD': 21 * 60 + 25, // 9:25 PM
    'GALI': 23 * 60 + 25       // 11:25 PM
  };

  let waitingForUpdate = false;
  for (const newGame of results.games) {
    if (newGame.newResult === 'XX') {
      const gameTime = GAME_TIMES[newGame.name];
      if (istTotalMinutes >= gameTime + 10 && istTotalMinutes <= gameTime + 120) {
        console.log(`⏳ ${newGame.name} is still XX and it's past ${newGame.timing} IST. Triggering retry...`);
        waitingForUpdate = true;
      }
    }
  }

  if (waitingForUpdate) {
    throw new Error('Expected game result is still XX. Triggering retry...');
  }

  await fs.writeJson(DATA_FILE, results, { spaces: 2 });

  const today = istTime.getUTCDate();
  const month = String(istTime.getUTCMonth() + 1).padStart(2, '0');
  const year  = istTime.getUTCFullYear();
  const monthYear = `${year}-${month}`;
  const historicalFile = path.join(HISTORICAL_DIR, `${monthYear}.json`);

  let historicalData = [];
  if (await fs.pathExists(historicalFile)) {
    historicalData = await fs.readJson(historicalFile);
  }

  historicalData = historicalData.map(item => {
    let dayNum;
    if (item.timestamp) {
      const tsDate = new Date(item.timestamp);
      const istDate = new Date(tsDate.getTime() + (5.5 * 60 * 60 * 1000));
      dayNum = istDate.getUTCDate();
    } else {
      dayNum = parseInt(item.date, 10);
    }
    if (isNaN(dayNum)) dayNum = 0;
    return { date: dayNum, timestamp: item.timestamp, games: item.games };
  });

  historicalData = historicalData.filter(item => Number(item.date) !== Number(today));
  historicalData.push({ date: Number(today), timestamp: results.timestamp, games: results.games });
  historicalData.sort((a, b) => Number(a.date) - Number(b.date));

  await fs.writeJson(historicalFile, historicalData, { spaces: 2 });
  console.log(`✅ Results saved for ${monthYear}-${today}.`);
}

async function runScraperWithRetries() {
  const maxRetries = 4;
  const waitTimeMs = 5 * 60 * 1000; // 5 minutes

  for (let i = 1; i <= maxRetries; i++) {
    console.log(`\n=========================================`);
    console.log(`🚀 Attempt ${i} of ${maxRetries}...`);
    console.log(`=========================================`);
    try {
      const html = await bypassCloudflare(TARGET_URL);
      const results = extractResults(html);
      await saveResults(results);
      console.log(`✅ Attempt ${i} successful!`);
      return; // Exit function on success
    } catch (error) {
      console.error(`❌ Attempt ${i} failed: ${error.message}`);
      if (i < maxRetries) {
        console.log(`⏳ Waiting 5 minutes before next retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTimeMs));
      } else {
        console.error('🚨 All retries exhausted. Failing workflow to prevent bad data.');
        process.exit(1); // Fail the GitHub Action
      }
    }
  }
}

if (require.main === module) {
  runScraperWithRetries();
}

module.exports = { runScraperWithRetries, extractResults, saveResults };
