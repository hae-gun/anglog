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
    private long lastMoveAt;
    private long lastLookAt;
    private long lastSayAt;
    private long lastEmoteAt;

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
