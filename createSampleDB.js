// createSampleDB.js - Create a sample database for testing
import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('sample.db');

db.serialize(() => {
  // Create users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    age INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Create products table
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price DECIMAL(10,2),
    category TEXT,
    in_stock BOOLEAN DEFAULT 1
  )`);

  // Insert sample users
  const userStmt = db.prepare('INSERT OR IGNORE INTO users (name, email, age) VALUES (?, ?, ?)');
  userStmt.run('Alice Johnson', 'alice@email.com', 28);
  userStmt.run('Bob Smith', 'bob@email.com', 35);
  userStmt.run('Carol Davis', 'carol@email.com', 22);
  userStmt.run('David Wilson', 'david@email.com', 41);
  userStmt.finalize();
  const productStmt = db.prepare('INSERT OR IGNORE INTO products (name, price, category, in_stock) VALUES (?, ?, ?, ?)');
  productStmt.run('Laptop Pro', 1299.99, 'Electronics', 1);
  productStmt.run('Coffee Mug', 15.99, 'Kitchen', 1);
  productStmt.run('Desk Chair', 249.50, 'Furniture', 0);
  productStmt.run('Smartphone', 699.99, 'Electronics', 1);
  productStmt.run('Book Light', 29.99, 'Books', 1);
  productStmt.finalize();
});

db.close((err) => {
  if (err) {
    console.error('❌ Error creating database:', err.message);
  } else {
    console.log('✅ Sample database created successfully: sample.db');
    console.log('📊 Created tables: users, products');
    console.log('📁 Database ready for testing!');
  }
});