package com.anglog.realtime.park;

import com.anglog.realtime.config.ParkProperties;
import com.anglog.realtime.protocol.Messages.Look;
import com.anglog.realtime.protocol.Pose;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeMap;
import java.util.function.BiConsumer;
import org.springframework.stereotype.Component;

/**
 * Open copies of the park. A newcomer goes into the lowest-numbered channel with room, so people
 * end up together instead of spread thin; a new channel opens only when all are full.
 * Lock order: this object, then a Channel (Channel never calls back here).
 */
@Component
public class Channels {

    /** Where a newcomer landed. */
    public record Joined(Channel channel, int pid) {
    }

    private final int capacity;
    private final TreeMap<Integer, Channel> open = new TreeMap<>();

    public Channels(ParkProperties props) {
        this.capacity = props.channelCapacity();
    }

    public synchronized Joined enter(Look look, Pose pose) {
        for (Channel c : open.values()) {
            if (c.size() < capacity) {
                return new Joined(c, c.join(look, pose));
            }
        }
        int no = 1;
        while (open.containsKey(no)) {
            no++;
        }
        Channel c = new Channel(no);
        open.put(no, c);
        return new Joined(c, c.join(look, pose));
    }

    public synchronized Channel get(int no) {
        return open.get(no);
    }

    public synchronized void leave(int no, int pid) {
        Channel c = open.get(no);
        if (c != null) {
            c.leave(pid);
        }
    }

    public synchronized List<Channel> list() {
        return new ArrayList<>(open.values());
    }

    public synchronized int total() {
        int n = 0;
        for (Channel c : open.values()) {
            n += c.size();
        }
        return n;
    }

    public int capacity() {
        return capacity;
    }

    /** Hands every channel's batch to the consumer, then closes channels that emptied (channel 1 stays). */
    public void drainAll(BiConsumer<Integer, Channel.Batch> consumer) {
        for (Channel c : list()) {
            Channel.Batch b = c.drain();
            if (b != null) {
                consumer.accept(c.no(), b);
            }
            if (c.no() != 1 && b != null && b.online() == 0) {
                closeIfEmpty(c);
            }
        }
    }

    private synchronized void closeIfEmpty(Channel c) {
        if (c.size() == 0) {
            open.remove(c.no(), c);
        }
    }
}
