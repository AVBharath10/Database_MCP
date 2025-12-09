// testClient.js - Test the SQLite MCP Server
import { spawn } from "child_process";

const server = spawn("node", ["server.js"], {
  stdio: ["pipe", "pipe", "pipe"],
});

server.stderr.on("data", (data) => {
  console.log("Server:", data.toString().trim());
});

function sendRequest(request) {
  return new Promise((resolve) => {
    const requestStr = JSON.stringify(request) + "\n";
    
    const handleResponse = (data) => {
      try {
        const response = JSON.parse(data.toString().trim());
        server.stdout.off("data", handleResponse);
        resolve(response);
      } catch (e) {
        console.error("Parse error:", data.toString());
      }
    };
    
    server.stdout.on("data", handleResponse);
    server.stdin.write(requestStr);
  });
}

async function test() {
  console.log("🧪 Testing SQLite MCP Server - Phase 2...\n");

  try {
    // Test 1: Check database status (should be disconnected)
    const statusResponse1 = await sendRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "database_status",
        arguments: {}
      }
    });
    console.log("📋 Initial status:");
    console.log(statusResponse1.result.content[0].text);
    console.log();

    // Test 2: Connect to database
    const connectResponse = await sendRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "connect_database",
        arguments: { path: "sample.db" }
      }
    });
    console.log("🔌 Connection result:");
    console.log(connectResponse.result.content[0].text);
    console.log();

    // Test 3: Check status after connection
    const statusResponse2 = await sendRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "database_status",
        arguments: {}
      }
    });
    console.log("📋 Status after connection:");
    console.log(statusResponse2.result.content[0].text);
    console.log();

    // Test 4: Execute a SELECT query
    const queryResponse = await sendRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "execute_query",
        arguments: { sql: "SELECT * FROM users LIMIT 3" }
      }
    });
    console.log("📊 Query results:");
    console.log(queryResponse.result.content[0].text);
    console.log();

    
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    server.kill();
  }
}

test();