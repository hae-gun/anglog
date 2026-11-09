package com.jjaklog.room;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GuestbookRepository extends JpaRepository<GuestbookEntry, Long> {

    @Query("select g from GuestbookEntry g where g.roomOwnerId = :owner and g.id < :cursor order by g.id desc")
    List<GuestbookEntry> page(@Param("owner") Long owner, @Param("cursor") long cursor, Pageable page);

    /** Admin: every entry, newest first. */
    @Query("select g from GuestbookEntry g where g.id < :cursor order by g.id desc")
    List<GuestbookEntry> recent(@Param("cursor") long cursor, Pageable page);

    long countByRoomOwnerId(Long roomOwnerId);
}
