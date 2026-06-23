const fs = require('fs-extra');
const path = require('path');

// Use GitHub's official workspace path if available, otherwise default to local
const ROOT_DIR = process.env.GITHUB_WORKSPACE || path.join(__dirname, '..');
const HISTORICAL_DIR = path.join(ROOT_DIR, 'public', 'data', 'historical');
const SITEMAP_PATH = path.join(ROOT_DIR, 'public', 'sitemap.xml');
const BASE_URL = 'https://sattaking786.pages.dev';
const GAMES = ['DESAWAR', 'FARIDABAD', 'GHAZIABAD', 'GALI'];

async function generateSitemap() {
    console.log('🗺️ Generating dynamic sitemap...');
    let urls = [
        `${BASE_URL}/`,
        `${BASE_URL}/old-records.html`,
        `${BASE_URL}/about.html`,
        `${BASE_URL}/disclaimer.html`,
        `${BASE_URL}/privacy-policy.html`,
        `${BASE_URL}/terms.html`,
        `${BASE_URL}/contact.html`
    ];

    try {
        console.log(`📂 Scanning directory: ${HISTORICAL_DIR}`);
        const files = await fs.readdir(HISTORICAL_DIR);
        console.log(`✅ Found ${files.length} files in historical directory.`);
        
        let historyUrlsAdded = 0;
        
        files.forEach(file => {
            if (file.endsWith('.json')) {
                const [year, month] = file.replace('.json', '').split('-');
                if (year && month) {
                    GAMES.forEach(game => {
                        // XML requires & to be written as &amp;
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

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    
    urls.forEach(url => {
        xml += `  <url>\n    <loc>${url}</loc>\n    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n    <priority>0.8</priority>\n  </url>\n`;
    });
    
    xml += `</urlset>`;

    await fs.writeFile(SITEMAP_PATH, xml);
    console.log(`✅ Sitemap generated successfully with ${urls.length} total URLs!`);
}

generateSitemap().catch(console.error);
