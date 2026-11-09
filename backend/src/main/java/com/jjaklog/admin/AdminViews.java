package com.jjaklog.admin;

import com.fasterxml.jackson.databind.JsonNode;
import com.jjaklog.user.UserSummary;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** What the admin page shows. */
public final class AdminViews {

    private AdminViews() {
    }

    public record Totals(long users, long parrots, long posts, long comments, long guestbook, long feathers, long suspended) {
    }

    /** One day in the admin's time zone: signups, diaries written, owners who used 앵로그 that day. */
    public record Day(LocalDate date, long signups, long posts, long active) {
    }

    public record Overview(Totals totals, List<Day> days, JsonNode park, String parkError) {
    }

    public record UserRow(Long id, String handle, String nickname, Instant createdAt, long parrots, long posts,
                          LocalDate lastActive, Instant suspendedAt, String suspendReason, boolean admin) {
    }

    public record CommentRow(Long id, UserSummary author, String body, Instant createdAt, Long postId) {
    }

    public record GuestbookRow(Long id, UserSummary author, String body, Instant createdAt, String roomHandle) {
    }

    public record SuspendRequest(String reason) {
    }

    public record KickRequest(int channel, int pid, Integer minutes) {
    }
}
