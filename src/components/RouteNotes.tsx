import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { severityStyle } from './Advisories';
import { foldedSummary, splitNotes, type Note } from '@/notes';
import { Collapsible, colors, EASE_OUT, PressableScale } from '@/ui';

const CALM = FadeIn.duration(250).easing(EASE_OUT);

// A route card's warnings: the top one in full, and past two the rest folded into one line that opens them.
// gap: the parent's row gap, folded away with the hidden notes.
export function RouteNotes({ notes, gap = 12 }: { notes: Note[]; gap?: number }) {
  const [open, setOpen] = useState(false);
  const { shown, folded } = splitNotes(notes);
  return (
    <>
      {shown.map((n, i) => (
        <NoteBox key={n.key} note={n} full={i === 0} />
      ))}
      {folded.length > 0 && (
        <>
          <PressableScale
            onPress={() => setOpen((v) => !v)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            style={styles.moreNotes}
          >
            <Text style={styles.moreNotesText} numberOfLines={1}>
              {open ? `Hide ${folded.length} more` : `${folded.length} more: ${foldedSummary(folded)}`}
            </Text>
            <Text style={styles.moreNotesChevron}>{open ? '▴' : '▾'}</Text>
          </PressableScale>
          <Collapsible expanded={open} gap={gap}>
            <View style={{ gap: 8 }}>
              {folded.map((n) => (
                <NoteBox key={n.key} note={n} full={false} />
              ))}
            </View>
          </Collapsible>
        </>
      )}
    </>
  );
}

// One warning: its line, and in full its explanation too. A note with a link opens on tap instead, with a button
// to the full notice.
function NoteBox({ note, full }: { note: Note; full: boolean }) {
  const [open, setOpen] = useState(false);
  const tone = note.urgent ? severityStyle.high : severityStyle.low;
  const link = note.link;
  const shown = link ? open : full;
  const body = (
    <>
      <Text style={[styles.alertText, { color: tone.color }]} numberOfLines={shown ? 3 : full ? 2 : 1}>{note.text}</Text>
      {shown && !!note.detail && <Text style={styles.alertDetail} numberOfLines={3}>{note.detail}</Text>}
      {link && (
        <Collapsible expanded={open}>
          <PressableScale onPress={() => Linking.openURL(link)} accessibilityRole="link" hitSlop={4} style={[styles.readMore, { borderColor: tone.color }]}>
            <Text style={[styles.readMoreText, { color: tone.color }]}>Read more ›</Text>
          </PressableScale>
        </Collapsible>
      )}
    </>
  );
  const style = [styles.alert, { backgroundColor: tone.soft }];
  if (link) {
    return (
      <PressableScale onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={style}>
        {body}
      </PressableScale>
    );
  }
  return (
    <Animated.View entering={CALM} style={style}>
      {body}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  alert: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  alertText: { fontSize: 13, fontWeight: '700' },
  alertDetail: { fontSize: 12, color: colors.text, marginTop: 4, lineHeight: 17 },
  moreNotes: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.bg },
  moreNotesText: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text },
  readMore: { alignSelf: 'flex-start', marginTop: 8, borderWidth: 1, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  readMoreText: { fontSize: 12, fontWeight: '700' },
  moreNotesChevron: { fontSize: 12, color: colors.muted },
});
