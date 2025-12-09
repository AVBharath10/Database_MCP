# Database MCP Server - Interview Preparation Guide

## Project Overview

**What is this project?**
This is a "Universal Database MCP Server" - a Model Context Protocol (MCP) server that provides a unified interface for database operations across multiple database systems (SQLite, PostgreSQL, MySQL, MongoDB). It acts as a bridge between AI assistants (like Claude) and various database systems, enabling natural language database interactions.

**Key Purpose:**

- Enable AI assistants to perform database operations through standardized tools
- Support multiple database types with a consistent API
- Provide database creation, querying, and data export capabilities
- Include visual database management tool integration

## Technology Stack

### Core Technologies

- **Runtime:** Node.js with ES modules (`"type": "module"`)
- **Protocol:** Model Context Protocol (MCP) SDK v1.0.0
- **Communication:** JSON-RPC 2.0 over stdio (standard input/output)

### Database Drivers

- **SQLite:** `sqlite3` v5.1.6 - Embedded database
- **PostgreSQL:** `pg` v8.16.3 - Advanced open-source RDBMS
- **MySQL:** `mysql2` v3.14.4 - Popular relational database
- **MongoDB:** `mongodb` v6.19.0 - NoSQL document database

### Additional Dependencies

- **CSV Export:** `csv-writer` v1.6.0 - For data export functionality
- **Environment:** `dotenv` v16.4.5 - Configuration management
- **System Integration:** Built-in Node.js modules (`fs`, `path`, `child_process`, `exec`)

## Architecture Overview

### Server Structure

```javascript
// Main server initialization
const server = new Server(
  {
    name: "universal-database-creator",
    version: "3.3.0",
  },
  {
    capabilities: { tools: {} },
  }
);
```

### Connection Management System

The server implements a sophisticated connection pooling system:

```javascript
let connections = {
  sqlite: new Map(),
  postgres: new Map(),
  mongodb: new Map(),
  mysql: new Map(),
};
```

**Features:**

- Automatic connection cleanup (5-minute timeout)
- Connection reuse to improve performance
- Type-specific connection handling
- Memory-efficient connection management

### Tool Organization

The server exposes 18 different tools organized into categories:

1. **Database Creation Tools** (4 tools)

   - `create_sqlite_database`
   - `create_postgresql_database`
   - `create_mongodb_database`
   - `create_mysql_database`

2. **Query Execution Tools** (4 tools)

   - `query_sqlite`, `query_postgresql`, `query_mysql`, `query_mongodb`

3. **CSV Export Tools** (4 tools)

   - `export_table_to_csv`, `export_query_to_csv`
   - `list_database_tables`, `export_all_tables_to_csv`

4. **Utility Tools** (3 tools)
   - `open_database_tool`, `list_active_connections`, `close_connections`

## Key Features & Implementation

### 1. Database Creation with Schema Generation

**Smart Schema Generation:**
The server can generate database schemas from natural language descriptions:

```javascript
const generateSchemaFromDescription = (description, dbType = "sqlite") => {
  const schemas = {
    "school system": {
      sqlite: {
        schema: `CREATE TABLE students (...)`,
        data: `INSERT INTO students (...)`,
      },
    },
  };
  // Returns appropriate schema based on description
};
```

**Example Usage:**

```javascript
// Natural language database creation
await DatabaseCreator.createSQLiteDatabase({
  database_name: "school_db",
  description: "school system", // Auto-generates tables for students, teachers, classes
  open_tool: true, // Automatically opens DB Browser for SQLite
});
```

### 2. Unified Query Interface

**Cross-Database Query Support:**
Despite different database types, the server provides consistent query interfaces:

```javascript
// SQLite Query
const result = await QueryExecutor.querySQLite({
  database_path: "sample.db",
  query: "SELECT * FROM users",
  params: [],
});

// MongoDB Query
const result = await QueryExecutor.queryMongoDB({
  database: "mydb",
  collection: "users",
  operation: "find",
  filter: { age: { $gt: 25 } },
});
```

### 3. Visual Database Tool Integration

**Platform-Specific Tool Launching:**

```javascript
const openDatabaseTool = async (dbType, config) => {
  switch (dbType) {
    case "postgresql":
      return openPgAdmin(config);
    case "sqlite":
      return openSQLiteTool(config);
    case "mysql":
      return openMySQLWorkbench(config);
    case "mongodb":
      return openMongoTool(config);
  }
};
```

**Cross-Platform Support:**

- **Windows:** Uses `start` command and specific executable paths
- **macOS:** Uses `open -a` for applications
- **Linux:** Uses direct executable names or `xdg-open`

### 4. Advanced CSV Export System

**Smart Export with Previews:**

```javascript
// Export table with automatic preview generation
const result = await CSVExporter.exportTableToCSV({
  table_name: "users",
  limit: 100,
  output_path: "C:\\Users\\avbha\\OneDrive\\Desktop\\users.csv",
});
// Returns formatted preview + file location + size info
```

**Bulk Export Capabilities:**

- Export single tables or queries
- Export entire databases to multiple CSV files
- Automatic directory creation
- File size reporting

## Code Implementation Details

### Connection Manager Class

```javascript
class ConnectionManager {
  static async getSQLiteConnection(dbPath) {
    if (connections.sqlite.has(dbPath)) {
      const conn = connections.sqlite.get(dbPath);
      conn.lastUsed = Date.now();
      return conn.db;
    }
    // Create new connection with timestamp tracking
  }
}
```

**Benefits:**

- Prevents connection exhaustion
- Improves performance through reuse
- Automatic cleanup of stale connections
- Type-safe connection handling

### Database Creator Classes

