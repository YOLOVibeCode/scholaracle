import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { IWorkPackView } from '@scholaracle/contracts';

export interface IWorkPackViewProps {
  readonly view: IWorkPackView;
  readonly opening?: boolean;
  readonly openError?: string | null;
  onOpenPrimary(): void;
  onOpenLink(href: string): void;
}

/** Compact student work pack. One loud Open; LMS links are fallback. No grades. */
export function WorkPackView({
  view,
  opening = false,
  openError = null,
  onOpenPrimary,
  onOpenLink,
}: IWorkPackViewProps): React.ReactElement {
  const [courseOpen, setCourseOpen] = useState(false);
  const primaryLabel = view.primaryAsset ? `Open ${view.primaryAsset.fileName}` : null;

  return (
    <View testID="studio-work-pack" style={styles.stack}>
      <View>
        <Text style={styles.title}>{view.title}</Text>
        <Text style={styles.status} testID="studio-pack-status">
          {view.humanStatus}
        </Text>
        <Text style={styles.meta}>
          {view.courseName}
          {view.dueAt ? ` · Due ${formatDue(view.dueAt)}` : ''}
        </Text>
      </View>

      {primaryLabel ? (
        <TouchableOpacity
          style={styles.cta}
          onPress={onOpenPrimary}
          disabled={opening}
          testID="studio-pack-primary-cta"
        >
          <Text style={styles.ctaText}>{opening ? 'Opening…' : primaryLabel}</Text>
        </TouchableOpacity>
      ) : null}

      {openError != null ? (
        <Text style={styles.error} testID="studio-pack-open-error">
          {openError}
        </Text>
      ) : null}

      <View testID="studio-pack-instructions">
        <Text style={styles.instructions}>{view.instructionsText}</Text>
      </View>

      {view.capturedPages.length > 0 ? (
        <View testID="studio-pack-captured">
          <Text style={styles.alsoHeader}>Read here — saved for offline</Text>
          {view.capturedPages.map((page) => (
            <View key={page.title} style={styles.captured}>
              <Text style={styles.capturedTitle}>{page.title}</Text>
              <Text style={styles.instructions}>{page.text}</Text>
              {page.href != null && page.href !== '' ? (
                <TouchableOpacity onPress={() => onOpenLink(page.href as string)}>
                  <Text style={styles.link}>Open original</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {view.needsSchoolLogin.length > 0 ? (
        <View testID="studio-pack-fallbacks">
          <Text style={styles.alsoHeader}>Needs school login / other links</Text>
          {view.needsSchoolLogin.map((link) => (
            <TouchableOpacity key={link.href} onPress={() => onOpenLink(link.href)}>
              <Text style={styles.link}>
                {link.kind === 'needs-internet' ? `${link.label} (needs internet)` : link.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {view.moreFromCourse.length > 0 ? (
        <View testID="studio-pack-more">
          <TouchableOpacity onPress={() => setCourseOpen((open) => !open)}>
            <Text style={styles.alsoHeader}>{courseOpen ? 'Hide' : 'More from this course'}</Text>
          </TouchableOpacity>
          {courseOpen
            ? view.moreFromCourse.map((item) => (
                <Text key={item.title} style={styles.moreItem}>
                  {item.title}
                </Text>
              ))
            : null}
        </View>
      ) : null}
    </View>
  );
}

function formatDue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  stack: { gap: 20 },
  title: { fontSize: 24, fontWeight: '600', color: '#1a1a2e' },
  status: { fontSize: 14, fontWeight: '500', color: '#6c757d', marginTop: 4 },
  meta: { fontSize: 14, color: '#6c757d', marginTop: 4 },
  cta: {
    alignSelf: 'flex-start',
    backgroundColor: '#4361ee',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  error: { color: '#dc3545', fontSize: 14 },
  instructions: { fontSize: 16, lineHeight: 24, color: '#1a1a2e' },
  alsoHeader: { fontSize: 13, fontWeight: '600', color: '#6c757d', marginBottom: 8 },
  captured: { marginBottom: 12 },
  capturedTitle: { fontSize: 15, fontWeight: '600', color: '#1a1a2e', marginBottom: 6 },
  link: { fontSize: 16, color: '#4361ee', paddingVertical: 6 },
  moreItem: { fontSize: 15, color: '#1a1a2e', paddingVertical: 4 },
});
