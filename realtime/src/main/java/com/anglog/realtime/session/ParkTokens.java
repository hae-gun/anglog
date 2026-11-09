package com.anglog.realtime.session;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.regex.Pattern;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Checks the short-lived token the 앵로그 API hands a logged-in owner (POST /api/park/token), so the park
 * knows whose bird it is without sharing a database. Same format as com.jjaklog.park.ParkTokens:
 * "v1." + base64url("userId:handle:expiresEpochSeconds") + "." + base64url(HMAC-SHA256(secret, everything before the last dot)).
 */
public final class ParkTokens {

    /** A verified owner. */
    public record Owner(long userId, String handle) {
    }

    private static final Pattern HANDLE = Pattern.compile("[a-z0-9_]{3,20}");
    private static final Base64.Decoder B64 = Base64.getUrlDecoder();
    private static final Base64.Encoder B64E = Base64.getUrlEncoder().withoutPadding();

    private final byte[] secret;

    /** A blank secret turns tokens off: everyone is a guest and nobody gets a house link. */
    public ParkTokens(String secret) {
        this.secret = secret == null || secret.isBlank() ? null : secret.getBytes(StandardCharsets.UTF_8);
    }

    public boolean enabled() {
        return secret != null;
    }

    /** @return the owner, or null when the token is missing, forged, malformed or expired */
    public Owner verify(String token, long nowMs) {
        if (secret == null || token == null || token.length() > 300 || !token.startsWith("v1.")) {
            return null;
        }
        int dot = token.lastIndexOf('.');
        if (dot <= 3) {
            return null;
        }
        String signed = token.substring(0, dot);
        byte[] given;
        String payload;
        try {
            given = B64.decode(token.substring(dot + 1));
            payload = new String(B64.decode(signed.substring(3)), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return null;
        }
        if (!MessageDigest.isEqual(sign(signed), given)) {
            return null;
        }
        String[] parts = payload.split(":");
        if (parts.length != 3 || !HANDLE.matcher(parts[1]).matches()) {
            return null;
        }
        try {
            long userId = Long.parseLong(parts[0]);
            long exp = Long.parseLong(parts[2]);
            if (userId <= 0 || exp * 1000 < nowMs) {
                return null;
            }
            return new Owner(userId, parts[1]);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** For tests: what the API would issue. */
    public String issue(long userId, String handle, long expiresEpochSeconds) {
        String signed = "v1." + B64E.encodeToString((userId + ":" + handle + ":" + expiresEpochSeconds).getBytes(StandardCharsets.UTF_8));
        return signed + "." + B64E.encodeToString(sign(signed));
    }

    private byte[] sign(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }
}
