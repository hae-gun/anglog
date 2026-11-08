package com.anglog.realtime.protocol;

import com.anglog.realtime.config.ParkProperties;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Words a bird name may not contain. The list itself is kept out of git: one word per line in the
 * file named by angpark.blocked-words-file. Without a file nothing is blocked.
 */
@Component
public class BlockedWords {

    private static final Logger log = LoggerFactory.getLogger(BlockedWords.class);

    private final List<String> words;

    @Autowired
    public BlockedWords(ParkProperties props) {
        this.words = load(props.blockedWordsFile());
    }

    BlockedWords(List<String> words) {
        this.words = words.stream().map(BlockedWords::fold).filter(w -> !w.isEmpty()).toList();
    }

    /** True when the text contains a blocked word, ignoring case and spaces. */
    public boolean blocks(String text) {
        String t = fold(text);
        for (String w : words) {
            if (t.contains(w)) {
                return true;
            }
        }
        return false;
    }

    private static String fold(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT).replaceAll("\\s+", "");
    }

    private static List<String> load(String file) {
        if (file == null || file.isBlank()) {
            return List.of();
        }
        try {
            List<String> list = Files.readAllLines(Path.of(file), StandardCharsets.UTF_8).stream()
                    .map(BlockedWords::fold)
                    .filter(w -> !w.isEmpty() && !w.startsWith("#"))
                    .toList();
            log.info("blocked words loaded: {}", list.size());
            return list;
        } catch (IOException e) {
            log.warn("blocked words file not readable ({}): names are not filtered", e.getMessage());
            return List.of();
        }
    }
}
