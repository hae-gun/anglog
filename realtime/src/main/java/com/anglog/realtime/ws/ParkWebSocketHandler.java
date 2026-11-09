package com.anglog.realtime.ws;

import com.anglog.realtime.config.ParkProperties;
import com.anglog.realtime.park.Channel;
import com.anglog.realtime.park.Channels;
import com.anglog.realtime.park.PrankRules;
import com.anglog.realtime.protocol.CloseCodes;
import com.anglog.realtime.protocol.LookRules;
import com.anglog.realtime.protocol.Messages;
import com.anglog.realtime.protocol.Messages.ErrorMessage;
import com.anglog.realtime.protocol.Messages.Look;
import com.anglog.realtime.protocol.Messages.Pong;
import com.anglog.realtime.protocol.Messages.Kicked;
import com.anglog.realtime.protocol.Messages.PrankNo;
import com.anglog.realtime.protocol.Messages.Replaced;
import com.anglog.realtime.protocol.Messages.Spot;
import com.anglog.realtime.protocol.Messages.Welcome;
import com.anglog.realtime.protocol.Pose;
import com.anglog.realtime.admin.ParkWatch;
import com.anglog.realtime.session.ClientSession;
import com.anglog.realtime.session.LastSpots;
import com.anglog.realtime.session.ParkTokens;
import com.anglog.realtime.session.SessionRegistry;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * Every inbound frame. Implements docs/park-realtime.md v1: hello/welcome, ping/pong, move, look, emote, say,
 * and pranks between birds (prank, answer, calm).
 * Anything too fast is dropped without an answer; the browser has already shown it to its own player.
 */
