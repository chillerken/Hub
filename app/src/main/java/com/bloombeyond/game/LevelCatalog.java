package com.bloombeyond.game;

public final class LevelCatalog {
    public static final int MAX_LEVEL = 100;

    public static final class Spec {
        public final int level;
        public final int moves;
        public final int targetScore;
        public final int obstacleCount;
        public final int maxObstacleType;
        public final int hardTileChance;
        public final String zone;
        public final String goalLabel;

        Spec(int level, int moves, int targetScore, int obstacleCount, int maxObstacleType,
             int hardTileChance, String zone, String goalLabel) {
            this.level = level;
            this.moves = moves;
            this.targetScore = targetScore;
            this.obstacleCount = obstacleCount;
            this.maxObstacleType = maxObstacleType;
            this.hardTileChance = hardTileChance;
            this.zone = zone;
            this.goalLabel = goalLabel;
        }
    }

    private static final String[] ZONES = {
        "Rose Garden", "Glasshouse", "Moon Fountain", "West Wing", "Orchard"
    };

    private LevelCatalog() {}

    public static Spec get(int requestedLevel) {
        int level = Math.max(1, Math.min(MAX_LEVEL, requestedLevel));
        int zoneIndex = Math.min(4, (level - 1) / 20);
        int within = (level - 1) % 20;

        int moves = Math.max(18, 31 - level / 11 - (within % 5 == 4 ? 1 : 0));
        int target = 650 + level * 115 + zoneIndex * 220 + (within % 4) * 85;
        int obstacles = level == 1 ? 0 : Math.min(22, 2 + level / 4 + zoneIndex * 2 + (within % 3));
        int maxType = level < 8 ? 1 : level < 20 ? 2 : level < 36 ? 3 : level < 58 ? 4 : 5;
        int hardChance = level < 12 ? 0 : Math.min(55, 8 + level / 2);

        String goal;
        if (level <= 5) goal = "Learn the garden";
        else if (level <= 20) goal = "Clear crates & frost";
        else if (level <= 40) goal = "Break vines & restore paths";
        else if (level <= 60) goal = "Crack stone planters";
        else if (level <= 80) goal = "Open locked garden tiles";
        else goal = "Master the estate challenge";

        return new Spec(level, moves, target, obstacles, maxType, hardChance, ZONES[zoneIndex], goal);
    }

    public static String zoneFor(int level) {
        return get(level).zone;
    }

    public static int zoneStart(int page) {
        return Math.max(1, Math.min(MAX_LEVEL, page * 20 + 1));
    }
}
