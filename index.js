const puppeteer = require("puppeteer");
const process = require("process");
const mqtt = require("mqtt");

require("dotenv").config();

const mClient = mqtt.connect(`mqtt://${process.env.MQTT_BROKER}`, {
  debug: true,
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASS,
  port: 1883
});

mClient.on("close", () => {
  console.error("closed");
});

mClient.on("end", () => {
  console.error("ended");
});

mClient.on("error", err => {
  console.error(err);
});

const topic = "shopping/acrnm/products";
mClient.on("connect", () => {
  console.log("connected to mqtt");
  puppeteer.launch().then(async browser => {
    const page = await browser.newPage();
    await page.goto("https://acrnm.com");
    const items = await page.evaluate(() => {
      const items = Array.from(
        document.querySelectorAll(".tile-list-wrapper .tile")
      );
      return items.map(function(a) {
        const path = a.href;
        const name = a.querySelector(".name").innerHTML;
        return { path: path, name: name };
      });
    });
    const justClothes = items.filter(item => !/^[AV]/.test(item.name));
    justClothes.forEach(item => {
      mClient.publish(topic, JSON.stringify(item), err => {
        if (err) {
          console.error(err);
        }
      });
    });
    await browser.close();
    mClient.end();
  }, console.error);
});
