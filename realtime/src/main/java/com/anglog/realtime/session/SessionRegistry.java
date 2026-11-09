package com.anglog.realtime.session;

import java.util.Collection;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.stereotype.Component;

/** Connections held by this server, by socket id and by channel (for broadcasts). */
@Component
public class SessionRegistry {

    private final Map<String, ClientSession> byId = new ConcurrentHashMap<>();
    private final Map<Integer, Set<ClientSession>> byChannel = new ConcurrentHashMap<>();
    private final Map<String, AtomicInteger> perIp = new ConcurrentHashMap<>();
    private final Map<Long, ClientSession> byOwner = new ConcurrentHashMap<>();

    /** The owner's bird is now this tab. @return the tab it was before, if any */
    public ClientSession claimOwner(long userId, ClientSession session) {
        ClientSession before = byOwner.put(userId, session);
        return before == session ? null : before;
    }

    /** Only when this tab still holds the owner (a newer tab may have taken over already). */
    public void releaseOwner(long userId, ClientSession session) {
        byOwner.remove(userId, session);
    }

    /** @return connections from the same IP including this one */
    public int add(ClientSession session) {
        byId.put(session.id(), session);
        return perIp.computeIfAbsent(session.remoteIp(), ip -> new AtomicInteger()).incrementAndGet();
    }

    /** Idempotent: returns the session only the first time it is removed. */
    public ClientSession remove(String id) {
        ClientSession removed = byId.remove(id);
        if (removed != null) {
            perIp.computeIfPresent(removed.remoteIp(), (ip, n) -> n.decrementAndGet() <= 0 ? null : n);
            if (removed.isReady()) {
                Set<ClientSession> members = byChannel.get(removed.channelNo());
                if (members != null) {
                    members.remove(removed);
                }
            }
        }
        return removed;
    }

    public void joinChannel(ClientSession session) {
        byChannel.computeIfAbsent(session.channelNo(), no -> ConcurrentHashMap.newKeySet()).add(session);
    }

    public ClientSession get(String id) {
        return byId.get(id);
    }

    public Collection<ClientSession> all() {
        return byId.values();
    }

    public Set<ClientSession> channelMembers(int channelNo) {
        return byChannel.getOrDefault(channelNo, Set.of());
    }

    public int size() {
        return byId.size();
    }
}
