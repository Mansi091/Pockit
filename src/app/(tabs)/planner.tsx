import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { colors, spacing } from '@/constants/theme';
import SegmentedTabs from '@/components/SegmentedTabs';
import FollowUpsView from '@/components/planner/FollowUpsView';
import CalendarView from '@/components/planner/CalendarView';
import EventsView from '@/components/planner/EventsView';
import { useContactsVersion } from '@/services/dataEvents';
import { getAllFollowUps } from '@/services/activityService';
import { bucketReminders } from '@/utils/dates';

type PlannerTab = 'followups' | 'calendar' | 'events';
const isTab = (t: unknown): t is PlannerTab => t === 'followups' || t === 'calendar' || t === 'events';

/**
 * Planner tab — three separate views, one at a time:
 *  Follow-ups (reminders to get back to people) · Calendar (who you met / are
 *  due to follow up, day by day) · Events (expos & conferences, Event mode).
 * `?tab=` opens a specific view (Home's "Follow-ups due" card uses it).
 */
export default function PlannerScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const version = useContactsVersion();
  const [tab, setTab] = useState<PlannerTab>(isTab(params.tab) ? params.tab : 'followups');
  const [due, setDue] = useState({ count: 0, overdue: false });

  useEffect(() => {
    if (isTab(params.tab)) setTab(params.tab);
  }, [params.tab]);

  useFocusEffect(
    useCallback(() => {
      getAllFollowUps()
        .then((all) => {
          const b = bucketReminders(all);
          setDue({ count: b.overdue.length + b.today.length, overdue: b.overdue.length > 0 });
        })
        .catch(() => {});
    }, [version]),
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SegmentedTabs
        value={tab}
        onChange={setTab}
        style={{ marginBottom: spacing.lg }}
        tabs={[
          { key: 'followups', label: 'Follow-ups', icon: 'alarm-outline', badge: due.count, urgent: due.overdue },
          { key: 'calendar', label: 'Calendar', icon: 'calendar-outline' },
          { key: 'events', label: 'Events', icon: 'flag-outline' },
        ]}
      />
      {tab === 'followups' && <FollowUpsView />}
      {tab === 'calendar' && <CalendarView />}
      {tab === 'events' && <EventsView />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
});
