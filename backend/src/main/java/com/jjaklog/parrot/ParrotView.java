package com.jjaklog.parrot;

import java.time.LocalDate;

public record ParrotView(
        Long id,
        String name,
        Species species,
        String speciesLabel,
        LocalDate birthDate,
        LocalDate adoptedDate,
        ParrotColors colors) {

    public static ParrotView of(Parrot p) {
        return new ParrotView(p.getId(), p.getName(), p.getSpecies(), p.getSpecies().label(),
                p.getBirthDate(), p.getAdoptedDate(), p.colors());
    }
}
