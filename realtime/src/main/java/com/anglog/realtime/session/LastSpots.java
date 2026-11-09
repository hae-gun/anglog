package com.anglog.realtime.session;

import com.anglog.realtime.protocol.Pose;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Where each owner's bird last was, so it comes back on the same spot: after another tab or device
 * took over, or after a reload within the memory time. Memory only, like everything here.
 */
public final class LastSpots {

    private record Spot(Pose pose, long at) {
    }

    private static final int PRUNE_OVER = 2_000;

    private final long keepMs;
    private final Map<Long, Spot> spots = new ConcurrentHashMap<>();

    public LastSpots(long keepMs) {
        this.keepMs = keepMs;
    }

    public void remember(long userId, Pose pose, long now) {
        if (pose == null) {
            return;
        }
        spots.put(userId, new Spot(pose, now));
        if (spots.size() > PRUNE_OVER) {
            spots.values().removeIf(s -> now - s.at() > keepMs);
        }
    }

    /** @return the remembered spot if it is recent enough; it is used up either way */
    public Pose take(long userId, long now) {
        Spot s = spots.remove(userId);
        return s == null || now - s.at() > keepMs ? null : s.pose();
    }
}
