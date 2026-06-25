/**
 * ONE-TIME CLEANUP SCRIPT
 * Removes duplicate date entries from all historical JSON files.
 * For each day that has multiple entries, keeps the LATEST one (by timestamp).
 *
 * Usage:
 *   node cleanup-historical.js
 */

const fs   = require('fs-extra');
const path = require('path');

const HISTORICAL_DIR = path.join(__dirname, '..', 'public', 'data', 'historical');

// Derive the correct day number from an ISO timestamp using IST offset
function getDayFromTimestamp(timestamp) {
  if (!timestamp) return null;
  const tsDate  = new Date(timestamp);
  const istDate = new Date(tsDate.getTime() + (5.5 * 60 * 60 * 1000));
  const day     = istDate.getUTCDate();
  return isNaN(day) ? null : day;
}

// Normalize a raw date field (number, ISO string, or slash-delimited string)
// Always prefers timestamp if available — only falls back to item.date otherwise
function normalizeDayNum(item) {
  // 1. Best source: ISO timestamp
  if (item.timestamp) {
    const day = getDayFromTimestamp(item.timestamp);
    if (day) return day;
  }

  // 2. Fallback: item.date as a plain number
  if (typeof item.date === 'number') return item.date;

  // 3. Last resort: item.date as a string — parse carefully
  if (typeof item.date === 'string') {
    if (item.date.includes('/')) {
      const parts = item.date.split('/');
      // Detect D/M/YYYY vs M/D/YYYY: if parts[0] > 12 it must be the day
      const first  = parseInt(parts[0], 10);
      const second = parseInt(parts[1], 10);
      return first > 12 ? first : second; // safest heuristic without timestamp
    }
    if (item.date.includes('-') && item.date.length === 10) {
      // YYYY-MM-DD
      return parseInt(item.date.split('-')[2], 10);
    }
    return parseInt(item.date, 10);
  }

  return 0;
}

async function cleanFile(filePath) {
  const fileName = path.basename(filePath);
  console.log(`\n📂 Processing: ${fileName}`);

  let data;
  try {
    data = await fs.readJson(filePath);
  } catch (e) {
    console.error(`  ❌ Could not read file: ${e.message}`);
    return;
  }

  if (!Array.isArray(data)) {
    console.warn(`  ⚠️  Skipping — not an array.`);
    return;
  }

  const before = data.length;

  // Step 1: Normalize day numbers for every entry
  const normalized = data.map(item => ({
    ...item,
    date: normalizeDayNum(item)
  }));

  // Step 2: Group entries by day
  const byDay = {};
  for (const item of normalized) {
    const day = Number(item.date);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(item);
  }

  // Step 3: For each day keep only the entry with the LATEST timestamp
  const deduped = Object.entries(byDay).map(([day, entries]) => {
    if (entries.length === 1) return entries[0];

    // Sort descending by timestamp → pick first (most recent)
    entries.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });

    console.log(`  🔁 Day ${day}: found ${entries.length} duplicates → keeping latest (${entries[0].timestamp})`);
    return entries[0];
  });

  // Step 4: Sort by day ascending
  deduped.sort((a, b) => Number(a.date) - Number(b.date));

  const after = deduped.length;
  const removed = before - after;

  if (removed === 0) {
    console.log(`  ✅ No duplicates found. (${before} entries)`);
    return;
  }

  // Step 5: Write cleaned data back
  await fs.writeJson(filePath, deduped, { spaces: 2 });
  console.log(`  ✅ Cleaned! Removed ${removed} duplicate(s). (${before} → ${after} entries)`);
}

async function runCleanup() {
  console.log('🧹 Starting historical data cleanup...');
  console.log(`📁 Directory: ${HISTORICAL_DIR}`);

  if (!(await fs.pathExists(HISTORICAL_DIR))) {
    console.error('❌ Historical directory not found. Check HISTORICAL_DIR path.');
    process.exit(1);
  }

  const files = (await fs.readdir(HISTORICAL_DIR))
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(HISTORICAL_DIR, f));

  if (files.length === 0) {
    console.warn('⚠️  No JSON files found in historical directory.');
    process.exit(0);
  }

  console.log(`📊 Found ${files.length} file(s) to process.`);

  for (const file of files) {
    await cleanFile(file);
  }

  console.log('\n🎉 Cleanup complete!');
}

runCleanup().catch(err => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
