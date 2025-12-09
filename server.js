import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import sqlite3 from "sqlite3";
import { MongoClient } from "mongodb";
import pkg from 'pg';
const { Client: PostgresClient, Pool } = pkg;
import mysql from "mysql2/promise";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { exec, spawn } from "child_process";
import { promisify as util_promisify } from "util";
import { createObjectCsvWriter } from 'csv-writer';

dotenv.config();

const execAsync = util_promisify(exec);

const server = new Server(
  {
    name: "universal-database-creator",
    version: "3.3.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

let connections = {
  sqlite: new Map(),
  postgres: new Map(),
  mongodb: new Map(),
  mysql: new Map()
};

setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000;

  for (const [type, connectionMap] of Object.entries(connections)) {
    for (const [id, conn] of connectionMap.entries()) {
      if (now - conn.lastUsed > timeout) {
        try {
          if (type === 'sqlite' && conn.db) {
            conn.db.close();
          } else if (type === 'postgres' && conn.client) {
            conn.client.end();
          } else if (type === 'mongodb' && conn.client) {
            conn.client.close();
          } else if (type === 'mysql' && conn.connection) {
            conn.connection.end();
          }
        } catch (error) {
          console.error(`Error closing ${type} connection:`, error);
        }
        connectionMap.delete(id);
      }
    }
  }
}, 60000);

// CSV Export Utility Functions
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

async function getFileSize(filePath) {
  try {
    const stats = await fs.promises.stat(filePath);
    const sizeInBytes = stats.size;
    
    if (sizeInBytes < 1024) return `${sizeInBytes} B`;
    if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)} KB`;
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
  } catch (error) {
    return 'Unknown';
  }
}

// Database tool openers
const openDatabaseTool = async (dbType, config) => {
  try {
    switch (dbType) {
      case 'postgresql': {
        await openPgAdmin(config);
        break;
      }
      case 'sqlite': {
        await openSQLiteTool(config);
        break;
      }
      case 'mysql': {
        await openMySQLTool(config);
        break;
      }
      case 'mongodb': {
        await openMongoTool(config);
        break;
      }
      default:
        return `No visual tool configured for ${dbType}`;
    }
    return `Attempting to open ${dbType} management tool...`;
  } catch (error) {
    return `Could not open ${dbType} tool: ${error.message}`;
  }
};

const openPgAdmin = async (config) => {
  const { host, port, database_name, username } = config;

  const pgAdminMethods = [
    () => {
      const commands = {
        win32: `start "" "C:\\Program Files\\PostgreSQL\\17\\pgAdmin 4\\runtime\\pgAdmin4.exe"`,
        darwin: `open -a "pgAdmin 4"`,
        linux: `pgadmin4 --desktop`
      };

      const platform = process.platform;
      const cmd = commands[platform];

      if (cmd) {
        return execAsync(cmd, {
          env: {
            ...process.env,
            CommonProgramFiles: "C:\\Program Files\\Common Files"
          }
        });
      } else {
        throw new Error("Unsupported platform");
      }
    },

    () => {
      const altCommands = {
        win32: `start "" "C:\\Program Files\\PostgreSQL\\17\\pgAdmin 4\\bin\\pgAdmin4.exe"`,
        darwin: `/Applications/pgAdmin\\ 4.app/Contents/MacOS/pgAdmin4`,
        linux: `pgadmin4`
      };

      const platform = process.platform;
      const cmd = altCommands[platform];

      if (cmd) {
        return execAsync(cmd, {
          env: {
            ...process.env,
            CommonProgramFiles: "C:\\Program Files\\Common Files"
          }
        });
      } else {
        throw new Error("No alternative command found");
      }
    }
  ];

  for (const method of pgAdminMethods) {
    try {
      await method();
      console.log("✅ pgAdmin launched successfully");

      setTimeout(() => {
        try {
          const connectionUrl = `postgresql://${username}@${host}:${port}/${database_name}`;
          console.log(`🔗 Connection details: ${connectionUrl}`);
        } catch {
          // ignore
        }
      }, 2000);

      return;
    } catch (error) {
      console.log(`pgAdmin launch method failed: ${error.message}`);
      continue;
    }
  }

  throw new Error("❌ Could not launch pgAdmin using any available method");
};

const openSQLiteTool = async (config) => {
  const { database_path } = config;
  
  const sqliteTools = [
    () => {
      const commands = {
        win32: `start "" "${database_path}"`,
        darwin: `open -a "DB Browser for SQLite" "${database_path}"`,
        linux: `sqlitebrowser "${database_path}"`
      };
      
      const platform = process.platform;
      const cmd = commands[platform];
      
      if (cmd) {
        return execAsync(cmd);
      } else {
        throw new Error('No SQLite browser found');
      }
    }
  ];

  for (const method of sqliteTools) {
    try {
      await method();
      console.log('SQLite tool launched successfully');
      return;
    } catch (error) {
      console.log(`SQLite tool launch failed: ${error.message}`);
      continue;
    }
  }
  
  throw new Error('Could not launch SQLite management tool');
};
const openMySQLWorkbench = async () => {
  const platform = process.platform;
  let cmd;

  if (platform === 'win32') {
    cmd = `"C:\\Program Files\\MySQL\\MySQL Workbench 8.0\\MySQLWorkbench.exe"`;
  } else if (platform === 'darwin') {
    cmd = 'open -a "MySQL Workbench"';
  } else if (platform === 'linux') {
    cmd = 'mysql-workbench'; 
  } else {
    throw new Error('Unsupported platform');
  }

  try {
    await execAsync(cmd);
    console.log('MySQL Workbench launched successfully');
  } catch (err) {
    console.error('Failed to launch MySQL Workbench:', err.message);
    throw err;
  }
};

const openMongoTool = async (config) => {
  const mongoTools = [
    () => {
      const commands = {
        win32: '"C:\\Users\\<YourUser>\\AppData\\Local\\MongoDBCompass\\MongoDBCompass.exe"',
        darwin: 'open -a "MongoDB Compass"',
        linux: 'mongodb-compass'
      };
      
      const platform = process.platform;
      const cmd = commands[platform];
      
      if (cmd) {
        return execAsync(cmd);
      } else {
        throw new Error('MongoDB Compass not found');
      }
    }
  ];

  for (const method of mongoTools) {
    try {
      await method();
      console.log('MongoDB tool launched successfully');
      return;
    } catch (error) {
      console.log(`MongoDB tool launch failed: ${error.message}`);
      continue;
    }
  }
  
  throw new Error('Could not launch MongoDB management tool');
};

