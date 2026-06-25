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

  // 🧠 STRICT DOM PARSING: Read table rows directly to prevent grabbing wrong numbers!
  $('tr').each((i, el) => {
    const cells = $(el).find('td');
    if (cells.length < 3) return; // Need at least 3 columns

    // Get the text from the first cell and clean it up
    const firstCellText = $(cells[0]).text().toUpperCase().replace(/\s+/g, ' ').trim();
    
    GAMES.forEach(game => {
      // Must start exactly with "GALIAT" or "GALI AT" to ignore "Gali Bazar"
      const match1 = game.name + 'AT';
      const match2 = game.name + ' AT';
      
      if (firstCellText.startsWith(match1) || firstCellText.startsWith(match2)) {
        // Read exact columns
        const cell1 = $(cells[1]).text().trim(); // Yesterday
        const cell2 = $(cells[2]).text().trim(); // Today
        
        const oldR = (/^\d{2}$/.test(cell1) || cell1 === 'XX') ? cell1 : '--';
        const newR = (/^\d{2}$/.test(cell2) || cell2 === 'XX') ? cell2 : '--';
        
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

  return results;
}

async function saveResults(results) {
  if (!results.games || results.games.length === 0) {
    throw new Error('No games extracted. Cannot save empty data.');
  }

  await fs.ensureDir(path.dirname(DATA_FILE));
  await fs.ensureDir(HISTORICAL_DIR);
  await fs.writeJson(DATA_FILE, results, { spaces: 2 });

  // 🛡️ BULLETPROOF IST DATE MATH
  const now = new Date();
  const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000)); 
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
  let lastResults = null;

  for (let i = 1; i <= maxRetries; i++) {
    console.log(`\n=========================================`);
    console.log(`🚀 Attempt ${i} of ${maxRetries}...`);
    console.log(`=========================================`);
    try {
      const html = await bypassCloudflare(TARGET_URL);
      const results = extractResults(html);
      lastResults = results; // Save what we have so far
      
      // Check if we need to retry for any 'XX' results
      let needsRetry = false;
      const istTime = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));
      const istTotalMinutes = istTime.getUTCHours() * 60 + istTime.getUTCMinutes();
      
      for (const game of results.games) {
        if (game.newResult === 'XX') {
          const gameTime = GAME_TIMES[game.name];
          // If it's past the game time, we should retry to see if the website updated
          if (istTotalMinutes >= gameTime + 10 && istTotalMinutes <= gameTime + 240) {
            console.log(`⏳ ${game.name} is still XX. Will retry to check for update...`);
            needsRetry = true;
          }
        }
      }
      
      if (!needsRetry) {
        console.log('✅ All expected results are in! Saving and exiting.');
        break; // Exit loop, proceed to save
      } else {
        if (i < maxRetries) {
          console.log(`⏳ Waiting 5 minutes before next retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTimeMs));
        } else {
          console.log('🚨 Max retries reached. Saving current data (with XX) anyway.');
        }
      }
    } catch (error) {
      console.error(`❌ Attempt ${i} failed: ${error.message}`);
      if (i < maxRetries) {
        console.log(`⏳ Waiting 5 minutes before next retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTimeMs));
      } else {
        if (lastResults) {
          console.log('🚨 Max retries reached. Saving last known good data.');
        } else {
          console.error('🚨 No data extracted at all. Failing workflow.');
          process.exit(1); 
        }
      }
    }
  }

  // Save the data at the very end (whether perfect or with XX after retries)
  if (lastResults) {
    await saveResults(lastResults);
    console.log(`✅ Scraping completed! Extracted ${lastResults.games.length} games.`);
  }
}

if (require.main === module) {
  runScraperWithRetries();
}

module.exports = { runScraperWithRetries, extractResults, saveResults };