**Template-Based Creation:**

```javascript
static async createSQLiteDatabase(args) {
  const { database_name, description, overwrite = false } = args;

  // Generate schema from description if provided
  if (description && !initial_schema) {
    const generated = generateSchemaFromDescription(description, 'sqlite');
    schema = generated.schema;
    data = generated.data;
  }

  // Execute schema and data insertion
  // Handle overwrite logic
  // Open management tool if requested
}
```

### Query Result Formatting

**Table Formatting for SQL Results:**

```javascript
const formatTableResults = (rows) => {
  const columns = Object.keys(rows[0]);
  const maxWidths = {};

  // Calculate column widths
  columns.forEach((col) => {
    maxWidths[col] = Math.max(
      col.length,
      ...rows.map((row) => String(row[col] || "").length)
    );
  });

  // Format as ASCII table
  const header = columns.map((col) => col.padEnd(maxWidths[col])).join(" | ");
  const separator = columns
    .map((col) => "-".repeat(maxWidths[col]))
    .join("-|-");
  // ... format data rows
};
```

**MongoDB Document Formatting:**

```javascript
const formatMongoResults = (documents) => {
  return documents
    .map(
      (doc, index) => `Document ${index + 1}:\n${JSON.stringify(doc, null, 2)}`
    )
    .join("\n\n");
};
```

## Testing Strategy

### Test File Structure

1. **`createSampleDB.js`** - Database setup

   - Creates sample SQLite database with `users` and `products` tables
   - Inserts test data for validation

2. **`testClient.js`** - Basic functionality testing

   - Tests connection establishment
   - Validates query execution
   - Checks server responses

3. **`debugTest.js`** - Issue debugging

   - Targeted debugging for specific problems
   - Compares working vs. failing operations

4. **`testPhase3.js`** - Schema exploration testing
   - Tests table listing and description
   - Validates index and data retrieval
   - Comprehensive schema validation

### Testing Approach

**MCP Protocol Testing:**

```javascript
// Spawn server process
const server = spawn("node", ["server.js"], {
  stdio: ["pipe", "pipe", "pipe"],
});

// Send JSON-RPC requests
function sendRequest(request) {
  const requestStr = JSON.stringify(request) + "\n";
  server.stdin.write(requestStr);
  // Handle response parsing
}
```

**Real-World Validation:**

- Tests actual database operations
- Validates file system interactions
- Checks external tool launching
- Verifies CSV export functionality

## Real-World Usage Examples

### 1. Database Creation Workflow

```javascript
// Create a school management database
const result = await create_sqlite_database({
  database_name: "school_management",
  description: "school system",
  open_tool: true,
});
// Result: Database created with students, teachers, classes tables
// DB Browser opens automatically
```

### 2. Query Execution

```javascript
// Query across different database types
const sqliteResult = await query_sqlite({
  database_path: "./data.db",
  query: "SELECT * FROM users WHERE age > ?",
  params: [21],
});

const mongoResult = await query_mongodb({
  database: "analytics",
  collection: "events",
  operation: "find",
  filter: { timestamp: { $gte: new Date("2024-01-01") } },
});
```

### 3. Data Export

```javascript
// Export PostgreSQL table to CSV
const exportResult = await export_table_to_csv({
  host: "localhost",
  database: "production",
  table_name: "user_activity",
  output_path: "~/Desktop/user_activity.csv",
});
// Result includes preview, file size, and location
```

## Interview Talking Points

### Project Complexity & Scale

- **Multi-Database Support:** Handles 4 different database paradigms (relational SQL + NoSQL)
- **Cross-Platform:** Works on Windows, macOS, Linux with platform-specific optimizations
- **Protocol Implementation:** Full MCP compliance with proper JSON-RPC handling
- **Production Features:** Connection pooling, timeout management, error handling

### Technical Challenges Solved

- **Connection Management:** Built custom pooling system due to MCP's stateless nature
- **Schema Generation:** Natural language to database schema conversion
- **Tool Integration:** Platform-specific executable launching for database GUIs
- **Result Formatting:** Consistent output formatting across different data types

### Architecture Decisions

- **MCP Protocol:** Chosen for AI assistant integration capabilities
- **ES Modules:** Modern JavaScript with tree-shaking benefits
- **Class-Based Design:** Clean separation of concerns (Creator, Executor, Exporter classes)
- **Async/Await:** Throughout for non-blocking database operations

### Performance Considerations

- Connection reuse prevents database exhaustion
- Streaming CSV export for large datasets
- Efficient result formatting with column width calculation
- Automatic cleanup prevents memory leaks

## Common Interview Questions & Answers

**Q: How does this differ from traditional database clients?**
A: This is an MCP server designed for AI assistants, not human users. It provides programmatic access through tools rather than GUI, enabling natural language database interactions.

**Q: Why support multiple database types?**
A: Enterprises use heterogeneous database environments. This server provides a unified interface, allowing AI assistants to work with any database type without learning type-specific APIs.

**Q: How do you handle connection management in a stateless protocol?**
A: Implemented a custom connection pooling system with timestamps. Connections are cached by database identifier and automatically cleaned up after 5 minutes of inactivity.

**Q: What makes the schema generation feature powerful?**
A: It understands natural language descriptions like "school system" or "library management" and generates complete database schemas with relationships, constraints, and sample data automatically.

**Q: How do you ensure cross-platform compatibility?**
A: Each database tool launcher has platform-specific command logic (Windows `start`, macOS `open -a`, Linux direct execution) with fallback methods for different installation scenarios.

---

**Remember to mention:** This project demonstrates full-stack development skills, database expertise, systems integration, cross-platform development, and understanding of modern AI integration protocols.
