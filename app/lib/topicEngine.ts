import { TOPICS, type SpeechTopic } from "../data/topics";

export type RandomSource = () => number;

export type TopicPoolState = {
  poolIds: string[];
  spentIds: string[];
  lastLockedCategory: SpeechTopic["category"] | null;
  reshuffleCount: number;
};

export type DrawHandResult = {
  hand: SpeechTopic[];
  state: TopicPoolState;
};

export function shuffleIds(ids: string[], random: RandomSource = Math.random) {
  const shuffled = [...ids];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

export function createSeededRandom(seed: number): RandomSource {
  let value = seed >>> 0;

  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function createTopicPool(
  topics: SpeechTopic[] = TOPICS,
  random: RandomSource = Math.random,
): TopicPoolState {
  return {
    poolIds: shuffleIds(
      topics.map((topic) => topic.id),
      random,
    ),
    spentIds: [],
    lastLockedCategory: null,
    reshuffleCount: 0,
  };
}

export function recordLockedTopic(
  state: TopicPoolState,
  topic: SpeechTopic,
): TopicPoolState {
  return {
    ...state,
    lastLockedCategory: topic.category,
  };
}

export function drawHand(
  state: TopicPoolState,
  topics: SpeechTopic[] = TOPICS,
  options: { size?: number; random?: RandomSource } = {},
): DrawHandResult {
  const size = options.size ?? 3;
  const random = options.random ?? Math.random;
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  let poolIds = [...state.poolIds];
  let spentIds = [...state.spentIds];
  let reshuffleCount = state.reshuffleCount;
  const hand: SpeechTopic[] = [];
  const categoriesInHand = new Set<SpeechTopic["category"]>();

  while (hand.length < size && topics.length > 0) {
    if (poolIds.length === 0) {
      poolIds = shuffleIds(
        topics.map((topic) => topic.id),
        random,
      );
      spentIds = [];
      reshuffleCount += 1;
    }

    const id = pullBestId(poolIds, topicById, {
      lastLockedCategory: state.lastLockedCategory,
      categoriesInHand,
      isFirstCard: hand.length === 0,
    });

    if (!id) {
      break;
    }

    poolIds = poolIds.filter((poolId) => poolId !== id);
    spentIds = [...spentIds, id];
    const topic = topicById.get(id);

    if (topic) {
      hand.push(topic);
      categoriesInHand.add(topic.category);
    }
  }

  return {
    hand,
    state: {
      poolIds,
      spentIds,
      lastLockedCategory: state.lastLockedCategory,
      reshuffleCount,
    },
  };
}

function pullBestId(
  poolIds: string[],
  topicById: Map<string, SpeechTopic>,
  constraints: {
    lastLockedCategory: SpeechTopic["category"] | null;
    categoriesInHand: Set<SpeechTopic["category"]>;
    isFirstCard: boolean;
  },
) {
  const strictIndex = poolIds.findIndex((id) => {
    const topic = topicById.get(id);
    if (!topic) {
      return false;
    }

    if (constraints.categoriesInHand.has(topic.category)) {
      return false;
    }

    return !(
      constraints.isFirstCard &&
      constraints.lastLockedCategory === topic.category
    );
  });

  if (strictIndex >= 0) {
    return poolIds[strictIndex];
  }

  const noHandRepeatIndex = poolIds.findIndex((id) => {
    const topic = topicById.get(id);
    return topic ? !constraints.categoriesInHand.has(topic.category) : false;
  });

  if (noHandRepeatIndex >= 0) {
    return poolIds[noHandRepeatIndex];
  }

  return poolIds.find((id) => topicById.has(id)) ?? null;
}

export function getTopicStats(state: TopicPoolState, totalTopics: number) {
  return {
    remaining: state.poolIds.length,
    spent: state.spentIds.length,
    total: totalTopics,
    reshuffleCount: state.reshuffleCount,
  };
}
