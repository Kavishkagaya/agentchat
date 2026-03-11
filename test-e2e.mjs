import WebSocket from "ws";

async function runTest() {
  const configId = "test_chat_123";
  const orgId = "test_org";
  
  console.log("1. Initializing chat via Orchestrator Dev Route...");
  const initRes = await fetch(`http://localhost:8789/dev/${configId}/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config_id: configId, type: "chat", org_id: orgId, config: { auto: true } })
  });
  
  const initData = await initRes.text();
  console.log("Init response:", initData);

  console.log("\n2. Connecting to WebSocket...");
  // Connect directly to the dev route
  const ws = new WebSocket(`ws://localhost:8789/dev/${configId}/ws`);
  
  let gotReady = false;
  let gotUserMessage = false;
  let textDeltas = 0;
  let gotFinal = false;

  ws.on("open", () => {
    console.log("WebSocket connected.");
  });

  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    console.log(`[WS Event] ${msg.type}`);
    
    if (msg.type === "ready") {
      gotReady = true;
      console.log("\n3. Sending message to agent...");
      // For testing, just trigger an error or a quick response
      ws.send(JSON.stringify({
        type: "message",
        text: "Hello!",
        agent_ids: ["some-agent"]
      }));
    }
    
    if (msg.type === "user_message_stored") gotUserMessage = true;
    if (msg.type === "text_delta") textDeltas++;
    if (msg.type === "agent_message") gotFinal = true;
    
    if (msg.type === "done" || msg.type === "error") {
      console.log("\nClosing WebSocket.");
      ws.close();
    }
  });

  ws.on("close", async () => {
    console.log("\n4. Fetching History...");
    const historyRes = await fetch(`http://localhost:8789/dev/${configId}/history`);
    const history = await historyRes.json();
    
    console.log(`History length: ${history.messages?.length}`);
    console.log("Test Summary:");
    console.log(`- Init OK: ${initRes.ok}`);
    console.log(`- WS Ready: ${gotReady}`);
    console.log(`- User Message Stored: ${gotUserMessage}`);
    console.log(`- Deltas Received: ${textDeltas}`);
    console.log(`- Final Agent Message: ${gotFinal}`);
    
    process.exit(0);
  });
}

runTest().catch(console.error);
