const { bypassCloudflare } = require('./utils/cloudflare-bypass');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');

const HISTORICAL_DIR = path.join(__dirname, '..', 'public', 'data', 'historical');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

async function scrapeYear(year) {
    console.log(`🚀 Starting to scrape year ${year}...`);
    
    for (let m = 0; m < 12; m++) {
        const monthNum = String(m + 1).padStart(2, '0');
        const monthName = MONTHS[m];
        const url = `https://satta-king-fast.com/chart.php?ResultFor=${monthName}-${year}&month=${monthNum}&year=${year}`;
        
        console.log(`⏳ Fetching ${monthName} ${year}...`);
        
        try {
            const html = await bypassCloudflare(url);
            const $ = cheerio.load(html);
            
            const pageText = $('body').text().toUpperCase();
            if (pageText.includes("JUST A MOMENT") || pageText.includes("ATTENTION REQUIRED")) {
                console.log(`❌ Cloudflare blocked ${monthName} ${year}. Skipping...`);
                continue;
            }

            const monthlyData = [];
            
            $('tr').each((index, element) => {
                const tds = $(element).find('td');
                if (tds.length >= 5) {
                    const dayText = tds.eq(0).text().trim();
                    const day = parseInt(dayText, 10);
                    
                    if (day > 0 && day <= 31) {
                        // Extract the 4 main games. Sometimes the site adds Shri Ganesh in col 2.
                        // We check if col 2 is DSWR or SRGN to map correctly.
                        let dswr, frbd, gzbd, gali;
                        
                        if (tds.length === 6) {
                            // Format: Date, DSWR, SRGN, FRBD, GZBD, GALI
                            dswr = tds.eq(1).text().trim();
                            frbd = tds.eq(3).text().trim();
                            gzbd = tds.eq(4).text().trim();
                            gali = tds.eq(5).text().trim();
                        } else {
                            // Format: Date, DSWR, FRBD, GZBD, GALI
                            dswr = tds.eq(1).text().trim();
                            frbd = tds.eq(2).text().trim();
                            gzbd = tds.eq(3).text().trim();
                            gali = tds.eq(4).text().trim();
                        }

                        const isValidResult = (val) => /^\d{2}$/.test(val) || val === 'XX';
                        
                        monthlyData.push({
                            date: day,
                            games: [
                                { name: 'DESAWAR', newResult: isValidResult(dswr) ? dswr : '--' },
                                { name: 'FARIDABAD', newResult: isValidResult(frbd) ? frbd : '--' },
                                { name: 'GHAZIABAD', newResult: isValidResult(gzbd) ? gzbd : '--' },
                                { name: 'GALI', newResult: isValidResult(gali) ? gali : '--' }
                            ]
                        });
                    }
                }
            });

            if (monthlyData.length > 0) {
                await fs.ensureDir(HISTORICAL_DIR);
                const filePath = path.join(HISTORICAL_DIR, `${year}-${monthNum}.json`);
                await fs.writeJson(filePath, monthlyData, { spaces: 2 });
                console.log(`✅ Saved ${monthName} ${year} (${monthlyData.length} days)`);
            } else {
                console.log(`⚠️ No data found for ${monthName} ${year}`);
            }
            
            // Wait 5 seconds between requests to avoid being blocked
            await new Promise(resolve => setTimeout(resolve, 5000));
            
        } catch (error) {
            console.error(`❌ Error scraping ${monthName} ${year}:`, error.message);
        }
    }
    console.log(`🎉 Finished year ${year}!`);
}

// Get year from command line argument (e.g., node scraper-history.js 2023)
const targetYear = process.argv[2] || new Date().getFullYear();
scrapeYear(targetYear).catch(console.error);
