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
  console.log("🔍 Testing Schema Explorer - Phase 3...\n");

  try {
    await sendRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "connect_database",
        arguments: { path: "sample.db" }
      }
    });
    const tablesResponse = await sendRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "list_tables",
        arguments: {}
      }
    });
    console.log("📋 Available Tables:");
    console.log(tablesResponse.result.content[0].text);
    console.log();
    const describeResponse = await sendRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "describe_table",
        arguments: { table_name: "users" }
      }
    });
    console.log("🔍 Users Table Structure:");
    console.log(describeResponse.result.content[0].text);
    console.log();
    const indexesResponse = await sendRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "show_indexes",
        arguments: { table_name: "users" }
      }
    });
    console.log("📋 Users Table Indexes:");
    console.log(indexesResponse.result.content[0].text);
    console.log();
    const dataResponse = await sendRequest({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "get_table_data",
        arguments: { table_name: "products", limit: 3 }
      }
    });
    console.log("📊 Products Table Preview:");
    console.log(dataResponse.result.content[0].text);
    console.log();
    const infoResponse = await sendRequest({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "database_info",
        arguments: {}
      }
    });
    console.log("📊 Database Information:");
    console.log(infoResponse.result.content[0].text);
    console.log();

    console.log("🎉 Phase 3 Complete! Schema Explorer working perfectly!");
    
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    server.kill();
  }
}

test();