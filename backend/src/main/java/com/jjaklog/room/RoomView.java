package com.jjaklog.room;

import com.jjaklog.parrot.ParrotView;
import com.jjaklog.post.Mood;
import com.jjaklog.user.UserSummary;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Everything the 3D room needs in one call. Objects in the room map to these fields:
 * frames on the wall = recent photo diaries, the scale = latest weight,
 * the bird's pose = latest mood, the shelf = badges, the floor = feathers from visitors.
 */
public record RoomView(
        UserSummary owner,
        List<ParrotView> parrots,
        List<Frame> frames,
        Today today,
        Stats stats,
        Relation relation,
        List<Badge> badges,
        List<FeatherView> feathers) {

    /** A framed photo on the wall. Tapping it opens the diary entry. */
    public record Frame(Long postId, String imageUrl, int width, int height, Instant createdAt) {
    }

    public record Today(BigDecimal latestWeightG, Instant weighedAt, Mood latestMood, String latestMoodLabel, Instant moodAt) {
    }

    public record Stats(long postCount, int streakDays, long followerCount, long followingCount,
                        long featherCount, long feathersToday, long guestbookCount) {
    }

    /** How the viewer relates to this room. */
    public record Relation(boolean isMe, boolean following, boolean featherLeftToday) {
    }

    public record Badge(String code, String label) {
    }

    public record FeatherView(String color, String visitorHandle, LocalDate visitDate) {
    }
}
