const sqlite3 = require("sqlite3");

const db = new sqlite3.Database("./stock-list.db");
db
  .exec(
    `
drop table if exists products
`
  )
  .exec(
    `
  drop table if exists product_stocks
  `
  )
  .exec(
    `
create table if not exists products (
  id integer primary key,
  name text
) 
`
  )
  .exec(
    `
create table if not exists product_stocks (
  id integer primary key,
  description text,
  product_id,
  in_stock integer default 0
)
`
  );
