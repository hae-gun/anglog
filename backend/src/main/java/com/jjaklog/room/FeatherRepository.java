package com.jjaklog.room;

import java.time.LocalDate;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FeatherRepository extends JpaRepository<Feather, Long> {

    boolean existsByRoomOwnerIdAndVisitorIdAndVisitDate(Long roomOwnerId, Long visitorId, LocalDate visitDate);

    long countByRoomOwnerId(Long roomOwnerId);

    long countByRoomOwnerIdAndVisitDate(Long roomOwnerId, LocalDate visitDate);

    @Query("select f from Feather f where f.roomOwnerId = :owner order by f.id desc")
    List<Feather> recent(@Param("owner") Long owner, Pageable page);
}
