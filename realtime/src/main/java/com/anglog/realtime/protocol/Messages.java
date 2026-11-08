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

    /** Someone in the park: id within the channel, look, position, yaw and pose code. */
    public record PlayerView(int pid, Look look, double x, double y, double z, double ry, int m) {
    }

    public record Welcome(String type, int v, int pid, int channel, int capacity, int online,
                          long presenceMs, long moveMs, long heartbeatMs, List<PlayerView> players) {
        public static Welcome of(int v, int pid, int channel, int capacity, int online,
                                 long presenceMs, long moveMs, long heartbeatMs, List<PlayerView> players) {
            return new Welcome("welcome", v, pid, channel, capacity, online, presenceMs, moveMs, heartbeatMs, players);
        }
    }

    /** A new look for someone already in the park. */
    public record LookChange(int pid, Look look) {
    }

    /**
     * Everything that changed in one channel during one tick.
     * moved: [pid, x, y, z, ry, m], emotes: [pid, id], says: [pid, phrase index]. Empty lists are left out.
     */
    @JsonInclude(JsonInclude.Include.NON_EMPTY)
    public record Presence(String type, int channel, int online, List<PlayerView> joined, List<Object[]> moved,
                           List<Integer> left, List<LookChange> looks, List<Object[]> emotes, List<int[]> says) {
        public static Presence of(int channel, int online, List<PlayerView> joined, List<Object[]> moved,
                                  List<Integer> left, List<LookChange> looks, List<Object[]> emotes, List<int[]> says) {
            return new Presence("presence", channel, online, joined, moved, left, looks, emotes, says);
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
