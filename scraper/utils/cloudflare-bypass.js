const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Apply stealth plugin to bypass Cloudflare
puppeteer.use(StealthPlugin());

/**
 * Creates a browser instance with stealth settings
 */
async function createBrowser() {
  return await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920x1080'
    ]
  });
}

/**
 * Bypasses Cloudflare protection and returns page content
 */
async function bypassCloudflare(url) {
  const browser = await createBrowser();
  try {
    const page = await browser.newPage();
    
    // Set realistic viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Navigate to URL and wait for Cloudflare to resolve
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait for Cloudflare challenge to complete
    await page.waitForSelector('body', { timeout: 30000 });
    
    // Additional wait to ensure page is fully loaded
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Get page content
    const content = await page.content();
    return content;
  } finally {
    await browser.close();
  }
}

module.exports = { createBrowser, bypassCloudflare };
