package com.jjaklog.parrot;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/** The five parts the owner can color, same as the 3D customizer. */
public record ParrotColors(
        @NotNull @Pattern(regexp = HEX) String face,
        @NotNull @Pattern(regexp = HEX) String head,
        @NotNull @Pattern(regexp = HEX) String body,
        @NotNull @Pattern(regexp = HEX) String wing,
        @NotNull @Pattern(regexp = HEX) String tail) {

    public static final String HEX = "^#[0-9a-fA-F]{6}$";
}
