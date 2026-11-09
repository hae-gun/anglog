package com.jjaklog.admin;

import com.jjaklog.common.ApiException;
import com.jjaklog.user.User;
import com.jjaklog.user.UserRepository;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Admins are the handles listed in ADMIN_HANDLES (comma separated). No roles table until it is needed. */
@Component
public class AdminGuard {

    private final Set<String> handles;
    private final UserRepository users;

    public AdminGuard(@Value("${jjaklog.admin.handles:}") String handles, UserRepository users) {
        this.handles = Arrays.stream(handles.split(","))
                .map(h -> h.trim().toLowerCase())
                .filter(h -> !h.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
        this.users = users;
    }

    public boolean isAdmin(User user) {
        return user != null && handles.contains(user.getHandle());
    }

    public boolean isAdmin(Long userId) {
        return userId != null && users.findById(userId).map(this::isAdmin).orElse(false);
    }

    /** @return the admin; 403 for everyone else (a logged-in owner gets no hint what is here). */
    public User require(Long userId) {
        User user = users.findById(userId).orElseThrow(ApiException::unauthorized);
        if (!isAdmin(user)) {
            throw ApiException.forbidden("관리자만 볼 수 있어요.");
        }
        return user;
    }
}
