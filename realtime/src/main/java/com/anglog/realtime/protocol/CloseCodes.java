package com.anglog.realtime.protocol;

import org.springframework.web.socket.CloseStatus;

/** WebSocket close codes, docs/park-realtime.md section 6. */
public final class CloseCodes {

    public static final CloseStatus VERSION_MISMATCH = new CloseStatus(4001, "VERSION_MISMATCH");
    public static final CloseStatus HEARTBEAT_TIMEOUT = new CloseStatus(4002, "HEARTBEAT_TIMEOUT");
    public static final CloseStatus TOO_MANY_CONNECTIONS = new CloseStatus(4004, "TOO_MANY_CONNECTIONS");
    public static final CloseStatus MESSAGE_TOO_LARGE = new CloseStatus(4005, "MESSAGE_TOO_LARGE");
    /** The same owner came in from another tab or device; the old one does not reconnect. */
    public static final CloseStatus REPLACED = new CloseStatus(4006, "REPLACED");

    private CloseCodes() {
    }
}
