import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { TravelSection } from '@/components/ui/TravelPrimitives';
import { STAR_GOLD } from '@/constants/colors';
import { useHomeDesign } from '@/constants/homeDesign';
import { Fonts } from '@/constants/typography';
import {
  getReviewHighlights,
  type ReviewHighlight,
  type ReviewHighlights,
} from '@/services/review.service';

const SERVICE_LABEL: Record<ReviewHighlight['serviceType'], string> = {
  transport: 'Ride',
  hotel: 'Stay',
  tour: 'Tour',
  guide: 'Guide',
};

function monthYear(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // Pakistan time (UTC+5, no daylight saving).
  const pk = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  return `${months[pk.getUTCMonth()]} ${pk.getUTCFullYear()}`;
}

/**
 * "What travellers say": real reviews from completed bookings. Renders nothing until
 * customers have written some — never placeholder testimonials.
 */
export function HomeReviews() {
  const theme = useHomeDesign();
  const { width } = useWindowDimensions();
  const [data, setData] = useState<ReviewHighlights | null>(null);

  useEffect(() => {
    let alive = true;
    getReviewHighlights(6)
      .then((result) => {
        if (alive) setData(result);
      })
      .catch(() => {
        // Optional section: on failure it simply stays hidden.
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!data?.items.length) return null;
  const cardWidth = Math.min(width * 0.8, 340);

  return (
    <TravelSection
      title="What travellers say"
      subtitle="Reviews from customers who booked and travelled with Banjara"
    >
      {data.average && data.total > 0 ? (
        <View style={s.summary}>
          <Ionicons name="star" size={15} color={STAR_GOLD} />
          <Text style={[s.summaryScore, { color: theme.text }]}>{data.average.toFixed(1)}</Text>
          <Text style={[s.summaryText, { color: theme.muted }]}>
            from {data.total.toLocaleString('en-PK')} {data.total === 1 ? 'review' : 'reviews'}
          </Text>
          <View style={[s.realBadge, { backgroundColor: theme.soft }]}>
            <Ionicons name="checkmark-circle" size={13} color={theme.primary} />
            <Text style={[s.realBadgeText, { color: theme.primary }]}>Real bookings</Text>
          </View>
        </View>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + 12}
        decelerationRate="fast"
        contentContainerStyle={s.row}
      >
        {data.items.map((review) => (
          <View
            key={review.id}
            style={[
              s.card,
              { width: cardWidth, backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            accessible
            accessibilityLabel={`${review.reviewerName}, rated ${review.rating} out of 5: ${review.comment}`}
          >
            <View style={s.stars}>
              {Array.from({ length: 5 }, (_, i) => (
                <Ionicons
                  key={i}
                  name={i < Math.round(review.rating) ? 'star' : 'star-outline'}
                  size={14}
                  color={STAR_GOLD}
                />
              ))}
            </View>
            <Text style={[s.comment, { color: theme.text }]} numberOfLines={5}>
              “{review.comment}”
            </Text>
            <View style={[s.footer, { borderTopColor: theme.border }]}>
              <Avatar uri={review.reviewerAvatar} name={review.reviewerName} size={36} />
              <View style={s.flex}>
                <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>
                  {review.reviewerName}
                </Text>
                <Text style={[s.meta, { color: theme.muted }]} numberOfLines={1}>
                  {[
                    SERVICE_LABEL[review.serviceType],
                    review.tripLabel || review.place,
                    monthYear(review.createdAt),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </TravelSection>
  );
}

const s = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  summaryScore: { fontFamily: Fonts.bodyBold, fontSize: 15 },
  summaryText: { fontFamily: Fonts.body, fontSize: 13 },
  realBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  realBadgeText: { fontFamily: Fonts.bodySemiBold, fontSize: 11 },
  row: { paddingHorizontal: 16, gap: 12 },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  stars: { flexDirection: 'row', gap: 2 },
  comment: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 21, minHeight: 63 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 'auto',
    paddingTop: 10,
    borderTopWidth: 1,
  },
  flex: { flex: 1 },
  name: { fontFamily: Fonts.bodySemiBold, fontSize: 13 },
  meta: { fontFamily: Fonts.body, fontSize: 11, marginTop: 1 },
});
