package com.anglog.realtime.protocol;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/** Server-to-client messages of docs/park-realtime.md v1. Each carries its own "type". */
public final class Messages {

    public static final String ERR_BAD_MESSAGE = "BAD_MESSAGE";
    public static final String ERR_NOT_READY = "NOT_READY";
    public static final String ERR_UNKNOWN_TYPE = "UNKNOWN_TYPE";

    private Messages() {
    }

    /** How a bird looks. Always normalized by LookRules before it is stored or sent. */
    public record Look(String name, String species, Colors colors, String home) {
    }

    public record Colors(String face, String head, String body, String wing, String tail) {
    }

    /** Someone in the park: id within the channel, look, position, yaw, pose code, and whether they take pranks. */
    public record PlayerView(int pid, Look look, double x, double y, double z, double ry, int m, boolean calm) {
    }

    /**
     * spot: where the server put this bird instead of where hello said, because the owner's bird was
     * already there (another tab or device) or was there a little while ago. Left out otherwise.
     * owner: whether the park token was accepted (so the house link is shown to others).
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Welcome(String type, int v, int pid, int channel, int capacity, int online,
                          long presenceMs, long moveMs, long heartbeatMs, List<PlayerView> players, Spot spot, boolean owner) {
        public static Welcome of(int v, int pid, int channel, int capacity, int online,
                                 long presenceMs, long moveMs, long heartbeatMs, List<PlayerView> players, Spot spot, boolean owner) {
            return new Welcome("welcome", v, pid, channel, capacity, online, presenceMs, moveMs, heartbeatMs, players, spot, owner);
        }
    }

    public record Spot(double x, double y, double z, double ry) {
        public static Spot of(Pose p) {
            return p == null ? null : new Spot(p.x(), p.y(), p.z(), p.ry());
        }
    }

    /** Sent right before an admin closes this bird with 4007. */
    public record Kicked(String type) {
        public static Kicked of() {
            return new Kicked("kicked");
        }
    }

    /** Sent to a tab right before it is closed with 4006 because the same owner came in elsewhere. */
    public record Replaced(String type) {
        public static Replaced of() {
            return new Replaced("replaced");
        }
    }

    /** A new look for someone already in the park. */
    public record LookChange(int pid, Look look) {
    }

    /**
     * Everything that changed in one channel during one tick.
     * moved: [pid, x, y, z, ry, m], emotes: [pid, id], says: [pid, phrase index],
     * pranks: [from, to, kind], answers: [from, to, answer] (from answers the prank "to" played on them),
     * calms: [pid, 1 or 0]. Empty lists are left out.
     */
    @JsonInclude(JsonInclude.Include.NON_EMPTY)
    public record Presence(String type, int channel, int online, List<PlayerView> joined, List<Object[]> moved,
                           List<Integer> left, List<LookChange> looks, List<Object[]> emotes, List<int[]> says,
                           List<int[]> pranks, List<int[]> answers, List<int[]> calms) {
        public static Presence of(int channel, int online, List<PlayerView> joined, List<Object[]> moved,
                                  List<Integer> left, List<LookChange> looks, List<Object[]> emotes, List<int[]> says,
                                  List<int[]> pranks, List<int[]> answers, List<int[]> calms) {
            return new Presence("presence", channel, online, joined, moved, left, looks, emotes, says, pranks, answers, calms);
        }
    }

    /** Only to the bird who tried a prank the server turned down. why: calm, far, wait, blocked, gone. */
    public record PrankNo(String type, int to, String why) {
        public static PrankNo of(int to, String why) {
            return new PrankNo("prankNo", to, why);
        }
    }

    public record Pong(String type, long t, long now) {
        public static Pong of(long t, long now) {
            return new Pong("pong", t, now);
        }
    }

    public record ErrorMessage(String type, String code, String message) {
        public static ErrorMessage of(String code, String message) {
            return new ErrorMessage("error", code, message);
        }
    }
}
