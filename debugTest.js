// debugTest.js - Let's debug this users table issue
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

async function debug() {
  console.log("🔍 Debugging Users Table Issue...\n");

  try {
    // Connect first
    await sendRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "connect_database",
        arguments: { path: "sample.db" }
      }
    });

    // Test 1: Try to get users table data
    console.log("1️⃣ Testing get_table_data for users:");
    const usersDataResponse = await sendRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "get_table_data",
        arguments: { table_name: "users", limit: 2 }
      }
    });
    console.log(usersDataResponse.result.content[0].text);
    console.log();

    // Test 2: Try raw SQL on users
    console.log("2️⃣ Testing raw SQL SELECT * FROM users:");
    const rawSqlResponse = await sendRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "execute_query",
        arguments: { sql: "SELECT * FROM users LIMIT 2" }
      }
    });
    console.log(rawSqlResponse.result.content[0].text);
    console.log();

    // Test 3: Try PRAGMA table_info manually
    console.log("3️⃣ Testing raw PRAGMA table_info(users):");
    const pragmaResponse = await sendRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "execute_query",
        arguments: { sql: "PRAGMA table_info(users)" }
      }
    });
    console.log(pragmaResponse.result.content[0].text);
    console.log();

    // Test 4: Try describe_table on products (which works)
    console.log("4️⃣ Testing describe_table on products (should work):");
    const productsDescribeResponse = await sendRequest({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "describe_table",
        arguments: { table_name: "products" }
      }
    });
    console.log(productsDescribeResponse.result.content[0].text);
    console.log();

    // Test 5: Try describe_table on users
    console.log("5️⃣ Testing describe_table on users (the failing one):");
    const usersDescribeResponse = await sendRequest({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "describe_table",
        arguments: { table_name: "users" }
      }
    });
    console.log(usersDescribeResponse.result.content[0].text);
    
  } catch (error) {
    console.error("❌ Debug failed:", error);
  } finally {
    server.kill();
  }
}

debug();