"use client";

import { api } from "./trpc/client";
import { useChatStore } from "./store/chat";

export default function HomePage() {
  const {
    orgId,
    chatTitle,
    agentIdsInput,
    agentName,
    agentModel,
    agentSystemPrompt,
    activeChatId,
    messageDraft,
    setOrgId,
    setChatTitle,
    setAgentIdsInput,
    setAgentName,
    setAgentModel,
    setAgentSystemPrompt,
    setActiveChatId,
    setMessageDraft
  } = useChatStore();

  const chatsQuery = api.chat.list.useQuery({ orgId });
  const agentsQuery = api.agent.list.useQuery({ orgId });
  const chatQuery = api.chat.get.useQuery(
    { chatId: activeChatId ?? "" },
    { enabled: Boolean(activeChatId) }
  );
  const messagesQuery = api.chat.messages.useQuery(
    { chatId: activeChatId ?? "" },
    { enabled: Boolean(activeChatId) }
  );

  const createChat = api.chat.create.useMutation({
    onSuccess: (data) => {
      setChatTitle("");
      setAgentIdsInput("");
      setActiveChatId(data.chatId);
      chatsQuery.refetch();
    }
  });

  const addMessage = api.chat.addMessage.useMutation({
    onSuccess: () => {
      setMessageDraft("");
      messagesQuery.refetch();
    }
  });

  const approveSandbox = api.chat.approveSandbox.useMutation();
  const archiveChat = api.chat.archive.useMutation({
    onSuccess: () => {
      setActiveChatId(undefined);
      chatsQuery.refetch();
    }
  });

  const createAgent = api.agent.create.useMutation({
    onSuccess: () => {
      setAgentName("");
      setAgentSystemPrompt("You are a helpful agent.");
      agentsQuery.refetch();
    }
  });

  return (
    <main
      style={{
        padding: 32,
        fontFamily: "ui-sans-serif, system-ui",
        display: "grid",
        gap: 24
      }}
    >
      <header>
        <h1 style={{ margin: 0 }}>AgentChat</h1>
        <p style={{ margin: "8px 0 0" }}>tRPC + Zustand + Postgres</p>
      </header>

      <section style={{ display: "grid", gap: 12, maxWidth: 520 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Org ID</span>
          <input
            value={orgId}
            onChange={(event) => setOrgId(event.target.value)}
            placeholder="org_demo"
            style={{ padding: 8 }}
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Agent Name</span>
          <input
            value={agentName}
            onChange={(event) => setAgentName(event.target.value)}
            placeholder="Base helper"
            style={{ padding: 8 }}
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Agent Model</span>
          <input
            value={agentModel}
            onChange={(event) => setAgentModel(event.target.value)}
            placeholder="gpt-4o-mini"
            style={{ padding: 8 }}
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Agent System Prompt</span>
          <textarea
            value={agentSystemPrompt}
            onChange={(event) => setAgentSystemPrompt(event.target.value)}
            rows={3}
            style={{ padding: 8 }}
          />
        </label>
        <button
          onClick={() =>
            createAgent.mutate({
              orgId,
              name: agentName,
              config: {
                systemPrompt: agentSystemPrompt,
                model: agentModel
              }
            })
          }
          disabled={!agentName || !agentModel || createAgent.isPending}
          style={{ padding: "8px 12px", width: "fit-content" }}
        >
          {createAgent.isPending ? "Saving..." : "Create Agent"}
        </button>
        <label style={{ display: "grid", gap: 6 }}>
          <span>New Chat Title</span>
          <input
            value={chatTitle}
            onChange={(event) => setChatTitle(event.target.value)}
            placeholder="Kickoff notes"
            style={{ padding: 8 }}
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Agent IDs (comma separated)</span>
          <input
            value={agentIdsInput}
            onChange={(event) => setAgentIdsInput(event.target.value)}
            placeholder="agent_default"
            style={{ padding: 8 }}
          />
        </label>
        <button
          onClick={() =>
            createChat.mutate({
              orgId,
              title: chatTitle,
              agentIds: agentIdsInput
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean)
            })
          }
          disabled={!chatTitle || createChat.isPending}
          style={{ padding: "8px 12px", width: "fit-content" }}
        >
          {createChat.isPending ? "Creating..." : "Create Chat"}
        </button>
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Agents</h2>
        {agentsQuery.isLoading ? <p>Loading agents...</p> : null}
        {agentsQuery.data?.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {agentsQuery.data.map((agent) => (
              <div
                key={agent.agentId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  border: "1px solid #ddd",
                  padding: "8px 12px",
                  borderRadius: 6
                }}
              >
                <div>
                  <strong>{agent.name}</strong>
                  <div style={{ fontSize: 12 }}>{agent.agentId}</div>
                </div>
                <button
                  onClick={() =>
                    setAgentIdsInput(
                      [agentIdsInput, agent.agentId].filter(Boolean).join(", ")
                    )
                  }
                  style={{ padding: "6px 10px" }}
                >
                  Add To Chat
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p>No agents created yet.</p>
        )}
        <h2 style={{ margin: 0 }}>Chats</h2>
        {chatsQuery.isLoading ? <p>Loading chats...</p> : null}
        {chatsQuery.data?.length ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {chatsQuery.data.map((chat) => (
              <button
                key={chat.chatId}
                onClick={() => setActiveChatId(chat.chatId)}
                style={{
                  padding: "6px 10px",
                  border: "1px solid #ccc",
                  background: chat.chatId === activeChatId ? "#111" : "#fff",
                  color: chat.chatId === activeChatId ? "#fff" : "#111"
                }}
              >
                {chat.title}
              </button>
            ))}
          </div>
        ) : (
          <p>No chats yet.</p>
        )}
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Active Chat</h2>
        {activeChatId ? (
          <>
            <div style={{ display: "grid", gap: 4 }}>
              <strong>{chatQuery.data?.chat.title ?? "Loading..."}</strong>
              <span>Status: {chatQuery.data?.chat.status ?? "..."}</span>
            </div>
            <div style={{ display: "grid", gap: 8, maxWidth: 520 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Message</span>
                <textarea
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  rows={3}
                  style={{ padding: 8 }}
                />
              </label>
              <button
                onClick={() => addMessage.mutate({ chatId: activeChatId, text: messageDraft })}
                disabled={!messageDraft || addMessage.isPending}
                style={{ padding: "8px 12px", width: "fit-content" }}
              >
                {addMessage.isPending ? "Sending..." : "Send Message"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() =>
                  approveSandbox.mutate({ chatId: activeChatId, decision: "new" })
                }
                style={{ padding: "6px 10px" }}
              >
                Approve Sandbox
              </button>
              <button
                onClick={() => archiveChat.mutate({ chatId: activeChatId })}
                style={{ padding: "6px 10px" }}
              >
                Archive Chat
              </button>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <strong>Messages</strong>
              {messagesQuery.data?.length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {messagesQuery.data.map((message) => (
                    <li key={message.message_id}>
                      {message.role}: {message.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No messages yet.</p>
              )}
            </div>
          </>
        ) : (
          <p>Select a chat to see details.</p>
        )}
      </section>
    </main>
  );
}
