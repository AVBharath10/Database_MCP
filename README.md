# Universal Database MCP Server

A powerful Model Context Protocol (MCP) server that provides a unified interface for managing, querying, and visualizing multiple database types including SQLite, PostgreSQL, MySQL, and MongoDB.

## Features

- **Multi-Database Support**: Seamlessly work with SQLite, PostgreSQL, MySQL, and MongoDB.
- **Database Creation**: Create new databases with optional schemas and sample data (e.g., School System, Library Management, E-commerce).
- **Query Execution**: Execute SQL queries and MongoDB operations directly.
- **Data Export**: Export tables and query results to CSV format with a single tool call.
- **Connection Management**: Efficiently handle and monitor active database connections.
- **Visual Tools Integration**: Automatically launch management tools like pgAdmin, MySQL Workbench, MongoDB Compass, and DB Browser for SQLite.

## Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/AVBharath10/Database_MCP.git
    cd Database_MCP
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Prerequisites**:
    - Node.js (v16 or higher)
    - Installed database servers (PostgreSQL, MySQL, MongoDB) for their respective features.
    - Recommended visual tools: pgAdmin 4, MySQL Workbench, MongoDB Compass, DB Browser for SQLite.

## Usage

To start the MCP server:

```bash
node server.js
```

### Configuring with Claude Desktop

Add the server configuration to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "database-mcp": {
      "command": "node",
      "args": ["C:/path/to/Database_MCP/server.js"]
    }
  }
}
```

## Available Tools

### Database Creation
- **`create_sqlite_database`**: Create a SQLite database file.
- **`create_postgresql_database`**: Create a PostgreSQL database.
- **`create_mysql_database`**: Create a MySQL database.
- **`create_mongodb_database`**: Create a MongoDB database.
    - *Common Parameters*: `database_name`, `initial_schema`, `sample_data`, `description` (for auto-generated schemas), `overwrite`.

### Query Execution
- **`query_sqlite`**: specific to SQLite files.
- **`query_postgresql`**: Run SQL queries on Postgres.
- **`query_mysql`**: Run SQL queries on MySQL.
- **`query_mongodb`**: Perform `find`, `insert`, `update`, `delete`, or `aggregate` operations.

### Data Export & Visualization
- **`export_table_to_csv`**: Export a specific table to a CSV file.
- **`export_query_to_csv`**: Export the results of a custom query to CSV.
- **`export_all_tables_to_csv`**: Bulk export all tables in a database.
- **`list_database_tables`**: Get a list of all tables in a database.
- **`open_database_tool`**: Launch the associated GUI tool for the database.

### Connection Management
- **`list_active_connections`**: View currently open database connections.
- **`close_connections`**: Close one or all database connections to free up resources.