const openURL = async (url) => {
  const commands = {
    win32: `start "" "${url}"`,
    darwin: `open "${url}"`,
    linux: `xdg-open "${url}"`
  };
  
  const platform = process.platform;
  const cmd = commands[platform];
  
  if (cmd) {
    return execAsync(cmd);
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
};

const formatTableResults = (rows) => {
  if (!rows || rows.length === 0) return "No data found";
  
  const columns = Object.keys(rows[0]);
  const maxWidths = {};
  
  columns.forEach(col => {
    maxWidths[col] = Math.max(col.length, ...rows.map(row => 
      String(row[col] || '').length
    ));
  });
  
  const header = columns.map(col => 
    col.padEnd(maxWidths[col])
  ).join(' | ');
  
  const separator = columns.map(col => 
    '-'.repeat(maxWidths[col])
  ).join('-|-');
  
  const dataRows = rows.map(row =>
    columns.map(col =>
      String(row[col] || '').padEnd(maxWidths[col])
    ).join(' | ')
  );
  
  return [header, separator, ...dataRows].join('\n');
};

const formatMongoResults = (documents) => {
  if (!documents || documents.length === 0) return "No documents found";
  
  return documents.map((doc, index) => 
    `Document ${index + 1}:\n${JSON.stringify(doc, null, 2)}`
  ).join('\n\n');
};

const generateSchemaFromDescription = (description, dbType = 'sqlite') => {
  const schemas = {
    'school system': {
      sqlite: {
        schema: `
          CREATE TABLE students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            email TEXT UNIQUE,
            grade_level INTEGER,
            enrollment_date DATE DEFAULT CURRENT_DATE
          );
          
          CREATE TABLE teachers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            subject TEXT,
            hire_date DATE DEFAULT CURRENT_DATE
          );
          
          CREATE TABLE classes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            subject TEXT NOT NULL,
            teacher_id INTEGER,
            room_number TEXT,
            max_students INTEGER DEFAULT 30,
            FOREIGN KEY (teacher_id) REFERENCES teachers(id)
          );
          
          CREATE TABLE enrollments (
            student_id INTEGER,
            class_id INTEGER,
            enrollment_date DATE DEFAULT CURRENT_DATE,
            grade TEXT,
            PRIMARY KEY (student_id, class_id),
            FOREIGN KEY (student_id) REFERENCES students(id),
            FOREIGN KEY (class_id) REFERENCES classes(id)
          );
        `,
        data: `
          INSERT INTO teachers (first_name, last_name, email, subject) VALUES 
            ('John', 'Smith', 'j.smith@school.edu', 'Mathematics'),
            ('Sarah', 'Johnson', 's.johnson@school.edu', 'English'),
            ('Mike', 'Brown', 'm.brown@school.edu', 'Science');
          
          INSERT INTO students (first_name, last_name, email, grade_level) VALUES 
            ('Alice', 'Wilson', 'alice.wilson@student.school.edu', 10),
            ('Bob', 'Davis', 'bob.davis@student.school.edu', 10),
            ('Carol', 'Miller', 'carol.miller@student.school.edu', 9);
          
          INSERT INTO classes (name, subject, teacher_id, room_number) VALUES 
            ('Algebra I', 'Mathematics', 1, '101'),
            ('English Literature', 'English', 2, '205'),
            ('Biology', 'Science', 3, '301');
        `
      }
    },
    'library management': {
      sqlite: {
        schema: `
          CREATE TABLE books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            author TEXT NOT NULL,
            isbn TEXT UNIQUE,
            genre TEXT,
            publication_year INTEGER,
            copies_available INTEGER DEFAULT 1,
            total_copies INTEGER DEFAULT 1
          );
          
          CREATE TABLE members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            email TEXT UNIQUE,
            phone TEXT,
            membership_date DATE DEFAULT CURRENT_DATE,
            membership_type TEXT DEFAULT 'regular'
          );
          
          CREATE TABLE loans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            member_id INTEGER NOT NULL,
            loan_date DATE DEFAULT CURRENT_DATE,
            due_date DATE,
            return_date DATE,
            fine_amount DECIMAL(5,2) DEFAULT 0.00,
            FOREIGN KEY (book_id) REFERENCES books(id),
            FOREIGN KEY (member_id) REFERENCES members(id)
          );
        `,
        data: `
          INSERT INTO books (title, author, isbn, genre, publication_year, copies_available, total_copies) VALUES 
            ('The Great Gatsby', 'F. Scott Fitzgerald', '978-0-7432-7356-5', 'Fiction', 1925, 3, 3),
            ('To Kill a Mockingbird', 'Harper Lee', '978-0-06-112008-4', 'Fiction', 1960, 2, 2),
            ('1984', 'George Orwell', '978-0-452-28423-4', 'Dystopian', 1949, 4, 4);
          
          INSERT INTO members (first_name, last_name, email, phone, membership_type) VALUES 
            ('Emma', 'Thompson', 'emma.t@email.com', '555-0101', 'premium'),
            ('James', 'Wilson', 'james.w@email.com', '555-0102', 'regular'),
            ('Lisa', 'Anderson', 'lisa.a@email.com', '555-0103', 'student');
        `
      }
    }
  };
  
  for (const [key, value] of Object.entries(schemas)) {
    if (description.toLowerCase().includes(key)) {
      return value[dbType] || value.sqlite;
    }
  }
  
  return null;
};

class ConnectionManager {
  static async getSQLiteConnection(dbPath) {
    if (connections.sqlite.has(dbPath)) {
      const conn = connections.sqlite.get(dbPath);
      conn.lastUsed = Date.now();
      return conn.db;
    }

    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        connections.sqlite.set(dbPath, { db, lastUsed: Date.now() });
        resolve(db);
      });
    });
  }

  static async getPostgresConnection(config) {
    const connId = `${config.host}:${config.port}:${config.database}:${config.user}`;
    
    if (connections.postgres.has(connId)) {
      const conn = connections.postgres.get(connId);
      conn.lastUsed = Date.now();
      return conn.client;
    }

    const client = new PostgresClient(config);
    await client.connect();
    connections.postgres.set(connId, { client, config, lastUsed: Date.now() });
    return client;
  }

  static async getPostgresPool(config) {
    const pool = new Pool({
      host: config.host || 'localhost',
      port: config.port || 5432,
      database: config.database,
      user: config.username || 'postgres',
      password: config.password,
    });

    return pool;
  }

  static async getMongoConnection(config, forceNew = false) {
    const connId = `${config.host}:${config.port}:${config.database}`;
    if (!forceNew && connections.mongodb.has(connId)) {
      const conn = connections.mongodb.get(connId);
      conn.lastUsed = Date.now();
      return { client: conn.client, db: conn.db };
    }
    
    const client = new MongoClient(config.connectionUri);
    await client.connect();
    const db = client.db(config.database);
    connections.mongodb.set(connId, { client, db, config, lastUsed: Date.now() });
    return { client, db };
  }

  static async getMySQLConnection(config) {
    const connId = `${config.host}:${config.port}:${config.database}:${config.user}`;
    
    if (connections.mysql.has(connId)) {
      const conn = connections.mysql.get(connId);
      conn.lastUsed = Date.now();
      return conn.connection;
    }

    const connection = await mysql.createConnection(config);
    connections.mysql.set(connId, { connection, config, lastUsed: Date.now() });
    return connection;
  }
}

