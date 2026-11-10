package com.anglog.realtime.park;

import com.anglog.realtime.protocol.Messages.LookChange;
import com.anglog.realtime.protocol.Messages.Look;
import com.anglog.realtime.protocol.Messages.PlayerView;
import com.anglog.realtime.protocol.Pose;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * One copy of the park with up to channel-capacity birds. Changes collect here between ticks
 * and leave as one batch (see PresenceBroadcaster). All methods lock this object.
 */
public final class Channel {

    /** What changed since the last tick. */
    public record Batch(int online, List<PlayerView> joined, List<Object[]> moved, List<Integer> left,
                        List<LookChange> looks, List<Object[]> emotes, List<int[]> says,
                        List<int[]> pranks, List<int[]> answers, List<int[]> calms, List<int[]> boxes) {
    }

    /**
     * 빼빼로 숲 boxes (the November event): BOXES spots laid out the same on every screen (frontend
     * room3d/pepero.js). The first bird to open one gets it; it comes back BOX_BACK_MS later.
     */
    public static final int BOXES = 10;
    public static final long BOX_BACK_MS = 10_000;

    /** What happened to a prank. Everything but OK is told only to the prankster. */
    public enum PrankResult { OK, GONE, CALM, FAR, WAIT, BLOCKED }

    private static final class Player {
        final int pid;
        Look look;
        Pose pose;
        boolean calm;

        Player(int pid, Look look, Pose pose) {
            this.pid = pid;
            this.look = look;
            this.pose = pose;
        }

        PlayerView view() {
            return new PlayerView(pid, look, pose.x(), pose.y(), pose.z(), pose.ry(), pose.m(), calm);
        }
    }

    private final int no;
    private final Map<Integer, Player> players = new LinkedHashMap<>();
    private int nextPid = 1;

    private final Set<Integer> joined = new LinkedHashSet<>();
    private final Set<Integer> moved = new LinkedHashSet<>();
    private final Set<Integer> looked = new LinkedHashSet<>();
    private final List<Integer> left = new ArrayList<>();
    private final List<Object[]> emotes = new ArrayList<>();
    private final List<int[]> says = new ArrayList<>();
    private final List<int[]> pranks = new ArrayList<>();
    private final List<int[]> answers = new ArrayList<>();
    private final List<int[]> calms = new ArrayList<>();
    private final List<int[]> boxes = new ArrayList<>();
    private final long[] boxBackAt = new long[BOXES]; // 0: there to open

    // per (prankster, target) pair; cleared when either leaves, so at most capacity squared entries
    private final Map<Long, Long> lastPrankAt = new HashMap<>();
    private final Map<Long, Long> answerUntil = new HashMap<>();
    private final Map<Long, Integer> ignoresInARow = new HashMap<>();
    private final Map<Long, Long> blockedUntil = new HashMap<>();

    public Channel(int no) {
        this.no = no;
    }

    public int no() {
        return no;
    }

    /** @return the new player's id; ids are never reused within a channel */
    public synchronized int join(Look look, Pose pose) {
        return join(look, pose, false);
    }

    public synchronized int join(Look look, Pose pose, boolean calm) {
        int pid = nextPid++;
        Player p = new Player(pid, look, pose);
        p.calm = calm;
        players.put(pid, p);
        joined.add(pid);
        return pid;
    }

    public synchronized void move(int pid, Pose pose) {
        Player p = players.get(pid);
        if (p == null) {
            return;
        }
        p.pose = pose;
        // someone who joined this tick is announced with their latest position anyway
        if (!joined.contains(pid)) {
            moved.add(pid);
        }
    }

    public synchronized void look(int pid, Look look) {
        Player p = players.get(pid);
        if (p == null) {
            return;
        }
        p.look = look;
        if (!joined.contains(pid)) {
            looked.add(pid);
        }
    }

    public synchronized void emote(int pid, String id) {
        if (players.containsKey(pid)) {
            emotes.add(new Object[] {pid, id});
        }
    }

    public synchronized void say(int pid, int phrase) {
        if (players.containsKey(pid)) {
            says.add(new int[] {pid, phrase});
        }
    }

    // ---------------------------------------------------------------- pranks

    private static long pair(int from, int to) {
        return ((long) from << 32) | (to & 0xffffffffL);
    }

    /**
     * One bird pranks another. The server checks what the browsers cannot be trusted with:
     * both are here, the target takes pranks, they are close, not too often, and not after being ignored.
     */
    public synchronized PrankResult prank(int from, int to, int kind, long now, PrankRules rules) {
        Player a = players.get(from);
        Player b = players.get(to);
        if (from == to || a == null || b == null) {
            return PrankResult.GONE;
        }
        if (b.calm) {
            return PrankResult.CALM;
        }
        long key = pair(from, to);
        Long blocked = blockedUntil.get(key);
        if (blocked != null && blocked > now) {
            return PrankResult.BLOCKED;
        }
        double d = Math.sqrt(Math.pow(a.pose.x() - b.pose.x(), 2) + Math.pow(a.pose.y() - b.pose.y(), 2)
                + Math.pow(a.pose.z() - b.pose.z(), 2));
        if (d > rules.range()) {
            return PrankResult.FAR;
        }
        Long last = lastPrankAt.get(key);
        if (last != null && now - last < rules.sameTargetGapMs()) {
            return PrankResult.WAIT;
        }
        lastPrankAt.put(key, now);
        answerUntil.put(key, now + rules.answerWindowMs());
        pranks.add(new int[] {from, to, kind});
        return PrankResult.OK;
    }

