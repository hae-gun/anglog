package com.anglog.realtime.session;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ParkTokensTest {

    private final ParkTokens tokens = new ParkTokens("test-secret");
    private final long now = 1_800_000_000_000L;

    @Test
    void acceptsWhatItIssued() {
        ParkTokens.Owner owner = tokens.verify(tokens.issue(7, "bori_home", now / 1000 + 60), now);
        assertThat(owner).isEqualTo(new ParkTokens.Owner(7, "bori_home"));
    }

    @Test
    void rejectsExpiredForgedAndOtherSecrets() {
        assertThat(tokens.verify(tokens.issue(7, "bori", now / 1000 - 1), now)).isNull();
        assertThat(tokens.verify(new ParkTokens("other").issue(7, "bori", now / 1000 + 60), now)).isNull();
        String good = tokens.issue(7, "bori", now / 1000 + 60);
        String other = tokens.issue(8, "bori", now / 1000 + 60);
        // someone else's payload with this signature
        String forged = other.substring(0, other.lastIndexOf('.')) + good.substring(good.lastIndexOf('.'));
        assertThat(tokens.verify(forged, now)).isNull();
        assertThat(tokens.verify("v1.abc", now)).isNull();
        assertThat(tokens.verify("garbage", now)).isNull();
        assertThat(tokens.verify(null, now)).isNull();
        assertThat(tokens.verify(tokens.issue(7, "../admin", now / 1000 + 60), now)).isNull();
    }

    @Test
    void blankSecretTurnsTokensOff() {
        ParkTokens off = new ParkTokens("");
        assertThat(off.enabled()).isFalse();
        assertThat(off.verify(tokens.issue(7, "bori", now / 1000 + 60), now)).isNull();
    }

    @Test
    void lastSpotIsKeptForAWhileAndUsedOnce() {
        LastSpots spots = new LastSpots(1000);
        spots.remember(7, new com.anglog.realtime.protocol.Pose(1, 0, 2, 0, 0), 0);
        assertThat(spots.take(7, 500).z()).isEqualTo(2);
        assertThat(spots.take(7, 600)).isNull();
        spots.remember(7, new com.anglog.realtime.protocol.Pose(1, 0, 2, 0, 0), 0);
        assertThat(spots.take(7, 1500)).isNull();
    }
}
