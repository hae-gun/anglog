package com.jjaklog.post;

import com.jjaklog.common.ApiException;
import com.jjaklog.common.CursorPage;
import com.jjaklog.parrot.ParrotService;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class PostService {

    static final int MAX_IMAGES = 10;
    static final int MAX_BODY = 2000;
    private static final BigDecimal MIN_WEIGHT = new BigDecimal("5");
    private static final BigDecimal MAX_WEIGHT = new BigDecimal("2000");

    public record NewPost(String body, Long parrotId, BigDecimal weightG, Mood mood, List<MultipartFile> images) {
    }

    private final PostRepository posts;
    private final PostImageRepository postImages;
    private final ParrotService parrots;
    private final ImageStorage storage;
    private final PostAssembler assembler;
    private final Clock clock;

    public PostService(PostRepository posts, PostImageRepository postImages, ParrotService parrots,
                       ImageStorage storage, PostAssembler assembler, Clock clock) {
        this.posts = posts;
        this.postImages = postImages;
        this.parrots = parrots;
        this.storage = storage;
        this.assembler = assembler;
        this.clock = clock;
    }

    @Transactional
    public PostView create(Long authorId, NewPost in) {
        String body = in.body() == null ? "" : in.body().strip();
        List<MultipartFile> files = in.images() == null ? List.of()
                : in.images().stream().filter(f -> f != null && !f.isEmpty()).toList();
        if (body.isEmpty() && files.isEmpty()) {
            throw ApiException.badRequest("EMPTY_POST", "사진이나 글 중 하나는 있어야 해요.");
        }
        if (body.length() > MAX_BODY) {
            throw ApiException.badRequest("BODY_TOO_LONG", "글은 " + MAX_BODY + "자까지 쓸 수 있어요.");
        }
        if (files.size() > MAX_IMAGES) {
            throw ApiException.badRequest("TOO_MANY_IMAGES", "사진은 한 번에 " + MAX_IMAGES + "장까지 올릴 수 있어요.");
        }
        if (in.weightG() != null && (in.weightG().compareTo(MIN_WEIGHT) < 0 || in.weightG().compareTo(MAX_WEIGHT) > 0)) {
            throw ApiException.badRequest("INVALID_WEIGHT", "체중은 그램 단위로 5~2000 사이로 적어 주세요.");
        }
        if (in.parrotId() != null) {
            parrots.owned(authorId, in.parrotId());
        }

        Post post = posts.save(new Post(authorId, in.parrotId(), body, in.weightG(), in.mood(), Instant.now(clock)));
        int position = 0;
        for (MultipartFile file : files) {
            ImageStorage.StoredImage stored = storage.store(file);
            postImages.save(new PostImage(post.getId(), stored.path(), stored.width(), stored.height(), position++));
        }
        return assembler.toViews(List.of(post), authorId).get(0);
    }

    @Transactional(readOnly = true)
    public PostView get(Long postId, Long viewerId) {
        return assembler.toViews(List.of(find(postId)), viewerId).get(0);
    }

    @Transactional
    public void delete(Long userId, Long postId) {
        Post post = find(postId);
        if (!post.getAuthorId().equals(userId)) {
            throw ApiException.forbidden("내 글만 지울 수 있어요.");
        }
        // Photos, likes and comments go with it (ON DELETE CASCADE).
        posts.delete(post);
    }

    @Transactional(readOnly = true)
    public CursorPage<PostView> feed(String tab, Long viewerId, Long cursor, Integer size) {
        int n = CursorPage.clampSize(size);
        PageRequest page = PageRequest.of(0, n + 1);
        long before = CursorPage.cursorOrMax(cursor);
        List<Post> rows;
        if ("following".equals(tab)) {
            if (viewerId == null) {
                throw ApiException.unauthorized();
            }
            rows = posts.following(viewerId, before, page);
        } else {
            rows = posts.latest(before, page);
        }
        return CursorPage.of(rows, n, Post::getId, list -> assembler.toViews(list, viewerId));
    }

    @Transactional(readOnly = true)
    public CursorPage<PostView> byAuthor(Long authorId, Long viewerId, Long cursor, Integer size) {
        int n = CursorPage.clampSize(size);
        List<Post> rows = posts.byAuthor(authorId, CursorPage.cursorOrMax(cursor), PageRequest.of(0, n + 1));
        return CursorPage.of(rows, n, Post::getId, list -> assembler.toViews(list, viewerId));
    }

    @Transactional(readOnly = true)
    public Post find(Long postId) {
        return posts.findById(postId).orElseThrow(() -> ApiException.notFound("일기"));
    }
}
