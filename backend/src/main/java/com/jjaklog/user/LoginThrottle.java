package com.jjaklog.user;

import com.jjaklog.common.ApiException;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Slows down password guessing: at most 8 failed logins for one handle from one IP, and 30 from
 * one IP for any handle, in a sliding 10 minutes. In memory, so a restart forgets (one server).
 */
@Component
public class LoginThrottle {

    static final long WINDOW_MS = 10 * 60 * 1000;
    static final int PER_HANDLE = 8;
    static final int PER_IP = 30;

    private final Map<String, Deque<Long>> failures = new ConcurrentHashMap<>();

    public void check(String ip, String handle, long now) {
        if (count("h:" + ip + ":" + key(handle), now) >= PER_HANDLE || count("ip:" + ip, now) >= PER_IP) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_ATTEMPTS", "로그인을 너무 많이 시도했어요. 10분 뒤에 다시 해 주세요.");
        }
    }

    public void failed(String ip, String handle, long now) {
        add("h:" + ip + ":" + key(handle), now);
        add("ip:" + ip, now);
        if (failures.size() > 20_000) {
            failures.entrySet().removeIf(e -> count(e.getKey(), now) == 0);
        }
    }

    public void succeeded(String ip, String handle) {
        failures.remove("h:" + ip + ":" + key(handle));
    }

    private static String key(String handle) {
        return handle == null ? "" : handle.trim().toLowerCase();
    }

    private void add(String k, long now) {
        Deque<Long> q = failures.computeIfAbsent(k, x -> new ArrayDeque<>());
        synchronized (q) {
            q.addLast(now);
        }
    }

    private int count(String k, long now) {
        Deque<Long> q = failures.get(k);
        if (q == null) {
            return 0;
        }
        synchronized (q) {
            while (!q.isEmpty() && now - q.peekFirst() > WINDOW_MS) {
                q.pollFirst();
            }
            return q.size();
        }
    }
}
