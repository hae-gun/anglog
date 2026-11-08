package com.anglog.realtime.park;

import com.anglog.realtime.protocol.Messages.LookChange;
import com.anglog.realtime.protocol.Messages.Look;
import com.anglog.realtime.protocol.Messages.PlayerView;
import com.anglog.realtime.protocol.Pose;
import java.util.ArrayList;
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
                        List<LookChange> looks, List<Object[]> emotes, List<int[]> says) {
    }

    private static final class Player {
        final int pid;
        Look look;
        Pose pose;

        Player(int pid, Look look, Pose pose) {
            this.pid = pid;
            this.look = look;
            this.pose = pose;
        }

        PlayerView view() {
            return new PlayerView(pid, look, pose.x(), pose.y(), pose.z(), pose.ry(), pose.m());
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

    public Channel(int no) {
        this.no = no;
    }

    public int no() {
        return no;
    }

    /** @return the new player's id; ids are never reused within a channel */
    public synchronized int join(Look look, Pose pose) {
        int pid = nextPid++;
        players.put(pid, new Player(pid, look, pose));
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

    public synchronized void leave(int pid) {
        if (players.remove(pid) == null) {
            return;
        }
        joined.remove(pid);
        moved.remove(pid);
        looked.remove(pid);
        emotes.removeIf(e -> ((Integer) e[0]) == pid);
        says.removeIf(s -> s[0] == pid);
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

    public synchronized int size() {
        return players.size();
    }

    /** @return the changes since the last call, or null when nothing changed */
    public synchronized Batch drain() {
        if (joined.isEmpty() && moved.isEmpty() && looked.isEmpty() && left.isEmpty() && emotes.isEmpty() && says.isEmpty()) {
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
        Batch batch = new Batch(players.size(), j, m, List.copyOf(left), l, List.copyOf(emotes), List.copyOf(says));
        joined.clear();
        moved.clear();
        looked.clear();
        left.clear();
        emotes.clear();
        says.clear();
        return batch;
    }
}
