import { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import type { PropsWithChildren } from 'react';
import { createMessagingPreview, messagingReducer } from '../services/messaging';
import type { CallRecord, ChatMessage, Conversation, MessagingState } from '../services/messaging';

type Value = MessagingState & {
  ensureConversation: (conversation: Conversation) => void;
  send: (conversationId: string, message: Omit<ChatMessage, 'id' | 'author' | 'createdAt'>) => void;
  markRead: (conversationId: string) => void;
  setDraft: (conversationId: string, text: string) => void;
  mute: (conversationId: string, muted: boolean) => void;
  startCall: (conversationId: string, mode: CallRecord['mode'], incoming?: boolean) => string;
  updateCall: (id: string, status: CallRecord['status']) => void;
};
const Context = createContext<Value | null>(null);
let sequence = 0;
const newId = () => `${Date.now()}-${++sequence}`;
export function MessagingProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(messagingReducer, undefined, () => createMessagingPreview(__DEV__));
  const ensureConversation = useCallback((conversation: Conversation) => dispatch({ type: 'conversation', conversation }), []);
  const send = useCallback((conversationId: string, message: Omit<ChatMessage, 'id' | 'author' | 'createdAt'>) => dispatch({ type: 'message', conversationId, message: { ...message, id: newId(), author: 'me', createdAt: Date.now() } }), []);
  const markRead = useCallback((conversationId: string) => dispatch({ type: 'read', conversationId }), []);
  const setDraft = useCallback((conversationId: string, text: string) => dispatch({ type: 'draft', conversationId, text }), []);
  const mute = useCallback((conversationId: string, muted: boolean) => dispatch({ type: 'mute', conversationId, muted }), []);
  const startCall = useCallback((conversationId: string, mode: CallRecord['mode'], incoming = false) => {
    const id = newId(); dispatch({ type: 'call', call: { id, conversationId, mode, direction: incoming ? 'incoming' : 'outgoing', status: 'ringing', startedAt: Date.now() } }); return id;
  }, []);
  const updateCall = useCallback((id: string, status: CallRecord['status']) => dispatch({ type: 'call-status', id, status, now: Date.now() }), []);
  const value = useMemo(() => ({ ...state, ensureConversation, send, markRead, setDraft, mute, startCall, updateCall }), [state, ensureConversation, send, markRead, setDraft, mute, startCall, updateCall]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMessaging() { const value = useContext(Context); if (!value) throw new Error('MessagingProvider is required'); return value; }
