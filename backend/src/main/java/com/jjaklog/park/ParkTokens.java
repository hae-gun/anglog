package com.jjaklog.park;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Short-lived proof of "this bird belongs to this account" for the 앵파크 realtime server, which
 * shares no database or session with the API. The realtime server checks it with the same secret
 * (com.anglog.realtime.session.ParkTokens): one bird per account, and only owners get a house link.
 * Format: "v1." + base64url("userId:handle:expiresEpochSeconds") + "." + base64url(HMAC-SHA256).
 */
@Component
public class ParkTokens {

    public static final long TTL_SECONDS = 300;

    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();

    private final byte[] secret;

    public ParkTokens(@Value("${jjaklog.park.token-secret:}") String secret) {
        this.secret = secret == null || secret.isBlank() ? null : secret.getBytes(StandardCharsets.UTF_8);
    }

    public boolean enabled() {
        return secret != null;
    }

    public String issue(long userId, String handle, long nowEpochSeconds) {
        String signed = "v1." + B64.encodeToString(
                (userId + ":" + handle + ":" + (nowEpochSeconds + TTL_SECONDS)).getBytes(StandardCharsets.UTF_8));
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return signed + "." + B64.encodeToString(mac.doFinal(signed.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }
}
