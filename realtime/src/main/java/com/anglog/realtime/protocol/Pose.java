package com.anglog.realtime.protocol;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Position, yaw and pose code of a bird. Values from the browser are clamped to the park,
 * rounded to centimetres, and the pose code is one of 0..6 (idle, walk, fly, dance, happy, chirp, preen).
 */
public record Pose(double x, double y, double z, double ry, int m) {

    public static final int MAX_POSE = 6;

    /** null when the numbers are missing or not finite. */
    public static Pose from(JsonNode msg, double worldLimit, double heightLimit) {
        double x = msg.path("x").asDouble(Double.NaN);
        double y = msg.path("y").asDouble(0);
        double z = msg.path("z").asDouble(Double.NaN);
        double ry = msg.path("ry").asDouble(0);
        if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z) || !Double.isFinite(ry)) {
            return null;
        }
        int m = msg.path("m").asInt(0);
        return new Pose(
                round(clamp(x, -worldLimit, worldLimit)),
                round(clamp(y, 0, heightLimit)),
                round(clamp(z, -worldLimit, worldLimit)),
                round(Math.IEEEremainder(ry, Math.PI * 2)),
                m < 0 || m > MAX_POSE ? 0 : m);
    }

    private static double clamp(double v, double lo, double hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    private static double round(double v) {
        return Math.round(v * 100) / 100.0;
    }
}
