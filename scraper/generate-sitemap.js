const fs = require('fs-extra');
const path = require('path');

const ROOT_DIR       = process.env.GITHUB_WORKSPACE || path.join(__dirname, '..');
const HISTORICAL_DIR = path.join(ROOT_DIR, 'public', 'data', 'historical');
const SITEMAP_PATH   = path.join(ROOT_DIR, 'public', 'sitemap.xml');
const MANIFEST_PATH  = path.join(ROOT_DIR, 'public', 'data', 'manifest.json');
const BASE_URL       = 'https://sattaking786.pages.dev';
const GAMES          = ['DESAWAR', 'FARIDABAD', 'GHAZIABAD', 'GALI'];

async function generateSitemap() {
    console.log('🗺️ Generating dynamic sitemap and manifest...');

    let urls = [
        `${BASE_URL}/`,
        `${BASE_URL}/old-records.html`,
        `${BASE_URL}/about.html`,
        `${BASE_URL}/disclaimer.html`,
        `${BASE_URL}/privacy-policy.html`,
        `${BASE_URL}/terms.html`,
        `${BASE_URL}/contact.html`
    ];

    let availableDates = [];

    try {
        console.log(`📂 Scanning directory: ${HISTORICAL_DIR}`);
        const files = await fs.readdir(HISTORICAL_DIR);
        console.log(`✅ Found ${files.length} files in historical directory.`);

        // FIX 1: Count ALL dynamic URLs (combined-chart + game pages)
        let historyUrlsAdded = 0;

        files.forEach(file => {
            if (file.endsWith('.json')) {
                const ym = file.replace('.json', '');
                const [year, month] = ym.split('-');
                if (year && month) {
                    availableDates.push(ym);

                    // Combined chart URL (counted separately now)
                    urls.push(`${BASE_URL}/combined-chart.html?year=${year}&amp;month=${month}`);
                    historyUrlsAdded++;

                    // Individual game pages
                    GAMES.forEach(game => {
                        urls.push(`${BASE_URL}/game.html?name=${game}&amp;year=${year}&amp;month=${month}`);
                        historyUrlsAdded++;
                    });
                }
            }
        });

        console.log(`➕ Added ${historyUrlsAdded} historical URLs to sitemap.`);

    } catch (e) {
        console.log('⚠️ Historical directory not found or empty. Generating base sitemap only.');
        console.error('Error details:', e.message);
    }

    // FIX 2: Priority tiers — homepage 1.0, old-records 0.9, everything else 0.8
    const today = new Date().toISOString().split('T')[0];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    urls.forEach(url => {
        const priority = url === `${BASE_URL}/`              ? '1.0'
                       : url.includes('old-records')         ? '0.9'
                       : url.includes('about') ||
                         url.includes('contact')             ? '0.7'
                       : url.includes('disclaimer') ||
                         url.includes('privacy') ||
                         url.includes('terms')               ? '0.5'
                       : '0.8'; // combined-chart + game pages

        xml += `  <url>\n    <loc>${url}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${priority}</priority>\n  </url>\n`;
    });

    xml += `</urlset>`;

    await fs.writeFile(SITEMAP_PATH, xml);
    console.log(`✅ Sitemap generated with ${urls.length} URLs!`);

    // FIX 3: Manifest as object with metadata instead of plain array
    availableDates.sort().reverse();

    await fs.writeJson(MANIFEST_PATH, {
        generated:  new Date().toISOString(),
        totalUrls:  urls.length,
        months:     availableDates,   // sorted newest-first, same as before
        games:      GAMES
    }, { spaces: 2 });

    console.log(`✅ Manifest generated with ${availableDates.length} months!`);
}

generateSitemap().catch(console.error);
