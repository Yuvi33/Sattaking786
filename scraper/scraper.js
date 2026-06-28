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

const GAME_TIMES = {
  'DESAWAR': 5 * 60,         // 5:00 AM
  'FARIDABAD': 18 * 60,      // 6:00 PM
  'GHAZIABAD': 21 * 60 + 25, // 9:25 PM
  'GALI': 23 * 60 + 25       // 11:25 PM
};

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

  // Get current IST time in minutes
  const now = new Date();
  const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  const istTotalMinutes = istTime.getUTCHours() * 60 + istTime.getUTCMinutes();

  // 🧠 DYNAMIC ROW SCANNER
  $('tr').each((i, el) => {
    const cells = $(el).find('td');
    if (cells.length === 0) return;

    const firstCellText = $(cells[0]).text().toUpperCase().replace(/\s+/g, ' ').trim();
    
    GAMES.forEach(game => {
      const match1 = game.name + 'AT';
      const match2 = game.name + ' AT';
      
      if (firstCellText.startsWith(match1) || firstCellText.startsWith(match2)) {
        const foundNumbers = [];
        for (let j = 1; j < cells.length; j++) {
          const cellText = $(cells[j]).text().trim();
          if (/^\d{2}$/.test(cellText) || cellText === 'XX') {
            foundNumbers.push(cellText);
          }
        }

        let oldR = '--';
        let newR = '--';
        
        const gameTime = GAME_TIMES[game.name];
        const isGameTimePassed = istTotalMinutes >= gameTime;

        if (foundNumbers.length >= 2) {
          oldR = foundNumbers[0];
          newR = foundNumbers[1];
          
          // 🛡️ FIX: If game hasn't happened yet, don't copy yesterday's result into today!
          if (!isGameTimePassed && oldR === newR) {
            newR = 'XX';
          }
        } else if (foundNumbers.length === 1) {
          if (isGameTimePassed) {
            // Game happened, only one number visible. Assume it's today's.
            newR = foundNumbers[0];
            oldR = '--';
          } else {
            // Game hasn't happened. The number is yesterday's.
            oldR = foundNumbers[0];
            newR = 'XX';
          }
        }

        const exists = results.games.find(g => g.name === game.name);
        if (!exists) {
          console.log(`✅ Found Official ${game.name}: Old=${oldR}, New=${newR}`);
          results.games.push({
            name: game.name, timing: game.timing, result: newR, 
            oldResult: oldR, newResult: newR, timestamp: new Date().toISOString()
          });
        }
      }
    });
  });

  if (results.games.length === 0) {
    throw new Error('No games extracted. Website might be down or blocked.');
  }

  return results;
}

async function saveResults(results) {
  await fs.ensureDir(path.dirname(DATA_FILE));
  await fs.ensureDir(HISTORICAL_DIR);

  // 🛡️ DATA PROTECTION: Don't overwrite a real number with XX (unless it's a new day)
  let existingData = { games: [] };
  if (await fs.pathExists(DATA_FILE)) {
    existingData = await fs.readJson(DATA_FILE);
  }

  const now = new Date();
  const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  const istTotalMinutes = istTime.getUTCHours() * 60 + istTime.getUTCMinutes();

  const finalGames = [];
  for (const game of GAMES) {
    const scrapedGame = results.games.find(g => g.name === game.name);
    const oldGame = existingData.games.find(g => g.name === game.name);
    const gameTime = GAME_TIMES[game.name];
    const isGameTimePassed = istTotalMinutes >= gameTime;

    if (scrapedGame) {
      if (scrapedGame.newResult === 'XX' && oldGame && oldGame.newResult !== 'XX') {
        // Only protect the old number if the game has ALREADY PASSED today (prevents glitches)
        if (isGameTimePassed) {
          console.log(`🛡️ Protecting ${game.name}: Keeping ${oldGame.newResult} instead of XX`);
          finalGames.push({
            ...oldGame,
            oldResult: scrapedGame.oldResult !== '--' ? scrapedGame.oldResult : oldGame.oldResult
          });
        } else {
          // Game hasn't happened yet today. Allow XX to replace yesterday's number.
          finalGames.push(scrapedGame);
        }
      } else {
        finalGames.push(scrapedGame);
      }
    } else if (oldGame) {
      finalGames.push(oldGame);
    }
  }

  results.games = finalGames;
  await fs.writeJson(DATA_FILE, results, { spaces: 2 });

  // 🛡️ BULLETPROOF IST DATE MATH
  const today = istTime.getUTCDate();
  const month = String(istTime.getUTCMonth() + 1).padStart(2, '0');
  const year  = istTime.getUTCFullYear();
  const monthYear = `${year}-${month}`;
  const historicalFile = path.join(HISTORICAL_DIR, `${monthYear}.json`);

  let historicalData = [];
  if (await fs.pathExists(historicalFile)) {
    historicalData = await fs.readJson(historicalFile);
  }

  // 1. Normalize dates
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

  // 2. 🧹 UNIVERSAL DEDUPLICATION CLEANER
  historicalData.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  const uniqueMap = new Map();
  for (const item of historicalData) {
    if (item.date > 0 && !uniqueMap.has(item.date)) {
      uniqueMap.set(item.date, item);
    }
  }
  historicalData = Array.from(uniqueMap.values());

  // 3. Remove today's entry so we can add the fresh one
  historicalData = historicalData.filter(item => Number(item.date) !== Number(today));
  historicalData.push({ date: Number(today), timestamp: results.timestamp, games: results.games });
  historicalData.sort((a, b) => Number(a.date) - Number(b.date));

  await fs.writeJson(historicalFile, historicalData, { spaces: 2 });
  console.log(`✅ Results saved for ${monthYear}-${today}. (Duplicates cleaned)`);
}

async function runScraper() {
  console.log('🚀 Starting Satta King scraper...');
  try {
    const html = await bypassCloudflare(TARGET_URL);
    const results = extractResults(html);
    await saveResults(results);
    console.log(`✅ Scraping completed! Extracted ${results.games.length} games.`);
  } catch (error) {
    console.error('❌ Scraping failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runScraper();
}

module.exports = { runScraper, extractResults, saveResults };
