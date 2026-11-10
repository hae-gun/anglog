package com.anglog.realtime.session;

import org.springframework.web.socket.WebSocketSession;

/**
 * One WebSocket connection (one browser tab). The socket is wrapped in a
 * ConcurrentWebSocketSessionDecorator, so broadcasts from the scheduler thread can send safely.
 */
public final class ClientSession {

    private final WebSocketSession socket;
    private final String remoteIp;
    private final long connectedAt;

    private volatile boolean ready;
    private volatile int channelNo;
    private volatile int pid;
    private volatile long lastPingAt;
    private volatile long ownerId;
    private volatile String home;
    private long lastMoveAt;
    private long lastLookAt;
    private long lastSayAt;
    private long lastEmoteAt;
    private long lastPrankAt;
    private long lastCalmAt;

    public ClientSession(WebSocketSession socket, String remoteIp, long now) {
        this.socket = socket;
        this.remoteIp = remoteIp;
        this.connectedAt = now;
        this.lastPingAt = now;
    }

    /** Called once, when hello succeeds. */
    public void ready(int channelNo, int pid, long now) {
        this.channelNo = channelNo;
        this.pid = pid;
        this.lastPingAt = now;
        this.ready = true;
    }

    public void touchPing(long now) {
        this.lastPingAt = now;
    }

    public synchronized boolean acceptMove(long now, long gapMs) {
        if (now - lastMoveAt < gapMs) {
            return false;
        }
        lastMoveAt = now;
        return true;
    }

    public synchronized boolean acceptLook(long now, long gapMs) {
        if (lastLookAt != 0 && now - lastLookAt < gapMs) {
            return false;
        }
        lastLookAt = now;
        return true;
    }

    public synchronized boolean acceptSay(long now, long gapMs) {
        if (lastSayAt != 0 && now - lastSayAt < gapMs) {
            return false;
        }
        lastSayAt = now;
        return true;
    }

    public synchronized boolean acceptEmote(long now, long gapMs) {
        if (lastEmoteAt != 0 && now - lastEmoteAt < gapMs) {
            return false;
        }
        lastEmoteAt = now;
        return true;
    }

    public synchronized boolean acceptPrank(long now, long gapMs) {
        if (lastPrankAt != 0 && now - lastPrankAt < gapMs) {
            return false;
        }
        lastPrankAt = now;
        return true;
    }

    private long lastBoxAt;

    /** One box try at a time (a held-down button cannot sweep the forest). */
    public synchronized boolean acceptBox(long now, long gapMs) {
        if (lastBoxAt != 0 && now - lastBoxAt < gapMs) {
            return false;
        }
        lastBoxAt = now;
        return true;
    }

    public synchronized boolean acceptCalm(long now, long gapMs) {
        if (lastCalmAt != 0 && now - lastCalmAt < gapMs) {
            return false;
        }
        lastCalmAt = now;
        return true;
    }

    /** A verified owner (park token): their user id and handle. 0 and null for guests. */
    public void owner(long userId, String handle) {
        this.ownerId = userId;
        this.home = handle;
    }

    public long ownerId() {
        return ownerId;
    }

    public String home() {
        return home;
    }

    public WebSocketSession socket() {
        return socket;
    }

    public String id() {
        return socket.getId();
    }

    public String remoteIp() {
        return remoteIp;
    }

    public long connectedAt() {
        return connectedAt;
    }

    public boolean isReady() {
        return ready;
    }

    public boolean isOpen() {
        return socket.isOpen();
    }

    public int channelNo() {
        return channelNo;
    }

    public int pid() {
        return pid;
    }

    public long lastPingAt() {
        return lastPingAt;
    }
}
