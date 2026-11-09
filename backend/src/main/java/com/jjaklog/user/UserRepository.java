package com.jjaklog.user;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByHandle(String handle);

    /** Admin list: newest first, optionally matching handle or nickname. */
    @org.springframework.data.jpa.repository.Query("""
            select u from User u
            where u.id < :cursor and (:like = '' or lower(u.handle) like :like or lower(u.nickname) like :like)
            order by u.id desc""")
    List<User> adminPage(@org.springframework.data.repository.query.Param("like") String like,
                         @org.springframework.data.repository.query.Param("cursor") long cursor,
                         org.springframework.data.domain.Pageable page);

    List<User> findByIdIn(Collection<Long> ids);
}
