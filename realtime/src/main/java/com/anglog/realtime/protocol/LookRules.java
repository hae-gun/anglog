package com.anglog.realtime.protocol;

import com.anglog.realtime.protocol.Messages.Colors;
import com.anglog.realtime.protocol.Messages.Look;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Turns whatever the browser sent as a look into something safe to show everyone.
 * Nothing is rejected: a bad part quietly falls back to a default, so a broken client still gets in.
 */
@Component
public class LookRules {

    public static final int NAME_MAX = 12;
    public static final String DEFAULT_NAME = "앵무";
    public static final Colors DEFAULT_COLORS = new Colors("#F3EDE0", "#F3EDE0", "#9BC9A0", "#7FAE86", "#7FAE86", null);

    static final Set<String> SPECIES = Set.of("LOVEBIRD", "BUDGIE", "COCKATIEL", "QUAKER", "GREEN_CHEEKED_CONURE", "OTHER");
    private static final Pattern COLOR = Pattern.compile("#[0-9a-fA-F]{6}");
    private static final Pattern HANDLE = Pattern.compile("[a-z0-9_]{3,20}");
    private static final Pattern INVISIBLE = Pattern.compile("[\\p{Cc}\\p{Cf}\\p{Co}\\p{Cn}]");

    private final BlockedWords blocked;

    public LookRules(BlockedWords blocked) {
        this.blocked = blocked;
    }

    public Look normalize(JsonNode look) {
        if (look == null || !look.isObject()) {
            return new Look(DEFAULT_NAME, "OTHER", DEFAULT_COLORS, null);
        }
        JsonNode c = look.path("colors");
        Colors colors = new Colors(
                color(c.path("face").asText(null), DEFAULT_COLORS.face()),
                color(c.path("head").asText(null), DEFAULT_COLORS.head()),
                color(c.path("body").asText(null), DEFAULT_COLORS.body()),
                color(c.path("wing").asText(null), DEFAULT_COLORS.wing()),
                color(c.path("tail").asText(null), DEFAULT_COLORS.tail()),
                color(c.path("scarf").asText(null), null));
        String species = look.path("species").asText("");
        String home = look.path("home").asText(null);
        return new Look(
                name(look.path("name").asText(null)),
                SPECIES.contains(species) ? species : "OTHER",
                colors,
                home != null && HANDLE.matcher(home).matches() ? home : null);
    }

    /** Invisible characters removed, spaces collapsed, at most 12 characters, nothing blocked. */
    String name(String raw) {
        if (raw == null) {
            return DEFAULT_NAME;
        }
        String s = INVISIBLE.matcher(raw).replaceAll("").replaceAll("\\s+", " ").strip();
        if (s.codePointCount(0, s.length()) > NAME_MAX) {
            s = s.substring(0, s.offsetByCodePoints(0, NAME_MAX)).strip();
        }
        if (s.isEmpty() || blocked.blocks(s)) {
            return DEFAULT_NAME;
        }
        return s;
    }

    private static String color(String raw, String fallback) {
        return raw != null && COLOR.matcher(raw).matches() ? raw.toUpperCase() : fallback;
    }
}
