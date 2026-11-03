import { createContext, useCallback, useContext, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { sampleActivities, upsertActivity } from '../services/activityHistory';
import type { ActivityRecord, ActivityUpdate } from '../services/activityHistory';
const Context = createContext<{ records: ActivityRecord[]; upsert: (record: ActivityUpdate) => void } | null>(null);
export function ActivityProvider({ children }: PropsWithChildren) {
  const [records, setRecords] = useState<ActivityRecord[]>(() => __DEV__ ? sampleActivities(Date.now()) : []);
  const upsert = useCallback((update: ActivityUpdate) => setRecords(current => upsertActivity(current, update, Date.now())), []);
  return <Context.Provider value={{ records, upsert }}>{children}</Context.Provider>;
}
export function useActivity() { const value = useContext(Context); if (!value) throw new Error('ActivityProvider required'); return value; }
