package com.jjaklog.user;

import com.jjaklog.common.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.Map;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

    /** Room address: jjaklog.com/@handle */
    private static final Pattern HANDLE = Pattern.compile("^[a-z0-9_]{3,20}$");

    private final UserRepository users;
    private final Clock clock;

    public UserService(UserRepository users, Clock clock) {
        this.users = users;
        this.clock = clock;
    }

    /** Development login: finds the account by handle, or creates it on first use. */
    @Transactional
    public User loginOrSignUp(String rawHandle, String rawNickname) {
        String handle = rawHandle == null ? "" : rawHandle.trim().toLowerCase();
        if (!HANDLE.matcher(handle).matches()) {
            throw ApiException.badRequest("INVALID_HANDLE", "아이디는 영어 소문자, 숫자, 밑줄로 3~20자여야 해요.");
        }
        return users.findByHandle(handle).orElseGet(() -> {
            String nickname = rawNickname == null || rawNickname.isBlank() ? handle : rawNickname.trim();
            if (nickname.length() > 20) {
                throw ApiException.badRequest("INVALID_NICKNAME", "닉네임은 20자까지예요.");
            }
            return users.save(new User(handle, nickname, Instant.now(clock)));
        });
    }

    @Transactional(readOnly = true)
    public User get(Long id) {
        return users.findById(id).orElseThrow(() -> ApiException.notFound("사용자"));
    }

    @Transactional(readOnly = true)
    public User getByHandle(String handle) {
        return users.findByHandle(handle == null ? "" : handle.toLowerCase())
                .orElseThrow(() -> ApiException.notFound("방"));
    }

    @Transactional(readOnly = true)
    public Map<Long, User> byIds(Collection<Long> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        return users.findByIdIn(ids).stream().collect(Collectors.toMap(User::getId, Function.identity()));
    }
}
