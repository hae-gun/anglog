package com.anglog.realtime.session;

import com.anglog.realtime.config.ParkProperties;
import com.anglog.realtime.protocol.CloseCodes;
import com.anglog.realtime.ws.ParkWebSocketHandler;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Every 2 seconds: closes sockets that never said hello, or went quiet (no ping and no move). */
@Component
public class SessionSweeper {

    private final SessionRegistry registry;
    private final ParkWebSocketHandler handler;
    private final ParkProperties props;

    public SessionSweeper(SessionRegistry registry, ParkWebSocketHandler handler, ParkProperties props) {
        this.registry = registry;
        this.handler = handler;
        this.props = props;
    }

    @Scheduled(fixedDelay = 2_000)
    public void sweep() {
        long now = System.currentTimeMillis();
        for (ClientSession session : registry.all()) {
            boolean late = session.isReady()
                    ? now - session.lastPingAt() > props.heartbeatTimeoutMs()
                    : now - session.connectedAt() > props.helloTimeoutMs();
            if (late) {
                handler.close(session, CloseCodes.HEARTBEAT_TIMEOUT);
            }
        }
    }
}
