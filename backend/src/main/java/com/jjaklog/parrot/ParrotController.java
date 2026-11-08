package com.jjaklog.parrot;

import com.jjaklog.common.LoginUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/parrots")
public class ParrotController {

    public record ParrotRequest(
            @NotBlank @Size(max = 20) String name,
            @NotNull Species species,
            LocalDate birthDate,
            LocalDate adoptedDate,
            @NotNull @Valid ParrotColors colors) {

        ParrotService.ParrotInput toInput() {
            return new ParrotService.ParrotInput(name, species, birthDate, adoptedDate, colors);
        }
    }

    private final ParrotService parrotService;

    public ParrotController(ParrotService parrotService) {
        this.parrotService = parrotService;
    }

    @GetMapping("/mine")
    public List<ParrotView> mine(@LoginUser Long userId) {
        return parrotService.ofOwner(userId).stream().map(ParrotView::of).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ParrotView create(@LoginUser Long userId, @Valid @RequestBody ParrotRequest req) {
        return ParrotView.of(parrotService.create(userId, req.toInput()));
    }

    @PutMapping("/{id}")
    public ParrotView update(@LoginUser Long userId, @PathVariable Long id, @Valid @RequestBody ParrotRequest req) {
        return ParrotView.of(parrotService.update(userId, id, req.toInput()));
    }
}
