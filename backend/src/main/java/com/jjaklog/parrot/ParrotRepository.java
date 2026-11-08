package com.jjaklog.parrot;

import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ParrotRepository extends JpaRepository<Parrot, Long> {

    List<Parrot> findByOwnerIdOrderByIdAsc(Long ownerId);

    List<Parrot> findByIdIn(Collection<Long> ids);

    long countByOwnerId(Long ownerId);

    List<Parrot> findByOwnerIdInOrderByIdAsc(Collection<Long> ownerIds);

    /** Owners who have a bird, newest registration first. */
    @Query("select p.ownerId from Parrot p group by p.ownerId order by max(p.id) desc")
    List<Long> recentOwnerIds(Pageable page);

    /** Every owner with at least one bird (for "visit a random room"). Fine at small scale; replace with sampling later. */
    @Query("select distinct p.ownerId from Parrot p")
    List<Long> allOwnerIds();
}
