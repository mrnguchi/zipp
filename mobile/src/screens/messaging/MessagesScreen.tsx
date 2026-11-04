import { useEffect, useState } from 'react';
import { MessagingIcon as Ionicons } from '../../components/MessagingIcon';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../constants/colors';
import { useMessaging } from '../../contexts/MessagingContext';
import { messagePreview, relativeMessageTime, searchConversations } from '../../services/messaging';
import type { RootStackParamList } from '../../navigation/types';
import { Avatar, EmptyState, ui } from './MessagingUI';

export function MessagesScreen({ bottomInset }: { bottomInset: number }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { conversations, calls } = useMessaging();
  const [tab, setTab] = useState<'messages' | 'calls'>('messages');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filtered, setFiltered] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const items = searchConversations(conversations, query, tab === 'messages' && filtered);
  const filteredCalls = calls.filter(call => (!filtered || call.status === 'missed') && conversations.some(item => item.id === call.conversationId && `${item.name} ${item.role}`.toLowerCase().includes(query.trim().toLowerCase())));

  function changeTab() {
    setTab(tab === 'messages' ? 'calls' : 'messages');
    setQuery(''); setFiltered(false); setSearchOpen(false);
  }
  return <SafeAreaView style={ui.screen} edges={['top', 'left', 'right']}>
    <View style={s.header}>
      <Text accessibilityRole="header" style={s.heading}>{tab === 'messages' ? 'Messages' : 'Calls'}</Text>
      <View style={s.headerActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={tab === 'messages' ? 'Show calls' : 'Show messages'} onPress={changeTab} style={s.headerButton}><Ionicons name={tab === 'messages' ? 'call' : 'chatbubble'} size={24} color="#525C4C" /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={searchOpen ? 'Close search' : 'Search'} onPress={() => { setSearchOpen(!searchOpen); setQuery(''); setFiltered(false); }} style={s.headerButton}><Ionicons name={searchOpen ? 'close-outline' : 'search-outline'} size={27} color="#525C4C" /></Pressable>
      </View>
    </View>
    {searchOpen && <View style={s.searchControls}>
      <View style={ui.search}><Ionicons name="search" size={20} color="#92998D" /><TextInput autoFocus accessibilityLabel={tab === 'messages' ? 'Search conversations' : 'Search calls'} placeholder={tab === 'messages' ? 'Search messages or people' : 'Search calls'} value={query} onChangeText={setQuery} style={[ui.searchInput, { fontSize: 17, lineHeight: 24 }]} placeholderTextColor="#92998D" /></View>
      <View style={s.filters}>{[false, true].map(value => <Pressable key={String(value)} accessibilityRole="button" accessibilityState={{ selected: filtered === value }} onPress={() => setFiltered(value)} style={[s.filter, filtered === value && s.filterActive]}><Text style={[s.filterText, filtered === value && { color: colors.primaryDark }]}>{value ? (tab === 'messages' ? 'Unread' : 'Missed') : 'All'}</Text></Pressable>)}</View>
    </View>}
    <ScrollView contentContainerStyle={[s.list, { paddingBottom: bottomInset + 86 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {tab === 'messages' ? items.length ? items.map(item => {
        const last = item.messages.at(-1);
        return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.unread} unread messages`} onPress={() => navigation.navigate('Conversation', { conversationId: item.id })} style={({ pressed }) => [s.conversation, pressed && { opacity: 0.6 }]}>
          <Avatar conversation={item} size={64} />
          <View style={s.copy}><Text style={s.name} numberOfLines={1}>{item.name}</Text><Text style={s.message} numberOfLines={2}>{messagePreview(last)}</Text></View>
          <View style={s.meta}><Text style={s.time}>{last ? relativeMessageTime(last.createdAt, now) : ''}</Text>{item.unread > 0 ? <View style={s.unread}><Text style={s.unreadText}>{item.unread}</Text></View> : item.muted ? <Ionicons name="notifications-off-outline" size={17} color="#ACB2A5" /> : null}</View>
        </Pressable>;
      }) : <EmptyState title={query ? 'No conversations found' : filtered ? 'You’re all caught up' : 'Your conversations start here'} body={query ? 'Try another name or a word from a message.' : filtered ? 'There are no unread messages.' : 'Your driver conversations will appear here when a ride is assigned.'} /> :
      filteredCalls.length ? filteredCalls.map(call => {
        const person = conversations.find(item => item.id === call.conversationId)!;
        return <View key={call.id} style={s.callRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Call details for ${person.name}`} style={s.callDetails} onPress={() => navigation.navigate('CallDetails', { callId: call.id })}>
            <Avatar conversation={person} size={64} /><View style={s.copy}><Text style={[s.name, call.status === 'missed' && { color: '#B74E46' }]} numberOfLines={1}>{person.name}</Text><View style={s.callDescription}><Ionicons name={call.direction === 'incoming' ? 'arrow-down-outline' : 'arrow-up-outline'} size={15} color={call.status === 'missed' ? '#B74E46' : colors.primary} /><Text style={s.message}>{call.status === 'missed' ? 'Missed call' : call.direction === 'incoming' ? 'Incoming call' : 'Outgoing call'}</Text></View><Text style={s.callTime}>{relativeMessageTime(call.startedAt, now)}</Text></View>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Call ${person.name}`} style={s.headerButton} onPress={() => navigation.navigate('Call', { conversationId: person.id, mode: 'voice' })}><Ionicons name="call-outline" size={23} color={colors.primary} /></Pressable>
        </View>;
      }) : <EmptyState icon="call-outline" title={filtered ? 'No missed calls' : 'No calls yet'} body="Your voice call history will appear here." />}
      {__DEV__ && <Text style={s.previewFootnote}>Preview conversations · saved on this device</Text>}
    </ScrollView>
    <Pressable accessibilityRole="button" accessibilityLabel={tab === 'messages' ? 'New conversation' : 'New call'} onPress={() => navigation.navigate('NewConversation', { mode: tab === 'messages' ? 'message' : 'voice' })} style={({ pressed }) => [s.compose, { bottom: bottomInset + 8 }, pressed && { opacity: 0.8 }]}><Ionicons name="add" size={31} color={colors.white} /></Pressable>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  header: { paddingHorizontal: 26, paddingTop: 22, paddingBottom: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heading: { fontSize: 36, lineHeight: 46, fontWeight: '700', color: colors.navy },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2 }, headerButton: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 26, flexGrow: 1, paddingTop: 2 },
  conversation: { flexDirection: 'row', alignItems: 'center', gap: 17, minHeight: 119, paddingVertical: 22 },
  copy: { flex: 1, gap: 9 }, name: { fontSize: 19, lineHeight: 26, fontWeight: '500', color: colors.navy },
  message: { fontSize: 16, lineHeight: 25, color: '#9A9E97' },
  meta: { width: 54, alignItems: 'flex-end', alignSelf: 'stretch', paddingTop: 4, gap: 17 }, time: { fontSize: 12, lineHeight: 18, color: '#A2A69E', textAlign: 'right' },
  unread: { minWidth: 28, height: 28, paddingHorizontal: 7, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, unreadText: { fontSize: 14, fontWeight: '600', color: colors.white },
  compose: { position: 'absolute', right: 26, width: 62, height: 62, borderRadius: 31, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary, shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 7 },
  searchControls: { paddingHorizontal: 26, gap: 12, paddingBottom: 12 }, filters: { flexDirection: 'row', gap: 9 }, filter: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F6F7F4' }, filterActive: { backgroundColor: colors.primarySoft }, filterText: { fontSize: 14, fontWeight: '600', color: '#92998D' },
  callRow: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 119, paddingVertical: 20 }, callDetails: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 17 }, callDescription: { flexDirection: 'row', alignItems: 'center', gap: 5 }, callTime: { fontSize: 13, lineHeight: 20, color: '#A2A69E' },
  previewFootnote: { fontSize: 11, lineHeight: 18, color: '#B1B6AA', textAlign: 'center', marginTop: 24 },
});
