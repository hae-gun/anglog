package com.jjaklog.user;

import com.jjaklog.common.ApiException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Runs on every request with a login session: turns away suspended accounts and records, once a day,
 * that the owner was active (for the admin page's daily active owners). Kept in memory so it costs
 * nothing on most requests; the API is a single server.
 */
@Component
public class UserGate {

    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final ZoneId zone;
    private final Set<Long> suspended = ConcurrentHashMap.newKeySet();
    private final Map<Long, LocalDate> recorded = new ConcurrentHashMap<>();

    public UserGate(JdbcTemplate jdbc, Clock clock, com.jjaklog.common.JjaklogProperties props) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.zone = props.zoneId();
    }

    /** Read once, on first use (after Flyway has run), then kept in step by setSuspended. */
    private volatile boolean loaded;

    private Set<Long> suspendedIds() {
        if (!loaded) {
            synchronized (this) {
                if (!loaded) {
                    suspended.addAll(jdbc.queryForList("SELECT id FROM users WHERE suspended_at IS NOT NULL", Long.class));
                    loaded = true;
                }
            }
        }
        return suspended;
    }

    public static ApiException suspended() {
        return new ApiException(HttpStatus.FORBIDDEN, "SUSPENDED", "이용이 정지된 계정이에요. 문의는 앵로그 운영자에게 해 주세요.");
    }

    public boolean isSuspended(Long userId) {
        return suspendedIds().contains(userId);
    }

    public void setSuspended(Long userId, boolean on) {
        if (on) {
            suspendedIds().add(userId);
        } else {
            suspendedIds().remove(userId);
        }
    }

    public void touch(Long userId) {
        LocalDate today = LocalDate.now(clock.withZone(zone));
        if (today.equals(recorded.get(userId))) {
            return;
        }
        recorded.put(userId, today);
        try {
            // runs outside any transaction (argument resolving), so a duplicate does not spoil anything
            jdbc.update("INSERT INTO user_activity (user_id, active_date) VALUES (?, ?)", userId, today);
        } catch (DataIntegrityViolationException alreadyThere) {
            // recorded earlier today (before a restart)
        }
        if (recorded.size() > 50_000) {
            recorded.clear();
        }
    }
}
