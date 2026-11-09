package com.jjaklog.park;

import com.jjaklog.common.ApiException;
import com.jjaklog.common.LoginUser;
import com.jjaklog.user.User;
import com.jjaklog.user.UserRepository;
import java.time.Clock;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/park")
public class ParkController {

    public record TokenView(String token, long expiresInSec) {
    }

    private final ParkTokens tokens;
    private final UserRepository users;
    private final Clock clock;

    public ParkController(ParkTokens tokens, UserRepository users, Clock clock) {
        this.tokens = tokens;
        this.users = users;
        this.clock = clock;
    }

    /** A fresh token for each 앵파크 connection; the park keeps only one bird per account. */
    @PostMapping("/token")
    public TokenView token(@LoginUser Long userId) {
        if (!tokens.enabled()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "PARK_TOKEN_OFF", "앵파크 로그인을 지금은 쓸 수 없어요.");
        }
        User user = users.findById(userId).orElseThrow(ApiException::unauthorized);
        return new TokenView(tokens.issue(user.getId(), user.getHandle(), clock.instant().getEpochSecond()),
                ParkTokens.TTL_SECONDS);
    }
}
