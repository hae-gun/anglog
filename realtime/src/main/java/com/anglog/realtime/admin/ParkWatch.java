package com.anglog.realtime.admin;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * What the admin page needs from the park, in memory only: today's numbers (Korea time) and who is
 * kept out for a while. A restart forgets both, which is fine for a small park.
 * Addresses are never shown or kept as they are, only as a short one-way hash.
 */
@Component
public class ParkWatch {

    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

    private final long startedAt = System.currentTimeMillis();
    private LocalDate day = LocalDate.now(ZONE);
    private final Set<String> visitors = ConcurrentHashMap.newKeySet();
    private final Set<Long> owners = ConcurrentHashMap.newKeySet();
    private long hellos;
    private int peak;
    private final Map<String, Long> bannedAddr = new ConcurrentHashMap<>();
    private final Map<Long, Long> bannedOwner = new ConcurrentHashMap<>();

    public static String addrKey(String ip) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(("angpark:" + ip).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(h, 0, 4);
        } catch (Exception e) {
            return "?";
        }
    }

    /** A bird came into the park. */
    public synchronized void hello(String ip, long ownerId, int onlineNow) {
        rollDay();
        visitors.add(addrKey(ip));
        if (ownerId > 0) {
            owners.add(ownerId);
        }
        hellos++;
        peak = Math.max(peak, onlineNow);
    }

    private void rollDay() {
        LocalDate today = LocalDate.now(ZONE);
        if (!today.equals(day)) {
            day = today;
            visitors.clear();
            owners.clear();
            hellos = 0;
            peak = 0;
        }
    }

    public record Today(String date, int visitors, int owners, long hellos, int peak, String since) {
    }

    public synchronized Today today() {
        rollDay();
        return new Today(day.toString(), visitors.size(), owners.size(), hellos, peak, Instant.ofEpochMilli(startedAt).toString());
    }

    public void ban(String ip, long ownerId, long untilMs) {
        bannedAddr.put(addrKey(ip), untilMs);
        if (ownerId > 0) {
            bannedOwner.put(ownerId, untilMs);
        }
    }

    public boolean bannedAddr(String ip, long now) {
        return still(bannedAddr, addrKey(ip), now);
    }

    public boolean bannedOwner(long ownerId, long now) {
        return ownerId > 0 && still(bannedOwner, ownerId, now);
    }

    private static <K> boolean still(Map<K, Long> map, K key, long now) {
        Long until = map.get(key);
        if (until == null) {
            return false;
        }
        if (until <= now) {
            map.remove(key);
            return false;
        }
        return true;
    }

    /** Lets everyone back in (tests, or an admin changing their mind). */
    public void unbanAll() {
        bannedAddr.clear();
        bannedOwner.clear();
    }

    public int bannedCount(long now) {
        bannedAddr.values().removeIf(u -> u <= now);
        return bannedAddr.size();
    }
}