class DatabaseCreator {
  static async createSQLiteDatabase(args) {
    const { 
      database_name, 
      database_path = process.cwd(), 
      initial_schema, 
      sample_data, 
      overwrite = false,
      description,
      open_tool = true
    } = args;

    const dbName = database_name.endsWith('.db') ? database_name : `${database_name}.db`;
    const fullPath = path.join(database_path, dbName);

    let schema = initial_schema;
    let data = sample_data;
    
    if (description && !initial_schema) {
      const generated = generateSchemaFromDescription(description, 'sqlite');
      if (generated) {
        schema = generated.schema;
        data = generated.data;
      }
    }

    try {
      await fs.promises.access(fullPath);
      if (!overwrite) {
        return `❌ SQLite database '${dbName}' already exists. Use overwrite: true to replace it.`;
      }
    } catch (error) {
    }

    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(fullPath, (err) => {
        if (err) {
          reject(err);
          return;
        }

        const executeSQL = (sql) => {
          return new Promise((resolveSQL, rejectSQL) => {
            db.exec(sql, (err) => {
              if (err) rejectSQL(err);
              else resolveSQL();
            });
          });
        };

        const setupPromises = [];
        if (schema) setupPromises.push(executeSQL(schema));
        if (data) setupPromises.push(executeSQL(data));

        Promise.all(setupPromises)
          .then(async () => {
            db.close(async (err) => {
              if (err) {
                reject(err);
              } else {
                let result = `🎉 SQLite database created successfully!\n` +
                           `📍 Location: ${fullPath}\n` +
                           `📊 Schema: ${schema ? 'Applied' : 'None'}\n` +
                           `📝 Sample Data: ${data ? 'Inserted' : 'None'}\n` +
                           `🤖 Generated from description: ${description ? 'Yes' : 'No'}`;
                
                if (open_tool) {
                  try {
                    const toolResult = await openDatabaseTool('sqlite', { database_path: fullPath });
                    result += `\n🔧 ${toolResult}`;
                  } catch (toolError) {
                    result += `\n⚠️ Could not open SQLite tool: ${toolError.message}`;
                  }
                }
                
                resolve(result);
              }
            });
          })
          .catch(reject);
      });
    });
  }

  static async createPostgreSQLDatabase(args) {
    const {
      database_name,
      host = 'localhost',
      port = 5432,
      username = 'postgres',
      password,
      initial_schema,
      sample_data,
      overwrite = false,
      description,
      open_tool = true
    } = args;

    if (!password) {
      return "❌ PostgreSQL password is required";
    }

    let schema = initial_schema;
    let data = sample_data;
    
    if (description && !initial_schema) {
      const generated = generateSchemaFromDescription(description, 'postgresql');
      if (generated) {
        schema = generated.schema.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY');
        data = generated.data;
      }
    }

    const adminClient = new PostgresClient({
      host,
      port,
      user: username,
      password,
      database: 'postgres'
    });

    try {
      await adminClient.connect();

      const checkResult = await adminClient.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [database_name]
      );

      if (checkResult.rows.length > 0 && !overwrite) {
        await adminClient.end();
        return `❌ PostgreSQL database '${database_name}' already exists. Use overwrite: true to replace it.`;
      }

      if (checkResult.rows.length > 0 && overwrite) {
        await adminClient.query(`DROP DATABASE "${database_name}"`);
      }

      await adminClient.query(`CREATE DATABASE "${database_name}"`);
      await adminClient.end();

      if (schema || data) {
        const newDbClient = new PostgresClient({
          host,
          port,
          user: username,
          password,
          database: database_name
        });

        await newDbClient.connect();

        if (schema) {
          await newDbClient.query(schema);
        }

        if (data) {
          await newDbClient.query(data);
        }

        await newDbClient.end();
      }

      let result = `🎉 PostgreSQL database created successfully!\n` +
                  `📍 Host: ${host}:${port}\n` +
                  `🗄️ Database: ${database_name}\n` +
                  `👤 User: ${username}\n` +
                  `📊 Schema: ${schema ? 'Applied' : 'None'}\n` +
                  `📝 Sample Data: ${data ? 'Inserted' : 'None'}\n` +
                  `🤖 Generated from description: ${description ? 'Yes' : 'No'}`;

      if (open_tool) {
        try {
          const toolResult = await openDatabaseTool('postgresql', {
            host,
            port,
            database_name,
            username
          });
          result += `\n🔧 ${toolResult}`;
        } catch (toolError) {
          result += `\n⚠️ Could not open pgAdmin: ${toolError.message}`;
        }
      }

      return result;

    } catch (error) {
      if (adminClient._connected) await adminClient.end();
      throw error;
    }
  }

  static async createMongoDatabase(args) {
    const {
      database_name,
      connection_string,
      host = 'localhost',
      port = 27017,
      username,
      password,
      initial_collections = [],
      sample_data,
      overwrite = false,
      description,
      open_tool = true,
      force_new_connection = false
    } = args;

    const connectionUri = connection_string || 
      `mongodb://${username && password ? `${username}:${password}@` : ''}${host}:${port}`;

    const config = { host, port, database: database_name, connectionUri };
    const { client, db } = await ConnectionManager.getMongoConnection(config, force_new_connection);

    try {
      const admin = client.db().admin();
      const databases = await admin.listDatabases();
      const dbExists = databases.databases.some(db => db.name === database_name);

      if (dbExists && !overwrite) {
        await client.close();
        return `❌ MongoDB database '${database_name}' already exists. Use overwrite: true to replace it.`;
      }

      if (dbExists && overwrite) {
        await db.dropDatabase();
      }

      let collections = initial_collections;
      let data = sample_data;

      if (description && initial_collections.length === 0) {
        if (description.toLowerCase().includes('school')) {
          collections = ['students', 'teachers', 'classes', 'enrollments'];
          data = {
            students: [
              { firstName: 'Alice', lastName: 'Wilson', gradeLevel: 10, email: 'alice@school.edu' },
              { firstName: 'Bob', lastName: 'Davis', gradeLevel: 10, email: 'bob@school.edu' }
            ],
            teachers: [
              { firstName: 'John', lastName: 'Smith', subject: 'Mathematics', email: 'j.smith@school.edu' }
            ]
          };
        }
      }

      for (const collectionName of collections) {
        await db.createCollection(collectionName);
      }

      if (data) {
        for (const [collectionName, documents] of Object.entries(data)) {
          await db.collection(collectionName).insertMany(documents);
        }
      }

      await client.close();

      let result = `🎉 MongoDB database created successfully!\n` +
                  `📍 Connection: ${connectionUri}\n` +
                  `🗄️ Database: ${database_name}\n` +
                  `📊 Collections: ${collections.length}\n` +
                  `📝 Sample Data: ${data ? 'Inserted' : 'None'}\n` +
                  `🤖 Generated from description: ${description ? 'Yes' : 'No'}`;

      if (open_tool) {
        try {
          const toolResult = await openDatabaseTool('mongodb', {
            host,
            port,
            database_name
          });
          result += `\n🔧 ${toolResult}`;
        } catch (toolError) {
          result += `\n⚠️ Could not open MongoDB tool: ${toolError.message}`;
        }
      }

      return result;

    } catch (error) {
      if (client) await client.close();
      throw error;
    }
  }

  static async createMySQLDatabase(args) {
    const {
      database_name,
      host = 'localhost',
      port = 3306,
      username = 'root',
      password,
      initial_schema,
      sample_data,
      overwrite = false,
      description,
      open_tool = true
    } = args;

    if (!password) {
      return "❌ MySQL password is required";
    }
    let schema = initial_schema;
    let data = sample_data;
    
    if (description && !initial_schema) {
      const generated = generateSchemaFromDescription(description, 'mysql');
      if (generated) {
        schema = generated.schema.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'INT AUTO_INCREMENT PRIMARY KEY');
        data = generated.data;
      }
    }

    const connection = await mysql.createConnection({
      host,
      port,
      user: username,
      password
    });

    try {
      const [rows] = await connection.execute(
        'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
        [database_name]
      );

      if (rows.length > 0 && !overwrite) {
        await connection.end();
        return `❌ MySQL database '${database_name}' already exists. Use overwrite: true to replace it.`;
      }

      if (rows.length > 0 && overwrite) {
        await connection.execute(`DROP DATABASE \`${database_name}\``);
      }

      await connection.execute(`CREATE DATABASE \`${database_name}\``);
      await connection.execute(`USE \`${database_name}\``);

      if (schema) {
        const statements = schema.split(';').filter(s => s.trim());
        for (const statement of statements) {
          if (statement.trim()) {
            await connection.execute(statement);
          }
        }
      }

      if (data) {
        const statements = data.split(';').filter(s => s.trim());
        for (const statement of statements) {
          if (statement.trim()) {
            await connection.execute(statement);
          }
        }
      }

      await connection.end();

      let result = `🎉 MySQL database created successfully!\n` +
                  `📍 Host: ${host}:${port}\n` +
                  `🗄️ Database: ${database_name}\n` +
                  `👤 User: ${username}\n` +
                  `📊 Schema: ${schema ? 'Applied' : 'None'}\n` +
                  `📝 Sample Data: ${data ? 'Inserted' : 'None'}\n` +
                  `🤖 Generated from description: ${description ? 'Yes' : 'No'}`;

      if (open_tool) {
        try {
          const toolResult = await openDatabaseTool('mysql', {
            host,
            port,
            database_name,
            username
          });
          result += `\n🔧 ${toolResult}`;
        } catch (toolError) {
          result += `\n⚠️ Could not open MySQL tool: ${toolError.message}`;
        }
      }

      return result;

    } catch (error) {
      await connection.end();
      throw error;
    }
  }
}

