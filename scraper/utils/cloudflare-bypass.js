const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

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

async function bypassCloudflare(url) {
  const browser = await createBrowser();
  try {
    const page = await browser.newPage();
    
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Check if Cloudflare "Just a moment" page is showing
    let title = await page.title();
    console.log(`Initial page title: ${title}`);
    
    if (title.includes("Just a moment") || title.includes("Attention Required")) {
      console.log("⏳ Cloudflare challenge detected. Waiting up to 30s for it to resolve...");
      try {
        // Wait until the title changes from "Just a moment..."
        await page.waitForFunction(() => {
          return !document.title.includes("Just a moment") && !document.title.includes("Attention Required");
        }, { timeout: 30000 });
        console.log("✅ Cloudflare challenge passed!");
      } catch (e) {
        console.log("⚠️ Cloudflare challenge did not resolve in 30s. Proceeding anyway...");
      }
    }
    
    // Wait for table or body to ensure content is loaded
    await page.waitForSelector('table, body', { timeout: 15000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 3000)); // Extra wait for JS rendering
    
    const content = await page.content();
    return content;
  } finally {
    await browser.close();
  }
}

module.exports = { createBrowser, bypassCloudflare };
