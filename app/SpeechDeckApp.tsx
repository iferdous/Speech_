import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TOPICS, type SpeechTopic } from "./data/topics";
import {
  createSeededRandom,
  createTopicPool,
  drawHand,
  recordLockedTopic,
  type TopicPoolState,
} from "./lib/topicEngine";

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  [index: number]: { transcript: string };
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionErrorEventLike = Event & {
  error: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type Screen = "roll" | "practice" | "review";
type PracticeStatus = "idle" | "recording" | "paused" | "finished";

type DiceState = {
  first: number;
  second: number;
  rolling: boolean;
  throwId: number;
};

type Analysis = {
  cleanedTranscript: string;
  fillerCounts: Array<{ word: string; count: number }>;
  totalFillers: number;
  wordCount: number;
  wpm: number;
  repeatedStarts: string[];
  suggestions: string[];
};

const HAND_SIZE = 2;
const DEFAULT_SECONDS = 60;
const FILLERS = [
  "um",
  "uh",
  "like",
  "you know",
  "i mean",
  "actually",
  "basically",
  "literally",
  "sort of",
  "kind of",
  "kinda",
  "so",
  "right",
];

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(1, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function buildInitialPool() {
  const random = createSeededRandom(20260718);
  const pool = createTopicPool(TOPICS, random);
  return drawHand(pool, TOPICS, { random, size: HAND_SIZE });
}

function countWords(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function getSpeechRecognition() {
  if (typeof window === "undefined") {
    return null;
  }

  const Recognition =
    window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;

  return Recognition ? new Recognition() : null;
}

function analyzeSpeech(rawTranscript: string, durationSeconds: number): Analysis {
  const normalized = rawTranscript.toLowerCase();
  const fillerCounts = FILLERS.map((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const count = (normalized.match(new RegExp(`\\b${escaped}\\b`, "g")) ?? [])
      .length;
    return { word, count };
  }).filter((item) => item.count > 0);
  const totalFillers = fillerCounts.reduce((sum, item) => sum + item.count, 0);
  const wordCount = countWords(rawTranscript);
  const minutes = Math.max(durationSeconds / 60, 0.25);
  const wpm = Math.round(wordCount / minutes);
  const repeatedStarts = findRepeatedStarts(rawTranscript);
  const cleanedTranscript = cleanTranscript(rawTranscript);
  const suggestions = buildSuggestions({
    fillerCounts,
    repeatedStarts,
    totalFillers,
    wordCount,
    wpm,
  });

  return {
    cleanedTranscript,
    fillerCounts,
    totalFillers,
    wordCount,
    wpm,
    repeatedStarts,
    suggestions,
  };
}

function cleanTranscript(rawTranscript: string) {
  let cleaned = ` ${rawTranscript.trim()} `;

  for (const filler of FILLERS) {
    const escaped = filler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned.replace(new RegExp(`\\b${escaped}\\b[, ]*`, "gi"), "");
  }

  return cleaned
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/(^\w|[.!?]\s+\w)/g, (match) => match.toUpperCase())
    .trim();
}

function findRepeatedStarts(rawTranscript: string) {
  const words = rawTranscript
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const repeats = new Set<string>();

  for (let index = 1; index < words.length; index += 1) {
    if (words[index] === words[index - 1] && words[index].length > 2) {
      repeats.add(words[index]);
    }
  }

  return [...repeats].slice(0, 5);
}

function buildSuggestions({
  fillerCounts,
  repeatedStarts,
  totalFillers,
  wordCount,
  wpm,
}: Pick<
  Analysis,
  "fillerCounts" | "repeatedStarts" | "totalFillers" | "wordCount" | "wpm"
>) {
  const suggestions: string[] = [];

  if (wordCount < 12) {
    suggestions.push(
      "Say a little more next round. Aim for one claim, one example, and one closing sentence.",
    );
  }

  if (totalFillers > 4) {
    const topFiller = fillerCounts[0]?.word ?? "filler words";
    suggestions.push(
      `Your main filler was "${topFiller}". Try replacing that sound with a full silent pause.`,
    );
  }

  if (wpm > 165) {
    suggestions.push(
      "Your pace was quick. Slow the first sentence down so listeners can catch the frame.",
    );
  } else if (wpm > 0 && wpm < 95) {
    suggestions.push(
      "Your pace was careful. Add a little more forward motion after each pause.",
    );
  } else if (wpm > 0) {
    suggestions.push("Your pace is in a natural speaking range. Keep that rhythm.");
  }

  if (repeatedStarts.length > 0) {
    suggestions.push(
      `You repeated ${repeatedStarts
        .map((word) => `"${word}"`)
        .join(", ")}. Pause, then restart the sentence cleanly.`,
    );
  }

  if (suggestions.length === 0) {
    suggestions.push(
      "Strong start. For the next rep, practice landing with one memorable final sentence.",
    );
  }

  return suggestions.slice(0, 4);
}

export function SpeechDeckApp() {
  const initialDraw = useMemo(buildInitialPool, []);
  const [screen, setScreen] = useState<Screen>("roll");
  const [pool, setPool] = useState<TopicPoolState>(initialDraw.state);
  const [topics, setTopics] = useState<SpeechTopic[]>(initialDraw.hand);
  const [activeTopic, setActiveTopic] = useState<SpeechTopic>(initialDraw.hand[0]);
  const [dice, setDice] = useState<DiceState>({
    first: 3,
    rolling: false,
    second: 6,
    throwId: 0,
  });
  const [duration, setDuration] = useState(DEFAULT_SECONDS);
  const [remaining, setRemaining] = useState(DEFAULT_SECONDS);
  const [status, setStatus] = useState<PracticeStatus>("idle");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [manualTranscript, setManualTranscript] = useState("");
  const [speechError, setSpeechError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const rawTranscript = [finalTranscript, interimTranscript, manualTranscript]
    .filter(Boolean)
    .join(" ")
    .trim();
  const progress = duration > 0 ? (duration - remaining) / duration : 0;
  const analysis = useMemo(
    () => analyzeSpeech(rawTranscript, duration),
    [duration, rawTranscript],
  );

  useEffect(() => {
    if (status !== "recording") {
      return;
    }

    const timer = window.setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          finishPractice();
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [status]);

  function rollDice() {
    if (dice.rolling) {
      return;
    }

    const first = Math.ceil(Math.random() * 6);
    const second = Math.ceil(Math.random() * 6);

    setDice((current) => ({
      first,
      rolling: true,
      second,
      throwId: current.throwId + 1,
    }));

    window.setTimeout(() => {
      const result = drawHand(pool, TOPICS, { size: HAND_SIZE });
      const chosenIndex = (first + second) % result.hand.length;
      const chosenTopic = result.hand[chosenIndex] ?? result.hand[0];

      setPool(recordLockedTopic(result.state, chosenTopic));
      setTopics(result.hand);
      setActiveTopic(chosenTopic);
      setRemaining(duration);
      setDice((current) => ({ ...current, rolling: false }));
    }, 1100);
  }

  function startPractice() {
    setScreen("practice");
    setStatus("recording");
    setRemaining(duration);
    setFinalTranscript("");
    setInterimTranscript("");
    setManualTranscript("");
    setSpeechError("");

    const recognition = getSpeechRecognition();
    recognitionRef.current = recognition;

    if (!recognition) {
      setSpeechError(
        "Live browser transcription is not available here. Type what you said in the notes box while the timer runs.",
      );
      return;
    }

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";

        if (result.isFinal) {
          finalText += `${transcript} `;
        } else {
          interimText += transcript;
        }
      }

      if (finalText) {
        setFinalTranscript((current) => `${current} ${finalText}`.trim());
      }

      setInterimTranscript(interimText);
    };
    recognition.onerror = (event) => {
      setSpeechError(
        event.error === "not-allowed"
          ? "Microphone permission was blocked. You can still paste or type the transcript below."
          : "Transcription paused. You can keep speaking or use the notes box.",
      );
    };
    recognition.onend = () => {
      if (status === "recording" && remaining > 0) {
        try {
          recognition.start();
        } catch {
          // Some browsers briefly reject restart calls while closing the old session.
        }
      }
    };

    try {
      recognition.start();
    } catch {
      setSpeechError("The microphone could not start. You can type the transcript below.");
    }
  }

  function pausePractice() {
    setStatus("paused");
    recognitionRef.current?.stop();
  }

  function resumePractice() {
    setStatus("recording");
    try {
      recognitionRef.current?.start();
    } catch {
      setSpeechError("Transcription could not resume. Keep typing in the notes box.");
    }
  }

  function finishPractice() {
    setStatus("finished");
    recognitionRef.current?.stop();
    setScreen("review");
  }

  function resetPractice() {
    recognitionRef.current?.stop();
    setScreen("roll");
    setStatus("idle");
    setRemaining(duration);
    setFinalTranscript("");
    setInterimTranscript("");
    setManualTranscript("");
    setSpeechError("");
  }

  return (
    <main className="app-shell">
      {screen === "roll" ? (
        <RollScreen
          activeTopic={activeTopic}
          dice={dice}
          duration={duration}
          onDurationChange={(nextDuration) => {
            setDuration(nextDuration);
            setRemaining(nextDuration);
          }}
          onRoll={rollDice}
          onStart={startPractice}
          topics={topics}
        />
      ) : null}

      {screen === "practice" ? (
        <PracticeScreen
          activeTopic={activeTopic}
          duration={duration}
          manualTranscript={manualTranscript}
          onBack={resetPractice}
          onFinish={finishPractice}
          onManualTranscript={setManualTranscript}
          onPause={pausePractice}
          onResume={resumePractice}
          progress={progress}
          rawTranscript={rawTranscript}
          remaining={remaining}
          setDuration={(nextDuration) => {
            const difference = nextDuration - duration;
            setDuration(nextDuration);
            setRemaining((current) => Math.max(15, current + difference));
          }}
          speechError={speechError}
          status={status}
        />
      ) : null}

      {screen === "review" ? (
        <ReviewScreen
          activeTopic={activeTopic}
          analysis={analysis}
          duration={duration}
          onNewRoll={resetPractice}
          onRetry={() => {
            setScreen("practice");
            setStatus("idle");
            setRemaining(duration);
            setFinalTranscript("");
            setInterimTranscript("");
            setManualTranscript("");
          }}
          rawTranscript={rawTranscript}
        />
      ) : null}
    </main>
  );
}

function RollScreen({
  activeTopic,
  dice,
  duration,
  onDurationChange,
  onRoll,
  onStart,
  topics,
}: {
  activeTopic: SpeechTopic;
  dice: DiceState;
  duration: number;
  onDurationChange: (duration: number) => void;
  onRoll: () => void;
  onStart: () => void;
  topics: SpeechTopic[];
}) {
  const ghostTopic = topics.find((topic) => topic.id !== activeTopic.id) ?? topics[0];

  return (
    <section className="welcome-screen" aria-label="Topic roll">
      <header className="top-bar">
        <nav className="pill-tabs" aria-label="Practice modes">
          <button className="pill active" type="button">
            Random Topics
          </button>
          <button className="pill" type="button">
            Interview Prep
          </button>
          <button className="pill" type="button">
            Learn Vocab
          </button>
        </nav>
        <p className="tiny-wordmark">Baby steps to the mic</p>
      </header>

      <section className="hero-layout">
        <div className="hero-copy">
          <p className="brand-mark">Off the Cuff</p>
          <ol className="hand-list">
            <li>Roll for a topic</li>
            <li>Set your speaking time</li>
            <li>Talk, transcribe, review</li>
          </ol>
          <button className="primary-pill analysis-cta" type="button" onClick={onStart}>
            Get speech analysis
            <span>new</span>
          </button>
        </div>

        <div className="topic-area">
          <div className="soft-controls" aria-label="Session settings">
            <label className="mini-pill">
              Time
              <select
                value={duration}
                onChange={(event) => onDurationChange(Number(event.target.value))}
              >
                <option value={30}>0:30</option>
                <option value={60}>1:00</option>
                <option value={90}>1:30</option>
                <option value={120}>2:00</option>
              </select>
            </label>
            <span className="mini-pill">Medium</span>
            <span className="mini-pill">Random</span>
          </div>

          <div className="topic-stack-soft" aria-live="polite">
            <p className="ghost-topic">{ghostTopic?.prompt}</p>
            <h1>{activeTopic.prompt}</h1>
            <p className="ghost-topic lower">{activeTopic.trains}</p>
          </div>

          <DiceBoard dice={dice} onRoll={onRoll} />

          <div className="main-actions">
            <button className="primary-pill" type="button" onClick={onRoll}>
              {dice.rolling ? "Rolling..." : "Roll dice"}
            </button>
            <button className="secondary-pill" type="button" onClick={onStart}>
              Start timer →
            </button>
          </div>
        </div>
      </section>
    </section>
  );
}

function DiceBoard({ dice, onRoll }: { dice: DiceState; onRoll: () => void }) {
  return (
    <button
      className="dice-board"
      data-rolling={dice.rolling ? "true" : "false"}
      key={dice.throwId}
      onClick={onRoll}
      type="button"
      aria-label={`Roll dice. Current result ${dice.first} and ${dice.second}`}
    >
      <span className="felt-label">tap the board</span>
      <span className="throw-hand" aria-hidden="true">
        <span className="hand-palm" />
        <span className="finger one" />
        <span className="finger two" />
        <span className="finger three" />
      </span>
      <Die value={dice.first} className="die first" />
      <Die value={dice.second} className="die second" />
    </button>
  );
}

function Die({ className, value }: { className: string; value: number }) {
  return (
    <span className={className} style={{ "--die-value": value } as CSSProperties}>
      {Array.from({ length: 6 }, (_, index) => (
        <span
          className="pip"
          data-visible={isPipVisible(value, index) ? "true" : "false"}
          key={index}
        />
      ))}
    </span>
  );
}

function isPipVisible(value: number, index: number) {
  const map: Record<number, number[]> = {
    1: [4],
    2: [0, 5],
    3: [0, 4, 5],
    4: [0, 2, 3, 5],
    5: [0, 2, 3, 4, 5],
    6: [0, 1, 2, 3, 4, 5],
  };

  return map[value]?.includes(index) ?? false;
}

function PracticeScreen({
  activeTopic,
  duration,
  manualTranscript,
  onBack,
  onFinish,
  onManualTranscript,
  onPause,
  onResume,
  progress,
  rawTranscript,
  remaining,
  setDuration,
  speechError,
  status,
}: {
  activeTopic: SpeechTopic;
  duration: number;
  manualTranscript: string;
  onBack: () => void;
  onFinish: () => void;
  onManualTranscript: (value: string) => void;
  onPause: () => void;
  onResume: () => void;
  progress: number;
  rawTranscript: string;
  remaining: number;
  setDuration: (duration: number) => void;
  speechError: string;
  status: PracticeStatus;
}) {
  return (
    <section className="practice-screen" aria-label="Timed speaking practice">
      <button className="back-link" type="button" onClick={onBack}>
        ← Back
      </button>
      <button className="floating-analysis" type="button" onClick={onFinish}>
        Get speech analysis
        <span>new</span>
      </button>

      <div className="practice-topic">
        <p>Topic:</p>
        <h1>{activeTopic.prompt}</h1>
      </div>

      <div
        className="timer-circle"
        data-live={status === "recording" ? "true" : "false"}
        style={{ "--progress": progress } as CSSProperties}
      >
        <div>
          <strong>{formatTime(remaining)}</strong>
          <div className="time-adjust">
            <button
              className="secondary-pill small"
              type="button"
              onClick={() => setDuration(Math.max(30, duration - 30))}
            >
              −0:30
            </button>
            <button
              className="secondary-pill small"
              type="button"
              onClick={() => setDuration(duration + 30)}
            >
              +0:30
            </button>
          </div>
        </div>
      </div>

      <div className="practice-controls">
        {status === "recording" ? (
          <button className="round-control" type="button" onClick={onPause}>
            pause
          </button>
        ) : (
          <button className="round-control live" type="button" onClick={onResume}>
            speak
          </button>
        )}
        <button className="secondary-pill" type="button" onClick={onFinish}>
          Finish & review
        </button>
      </div>

      <section className="transcript-panel" aria-label="Live transcript">
        <div>
          <p className="panel-kicker">Live transcript</p>
          <p className="transcript-text">
            {rawTranscript ||
              "Start speaking. Your raw words, including filler words, will collect here."}
          </p>
          {speechError ? <p className="speech-error">{speechError}</p> : null}
        </div>
        <textarea
          aria-label="Manual transcript fallback"
          placeholder="If browser transcription is unavailable, type or paste what you said here."
          value={manualTranscript}
          onChange={(event) => onManualTranscript(event.target.value)}
        />
      </section>
    </section>
  );
}

function ReviewScreen({
  activeTopic,
  analysis,
  duration,
  onNewRoll,
  onRetry,
  rawTranscript,
}: {
  activeTopic: SpeechTopic;
  analysis: Analysis;
  duration: number;
  onNewRoll: () => void;
  onRetry: () => void;
  rawTranscript: string;
}) {
  return (
    <section className="review-screen" aria-label="Speech feedback">
      <header className="review-header">
        <div>
          <p className="tiny-wordmark">Baby steps to the mic</p>
          <h1>Here’s what your speech sounded like.</h1>
        </div>
        <div className="review-actions">
          <button className="secondary-pill" type="button" onClick={onRetry}>
            Try same topic
          </button>
          <button className="primary-pill" type="button" onClick={onNewRoll}>
            Roll again
          </button>
        </div>
      </header>

      <p className="review-topic">{activeTopic.prompt}</p>

      <div className="score-row">
        <div>
          <span>{analysis.totalFillers}</span>
          <p>filler words</p>
        </div>
        <div>
          <span>{analysis.wpm}</span>
          <p>words per minute</p>
        </div>
        <div>
          <span>{analysis.wordCount}</span>
          <p>total words in {formatTime(duration)}</p>
        </div>
      </div>

      <div className="review-grid">
        <article className="review-block">
          <p className="panel-kicker">Raw version</p>
          <p>{rawTranscript || "No transcript captured yet."}</p>
        </article>
        <article className="review-block">
          <p className="panel-kicker">Cleaned version</p>
          <p>
            {analysis.cleanedTranscript ||
              "Once you record or type a transcript, the cleaned version appears here."}
          </p>
        </article>
        <article className="review-block">
          <p className="panel-kicker">Filler words</p>
          {analysis.fillerCounts.length > 0 ? (
            <ul className="filler-list">
              {analysis.fillerCounts.map((item) => (
                <li key={item.word}>
                  <span>{item.word}</span>
                  <strong>{item.count}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>No tracked filler words found.</p>
          )}
        </article>
        <article className="review-block">
          <p className="panel-kicker">What to work on</p>
          <ul className="suggestion-list">
            {analysis.suggestions.map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