class QueryExecutor {
  static async querySQLite(args) {
    const { database_path, query, params = [] } = args;
    const db = await ConnectionManager.getSQLiteConnection(database_path);
    
    return new Promise((resolve, reject) => {
      const isSelect = query.trim().toLowerCase().startsWith('select');
      
      if (isSelect) {
        db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve({
            type: 'select',
            rowCount: rows.length,
            data: formatTableResults(rows),
            raw: rows
          });
        });
      } else {
        db.run(query, params, function(err) {
          if (err) reject(err);
          else resolve({
            type: 'modify',
            changes: this.changes,
            lastID: this.lastID,
            data: `Query executed successfully. Changes: ${this.changes}, Last ID: ${this.lastID}`
          });
        });
      }
    });
  }

  static async queryPostgreSQL(args) {
    const { host = 'localhost', port = 5432, database, username, password, query, params = [] } = args;
    
    const config = { host, port, database, user: username, password };
    const client = await ConnectionManager.getPostgresConnection(config);
    
    try {
      const result = await client.query(query, params);
      
      if (result.rows) {
        return {
          type: 'select',
          rowCount: result.rows.length,
          data: formatTableResults(result.rows),
          raw: result.rows
        };
      } else {
        return {
          type: 'modify',
          rowCount: result.rowCount,
          data: `Query executed successfully. Rows affected: ${result.rowCount}`
        };
      }
    } catch (error) {
      throw error;
    }
  }

  static async queryMongoDB(args) {
    const { 
      host = 'localhost', 
      port = 27017, 
      database, 
      username, 
      password,
      collection,
      operation,
      filter = {},
      document,
      update,
      options = {},
      force_new_connection = false 
    } = args;

    const connectionUri = `mongodb://${username && password ? `${username}:${password}@` : ''}${host}:${port}`;
    const config = { host, port, database, connectionUri };
    const { client, db } = await ConnectionManager.getMongoConnection(config,force_new_connection);

    try {
      const coll = db.collection(collection);
      let result;

      switch (operation) {
        case 'find':
          result = await coll.find(filter, options).toArray();
          return {
            type: 'find',
            count: result.length,
            data: formatMongoResults(result),
            raw: result
          };

        case 'insertOne':
          result = await coll.insertOne(document);
          return {
            type: 'insert',
            insertedId: result.insertedId,
            data: `Document inserted with ID: ${result.insertedId}`
          };

        case 'insertMany':
          result = await coll.insertMany(document);
          return {
            type: 'insert',
            insertedCount: result.insertedCount,
            data: `${result.insertedCount} documents inserted`
          };

        case 'updateOne':
          result = await coll.updateOne(filter, update, options);
          return {
            type: 'update',
            modifiedCount: result.modifiedCount,
            data: `${result.modifiedCount} document(s) updated`
          };

        case 'deleteOne':
          result = await coll.deleteOne(filter);
          return {
            type: 'delete',
            deletedCount: result.deletedCount,
            data: `${result.deletedCount} document(s) deleted`
          };

        case 'aggregate':
          result = await coll.aggregate(filter).toArray();
          return {
            type: 'aggregate',
            count: result.length,
            data: formatMongoResults(result),
            raw: result
          };

        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }
    } catch (error) {
      throw error;
    }
  }

  static async queryMySQL(args) {
    const { host = 'localhost', port = 3306, database, username, password, query, params = [] } = args;
    
    const config = { host, port, database, user: username, password };
    const connection = await ConnectionManager.getMySQLConnection(config);
    
    try {
      const [rows, fields] = await connection.execute(query, params);
      
      if (Array.isArray(rows) && rows.length > 0 && typeof rows[0] === 'object') {
        return {
          type: 'select',
          rowCount: rows.length,
          data: formatTableResults(rows),
          raw: rows
        };
      } else {
        return {
          type: 'modify',
          affectedRows: rows.affectedRows || 0,
          insertId: rows.insertId || null,
          data: `Query executed successfully. Affected rows: ${rows.affectedRows || 0}`
        };
      }
    } catch (error) {
      throw error;
    }
  }
}