    /**
     * The target ("from" here) answers the prank "to" played on them: back, make up, or ignore.
     * Answering back is a prank in return, so the other bird may answer that one in turn.
     * @return false when there is no prank waiting for an answer
     */
    public synchronized boolean answer(int from, int to, int answer, long now, PrankRules rules) {
        long key = pair(to, from);
        Long until = answerUntil.remove(key);
        if (until == null || until < now || !players.containsKey(from) || !players.containsKey(to)) {
            return false;
        }
        if (answer == PrankRules.ANSWER_IGNORE) {
            int n = ignoresInARow.merge(key, 1, Integer::sum);
            if (n >= rules.ignoreLimit()) {
                blockedUntil.put(key, now + rules.blockMs());
                ignoresInARow.remove(key);
            }
        } else {
            ignoresInARow.remove(key);
        }
        if (answer == PrankRules.ANSWER_BACK) {
            long back = pair(from, to);
            answerUntil.put(back, now + rules.answerWindowMs());
            lastPrankAt.put(back, now);
        }
        answers.add(new int[] {from, to, answer});
        return true;
    }

    /** Whether this bird takes pranks. Pranks already played on it can still be answered. */
    public synchronized void calm(int pid, boolean on) {
        Player p = players.get(pid);
        if (p == null || p.calm == on) {
            return;
        }
        p.calm = on;
        if (!joined.contains(pid)) {
            calms.add(new int[] {pid, on ? 1 : 0});
        }
    }

    public synchronized boolean isCalm(int pid) {
        Player p = players.get(pid);
        return p != null && p.calm;
    }

    public synchronized void leave(int pid) {
        if (players.remove(pid) == null) {
            return;
        }
        joined.remove(pid);
        moved.remove(pid);
        looked.remove(pid);
        emotes.removeIf(e -> ((Integer) e[0]) == pid);
        says.removeIf(s -> s[0] == pid);
        pranks.removeIf(e -> e[0] == pid);
        answers.removeIf(e -> e[0] == pid);
        calms.removeIf(e -> e[0] == pid);
        java.util.function.Predicate<Long> involves = k -> (int) (k >> 32) == pid || (int) (long) k == pid;
        lastPrankAt.keySet().removeIf(involves);
        answerUntil.keySet().removeIf(involves);
        ignoresInARow.keySet().removeIf(involves);
        blockedUntil.keySet().removeIf(involves);
        // always announced: a welcome sent this tick may already list them
        left.add(pid);
    }

    /** Everyone else in the channel, for a welcome. */
    public synchronized List<PlayerView> snapshot(int exceptPid) {
        List<PlayerView> list = new ArrayList<>(players.size());
        for (Player p : players.values()) {
            if (p.pid != exceptPid) {
                list.add(p.view());
            }
        }
        return list;
    }

    /** Where this bird is now, or null. */
    public synchronized Pose pose(int pid) {
        Player p = players.get(pid);
        return p == null ? null : p.pose;
    }

    public synchronized int size() {
        return players.size();
    }

    /** @return the changes since the last call, or null when nothing changed */
    /** @return true when this bird got the box; false when it is not there (someone was first) or no such box */
    public synchronized boolean openBox(int pid, int box, long now) {
        if (box < 0 || box >= BOXES || !players.containsKey(pid) || boxBackAt[box] != 0) {
            return false;
        }
        boxBackAt[box] = now + BOX_BACK_MS;
        boxes.add(new int[] {box, pid});
        return true;
    }

    /** Boxes opened and not back yet, for a bird that just came in. */
    public synchronized List<Integer> boxesAway() {
        List<Integer> out = new ArrayList<>();
        for (int i = 0; i < BOXES; i++) {
            if (boxBackAt[i] != 0) {
                out.add(i);
            }
        }
        return out;
    }

    public synchronized Batch drain() {
        return drain(System.currentTimeMillis());
    }

    public synchronized Batch drain(long now) {
        for (int i = 0; i < BOXES; i++) {
            if (boxBackAt[i] != 0 && boxBackAt[i] <= now) {
                boxBackAt[i] = 0;
                boxes.add(new int[] {i, 0});
            }
        }
        if (joined.isEmpty() && moved.isEmpty() && looked.isEmpty() && left.isEmpty() && emotes.isEmpty() && says.isEmpty()
                && pranks.isEmpty() && answers.isEmpty() && calms.isEmpty() && boxes.isEmpty()) {
            return null;
        }
        List<PlayerView> j = new ArrayList<>(joined.size());
        for (int pid : joined) {
            j.add(players.get(pid).view());
        }
        List<Object[]> m = new ArrayList<>(moved.size());
        for (int pid : moved) {
            Pose p = players.get(pid).pose;
            m.add(new Object[] {pid, p.x(), p.y(), p.z(), p.ry(), p.m()});
        }
        List<LookChange> l = new ArrayList<>(looked.size());
        for (int pid : looked) {
            l.add(new LookChange(pid, players.get(pid).look));
        }
        Batch batch = new Batch(players.size(), j, m, List.copyOf(left), l, List.copyOf(emotes), List.copyOf(says),
                List.copyOf(pranks), List.copyOf(answers), List.copyOf(calms), List.copyOf(boxes));
        joined.clear();
        moved.clear();
        looked.clear();
        left.clear();
        emotes.clear();
        says.clear();
        pranks.clear();
        answers.clear();
        calms.clear();
        boxes.clear();
        return batch;
    }
}
