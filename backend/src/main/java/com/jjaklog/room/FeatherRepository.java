package com.jjaklog.room;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FeatherRepository extends JpaRepository<Feather, Long> {

    boolean existsByRoomOwnerIdAndVisitorIdAndVisitDate(Long roomOwnerId, Long visitorId, LocalDate visitDate);

    long countByRoomOwnerId(Long roomOwnerId);

    @Query("select f.roomOwnerId from Feather f where f.visitorId = :visitor and f.visitDate = :day and f.roomOwnerId in :owners")
    List<Long> visitedOn(@Param("visitor") Long visitor, @Param("day") LocalDate day, @Param("owners") Collection<Long> owners);

    long countByRoomOwnerIdAndVisitDate(Long roomOwnerId, LocalDate visitDate);

    @Query("select f from Feather f where f.roomOwnerId = :owner order by f.id desc")
    List<Feather> recent(@Param("owner") Long owner, Pageable page);
}