class CSVExporter {
  static async exportTableToCSV(args) {
    let pool;
    try {
      pool = await ConnectionManager.getPostgresPool(args);
      
      const query = args.limit 
        ? `SELECT * FROM ${args.table_name} LIMIT ${args.limit}`
        : `SELECT * FROM ${args.table_name}`;
      
      const result = await pool.query(query);
      
      if (result.rows.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `⚠️  Table '${args.table_name}' is empty or doesn't exist.`
            }
          ]
        };
      }

      // Setup output path - default to desktop
      const defaultDesktopPath = 'C:\\Users\\avbha\\OneDrive\\Desktop';
      const outputDir = args.output_path ? path.dirname(args.output_path) : defaultDesktopPath;
      const filename = args.output_path ? path.basename(args.output_path) : `${args.table_name}_export.csv`;
      const fullPath = path.join(outputDir, filename);

      await ensureDirectoryExists(outputDir);

      const columns = Object.keys(result.rows[0]);
      const csvWriter = createObjectCsvWriter({
        path: fullPath,
        header: columns.map(col => ({ id: col, title: col })),
        append: false
      });

      await csvWriter.writeRecords(result.rows);

      // Read the CSV content to display in Claude
      const csvContent = await fs.promises.readFile(fullPath, 'utf-8');
      const previewRows = csvContent.split('\n').slice(0, 11).join('\n'); // Show first 10 data rows + header
      const totalLines = csvContent.split('\n').length - 1; // -1 for empty last line

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully exported ${result.rows.length} rows from table '${args.table_name}' to: ${fullPath}\n\n📊 Columns exported: ${columns.join(', ')}\n📁 File size: ${await getFileSize(fullPath)}\n\n📋 CSV Preview (first 10 rows):\n\`\`\`csv\n${previewRows}${totalLines > 11 ? '\n... and ' + (totalLines - 11) + ' more rows' : ''}\n\`\`\``
          }
        ]
      };

    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to export table: ${error.message}`
      );
    } finally {
      if (pool) {
        await pool.end();
      }
    }
  }

  static async exportQueryToCSV(args) {
    let pool;
    try {
      pool = await ConnectionManager.getPostgresPool(args);
      
      const result = await pool.query(args.query);
      
      if (result.rows.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `⚠️  Query returned no results.`
            }
          ]
        };
      }

      // Setup output path - default to desktop
      const defaultDesktopPath = 'C:\\Users\\avbha\\OneDrive\\Desktop';
      const outputDir = args.output_path ? path.dirname(args.output_path) : defaultDesktopPath;
      const filename = args.filename || args.output_path 
        ? (args.filename || path.basename(args.output_path))
        : `query_export_${Date.now()}.csv`;
      const fullPath = path.join(outputDir, filename);

      await ensureDirectoryExists(outputDir);

      const columns = Object.keys(result.rows[0]);
      const csvWriter = createObjectCsvWriter({
        path: fullPath,
        header: columns.map(col => ({ id: col, title: col })),
        append: false
      });

      await csvWriter.writeRecords(result.rows);

      // Read the CSV content to display in Claude
      const csvContent = await fs.promises.readFile(fullPath, 'utf-8');
      const previewRows = csvContent.split('\n').slice(0, 11).join('\n'); // Show first 10 data rows + header
      const totalLines = csvContent.split('\n').length - 1; // -1 for empty last line

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully exported ${result.rows.length} rows from query to: ${fullPath}\n\n📊 Columns exported: ${columns.join(', ')}\n📁 File size: ${await getFileSize(fullPath)}\n\n🔍 Query executed:\n\`\`\`sql\n${args.query}\n\`\`\`\n\n📋 CSV Preview (first 10 rows):\n\`\`\`csv\n${previewRows}${totalLines > 11 ? '\n... and ' + (totalLines - 11) + ' more rows' : ''}\n\`\`\``
          }
        ]
      };

    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to export query: ${error.message}`
      );
    } finally {
      if (pool) {
        await pool.end();
      }
    }
  }

  static async listDatabaseTables(args) {
    let pool;
    try {
      pool = await ConnectionManager.getPostgresPool(args);
      
      const query = `
        SELECT 
          table_name,
          table_type,
          table_schema
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
      `;
      
      const result = await pool.query(query);
      
      if (result.rows.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `📋 No tables found in database '${args.database}'.`
            }
          ]
        };
      }

      const tableList = result.rows
        .map(row => `• ${row.table_name} (${row.table_type})`)
        .join('\n');

      return {
        content: [
          {
            type: "text",
            text: `📋 Tables in database '${args.database}':\n\n${tableList}\n\n📊 Total tables: ${result.rows.length}`
          }
        ]
      };

    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list tables: ${error.message}`
      );
    } finally {
      if (pool) {
        await pool.end();
      }
    }
  }

  static async exportAllTablesToCSV(args) {
    let pool;
    try {
      pool = await ConnectionManager.getPostgresPool(args);
      
      const tablesQuery = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
      `;
      
      const tablesResult = await pool.query(tablesQuery);
      
      if (tablesResult.rows.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `📋 No tables found in database '${args.database}'.`
            }
          ]
        };
      }

      // Use desktop path if not specified
      const exportDir = args.output_directory || 'C:\\Users\\avbha\\OneDrive\\Desktop\\db_exports';
      await ensureDirectoryExists(exportDir);
      
      const exportResults = [];
      let totalRows = 0;
      let csvPreviews = [];

      for (const tableRow of tablesResult.rows) {
        const tableName = tableRow.table_name;
        
        try {
          const dataResult = await pool.query(`SELECT * FROM ${tableName}`);
          
          if (dataResult.rows.length > 0) {
            const columns = Object.keys(dataResult.rows[0]);
            const csvPath = path.join(exportDir, `${tableName}.csv`);
            
            const csvWriter = createObjectCsvWriter({
              path: csvPath,
              header: columns.map(col => ({ id: col, title: col })),
              append: false
            });

            await csvWriter.writeRecords(dataResult.rows);
            
            // Read first few rows for preview
            const csvContent = await fs.promises.readFile(csvPath, 'utf-8');
            const previewRows = csvContent.split('\n').slice(0, 4).join('\n'); // Header + 3 data rows
            csvPreviews.push(`\n**${tableName}.csv** (${dataResult.rows.length} rows):\n\`\`\`csv\n${previewRows}\n${dataResult.rows.length > 3 ? '...' : ''}\n\`\`\``);
            
            exportResults.push(`✅ ${tableName}: ${dataResult.rows.length} rows → ${tableName}.csv`);
            totalRows += dataResult.rows.length;
          } else {
            exportResults.push(`⚠️  ${tableName}: Empty table (skipped)`);
          }
        } catch (tableError) {
          exportResults.push(`❌ ${tableName}: Error - ${tableError.message}`);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `🗂️  Bulk Export Complete!\n\n${exportResults.join('\n')}\n\n📊 Summary:\n• Total tables processed: ${tablesResult.rows.length}\n• Total rows exported: ${totalRows}\n• Export directory: ${exportDir}\n\n📋 CSV Previews:${csvPreviews.join('')}`
          }
        ]
      };

    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to export all tables: ${error.message}`
      );
    } finally {
      if (pool) {
        await pool.end();
      }
    }
  }
}

const DATABASE_TEMPLATES = {
  blog: {
    sqlite: {
      schema: `
        CREATE TABLE posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          author TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE comments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER NOT NULL,
          author TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (post_id) REFERENCES posts(id)
        );
        
        CREATE TABLE categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL
        );
        
        CREATE TABLE post_categories (
          post_id INTEGER,
          category_id INTEGER,
          PRIMARY KEY (post_id, category_id),
          FOREIGN KEY (post_id) REFERENCES posts(id),
          FOREIGN KEY (category_id) REFERENCES categories(id)
        );
      `,
      data: `
        INSERT INTO categories (name) VALUES ('Technology'), ('Lifestyle'), ('Travel');
        INSERT INTO posts (title, content, author) VALUES 
          ('Welcome to My Blog', 'This is my first post!', 'John Doe'),
          ('SQLite is Amazing', 'I love working with databases.', 'Jane Smith');
        INSERT INTO comments (post_id, author, content) VALUES 
          (1, 'Alice', 'Great first post!'),
          (2, 'Bob', 'I agree, databases are cool!');
      `
    }
  },
  ecommerce: {
    sqlite: {
      schema: `
        CREATE TABLE products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          price DECIMAL(10,2) NOT NULL,
          stock INTEGER DEFAULT 0,
          category TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          phone TEXT,
          address TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER NOT NULL,
          total DECIMAL(10,2) NOT NULL,
          status TEXT DEFAULT 'pending',
          order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (customer_id) REFERENCES customers(id)
        );
        
        CREATE TABLE order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL,
          product_id INTEGER NOT NULL,
          quantity INTEGER NOT NULL,
          price DECIMAL(10,2) NOT NULL,
          FOREIGN KEY (order_id) REFERENCES orders(id),
          FOREIGN KEY (product_id) REFERENCES products(id)
        );
      `,
      data: `
        INSERT INTO products (name, description, price, stock, category) VALUES 
          ('Laptop', 'High-performance laptop', 999.99, 10, 'Electronics'),
          ('Smartphone', 'Latest smartphone', 699.99, 25, 'Electronics'),
          ('Coffee Mug', 'Ceramic coffee mug', 12.99, 100, 'Home');
        
        INSERT INTO customers (name, email, phone, address) VALUES 
          ('Alice Johnson', 'alice@email.com', '123-456-7890', '123 Main St'),
          ('Bob Smith', 'bob@email.com', '098-765-4321', '456 Oak Ave');
      `
    }
  }
};

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // DATABASE CREATION TOOLS
      {
        name: "create_sqlite_database",
        description: "Create a new SQLite database with optional schema and data",
        inputSchema: {
          type: "object",
          properties: {
            database_name: { type: "string", description: "Name for the database" },
            database_path: { type: "string", description: "Path to create database (optional)" },
            initial_schema: { type: "string", description: "SQL schema to initialize" },
            sample_data: { type: "string", description: "SQL INSERT statements" },
            description: { type: "string", description: "Natural language description to auto-generate schema" },
            overwrite: { type: "boolean", description: "Overwrite if exists (default: false)" },
            open_tool: { type: "boolean", description: "Open SQLite management tool after creation (default: true)" }
          },
          required: ["database_name"]
        }
      },
      {
        name: "create_postgresql_database",
        description: "Create a new PostgreSQL database and optionally open pgAdmin",
        inputSchema: {
          type: "object",
          properties: {
            database_name: { type: "string", description: "Name for the database" },
            host: { type: "string", description: "PostgreSQL host (default: localhost)" },
            port: { type: "number", description: "PostgreSQL port (default: 5432)" },
            username: { type: "string", description: "Username (default: postgres)" },
            password: { type: "string", description: "Password (required)" },
            initial_schema: { type: "string", description: "SQL schema to initialize" },
            sample_data: { type: "string", description: "SQL INSERT statements" },
            description: { type: "string", description: "Natural language description to auto-generate schema" },
            overwrite: { type: "boolean", description: "Overwrite if exists (default: false)" },
            open_tool: { type: "boolean", description: "Open pgAdmin after creation (default: true)" }
          },
          required: ["database_name", "password"]
        }
      },
      {
        name: "create_mongodb_database",
        description: "Create a new MongoDB database and optionally open MongoDB Compass",
        inputSchema: {
          type: "object",
          properties: {
            database_name: { type: "string", description: "Name for the database" },
            connection_string: { type: "string", description: "Full MongoDB connection string (optional)" },
            host: { type: "string", description: "MongoDB host (default: localhost)" },
            port: { type: "number", description: "MongoDB port (default: 27017)" },
            username: { type: "string", description: "Username (optional)" },
            password: { type: "string", description: "Password (optional)" },
            initial_collections: { 
              type: "array", 
              items: { type: "string" },
              description: "Array of collection names to create" 
            },
            sample_data: { 
              type: "object", 
              description: "Object with collection names as keys, documents arrays as values" 
            },
            description: { type: "string", description: "Natural language description to auto-generate collections" },
            overwrite: { type: "boolean", description: "Overwrite if exists (default: false)" },
            open_tool: { type: "boolean", description: "Open MongoDB Compass after creation (default: true)" }
          },
          required: ["database_name"]
        }
      },
      {
        name: "create_mysql_database",
        description: "Create a new MySQL database and optionally open MySQL Workbench",
        inputSchema: {
          type: "object",
          properties: {
            database_name: { type: "string", description: "Name for the database" },
            host: { type: "string", description: "MySQL host (default: localhost)" },
            port: { type: "number", description: "MySQL port (default: 3306)" },
            username: { type: "string", description: "Username (default: root)" },
            password: { type: "string", description: "Password (required)" },
            initial_schema: { type: "string", description: "SQL schema to initialize" },
            sample_data: { type: "string", description: "SQL INSERT statements" },
            description: { type: "string", description: "Natural language description to auto-generate schema" },
            overwrite: { type: "boolean", description: "Overwrite if exists (default: false)" },
            open_tool: { type: "boolean", description: "Open MySQL Workbench after creation (default: true)" }
          },
          required: ["database_name", "password"]
        }
      },
      {
        name: "open_database_tool",
        description: "Open the appropriate visual management tool for a database",
        inputSchema: {
          type: "object",
          properties: {
            database_type: { 
              type: "string", 
              description: "Database type: sqlite, postgresql, mysql, mongodb" 
            },
            connection_config: { 
              type: "object", 
              description: "Database connection configuration" 
            }
          },
          required: ["database_type"]
        }
      },

      // QUERY EXECUTION TOOLS
      {
        name: "query_sqlite",
        description: "Execute SQL queries on SQLite database",
        inputSchema: {
          type: "object",
          properties: {
            database_path: { type: "string", description: "Path to SQLite database file" },
            query: { type: "string", description: "SQL query to execute" },
            params: { type: "array", description: "Query parameters (optional)", items: { type: "string" } }
          },
          required: ["database_path", "query"]
        }
      },
      {
        name: "query_postgresql",
        description: "Execute SQL queries on PostgreSQL database",
        inputSchema: {
          type: "object",
          properties: {
            host: { type: "string", description: "PostgreSQL host (default: localhost)" },
            port: { type: "number", description: "PostgreSQL port (default: 5432)" },
            database: { type: "string", description: "Database name" },
            username: { type: "string", description: "Username" },
            password: { type: "string", description: "Password" },
            query: { type: "string", description: "SQL query to execute" },
            params: { type: "array", description: "Query parameters (optional)" }
          },
          required: ["database", "username", "password", "query"]
        }
      },
      {
        name: "query_mysql", 
        description: "Execute SQL queries on MySQL database",
        inputSchema: {
          type: "object",
          properties: {
            host: { type: "string", description: "MySQL host (default: localhost)" },
            port: { type: "number", description: "MySQL port (default: 3306)" },
            database: { type: "string", description: "Database name" },
            username: { type: "string", description: "Username" },
            password: { type: "string", description: "Password" },
            query: { type: "string", description: "SQL query to execute" },
            params: { type: "array", description: "Query parameters (optional)" }
          },
          required: ["database", "username", "password", "query"]
        }
      },
      {
        name: "query_mongodb",
        description: "Execute operations on MongoDB database",
        inputSchema: {
          type: "object",
          properties: {
            host: { type: "string", description: "MongoDB host (default: localhost)" },
            port: { type: "number", description: "MongoDB port (default: 27017)" },
            database: { type: "string", description: "Database name" },
            username: { type: "string", description: "Username (optional)" },
            password: { type: "string", description: "Password (optional)" },
            collection: { type: "string", description: "Collection name" },
            operation: { 
              type: "string", 
              description: "Operation: find, insertOne, insertMany, updateOne, deleteOne, aggregate" 
            },
            filter: { type: "object", description: "Query filter/pipeline for aggregate (optional)" },
            document: { type: "object", description: "Document to insert/update (optional)" },
            update: { type: "object", description: "Update operations (optional)" },
            options: { type: "object", description: "Additional options (optional)" }
          },
          required: ["database", "collection", "operation"]
        }
      },

      // CSV EXPORT TOOLS - Enhanced with desktop path and preview
      {
        name: "export_table_to_csv",
        description: "Export a PostgreSQL table to CSV file on desktop with preview",
        inputSchema: {
          type: "object",
          properties: {
            host: {
              type: "string",
              description: "Database host",
              default: "localhost"
            },
            port: {
              type: "number",
              description: "Database port",
              default: 5432
            },
            database: {
              type: "string",
              description: "Database name",
            },
            username: {
              type: "string",
              description: "Database username",
              default: "postgres"
            },
            password: {
              type: "string",
              description: "Database password",
            },
            table_name: {
              type: "string",
              description: "Name of the table to export",
            },
            limit: {
              type: "number",
              description: "Maximum number of rows to export (optional)",
            },
            output_path: {
              type: "string",
              description: "Full path for the output CSV file (optional, defaults to desktop)",
            },
            include_headers: {
              type: "boolean",
              description: "Include column headers in CSV files",
              default: true
            }
          },
          required: ["database", "password", "table_name"],
        }
      },
      {
        name: "export_query_to_csv",
        description: "Export PostgreSQL query results to CSV file with preview",
        inputSchema: {
          type: "object",
          properties: {
            host: {
              type: "string",
              description: "Database host",
              default: "localhost"
            },
            port: {
              type: "number",
              description: "Database port",
              default: 5432
            },
            database: {
              type: "string",
              description: "Database name",
            },
            username: {
              type: "string",
              description: "Database username",
              default: "postgres"
            },
            password: {
              type: "string",
              description: "Database password",
            },
            query: {
              type: "string",
              description: "SQL query to execute and export",
            },
            filename: {
              type: "string",
              description: "Output filename (optional)",
            },
            output_path: {
              type: "string",
              description: "Full path for the output CSV file (optional, defaults to desktop)",
            }
          },
          required: ["database", "password", "query"],
        }
      },
      {
        name: "list_database_tables",
        description: "List all tables in a PostgreSQL database",
        inputSchema: {
          type: "object",
          properties: {
            host: {
              type: "string",
              description: "Database host",
              default: "localhost"
            },
            port: {
              type: "number",
              description: "Database port",
              default: 5432
            },
            database: {
              type: "string",
              description: "Database name",
            },
            username: {
              type: "string",
              description: "Database username",
              default: "postgres"
            },
            password: {
              type: "string",
              description: "Database password",
            }
          },
          required: ["database", "password"],
        }
      },
      {
        name: "export_all_tables_to_csv",
        description: "Export all tables in a PostgreSQL database to CSV files",
        inputSchema: {
          type: "object",
          properties: {
            host: {
              type: "string",
              description: "Database host",
              default: "localhost"
            },
            port: {
              type: "number",
              description: "Database port",
              default: 5432
            },
            database: {
              type: "string",
              description: "Database name",
            },
            username: {
              type: "string",
              description: "Database username",
              default: "postgres"
            },
            password: {
              type: "string",
              description: "Database password",
            },
            output_directory: {
              type: "string",
              description: "Output directory for CSV files",
              default: "C:\\Users\\avbha\\OneDrive\\Desktop\\db_exports"
            }
          },
          required: ["database", "password"],
        }
      },

      // CONNECTION MANAGEMENT TOOLS
      {
        name: "list_active_connections",
        description: "List all active database connections",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "close_connections",
        description: "Close specific or all database connections",
        inputSchema: {
          type: "object",
          properties: {
            database_type: { type: "string", description: "Database type to close (optional, closes all if not specified)" },
            connection_id: { type: "string", description: "Specific connection ID to close (optional)" }
          },
          required: []
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // DATABASE CREATION HANDLERS
      case "create_sqlite_database": {
        const result = await DatabaseCreator.createSQLiteDatabase(args);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "create_postgresql_database": {
        const result = await DatabaseCreator.createPostgreSQLDatabase(args);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "create_mongodb_database": {
        const result = await DatabaseCreator.createMongoDatabase(args);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "create_mysql_database": {
        const result = await DatabaseCreator.createMySQLDatabase(args);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      case "open_database_tool": {
        const { database_type, connection_config = {} } = args;
        const result = await openDatabaseTool(database_type, connection_config);
        return {
          content: [{ type: "text", text: result }]
        };
      }

      // QUERY EXECUTION HANDLERS
      case "query_sqlite": {
        const result = await QueryExecutor.querySQLite(args);
        return {
          content: [{ 
            type: "text", 
            text: `📊 SQLite Query Result:\n\n${result.data}\n\n💡 Type: ${result.type} | Rows: ${result.rowCount || result.changes || 0}` 
          }]
        };
      }

      case "query_postgresql": {
        const result = await QueryExecutor.queryPostgreSQL(args);
        return {
          content: [{ 
            type: "text", 
            text: `📊 PostgreSQL Query Result:\n\n${result.data}\n\n💡 Type: ${result.type} | Rows: ${result.rowCount || 0}` 
          }]
        };
      }

      case "query_mysql": {
        const result = await QueryExecutor.queryMySQL(args);
        return {
          content: [{ 
            type: "text", 
            text: `📊 MySQL Query Result:\n\n${result.data}\n\n💡 Type: ${result.type} | Rows: ${result.rowCount || result.affectedRows || 0}` 
          }]
        };
      }

      case "query_mongodb": {
        const result = await QueryExecutor.queryMongoDB(args);
        return {
          content: [{ 
            type: "text", 
            text: `📊 MongoDB Operation Result:\n\n${result.data}\n\n💡 Operation: ${result.type} | Count: ${result.count || result.insertedCount || result.modifiedCount || result.deletedCount || 0}` 
          }]
        };
      }

      // CSV EXPORT HANDLERS - Enhanced with desktop path and preview
      case "export_table_to_csv": {
        const result = await CSVExporter.exportTableToCSV(args);
        return result;
      }

      case "export_query_to_csv": {
        const result = await CSVExporter.exportQueryToCSV(args);
        return result;
      }

      case "list_database_tables": {
        const result = await CSVExporter.listDatabaseTables(args);
        return result;
      }

      case "export_all_tables_to_csv": {
        const result = await CSVExporter.exportAllTablesToCSV(args);
        return result;
      }

      // CONNECTION MANAGEMENT HANDLERS
      case "list_active_connections": {
        let connectionInfo = "🔗 Active Database Connections:\n\n";
        
        for (const [dbType, connectionMap] of Object.entries(connections)) {
          connectionInfo += `${dbType.toUpperCase()}:\n`;
          if (connectionMap.size === 0) {
            connectionInfo += "  No active connections\n";
          } else {
            for (const [connId, conn] of connectionMap.entries()) {
              const lastUsed = new Date(conn.lastUsed).toLocaleString();
              connectionInfo += `  • ${connId} (last used: ${lastUsed})\n`;
            }
          }
          connectionInfo += "\n";
        }

        return {
          content: [{ type: "text", text: connectionInfo }]
        };
      }

      case "close_connections": {
        const { database_type, connection_id } = args;
        let closed = 0;

        if (database_type && connection_id) {
          const connMap = connections[database_type];
          if (connMap && connMap.has(connection_id)) {
            const conn = connMap.get(connection_id);
            try {
              if (database_type === 'sqlite' && conn.db) conn.db.close();
              else if (database_type === 'postgres' && conn.client) conn.client.end();
              else if (database_type === 'mongodb' && conn.client) conn.client.close();
              else if (database_type === 'mysql' && conn.connection) conn.connection.end();
              connMap.delete(connection_id);
              closed = 1;
            } catch (error) {
              console.error(`Error closing ${database_type} connection:`, error);
            }
          }
        } else if (database_type) {
          const connMap = connections[database_type];
          if (connMap) {
            for (const [id, conn] of connMap.entries()) {
              try {
                if (database_type === 'sqlite' && conn.db) conn.db.close();
                else if (database_type === 'postgres' && conn.client) conn.client.end();
                else if (database_type === 'mongodb' && conn.client) conn.client.close();
                else if (database_type === 'mysql' && conn.connection) conn.connection.end();
                closed++;
              } catch (error) {
                console.error(`Error closing ${database_type} connection:`, error);
              }
            }
            connMap.clear();
          }
        } else {
          for (const [dbType, connectionMap] of Object.entries(connections)) {
            for (const [id, conn] of connectionMap.entries()) {
              try {
                if (dbType === 'sqlite' && conn.db) conn.db.close();
                else if (dbType === 'postgres' && conn.client) conn.client.end();
                else if (dbType === 'mongodb' && conn.client) conn.client.close();
                else if (dbType === 'mysql' && conn.connection) conn.connection.end();
                closed++;
              } catch (error) {
                console.error(`Error closing ${dbType} connection:`, error);
              }
            }
            connectionMap.clear();
          }
        }

        return {
          content: [{ 
            type: "text", 
            text: `✅ Closed ${closed} database connection(s)` 
          }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ 
        type: "text", 
        text: `❌ Error executing ${name}: ${error.message}` 
      }],
      isError: true
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Enhanced Universal Database MCP Server Started!");
}

main().catch((error) => {
  console.error("❌ Server error:", error);
  process.exit(1);
});
