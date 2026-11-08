package com.jjaklog.parrot;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ParrotRepository extends JpaRepository<Parrot, Long> {

    List<Parrot> findByOwnerIdOrderByIdAsc(Long ownerId);

    List<Parrot> findByIdIn(Collection<Long> ids);

    long countByOwnerId(Long ownerId);
}