@Component
public class ParkWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(ParkWebSocketHandler.class);
    private static final int SEND_TIME_LIMIT_MS = 5_000;
    // a welcome of a full channel: 50 players of roughly 250 bytes
    private static final int SEND_BUFFER_LIMIT_BYTES = 128 * 1024;
    static final Set<String> EMOTES = Set.of("chirp", "dance");
    private static final long CALM_MIN_GAP_MS = 1_000;

    private final ParkProperties props;
    private final SessionRegistry registry;
    private final Channels channels;
    private final LookRules looks;
    private final MessageSender sender;
    private final ObjectMapper mapper;
    private final PrankRules prankRules;
    private final ParkTokens tokens;
    private final LastSpots spots;
    private final ParkWatch watch;

    public ParkWebSocketHandler(ParkProperties props, SessionRegistry registry, Channels channels, LookRules looks,
                                MessageSender sender, ObjectMapper mapper, ParkWatch watch) {
        this.watch = watch;
        this.props = props;
        this.registry = registry;
        this.channels = channels;
        this.looks = looks;
        this.sender = sender;
        this.mapper = mapper;
        this.prankRules = PrankRules.from(props);
        this.tokens = new ParkTokens(props.tokenSecret());
        this.spots = new LastSpots(props.spotMemoryMs());
        if (!tokens.enabled()) {
            log.warn("angpark.token-secret is empty: every bird is a guest and house links are off");
        }
    }

    // ---------------------------------------------------------------- lifecycle

    @Override
    public void afterConnectionEstablished(WebSocketSession raw) {
        WebSocketSession socket = new ConcurrentWebSocketSessionDecorator(raw, SEND_TIME_LIMIT_MS, SEND_BUFFER_LIMIT_BYTES);
        ClientSession session = new ClientSession(socket, remoteIp(raw), now());
        if (registry.add(session) > props.maxConnectionsPerIp()) {
            sender.close(session, CloseCodes.TOO_MANY_CONNECTIONS);
        } else if (watch.bannedAddr(session.remoteIp(), now())) {
            kick(session);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession raw, CloseStatus status) {
        ClientSession session = registry.remove(raw.getId());
        if (session != null && session.isReady()) {
            if (session.ownerId() > 0) {
                Channel channel = channels.get(session.channelNo());
                spots.remember(session.ownerId(), channel == null ? null : channel.pose(session.pid()), now());
                registry.releaseOwner(session.ownerId(), session);
            }
            channels.leave(session.channelNo(), session.pid());
        }
    }

    @Override
    public void handleTransportError(WebSocketSession raw, Throwable exception) {
        log.debug("transport error on {}: {}", raw.getId(), exception.getMessage());
    }

    public void close(ClientSession session, CloseStatus status) {
        sender.close(session, status);
    }

    /** An admin sent this bird out (or its address is kept out for now). */
    public void kick(ClientSession session) {
        sender.send(session, Kicked.of());
        sender.close(session, CloseCodes.KICKED);
    }

    // ---------------------------------------------------------------- inbound

    @Override
    protected void handleTextMessage(WebSocketSession raw, TextMessage message) {
        ClientSession session = registry.get(raw.getId());
        if (session == null) {
            return;
        }
        if (message.getPayload().getBytes(StandardCharsets.UTF_8).length > props.maxMessageBytes()) {
            sender.close(session, CloseCodes.MESSAGE_TOO_LARGE);
            return;
        }
        JsonNode msg;
        try {
            msg = mapper.readTree(message.getPayload());
        } catch (Exception e) {
            sender.send(session, ErrorMessage.of(Messages.ERR_BAD_MESSAGE, "not JSON"));
            return;
        }
        String type = msg.path("type").asText("");
        if (!session.isReady() && !"hello".equals(type)) {
            sender.send(session, ErrorMessage.of(Messages.ERR_NOT_READY, "send hello first"));
            return;
        }
        switch (type) {
            case "hello" -> onHello(session, msg);
            case "ping" -> onPing(session, msg);
            case "move" -> onMove(session, msg);
            case "look" -> onLook(session, msg);
            case "emote" -> onEmote(session, msg);
            case "say" -> onSay(session, msg);
            case "prank" -> onPrank(session, msg);
            case "answer" -> onAnswer(session, msg);
            case "calm" -> onCalm(session, msg);
            default -> sender.send(session, ErrorMessage.of(Messages.ERR_UNKNOWN_TYPE, "unknown type: " + type));
        }
    }

    private void onHello(ClientSession session, JsonNode msg) {
        if (session.isReady()) {
            sender.send(session, ErrorMessage.of(Messages.ERR_BAD_MESSAGE, "hello already received"));
            return;
        }
        if (msg.path("v").asInt(-1) != props.protocolVersion()) {
            sender.close(session, CloseCodes.VERSION_MISMATCH);
            return;
        }
        long now = now();
        Pose pose = Pose.from(msg, props.worldLimit(), props.heightLimit());
        if (pose == null) {
            pose = new Pose(0, 0, 23, 0, 0); // the ginkgo gate
        }
        // only a verified owner gets a house link; a home typed into hello is dropped
        ParkTokens.Owner owner = tokens.verify(msg.path("token").asText(null), now);
        if (owner != null && watch.bannedOwner(owner.userId(), now)) {
            kick(session);
            return;
        }
        Pose spot = null;
        if (owner != null) {
            session.owner(owner.userId(), owner.handle());
            ClientSession before = registry.claimOwner(owner.userId(), session);
            if (before != null && before.isReady()) {
                // the same owner in another tab or device: that bird leaves the park, and this one comes out where it was
                Channel old = channels.get(before.channelNo());
                spot = old == null ? null : old.pose(before.pid());
                sender.send(before, Replaced.of());
                sender.close(before, CloseCodes.REPLACED);
            }
            if (spot == null) {
                spot = spots.take(owner.userId(), now);
            }
            if (spot != null) {
                pose = new Pose(spot.x(), spot.y(), spot.z(), spot.ry(), 0);
            }
        }
        Look raw = looks.normalize(msg.get("look"));
        // the house link shows only when the browser asks for it (a bird of my own) and the token proves whose it is
        Look look = new Look(raw.name(), raw.species(), raw.colors(), owner != null && raw.home() != null ? owner.handle() : null);
        Channels.Joined joined = channels.enter(look, pose, msg.path("calm").asBoolean(false));
        Channel channel = joined.channel();
        session.ready(channel.no(), joined.pid(), now);
        watch.hello(session.remoteIp(), session.ownerId(), channels.total());
        // into the broadcast set before the snapshot, so nothing falls between them;
        // the next batch may repeat someone the snapshot already has, and the browser ignores the repeat
        registry.joinChannel(session);
        sender.send(session, Welcome.of(props.protocolVersion(), joined.pid(), channel.no(), props.channelCapacity(),
                channel.size(), props.presenceMs(), props.moveMinGapMs() + 50, props.heartbeatMs(),
                channel.snapshot(joined.pid()), Spot.of(spot), owner != null));
    }

    private void onPing(ClientSession session, JsonNode msg) {
        long now = now();
        session.touchPing(now);
        sender.send(session, Pong.of(msg.path("t").asLong(0), now));
    }

    private void onMove(ClientSession session, JsonNode msg) {
        long now = now();
        // moving counts as being alive too
        session.touchPing(now);
        if (!session.acceptMove(now, props.moveMinGapMs())) {
            return;
        }
        Pose pose = Pose.from(msg, props.worldLimit(), props.heightLimit());
        Channel channel = channels.get(session.channelNo());
        if (pose != null && channel != null) {
            channel.move(session.pid(), pose);
        }
    }

    private void onLook(ClientSession session, JsonNode msg) {
        if (!session.acceptLook(now(), props.lookMinGapMs())) {
            return;
        }
        Channel channel = channels.get(session.channelNo());
        if (channel != null) {
            Look raw = looks.normalize(msg.get("look"));
            channel.look(session.pid(), new Look(raw.name(), raw.species(), raw.colors(), raw.home() != null ? session.home() : null));
        }
    }

    private void onEmote(ClientSession session, JsonNode msg) {
        String id = msg.path("id").asText("");
        if (!EMOTES.contains(id) || !session.acceptEmote(now(), props.emoteMinGapMs())) {
            return;
        }
        Channel channel = channels.get(session.channelNo());
        if (channel != null) {
            channel.emote(session.pid(), id);
        }
    }

    private void onSay(ClientSession session, JsonNode msg) {
        JsonNode n = msg.get("n");
        if (n == null || !n.isInt() || n.asInt() < 0 || n.asInt() >= props.phraseCount()
                || !session.acceptSay(now(), props.sayMinGapMs())) {
            return;
        }
        Channel channel = channels.get(session.channelNo());
        if (channel != null) {
            channel.say(session.pid(), n.asInt());
        }
    }

    private void onPrank(ClientSession session, JsonNode msg) {
        JsonNode to = msg.get("to");
        JsonNode k = msg.get("k");
        if (to == null || !to.isInt() || k == null || !k.isInt() || k.asInt() < 0 || k.asInt() >= PrankRules.KINDS) {
            return;
        }
        long now = now();
        if (!session.acceptPrank(now, props.prankMinGapMs())) {
            sender.send(session, PrankNo.of(to.asInt(), "wait"));
            return;
        }
        Channel channel = channels.get(session.channelNo());
        if (channel == null) {
            return;
        }
        Channel.PrankResult r = channel.prank(session.pid(), to.asInt(), k.asInt(), now, prankRules);
        if (r != Channel.PrankResult.OK) {
            sender.send(session, PrankNo.of(to.asInt(), r.name().toLowerCase()));
        }
    }

    private void onAnswer(ClientSession session, JsonNode msg) {
        JsonNode to = msg.get("to");
        JsonNode a = msg.get("a");
        if (to == null || !to.isInt() || a == null || !a.isInt() || a.asInt() < 0 || a.asInt() >= PrankRules.ANSWERS) {
            return;
        }
        Channel channel = channels.get(session.channelNo());
        if (channel != null) {
            // a late or made-up answer has no waiting prank and is dropped
            channel.answer(session.pid(), to.asInt(), a.asInt(), now(), prankRules);
        }
    }

    private void onCalm(ClientSession session, JsonNode msg) {
        JsonNode on = msg.get("on");
        if (on == null || !on.isBoolean() || !session.acceptCalm(now(), CALM_MIN_GAP_MS)) {
            return;
        }
        Channel channel = channels.get(session.channelNo());
        if (channel != null) {
            channel.calm(session.pid(), on.asBoolean());
        }
    }

    // ---------------------------------------------------------------- helpers

    private static String remoteIp(WebSocketSession raw) {
        InetSocketAddress addr = raw.getRemoteAddress();
        if (addr == null) {
            return "unknown";
        }
        return addr.getAddress() != null ? addr.getAddress().getHostAddress() : addr.getHostString();
    }

    private static long now() {
        return System.currentTimeMillis();
    }
}
