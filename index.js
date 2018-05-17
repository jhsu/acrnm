const puppeteer = require('puppeteer');
const fs = require('async-file');
const looksSame = require('looks-same');
const axios = require('axios');
const FormData = require('form-data');
const process = require('process');

const WEBHOOK_URL = process.env.WEBHOOK_URL;

function lookSamePromise(a, b, options={}) {
  return new Promise((resolve, reject) => {
    looksSame(a, b, options, (error, equal) => {
      if (error) {
        return reject(error);
      }
      return resolve(equal);
    });
  });
}

function looksSameDiff(options) {
  return new Promise((resolve, reject) => {
    looksSame.createDiff(options, function(error, buffer) {
      if (error) {
        return reject(error);
      }
      return resolve(buffer);
    }); 
  });
  
}

async function getChanges(page, interval=300000) {
  await page.goto('https://acrnm.com');
  await page.screenshot({path: 'latest.png'});

  if ((await fs.exists('previous.png'))) {
    const equal = await lookSamePromise('latest.png', 'previous.png', { strict: true});
    if (!equal) {
      process.stdout.write("x");
      const diffBuffer = await looksSameDiff({
        reference: 'latest.png',
        current: 'previous.png',
        highlightColor: '#ff00ff', //color to highlight the differences
        strict: true,
      });
      const formData = new FormData();
      formData.append('screenshot', diffBuffer, 'acrnm.png');
      formData.append('payload_json', '{ "content": "UPDATED: https://acrnm.com" }');
      const options = {
        method: 'POST',
        headers: formData.getHeaders(),
        data: formData,
        url: WEBHOOK_URL,
      };
      await axios(options).catch((e) => {
          console.error(e);
      });
    } else {
      process.stdout.write(".");
    }
  }
  await fs.rename('latest.png', 'previous.png');

  setTimeout(() => getChanges(page, interval), interval);
};

const MINUTE = 60000;

(async () => {
  const browser = await puppeteer.launch();
  process.on('beforeExit', () => {
    browser.close();
  });
  const page = await browser.newPage();

  await getChanges(page, 5 * MINUTE);

})();