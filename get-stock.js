const puppeteer = require("puppeteer");
const process = require("process");
const mqtt = require("mqtt");
const sqlite3 = require("sqlite3");

require("dotenv").config();

const db = new sqlite3.Database("./stock-list.db");

const mClient = mqtt.connect(`mqtt://${process.env.MQTT_BROKER}`, {
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASS,
  port: 1883
});

mClient.on("connect", () => {
  console.log("CONNECTED");
});

function createProduct(name) {
  return new Promise((resolve, reject) => {
    db.run(`insert into products (name) values (?)`, name, function(err) {
      err ? reject(err) : resolve(this.lastID);
    });
  });
}

async function getProduct(name) {
  return new Promise((resolve, reject) => {
    db.get(
      `
      select id from products where name = ?
    `,
      name,
      (err, row) => {
        if (err) {
          return reject(err);
        }
        return row ? resolve(row.id) : resolve(null);
      }
    );
  });
}

async function updateProductStocks(productId, stocklist) {
  return new Promise((resolve, reject) => {
    try {
      db.run(
        `update product_stocks set in_stock = 0 where product_id = ?`,
        productId,
        err => {
          if (err) {
            return reject(err);
          }
          const details = stocklist.map(description => {
            return `(${[productId, `"${description}"`, 1].join(",")})`;
          });
          const statement = `insert or replace into product_stocks (product_id, description, in_stock) values ${details.join(",")}`;
          db.exec(
            `insert or replace into product_stocks (product_id, description, in_stock) values ${details.join(",")}`,
            err => {
              if (err) {
                return reject(err);
              }
              return resolve();
            }
          );
        }
      );
    } catch (e) {
      console.error(e);
      reject(e);
    }
  });
}

async function updateStocklist(name, stocklist) {
  // TODO: ensure product exists
  let productId = await getProduct(name);
  if (!productId) {
    productId = await createProduct(name);
  }
  return await updateProductStocks(productId, stocklist);
}

const topic = "shopping/acrnm/products";
let browser;
mClient.on("connect", () => {
  puppeteer.launch().then(inst => {
    browser = inst;

    mClient.subscribe(topic, err => {
      if (err) {
        console.error(err);
        return;
      }
      console.log("listening for messages");
    });
  }, console.error);
});

async function publishMessage(client, topic, message) {
  return new Promise((resolve, reject) => {
    client.publish(topic, message, err => {
      if (err) {
        return reject(err);
      }
      return resolve();
    });
  });
}

mClient.on("close", () => {
  if (browser) {
    browser.close();
  }
});

mClient.on("message", (topic, payload) => {
  let msg;
  try {
    msg = JSON.parse(payload);
  } catch (e) {
    console.error(e);
    return;
  }

  (async () => {
    const page = await browser.newPage();
    const { name, path } = msg;
    if (!path) {
      mClient.end();
      return;
    }
    await page.goto(path);

    const stocklist = await page.evaluate(() => {
      var sizeList = document.getElementById("variety_id");
      var sizes = sizeList
        ? Array.from(sizeList.querySelectorAll("option")).map(function(n) {
            return n.innerHTML;
          })
        : [];

      return sizes;
    });
    await page.close();
    console.log(`loaded page for ${name}`);
    // TODO; await this
    // mClient.publish(topic, JSON.stringify({ name, sizes: stockList }));
    console.log("sending items", stocklist);
    await publishMessage(
      mClient,
      "shopping/acrnm/stock-list",
      JSON.stringify({ name, sizes: stocklist })
    );
    await updateStocklist(name, stocklist);
    console.log("updated stocklist");
  })();
});
