"use client";

import {
  ArrowRight,
  Check,
  Clock3,
  History,
  Layers3,
  LockKeyhole,
  Mic2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Target,
  TimerReset,
  Waves,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TOPICS, type SpeechTopic } from "./data/topics";
import {
  createTopicPool,
  createSeededRandom,
  drawHand,
  getTopicStats,
  recordLockedTopic,
  type TopicPoolState,
} from "./lib/topicEngine";

const MAX_REROLLS = 2;
const HAND_SIZE = 3;

type SessionState = {
  pool: TopicPoolState;
  hand: SpeechTopic[];
  selectedId: string;
  lockedTopic: SpeechTopic | null;
  history: SpeechTopic[];
  rerollsLeft: number;
  timerSeconds: number;
  timerRunning: boolean;
  round: number;
};

function buildInitialSession(): SessionState {
  const initialRandom = createSeededRandom(20260717);
  const initialPool = createTopicPool(TOPICS, initialRandom);
  const { hand, state } = drawHand(initialPool, TOPICS, {
    random: initialRandom,
    size: HAND_SIZE,
  });

  return {
    pool: state,
    hand,
    selectedId: hand[0]?.id ?? "",
    lockedTopic: null,
    history: [],
    rerollsLeft: MAX_REROLLS,
    timerSeconds: hand[0]?.timeSeconds ?? 90,
    timerRunning: false,
    round: 1,
  };
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function SpeechDeckApp() {
  const [session, setSession] = useState<SessionState>(buildInitialSession);
  const selectedTopic = useMemo(
    () => session.hand.find((topic) => topic.id === session.selectedId),
    [session.hand, session.selectedId],
  );
  const activeTopic = session.lockedTopic ?? selectedTopic ?? session.hand[0];
  const stats = getTopicStats(session.pool, TOPICS.length);
  const progress =
    activeTopic && activeTopic.timeSeconds > 0
      ? Math.max(0, session.timerSeconds / activeTopic.timeSeconds)
      : 0;

  useEffect(() => {
    if (!session.timerRunning) {
      return;
    }

    const timer = window.setInterval(() => {
      setSession((current) => {
        if (current.timerSeconds <= 1) {
          return { ...current, timerSeconds: 0, timerRunning: false };
        }

        return { ...current, timerSeconds: current.timerSeconds - 1 };
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [session.timerRunning]);

  function selectTopic(topic: SpeechTopic) {
    if (session.lockedTopic) {
      return;
    }

    setSession((current) => ({
      ...current,
      selectedId: topic.id,
      timerSeconds: topic.timeSeconds,
      timerRunning: false,
    }));
  }

  function lockTopic() {
    if (!selectedTopic || session.lockedTopic) {
      return;
    }

    setSession((current) => ({
      ...current,
      pool: recordLockedTopic(current.pool, selectedTopic),
      lockedTopic: selectedTopic,
      timerSeconds: selectedTopic.timeSeconds,
      timerRunning: false,
      history: [selectedTopic, ...current.history].slice(0, 10),
    }));
  }

  function redrawHand() {
    if (session.lockedTopic || session.rerollsLeft <= 0) {
      return;
    }

    setSession((current) => {
      const { hand, state } = drawHand(current.pool, TOPICS, {
        size: HAND_SIZE,
      });

      return {
        ...current,
        pool: state,
        hand,
        selectedId: hand[0]?.id ?? "",
        timerSeconds: hand[0]?.timeSeconds ?? 90,
        timerRunning: false,
        rerollsLeft: current.rerollsLeft - 1,
      };
    });
  }

  function nextRound() {
    setSession((current) => {
      const { hand, state } = drawHand(current.pool, TOPICS, {
        size: HAND_SIZE,
      });

      return {
        ...current,
        pool: state,
        hand,
        selectedId: hand[0]?.id ?? "",
        lockedTopic: null,
        timerSeconds: hand[0]?.timeSeconds ?? 90,
        timerRunning: false,
        round: current.round + 1,
      };
    });
  }

  function toggleTimer() {
    if (!session.lockedTopic || session.timerSeconds === 0) {
      return;
    }

    setSession((current) => ({
      ...current,
      timerRunning: !current.timerRunning,
    }));
  }

  function resetTimer() {
    if (!activeTopic) {
      return;
    }

    setSession((current) => ({
      ...current,
      timerSeconds: activeTopic.timeSeconds,
      timerRunning: false,
    }));
  }

  function resetSession() {
    setSession(buildInitialSession());
  }

  return (
    <main className="app-shell">
      <VelocityRibbon />

      <section className="studio-grid" aria-label="OutLoud speaking deck">
        <section className="stage">
          <header className="stage-header">
            <div>
              <p className="eyebrow">
                <Mic2 aria-hidden="true" size={16} />
                OutLoud Deck
              </p>
              <h1>Pick the uncomfortable topic. Speak it clean.</h1>
            </div>
            <div className="round-chip" aria-label={`Round ${session.round}`}>
              <span>Round</span>
              <strong>{session.round}</strong>
            </div>
          </header>

          <section className="deck-zone" aria-label="Topic choices">
            <div className="deck-meta">
              <div>
                <p className="section-kicker">Draw three</p>
                <h2>Choose the prompt you will actually face.</h2>
              </div>
              <div className="deck-controls">
                <button
                  className="primary-button"
                  type="button"
                  onClick={lockTopic}
                  disabled={!selectedTopic || session.lockedTopic !== null}
                >
                  <LockKeyhole aria-hidden="true" size={18} />
                  Lock topic
                </button>
                <button
                  className="icon-button quiet"
                  type="button"
                  onClick={redrawHand}
                  disabled={
                    session.lockedTopic !== null || session.rerollsLeft === 0
                  }
                  aria-label="Redraw topic hand"
                  title="Redraw topic hand"
                >
                  <RefreshCw aria-hidden="true" size={19} />
                </button>
              </div>
            </div>

            <div
              className="topic-stack"
              data-locked={session.lockedTopic ? "true" : "false"}
            >
              {session.hand.map((topic, index) => {
                const isSelected = topic.id === session.selectedId;
                const isLocked = topic.id === session.lockedTopic?.id;

                return (
                  <button
                    className="topic-card"
                    data-selected={isSelected ? "true" : "false"}
                    data-locked={isLocked ? "true" : "false"}
                    key={topic.id}
                    onClick={() => selectTopic(topic)}
                    style={{ "--stack-index": index } as React.CSSProperties}
                    type="button"
                  >
                    <span className="topic-card-topline">
                      <span>{topic.category}</span>
                      <span>{topic.difficulty}</span>
                    </span>
                    <span className="topic-prompt">{topic.prompt}</span>
                    <span className="topic-training">
                      <Target aria-hidden="true" size={15} />
                      {topic.trains}
                    </span>
                    <span className="topic-card-footer">
                      <span>{topic.framework}</span>
                      {isLocked ? (
                        <Check aria-hidden="true" size={18} />
                      ) : (
                        <ArrowRight aria-hidden="true" size={18} />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="action-row">
              <div
                className="reroll-meter"
                aria-label={`${session.rerollsLeft} redraws left`}
              >
                {[0, 1].map((slot) => (
                  <span
                    className="reroll-dot"
                    data-active={slot < session.rerollsLeft ? "true" : "false"}
                    key={slot}
                  />
                ))}
                <span>{session.rerollsLeft} redraws</span>
              </div>
            </div>
          </section>

          {activeTopic ? (
            <section className="active-topic" aria-label="Active topic">
              <div className="active-copy">
                <p className="section-kicker">Why this one</p>
                <h2>{activeTopic.why}</h2>
                <div className="tag-row" aria-label="Topic tags">
                  {activeTopic.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>

              <div className="timer-module">
                <div
                  className="timer-ring"
                  style={{ "--timer-progress": progress } as React.CSSProperties}
                  aria-label={`${formatTime(session.timerSeconds)} remaining`}
                >
                  <span>{formatTime(session.timerSeconds)}</span>
                </div>
                <div className="timer-actions">
                  <button
                    className="icon-button"
                    type="button"
                    onClick={toggleTimer}
                    disabled={!session.lockedTopic || session.timerSeconds === 0}
                    aria-label={session.timerRunning ? "Pause timer" : "Start timer"}
                    title={session.timerRunning ? "Pause timer" : "Start timer"}
                  >
                    {session.timerRunning ? (
                      <Pause aria-hidden="true" size={19} />
                    ) : (
                      <Play aria-hidden="true" size={19} />
                    )}
                  </button>
                  <button
                    className="icon-button quiet"
                    type="button"
                    onClick={resetTimer}
                    aria-label="Reset timer"
                    title="Reset timer"
                  >
                    <TimerReset aria-hidden="true" size={19} />
                  </button>
                </div>
              </div>
            </section>
          ) : null}
        </section>

        <aside className="session-board" aria-label="Session details">
          <div className="session-card stats-card">
            <div className="panel-title">
              <Layers3 aria-hidden="true" size={18} />
              <span>Deck state</span>
            </div>
            <dl className="stats-grid">
              <div>
                <dt>Remaining</dt>
                <dd>{stats.remaining}</dd>
              </div>
              <div>
                <dt>Seen</dt>
                <dd>{stats.spent}</dd>
              </div>
              <div>
                <dt>Pool</dt>
                <dd>{stats.total}</dd>
              </div>
              <div>
                <dt>Reshuffles</dt>
                <dd>{stats.reshuffleCount}</dd>
              </div>
            </dl>
          </div>

          <div className="session-card lock-card">
            <div className="panel-title">
              <Clock3 aria-hidden="true" size={18} />
              <span>Current lock</span>
            </div>
            {session.lockedTopic ? (
              <>
                <p className="locked-prompt">{session.lockedTopic.prompt}</p>
                <button className="secondary-button" type="button" onClick={nextRound}>
                  <ArrowRight aria-hidden="true" size={18} />
                  Next draw
                </button>
              </>
            ) : (
              <p className="empty-state">
                Select a card, then lock it before the timer starts.
              </p>
            )}
          </div>

          <div className="session-card history-card">
            <div className="panel-title">
              <History aria-hidden="true" size={18} />
              <span>Last 10</span>
            </div>
            {session.history.length > 0 ? (
              <ol className="history-list">
                {session.history.map((topic) => (
                  <li key={`${topic.id}-${topic.prompt}`}>
                    <span>{topic.category}</span>
                    <p>{topic.prompt}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-state">Locked topics will collect here.</p>
            )}
          </div>

          <button className="reset-button" type="button" onClick={resetSession}>
            <RotateCcw aria-hidden="true" size={18} />
            Reset session
          </button>
        </aside>
      </section>
    </main>
  );
}

function VelocityRibbon() {
  const phrases = [
    "clarity",
    "rhythm",
    "confidence",
    "vocabulary",
    "presence",
    "structure",
    "flow",
    "nerve",
  ];

  return (
    <div className="velocity-wrap" aria-hidden="true">
      <div className="velocity-line">
        {[...phrases, ...phrases].map((phrase, index) => (
          <span key={`${phrase}-${index}`}>
            <Waves size={15} />
            {phrase}
          </span>
        ))}
      </div>
      <div className="velocity-line reverse">
        {[...phrases].reverse().concat(phrases).map((phrase, index) => (
          <span key={`${phrase}-reverse-${index}`}>
            <Sparkles size={15} />
            {phrase}
          </span>
        ))}
      </div>
    </div>
  );
}
