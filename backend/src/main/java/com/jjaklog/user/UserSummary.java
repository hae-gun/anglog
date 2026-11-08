package com.jjaklog.user;

public record UserSummary(Long id, String handle, String nickname) {

    public static UserSummary of(User user) {
        return new UserSummary(user.getId(), user.getHandle(), user.getNickname());
    }
}
