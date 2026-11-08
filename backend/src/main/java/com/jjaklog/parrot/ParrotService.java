package com.jjaklog.parrot;

import com.jjaklog.common.ApiException;
import com.jjaklog.common.JjaklogProperties;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ParrotService {

    static final int MAX_PER_OWNER = 10;

    public record ParrotInput(String name, Species species, LocalDate birthDate, LocalDate adoptedDate, ParrotColors colors) {
    }

    private final ParrotRepository parrots;
    private final Clock clock;
    private final JjaklogProperties props;

    public ParrotService(ParrotRepository parrots, Clock clock, JjaklogProperties props) {
        this.parrots = parrots;
        this.clock = clock;
        this.props = props;
    }

    @Transactional(readOnly = true)
    public List<Parrot> ofOwner(Long ownerId) {
        return parrots.findByOwnerIdOrderByIdAsc(ownerId);
    }

    @Transactional
    public Parrot create(Long ownerId, ParrotInput in) {
        if (parrots.countByOwnerId(ownerId) >= MAX_PER_OWNER) {
            throw ApiException.badRequest("TOO_MANY_PARROTS", "앵무는 " + MAX_PER_OWNER + "마리까지 등록할 수 있어요.");
        }
        Parrot parrot = new Parrot(ownerId, Instant.now(clock));
        apply(parrot, in);
        return parrots.save(parrot);
    }

    @Transactional
    public Parrot update(Long ownerId, Long parrotId, ParrotInput in) {
        Parrot parrot = owned(ownerId, parrotId);
        apply(parrot, in);
        return parrot;
    }

    @Transactional(readOnly = true)
    public Parrot owned(Long ownerId, Long parrotId) {
        Parrot parrot = parrots.findById(parrotId).orElseThrow(() -> ApiException.notFound("앵무"));
        if (!parrot.getOwnerId().equals(ownerId)) {
            throw ApiException.forbidden("내 앵무만 고칠 수 있어요.");
        }
        return parrot;
    }

    @Transactional(readOnly = true)
    public Map<Long, Parrot> byIds(Collection<Long> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        return parrots.findByIdIn(ids).stream().collect(Collectors.toMap(Parrot::getId, Function.identity()));
    }

    private void apply(Parrot parrot, ParrotInput in) {
        LocalDate today = LocalDate.now(clock.withZone(props.zoneId()));
        if (in.birthDate() != null && in.birthDate().isAfter(today)) {
            throw ApiException.badRequest("INVALID_DATE", "생일이 오늘보다 뒤일 수는 없어요.");
        }
        if (in.adoptedDate() != null && in.adoptedDate().isAfter(today)) {
            throw ApiException.badRequest("INVALID_DATE", "입양일이 오늘보다 뒤일 수는 없어요.");
        }
        parrot.update(in.name().trim(), in.species(), in.birthDate(), in.adoptedDate(), in.colors());
    }
}
