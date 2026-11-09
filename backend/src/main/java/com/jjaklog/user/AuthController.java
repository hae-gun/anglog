package com.jjaklog.user;

import com.jjaklog.common.ApiException;
import com.jjaklog.common.JjaklogProperties;
import com.jjaklog.common.LoginUser;
import com.jjaklog.common.SessionKeys;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Clock;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    public record DevLoginRequest(
            @NotBlank @Size(max = 20) String handle,
            @Size(max = 20) String nickname) {
    }

    public record SignUpRequest(
            @NotBlank @Size(max = 20) String handle,
            @NotBlank @Size(max = 20) String nickname,
            @NotBlank @Size(max = 64) String password) {
    }

    public record LoginRequest(
            @NotBlank @Size(max = 40) String handle,
            @NotBlank @Size(max = 64) String password) {
    }

    private final UserService userService;
    private final JjaklogProperties props;
    private final LoginThrottle throttle;
    private final Clock clock;
    private final com.jjaklog.admin.AdminGuard adminGuard;

    public AuthController(UserService userService, JjaklogProperties props, LoginThrottle throttle, Clock clock,
                          com.jjaklog.admin.AdminGuard adminGuard) {
        this.adminGuard = adminGuard;
        this.userService = userService;
        this.props = props;
        this.throttle = throttle;
        this.clock = clock;
    }

    @PostMapping("/signup")
    public UserSummary signUp(@Valid @RequestBody SignUpRequest req, HttpServletRequest request) {
        User user = userService.signUp(req.handle(), req.nickname(), req.password());
        startSession(request, user);
        return UserSummary.of(user);
    }

    @PostMapping("/login")
    public UserSummary login(@Valid @RequestBody LoginRequest req, HttpServletRequest request) {
        String ip = request.getRemoteAddr();
        long now = clock.millis();
        throttle.check(ip, req.handle(), now);
        User user;
        try {
            user = userService.login(req.handle(), req.password());
        } catch (ApiException e) {
            throttle.failed(ip, req.handle(), now);
            throw e;
        }
        throttle.succeeded(ip, req.handle());
        startSession(request, user);
        return UserSummary.of(user);
    }

    /** A new session id on every login (no session fixation). */
    private static void startSession(HttpServletRequest request, User user) {
        HttpSession old = request.getSession(false);
        if (old != null) {
            old.invalidate();
        }
        request.getSession(true).setAttribute(SessionKeys.USER_ID, user.getId());
    }

    /** Development only (off in production): handle only, no password. */
    @PostMapping("/dev-login")
    public UserSummary devLogin(@Valid @RequestBody DevLoginRequest req, HttpServletRequest request) {
        if (props.auth() == null || !props.auth().devLoginEnabled()) {
            throw ApiException.forbidden("개발용 로그인이 꺼져 있어요.");
        }
        User user = userService.loginOrSignUp(req.handle(), req.nickname());
        startSession(request, user);
        return UserSummary.of(user);
    }

    /** Me, plus whether I may open the admin page (only this answer says so). */
    public record MeView(Long id, String handle, String nickname, boolean admin) {
    }

    @GetMapping("/me")
    public ResponseEntity<MeView> me(@LoginUser(required = false) Long userId) {
        if (userId == null) {
            return ResponseEntity.noContent().build();
        }
        User user = userService.get(userId);
        return ResponseEntity.ok(new MeView(user.getId(), user.getHandle(), user.getNickname(), adminGuard.isAdmin(user)));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        return ResponseEntity.noContent().build();
    }
}
