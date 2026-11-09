package com.anglog.realtime.admin;

import com.anglog.realtime.config.ParkProperties;
import com.anglog.realtime.park.Channel;
import com.anglog.realtime.park.Channels;
import com.anglog.realtime.protocol.Messages.Look;
import com.anglog.realtime.protocol.Messages.PlayerView;
import com.anglog.realtime.session.ClientSession;
import com.anglog.realtime.session.SessionRegistry;
import com.anglog.realtime.ws.ParkWebSocketHandler;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * For the 앵로그 admin page only, called by the API inside the docker network. The proxy in front
 * never forwards /internal, and every call still needs the shared key (the park token secret).
 */
@RestController
@RequestMapping("/internal/park")
public class InternalController {

    public record Bird(int pid, String name, String species, String home, boolean owner, boolean calm,
                       String addr, String since, double x, double z) {
    }

    public record ChannelView(int no, int size, List<Bird> birds) {
    }

    public record State(int online, int capacity, List<ChannelView> channels, ParkWatch.Today today, int banned) {
    }

    public record KickRequest(int channel, int pid, int minutes) {
    }

    private final byte[] key;
    private final Channels channels;
    private final SessionRegistry registry;
    private final ParkWatch watch;
    private final ParkWebSocketHandler handler;

    public InternalController(ParkProperties props, Channels channels, SessionRegistry registry, ParkWatch watch,
                              ParkWebSocketHandler handler) {
        String secret = props.tokenSecret();
        this.key = secret == null || secret.isBlank() ? null : secret.getBytes(StandardCharsets.UTF_8);
        this.channels = channels;
        this.registry = registry;
        this.watch = watch;
        this.handler = handler;
    }

    private boolean allowed(String given) {
        return key != null && given != null && MessageDigest.isEqual(key, given.getBytes(StandardCharsets.UTF_8));
    }

    @GetMapping
    public ResponseEntity<State> state(@RequestHeader(value = "X-Admin-Key", required = false) String given) {
        if (!allowed(given)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        List<ChannelView> list = new ArrayList<>();
        for (Channel c : channels.list()) {
            Map<Integer, ClientSession> sessions = new java.util.HashMap<>();
            for (ClientSession s : registry.channelMembers(c.no())) {
                if (s.isReady()) {
                    sessions.put(s.pid(), s);
                }
            }
            List<Bird> birds = new ArrayList<>();
            for (PlayerView p : c.snapshot(-1)) {
                ClientSession s = sessions.get(p.pid());
                Look l = p.look();
                birds.add(new Bird(p.pid(), l.name(), l.species(), l.home(), s != null && s.ownerId() > 0, p.calm(),
                        s == null ? null : ParkWatch.addrKey(s.remoteIp()),
                        s == null ? null : Instant.ofEpochMilli(s.connectedAt()).toString(), p.x(), p.z()));
            }
            list.add(new ChannelView(c.no(), birds.size(), birds));
        }
        return ResponseEntity.ok(new State(channels.total(), channels.capacity(), list, watch.today(),
                watch.bannedCount(System.currentTimeMillis())));
    }

    /** Sends one bird out and keeps its address (and account, if any) out for the given minutes. */
    @PostMapping("/kick")
    public ResponseEntity<Map<String, Object>> kick(@RequestHeader(value = "X-Admin-Key", required = false) String given,
                                                    @RequestBody KickRequest req) {
        if (!allowed(given)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        for (ClientSession s : registry.channelMembers(req.channel())) {
            if (s.isReady() && s.pid() == req.pid()) {
                long until = System.currentTimeMillis() + Math.max(0, req.minutes()) * 60_000L;
                if (req.minutes() > 0) {
                    watch.ban(s.remoteIp(), s.ownerId(), until);
                }
                handler.kick(s);
                return ResponseEntity.ok(Map.<String, Object>of("ok", true, "minutes", req.minutes()));
            }
        }
        return ResponseEntity.notFound().build();
    }
}
