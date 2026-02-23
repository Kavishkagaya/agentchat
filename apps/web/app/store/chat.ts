import { create } from "zustand";

type ChatState = {
  orgId: string;
  chatTitle: string;
  agentIdsInput: string;
  agentName: string;
  agentModel: string;
  agentSystemPrompt: string;
  activeChatId?: string;
  messageDraft: string;
  setOrgId: (orgId: string) => void;
  setChatTitle: (title: string) => void;
  setAgentIdsInput: (value: string) => void;
  setAgentName: (value: string) => void;
  setAgentModel: (value: string) => void;
  setAgentSystemPrompt: (value: string) => void;
  setActiveChatId: (chatId?: string) => void;
  setMessageDraft: (draft: string) => void;
};

export const useChatStore = create<ChatState>((set) => ({
  orgId: "org_demo",
  chatTitle: "",
  agentIdsInput: "",
  agentName: "",
  agentModel: "gpt-4o-mini",
  agentSystemPrompt: "You are a helpful agent.",
  activeChatId: undefined,
  messageDraft: "",
  setOrgId: (orgId) => set({ orgId }),
  setChatTitle: (chatTitle) => set({ chatTitle }),
  setAgentIdsInput: (agentIdsInput) => set({ agentIdsInput }),
  setAgentName: (agentName) => set({ agentName }),
  setAgentModel: (agentModel) => set({ agentModel }),
  setAgentSystemPrompt: (agentSystemPrompt) => set({ agentSystemPrompt }),
  setActiveChatId: (activeChatId) => set({ activeChatId }),
  setMessageDraft: (messageDraft) => set({ messageDraft }),
}));
