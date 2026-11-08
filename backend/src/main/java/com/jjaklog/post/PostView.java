package com.jjaklog.post;

import com.jjaklog.parrot.ParrotView;
import com.jjaklog.user.UserSummary;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record PostView(
        Long id,
        UserSummary author,
        ParrotView parrot,
        String body,
        BigDecimal weightG,
        Mood mood,
        String moodLabel,
        List<ImageView> images,
        int likeCount,
        int commentCount,
        boolean likedByMe,
        Instant createdAt) {

    public record ImageView(String url, int width, int height) {
    }
}
