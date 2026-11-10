package com.anglog.realtime.protocol;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

class LookRulesTest {

    private final LookRules rules = new LookRules(new BlockedWords(List.of("나쁜말")));
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void namesAreTrimmedAndFiltered() {
        assertThat(rules.name("  머란이  ")).isEqualTo("머란이");
        assertThat(rules.name("머\u200B란\u0007이")).isEqualTo("머란이");
        assertThat(rules.name("가나다라마바사아자차카타파하")).isEqualTo("가나다라마바사아자차카타");
        assertThat(rules.name("나 쁜 말 앵무")).isEqualTo(LookRules.DEFAULT_NAME);
        assertThat(rules.name("   ")).isEqualTo(LookRules.DEFAULT_NAME);
        assertThat(rules.name(null)).isEqualTo(LookRules.DEFAULT_NAME);
    }

    @Test
    void wholeLookFallsBackPartByPart() throws Exception {
        Messages.Look look = rules.normalize(mapper.readTree(
                "{\"name\":\"보리\",\"species\":\"QUAKER\",\"colors\":{\"face\":\"#c9cfc4\",\"body\":\"green\"},\"home\":\"bori_home\"}"));
        assertThat(look.name()).isEqualTo("보리");
        assertThat(look.species()).isEqualTo("QUAKER");
        assertThat(look.colors().face()).isEqualTo("#C9CFC4");
        assertThat(look.colors().body()).isEqualTo(LookRules.DEFAULT_COLORS.body());
        assertThat(look.home()).isEqualTo("bori_home");
        assertThat(rules.normalize(null).name()).isEqualTo(LookRules.DEFAULT_NAME);
    }

    @Test
    void wearKeepsShortIdsAndColoursOnly() throws Exception {
        Messages.Look look = rules.normalize(mapper.readTree(
                "{\"wear\":[\"scarf:#47b3a6\",\"pepero\",\"scarf:#000000\",\"<script>\",\"hat:red\",\"a\",\"bow\",\"cap\",\"pin\"]}"));
        // one of each, first wins, at most four, nothing that is not an id with maybe a #colour
        assertThat(look.wear()).containsExactly("scarf:#47B3A6", "pepero", "bow", "cap");
        assertThat(rules.normalize(mapper.readTree("{\"wear\":\"scarf\"}")).wear()).isEmpty();
        assertThat(rules.normalize(mapper.readTree("{}")).wear()).isEmpty();
    }
}
