const { chromium } = require('playwright');
const OpenAI = require('openai');
const dotenv = require('dotenv');
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'], 
});
const model = "gpt-4"

async function setupStealthBrowser() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: 'state.json',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    permissions: ['geolocation', 'notifications'],
    geolocation: { latitude: 34.052235, longitude: -118.243683 },
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
  });

  const page = await context.newPage();

  // Set extra HTTP headers to make requests look more like regular browser requests
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9'
  });

  // Go to LinkedIn
  await page.goto('https://google.com');
  return { browser, context, page };
}

const getCode = async (prompt, input) => {
  let completion = await openai.chat.completions.create({
    model,
    messages: [
      { "role": "system", "content": prompt },
      { "role": "user", "content": input },
    ]
  })
  completion = await openai.chat.completions.create({
    model,
    messages: [
      { "role": "system", "content": "extract the code to run. ONLY output valid javascript. do not include any other text or formatting. if it is a function, call the function." },
      { "role": "user", "content": completion.choices[0].message.content },
    ]
  })
  const actionScript = completion.choices[0].message.content
    .replace(/```javascript/g, '')
    .replace(/```/g, '')
    .trim();
  return actionScript
}

setTimeout(async () => {
  const max_length = 8000
  const search = "Andrew Pierno"
  console.log('setting up broswer');
  const { browser, context, page } = await setupStealthBrowser();
  let cleanedHTML = await page.evaluate(() => {
    const selectorsToRemove = ['img', 'svg', 'link', 'iframe', 'style'];
    selectorsToRemove.forEach(selector => {
      document.querySelectorAll(selector).forEach(elem => elem.remove());
    });
    return document.body.innerHTML;
  });
  cleanedHTML = cleanedHTML.slice(0, max_length)
  const actionScript = await getCode(`based on the html, write a vanilla javascript function to fill out the input with the text "${search}". 
  And then run the google search.
  Code should be run immediately. 
  Do not include any other text or formatting.
  Do not wrap it in a domcontent loaded or anything.
  `, cleanedHTML)
  console.log("executing script:", actionScript)
  await page.evaluate(actionScript => {
    try {
      eval(actionScript);
    } catch (error) {
      console.error('Error while running the script:', error);
    }
  }, actionScript);

  console.log('wait for search results');
  await page.waitForNavigation();
  console.log('getting search results');
  let pageText = await page.innerText('body');
  pageText = pageText.slice(0, max_length)
  console.log('summarizing page text');
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { "role": "system", "content": `summarize the page text. It's a search result for ${search}. Include links to sources.` },
      { "role": "user", "content": pageText },
    ]
  })
  console.log("summary:", completion.choices[0].message.content)
  await browser.close();
})