import type { MapCoordinate } from '../components/maps/mapGeometry';

export type MessageKind = 'text' | 'image' | 'voice' | 'location' | 'trip';
export type ChatMessage = { id: string; author: 'me' | 'contact'; kind: MessageKind; text: string; createdAt: number; uri?: string; duration?: number; coordinate?: MapCoordinate; label?: string };
export type TripDetails = { pickup: string; destination: string; vehicle: string; plate: string };
export type Conversation = { id: string; name: string; initials: string; role: 'Driver' | 'Rider' | 'Support'; trip?: TripDetails; messages: ChatMessage[]; unread: number; muted: boolean; preview: boolean };
export type CallRecord = { id: string; conversationId: string; mode: 'voice'; direction: 'incoming' | 'outgoing'; status: 'ringing' | 'active' | 'ended' | 'missed' | 'canceled' | 'unavailable'; startedAt: number; connectedAt?: number; endedAt?: number };
export type MessagingState = { conversations: Conversation[]; drafts: Record<string, string>; calls: CallRecord[] };
export type MessagingAction =
  | { type: 'conversation'; conversation: Conversation }
  | { type: 'message'; conversationId: string; message: ChatMessage }
  | { type: 'read'; conversationId: string }
  | { type: 'draft'; conversationId: string; text: string }
  | { type: 'mute'; conversationId: string; muted: boolean }
  | { type: 'call'; call: CallRecord }
  | { type: 'call-status'; id: string; status: CallRecord['status']; now: number };

export function messagingReducer(state: MessagingState, action: MessagingAction): MessagingState {
  if (action.type === 'conversation') return state.conversations.some(item => item.id === action.conversation.id) ? state : { ...state, conversations: [action.conversation, ...state.conversations] };
  if (action.type === 'draft') return { ...state, drafts: { ...state.drafts, [action.conversationId]: action.text.slice(0, 2000) } };
  if (action.type === 'call') {
    if (!state.conversations.some(item => item.id === action.call.conversationId) || state.calls.some(item => item.id === action.call.id)) return state;
    return { ...state, calls: [action.call, ...state.calls] };
  }
  if (action.type === 'call-status') {
    return { ...state, calls: state.calls.map(call => {
      if (call.id !== action.id || !['ringing', 'active'].includes(call.status)) return call;
      if (action.status === 'active') return call.status === 'ringing' ? { ...call, status: 'active', connectedAt: action.now } : call;
      if (!['ended', 'missed', 'canceled', 'unavailable'].includes(action.status)) return call;
      return { ...call, status: action.status, endedAt: action.now };
    }) };
  }
  const conversations = state.conversations.map(conversation => {
    if (conversation.id !== action.conversationId) return conversation;
    if (action.type === 'read') return { ...conversation, unread: 0 };
    if (action.type === 'mute') return { ...conversation, muted: action.muted };
    const message = action.message;
    if (conversation.messages.some(item => item.id === message.id) || (message.kind === 'text' && !message.text.trim()) || (['image', 'voice'].includes(message.kind) && !message.uri) || (message.kind === 'location' && (!message.coordinate || !Number.isFinite(message.coordinate.latitude) || !Number.isFinite(message.coordinate.longitude) || Math.abs(message.coordinate.latitude) > 90 || Math.abs(message.coordinate.longitude) > 180))) return conversation;
    return { ...conversation, messages: [...conversation.messages, { ...message, text: message.text.trim().slice(0, 2000) }], unread: message.author === 'contact' ? conversation.unread + 1 : conversation.unread };
  });
  return { ...state, conversations };
}
export function messagePreview(message?: ChatMessage) {
  if (!message) return 'Start a conversation';
  return message.kind === 'image' ? 'Photo' : message.kind === 'voice' ? 'Voice message' : message.kind === 'location' ? 'Shared location' : message.kind === 'trip' ? 'Trip details' : message.text;
}
export function relativeMessageTime(timestamp: number, now = Date.now()) {
  if (!Number.isFinite(timestamp)) return '';
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
export function formatCallDuration(seconds: number) {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}
export function searchConversations(conversations: Conversation[], query: string, unreadOnly = false) {
  const term = query.trim().toLowerCase();
  return conversations.filter(item => (!unreadOnly || item.unread > 0) && `${item.name} ${item.role} ${item.messages.map(message => message.text).join(' ')}`.toLowerCase().includes(term)).sort((a, b) => (b.messages.at(-1)?.createdAt ?? 0) - (a.messages.at(-1)?.createdAt ?? 0));
}
export function driverConversation(id: string, trip: TripDetails): Conversation {
  return { id, name: 'Alex N.', initials: 'AN', role: 'Driver', trip, messages: [], unread: 0, muted: false, preview: true };
}
export function createMessagingPreview(enabled: boolean, now = Date.now()): MessagingState {
  if (!enabled) return { conversations: [], drafts: {}, calls: [] };
  const first = driverConversation('demo-alex', { pickup: 'Molyko Junction, Buea', destination: 'University of Buea', vehicle: 'Toyota Yaris · White', plate: 'SW 681 BS' });
  first.unread = 2;
  first.messages = [
    { id: 'alex-1', author: 'contact', kind: 'text', text: 'Hi Suh! I’m on my way to the pickup point.', createdAt: now - 18 * 60000 },
    { id: 'alex-2', author: 'me', kind: 'text', text: 'Thank you. I’ll be waiting near the main entrance.', createdAt: now - 17 * 60000 },
    { id: 'alex-3', author: 'contact', kind: 'trip', text: 'Your ride details', createdAt: now - 16 * 60000 },
    { id: 'alex-4', author: 'contact', kind: 'text', text: 'I’m in the white Toyota Yaris. See you shortly!', createdAt: now - 2 * 60000 },
  ];
  const second: Conversation = { id: 'demo-marie', name: 'Marie E.', initials: 'ME', role: 'Rider', messages: [{ id: 'marie-1', author: 'contact', kind: 'text', text: 'Thank you for riding with Zipp. Have a lovely day!', createdAt: now - 3 * 3600000 }], unread: 0, muted: false, preview: true };
  const support: Conversation = { id: 'demo-support', name: 'Zipp Support', initials: 'Z', role: 'Support', messages: [{ id: 'support-1', author: 'contact', kind: 'text', text: 'Welcome to your conversation preview. You can try messages, photos, voice notes, and call screens here.', createdAt: now - 24 * 3600000 }], unread: 0, muted: false, preview: true };
  return { conversations: [first, second, support], drafts: {}, calls: [{ id: 'demo-call-1', conversationId: first.id, mode: 'voice', direction: 'incoming', status: 'missed', startedAt: now - 35 * 60000, endedAt: now - 34 * 60000 }, { id: 'demo-call-2', conversationId: second.id, mode: 'voice', direction: 'outgoing', status: 'ended', startedAt: now - 4 * 3600000, connectedAt: now - 4 * 3600000 + 4000, endedAt: now - 4 * 3600000 + 92000 }] };
}
