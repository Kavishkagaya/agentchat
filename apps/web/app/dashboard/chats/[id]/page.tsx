import { ChatClient } from "./chat-client";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ChatClient chatId={id} />;
}
