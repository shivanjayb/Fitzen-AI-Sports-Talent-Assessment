/**
 * Open the AI assistant from anywhere: the floating button, a Results page, History, or the leaderboard.
 * The <Assistant /> sheet (rendered once in Shell) listens for this event.
 */
export type AssistantContext =
  | { kind: 'help' }
  | { kind: 'result'; sessionId: string }
  | { kind: 'progress' }
  | { kind: 'leaderboard'; exerciseId: string; scope: string; rows: Array<{ rank: number; name: string; value: number; formScore: number; isMe: boolean }> };

export interface AssistantOpen { context: AssistantContext; prompt?: string }

export const ASSISTANT_EVENT = 'fitzen:assistant';

export function openAssistant(context: AssistantContext = { kind: 'help' }, prompt?: string): void {
  window.dispatchEvent(new CustomEvent<AssistantOpen>(ASSISTANT_EVENT, { detail: { context, prompt } }));
}
