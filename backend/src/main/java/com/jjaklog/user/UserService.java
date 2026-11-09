package com.jjaklog.user;

import com.jjaklog.common.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.Map;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

    /** Room address: jjaklog.com/@handle */
    private static final Pattern HANDLE = Pattern.compile("^[a-z0-9_]{3,20}$");

    public static final int PASSWORD_MIN = 8;
    public static final int PASSWORD_MAX = 64;

    private final UserRepository users;
    private final Clock clock;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(10);
    // compared against when the handle does not exist, so both failures take the same time
    private final String dummyHash = encoder.encode("not-a-real-password");

    public UserService(UserRepository users, Clock clock) {
        this.users = users;
        this.clock = clock;
    }

    /** New account with a password. */
    @Transactional
    public User signUp(String rawHandle, String rawNickname, String password) {
        String handle = normalizeHandle(rawHandle);
        String nickname = rawNickname == null ? "" : rawNickname.trim();
        if (nickname.isEmpty() || nickname.length() > 20) {
            throw ApiException.badRequest("INVALID_NICKNAME", "닉네임은 1~20자로 적어 주세요.");
        }
        if (password == null || password.length() < PASSWORD_MIN || password.length() > PASSWORD_MAX) {
            throw ApiException.badRequest("INVALID_PASSWORD", "비밀번호는 8~64자로 정해 주세요.");
        }
        if (password.equalsIgnoreCase(handle)) {
            throw ApiException.badRequest("INVALID_PASSWORD", "비밀번호는 아이디와 다르게 정해 주세요.");
        }
        if (users.findByHandle(handle).isPresent()) {
            throw ApiException.conflict("HANDLE_TAKEN", "이미 쓰는 아이디예요. 다른 아이디를 골라 주세요.");
        }
        User user = new User(handle, nickname, Instant.now(clock));
        user.setPasswordHash(encoder.encode(password));
        return users.save(user);
    }

    /** Password login. Unknown handle and wrong password give the same answer. */
    @Transactional(readOnly = true)
    public User login(String rawHandle, String password) {
        String handle = rawHandle == null ? "" : rawHandle.trim().toLowerCase();
        User user = HANDLE.matcher(handle).matches() ? users.findByHandle(handle).orElse(null) : null;
        String hash = user != null && user.getPasswordHash() != null ? user.getPasswordHash() : dummyHash;
        boolean ok = password != null && password.length() <= PASSWORD_MAX && encoder.matches(password, hash);
        if (!ok || user == null || user.getPasswordHash() == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "BAD_CREDENTIALS", "아이디나 비밀번호가 맞지 않아요.");
        }
        return user;
    }

    private static String normalizeHandle(String rawHandle) {
        String handle = rawHandle == null ? "" : rawHandle.trim().toLowerCase();
        if (!HANDLE.matcher(handle).matches()) {
            throw ApiException.badRequest("INVALID_HANDLE", "아이디는 영어 소문자, 숫자, 밑줄로 3~20자여야 해요.");
        }
        return handle;
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
