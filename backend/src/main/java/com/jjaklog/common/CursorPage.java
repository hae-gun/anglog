package com.jjaklog.common;

import java.util.List;
import java.util.function.Function;

/**
 * One page of a newest-first list. Clients pass nextCursor back as ?cursor= to get the next page;
 * nextCursor is null on the last page.
 */
public record CursorPage<T>(List<T> items, Long nextCursor) {

    /** Builds a page from rows fetched with size + 1 (the extra row only tells us there is more). */
    public static <E, T> CursorPage<T> of(List<E> rows, int size, Function<E, Long> idOf, Function<List<E>, List<T>> mapper) {
        boolean hasMore = rows.size() > size;
        List<E> page = hasMore ? rows.subList(0, size) : rows;
        Long next = hasMore ? idOf.apply(page.get(page.size() - 1)) : null;
        return new CursorPage<>(mapper.apply(page), next);
    }

    public static int clampSize(Integer size) {
        if (size == null) {
            return 12;
        }
        return Math.max(1, Math.min(size, 30));
    }

    public static long cursorOrMax(Long cursor) {
        return cursor == null ? Long.MAX_VALUE : cursor;
    }
}
