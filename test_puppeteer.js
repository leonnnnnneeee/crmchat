const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  await page.goto('http://localhost:3001');
  await new Promise(r => setTimeout(r, 3000));
  
  await page.evaluate(() => {
    const chat = document.querySelector('.chat-item');
    if (chat) chat.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('div')).filter(el => el.style.cursor === 'pointer');
    // find the one containing "Andy | Coincu"
    const target = items.find(el => el.innerText && el.innerText.includes('Coincu'));
    if (target) target.click();
    else if (items.length > 0) items[0].click();
  });
  await new Promise(r => setTimeout(r, 2000));
  
  await browser.close();
})();
